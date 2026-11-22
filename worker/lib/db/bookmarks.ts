// 书签 CRUD、批量排序、图标数据读取与 icon_blob 写入

import { type Bookmark, type BookmarkEditData, type BookmarkBatchMoveReq, type BookmarkUpsertReq } from '../../../shared/types'
import { BOOKMARK_AGGREGATE_LIST_SQL, BOOKMARK_LIST_SQL } from './sql'
import { withSchemaRetry } from './schema'
import { decodeVersionedIcon, iconContentRevision } from '../iconRevision'
import { buildColumnUpdateChunks, runUpdateChunks, sortRowsByIds, type RowUpdateEntry } from './sort'
import { Mutation, chunkIds, placeholders, type MutationReceipt } from './mutation'

// 列表口径与聚合一致：icon_blob 恒为 null，以 icon_cached 表示 D1 中是否已有正文，
// 不把每个书签的 base64 图标正文读进 Worker 再下发（GET /api/bookmarks）。
export async function listBookmarks(db: D1Database): Promise<Bookmark[]> {
 return await withSchemaRetry(db, async () => {
  const { results } = await db
   .prepare(BOOKMARK_AGGREGATE_LIST_SQL)
   .all<Bookmark>()
  return results ?? []
 })
}

// The original icon is an editable field; icon_blob is only a display cache.
// Read one row by primary key instead of loading the entire admin aggregate.
export async function getBookmarkForEdit(db: D1Database, id: number): Promise<BookmarkEditData | null> {
 return await withSchemaRetry(db, () => db.prepare(
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, description, description_mode, open_method, is_private FROM bookmarks WHERE id = ?'
 ).bind(id).first<BookmarkEditData>())
}

// 合并导入要用 importData 重建整张表，现有书签的 icon_blob 必须原样带过去，
// 否则一次合并导入会清空全部已缓存图标——只有这条路径需要读正文。
export async function listBookmarksWithIconBlobs(db: D1Database): Promise<Bookmark[]> {
 return await withSchemaRetry(db, async () => {
  const { results } = await db
   .prepare(BOOKMARK_LIST_SQL)
   .all<Bookmark>()
  return results ?? []
 })
}

export interface BookmarkIconData {
 icon_revision: string | null
 icon_write_epoch: number
 dataset_epoch: string
 title: string
 url: string
 icon: string | null
 icon_source: Bookmark['icon_source']
 icon_blob: string | null
 // 图标端点是匿名可访问的，必须能判断这条书签是否对访客可见（PROB-20）。
 category_id: Bookmark['category_id']
 is_private: Bookmark['is_private']
}

const BOOKMARK_ICON_FIELDS = `title, url, icon, icon_source, icon_blob, category_id, is_private,
 icon_revision, icon_write_epoch,
 (SELECT json_extract(value, '$') FROM settings WHERE key = 'icon_dataset_epoch') AS dataset_epoch`

export async function getBookmarkIconData(
 db: D1Database, id: number, beginWrite = false,
): Promise<BookmarkIconData | null> {
 return await withSchemaRetry(db, async () => (
  await db
   .prepare(beginWrite
    ? 'UPDATE bookmarks SET icon_write_epoch = icon_write_epoch + 1 WHERE id = ? RETURNING ' + BOOKMARK_ICON_FIELDS
    : 'SELECT ' + BOOKMARK_ICON_FIELDS + ' FROM bookmarks WHERE id = ?')
   .bind(id)
   .first<BookmarkIconData>()
 ))
}

/**
 * 匿名图标的权威可见性闸门。必须在 shared edge cache 命中之前执行：
 * 书签改私密或移入私密祖先后，旧公开图标不能继续被匿名请求命中。
 *
 * 用递归 CTE 只读目标书签所属的分类祖先链，不为每个 cache hit 拉取全量分类；
 * path/cycle 让坏数据中的循环也按不可见处理，与 worker 的公开数据口径一致。
 */
export async function isBookmarkIconAnonymouslyVisibleById(db: D1Database, id: number): Promise<boolean> {
 return await withSchemaRetry(db, async () => {
  const row = await db
   .prepare(`
    WITH RECURSIVE category_chain(id, parent_id, is_private, path, cycle) AS (
      SELECT c.id, c.parent_id, c.is_private, '/' || c.id || '/', 0
      FROM categories c
      JOIN bookmarks b ON b.category_id = c.id
      WHERE b.id = ?
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.is_private,
             chain.path || parent.id || '/',
             CASE WHEN instr(chain.path, '/' || parent.id || '/') > 0 THEN 1 ELSE 0 END
      FROM categories parent
      JOIN category_chain chain ON parent.id = chain.parent_id
      WHERE chain.cycle = 0
    )
    SELECT CASE WHEN b.id IS NOT NULL
      AND COALESCE(b.is_private, 0) = 0
      AND EXISTS (SELECT 1 FROM category_chain)
      AND EXISTS (SELECT 1 FROM category_chain WHERE parent_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM category_chain WHERE is_private = 1 OR cycle = 1)
      THEN 1 ELSE 0 END AS visible
    FROM bookmarks b
    WHERE b.id = ?
   `)
   .bind(id, id)
   .first<{ visible: number }>()
  return row?.visible === 1
 })
}

export async function createBookmark(
 db: D1Database,
 req: BookmarkUpsertReq,
 receipt?: MutationReceipt,
): Promise<Bookmark | null> {
 const now = Date.now()
 const inline = req.icon ? decodeVersionedIcon(req.icon) : null
 const inlineRevision = inline ? await iconContentRevision(inline) : null
 const open_method: 1 | 2 | 3 = req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : 1
 return await withSchemaRetry(db, async () => {
  const insert = db
   .prepare(
    `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color, icon_revision,
           description, description_mode, open_method, is_private, sort, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1, ?
         WHERE EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, icon_revision, icon_write_epoch, description, description_mode, open_method, is_private, sort, click_count, created_at`,
   )
   .bind(
    req.category_id,
    req.title,
    req.url,
    req.icon ?? null,
    req.icon_source ?? null,
    req.icon_background_color ?? null,
    inlineRevision,
    req.description ?? null,
    req.description_mode ?? null,
    open_method,
    req.is_private ? 1 : 0,
    req.category_id,
    now,
    req.category_id,
   )
  // 分类不存在时 INSERT 命中 0 行，同一守卫让版本也不提升。
  const [result] = await new Mutation(db)
   .add(insert)
   .bump({ sql: 'EXISTS (SELECT 1 FROM categories WHERE id = ?)', params: [req.category_id] })
   .commit(receipt)
  return (result?.results?.[0] as Bookmark | undefined) ?? null
 })
}

export async function updateBookmark(
 db: D1Database,
 id: number,
 req: BookmarkUpsertReq,
 receipt?: MutationReceipt,
): Promise<Bookmark | null> {
 const nextIcon = req.icon ?? null
 const nextIconSource = req.icon_source ?? null
 const inline = nextIcon ? decodeVersionedIcon(nextIcon) : null
 const inlineRevision = inline ? await iconContentRevision(inline) : null
 const openMethod: 1 | 2 | 3 | null =
  req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : req.open_method === 1 ? 1 : null
 const hasDescriptionMode = Object.prototype.hasOwnProperty.call(req, 'description_mode')
 return await withSchemaRetry(db, async () => {
  // 分类变化时在同一条更新中追加到目标末尾；普通编辑保留现有顺序。
  const update = db
   .prepare(
    `UPDATE bookmarks
         SET icon_revision = CASE WHEN icon IS ? AND icon_source IS ? THEN COALESCE(icon_revision, ?) ELSE ? END,
             icon_write_epoch = icon_write_epoch + CASE WHEN icon IS ? AND icon_source IS ? THEN 0 ELSE 1 END,
             sort = CASE
               WHEN category_id = ? THEN sort
               ELSE COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1
             END,
             category_id = ?,
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
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, icon_revision, icon_write_epoch, description, description_mode, open_method, is_private, sort, click_count, created_at`,
   )
   .bind(
    nextIcon, nextIconSource, inlineRevision, inlineRevision, nextIcon, nextIconSource,
    req.category_id,
    req.category_id,
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
  // 版本写入放在 UPDATE 之后：改图标会触发 bookmark_icon_publish 写入随机版本，
  // 末尾这条会覆盖它，保证响应里的 data_version 就是库中的值，且对外只变一次。
  const [result] = await new Mutation(db)
   .add(update)
   .bump({
    sql: 'EXISTS (SELECT 1 FROM bookmarks WHERE id = ?) AND EXISTS (SELECT 1 FROM categories WHERE id = ?)',
    params: [id, req.category_id],
   })
   .commit(receipt)
  return (result?.results?.[0] as Bookmark | undefined) ?? null
 })
}

export async function deleteBookmark(db: D1Database, id: number, receipt?: MutationReceipt): Promise<boolean> {
 // DELETE 不触发图标触发器，守卫放在删除之前：「删除前记录存在」才提升版本。
 const [res] = await new Mutation(db)
  .bump({ sql: 'EXISTS (SELECT 1 FROM bookmarks WHERE id = ?)', params: [id] })
  .add(db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id))
  .commit(receipt)
 return (res?.meta?.changes ?? 0) > 0
}

export async function batchDeleteBookmarks(db: D1Database, ids: number[], receipt?: MutationReceipt): Promise<number> {
 const unique = [...new Set(ids)]
 if (unique.length === 0) return 0
 // 按 D1 参数上限分块 `WHERE id IN (...)`：500 个 id 是 6 条语句而不是 500 条。
 // 每块前放一条同版本值的守卫写入，任意一块有记录即提升版本，全部不存在则不提升。
 const mutation = new Mutation(db)
 for (const chunk of chunkIds(unique)) {
  mutation
   .bump({ sql: `EXISTS (SELECT 1 FROM bookmarks WHERE id IN (${placeholders(chunk.length)}))`, params: chunk })
   .add(db.prepare(`DELETE FROM bookmarks WHERE id IN (${placeholders(chunk.length)})`).bind(...chunk))
 }
 const results = await mutation.commit(receipt)
 return results.reduce((sum, result) => sum + (result?.meta?.changes ?? 0), 0)
}

export async function sortBookmarks(db: D1Database, ids: number[], receipt?: MutationReceipt): Promise<void> {
 await sortRowsByIds(db, 'bookmarks', ids, receipt)
}
export class BookmarkReorganizeError extends Error { }

export async function reorganizeBookmarks(
 db: D1Database,
 categoryOrders: Array<{ category_id: number; ids: number[] }>,
 receipt?: MutationReceipt,
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
 ], receipt)
}
export async function batchMoveBookmarks(
 db: D1Database,
 req: BookmarkBatchMoveReq,
 receipt?: MutationReceipt,
): Promise<number> {
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
 ], receipt)
 return ids.length
}

/**
 * Commit only to the exact object/source generation read before the asynchronous work.
 *
 * `publish` 只给管理员显式刷新使用：内容版本确实变化（含「未知摘要 → 已知摘要」）时，
 * 在同一 batch 里提升 data_version 并写入收据。匿名图标代理与可信副本协议不传它，
 * 保持「仅补充未知摘要不逐图触发全量刷新」的既有契约（已知摘要变化仍由
 * bookmark_icon_publish 触发器发布）。
 */
export async function setIconBlob(
 db: D1Database, id: number, blob: string | null, expected: BookmarkIconData, publish?: MutationReceipt,
): Promise<boolean> {
 const icon = blob === null ? null : decodeVersionedIcon(blob)
 if (blob !== null && !icon) return false
 const revision = icon ? await iconContentRevision(icon) : null
 const update = db.prepare(`UPDATE bookmarks SET icon_blob = ?, icon_revision = ?,
    icon_write_epoch = icon_write_epoch + CASE WHEN icon_blob IS NOT ? AND icon_revision IS ? THEN 1 ELSE 0 END
  WHERE id = ? AND icon_write_epoch = ? AND icon IS ? AND icon_source IS ?
    AND icon_blob IS ? AND icon_revision IS ?
    AND (SELECT json_extract(value, '$') FROM settings WHERE key = 'icon_dataset_epoch') = ?`)
  .bind(blob, revision, blob, revision, id, expected.icon_write_epoch, expected.icon, expected.icon_source,
   expected.icon_blob, expected.icon_revision, expected.dataset_epoch)
 // 聚合数据里可观察的只有 icon_revision 与 icon_cached（是否有正文）；两者都不变时
 // （例如同一字节的不同编码）无需发布。
 const observableChange = revision !== expected.icon_revision || Boolean(blob) !== Boolean(expected.icon_blob)
 if (!publish || !observableChange) {
  const result = await update.run()
  return (result.meta.changes ?? 0) > 0
 }
 // 守卫在 UPDATE 之后求值：条件写入落地（行上已是本次的正文与摘要）才提升版本。
 const [result] = await new Mutation(db)
  .add(update)
  .bump({
   sql: 'EXISTS (SELECT 1 FROM bookmarks WHERE id = ? AND icon_blob IS ? AND icon_revision IS ?)',
   params: [id, blob, revision],
  })
  .commit(publish)
 return (result?.meta?.changes ?? 0) > 0
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
