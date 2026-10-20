import { Hono } from 'hono'
import { ErrCode } from '../shared/types'
import { withAssetCacheHeaders } from './lib/assetHeaders'
import { fetchAssetResponse } from './lib/assetRouting'
import { corsHeaders, corsPreflight } from './lib/cors'
import { fail, ok } from './lib/response'
import { authRequired } from './middleware/auth'
import adminRoutes from './routes/admin'
import { authProtectedRoutes, authPublicRoutes } from './routes/auth'
import bookmarksRoutes from './routes/bookmarks'
import browserSyncRoutes from './routes/browserSync'
import categoriesRoutes from './routes/categories'
import dataRoutes from './routes/data'
import errorReportRoutes from './routes/errorReport'
import faviconRoutes from './routes/favicon'
import installRoutes from './routes/install'
import recoverRoutes from './routes/recover'
import { iconProtectedRoutes, iconRoutes } from './routes/icon'
import publicRoutes from './routes/public'
import settingsRoutes from './routes/settings'
import type { HonoEnv } from './types'

// ---------------------------------------------------------------------------
// 路由鉴权按构造保证（代码审查第 4 项）。
//
// 之前每个受保护前缀都要在这里手写 `app.use(精确路径)` + `app.use(通配路径)`，漏写一行
// 接口就静默变成公开的。现在拆成两个子应用，都挂在 /api 下：
//
//   1. publicApi：唯一的公开清单。这里注册的处理器直接返回响应、不调用 next()，因此
//      不会走到后面的鉴权中间件。这里只允许再放「调用 next() 的透传中间件」（CORS、
//      no-store 头），它们随后由受保护子应用鉴权。
//   2. protectedApi：`use('*', authRequired)`，挂载后等价于 `/api/*` 的鉴权中间件，
//      注册顺序在全部公开处理器之后。Hono 按注册顺序组合同一请求命中的处理器，所以：
//      公开路由先命中先返回；其它一切 /api 请求（包括新加的路由、方法不匹配、未知路径）
//      都先过 authRequired。
//
// 新增接口默认受保护；要公开必须显式加进 publicApi（tests/unit/routeAuth.test.ts 的公开
// 路由快照会因此变红，强制评审）。漏注册的方向是 fail-closed（401），不再是静默公开。
// ---------------------------------------------------------------------------

export const publicApi = new Hono<HonoEnv>()

publicApi.get('/health', (c) => c.json(ok({ status: 'ok' })))

// Chromium 扩展从 chrome-extension:// 来源调用登录和同步接口，需要预检响应。
publicApi.options('/login', () => corsPreflight())
publicApi.use('/login', corsHeaders)
publicApi.route('/', authPublicRoutes)
publicApi.route('/', installRoutes)
publicApi.route('/', recoverRoutes)
publicApi.route('/', publicRoutes)
publicApi.route('/', errorReportRoutes) // 公开错误上报，无需认证
// /api/icon/:id、/api/category-icon/:id 与 /api/iconify/* 公开，用于前台加载图标；
// 私密对象的真实图标要靠受保护的 /api/icon-access 签出的短期 key。
publicApi.route('/', iconRoutes)

// 透传中间件：先于受保护子应用执行，使 401 响应同样带上这些头。
publicApi.options('/browser-sync/bookmarks', () => corsPreflight())
publicApi.use('/browser-sync/*', corsHeaders)

export const protectedApi = new Hono<HonoEnv>()

protectedApi.use('*', authRequired)
protectedApi.route('/', authProtectedRoutes) // /logout、/password、/me
protectedApi.route('/admin', adminRoutes)
protectedApi.route('/categories', categoriesRoutes)
protectedApi.route('/bookmarks', bookmarksRoutes)
protectedApi.route('/browser-sync', browserSyncRoutes)
protectedApi.route('/', faviconRoutes) // /fetch-favicon、/fetch-site-meta
protectedApi.route('/', iconProtectedRoutes) // /icon-access、/iconify-search
protectedApi.route('/settings', settingsRoutes)
protectedApi.route('/', dataRoutes) // /import

/**
 * 组装根应用（阶段 1 共享工厂）：Cloudflare Worker 默认导出与 Node 入口
 * 共用同一份路由组合，运行时差异只在注入的 Env。
 * 顺序即安全边界：公开子应用必须先于受保护子应用挂载。
 */
export function createApp(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()

  app.route('/api', publicApi)
  app.route('/api', protectedApi)

  app.onError((err, c) => {
    console.error(err)

    if (new URL(c.req.url).pathname.startsWith('/api/')) {
      return c.json(fail(ErrCode.SERVER_ERROR, 'internal server error'))
    }

    return new Response('Internal Server Error', { status: 500 })
  })

  app.all('*', async (c) => {
    if (new URL(c.req.url).pathname.startsWith('/api/')) {
      return c.json(fail(ErrCode.NOT_FOUND, 'not found'))
    }

    const response = await fetchAssetResponse(c.req.raw, c.env.ASSETS)
    return withAssetCacheHeaders(c.req.raw, response)
  })

  return app
}
