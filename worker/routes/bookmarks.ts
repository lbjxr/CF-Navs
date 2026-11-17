import { bookmarkIconDescriptor } from '../lib/bookmarkIconDescriptor'
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
 getBookmarkForEdit,
 listBookmarks,
 sortBookmarks,
 updateBookmark,
} from '../lib/db'
import { createMutationReceipt } from '../lib/db/mutation'
import { mutationJson } from '../lib/mutationResponse'
import { cacheBookmarkIconBlob } from '../lib/bookmarkIconCache'
import { BlockedFetchTargetError, fetchFollowingSafeRedirects } from '../lib/pageMetadata'
import { parseBookmarkUpsertPayload } from '../lib/bookmarkPayload'
import { fail, ok } from '../lib/response'
import { badRequest, parseBatchIds, parseId, parseSortIds, readJson, serverError } from '../lib/routeHelpers'
import type { HonoEnv } from '../types'
import { appendServerTiming } from '../lib/serverTiming'

const ICON_CACHE_REFRESH_TIMEOUT_MS = 1500

export const bookmarksRoutes = new Hono<HonoEnv>()

bookmarksRoutes.get('/', async (c) => {
 try {
  return c.json(ok(await listBookmarks(c.env.DB)))
 } catch (error) {
  return serverError(c, 'failed to list bookmarks', error)
 }
})

bookmarksRoutes.get('/:id', async (c) => {
 c.header('Cache-Control', 'private, no-store')
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 try {
  const startedAt = performance.now()
  const bookmark = await getBookmarkForEdit(c.env.DB, id)
  appendServerTiming(c, 'db', startedAt)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, '书签已不存在，请刷新后重试。'))
  const serializeAt = performance.now()
  const response = c.json(ok(bookmark))
  appendServerTiming(c, 'serialize', serializeAt, response)
  return response
 } catch (error) {
  return serverError(c, 'failed to read bookmark edit data', error)
 }
})

bookmarksRoutes.post('/', async (c) => {
 const parsed = parseBookmarkUpsertPayload(await readJson<BookmarkUpsertReq>(c))
 if (!parsed.ok) return badRequest(c, parsed.message)

 try {
  const receipt = createMutationReceipt()
  const bookmark = await createBookmark(c.env.DB, parsed.value, receipt)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
  return mutationJson(c, bookmark, receipt)
 } catch (error) {
  return serverError(c, 'failed to create bookmark', error)
 }
})

bookmarksRoutes.put('/:id', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 const parsed = parseBookmarkUpsertPayload(await readJson<BookmarkUpsertReq>(c))
 if (!parsed.ok) return badRequest(c, parsed.message)

 try {
  const receipt = createMutationReceipt()
  const bookmark = await updateBookmark(c.env.DB, id, parsed.value, receipt)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark or category not found'))
  return mutationJson(c, bookmark, receipt)
 } catch (error) {
  return serverError(c, 'failed to update bookmark', error)
 }
})

bookmarksRoutes.delete('/:id', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 try {
  const receipt = createMutationReceipt()
  const deleted = await deleteBookmark(c.env.DB, id, receipt)
  if (!deleted) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))
  return mutationJson(c, null, receipt)
 } catch (error) {
  return serverError(c, 'failed to delete bookmark', error)
 }
})

bookmarksRoutes.post('/batch-delete', async (c) => {
 const body = await readJson<BatchDeleteReq>(c)
 const ids = parseBatchIds(body?.ids)
 if (!ids) return badRequest(c, 'invalid batch delete payload')
 try {
  const receipt = createMutationReceipt()
  const deleted = await batchDeleteBookmarks(c.env.DB, ids, receipt)
  return mutationJson(c, { deleted }, receipt)
 } catch (error) {
  return serverError(c, 'failed to batch delete bookmarks', error)
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
  const receipt = createMutationReceipt()
  const moved = await batchMoveBookmarks(c.env.DB, payload, receipt)
  const response: BookmarkBatchMoveResp = {
   moved,
   category_id: categoryId,
   position,
  }
  return mutationJson(c, response, receipt)
 } catch (error) {
  if (error instanceof BookmarkReorganizeError) {
   return c.json(fail(ErrCode.CONFLICT, error.message))
  }
  return serverError(c, 'failed to batch move bookmarks', error)
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
  const receipt = createMutationReceipt()
  await reorganizeBookmarks(c.env.DB, categoryOrders, receipt)
  return mutationJson(c, null, receipt)
 } catch (error) {
  // 请求集合与库中状态不一致（分类被删、书签集合过期）属于状态冲突，
  // 客户端应刷新后重试，不能笼统报成服务端错误。
  if (error instanceof BookmarkReorganizeError) {
   return c.json(fail(ErrCode.CONFLICT, error.message))
  }
  return serverError(c, 'failed to reorganize bookmarks', error)
 }
})

bookmarksRoutes.post('/sort', async (c) => {
 const body = await readJson<SortReq>(c)
 const ids = parseSortIds(body?.ids)
 if (!ids) {
  return badRequest(c, 'invalid sort payload')
 }

 try {
  const receipt = createMutationReceipt()
  await sortBookmarks(c.env.DB, ids, receipt)
  return mutationJson(c, null, receipt)
 } catch (error) {
  return serverError(c, 'failed to sort bookmarks', error)
 }
})

bookmarksRoutes.post('/:id/icon-cache/refresh', async (c) => {
 const id = parseId(c)
 if (id == null) return badRequest(c, 'invalid bookmark id')

 try {
  const bookmark = await getBookmarkIconData(c.env.DB, id)
  if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))

  // 显式刷新若改变了可观察的图标身份（摘要或是否有正文），在同一 batch 里提升
  // data_version，其它设备的版本校验才能发现；同字节重写不提升。
  const receipt = createMutationReceipt()
  const iconCache = await cacheBookmarkIconBlob(
   c.env.DB,
   id,
   bookmark.icon,
   bookmark.icon_source,
   ICON_CACHE_REFRESH_TIMEOUT_MS,
   receipt,
  )

  // Re-read after asynchronous work; a newer edit/refresh may have won the conditional write.
  const current = await getBookmarkIconData(c.env.DB, id)
  if (!current) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))
  return mutationJson(c, {
   icon_blob: current.icon_blob,
   icon_descriptor: bookmarkIconDescriptor(id, current),
   icon_update: iconCache.wrote
    ? current.icon_revision === bookmark.icon_revision ? 'unchanged' : current.icon_blob ? 'updated' : 'cleared'
    : 'unavailable',
  }, receipt, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) {
  return serverError(c, 'failed to refresh bookmark icon cache', error)
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
    // 重定向手动跟随并逐跳过滤（SSRF）：书签地址或其重定向指向内网 / 元数据地址时不发请求，
    // 返回 status 'blocked'（Workers 本就到不了这些地址，结果对用户也更真实）。
    const probe = (method: 'HEAD' | 'GET') => fetchFollowingSafeRedirects(bm.url, {
     method,
     headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs-HealthCheck/1.0)',
     },
     signal: AbortSignal.timeout(3000),
    })
    try {
     let { response: res } = await probe('HEAD')

     if (!res.ok && (res.status === 405 || res.status === 403 || res.status === 400)) {
      // 有意吞掉：只为释放连接，流已关闭等取消失败不影响结果。
      void res.body?.cancel().catch(() => undefined)
      ;({ response: res } = await probe('GET'))
     }
     // 只要状态码：不读正文，立即释放连接（取消失败同上，有意忽略）。
     void res.body?.cancel().catch(() => undefined)

     return { id: bm.id, status: res.status, ok: res.ok }
    } catch (err) {
     if (err instanceof BlockedFetchTargetError) return { id: bm.id, status: 'blocked', ok: false }
     const isTimeout = err instanceof Error && err.name === 'TimeoutError'
     return { id: bm.id, status: isTimeout ? 'timeout' : 'error', ok: false }
    }
   })
  )

  return c.json(ok(checkResult))
 } catch (error) {
  return serverError(c, 'failed to perform health check', error)
 }
})

export default bookmarksRoutes
