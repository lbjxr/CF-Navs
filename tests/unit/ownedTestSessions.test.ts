import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOwnedTestSessions } from '../../scripts/lib/ownedTestSessions.mjs'

const baseUrl = 'https://navs.test'
const unauthorized = () => new Response(JSON.stringify({ code: 1001, data: null }), { status: 401 })
const success = () => new Response(JSON.stringify({ code: 0, data: { revoked: true } }), { status: 200 })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T00:00:00Z'))
})
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('owned verification sessions', () => {
  it('does nothing successfully when no session was registered, including existing browser state', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ token: 'unowned-existing-session' }) })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })

    expect(await owned.cleanup()).toEqual({ ok: true, total: 0, revoked: 0, failed: 0, elapsedMs: 0, failures: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('deduplicates and revokes both exact owned sessions before forgetting successful ones', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? success() : unauthorized())
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    expect(owned.register('first-owned-session')).toBe(1)
    expect(owned.register('first-owned-session')).toBe(1)
    expect(owned.register('second-owned-session')).toBe(2)

    expect(await owned.cleanup()).toEqual({ ok: true, total: 2, revoked: 2, failed: 0, elapsedMs: 0, failures: [] })
    expect(fetchImpl.mock.calls.map(([url, init]) => ({ url: String(url), method: init?.method, headers: init?.headers }))).toEqual([
      { url: baseUrl + '/api/logout', method: 'POST', headers: { accept: 'application/json', authorization: 'Bearer first-owned-session' } },
      { url: baseUrl + '/api/settings', method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer first-owned-session' } },
      { url: baseUrl + '/api/logout', method: 'POST', headers: { accept: 'application/json', authorization: 'Bearer second-owned-session' } },
      { url: baseUrl + '/api/settings', method: 'GET', headers: { accept: 'application/json', authorization: 'Bearer second-owned-session' } },
    ])
    for (const [, init] of fetchImpl.mock.calls) expect(init).toMatchObject({ redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) })
    expect(await owned.clear()).toMatchObject({ ok: true, total: 0, revoked: 0 })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('accepts an already invalid session only after settings confirms 401/code1001', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => unauthorized())
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('already-expired-session')

    expect(await owned.clear()).toMatchObject({ ok: true, total: 1, revoked: 1, failed: 0 })
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'GET'])
  })

  it('polls until real rejection rather than treating a successful logout as proof', async () => {
    let probes = 0
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'POST') return success()
      return ++probes < 3 ? success() : unauthorized()
    })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('eventually-revoked-session')
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()

    expect(await pending).toEqual({ ok: true, total: 1, revoked: 1, failed: 0, elapsedMs: 500, failures: [] })
    expect(probes).toBe(3)
  })

  it('fails at 15 seconds when logout succeeds but the session remains usable, then allows a cleanup retry', async () => {
    let invalid = false
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'GET' && invalid ? unauthorized() : success())
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('still-valid-session')
    let settled = false
    const pending = owned.cleanup().then(result => { settled = true; return result })
    await vi.advanceTimersByTimeAsync(14999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toEqual({ ok: false, total: 1, revoked: 0, failed: 1, elapsedMs: 15000,
      failures: [{ safeReason: 'session-still-valid-after-deadline', elapsedMs: 15000 }] })
    invalid = true
    expect(await owned.cleanup()).toMatchObject({ ok: true, total: 1, revoked: 1, failed: 0 })
  })

  it.each([
    [401, 0],
    [200, 1001],
    [403, 1001],
  ])('does not mistake status %s/code %s for the required rejection', async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? success() : new Response(JSON.stringify({ code }), { status }))
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('not-proved-invalid-session')
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()

    expect(await pending).toMatchObject({ ok: false, revoked: 0, failed: 1, elapsedMs: 15000 })
  })

  it('still revokes a second session after the first one fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const token = (init?.headers as Record<string, string>).authorization
      if (init?.method === 'GET' && token === 'Bearer second-owned-session') return unauthorized()
      return success()
    })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('first-owned-session')
    owned.register('second-owned-session')
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()

    expect(await pending).toMatchObject({ ok: false, total: 2, revoked: 1, failed: 1, elapsedMs: 15000 })
    expect(fetchImpl.mock.calls.slice(-2).map(([url]) => String(url))).toEqual([baseUrl + '/api/logout', baseUrl + '/api/settings'])
    expect(fetchImpl.mock.calls.at(-1)?.[1]?.headers).toMatchObject({ authorization: 'Bearer second-owned-session' })
  })

  it('bounds a hanging logout independently and still proves revocation through settings', async () => {
    const signals: AbortSignal[] = []
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      signals.push(init!.signal!)
      return init?.method === 'POST' ? new Promise<Response>(() => {}) : Promise.resolve(unauthorized())
    })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('lost-logout-ack-session')
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()

    expect(await pending).toMatchObject({ ok: true, revoked: 1, elapsedMs: 5000 })
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1]).not.toBe(signals[0])
  })

  it('includes a hanging logout in the same fifteen second rejection window', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) =>
      init?.method === 'POST' ? new Promise<Response>(() => {}) : Promise.resolve(success()))
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('valid-after-hanging-logout')
    let settled = false
    const pending = owned.cleanup().then(result => { settled = true; return result })
    await vi.advanceTimersByTimeAsync(14999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(true)

    expect(await pending).toMatchObject({ ok: false, failed: 1, revoked: 0, elapsedMs: 15000 })
  })

  it('bounds hanging verification bodies without waiting forever or leaking response data', async () => {
    const signals: AbortSignal[] = []
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      signals.push(init!.signal!)
      if (init?.method === 'POST') return success()
      const response = success()
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}))
      return response
    })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register('hanging-body-session')
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()

    expect(await pending).toEqual({ ok: false, total: 1, revoked: 0, failed: 1, elapsedMs: 15000,
      failures: [{ safeReason: 'revocation-could-not-be-confirmed', elapsedMs: 15000 }] })
    expect(signals.slice(1).every(signal => signal.aborted)).toBe(true)
    expect(new Set(signals).size).toBe(signals.length)
  })

  it('reports only safe counts/reasons when transport errors contain secrets', async () => {
    const secret = 'secret-owned-session'
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error(baseUrl + ' ' + secret + ' private response data') })
    const owned = createOwnedTestSessions({ baseUrl, fetchImpl })
    owned.register(secret)
    const pending = owned.cleanup()
    await vi.runAllTimersAsync()
    const result = await pending

    expect(result).toMatchObject({ ok: false, total: 1, revoked: 0, failed: 1 })
    expect(Object.keys(result).sort()).toEqual(['elapsedMs', 'failed', 'failures', 'ok', 'revoked', 'total'])
    expect(Object.keys(result.failures[0]).sort()).toEqual(['elapsedMs', 'safeReason'])
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain(baseUrl)
    expect(JSON.stringify(result)).not.toContain('private response data')
  })

  it('rejects malformed registration and unsafe origins without echoing their values', () => {
    const owned = createOwnedTestSessions({ baseUrl })
    expect(() => owned.register('')).toThrow('Invalid owned test session')
    expect(() => owned.register('secret with spaces')).toThrow('Invalid owned test session')
    expect(() => createOwnedTestSessions({ baseUrl: 'https://unit-user@navs.test' })).toThrow('Owned session cleanup requires an HTTP(S) origin')
    expect(() => createOwnedTestSessions({ baseUrl: 'not-a-url-secret' })).toThrow('Owned session cleanup requires an HTTP(S) origin')
  })
})
