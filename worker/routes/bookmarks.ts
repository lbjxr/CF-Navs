import { Hono } from 'hono'
import {
 ErrCode,
 type BatchDeleteReq,
 type BookmarkBatchMoveReq,
 type BookmarkBatchMoveResp,
 type BookmarkReorganizeReq,
 type BookmarkUpsertReq,
 type SortReq,
} from '../../shared/types'
import {
 createBookmark,
 deleteBookmark,
 batchDeleteBookmarks,
 reorganizeBookmarks,
 batchMoveBookmarks,
 BookmarkReorganizeError,
 getBookmarkIconData,
 listBookmarks,
 sortBookmarks,
 touchDataVersion,
 updateBookmark,
} from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { cacheBookmarkIconBlob } from '../lib/bookmarkIconCache'
import { parseBookmarkUpsertPayload } from '../lib/bookmarkPayload'
import { fail, ok } from '../lib/response'
import { badRequest, parseBatchIds, parseId, parseSortIds, readJson } from '../lib/routeHelpers'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

const ICON_CACHE_REFRESH_TIMEOUT_MS = 1500

export const bookmarksRoutes = new Hono<HonoEnv>()

bookmarksRoutes.get('/', async (c) => {
 try {
  return c.json(ok(await listBookmarks(c.env.DB)))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list bookmarks'))
 }
})

bookmarksRoutes.post('/', async (c) => {
 const parsed = parseBookmarkUpsertPayload(await readJson<BookmarkUpsertReq>(c))
 if (!parsed.ok) return badRequest(c, parsed.message)

 try {
  const bookmark = await createBookmark(c.env.DB, parsed.value)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))

  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  return c.json(ok(bookmark))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to create bookmark'))
 }
})

bookmarksRoutes.put('/:id', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 const parsed = parseBookmarkUpsertPayload(await readJson<BookmarkUpsertReq>(c))
 if (!parsed.ok) return badRequest(c, parsed.message)

 try {
  const bookmark = await updateBookmark(c.env.DB, id, parsed.value)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark or category not found'))

  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  return c.json(ok(bookmark))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to update bookmark'))
 }
})

bookmarksRoutes.delete('/:id', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 try {
  const deleted = await deleteBookmark(c.env.DB, id)
  if (!deleted) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))
  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  return c.json(ok(null))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to delete bookmark'))
 }
})

bookmarksRoutes.post('/batch-delete', async (c) => {
 const body = await readJson<BatchDeleteReq>(c)
 const ids = parseBatchIds(body?.ids)
 if (!ids) return badRequest(c, 'invalid batch delete payload')
 try {
  const deleted = await batchDeleteBookmarks(c.env.DB, ids)
  if (deleted > 0) {
   await touchDataVersion(c.env.DB)
   invalidateRuntimeDataCache()
   invalidatePublicDataCache(c, c.req.url)
  }
  return c.json(ok({ deleted }))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to batch delete bookmarks'))
 }
})

bookmarksRoutes.post('/batch-move', async (c) => {
 const body = await readJson<Partial<BookmarkBatchMoveReq>>(c)
 const rawIds = body?.ids
 const ids = parseBatchIds(rawIds)
 const expected = body?.expected
 const categoryId = body?.category_id
 const position = body?.position
 const expectedIds = Array.isArray(expected) ? expected.map((item) => item?.id) : []
 const expectedValid = Array.isArray(expected) && expected.every((item) => (
  item &&
  Number.isInteger(item.id) &&
  item.id > 0 &&
  Number.isInteger(item.category_id) &&
  item.category_id > 0 &&
  Number.isInteger(item.sort)
 ))
 const expectedMatches = expectedValid && expected.length === ids?.length &&
  new Set(expectedIds).size === ids?.length && expectedIds.every((id) => ids?.includes(Number(id)))

 if (
  !ids ||
  !Array.isArray(rawIds) ||
  rawIds.length !== ids.length ||
  typeof categoryId !== 'number' ||
  !Number.isInteger(categoryId) ||
  categoryId <= 0 ||
  (position !== 'start' && position !== 'end') ||
  !expectedMatches
 ) {
  return badRequest(c, 'invalid batch move payload')
 }

 const payload: BookmarkBatchMoveReq = {
  ids,
  category_id: categoryId,
  position,
  expected: expected as BookmarkBatchMoveReq['expected'],
 }

 try {
  const moved = await batchMoveBookmarks(c.env.DB, payload)
  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  const response: BookmarkBatchMoveResp = {
   moved,
   category_id: categoryId,
   position,
  }
  return c.json(ok(response))
 } catch (error) {
  if (error instanceof BookmarkReorganizeError) {
   return c.json(fail(ErrCode.CONFLICT, error.message))
  }
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to batch move bookmarks'))
 }
})

bookmarksRoutes.post('/reorganize', async (c) => {
 const body = await readJson<BookmarkReorganizeReq>(c)
 const categoryOrders = body?.category_orders
 if (
  !Array.isArray(categoryOrders) ||
  !categoryOrders.every((order) => (
   order &&
   Number.isInteger(order.category_id) &&
   order.category_id > 0 &&
   Array.isArray(order.ids) &&
   order.ids.every((id) => Number.isInteger(id) && id > 0)
  ))
 ) {
  return badRequest(c, 'invalid reorganize payload')
 }

 try {
  await reorganizeBookmarks(c.env.DB, categoryOrders)
  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  return c.json(ok(null))
 } catch (error) {
  // 请求集合与库中状态不一致（分类被删、书签集合过期）属于状态冲突，
  // 客户端应刷新后重试，不能笼统报成服务端错误。
  if (error instanceof BookmarkReorganizeError) {
   return c.json(fail(ErrCode.CONFLICT, error.message))
  }
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to reorganize bookmarks'))
 }
})

bookmarksRoutes.post('/sort', async (c) => {
 const body = await readJson<SortReq>(c)
 const ids = parseSortIds(body?.ids)
 if (!ids) {
  return badRequest(c, 'invalid sort payload')
 }

 try {
  await sortBookmarks(c.env.DB, ids)
  await touchDataVersion(c.env.DB)
  invalidateRuntimeDataCache()
  invalidatePublicDataCache(c, c.req.url)
  return c.json(ok(null))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to sort bookmarks'))
 }
})

bookmarksRoutes.post('/:id/icon-cache/refresh', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 try {
  const bookmark = await getBookmarkIconData(c.env.DB, id)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))

  const iconCache = await cacheBookmarkIconBlob(
   c.env.DB,
   id,
   bookmark.icon,
   bookmark.icon_source,
   ICON_CACHE_REFRESH_TIMEOUT_MS,
  )

  const iconBlob = iconCache.reuseExisting ? bookmark.icon_blob : iconCache.iconBlob

  if (iconCache.wrote && iconBlob !== bookmark.icon_blob) {
   await touchDataVersion(c.env.DB)
   invalidateRuntimeDataCache()
   invalidatePublicDataCache(c, c.req.url)
  }

  return c.json(ok({
   icon_blob: iconBlob,
  }))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to refresh bookmark icon cache'))
 }
})

bookmarksRoutes.post('/check-health', async (c) => {
 const body = await readJson<{ ids: number[] }>(c)
 const ids = body?.ids
 if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
  return badRequest(c, 'invalid ids payload')
 }

 const targetIds = ids.slice(0, 20)

 try {
  const placeholders = targetIds.map(() => '?').join(',')
  const { results } = await c.env.DB
   .prepare(`SELECT id, url FROM bookmarks WHERE id IN (${placeholders})`)
   .bind(...targetIds)
   .all<{ id: number; url: string }>()

  if (!results || results.length === 0) {
   return c.json(ok([]))
  }

  const checkResult = await Promise.all(
   results.map(async (bm) => {
    try {
     let res = await fetch(bm.url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
       'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs-HealthCheck/1.0)',
      },
      signal: AbortSignal.timeout(3000),
     })

     if (!res.ok && (res.status === 405 || res.status === 403 || res.status === 400)) {
      res = await fetch(bm.url, {
       method: 'GET',
       redirect: 'follow',
       headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs-HealthCheck/1.0)',
       },
       signal: AbortSignal.timeout(3000),
      })
     }

     return { id: bm.id, status: res.status, ok: res.ok }
    } catch (err) {
     const isTimeout = err instanceof Error && err.name === 'TimeoutError'
     return { id: bm.id, status: isTimeout ? 'timeout' : 'error', ok: false }
    }
   })
  )

  return c.json(ok(checkResult))
 } catch {
  return c.json(fail(ErrCode.SERVER_ERROR, 'failed to perform health check'))
 }
})

export default bookmarksRoutes
