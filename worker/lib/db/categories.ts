// 分类 CRUD、层级约束与同级排序

import { type Category, type CategorySortReq, type CategoryUpsertReq } from '../../../shared/types'
import { CATEGORY_LIST_SQL } from './sql'
import { sortRowsByIds } from './sort'
import { ensureSchema } from './schema'

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
    .prepare('SELECT id, parent_id, title, icon, sort, created_at FROM categories WHERE id = ?')
    .bind(id)
    .first<Category>()
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

  const category = await db
    .prepare(
      `INSERT INTO categories (parent_id, title, icon, sort, created_at)
       SELECT ?, ?, ?, COALESCE(MAX(sort), -1) + 1, ?
       FROM categories WHERE parent_id IS ?
       RETURNING id, parent_id, title, icon, sort, created_at`,
    )
    .bind(parentId, req.title, req.icon ?? null, now, parentId)
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

  if (parentId === current.parent_id) {
    return await db
      .prepare(
        'UPDATE categories SET title = ?, icon = ? WHERE id = ? RETURNING id, parent_id, title, icon, sort, created_at',
      )
      .bind(req.title, req.icon ?? null, id)
      .first<Category>()
  }

  return await db
    .prepare(
      `UPDATE categories
       SET parent_id = ?, title = ?, icon = ?,
           sort = (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE parent_id IS ? AND id <> ?)
       WHERE id = ?
       RETURNING id, parent_id, title, icon, sort, created_at`,
    )
    .bind(parentId, req.title, req.icon ?? null, parentId, id, id)
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
