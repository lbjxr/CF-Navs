// 浏览器书签单向同步：所有新书签进入固定的“浏览器新增收藏”分类。

import type { BrowserSyncBookmark, BrowserSyncResp, Category } from '../../../shared/types'
import { isAllowedBookmarkUrl } from '../../../shared/urlPolicy'
import { ensureSchema } from './schema'
import { Mutation, type MutationReceipt } from './mutation'

export const BROWSER_SYNC_CATEGORY_TITLE = '浏览器新增收藏'

const CATEGORY_FIELDS = 'id, parent_id, title, icon, is_private, sort, created_at'
const SYNC_CATEGORY_ID_SQL = 'SELECT id FROM categories WHERE parent_id IS NULL AND title = ? ORDER BY id ASC LIMIT 1'

async function findBrowserSyncCategory(db: D1Database): Promise<Category | null> {
  return await db
    .prepare(`SELECT ${CATEGORY_FIELDS} FROM categories WHERE parent_id IS NULL AND title = ? ORDER BY id ASC LIMIT 1`)
    .bind(BROWSER_SYNC_CATEGORY_TITLE)
    .first<Category>()
}

async function findSyncCategory(db: D1Database, categoryId?: number): Promise<Category | null> {
  if (categoryId === undefined) return findBrowserSyncCategory(db)
  return await db
    .prepare(`SELECT ${CATEGORY_FIELDS} FROM categories WHERE id = ?`)
    .bind(categoryId)
    .first<Category>()
}

/**
 * 幂等创建「浏览器新增收藏」根分类的单条语句：已存在时命中 0 行。
 * 作为语句而不是函数暴露，是为了能和设置写入 / 同步书签写入以及 data_version
 * 提升放进同一个 D1 batch 原子提交。
 */
export function ensureBrowserSyncCategoryStatement(db: D1Database, now = Date.now()): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO categories (parent_id, title, icon, is_private, sort, created_at)
       SELECT NULL, ?, NULL, 0, (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE parent_id IS NULL), ?
       WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND title = ?)
       RETURNING ${CATEGORY_FIELDS}`,
    )
    .bind(BROWSER_SYNC_CATEGORY_TITLE, now, BROWSER_SYNC_CATEGORY_TITLE)
}

function normalizeSyncBookmark(value: BrowserSyncBookmark): BrowserSyncBookmark & {
  icon: string
  icon_source: 'favicon_im'
} | null {
  const title = typeof value?.title === 'string' ? value.title.trim() : ''
  const url = typeof value?.url === 'string' ? value.url.trim() : ''
  if (!title || !isAllowedBookmarkUrl(url)) return null

  let hostname = ''
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  if (!hostname) return null

  return {
    title: title.slice(0, 200),
    url,
    icon: `https://favicon.im/${encodeURIComponent(hostname)}?larger=true`,
    icon_source: 'favicon_im',
  }
}

export async function syncBrowserBookmarks(
  db: D1Database,
  input: BrowserSyncBookmark[],
  receipt?: MutationReceipt,
  categoryId?: number,
): Promise<BrowserSyncResp | null> {
  await ensureSchema(db)
  const existing = await findSyncCategory(db, categoryId)
  // 显式选择的分类必须已经存在，不能因过期界面或无效 id 静默写入默认分类。
  if (categoryId !== undefined && !existing) return null
  const existingUrls = new Set<string>()
  if (existing) {
    const { results } = await db
      .prepare('SELECT url FROM bookmarks WHERE category_id = ?')
      .bind(existing.id)
      .all<{ url: string }>()
    for (const row of results ?? []) existingUrls.add(row.url)
  }

  const candidates: ReturnType<typeof normalizeSyncBookmark>[] = []
  let skipped = 0
  for (const candidate of input) {
    const bookmark = normalizeSyncBookmark(candidate)
    if (!bookmark || existingUrls.has(bookmark.url)) {
      skipped++
      continue
    }
    existingUrls.add(bookmark.url)
    candidates.push(bookmark)
  }

  if (existing && candidates.length === 0) {
    return { category_id: existing.id, category_title: existing.title, created: 0, skipped }
  }

  // 分类缺失时在同一 batch 里先建分类，后续 INSERT 用子查询取它的 id；
  // 全部写入与 data_version 提升一次原子提交，不再逐条往返。
  const now = Date.now()
  const categoryExpr = existing ? '?' : `(${SYNC_CATEGORY_ID_SQL})`
  const categoryParam = existing ? existing.id : BROWSER_SYNC_CATEGORY_TITLE
  const mutation = new Mutation(db)
  if (!existing) mutation.add(ensureBrowserSyncCategoryStatement(db, now))
  for (const bookmark of candidates) {
    mutation.add(db
      .prepare(
        `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color,
           description, description_mode, open_method, is_private, sort, created_at
         )
         SELECT target.cid, ?, ?, ?, ?, NULL, NULL, NULL, 1, 0,
           COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = target.cid), -1) + 1, ?
         FROM (SELECT ${categoryExpr} AS cid) AS target
         WHERE target.cid IS NOT NULL AND EXISTS (SELECT 1 FROM categories WHERE id = target.cid)
         RETURNING bookmarks.id`,
      )
      .bind(bookmark!.title, bookmark!.url, bookmark!.icon, bookmark!.icon_source, now, categoryParam))
  }
  const results = await mutation.commit(receipt)
  const insertResults = existing ? results : results.slice(1)
  const created = insertResults.filter((result) => (result?.results?.length ?? 0) > 0).length
  const category = existing
    ?? (results[0]?.results?.[0] as Category | undefined)
    ?? await findBrowserSyncCategory(db)
  if (!category) throw new Error('failed to create browser sync category')

  return {
    category_id: category.id,
    category_title: category.title,
    created,
    skipped: skipped + candidates.length - created,
  }
}
