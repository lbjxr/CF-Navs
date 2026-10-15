import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, setApiBaseUrl } from '../../../src/lib/api'

describe('installation API', () => {
  afterEach(() => {
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
