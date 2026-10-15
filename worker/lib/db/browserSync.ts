// 浏览器书签单向同步：所有新书签进入固定的“浏览器新增收藏”分类。

import type { BrowserSyncBookmark, BrowserSyncResp, Category } from '../../../shared/types'
import { faviconImUrl } from '../../../shared/icons'
import { isAllowedBookmarkUrl } from '../../../shared/urlPolicy'
import { ensureSchema } from './schema'

export const BROWSER_SYNC_CATEGORY_TITLE = '浏览器新增收藏'

async function findBrowserSyncCategory(db: D1Database): Promise<Category | null> {
  return db
    .prepare('SELECT id, parent_id, title, icon, is_private, sort, created_at FROM categories WHERE parent_id IS NULL AND title = ? ORDER BY id ASC LIMIT 1')
    .bind(BROWSER_SYNC_CATEGORY_TITLE)
    .first<Category>()
}

export async function ensureBrowserSyncCategory(db: D1Database): Promise<Category> {
  await ensureSchema(db)

  const existing = await findBrowserSyncCategory(db)
  if (existing) return existing

  const now = Date.now()
  // 原子 upsert：单条语句内完成 NOT EXISTS 检查 + 插入，避免并发请求建出两个同名分类。
  // 若被并发抢先（RETURNING 无行），回落重查一次。
  const created = await db
    .prepare(
      `INSERT INTO categories (parent_id, title, icon, is_private, sort, created_at)
       SELECT NULL, ?, NULL, 0, COALESCE((SELECT MAX(sort) FROM categories WHERE parent_id IS NULL), -1) + 1, ?
       WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND title = ?)
       RETURNING id, parent_id, title, icon, is_private, sort, created_at`,
    )
    .bind(BROWSER_SYNC_CATEGORY_TITLE, now, BROWSER_SYNC_CATEGORY_TITLE)
    .first<Category>()

  if (created) return created
  const raced = await findBrowserSyncCategory(db)
  if (!raced) throw new Error('failed to create browser sync category')
  return raced
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
    icon: faviconImUrl(hostname),
    icon_source: 'favicon_im',
  }
}

export async function syncBrowserBookmarks(
  db: D1Database,
  input: BrowserSyncBookmark[],
): Promise<BrowserSyncResp> {
  const category = await ensureBrowserSyncCategory(db)
  const { results } = await db
    .prepare('SELECT url FROM bookmarks WHERE category_id = ?')
    .bind(category.id)
    .all<{ url: string }>()
  const existingUrls = new Set((results ?? []).map((row) => row.url))
  const seenUrls = new Set<string>()
  const pending: { title: string; url: string; icon: string; icon_source: 'favicon_im' }[] = []
  let skipped = 0

  for (const candidate of input) {
    const bookmark = normalizeSyncBookmark(candidate)
    if (!bookmark || existingUrls.has(bookmark.url) || seenUrls.has(bookmark.url)) {
      skipped++
      continue
    }
    existingUrls.add(bookmark.url)
    seenUrls.add(bookmark.url)
    pending.push(bookmark)
  }

  let created = 0
  if (pending.length > 0) {
    // 先算好 sort 基址再组 batch：一次 db.batch() 提交全部 INSERT，
    // 失败整体回滚、重试幂等（existingUrls 已含本批 url）。
    const maxSortRow = await db
      .prepare('SELECT COALESCE(MAX(sort), -1) AS maxSort FROM bookmarks WHERE category_id = ?')
      .bind(category.id)
      .first<{ maxSort: number }>()
    let sort = (maxSortRow?.maxSort ?? -1) + 1
    const now = Date.now()
    const statements = pending.map((bookmark) =>
      db.prepare(
        `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color,
           description, description_mode, open_method, is_private, sort, created_at
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, 1, 0, ?, ?)`,
      ).bind(category.id, bookmark.title, bookmark.url, bookmark.icon, bookmark.icon_source, sort++, now),
    )
    const batchResults = await db.batch(statements)
    created = batchResults.filter((result) => result.success).length
  }

  return {
    category_id: category.id,
    category_title: category.title,
    created,
    skipped: skipped + (pending.length - created),
  }
}
