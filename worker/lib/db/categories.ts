// 分类 CRUD 与批量排序

import { type Category, type CategoryUpsertReq } from '../../../shared/types'
import { CATEGORY_LIST_SQL } from './sql'
import { sortRowsByIds } from './sort'

export async function listCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare(CATEGORY_LIST_SQL)
    .all<Category>()
  return results ?? []
}

export async function getCategory(db: D1Database, id: number): Promise<Category | null> {
  return await db
    .prepare('SELECT id, title, icon, sort, created_at FROM categories WHERE id = ?')
    .bind(id)
    .first<Category>()
}

export async function createCategory(db: D1Database, req: CategoryUpsertReq): Promise<Category> {
  const now = Date.now()
  const category = await db
    .prepare(
      `INSERT INTO categories (title, icon, sort, created_at)
       SELECT ?, ?, COALESCE(MAX(sort), -1) + 1, ? FROM categories
       RETURNING id, title, icon, sort, created_at`,
    )
    .bind(req.title, req.icon ?? null, now)
    .first<Category>()

  if (!category) {
    throw new Error('failed to create category')
  }

  return category
}

export async function updateCategory(
  db: D1Database,
  id: number,
  req: CategoryUpsertReq,
): Promise<Category | null> {
  return await db
    .prepare('UPDATE categories SET title = ?, icon = ? WHERE id = ? RETURNING id, title, icon, sort, created_at')
    .bind(req.title, req.icon ?? null, id)
    .first<Category>()
}

export async function deleteCategory(db: D1Database, id: number): Promise<boolean> {
  // 显式级联删书签（不依赖 PRAGMA foreign_keys，D1 默认未必开启外键）
  const [, categoryDelete] = await db.batch([
    db.prepare('DELETE FROM bookmarks WHERE category_id = ?').bind(id),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
  return (categoryDelete.meta.changes ?? 0) > 0
}

export async function batchDeleteCategories(db: D1Database, ids: number[]): Promise<{ deleted: number; deleted_bookmarks: number }> {
  if (ids.length === 0) return { deleted: 0, deleted_bookmarks: 0 }
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

// 批量排序：按 ids 下标写 sort，单次 batch 提交
export async function sortCategories(db: D1Database, ids: number[]): Promise<void> {
  await sortRowsByIds(db, 'categories', ids)
}
