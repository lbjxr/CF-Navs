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
import { createSqliteD1 as createTestD1 } from '../helpers/d1Sqlite'
import { assembleEnv } from '../../server/nodeEnv'
import type { ServerConfig } from '../../server/config'
import { createSqliteD1 as createProductionD1 } from '../../server/sqliteD1'
import { createSqliteKv } from '../../server/sqliteKv'
import { createResponseCache, installGlobalCache } from '../../server/responseCache'

const closers: Array<() => void> = []
const dirs: string[] = []
afterEach(() => {
  while (closers.length) closers.pop()!()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Worker 侧的 caches.default 替身（内存 Map 版，与其他单测的 stub 方式一致）。 */
function stubWorkerCaches(): void {
  const store = new Map<string, Response>()
  const cache = {
    async match(req: Request) {
      return store.get(req.url)?.clone()
    },
    async put(req: Request, res: Response) {
      store.set(req.url, res)
    },
    async delete(req: Request) {
      return store.delete(req.url)
    },
  }
  vi.stubGlobal('caches', { default: cache, open: async () => cache })
}

const BASE = 'https://navs.example.test'

function mapKv(): KVNamespace {
  const values = new Map<string, string>()
  return {
    async get(key: string) {
      return values.get(key) ?? null
    },
    async put(key: string, value: string) {
      values.set(key, value)
    },
    async delete(key: string) {
      values.delete(key)
    },
  } as unknown as KVNamespace
}

function workerEnv(): Env {
  const { db, close } = createTestD1('')
  closers.push(close)
  return {
    DB: db,
    SESSION: mapKv(),
    ASSETS: { fetch: async () => new Response(null, { status: 404 }) } as unknown as Fetcher,
    INIT_ADMIN_USER: '',
    INIT_ADMIN_PASSWORD: '',
    SETUP_TOKEN: 'x-setup-token',
    SESSION_TTL: '3600',
  }
}

function nodeEnv(): Env {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-xrt-'))
  dirs.push(dir)
  const d1 = createProductionD1(join(dir, 'app.db'))
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
    setupToken: 'x-setup-token',
    initAdminUser: '',
    initAdminPassword: '',
    trustProxy: false,
    trustProxyCidrs: [],
    cacheMaxEntries: 10,
    cacheMaxBytes: 1024 * 1024,
    dataDir: dir,
  }
  return assembleEnv(config, {
    db: d1.db,
    kv: kv.kv,
    assets: { fetch: async () => new Response(null, { status: 404 }) },
  })
}

interface StepResult {
  status: number
  code: unknown
}

/** 同一条业务流在两种运行时各跑一遍，收集归一化结果做差分比对。 */
async function runFlow(env: Env): Promise<Record<string, unknown>> {
  const app = createApp()
  const out: Record<string, unknown> = {}
  const call = async (
    name: string,
    path: string,
    init: RequestInit = {},
  ): Promise<{ step: StepResult; data: Record<string, unknown> }> => {
    const res = await app.request(`${BASE}${path}`, init, env)
    const body = (await res.json().catch(() => ({}))) as { code?: unknown; data?: Record<string, unknown> }
    const step = { status: res.status, code: body.code }
    out[name] = step
    return { step, data: (body.data ?? {}) as Record<string, unknown> }
  }
  const json = (body: unknown, extra: Record<string, string> = {}): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
    body: JSON.stringify(body),
  })

  await call('installStatus', '/api/install/status')
  const installed = await call('install', '/api/install',
    json({ username: 'admin', password: 'cross-runtime-pw' }, { 'X-Setup-Token': 'x-setup-token', Origin: BASE }))
  const token = installed.data.token as string
  expect(typeof token).toBe('string')

  await call('loginWrong', '/api/login', json({ username: 'admin', password: 'wrong-password-xx' }))
  const login = await call('login', '/api/login', json({ username: 'admin', password: 'cross-runtime-pw' }))
  const auth = { Authorization: `Bearer ${login.data.token as string}` }

  const category = await call('createCategory', '/api/categories', json({ title: '差分分类' }, auth))
  const categoryId = category.data.id
  await call('createBookmark', '/api/bookmarks',
    json({ category_id: categoryId, title: '差分书签', url: 'https://example.com' }, auth))

  const pub = await call('publicData', '/api/public/data')
  const pubData = pub.data as unknown as {
    categories?: Array<{ title: string }>
    bookmarks?: Array<{ title: string; url: string }>
  }
  out.publicTitles = {
    categories: (pubData.categories ?? []).map((c) => c.title),
    bookmarks: (pubData.bookmarks ?? []).map((b) => `${b.title}|${b.url}`),
  }

  await call('protectedNoToken', '/api/bookmarks')
  await call('logout', '/api/logout', { method: 'POST', headers: auth })
  await call('afterLogout', '/api/bookmarks', { headers: auth })

  return out
}

describe('跨运行时差分（阶段 7）', () => {
  it('Worker 语义（测试适配器）与 Node（生产适配器）的业务流结果一致', async () => {
    stubWorkerCaches()
    const workerResult = await runFlow(workerEnv())
    // Node 侧换上生产 responseCache 作为 caches.default（与 server/index.ts 的装配一致）
    installGlobalCache(createResponseCache({ maxEntries: 100, maxBytes: 1024 * 1024 }).cache)
    const nodeResult = await runFlow(nodeEnv())
    expect(nodeResult).toEqual(workerResult)
    // 关键点位单独确认，避免全等断言掩盖细节
    expect(workerResult.publicTitles).toEqual({
      categories: ['差分分类'],
      bookmarks: ['差分书签|https://example.com'],
    })
  })
})
