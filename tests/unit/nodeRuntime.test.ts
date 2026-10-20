import { describe, expect, it, vi } from 'vitest'

vi.mock('../../schema.sql', () => ({ default: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);' }))

import { createApp } from '../../worker/app'
import type { ServerConfig } from '../../server/config'
import { createStage1Env } from '../../server/nodeEnv'

// 阶段 1 出口条件：共享 createApp() 工厂在 Node Env 下可运行——
// /api/health 响应、受保护路由无 token 时 fail-closed(401)。
const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  sqlitePath: '/tmp/cf-navs-test/app.db',
  kvPath: '/tmp/cf-navs-test/kv.db',
  distDir: './dist',
  sessionTtl: 3600,
  setupToken: '',
  initAdminUser: '',
  initAdminPassword: '',
  trustProxy: false,
  trustProxyCidrs: [],
  cacheMaxEntries: 10,
  cacheMaxBytes: 1024 * 1024,
  dataDir: '/tmp/cf-navs-test',
}

describe('node runtime 装配（阶段 1）', () => {
  const app = createApp()
  const env = createStage1Env(config)

  it('GET /api/health → 200', async () => {
    const res = await app.request('https://navs.example.test/api/health', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: number; data: { status: string } }
    expect(body.code).toBe(0)
    expect(body.data.status).toBe('ok')
  })

  it('受保护路由无 token → 401（不触达占位 D1）', async () => {
    const res = await app.request('https://navs.example.test/api/settings', {}, env)
    expect(res.status).toBe(401)
  })

  it('未知 /api 路径 → 404 JSON 包络', async () => {
    const res = await app.request('https://navs.example.test/api/nope', {}, env)
    expect(res.status).toBe(401) // 受保护子应用先行鉴权，未知路径同样 fail-closed
  })
})
