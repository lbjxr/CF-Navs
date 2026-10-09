// 分类 CRUD、层级约束与同级排序

import { type Category, type CategorySortReq, type CategoryUpsertReq } from '../../../shared/types'
import { CATEGORY_LIST_SQL } from './sql'
import { sortRowsByIds } from './sort'
import { ensureSchema } from './schema'
import { decodeVersionedIcon, iconContentRevision } from '../iconRevision'
import { withSchemaRetry } from './schema'

// Mutation consumers immediately replace their local entity. Return its current
// icon identity with the write, without a second query or a duplicate image body.
const CATEGORY_WRITE_RESULT_FIELDS = `id, parent_id, title, icon, is_private, sort, created_at,
  icon_revision, icon_write_epoch,
  CASE WHEN icon_blob IS NULL OR icon_blob = '' THEN 0 ELSE 1 END AS icon_cached`

export class CategoryValidationError extends Error {}
export class CategoryConflictError extends Error {}

export async function listCategories(db: D1Database): Promise<Category[]> {
  await ensureSchema(db)
  const { results } = await db.prepare(CATEGORY_LIST_SQL).all<Category>()
  return results ?? []
}

export async function getCategory(db: D1Database, id: number): Promise<Category | null> {
  await ensureSchema(db)
  return await db
    .prepare('SELECT id, parent_id, title, icon, icon_blob, is_private, sort, created_at FROM categories WHERE id = ?')
    .bind(id)
    .first<Category>()
}

export interface CategoryIconData { icon: string | null; icon_blob: string | null; icon_revision: string | null; icon_write_epoch: number; dataset_epoch: string }
const CATEGORY_ICON_FIELDS = `icon, icon_blob, icon_revision, icon_write_epoch,
  (SELECT json_extract(value, '$') FROM settings WHERE key = 'icon_dataset_epoch') AS dataset_epoch`
export async function getCategoryIconData(db: D1Database, id: number): Promise<CategoryIconData | null> {
  return withSchemaRetry(db, async () => db.prepare(`SELECT ${CATEGORY_ICON_FIELDS} FROM categories WHERE id = ?`).bind(id).first<CategoryIconData>())
}
export async function setCategoryIconBlob(db: D1Database, id: number, blob: string, expected: CategoryIconData): Promise<boolean> {
  const image = decodeVersionedIcon(blob)
  if (!image) return false
  const revision = await iconContentRevision(image)
  return withSchemaRetry(db, async () => {
    const result = await db.prepare(`UPDATE categories SET icon_blob = ?, icon_revision = ?, icon_write_epoch = icon_write_epoch + 1
      WHERE id = ? AND icon IS ? AND icon_write_epoch = ? AND icon_revision IS ?
        AND (SELECT json_extract(value, '$') FROM settings WHERE key = 'icon_dataset_epoch') = ?`)
      .bind(blob, revision, id, expected.icon, expected.icon_write_epoch, expected.icon_revision, expected.dataset_epoch).run()
    return (result.meta.changes ?? 0) === 1
  })
}

/**
 * 分类图标匿名可见性闸门。只沿目标分类的祖先链查询，循环、缺失分类和私密祖先
 * 一律不可见；该结果必须在 shared edge cache 命中前得到。
 */
export async function isCategoryIconAnonymouslyVisible(db: D1Database, id: number): Promise<boolean> {
  await ensureSchema(db)
  const row = await db
    .prepare(
      `
        WITH RECURSIVE category_chain(id, parent_id, is_private, path, cycle) AS (
          SELECT id, parent_id, is_private, '/' || id || '/', 0
          FROM categories
          WHERE id = ?
          UNION ALL
          SELECT parent.id, parent.parent_id, parent.is_private,
                 chain.path || parent.id || '/',
                 CASE WHEN instr(chain.path, '/' || parent.id || '/') > 0 THEN 1 ELSE 0 END
          FROM categories parent
          JOIN category_chain chain ON parent.id = chain.parent_id
          WHERE chain.cycle = 0
        )
        SELECT CASE WHEN EXISTS (SELECT 1 FROM category_chain)
          AND EXISTS (SELECT 1 FROM category_chain WHERE parent_id IS NULL)
          AND NOT EXISTS (SELECT 1 FROM category_chain WHERE is_private = 1 OR cycle = 1)
          THEN 1 ELSE 0 END AS visible
      `
    )
    .bind(id)
    .first<{ visible: number }>()
  return row?.visible === 1
}

async function validateCategoryParent(
  db: D1Database,
  parentId: number | null,
  categoryId?: number,
): Promise<void> {
  if (parentId == null) return
  if (parentId === categoryId) throw new CategoryValidationError('category cannot be its own parent')

  const parent = await getCategory(db, parentId)
  if (!parent) throw new CategoryValidationError('parent category not found')
  if (parent.parent_id != null) throw new CategoryValidationError('parent category must be a root category')

  if (categoryId != null) {
    const child = await db
      .prepare('SELECT id FROM categories WHERE parent_id = ? LIMIT 1')
      .bind(categoryId)
      .first<{ id: number }>()
    if (child) throw new CategoryValidationError('category with children cannot be moved under another category')
  }
}

export async function createCategory(db: D1Database, req: CategoryUpsertReq): Promise<Category> {
  await ensureSchema(db)
  const now = Date.now()
  const parentId = req.parent_id ?? null
  await validateCategoryParent(db, parentId)
  const inline = req.icon ? decodeVersionedIcon(req.icon) : null
  const revision = inline ? await iconContentRevision(inline) : null

  const category = await db
    .prepare(
      `INSERT INTO categories (parent_id, title, icon, icon_revision, is_private, sort, created_at)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort), -1) + 1, ?
       FROM categories WHERE parent_id IS ?
       RETURNING ${CATEGORY_WRITE_RESULT_FIELDS}`,
    )
    .bind(parentId, req.title, req.icon ?? null, revision, req.is_private === true ? 1 : 0, now, parentId)
    .first<Category>()

  if (!category) throw new Error('failed to create category')
  return category
}

export async function updateCategory(
  db: D1Database,
  id: number,
  req: CategoryUpsertReq,
): Promise<Category | null> {
  await ensureSchema(db)
  const current = await getCategory(db, id)
  if (!current) return null

  const parentId = req.parent_id === undefined ? current.parent_id : req.parent_id
  if (parentId !== current.parent_id) await validateCategoryParent(db, parentId, id)
  const nextIcon = req.icon ?? null
  const inline = nextIcon ? decodeVersionedIcon(nextIcon) : null
  const revision = inline ? await iconContentRevision(inline) : null

  if (parentId === current.parent_id) {
    if (req.is_private === undefined) {
      return await db
        .prepare(
          `UPDATE categories SET title = ?, icon_blob = CASE WHEN icon IS ? THEN icon_blob ELSE NULL END, icon_revision = CASE WHEN icon IS ? THEN COALESCE(icon_revision, ?) ELSE ? END, icon_write_epoch = icon_write_epoch + CASE WHEN icon IS ? THEN 0 ELSE 1 END, icon = ? WHERE id = ? RETURNING ${CATEGORY_WRITE_RESULT_FIELDS}`,
        )
        .bind(req.title, nextIcon, nextIcon, revision, revision, nextIcon, nextIcon, id)
        .first<Category>()
    }

    return await db
      .prepare(
        `UPDATE categories SET title = ?, icon_blob = CASE WHEN icon IS ? THEN icon_blob ELSE NULL END, icon_revision = CASE WHEN icon IS ? THEN COALESCE(icon_revision, ?) ELSE ? END, icon_write_epoch = icon_write_epoch + CASE WHEN icon IS ? THEN 0 ELSE 1 END, icon = ?, is_private = COALESCE(?, is_private) WHERE id = ? RETURNING ${CATEGORY_WRITE_RESULT_FIELDS}`,
      )
      .bind(req.title, nextIcon, nextIcon, revision, revision, nextIcon, nextIcon, req.is_private === undefined ? null : (req.is_private === true ? 1 : 0), id)
      .first<Category>()
  }

  return await db
    .prepare(
      `UPDATE categories
       SET parent_id = ?, title = ?, icon_blob = CASE WHEN icon IS ? THEN icon_blob ELSE NULL END,
           icon_revision = CASE WHEN icon IS ? THEN COALESCE(icon_revision, ?) ELSE ? END,
           icon_write_epoch = icon_write_epoch + CASE WHEN icon IS ? THEN 0 ELSE 1 END,
           icon = ?, is_private = COALESCE(?, is_private),
           sort = (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE parent_id IS ? AND id <> ?)
       WHERE id = ?
       RETURNING ${CATEGORY_WRITE_RESULT_FIELDS}`,
    )
    .bind(parentId, req.title, nextIcon, nextIcon, revision, revision, nextIcon, nextIcon, req.is_private === undefined ? null : (req.is_private === true ? 1 : 0), parentId, id, id)
    .first<Category>()
}

async function getChildCounts(db: D1Database, ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(', ')
  const { results } = await db
    .prepare(`SELECT parent_id, COUNT(*) AS count FROM categories WHERE parent_id IN (${placeholders}) GROUP BY parent_id`)
    .bind(...ids)
    .all<{ parent_id: number; count: number }>()
  return new Map((results ?? []).map((row) => [row.parent_id, Number(row.count)]))
}

export async function deleteCategory(db: D1Database, id: number): Promise<boolean> {
  await ensureSchema(db)
  const childCounts = await getChildCounts(db, [id])
  if ((childCounts.get(id) ?? 0) > 0) {
    throw new CategoryConflictError('category has child categories')
  }

  const [, categoryDelete] = await db.batch([
    db.prepare('DELETE FROM bookmarks WHERE category_id = ?').bind(id),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
  return (categoryDelete.meta.changes ?? 0) > 0
}

export async function batchDeleteCategories(
  db: D1Database,
  ids: number[],
): Promise<{ deleted: number; deleted_bookmarks: number }> {
  await ensureSchema(db)
  if (ids.length === 0) return { deleted: 0, deleted_bookmarks: 0 }

  const childCounts = await getChildCounts(db, ids)
  const blockedId = ids.find((id) => (childCounts.get(id) ?? 0) > 0)
  if (blockedId != null) throw new CategoryConflictError(`category ${blockedId} has child categories`)

  const statements = [
    ...ids.map((id) => db.prepare('DELETE FROM bookmarks WHERE category_id = ?').bind(id)),
    ...ids.map((id) => db.prepare('DELETE FROM categories WHERE id = ?').bind(id)),
  ]
  const results = await db.batch(statements)
  const bookmarkResults = results.slice(0, ids.length)
  const categoryResults = results.slice(ids.length)
  const deleted_bookmarks = bookmarkResults.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0)
  const deleted = categoryResults.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0)
  return { deleted, deleted_bookmarks }
}

export async function sortCategories(db: D1Database, req: CategorySortReq): Promise<void> {
  await ensureSchema(db)
  if (new Set(req.ids).size !== req.ids.length) {
    throw new CategoryValidationError('category sort ids must be unique')
  }

  const { results } = await db
    .prepare('SELECT id FROM categories WHERE parent_id IS ? ORDER BY sort ASC, id ASC')
    .bind(req.parent_id)
    .all<{ id: number }>()
  const siblingIds = (results ?? []).map((row) => row.id)
  const requestedIds = new Set(req.ids)
  if (siblingIds.length !== req.ids.length || siblingIds.some((id) => !requestedIds.has(id))) {
    throw new CategoryValidationError('category sort ids must include the complete sibling set')
  }

  await sortRowsByIds(db, 'categories', req.ids)
}
