import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrCode } from '../../../shared/types'
import { api, getAuthToken, setApiBaseUrl, setStoredAuthSession } from '../../../src/lib/api'

function stubBrowserStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  })
  vi.stubGlobal('window', { addEventListener: () => {} })
}

function unauthorizedResponse(mode: 'http' | 'envelope') {
  if (mode === 'http') {
    return new Response(JSON.stringify({ code: ErrCode.UNAUTHORIZED, msg: 'unauthorized', data: null }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ code: ErrCode.UNAUTHORIZED, msg: 'unauthorized', data: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('background request session handling', () => {
  beforeEach(() => {
    stubBrowserStorage()
    setStoredAuthSession({ token: 'session-token', expires_at: Date.now() + 600_000, username: 'admin' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setApiBaseUrl('/api')
  })

  // 失焦自动解析站点名称是后台请求，用户没主动操作；
  // 让它清掉登录态会把手上未保存的书签表单一起弄丢。
  it.each(['http', 'envelope'] as const)(
    'keeps the session when the automatic site meta lookup gets a %s 401',
    async (mode) => {
      vi.stubGlobal('fetch', vi.fn(async () => unauthorizedResponse(mode)))

      await expect(api.bookmarks.fetchSiteMeta('https://example.com')).rejects.toThrow()
      expect(getAuthToken()).toBe('session-token')
    },
  )

  it.each(['http', 'envelope'] as const)(
    'still clears the session when a user-initiated request gets a %s 401',
    async (mode) => {
      vi.stubGlobal('fetch', vi.fn(async () => unauthorizedResponse(mode)))

      await expect(api.admin.getData()).rejects.toThrow()
      expect(getAuthToken()).toBeNull()
    },
  )

  it('does not leak the option into the fetch init', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 0, msg: 'ok', data: { title: 'Example', final_url: 'https://example.com/' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.bookmarks.fetchSiteMeta('https://example.com')

    const init = fetchMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(init).not.toHaveProperty('keepSessionOnUnauthorized')
    expect(init).not.toHaveProperty('auth')
  })
  it.each(['http', 'envelope'] as const)('keeps a newer session when an old request returns a %s 401', async (mode) => {
    let respond!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve })))
    const request = api.admin.getData()
    const rejected = expect(request).rejects.toThrow()
    setStoredAuthSession({ token: 'replacement-token', expires_at: Date.now() + 600_000, username: 'admin' })
    respond(unauthorizedResponse(mode))
    await rejected
    expect(getAuthToken()).toBe('replacement-token')
  })

  it.each([
    ['admin refresh', () => api.admin.getData({ keepSessionOnUnauthorized: true })],
    ['public fallback', () => api.public.getData(true)],
    ['version refresh', () => api.data.version(true)],
    ['optional icon grant', () => api.auth.iconAccess()],
  ] as const)('leaves %s unauthorized handling to its owner', async (_name, run) => {
    vi.stubGlobal('fetch', vi.fn(async () => unauthorizedResponse('http')))
    await expect(run()).rejects.toThrow()
    expect(getAuthToken()).toBe('session-token')
  })

})
