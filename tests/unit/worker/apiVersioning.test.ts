import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../schema.sql', () => ({ default: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);' }))

import app from '../../../worker/index'
import { ErrCode } from '../../../shared/types'
import type { Env } from '../../../worker/types'

function request(pathname: string, init: RequestInit = {}) {
  return app.request(`https://example.com${pathname}`, init, {} as Env)
}

// /api/v1 是同一批 handler 的别名挂载（worker/index.ts registerApiRoutes），
// 不是代码复制：下面断言两个前缀行为一致。
describe('API versioning (/api/v1 alias)', () => {
  it('serves /api/v1/health identically to /api/health', async () => {
    const legacy = await request('/api/health')
    const v1 = await request('/api/v1/health')

    expect(legacy.status).toBe(200)
    expect(v1.status).toBe(200)
    expect(await v1.json()).toEqual(await legacy.json())
  })

  it('treats unknown v1 paths exactly like unknown /api paths', async () => {
    // faviconRoutes 的无路径 use(authRequired) 会挂载成 `ALL <base>/*` 通配鉴权，
    // 因此未知 API 路径（无论哪个前缀）先命中 401 而不是 404——这是历史行为，v1 与之对等。
    const legacy = await request('/api/no-such-endpoint')
    const v1 = await request('/api/v1/no-such-endpoint')

    expect(v1.status).toBe(legacy.status)
    expect(await v1.text()).toBe(await legacy.text())
  })

  it('mounts the extension endpoints under /api/v1', async () => {
    // 登录路由存在：空 env 下 handler 内部失败走 500 包络，而不是 404
    const login = await request('/api/v1/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(login.status).not.toBe(404)

    // CORS 预检在 v1 下同样注册
    const preflight = await request('/api/v1/login', { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy()
  })

  it('keeps auth middleware on the v1 admin routes', async () => {
    const response = await request('/api/v1/admin/data')

    expect(response.status).toBe(401)
    expect((await response.json()).code).toBe(ErrCode.UNAUTHORIZED)
  })
})
