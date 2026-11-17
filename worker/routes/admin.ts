import { Hono } from 'hono'
import { getAdminData } from '../lib/db'
import { ok } from '../lib/response'
import type { HonoEnv } from '../types'
import { serverError } from '../lib/routeHelpers'
import { appendServerTiming } from '../lib/serverTiming'

export const adminRoutes = new Hono<HonoEnv>()

// 不再有 isolate 内的短 TTL 聚合缓存：前端每次请求都带 no-cache 绕过它，缓存从未被读到，
// 却要求每个写路由记得失效。后台聚合始终直读一次 D1 batch。
adminRoutes.get('/data', async (c) => {
  try {
    const startedAt = performance.now()
    const data = await getAdminData(c.env.DB)
    appendServerTiming(c, 'db', startedAt)
    const serializeAt = performance.now()
    const response = c.json(ok(data), 200, {
      'Cache-Control': 'no-store',
    })
    appendServerTiming(c, 'serialize', serializeAt, response)
    return response
  } catch (error) {
    return serverError(c, 'failed to load admin data', error)
  }
})

export default adminRoutes
