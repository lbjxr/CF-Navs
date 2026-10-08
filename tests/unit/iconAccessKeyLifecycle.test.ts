// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { clearIconAccessKey, ensureIconAccessKey, iconAccessKey, readIconAccessKey } from '../../src/lib/iconAccessKey'

// 授权 key 的寿命只有 30 分钟，且不查撤销名单——登出/改密码只能靠 clearIconAccessKey()。
// clear 无法取消已经发出的请求，所以必须让它的回调作废，否则过期 key 会在登出后
// 被重新发布并挂回图标 URL（Issue #28 复核发现的竞态）。
const grant = (key: string, ttlMs = 30 * 60 * 1000) => async () => ({
  key,
  expires_at: Date.now() + ttlMs,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  clearIconAccessKey()
  vi.restoreAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('icon access key lifecycle', () => {
  it('publishes a fetched key', async () => {
    await ensureIconAccessKey(grant('KEY-A'))

    expect(get(iconAccessKey)).toBe('KEY-A')
  })

  it('does not publish a key that resolves after the session was cleared', async () => {
    const pending = Promise.withResolvers<{ key: string; expires_at: number }>()
    const fetching = ensureIconAccessKey(() => pending.promise)

    // 登出 / 改密码发生在请求在途期间
    clearIconAccessKey()
    pending.resolve({ key: 'STALE-KEY', expires_at: Date.now() + 30 * 60 * 1000 })

    expect(await fetching).toBe('')
    expect(get(iconAccessKey)).toBe('')
  })

  it('lets a fresh request after a clear still publish its own key', async () => {
    const firstRequest = Promise.withResolvers<{ key: string; expires_at: number }>()
    const first = ensureIconAccessKey(() => firstRequest.promise)

    clearIconAccessKey()
    const second = ensureIconAccessKey(grant('KEY-B'))
    firstRequest.resolve({ key: 'STALE-KEY', expires_at: Date.now() + 30 * 60 * 1000 })

    expect(await first).toBe('')
    expect(await second).toBe('KEY-B')
    expect(get(iconAccessKey)).toBe('KEY-B')
  })

  it('rejects an already expired fetched key', async () => {
    const fetchGrant = vi.fn(grant('KEY-C', -1))
    expect(await ensureIconAccessKey(fetchGrant)).toBe('')
    expect(fetchGrant).toHaveBeenCalledOnce()
  })

  it('retains a valid key through the renewal window and expires at its boundary', async () => {
    const start = Date.now()
    await ensureIconAccessKey(grant('KEY-A'))
    expect(readIconAccessKey(start + 28 * 60 * 1000)).toBe('KEY-A')
    expect(readIconAccessKey(start + 30 * 60 * 1000 - 1)).toBe('KEY-A')
    expect(readIconAccessKey(start + 30 * 60 * 1000)).toBe('')
  })

  it('deduplicates renewal without publishing an empty key while it is pending', async () => {
    await ensureIconAccessKey(grant('KEY-A'))
    const seen: string[] = []
    const stop = iconAccessKey.subscribe(value => seen.push(value))
    vi.setSystemTime(Date.now() + 28 * 60 * 1000)
    const pending = Promise.withResolvers<{ key: string; expires_at: number }>()
    const fetchGrant = vi.fn(() => pending.promise)
    const first = ensureIconAccessKey(fetchGrant)
    const second = ensureIconAccessKey(fetchGrant)
    await Promise.resolve()
    expect(fetchGrant).toHaveBeenCalledOnce()
    expect(get(iconAccessKey)).toBe('KEY-A')
    pending.resolve({ key: 'KEY-B', expires_at: Date.now() + 30 * 60 * 1000 })
    expect(await first).toBe('KEY-B')
    expect(await second).toBe('KEY-B')
    expect(seen).not.toContain('')
    stop()
  })

  it.each(['rejected', 'invalid', 'expired'] as const)('keeps a still-valid key after %s renewal', async failure => {
    await ensureIconAccessKey(grant('KEY-A'))
    vi.setSystemTime(Date.now() + 28 * 60 * 1000)
    const fetchGrant = failure === 'rejected' ? () => Promise.reject(new Error('offline'))
      : failure === 'invalid' ? grant('', 30 * 60 * 1000) : grant('EXPIRED', -1)
    expect(await ensureIconAccessKey(fetchGrant)).toBe('KEY-A')
    expect(get(iconAccessKey)).toBe('KEY-A')
  })

  it('does not retain a key that expired while renewal was pending', async () => {
    await ensureIconAccessKey(grant('KEY-A'))
    vi.setSystemTime(Date.now() + 28 * 60 * 1000)
    const pending = Promise.withResolvers<{ key: string; expires_at: number }>()
    const renewal = ensureIconAccessKey(() => pending.promise)
    vi.setSystemTime(Date.now() + 2 * 60 * 1000)
    pending.reject(new Error('offline'))
    expect(await renewal).toBe('')
    expect(get(iconAccessKey)).toBe('')
  })

  it('does not let a failed old renewal republish over a new session', async () => {
    await ensureIconAccessKey(grant('KEY-A'))
    vi.setSystemTime(Date.now() + 28 * 60 * 1000)
    const pending = Promise.withResolvers<{ key: string; expires_at: number }>()
    const old = ensureIconAccessKey(() => pending.promise)
    clearIconAccessKey()
    await ensureIconAccessKey(grant('KEY-B'))
    pending.reject(new Error('old offline request'))
    expect(await old).toBe('')
    expect(get(iconAccessKey)).toBe('KEY-B')
  })
})
