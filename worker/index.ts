import { Hono } from 'hono'
import { ErrCode } from '../shared/types'
import { withAssetCacheHeaders } from './lib/assetHeaders'
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
import { iconRoutes } from './routes/icon'
import publicRoutes from './routes/public'
import settingsRoutes from './routes/settings'
import type { HonoEnv } from './types'

const app = new Hono<HonoEnv>()

app.get('/api/health', (c) => c.json(ok({ status: 'ok' })))

// Chromium 扩展从 chrome-extension:// 来源调用登录和同步接口，需要预检响应。
app.options('/api/login', () => corsPreflight())
app.use('/api/login', corsHeaders)
app.route('/api', authRoutes)
app.route('/api', installRoutes)
app.route('/api', publicRoutes)
app.route('/api', errorReportRoutes) // 公开错误上报，无需认证

app.use('/api/admin', authRequired)
app.use('/api/admin/*', authRequired)
app.route('/api/admin', adminRoutes)

app.use('/api/categories', authRequired)
app.use('/api/categories/*', authRequired)
app.route('/api/categories', categoriesRoutes)

app.use('/api/bookmarks', authRequired)
app.use('/api/bookmarks/*', authRequired)
app.route('/api/bookmarks', bookmarksRoutes)

app.options('/api/browser-sync/bookmarks', () => corsPreflight())
// 扩展跨域调用：CORS 与鉴权都必须同时注册精确路径和通配路径。
// Hono 的 use(path) 是精确匹配，只写 '/api/browser-sync' 时真实端点
// '/api/browser-sync/bookmarks' 拿不到 CORS 头，浏览器会丢弃响应。
app.use('/api/browser-sync', corsHeaders)
app.use('/api/browser-sync/*', corsHeaders)
app.use('/api/browser-sync', authRequired)
app.use('/api/browser-sync/*', authRequired)
app.route('/api/browser-sync', browserSyncRoutes)

app.use('/api/fetch-favicon', authRequired)
// 精确路径中间件，没有通配符：新增同文件路由时必须补一行，否则接口是公开的。
app.use('/api/fetch-site-meta', authRequired)
app.route('/api', faviconRoutes)

// /api/icon/:id 与 /api/category-icon/:id 公开（不须认证），用于前台加载缓存图标；
// 私密对象的真实图标要靠 /api/icon-access 签出的短期 key，该端点必须登录。
app.use('/api/iconify-search', authRequired)
app.use('/api/icon-access', authRequired)
app.route('/api', iconRoutes)

app.use('/api/settings', authRequired)
app.use('/api/settings/*', authRequired)
app.route('/api/settings', settingsRoutes)

app.use('/api/import', authRequired)
app.route('/api', dataRoutes)

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

  const response = await c.env.ASSETS.fetch(c.req.raw)
  return withAssetCacheHeaders(c.req.raw, response)
})

export default app
