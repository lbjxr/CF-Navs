import { beforeEach, describe, expect, it } from 'vitest'
import { clearErrorReportRateLimitMemory, consumeErrorReportQuota } from '../../../worker/lib/errorReportRateLimit'

class MemoryD1 {
  rows = new Map<string, { count: number; reset_at: number }>()
  prepare() {
    return {
      bind: (key: string, resetAt: number, now: number) => ({
        first: async () => {
          const current = this.rows.get(key)
          const next = !current || current.reset_at <= now
            ? { count: 1, reset_at: resetAt }
            : { count: current.count + 1, reset_at: current.reset_at }
          this.rows.set(key, next)
          return next
        },
      }),
    }
  }
}

describe('error report rate limit', () => {
  beforeEach(() => clearErrorReportRateLimitMemory())

  it('allows twelve requests per IP and resets after the window', async () => {
    const db = new MemoryD1()
    const env = { DB: db } as never
    for (let index = 0; index < 12; index += 1) expect(await consumeErrorReportQuota(env, '203.0.113.1', 1000)).toBe(true)
    expect(await consumeErrorReportQuota(env, '203.0.113.1', 1000)).toBe(false)
    expect(await consumeErrorReportQuota(env, '203.0.113.1', 61_001)).toBe(true)
  })

  it('keeps independent counters per IP', async () => {
    const db = new MemoryD1()
    const env = { DB: db } as never
    expect(await consumeErrorReportQuota(env, '203.0.113.1', 1000)).toBe(true)
    expect(await consumeErrorReportQuota(env, '203.0.113.2', 1000)).toBe(true)
    expect(db.rows.size).toBe(2)
  })
})
