import { Hono } from 'hono'
import { ErrCode } from '../../shared/types'
import { consumeErrorReportQuota } from '../lib/errorReportRateLimit'
import { exceedsErrorReportBodyLimit, normalizeErrorReportPayload } from '../lib/errorReportValidation'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

const app = new Hono<HonoEnv>()

app.post('/error-report', async (c) => {
  const declaredLength = c.req.header('content-length')
  if (exceedsErrorReportBodyLimit(declaredLength, '')) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'error report payload too large'), 413)
  }

  // 有意降级：读不出正文（客户端中断等）按空正文处理，随后的 JSON 校验返回 400，不进 onError。
  const rawBody = await c.req.text().catch(() => '')
  if (exceedsErrorReportBodyLimit(declaredLength, rawBody)) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'error report payload too large'), 413)
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid error report payload'), 400)
  }

  const errors = normalizeErrorReportPayload(body)
  if (errors.length === 0) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid error report payload'), 400)
  }

  // Node 入口注入可信 IP 时优先采用（见 rateLimit.ts 的信任边界说明）；
  // Worker 路径仍直接用 Cloudflare 边缘写入的 cf-connecting-ip，与原行为一致。
  const ip = (c.get('clientIp') ?? c.req.header('cf-connecting-ip')) || ''
  if (!await consumeErrorReportQuota(c.env, ip)) {
    return c.json(fail(ErrCode.RATE_LIMITED, 'too many error reports'), 429)
  }

  const ua = c.req.header('user-agent') || ''
  for (const entry of errors) {
    console.error(
      '[ERROR-REPORT] ' + new Date(entry.timestamp).toISOString() +
      ' [' + entry.category.toUpperCase() + '] ' + entry.message +
      ' | IP: ' + ip + ' | UA: ' + ua.slice(0, 120) +
      (entry.url ? ' | url=' + entry.url : '') +
      (entry.line != null ? ' | L' + entry.line : ''),
    )
  }

  return c.json(ok({ received: errors.length }))
})

export default app
