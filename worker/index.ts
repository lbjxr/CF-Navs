import { Hono } from 'hono'
import { ErrCode } from '../shared/types'
import { fail, ok } from './lib/response'
import { authRequired } from './middleware/auth'
import adminRoutes from './routes/admin'
import authRoutes from './routes/auth'
import bookmarksRoutes from './routes/bookmarks'
import categoriesRoutes from './routes/categories'
import dataRoutes from './routes/data'
import faviconRoutes from './routes/favicon'
import { iconRoutes } from './routes/icon'
import publicRoutes from './routes/public'
import settingsRoutes from './routes/settings'
import type { HonoEnv } from './types'

const app = new Hono<HonoEnv>()

const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE = 'no-cache, max-age=0, must-revalidate'
const SHORT_STATIC_CACHE = 'public, max-age=86400'
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

function setSecurityHeaders(headers: Headers): void {
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function withAssetCacheHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url)
  const headers = new Headers(response.headers)
  const contentType = headers.get('Content-Type') ?? ''
  const isHtml =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    contentType.includes('text/html')

  if (response.ok) {
    if (isHtml || url.pathname === '/sw.js') {
      headers.set('Cache-Control', REVALIDATE_CACHE)
    } else if (url.pathname.startsWith('/assets/')) {
      headers.set('Cache-Control', IMMUTABLE_ASSET_CACHE)
    } else if (url.pathname === '/manifest.webmanifest' || url.pathname === '/icon.svg') {
      headers.set('Cache-Control', SHORT_STATIC_CACHE)
    }

    if (isHtml) {
      setSecurityHeaders(headers)
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

app.get('/api/health', (c) => c.json(ok({ status: 'ok' })))

app.route('/api', authRoutes)
app.route('/api', publicRoutes)

app.use('/api/admin', authRequired)
app.use('/api/admin/*', authRequired)
app.route('/api/admin', adminRoutes)

app.use('/api/categories', authRequired)
app.use('/api/categories/*', authRequired)
app.route('/api/categories', categoriesRoutes)

app.use('/api/bookmarks', authRequired)
app.use('/api/bookmarks/*', authRequired)
app.route('/api/bookmarks', bookmarksRoutes)

app.use('/api/fetch-favicon', authRequired)
app.route('/api', faviconRoutes)

// /api/icon/:id 公开（不须认证），用于前台加载缓存图标
app.use('/api/iconify-search', authRequired)
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
