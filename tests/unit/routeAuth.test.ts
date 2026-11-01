import { describe, expect, it, vi } from 'vitest'

vi.mock('../../schema.sql', () => ({ default: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);' }))

import { readFileSync } from 'node:fs'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import app, { protectedApi, publicApi } from '../../worker/index'
import type { Env } from '../../worker/types'

// 代码审查第 4 项：鉴权按构造保证。受保护子应用统一 `use('*', authRequired)`，
// 这里枚举它实际注册的每条路由，逐一断言不带 token 时返回 401 / code=1001——
// 新增受保护路由自动纳入，不需要再手写「精确路径 + 通配路径」两行注册。

type RouteEntry = { method: string; path: string }

function handlerRoutes(api: { routes: RouteEntry[] }): RouteEntry[] {
  const seen = new Set<string>()
  return api.routes
    .filter((route) => route.method !== 'ALL')
    .filter((route) => {
      const key = `${route.method} ${route.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function concretePath(path: string): string {
  return path.replace(/:[A-Za-z_]+(\{[^}]*\})?/g, '1').replace(/\*/g, 'x')
}

const env = {} as Env

async function anonymous(method: string, path: string, headers: Record<string, string> = {}) {
  return await app.request(`https://navs.example.test/api${path}`, { method, headers }, env)
}

// 公开路由快照：要公开一个接口必须改这里，评审时一眼可见。
const EXPECTED_PUBLIC_ROUTES = [
  'GET /health',
  'GET /category-icon/:id',
  'GET /config',
  'GET /data/version',
  'GET /icon/:id',
  'GET /iconify/:prefix/:name',
  'GET /install/status',
  'GET /public/data',
  'OPTIONS /browser-sync/bookmarks',
  'OPTIONS /categories',
  'OPTIONS /login',
  'POST /error-report',
  'POST /install',
  'POST /login',
  'POST /public/bookmarks/:id/click',
  'POST /recover',
].sort()

describe('route auth by construction', () => {
  const protectedRoutes = handlerRoutes(protectedApi as unknown as { routes: RouteEntry[] })

  it('enumerates a meaningful protected surface', () => {
    const keys = protectedRoutes.map((route) => `${route.method} ${route.path}`)
    for (const expected of [
      'GET /admin/data', 'POST /bookmarks', 'PUT /bookmarks/:id', 'DELETE /categories/:id', 'PUT /settings',
      'POST /import', 'GET /fetch-favicon', 'GET /fetch-site-meta', 'GET /icon-access', 'GET /iconify-search',
      'POST /browser-sync/bookmarks', 'POST /logout', 'POST /password', 'GET /me',
    ]) {
      expect(keys).toContain(expected)
    }
  })

  it('rejects every protected route without a token', async () => {
    expect(protectedRoutes.length).toBeGreaterThan(20)
    for (const route of protectedRoutes) {
      const response = await anonymous(route.method, concretePath(route.path))
      expect(response.status, `${route.method} ${route.path}`).toBe(401)
      expect(await response.json(), `${route.method} ${route.path}`).toMatchObject({ code: 1001 })
    }
  })

  it('rejects a forged token on every protected route', async () => {
    const instance = createSqliteD1(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'))
    const kv = new Map<string, string>()
    const session = { get: async (key: string) => kv.get(key) ?? null, put: async (key: string, value: string) => { kv.set(key, value) }, delete: async (key: string) => { kv.delete(key) } }
    const forgedEnv = { DB: instance.db, SESSION: session } as unknown as Env
    try {
      for (const route of protectedRoutes) {
        const response = await app.request(`https://navs.example.test/api${concretePath(route.path)}`, {
          method: route.method, headers: { authorization: 'Bearer not.a.jwt' },
        }, forgedEnv)
        expect(response.status, `${route.method} ${route.path}`).toBe(401)
      }
    } finally {
      instance.close()
    }
  })

  it('keeps the public surface to the reviewed allowlist, disjoint from protected routes', () => {
    const publicKeys = handlerRoutes(publicApi as unknown as { routes: RouteEntry[] }).map((route) => `${route.method} ${route.path}`)
    expect([...publicKeys].sort()).toEqual(EXPECTED_PUBLIC_ROUTES)
    const protectedKeys = new Set(protectedRoutes.map((route) => `${route.method} ${route.path}`))
    expect(publicKeys.filter((key) => protectedKeys.has(key))).toEqual([])
  })

  it('fails closed for unknown API paths and mismatched methods', async () => {
    expect((await anonymous('GET', '/definitely-not-a-route')).status).toBe(401)
    expect((await anonymous('GET', '/login')).status).toBe(401)
  })

  it('serves public handlers without running auth', async () => {
    const health = await anonymous('GET', '/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ code: 0, data: { status: 'ok' } })
    const preflight = await anonymous('OPTIONS', '/browser-sync/bookmarks')
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const categoriesPreflight = await anonymous('OPTIONS', '/categories')
    expect(categoriesPreflight.status).toBe(204)
    expect(categoriesPreflight.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('applies pass-through headers before auth so 401s carry them', async () => {
    const sync = await anonymous('POST', '/browser-sync/bookmarks')
    expect(sync.status).toBe(401)
    expect(sync.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const categories = await anonymous('GET', '/categories')
    expect(categories.status).toBe(401)
    expect(categories.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
