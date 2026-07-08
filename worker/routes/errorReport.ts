import { Hono } from 'hono'
import { ok } from '../lib/response'
import type { HonoEnv } from '../types'

const app = new Hono<HonoEnv>()

app.post('/error-report', async (c) => {
  const body = await c.req.json().catch(() => null)
  const errors = Array.isArray(body?.errors) ? body.errors : (body ? [body] : [])

  const ua = c.req.header('user-agent') || ''
  const ip = c.req.header('cf-connecting-ip') || ''

  for (const entry of errors) {
    const category = typeof entry.category === 'string' ? entry.category : 'unknown'
    const message = typeof entry.message === 'string' ? entry.message : 'no message'
    const ts = typeof entry.timestamp === 'number'
      ? new Date(entry.timestamp).toISOString()
      : new Date().toISOString()
    console.error(
      '[ERROR-REPORT] ' + ts +
      ' [' + category.toUpperCase() + '] ' +
      String(message).slice(0, 200) +
      ' | IP: ' + ip + ' | UA: ' + ua.slice(0, 120) +
      (entry.url ? ' | url=' + String(entry.url).slice(0, 200) : '') +
      (entry.line != null ? ' | L' + entry.line : '')
    )
  }

  return c.json(ok({ received: errors.length }))
})

export default app
