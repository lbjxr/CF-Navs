import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../schema.sql', async () => {
  const { readFileSync } = await import('node:fs')
  return { default: readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8') }
})

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../../worker/app'
import type { Env } from '../../worker/types'
import { assembleEnv } from '../../server/nodeEnv'
import type { ServerConfig } from '../../server/config'
import { createSqliteD1 } from '../../server/sqliteD1'
import { createSqliteKv } from '../../server/sqliteKv'
import { createResponseCache, installGlobalCache } from '../../server/responseCache'
import { clientIpMiddleware, ipMatches, resolveClientIp } from '../../server/requestContext'

// Node 运行时安全行为回归（2026-10-20 真机手工验证后固化）：
// 1) IP 信任边界：伪造转发头在不可信对端下不生效；可信代理下以 X-Real-IP 为准、
//    同一真实 IP 轮换伪造 XFF 仍会累计登录失败并在第 6 次触发限流（1004）。
// 2) 私密书签图标：匿名只能拿到兜底图，持 /api/icon-access 签发的短期 key 才能取真图。
// 3) 图标写入会推进 icon_epoch 计数（多设备据此刷新图标）。计数由触发器维护；
//    公开数据响应缓存只按 data_version 失效，图标懒缓存不顶版本，epoch 随下一次
//    真实变更一并带出——测试按这个设计口径断言（DB 计数即时递增、载荷随后跟上）。
// 4) 安装一次性：装完后即使带正确 SETUP_TOKEN 也不能再次安装。

const closers: Array<() => void> = []
const dirs: string[] = []
afterEach(() => {
  while (closers.length) closers.pop()!()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const BASE = 'https://navs.example.test'
const SETUP_TOKEN = '<MASKED_SECRET_001>'
const ADMIN_PW = 'node-security-pw'
// 1x1 透明 PNG（data-uri 图标不触发外网抓取，测试保持确定性）
const PNG_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function makeNodeApp(trust: Pick<ServerConfig, 'trustProxy' | 'trustProxyCidrs'>) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-sec-'))
  dirs.push(dir)
  const d1 = createSqliteD1(join(dir, 'app.db'))
  const kv = createSqliteKv(join(dir, 'kv.db'))
  closers.push(() => {
    kv.close()
    d1.close()
  })
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 0,
    sqlitePath: join(dir, 'app.db'),
    kvPath: join(dir, 'kv.db'),
    distDir: './dist',
    sessionTtl: 3600,
    setupToken: SETUP_TOKEN,
    initAdminUser: '',
    initAdminPassword: '',
    cacheMaxEntries: 100,
    cacheMaxBytes: 1024 * 1024,
    dataDir: dir,
    ...trust,
  }
  installGlobalCache(createResponseCache({ maxEntries: 100, maxBytes: 1024 * 1024 }).cache)
  const env: Env = assembleEnv(config, {
    db: d1.db,
    kv: kv.kv,
    assets: { fetch: async () => new Response(null, { status: 404 }) },
  })
  const app = createApp({ preMiddleware: clientIpMiddleware(config) })
  // app.request 不带 ExecutionContext 时 c.executionCtx 的 getter 会抛错，图标路由
  // 写缓存时会踩中并回落兜底图；真实运行时（node-server / Workers）恒有 ctx，
  // 这里按真实形态补一个，并把 waitUntil 的缓存写入 flush 掉保证后续读到确定状态。
  const pending: Promise<unknown>[] = []
  const executionCtx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
    passThroughOnException: () => {},
  }
  const req = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const res = await app.request(`${BASE}${path}`, init, env, executionCtx)
    await Promise.allSettled(pending.splice(0))
    return res
  }
  return { app, env, req }
}

interface ApiBody {
  code?: number
  data?: Record<string, unknown>
}

function jsonInit(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }
}

type NodeHarness = ReturnType<typeof makeNodeApp>

async function api(
  harness: NodeHarness,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: ApiBody }> {
  const res = await harness.req(path, init)
  const body = (await res.json().catch(() => ({}))) as ApiBody
  return { status: res.status, body }
}

async function installAndLogin(harness: NodeHarness): Promise<string> {
  const installed = await api(harness, '/api/install',
    jsonInit({ username: 'admin', password: ADMIN_PW }, { 'X-Setup-Token': SETUP_TOKEN, Origin: BASE }))
  expect(installed.body.code).toBe(0)
  const login = await api(harness, '/api/login', jsonInit({ username: 'admin', password: ADMIN_PW }))
  expect(login.body.code).toBe(0)
  return login.body.data!.token as string
}

describe('IP 信任边界（resolveClientIp 纯函数）', () => {
  const trusted = { trustProxy: true, trustProxyCidrs: [] as string[] }
  const untrusted = { trustProxy: false, trustProxyCidrs: [] as string[] }
  const headers = (record: Record<string, string>) => new Headers(record)

  it('对端不可信时忽略全部转发头', () => {
    const h = headers({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7, 203.0.113.9' })
    expect(resolveClientIp('192.0.2.10', h, untrusted)).toBe('192.0.2.10')
  })

  it('可信对端优先采信 X-Real-IP（代理覆盖写）', () => {
    const h = headers({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })
    expect(resolveClientIp('127.0.0.1', h, trusted)).toBe('203.0.113.9')
  })

  it('无 X-Real-IP 时从 XFF 右端剥离可信跳', () => {
    const h = headers({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9, 127.0.0.1' })
    expect(resolveClientIp('127.0.0.1', h, trusted)).toBe('203.0.113.9')
  })

  it('CIDR 白名单外的对端不被信任', () => {
    const cfg = { trustProxy: true, trustProxyCidrs: ['10.0.0.0/8'] }
    const h = headers({ 'x-real-ip': '203.0.113.9' })
    expect(resolveClientIp('192.0.2.10', h, cfg)).toBe('192.0.2.10')
    expect(resolveClientIp('10.1.2.3', h, cfg)).toBe('203.0.113.9')
  })

  it('IPv4-mapped IPv6 对端归一化后再匹配', () => {
    const h = headers({ 'x-real-ip': '203.0.113.9' })
    expect(resolveClientIp('::ffff:127.0.0.1', h, trusted)).toBe('203.0.113.9')
    expect(ipMatches('::ffff:10.0.0.5', '10.0.0.0/8')).toBe(true)
    expect(ipMatches('2001:db8::1', '2001:db8::/32')).toBe(true)
    expect(ipMatches('2001:db9::1', '2001:db8::/32')).toBe(false)
  })
})

describe('登录限流（全栈，Node 运行时 + 可信代理）', () => {
  it('同一 X-Real-IP 轮换伪造 XFF：第 6 次触发 1004；换真实 IP 不受影响', async () => {
    const h = makeNodeApp({ trustProxy: true, trustProxyCidrs: [] })
    await installAndLogin(h)

    const attempt = (realIp: string, n: number) =>
      api(h, '/api/login', jsonInit(
        { username: 'admin', password: 'wrong-password-xx' },
        { 'X-Real-IP': realIp, 'X-Forwarded-For': `10.6.6.${n}, ${realIp}`, 'cf-connecting-ip': `8.8.8.${n}` },
      ))

    for (let i = 1; i <= 5; i++) {
      const { body } = await attempt('203.0.113.50', i)
      expect(body.code).toBe(1001)
    }
    const sixth = await attempt('203.0.113.50', 6)
    expect(sixth.body.code).toBe(1004)

    const other = await attempt('203.0.113.99', 1)
    expect(other.body.code).toBe(1001)
  })
})

describe('私密图标与 icon_epoch（全栈，Node 运行时）', () => {
  it('匿名只得兜底图、授权 key 取真图；图标写入推进 icon_epoch', async () => {
    const h = makeNodeApp({ trustProxy: false, trustProxyCidrs: [] })
    const token = await installAndLogin(h)
    const auth = { Authorization: `Bearer ${token}` }

    const category = await api(h, '/api/categories', jsonInit({ title: '安全测试分类' }, auth))
    const categoryId = category.body.data!.id as number
    const created = await api(h, '/api/bookmarks', jsonInit(
      { category_id: categoryId, title: '图标书签', url: 'https://example.com', icon: PNG_ICON }, auth))
    const bookmarkId = created.body.data!.id as number

    const publicData = async () => (await api(h, '/api/public/data')).body.data as unknown as { icon_epoch: number }
    const dbEpoch = async () => {
      const row = await h.env.DB.prepare("SELECT value FROM settings WHERE key = 'icon_epoch'").first<{ value: string }>()
      return Number(row?.value ?? '0')
    }
    const epochBefore = await dbEpoch()

    const iconBytes = async (path: string) => {
      const res = await h.req(path)
      return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) }
    }

    // 公开状态：匿名可取真图，且这次取图把 data-uri 图标写入了服务端缓存（DB 计数即时递增）
    const publicIcon = await iconBytes(`/api/icon/${bookmarkId}`)
    expect(publicIcon.status).toBe(200)
    expect(publicIcon.bytes.length).toBeGreaterThan(0)
    const epochAfterIconWrite = await dbEpoch()
    expect(epochAfterIconWrite).toBeGreaterThan(epochBefore)

    // 设为私密（书签 PUT 为全量更新）——这次真实变更会把新 epoch 带进公开数据载荷
    const priv = await api(h, `/api/bookmarks/${bookmarkId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ category_id: categoryId, title: '图标书签', url: 'https://example.com', icon: PNG_ICON, is_private: true }),
    })
    expect(priv.body.code).toBe(0)
    expect((await publicData()).icon_epoch).toBeGreaterThanOrEqual(epochAfterIconWrite)

    const anonIcon = await iconBytes(`/api/icon/${bookmarkId}`)
    expect(anonIcon.bytes.equals(publicIcon.bytes)).toBe(false)

    const grant = await api(h, '/api/icon-access', { headers: auth })
    expect(grant.body.code).toBe(0)
    const key = grant.body.data!.key as string
    const grantedIcon = await iconBytes(`/api/icon/${bookmarkId}?key=${encodeURIComponent(key)}`)
    expect(grantedIcon.status).toBe(200)
    expect(grantedIcon.bytes.equals(publicIcon.bytes)).toBe(true)

    const badKeyIcon = await iconBytes(`/api/icon/${bookmarkId}?key=not-a-real-grant`)
    expect(badKeyIcon.bytes.equals(publicIcon.bytes)).toBe(false)
  })
})

describe('安装一次性（全栈，Node 运行时）', () => {
  it('装完后带正确 token 也不能再装；错误 token 在未装时同样被拒', async () => {
    const h = makeNodeApp({ trustProxy: false, trustProxyCidrs: [] })
    await installAndLogin(h)

    const again = await api(h, '/api/install',
      jsonInit({ username: 'second', password: 'second-password' }, { 'X-Setup-Token': SETUP_TOKEN, Origin: BASE }))
    expect(again.body.code).not.toBe(0)
    const loginSecond = await api(h, '/api/login', jsonInit({ username: 'second', password: 'second-password' }))
    expect(loginSecond.body.code).not.toBe(0)

    const fresh = makeNodeApp({ trustProxy: false, trustProxyCidrs: [] })
    const wrongToken = await api(fresh, '/api/install',
      jsonInit({ username: 'admin', password: ADMIN_PW }, { 'X-Setup-Token': 'wrong-token', Origin: BASE }))
    expect(wrongToken.body.code).not.toBe(0)
  })
})
