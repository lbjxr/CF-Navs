import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type Bookmark, type Category, type ImportReq, type ImportResp } from '../../shared/types'
import { invalidatePublicDataCache, invalidateSiteConfigCache } from '../lib/cache'
import { importData } from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

async function readJson<T>(c: AppContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

function isValidCategory(value: unknown): value is Category {
  if (!value || typeof value !== 'object') return false
  const c = value as Record<string, unknown>
  return (
    Number.isInteger(c.id) &&
    (c.id as number) > 0 &&
    typeof c.title === 'string' &&
    c.title.trim().length > 0 &&
    (c.icon === null || c.icon === undefined || typeof c.icon === 'string')
  )
}

function isValidBookmark(value: unknown): value is Bookmark {
  if (!value || typeof value !== 'object') return false
  const b = value as Record<string, unknown>
  return (
    Number.isInteger(b.id) &&
    (b.id as number) > 0 &&
    Number.isInteger(b.category_id) &&
    (b.category_id as number) > 0 &&
    typeof b.title === 'string' &&
    b.title.trim().length > 0 &&
    typeof b.url === 'string' &&
    b.url.trim().length > 0
  )
}

export const dataRoutes = new Hono<HonoEnv>()

dataRoutes.post('/import', async (c) => {
  const body = await readJson<ImportReq>(c)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(c, 'invalid import payload')
  }
  if (!Array.isArray(body.categories) || !Array.isArray(body.bookmarks)) {
    return badRequest(c, 'categories / bookmarks must be arrays')
  }
  if (!body.categories.every(isValidCategory)) {
    return badRequest(c, 'invalid category in payload')
  }
  if (!body.bookmarks.every(isValidBookmark)) {
    return badRequest(c, 'invalid bookmark in payload')
  }

  // 去重 id 校验
  const categoryIds = new Set<number>()
  for (const cat of body.categories) {
    if (categoryIds.has(cat.id)) return badRequest(c, `duplicate category id: ${cat.id}`)
    categoryIds.add(cat.id)
  }
  const bookmarkIds = new Set<number>()
  for (const bm of body.bookmarks) {
    if (bookmarkIds.has(bm.id)) return badRequest(c, `duplicate bookmark id: ${bm.id}`)
    bookmarkIds.add(bm.id)
    // 引用完整性：书签必须归属导入集合中的分类
    if (!categoryIds.has(bm.category_id)) {
      return badRequest(c, `bookmark ${bm.id} references missing category ${bm.category_id}`)
    }
  }

  if (body.settings !== undefined && (body.settings === null || typeof body.settings !== 'object' || Array.isArray(body.settings))) {
    return badRequest(c, 'invalid settings')
  }

  try {
    const result = await importData(c.env.DB, {
      categories: body.categories,
      bookmarks: body.bookmarks,
      settings: body.settings,
    })
    invalidatePublicDataCache(c, c.req.url)
    invalidateSiteConfigCache(c, c.req.url)
    return c.json(ok<ImportResp>(result))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to import data'))
  }
})

export default dataRoutes
