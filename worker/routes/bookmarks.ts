import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type BookmarkUpsertReq, type SortReq } from '../../shared/types'
import {
  createBookmark,
  deleteBookmark,
  ensureSchema,
  getCategory,
  listBookmarks,
  setIconBlob,
  sortBookmarks,
  updateBookmark,
} from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

function waitUntil(c: AppContext, promise: Promise<unknown>): void {
  const executionCtx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx
  if (executionCtx) {
    executionCtx.waitUntil(promise)
    return
  }

  void promise
}

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

function parseId(c: AppContext): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

async function readJson<T>(c: AppContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

export const bookmarksRoutes = new Hono<HonoEnv>()

bookmarksRoutes.get('/', async (c) => {
  try {
    await ensureSchema(c.env.DB)
    return c.json(ok(await listBookmarks(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list bookmarks'))
  }
})

bookmarksRoutes.post('/', async (c) => {
  await ensureSchema(c.env.DB)
  const body = await readJson<BookmarkUpsertReq>(c)
  if (
    !body ||
    !Number.isInteger(body.category_id) ||
    body.category_id <= 0 ||
    !isNonEmptyString(body.title) ||
    !isNonEmptyString(body.url) ||
    !isOptionalString(body.icon) ||
    !isOptionalString(body.icon_background_color) ||
    !isOptionalString(body.description) ||
    (body.icon_source !== undefined && body.icon_source !== null && !['direct','favicon_im','logo_surf','google','iconify','custom'].includes(body.icon_source)) ||
    (body.open_method !== undefined && body.open_method !== 1 && body.open_method !== 2 && body.open_method !== 3)
  ) {
    return badRequest(c, 'invalid bookmark payload')
  }

  try {
    const category = await getCategory(c.env.DB, body.category_id)
    if (!category) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))

    const bookmark = await createBookmark(c.env.DB, {
      category_id: body.category_id,
      title: body.title.trim(),
      url: body.url.trim(),
      icon: body.icon ?? null,
      icon_source: body.icon_source ?? null,
      icon_background_color: body.icon_background_color?.trim() || null,
      description: body.description ?? null,
      open_method: body.open_method,
    })

    // 异步缓存图标 blob（不阻塞响应）
    if (bookmark.icon && /^https?:\/\//i.test(bookmark.icon)) {
      waitUntil(c, cacheIconBlob(c, bookmark.id, bookmark.icon))
    }

    return c.json(ok(bookmark))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to create bookmark'))
  }
})

bookmarksRoutes.put('/:id', async (c) => {
  await ensureSchema(c.env.DB)
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid bookmark id')

  const body = await readJson<BookmarkUpsertReq>(c)
  if (
    !body ||
    !Number.isInteger(body.category_id) ||
    body.category_id <= 0 ||
    !isNonEmptyString(body.title) ||
    !isNonEmptyString(body.url) ||
    !isOptionalString(body.icon) ||
    !isOptionalString(body.icon_background_color) ||
    !isOptionalString(body.description) ||
    (body.icon_source !== undefined && body.icon_source !== null && !['direct','favicon_im','logo_surf','google','iconify','custom'].includes(body.icon_source)) ||
    (body.open_method !== undefined && body.open_method !== 1 && body.open_method !== 2 && body.open_method !== 3)
  ) {
    return badRequest(c, 'invalid bookmark payload')
  }

  try {
    const category = await getCategory(c.env.DB, body.category_id)
    if (!category) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))

    const bookmark = await updateBookmark(c.env.DB, id, {
      category_id: body.category_id,
      title: body.title.trim(),
      url: body.url.trim(),
      icon: body.icon ?? null,
      icon_source: body.icon_source ?? null,
      icon_background_color: body.icon_background_color?.trim() || null,
      description: body.description ?? null,
      open_method: body.open_method,
    })
    if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'))

    // 异步缓存图标 blob（不阻塞响应）
    if (bookmark.icon && /^https?:\/\//i.test(bookmark.icon)) {
      waitUntil(c, cacheIconBlob(c, bookmark.id, bookmark.icon))
    }

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
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to delete bookmark'))
  }
})

bookmarksRoutes.post('/sort', async (c) => {
  const body = await readJson<SortReq>(c)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    return badRequest(c, 'invalid sort payload')
  }

  try {
    await sortBookmarks(c.env.DB, ids)
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to sort bookmarks'))
  }
})

export default bookmarksRoutes

// ========== 图标缓存辅助 ==========

const CACHE_TIMEOUT_MS = 5000
const MAX_BLOB_SIZE = 256_000 // 256KB

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function cacheIconBlob(c: AppContext, bookmarkId: number, iconUrl: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS)

  try {
    const resp = await fetch(iconUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*,application/octet-stream,*/*' },
    })

    if (!resp.ok || !resp.body) return

    // 只缓存图片类型的响应
    const ct = resp.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) return

    const arrayBuf = await resp.arrayBuffer()
    if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_BLOB_SIZE) return

    const b64 = bytesToBase64(new Uint8Array(arrayBuf))
    const dataUri = `data:${ct.startsWith('image/') ? ct : 'image/png'};base64,${b64}`
    await setIconBlob(c.env.DB, bookmarkId, dataUri)
  } catch {
    // 缓存失败不阻塞主流程
  } finally {
    clearTimeout(timer)
  }
}
