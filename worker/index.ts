import { Hono } from 'hono'
import { ErrCode } from '../shared/types'
import { withAssetCacheHeaders } from './lib/assetHeaders'
import { fetchAssetResponse } from './lib/assetRouting'
import { corsHeaders, corsPreflight } from './lib/cors'
import { fail, ok } from './lib/response'
import { authRequired } from './middleware/auth'
import adminRoutes from './routes/admin'
import authRoutes from './routes/auth'
import bookmarksRoutes from './routes/bookmarks'
import browserSyncRoutes from './routes/browserSync'
import categoriesRoutes from './routes/categories'
import dataRoutes from './routes/data'
import errorReportRoutes from './routes/errorReport'
import faviconRoutes from './routes/favicon'
import installRoutes from './routes/install'
import recoverRoutes from './routes/recover'
import { iconRoutes } from './routes/icon'
import { iconLocalCopyRoutes } from './routes/iconLocalCopy'
import publicRoutes from './routes/public'
import settingsRoutes from './routes/settings'
import type { HonoEnv } from './types'

const app = new Hono<HonoEnv>()

/**
 * API 版本策略（2026-10-15 起）：
 * - 同一份 handler 模块同时挂到 `/api`（历史兼容前缀）与 `/api/v1`（版本化前缀）下，
 *   是别名关系，不复制 handler 代码；
 * - 破坏性变更先在 `/api/v{n+1}` 落地，旧前缀保持兼容，由 API_CONTRACT 声明废弃节奏；
 * - 浏览器扩展等外部客户端固定走 `/api/v1`，不跟随 main 分支的破坏性变更。
 */
function registerApiRoutes(base: '/api' | '/api/v1'): void {
  app.get(`${base}/health`, (c) => c.json(ok({ status: 'ok' })))

  // Chromium 扩展从 chrome-extension:// 来源调用登录和同步接口，需要预检响应。
  app.options(`${base}/login`, () => corsPreflight())
  app.use(`${base}/login`, corsHeaders)
  app.route(base, authRoutes)
  app.route(base, installRoutes)
  app.route(base, recoverRoutes)
  app.route(base, publicRoutes)
  app.route(base, errorReportRoutes) // 公开错误上报，无需认证

  app.use(`${base}/admin`, authRequired)
  app.use(`${base}/admin/*`, authRequired)
  app.route(`${base}/admin`, adminRoutes)

  app.use(`${base}/categories`, authRequired)
  app.use(`${base}/categories/*`, authRequired)
  app.route(`${base}/categories`, categoriesRoutes)

  app.use(`${base}/bookmarks`, authRequired)
  app.use(`${base}/bookmarks/*`, authRequired)
  app.route(`${base}/bookmarks`, bookmarksRoutes)

  app.options(`${base}/browser-sync/bookmarks`, () => corsPreflight())
  // 扩展跨域调用：CORS 与鉴权都必须同时注册精确路径和通配路径。
  // Hono 的 use(path) 是精确匹配，只写 '/api/browser-sync' 时真实端点
  // '/api/browser-sync/bookmarks' 拿不到 CORS 头，浏览器会丢弃响应。
  app.use(`${base}/browser-sync`, corsHeaders)
  app.use(`${base}/browser-sync/*`, corsHeaders)
  app.use(`${base}/browser-sync`, authRequired)
  app.use(`${base}/browser-sync/*`, authRequired)
  app.route(`${base}/browser-sync`, browserSyncRoutes)

  app.use(`${base}/fetch-favicon`, authRequired)
  // faviconRoutes 内部已对整个子路由 use(authRequired)，这里的精确路径注册保留为双保险。
  app.use(`${base}/fetch-site-meta`, authRequired)
  app.route(base, faviconRoutes)

  // /api/icon/:id 与 /api/category-icon/:id 公开（不须认证），用于前台加载缓存图标；
  // 私密对象的真实图标要靠 /api/icon-access 签出的短期 key，该端点必须登录。
  app.use(`${base}/iconify-search`, authRequired)
  app.use(`${base}/icon-access`, authRequired)
  app.route(base, iconRoutes)
  app.route(base, iconLocalCopyRoutes)

  app.use(`${base}/settings`, authRequired)
  app.use(`${base}/settings/*`, authRequired)
  app.route(`${base}/settings`, settingsRoutes)

  app.use(`${base}/import`, authRequired)
  app.route(base, dataRoutes)
}

// 历史前缀保留兼容；版本化前缀供外部客户端固定使用。
// 注意：'/api/v1/...'.startsWith('/api/') 为 true，因此下面的 onError 与 catch-all
// 无需改动即可覆盖 v1 前缀。
//
// 注册顺序：先 /api/v1 后 /api。faviconRoutes 内部是无路径的 use(authRequired)，
// 挂载后会变成 `ALL <base>/*` 通配中间件；后注册的前缀的具体路由必须排在
// 先注册前缀的通配中间件之后，否则请求会先命中通配鉴权（如 /api/v1/health 401）。
// 与单前缀时代「具体路由先于 app.route(faviconRoutes)」是同一不变量。
registerApiRoutes('/api/v1')
registerApiRoutes('/api')

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

export default app
