import { afterEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { loginInPage } from '../../scripts/lib/browserLogin.mjs'
import { resolveWranglerConfig, rootDir, wranglerBin } from '../../scripts/lib/wranglerLocal.mjs'

// 代码审查三轮第 35 项：脚本里重复的 runWrangler / 配置选择 / 页面内登录收敛到 scripts/lib。
describe('scripts shared helpers', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('loginInPage stores the session and reports success', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => store.set(k, v) })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: { token: 't', expires_at: 9, username: 'admin' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loginInPage('https://navs.test', 'admin', 'pw')

    expect(fetchMock).toHaveBeenCalledWith('https://navs.test/api/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'admin', password: 'pw' }) }))
    expect(result).toEqual({ ok: true, status: 200, username: 'admin', expires_at: 9 })
    expect(JSON.parse(store.get('cf-navs.auth')!)).toEqual({ token: 't', expires_at: 9, username: 'admin' })
  })

  it('loginInPage reports failures without touching storage', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 1001, msg: 'bad', data: null }), { status: 401 })))
    expect(await loginInPage('https://navs.test', 'admin', 'x')).toEqual({ ok: false, status: 401, body: { code: 1001, msg: 'bad', data: null } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 502 })))
    expect(await loginInPage('https://navs.test', 'admin', 'x')).toEqual({ ok: false, status: 502, body: null })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('returns the exact issued token only when its caller opts into owned session cleanup', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => {
      // 登记应来自此次响应，不依赖写入之后存储中保留的是哪个会话。
      store.set(key, JSON.stringify({ ...JSON.parse(value), token: 'later-session' }))
    } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 0, data: { token: 'issued-session', username: 'admin', expires_at: 9 },
    }), { status: 200 })))

    const result = await loginInPage('https://navs.test', 'admin', 'pw', true)

    expect(result).toEqual({ ok: true, status: 200, username: 'admin', expires_at: 9, token: 'issued-session' })
    expect(JSON.parse(store.get('cf-navs.auth')!).token).toBe('later-session')
  })

  it('preserves the issued token for cleanup when local storage initialization fails', async () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('storage unavailable') } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 0, data: { token: 'issued-before-storage-failure', username: 'admin', expires_at: 9 },
    }), { status: 200 })))

    expect(await loginInPage('https://navs.test', 'admin', 'pw', true)).toEqual({
      ok: false, status: 200, token: 'issued-before-storage-failure', storageFailed: true,
    })
    await expect(loginInPage('https://navs.test', 'admin', 'pw')).rejects.toThrow('storage unavailable')
  })

  it('omits private login error bodies from the owned session result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 1001, data: { token: 'unexpected-private-field' }, msg: 'private response text',
    }), { status: 401 })))

    expect(await loginInPage('https://navs.test', 'admin', 'pw', true)).toEqual({
      ok: false, status: 401, code: 1001,
    })
  })

  it('loginInPage is self-contained so it can be serialized into a page', () => {
    // Serialized via Function#toString: any free reference besides browser globals would break in the page.
    const source = loginInPage.toString()
    expect(source).toMatch(/^async function loginInPage\(/)
    expect(() => new Function(`return (${source})`)()).not.toThrow()
  })

  it('wranglerLocal resolves the repository root, binary and config', () => {
    expect(readFileSync(path.join(rootDir, 'package.json'), 'utf8')).toContain('"name": "cf-navs"')
    expect(wranglerBin).toBe(path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js'))
    expect(resolveWranglerConfig('/explicit.toml')).toBe('/explicit.toml')
    expect(['wrangler.local.toml', 'wrangler.toml']).toContain(path.basename(resolveWranglerConfig()))
  })

  it('no script keeps its own copy of runWrangler config selection or the in-page login', () => {
    for (const file of ['smoke-local.mjs', 'ordinary-icon-concurrency-experiment.mjs', 'ordinary-icon-scale-fixtures.mjs']) {
      const source = readFileSync(path.join(rootDir, 'scripts', file), 'utf8')
      expect(source).not.toContain("path.join(rootDir, 'wrangler.local.toml')")
      expect(source).toContain('runWranglerSync(')
    }
    for (const file of ['chrome-regression.mjs', 'perf-audit.mjs', 'ordinary-icon-concurrency-experiment.mjs', 'ordinary-icon-perf-probe.mjs']) {
      const source = readFileSync(path.join(rootDir, 'scripts', file), 'utf8')
      expect(source).not.toMatch(/fetch\(`\$\{base\w*\}\/api\/login`/)
      expect(source).toContain("from './lib/browserLogin.mjs'")
    }
  })
})
