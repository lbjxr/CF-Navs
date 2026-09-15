// 书签 CRUD、批量排序、图标数据读取与 icon_blob 写入

import { type Bookmark, type BookmarkBatchMoveReq, type BookmarkUpsertReq } from '../../../shared/types'
import { BOOKMARK_LIST_SQL } from './sql'
import { withSchemaRetry } from './schema'
import { buildColumnUpdateChunks, runUpdateChunks, sortRowsByIds, type RowUpdateEntry } from './sort'

export async function listBookmarks(db: D1Database): Promise<Bookmark[]> {
 return await withSchemaRetry(db, async () => {
  const { results } = await db
   .prepare(BOOKMARK_LIST_SQL)
   .all<Bookmark>()
  return results ?? []
 })
}

export interface BookmarkIconData {
 title: string
 url: string
 icon: string | null
 icon_source: Bookmark['icon_source']
 icon_blob: string | null
 // 图标端点是匿名可访问的，必须能判断这条书签是否对访客可见（PROB-20）。
 category_id: Bookmark['category_id']
 is_private: Bookmark['is_private']
}

export async function getBookmarkIconData(db: D1Database, id: number): Promise<BookmarkIconData | null> {
 return await withSchemaRetry(db, async () => (
  await db
   .prepare('SELECT title, url, icon, icon_source, icon_blob, category_id, is_private FROM bookmarks WHERE id = ?')
   .bind(id)
   .first<BookmarkIconData>()
 ))
}

export async function createBookmark(db: D1Database, req: BookmarkUpsertReq): Promise<Bookmark | null> {
 const now = Date.now()
 const open_method: 1 | 2 | 3 = req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : 1
 return await withSchemaRetry(db, async () => (
  await db
   .prepare(
    `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color,
           description, description_mode, open_method, is_private, sort, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1, ?
         WHERE EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, is_private, sort, click_count, created_at`,
   )
   .bind(
    req.category_id,
    req.title,
    req.url,
    req.icon ?? null,
    req.icon_source ?? null,
    req.icon_background_color ?? null,
    req.description ?? null,
    req.description_mode ?? null,
    open_method,
    req.is_private ? 1 : 0,
    req.category_id,
    now,
    req.category_id,
   )
   .first<Bookmark>()
 ))
}

export async function updateBookmark(
 db: D1Database,
 id: number,
 req: BookmarkUpsertReq,
): Promise<Bookmark | null> {
 const nextIcon = req.icon ?? null
 const nextIconSource = req.icon_source ?? null
 const openMethod: 1 | 2 | 3 | null =
  req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : req.open_method === 1 ? 1 : null
 const hasDescriptionMode = Object.prototype.hasOwnProperty.call(req, 'description_mode')
 return await withSchemaRetry(db, async () => (
  await db
   .prepare(
    `UPDATE bookmarks
         SET category_id = ?,
             title = ?,
             url = ?,
             icon_blob = CASE
               WHEN ((icon IS NULL AND ? IS NULL) OR icon = ?)
                AND ((icon_source IS NULL AND ? IS NULL) OR icon_source = ?)
               THEN icon_blob
               ELSE NULL
             END,
             icon = ?,
             icon_source = ?,
             icon_background_color = ?,
             description = ?,
             description_mode = CASE WHEN ? = 0 THEN description_mode ELSE ? END,
             open_method = COALESCE(?, open_method),
             is_private = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, is_private, sort, click_count, created_at`,
   )
   .bind(
    req.category_id,
    req.title,
    req.url,
    nextIcon,
    nextIcon,
    nextIconSource,
    nextIconSource,
    nextIcon,
    nextIconSource,
    req.icon_background_color ?? null,
    req.description ?? null,
    hasDescriptionMode ? 1 : 0,
    req.description_mode ?? null,
    openMethod,
    req.is_private ? 1 : 0,
    id,
    req.category_id,
   )
   .first<Bookmark>()
 ))
}

export async function deleteBookmark(db: D1Database, id: number): Promise<boolean> {
 const res = await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run()
 return (res.meta.changes ?? 0) > 0
}

export async function batchDeleteBookmarks(db: D1Database, ids: number[]): Promise<number> {
 if (ids.length === 0) return 0
 const results = await db.batch(ids.map((id) => db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id)))
 return results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0)
}

export async function sortBookmarks(db: D1Database, ids: number[]): Promise<void> {
 await sortRowsByIds(db, 'bookmarks', ids)
}
export class BookmarkReorganizeError extends Error { }

export async function reorganizeBookmarks(
 db: D1Database,
 categoryOrders: Array<{ category_id: number; ids: number[] }>,
): Promise<void> {
 const categoryIds = new Set<number>()
 const bookmarkToCategory = new Map<number, number>()
 // sort 在整个请求范围内单调递增，而不是每个分类从 0 重新开始：
 // BOOKMARK_LIST_SQL 按 `sort ASC, id ASC` 排序，后台平铺表依赖全局唯一的
 // sort 值；每分类归零会让不同分类的书签大量并列，平铺顺序退化成按 id 排列。
 const sortEntries: RowUpdateEntry[] = []

 for (const order of categoryOrders) {
  if (categoryIds.has(order.category_id)) {
   throw new BookmarkReorganizeError('duplicate category order')
  }
  categoryIds.add(order.category_id)
  for (const id of order.ids) {
   if (bookmarkToCategory.has(id)) {
    throw new BookmarkReorganizeError('duplicate bookmark order')
   }
   bookmarkToCategory.set(id, order.category_id)
   sortEntries.push([id, sortEntries.length])
  }
 }

 const [categoriesResult, bookmarksResult] = await db.batch<{ id: number }>([
  db.prepare('SELECT id FROM categories'),
  db.prepare('SELECT id FROM bookmarks'),
 ])

 const existingCategoryIds = new Set((categoriesResult.results ?? []).map((category) => category.id))
 for (const id of categoryIds) {
  if (!existingCategoryIds.has(id)) {
   throw new BookmarkReorganizeError(`category ${id} not found`)
  }
 }

 const existingBookmarkIds = (bookmarksResult.results ?? []).map((bookmark) => bookmark.id)
 if (existingBookmarkIds.length !== bookmarkToCategory.size) {
  throw new BookmarkReorganizeError('bookmark order must include every bookmark')
 }
 for (const id of existingBookmarkIds) {
  if (!bookmarkToCategory.has(id)) {
   throw new BookmarkReorganizeError('bookmark order must include every bookmark')
  }
 }

 const categoryEntries: RowUpdateEntry[] = [...bookmarkToCategory]
 await runUpdateChunks(db, [
  ...buildColumnUpdateChunks('bookmarks', 'category_id', categoryEntries),
  ...buildColumnUpdateChunks('bookmarks', 'sort', sortEntries),
 ])
}
export async function batchMoveBookmarks(db: D1Database, req: BookmarkBatchMoveReq): Promise<number> {
 if (req.ids.length === 0 || req.position !== 'start' && req.position !== 'end') {
  throw new BookmarkReorganizeError('invalid bookmark batch move payload')
 }

 const ids = [...new Set(req.ids)]
 if (ids.length !== req.ids.length || req.expected.length !== ids.length) {
  throw new BookmarkReorganizeError('invalid bookmark batch move selection')
 }

 const expectedById = new Map(req.expected.map((item) => [item.id, item]))
 if (expectedById.size !== ids.length || ids.some((id) => !expectedById.has(id))) {
  throw new BookmarkReorganizeError('invalid bookmark batch move selection')
 }

 const category = await db
  .prepare('SELECT id FROM categories WHERE id = ?')
  .bind(req.category_id)
  .first<{ id: number }>()
 if (!category) {
  throw new BookmarkReorganizeError(`category ${req.category_id} not found`)
 }

 const { results: rows } = await db
  .prepare('SELECT id, category_id, sort FROM bookmarks ORDER BY sort ASC, id ASC')
  .all<{ id: number; category_id: number; sort: number }>()
 const rowById = new Map(rows.map((row) => [row.id, row]))
 for (const id of ids) {
  const current = rowById.get(id)
  const expected = expectedById.get(id)
  if (
   !current ||
   !expected ||
   current.category_id !== expected.category_id ||
   current.sort !== expected.sort
  ) {
   throw new BookmarkReorganizeError('bookmark selection is stale')
  }
 }

 const selectedIds = new Set(ids)
 const remaining = rows.filter((row) => !selectedIds.has(row.id))
 const targetIndexes = remaining
  .map((row, index) => row.category_id === req.category_id ? index : -1)
  .filter((index) => index >= 0)
 const insertAt = req.position === 'start'
  ? targetIndexes[0] ?? remaining.length
  : (targetIndexes.at(-1) ?? remaining.length - 1) + 1
 const orderedIds = [
  ...remaining.slice(0, insertAt).map((row) => row.id),
  ...ids,
  ...remaining.slice(insertAt).map((row) => row.id),
 ]

 await runUpdateChunks(db, [
  ...buildColumnUpdateChunks('bookmarks', 'category_id', ids.map((id) => [id, req.category_id] as const)),
  ...buildColumnUpdateChunks('bookmarks', 'sort', orderedIds.map((id, index) => [id, index] as const)),
 ])
 return ids.length
}

export async function setIconBlob(db: D1Database, id: number, blob: string | null): Promise<void> {
 await db
  .prepare("UPDATE bookmarks SET icon_blob = ? WHERE id = ?")
  .bind(blob, id)
  .run()
}

export async function incrementBookmarkClick(db: D1Database, id: number): Promise<boolean> {
 return await withSchemaRetry(db, async () => {
  const res = await db
   .prepare("UPDATE bookmarks SET click_count = COALESCE(click_count, 0) + 1 WHERE id = ? AND is_private = 0")
   .bind(id)
   .run()
  return (res.meta.changes ?? 0) > 0
 })
}
