import { beforeEach, describe, expect, it, vi } from 'vitest'
import recoverRoutes, { isValidRecoverPassword } from '../../../worker/routes/recover'
import { resetJwtSecretCache } from '../../../worker/lib/jwt'
import type { Env } from '../../../worker/types'

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

interface RateRow {
  count: number
  resetAt: number
}

class FakeStatement {
  private args: unknown[] = []
  constructor(private readonly sql: string, private readonly db: FakeDb) { }
  bind(...args: unknown[]): this {
    this.args = args
    return this
  }
  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    return this.db.exec(this.sql, this.args)
  }
  async first<T = unknown>(): Promise<T | null> {
    return this.db.queryFirst<T>(this.sql, this.args)
  }
  async all<T = unknown>(): Promise<{ results: T[] }> {
    return this.db.queryAll<T>(this.sql, this.args)
  }
}

class FakeDb {
  readonly settings: Map<string, string>
  readonly rateLimits = new Map<string, RateRow>()

  constructor(seed: Record<string, unknown> = {}) {
    this.settings = new Map()
    for (const [key, value] of Object.entries(seed)) {
      this.settings.set(key, JSON.stringify(value))
    }
  }

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this)
  }

  async batch(statements: FakeStatement[]): Promise<unknown[]> {
    const out: unknown[] = []
    for (const s of statements) out.push(await s.run())
    return out
  }

  exec(sql: string, args: unknown[]): { success: boolean; meta: { changes: number } } {
    if (sql.includes('CREATE TABLE IF NOT EXISTS install_rate_limits')) {
      return { success: true, meta: { changes: 0 } }
    }
    if (sql.includes('DELETE FROM install_rate_limits')) {
      this.rateLimits.delete(args[0] as string)
      return { success: true, meta: { changes: 1 } }
    }
    if (sql.includes('INSERT INTO settings')) {
      const [key, value] = args as [string, string]
      this.settings.set(key, value)
      return { success: true, meta: { changes: 1 } }
    }
    throw new Error(`unhandled exec sql: ${sql}`)
  }

  queryFirst<T>(sql: string, args: unknown[]): T | null {
    if (sql.includes('SELECT 1 AS ok')) {
      return { ok: 1 } as unknown as T
    }
    if (sql.includes('SELECT count, reset_at AS resetAt FROM install_rate_limits')) {
      return (this.rateLimits.get(args[0] as string) ?? null) as T | null
    }
    if (sql.includes('INSERT INTO install_rate_limits')) {
      const key = args[0] as string
      const newResetAt = args[1] as number
      const now = args[2] as number
      const existing = this.rateLimits.get(key)
      const row: RateRow =
        existing && existing.resetAt > now
          ? { count: existing.count + 1, resetAt: existing.resetAt }
          : { count: 1, resetAt: newResetAt }
      this.rateLimits.set(key, row)
      return { count: row.count, resetAt: row.resetAt } as unknown as T
    }
    throw new Error(`unhandled queryFirst sql: ${sql}`)
  }

  queryAll<T>(sql: string, args: unknown[]): { results: T[] } {
    const wanted = new Set(args as string[])
    const rows = [...this.settings.entries()]
      .filter(([key]) => wanted.has(key))
      .map(([key, value]) => ({ key, value }))
    return { results: rows as unknown as T[] }
  }
}

function createKv(overrides: Partial<KVNamespace> = {}): KVNamespace {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => void store.set(key, value)),
    delete: vi.fn(async (key: string) => void store.delete(key)),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cacheStatus: null })),
    ...overrides,
  } as unknown as KVNamespace
}

function createEnv(db: FakeDb, session: KVNamespace | null, overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    SESSION: session as unknown as KVNamespace,
    ASSETS: {} as unknown as Fetcher,
    INIT_ADMIN_USER: '',
    INIT_ADMIN_PASSWORD: '',
    SETUP_TOKEN: 'setup-secret',
    SESSION_TTL: '3600',
    ...overrides,
  }
}

function installedSeed(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    admin_username: 'admin',
    admin_password: 'oldsalt:oldhash',
    admin_bootstrap_username: 'admin',
    admin_bootstrap_password: 'oldsalt:oldhash',
    installation_schema_version: 1,
    jwt_secret: 'old-secret',
    ...extra,
  }
}

function post(
  env: Env,
  body: unknown,
  headers: Record<string, string> = { 'X-Setup-Token': 'setup-secret' },
): Promise<Response> {
  return recoverRoutes.request(
    '/recover',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    env,
  )
}

beforeEach(() => resetJwtSecretCache())

describe('isValidRecoverPassword', () => {
  it('accepts 12-256 chars with >=2 character classes (unified with /install)', () => {
    expect(isValidRecoverPassword('abcd1234efgh')).toBe(true) // 12, lower+digit
    expect(isValidRecoverPassword('Abcdefghijk1')).toBe(true) // 12, upper+lower+digit
    expect(isValidRecoverPassword('abcd12345678x')).toBe(true) // 13, lower+digit
  })
  it('rejects out-of-range length', () => {
    expect(isValidRecoverPassword('abc12345678')).toBe(false) // 11
    expect(isValidRecoverPassword('a1' + 'a'.repeat(255))).toBe(false) // 257
  })
  it('rejects single character class', () => {
    expect(isValidRecoverPassword('123456789012')).toBe(false) // digits only
    expect(isValidRecoverPassword('abcdefghijkl')).toBe(false) // lowercase only
  })
  it('rejects non-string and control chars', () => {
    expect(isValidRecoverPassword(undefined)).toBe(false)
    expect(isValidRecoverPassword('abcd12\u0007')).toBe(false)
  })
})

describe('POST /api/recover', () => {
  it('resets password with correct token, keeps username, rotates jwt secret', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    const res = await post(env, { password: 'abcd1234efgh' })
    const json = await res.json<any>()

    expect(res.status).toBe(200)
    expect(json.code).toBe(0)
    expect(json.data.username).toBe('admin')
    expect(typeof json.data.token).toBe('string')
    // 用户名不变
    expect(JSON.parse(db.settings.get('admin_username')!)).toBe('admin')
    // admin_password 更新为新哈希；admin_bootstrap_password 刻意不动（避免 INIT 回滚）
    const newPw = JSON.parse(db.settings.get('admin_password')!)
    expect(newPw).not.toBe('oldsalt:oldhash')
    expect(JSON.parse(db.settings.get('admin_bootstrap_password')!)).toBe('oldsalt:oldhash')
    // bootstrap 用户名保持原值
    expect(JSON.parse(db.settings.get('admin_bootstrap_username')!)).toBe('admin')
    // jwt secret 已轮换
    expect(JSON.parse(db.settings.get('jwt_secret')!)).not.toBe('old-secret')
  })

  it('ignores a username field in the body', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    const res = await post(env, { password: 'abcd1234efgh', username: 'evil' })
    expect(res.status).toBe(200)
    expect(JSON.parse(db.settings.get('admin_username')!)).toBe('admin')
    expect(db.settings.has('evil')).toBe(false)
  })

  it('rejects wrong/missing token with 401 and no write', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    const res = await post(env, { password: 'abcd1234' }, { 'X-Setup-Token': 'nope' })
    expect(res.status).toBe(401)
    expect((await res.json<any>()).code).toBe(1001)
    expect(JSON.parse(db.settings.get('admin_password')!)).toBe('oldsalt:oldhash')
  })

  it('rate-limits after repeated failures, then blocks even a correct token', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    for (let i = 0; i < 5; i++) {
      await post(env, { password: 'abcd1234' }, { 'X-Setup-Token': 'nope' })
    }
    const res = await post(env, { password: 'abcd1234' }) // correct token now
    expect(res.status).toBe(200)
    expect((await res.json<any>()).code).toBe(1004) // RATE_LIMITED
    // 仍未写入
    expect(JSON.parse(db.settings.get('admin_password')!)).toBe('oldsalt:oldhash')
  })

  it('keeps recover rate-limit key isolated from install', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    await post(env, { password: 'abcd1234' }, { 'X-Setup-Token': 'nope' })
    expect([...db.rateLimits.keys()]).toEqual(['recover:unknown'])
    expect(db.rateLimits.has('install:unknown')).toBe(false)
  })

  it('rejects cross-origin with 403', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, createKv())
    const res = await post(env, { password: 'abcd1234' }, {
      'X-Setup-Token': 'setup-secret',
      Origin: 'https://evil.example',
    })
    expect(res.status).toBe(403)
    expect(JSON.parse(db.settings.get('admin_password')!)).toBe('oldsalt:oldhash')
  })

  it('rejects invalid password with BAD_REQUEST and no write', async () => {
    for (const password of ['abc12345678', 'a'.repeat(257), '123456789012', 'abcdefghijkl']) {
      const db = new FakeDb(installedSeed())
      const env = createEnv(db, createKv())
      const res = await post(env, { password })
      expect(res.status).toBe(200)
      expect((await res.json<any>()).code).toBe(1002)
      expect(JSON.parse(db.settings.get('admin_password')!)).toBe('oldsalt:oldhash')
    }
  })

  it('rejects recovery on a not-installed instance', async () => {
    const db = new FakeDb({ jwt_secret: 'old-secret' }) // no admin creds / marker
    const env = createEnv(db, createKv())
    const res = await post(env, { password: 'abcd1234' })
    expect(res.status).toBe(200)
    const json = await res.json<any>()
    expect(json.code).toBe(1002)
    expect(json.msg).toBe('not installed')
  })

  it('fails closed when SESSION binding is missing', async () => {
    const db = new FakeDb(installedSeed())
    const env = createEnv(db, null)
    const res = await post(env, { password: 'abcd1234efgh' })
    expect(res.status).toBe(200)
    expect((await res.json<any>()).code).toBe(1500)
    expect(JSON.parse(db.settings.get('admin_password')!)).toBe('oldsalt:oldhash')
  })
})
