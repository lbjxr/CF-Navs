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

app.all('*', (c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json(fail(ErrCode.NOT_FOUND, 'not found'))
  }

  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
