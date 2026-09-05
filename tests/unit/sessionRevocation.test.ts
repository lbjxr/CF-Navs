import { beforeEach, describe, expect, it } from 'vitest'
import { resetJwtSecretCache } from '../../worker/lib/jwt'
import { createSession } from '../../worker/lib/session'
import { isSessionRevoked, revokeSession, revokedSessionKey } from '../../worker/lib/sessionRevocation'
import { clearAllCachedSessions, validateSession } from '../../worker/middleware/auth'
import authRoutes from '../../worker/routes/auth'
import type { Env } from '../../worker/types'

// 只保留本用例需要的行为：settings 表的批量读与单键写（jwt_secret 的读写路径）。
function createDb() {
  const values = new Map<string, string>()

  return {
    prepare(sql: string) {
      let bound: unknown[] = []
      const statement = {
        bind(...params: unknown[]) {
          bound = params
          return statement
        },
        async all() {
          return { results: (bound as string[]).map((key) => ({ key, value: values.get(key) ?? null })) }
        },
        async run() {
          if (sql.includes('INSERT INTO settings')) values.set(String(bound[0]), String(bound[1]))
          return { success: true }
        },
      }
      return statement
    },
  } as unknown as D1Database
}

function createKv() {
  const store = new Map<string, string>()
  const puts: Array<{ key: string; ttl?: number }> = []

  return {
    puts,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      store.set(key, value)
      puts.push({ key, ttl: options?.expirationTtl })
    },
    async delete(key: string) {
      store.delete(key)
    },
  } as unknown as KVNamespace & { puts: Array<{ key: string; ttl?: number }> }
}

function createEnv() {
  return { DB: createDb(), SESSION: createKv() } as unknown as Env & {
    SESSION: ReturnType<typeof createKv>
  }
}

beforeEach(() => {
  resetJwtSecretCache()
  clearAllCachedSessions()
})

describe('session revocation', () => {
  it('rejects a token after it is revoked', async () => {
    // 这是本改动的核心：会话是无状态 JWT，之前 logout 只清了 isolate 内存缓存，
    // token 在 exp 之前照样能调所有后台接口。
    const env = createEnv()
    const session = await createSession(env, 'admin')

    expect(await validateSession(env, session.token)).toMatchObject({ username: 'admin' })

    await revokeSession(env.SESSION, session.token, session.expires_at)
    clearAllCachedSessions()

    expect(await validateSession(env, session.token)).toBeNull()
  })

  it('leaves other sessions alone', async () => {
    const env = createEnv()
    const first = await createSession(env, 'admin')
    const second = await createSession(env, 'admin')

    // 没有 jti 时同一毫秒的两次登录会签出逐字节相同的 token，
    // 「撤销这台设备」的语义就不成立了。
    expect(first.token).not.toBe(second.token)

    await revokeSession(env.SESSION, first.token, first.expires_at)
    clearAllCachedSessions()

    expect(await validateSession(env, first.token)).toBeNull()
    expect(await validateSession(env, second.token)).toMatchObject({ username: 'admin' })
  })

  it('keys on the token digest, never the raw token', async () => {
    // KV 被 dump 时不该连带泄露一批仍在有效期内的 token
    const token = 'header.payload.signature'
    const key = await revokedSessionKey(token)

    expect(key.startsWith('revoked:')).toBe(true)
    expect(key).not.toContain(token)
    expect(key.slice('revoked:'.length)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('bounds the tombstone by the token lifetime', async () => {
    const kv = createKv()
    const now = Date.now()

    await revokeSession(kv, 'token-a', now + 3600_000, now)
    expect(kv.puts[0].ttl).toBe(3600)

    // KV 的 expirationTtl 下限是 60 秒
    await revokeSession(kv, 'token-b', now + 5_000, now)
    expect(kv.puts[1].ttl).toBe(60)
  })

  it('does not write a tombstone for an already expired token', async () => {
    const kv = createKv()
    const now = Date.now()

    await revokeSession(kv, 'token-c', now - 1, now)
    expect(kv.puts).toHaveLength(0)
    expect(await isSessionRevoked(kv, 'token-c')).toBe(false)
  })

  it('serves the memory cache without a KV read', async () => {
    // 撤销检查只在内存缓存未命中时走 KV。代价是别的 isolate 上的 logout
    // 最多 15 秒后才生效——这个窗口是刻意换来的，不是漏洞。
    const env = createEnv()
    const session = await createSession(env, 'admin')

    await validateSession(env, session.token)
    await revokeSession(env.SESSION, session.token, session.expires_at)

    expect(await validateSession(env, session.token)).toMatchObject({ username: 'admin' })
  })
})

describe('POST /api/logout', () => {
  async function logout(env: Env, token: string) {
    return authRoutes.request(
      'https://example.com/logout',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      env,
    )
  }

  it('makes the token unusable afterwards', async () => {
    // scripts/smoke-test.mjs 从第一个提交起就断言「登出后 token 失效 → 401」，
    // 但会话在 a296e74 改成无状态 JWT 后这条断言实际一直是失败的（CI 不跑冒烟测试）。
    // 这个用例把它搬进单测，确保不再回潮。
    const env = createEnv()
    const session = await createSession(env, 'admin')

    const response = await logout(env, session.token)
    expect(response.status).toBe(200)

    clearAllCachedSessions()
    expect(await validateSession(env, session.token)).toBeNull()
  })

  it('reports the revocation as done when the tombstone lands', async () => {
    const env = createEnv()
    const session = await createSession(env, 'admin')

    const body = await (await logout(env, session.token)).json()
    expect(body).toEqual({ code: 0, msg: 'ok', data: { revoked: true } })
  })

  it('still succeeds but reports the failure when the session store is unavailable', async () => {
    // KV 挂了不该让用户卡在登录态里退不出去：前端仍会清本地登录态，
    // token 只是回到改动前的状态。但接口不能谎称撤销成功——共享设备上的用户
    // 会以为已经退出，而 token 还能用到 exp。
    const env = createEnv()
    const session = await createSession(env, 'admin')
    // 假实现必须提供 get/put/delete 三个方法：真实 KVNamespace 一定有它们，少写一个
    // 就会被绑定判定当成「缺绑定」，测出的是 store_unconfigured 而不是这条要测的写失败。
    const broken = {
      ...env,
      SESSION: {
        async get() { return null },
        async put() { throw new Error('kv down') },
        async delete() {},
      },
    } as unknown as Env

    const response = await logout(broken, session.token)
    expect(response.status).toBe(200)
    expect((await response.json() as { data: unknown }).data).toEqual({
      revoked: false,
      reason: 'store_unavailable',
    })
  })

  it('reports the missing binding when the deployment has no session store', async () => {
    // 撤销被整体跳过，和「写失败」的后果一样但原因不同，前端要能分辨。
    //
    // PROB-31 之后这条路径只在一个窄窗口里可达：createSession 会把 token 写进 isolate
    // 内存缓存，validateSession 命中缓存时提前返回、不复查绑定，所以「验过 → 绑定被移除
    // → 15 秒内 logout」能走到这里。缓存过期后 authRequired 会直接 401。
    const env = createEnv()
    const session = await createSession(env, 'admin')
    const unbound = { DB: env.DB } as unknown as Env

    const response = await logout(unbound, session.token)
    expect(response.status).toBe(200)
    expect((await response.json() as { data: unknown }).data).toEqual({
      revoked: false,
      reason: 'store_unconfigured',
    })
  })

  it('rejects a logout without a valid token', async () => {
    const env = createEnv()
    const response = await authRoutes.request(
      'https://example.com/logout',
      { method: 'POST' },
      env,
    )

    expect(response.status).toBe(401)
  })
})
