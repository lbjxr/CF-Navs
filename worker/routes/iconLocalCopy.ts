import { Hono } from 'hono'
import { ICON_COPY_PROTOCOL, parseIconCopyRequest } from '../../shared/iconLocalCopy'
import { ErrCode } from '../../shared/types'
import { authRequired } from '../middleware/auth'
import { obtainBookmarkIconCopy } from '../lib/bookmarkIconCopy'
import { obtainCategoryIconCopy } from '../lib/categoryIconCopy'
import { readBoundedBody } from '../lib/boundedBody'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const iconLocalCopyRoutes = new Hono<HonoEnv>()
iconLocalCopyRoutes.use('/icon-local-copy', async (c, next) => {
  // Applied before auth, including failures; no shared response-cache access on this router.
  c.header('Cache-Control', 'private, no-store')
  c.header('CDN-Cache-Control', 'no-store')
  c.header('Cloudflare-CDN-Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  await next()
})
iconLocalCopyRoutes.post('/icon-local-copy', authRequired, async (c) => {
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) return c.json(fail(ErrCode.FORBIDDEN, 'forbidden'), 403)
  try {
    const bytes = await readBoundedBody(c.req.raw.body, 4096)
    if (!bytes) return c.json(fail(ErrCode.BAD_REQUEST, 'invalid request'), 400)
    let value: unknown
    try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { return c.json(fail(ErrCode.BAD_REQUEST, 'invalid request'), 400) }
    const input = parseIconCopyRequest(value)
    if (!input) return c.json(fail(ErrCode.BAD_REQUEST, 'invalid request'), 400)
    const result = input.object_type === 'bookmark'
      ? await obtainBookmarkIconCopy(c.env.DB, input)
      : await obtainCategoryIconCopy(c.env.DB, input)
    return c.json(ok(result.data), result.status)
  } catch {
    return c.json(ok({ protocol: ICON_COPY_PROTOCOL, reason: 'unavailable' }), 503)
  }
})
