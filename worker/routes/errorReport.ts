import { Hono } from 'hono'
import { readBoundedBody } from '../../shared/boundedBody'
import { ErrCode } from '../../shared/types'
import { consumeErrorReportQuota, hasErrorReportQuota } from '../lib/errorReportRateLimit'
import { MAX_ERROR_REPORT_BODY_BYTES, normalizeErrorReportPayload } from '../lib/errorReportValidation'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

const app = new Hono<HonoEnv>()

app.post('/error-report', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || ''

  // 配额先行：这是公开匿名端点。先做只读配额检查（只依赖 IP），再读 body，
  // 避免攻击者用超大 body 或无效 JSON 反复打 CPU；解析失败不计次。
  if (!await hasErrorReportQuota(c.env, ip)) {
    return c.json(fail(ErrCode.RATE_LIMITED, 'too many error reports'), 429)
  }

  // 流式限长读取：超限直接 413，不把无界 body 读进内存。
  const bodyBytes = await readBoundedBody(c.req.raw.body, MAX_ERROR_REPORT_BODY_BYTES)
  if (!bodyBytes) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'error report payload too large'), 413)
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes))
  } catch {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid error report payload'), 400)
  }

  const errors = normalizeErrorReportPayload(body)
  if (errors.length === 0) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid error report payload'), 400)
  }

  // 解析成功后才真正消费配额。
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
