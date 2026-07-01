import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type BookmarkUpsertReq, type SortReq } from '../../shared/types'
import {
  createBookmark,
  deleteBookmark,
  getBookmarkIconData,
  listBookmarks,
  sortBookmarks,
  updateBookmark,
} from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { cacheBookmarkIconBlob } from '../lib/bookmarkIconCache'
import { fail, ok } from '../lib/response'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>
const ICON_CACHE_REFRESH_TIMEOUT_MS = 1500

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
    return c.json(ok(await listBookmarks(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list bookmarks'))
  }
})

bookmarksRoutes.post('/', async (c) => {
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
    if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))

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
    if (!bookmark) return c.json(fail(ErrCode.NOT_FOUND, 'bookmark or category not found'))

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
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
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

    if (iconCache.wrote) {
      invalidateRuntimeDataCache()
      invalidatePublicDataCache(c, c.req.url)
    }

    return c.json(ok({
      icon_blob: iconCache.reuseExisting ? bookmark.icon_blob : iconCache.iconBlob,
    }))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to refresh bookmark icon cache'))
  }
})

export default bookmarksRoutes
