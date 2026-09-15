import { beforeEach, describe, expect, it } from 'vitest'
import { resetJwtSecretCache } from '../../worker/lib/jwt'
import { createSession } from '../../worker/lib/session'
import { hasSessionBinding } from '../../worker/lib/sessionStore'
import { clearAllCachedSessions, validateSession } from '../../worker/middleware/auth'
import authRoutes from '../../worker/routes/auth'
import publicRoutes from '../../worker/routes/public'
import type { Env } from '../../worker/types'

// PROB-31：`SESSION` 绑定的必选性此前三处口径不一致 ——
//   - loginRateLimit 无条件读 env.SESSION（缺绑定时抛 TypeError，兜成 code=1500）
//   - validateSession 当可选，静默跳过撤销名单检查
//   - Env.SESSION 类型却是必填
// 现在统一为：正确性依赖它的路径 fail-closed，best-effort 计数路径降级继续。

function createDb() {
  const values = new Map<string, string>()

  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              if (sql.includes('FROM settings')) {
                const keys = args.map(String)
                return {
                  results: keys.filter((key) => values.has(key)).map((key) => ({ key, value: values.get(key) })),
                }
              }
              return { results: [] }
            },
            async first() {
              if (sql.includes('FROM bookmarks')) return { id: 1 }
              return null
            },
            async run() {
              if (sql.startsWith('INSERT INTO settings')) values.set(String(args[0]), String(args[1]))
              return { success: true, meta: { changes: 1 } }
            },
          }
        },
        async all() {
          if (sql.includes('FROM settings')) {
            return { results: [...values].map(([key, value]) => ({ key, value })) }
          }
          return { results: [] }
        },
        async run() {
          return { success: true, meta: { changes: 1 } }
        },
      }
    },
    async batch(statements: Array<{ all(): Promise<unknown> }>) {
      return await Promise.all(statements.map((statement) => statement.all()))
    },
  } as unknown as D1Database
}

function createKv() {
  const store = new Map<string, string>()
  return {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string) {
      store.set(key, value)
    },
    async delete(key: string) {
      store.delete(key)
    },
  } as unknown as KVNamespace
}

beforeEach(() => {
  resetJwtSecretCache()
  clearAllCachedSessions()
})

describe('hasSessionBinding', () => {
  it('requires get, put and delete — a partial fake is not a usable binding', () => {
    // 只检查 `get` 不够：撤销名单要 put、限流要 delete，少一个会在半路抛错而不是在入口
    // 被挡住。测试里写半个假 KV 也会因此被正确判成「缺绑定」。
    expect(hasSessionBinding({ SESSION: createKv() })).toBe(true)
    expect(hasSessionBinding({})).toBe(false)
    expect(hasSessionBinding({ SESSION: undefined })).toBe(false)
    expect(hasSessionBinding({ SESSION: { get: async () => null } as unknown as KVNamespace })).toBe(false)
    expect(hasSessionBinding({
      SESSION: { get: async () => null, put: async () => { } } as unknown as KVNamespace,
    })).toBe(false)
  })
})

describe('缺 SESSION 绑定时的鉴权路径', () => {
  it('拒绝会话，而不是静默跳过撤销名单检查', async () => {
    const env = { DB: createDb(), SESSION: createKv() } as unknown as Env
    const session = await createSession(env, 'admin')

    // 绑定在位时正常通过
    clearAllCachedSessions()
    expect(await validateSession(env, session.token)).toMatchObject({ username: 'admin' })

    // 同一个 token、同一个 D1（jwt_secret 相同、签名照样验得过），只是绑定不见了。
    // 静默跳过的话这里会返回会话，等于「撤销名单不存在」而调用方无从得知。
    clearAllCachedSessions()
    expect(await validateSession({ DB: env.DB } as unknown as Env, session.token)).toBeNull()
  })

  it('受保护端点因此返回 401，不返回数据', async () => {
    const env = { DB: createDb(), SESSION: createKv() } as unknown as Env
    const session = await createSession(env, 'admin')
    clearAllCachedSessions()

    const response = await authRoutes.request(
      'https://nav.example.com/me',
      { headers: { Authorization: `Bearer ${session.token}` } },
      { DB: env.DB } as unknown as Env,
    )

    expect(response.status).toBe(401)
  })
})

describe('缺 SESSION 绑定时的登录路径', () => {
  it('给出可定位的错误，而不是 TypeError 兜成的通用 500', async () => {
    // 改造前 loginRateLimit 直接 `env.SESSION.get(...)`，缺绑定时抛 TypeError，
    // 由全局 onError 兜成 `internal server error`——运维看不出是绑定问题。
    const response = await authRoutes.request(
      'https://nav.example.com/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'whatever' }),
      },
      { DB: createDb() } as unknown as Env,
    )

    const body = await response.json() as { code: number; msg: string }
    expect(body.code).toBe(1500)
    expect(body.msg).toContain('SESSION')
    expect(body.msg).not.toBe('internal server error')
  })
})

describe('缺 SESSION 绑定时的 best-effort 路径', () => {
  it('点击计数继续工作，不因为限流失效而拒绝匿名点击', async () => {
    // 与鉴权路径刻意不同：限流失效只是计数偏高，而拒绝匿名点击会让公开首页坏掉。
    const response = await publicRoutes.request(
      'https://nav.example.com/public/bookmarks/1/click',
      { method: 'POST' },
      { DB: createDb() } as unknown as Env,
    )

    expect(response.status).toBe(200)
    expect((await response.json() as { code: number }).code).toBe(0)
  })
})
