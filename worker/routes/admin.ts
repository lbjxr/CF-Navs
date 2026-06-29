import { Hono } from 'hono'
import type { AdminData } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import { getSettings, listBookmarks, listCategories } from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const adminRoutes = new Hono<HonoEnv>()

adminRoutes.get('/data', async (c) => {
  try {
    const [categories, bookmarks, settings] = await Promise.all([
      listCategories(c.env.DB),
      listBookmarks(c.env.DB),
      getSettings(c.env.DB),
    ])

    const data: AdminData = {
      categories,
      bookmarks,
      settings,
    }

    return c.json(ok(data), 200, {
      'Cache-Control': 'no-store',
    })
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to load admin data'))
  }
})

export default adminRoutes
