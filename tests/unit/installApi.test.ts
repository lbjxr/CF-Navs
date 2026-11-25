import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, setApiBaseUrl } from '../../src/lib/api'

describe('installation API', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setApiBaseUrl('/api')
  })

  it('checks installation before authenticated APIs without attaching auth', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.has('authorization')).toBe(false)
      return new Response(JSON.stringify({
        code: 0,
        msg: '',
        data: { state: 'needs_install', schema_version: null, setup_token_configured: true },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.install.status()).resolves.toEqual({
      state: 'needs_install',
      schema_version: null,
      setup_token_configured: true,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/install/status', expect.objectContaining({ cache: 'no-store' }))
  })

  it('aborts an unresponsive status probe at 15 seconds with a readable retry error', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('mock aborted')), { once: true })
      })
    }))
    const pending = api.install.status()
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'ApiError', message: '安装状态检查超时，请检查网络后重试。', status: 0,
    })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal?.aborted).toBe(true)
    await rejection
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases a completed probe deadline without aborting its successful response', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal
      return new Response(JSON.stringify({ code: 0, msg: '', data: { state: 'installed' } }))
    }))
    await expect(api.install.status()).resolves.toMatchObject({ state: 'installed' })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(signal?.aborted).toBe(false)
  })

  it('preserves an immediate network failure and releases its deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('disconnected')))
    await expect(api.install.status()).rejects.toMatchObject({
      name: 'ApiError', message: 'Network request failed', cause: { message: 'disconnected' },
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a fresh live signal when retrying after a timed-out probe', async () => {
    vi.useFakeTimers()
    const signals: Array<AbortSignal | null | undefined> = []
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal
      signals.push(signal)
      if (signals.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('mock aborted')), { once: true })
        })
      }
      return Promise.resolve(new Response(JSON.stringify({ code: 0, msg: '', data: { state: 'installed' } })))
    })
    vi.stubGlobal('fetch', fetchMock)
    const rejection = expect(api.install.status()).rejects.toThrow('安装状态检查超时')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    await expect(api.install.status()).resolves.toMatchObject({ state: 'installed' })
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(signals[1]).not.toBe(signals[0])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends the setup token only in the install request header', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('x-setup-token')).toBe('one-time-secret')
      expect(init?.body).toBe(JSON.stringify({ username: 'admin', password: 'password123' }))
      expect(String(init?.body)).not.toContain('one-time-secret')
      return new Response(JSON.stringify({
        code: 0,
        msg: '',
        data: { token: 'session-token', expires_at: Date.now() + 60_000, username: 'admin' },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.install.install({ username: 'admin', password: 'password123' }, 'one-time-secret')

    expect(fetchMock).toHaveBeenCalledWith('/api/install', expect.objectContaining({ method: 'POST' }))
  })
})
