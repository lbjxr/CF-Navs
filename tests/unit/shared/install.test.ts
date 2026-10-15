import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ApiResponse, InstallStatusResp, LoginResp } from '../../../shared/types'
import { verifyPassword } from '../../../worker/lib/crypto'
import { resetJwtSecretCache } from '../../../worker/lib/jwt'

vi.mock('../../../schema.sql', () => ({ default: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);' }))

import installRoutes from '../../../worker/routes/install'
import type { Env } from '../../../worker/types'

type BoundStatement = { sql: string; params: unknown[] }

class FakeDb {
  settings = new Map<string, string>()
  rateLimits = new Map<string, { count: number; resetAt: number }>()
  schemaExists = false
  probeCount = 0
  executedSql: string[] = []
  failProbe = false
  failSchemaBatch = false
  failCredentialBatchOnce = false
  failClaimDeleteOnce = false
  failSettingsWrite = false

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) this.settings.set(key, JSON.stringify(value))
    this.schemaExists = Object.keys(initial).length > 0
  }

  prepare(sql: string): D1PreparedStatement {
    let params: unknown[] = []
    const statement = {
      get sql() { return sql },
      get params() { return params },
      bind: (...next: unknown[]) => { params = next; return statement },
      first: async () => {
        if (sql.includes('SELECT 1 AS ok')) {
          this.probeCount += 1
          if (this.failProbe) throw new Error('D1 unavailable')
          return { ok: 1 }
        }
        if (sql.includes('SELECT count, reset_at AS resetAt')) {
          return this.rateLimits.get(String(params[0])) ?? null
        }
        if (sql.includes('INSERT INTO install_rate_limits')) {
          const key = String(params[0])
          const nextResetAt = Number(params[1])
          const now = Number(params[2])
          const current = this.rateLimits.get(key)
          const next = !current || current.resetAt <= now
            ? { count: 1, resetAt: nextResetAt }
            : { count: current.count + 1, resetAt: current.resetAt }
          this.rateLimits.set(key, next)
          return next
        }
        return null
      },
      all: async () => {
        if (sql.includes('SELECT key, value FROM settings')) {
          if (!this.schemaExists) throw new Error('no such table: settings')
          const keys = params as string[]
          return { results: keys.filter((key) => this.settings.has(key)).map((key) => ({ key, value: this.settings.get(key) ?? null })) }
        }
        return { results: [] }
      },
      run: async () => {
        this.executedSql.push(sql)
        const changes = this.apply({ sql, params })
        return { success: true, meta: { changes } }
      },
    }
    return statement as unknown as D1PreparedStatement
  }

  async exec(sql: string): Promise<D1ExecResult> {
    this.executedSql.push(sql)
    throw new Error('installer must not use D1 exec for formatted SQL')
  }

  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const bound = statements as unknown as BoundStatement[]
    const isSchemaBatch = bound.some(({ sql }) => sql.includes('CREATE TABLE settings'))
    this.executedSql.push(...bound.map(({ sql }) => sql))
    if (isSchemaBatch && this.failSchemaBatch) throw new Error('schema failed')
    if (!isSchemaBatch && this.failCredentialBatchOnce) {
      this.failCredentialBatchOnce = false
      throw new Error('batch failed')
    }
    if (isSchemaBatch) this.schemaExists = true
    return bound.map((statement) => ({
      success: true,
      meta: { changes: this.apply(statement) },
    } as D1Result))
  }

  private apply({ sql, params }: BoundStatement): number {
    if (sql.includes('INSERT OR IGNORE INTO settings')) {
      const key = String(params[0])
      if (this.settings.has(key)) return 0
      this.settings.set(key, String(params[1]))
      return 1
    }
    if (sql.includes('UPDATE settings SET value')) {
      const nextValue = String(params[0])
      const key = String(params[1])
      const expectedValue = String(params[2])
      if (this.settings.get(key) !== expectedValue) return 0
      this.settings.set(key, nextValue)
      return 1
    }
    if (sql.includes('DELETE FROM install_rate_limits')) {
      return this.rateLimits.delete(String(params[0])) ? 1 : 0
    }
    if (sql.includes('DELETE FROM settings')) {
      const key = String(params[0])
      const expectedValue = String(params[1])
      if (this.failClaimDeleteOnce && key === 'admin_username') {
        this.failClaimDeleteOnce = false
        throw new Error('claim cleanup failed')
      }
      if (this.settings.get(key) !== expectedValue) return 0
      this.settings.delete(key)
      return 1
    }
    if (sql.includes('INSERT INTO settings')) {
      if (this.failSettingsWrite && params[0] === 'jwt_secret') {
        throw new Error('D1 write failed')
      }
      this.settings.set(String(params[0]), String(params[1]))
      return 1
    }
    return 0
  }
}

function createKv(options: { failGet?: boolean; failPut?: boolean; failDelete?: boolean } = {}) {
  const values = new Map<string, string>()
  const puts: Array<{ key: string; value: string; ttl?: number }> = []
  const kv = {
    async get(key: string) {
      if (options.failGet) throw new Error('KV unavailable')
      return values.get(key) ?? null
    },
    async put(key: string, value: string, putOptions?: { expirationTtl?: number }) {
      if (options.failPut) throw new Error('KV unavailable')
      values.set(key, value)
      puts.push({ key, value, ttl: putOptions?.expirationTtl })
    },
    async delete(key: string) {
      if (options.failDelete) throw new Error('KV unavailable')
      values.delete(key)
    },
  } as unknown as KVNamespace
  return { kv, puts, values }
}

function createEnv(db: FakeDb, kv = createKv(), overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    SESSION: kv.kv,
    ASSETS: {} as Fetcher,
    INIT_ADMIN_USER: '',
    INIT_ADMIN_PASSWORD: '',
    SETUP_TOKEN: 'setup-secret',
    SESSION_TTL: '3600',
    ...overrides,
  }
}

async function request(env: Partial<Env>, path: string, init: RequestInit = {}) {
  const response = await installRoutes.request(`https://example.com${path}`, init, env as Env)
  return { response, body: await response.json() as ApiResponse }
}

const setupHeaders = { 'X-Setup-Token': 'setup-secret' }
function postBody(username = 'admin', password = 'secure-password'): RequestInit {
  return { method: 'POST', headers: { ...setupHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }
}

describe('installer routes', () => {
  beforeEach(() => {
    resetJwtSecretCache()
  })

  it('publishes only coarse no-store readiness without a setup token', async () => {
    const result = await request(createEnv(new FakeDb()), '/install/status')
    expect(result.response.status).toBe(200)
    expect(result.response.headers.get('Cache-Control')).toBe('no-store')
    expect(result.body).toEqual({ code: 0, msg: 'ok', data: {
      state: 'needs_install', schema_version: null, setup_token_configured: true,
    } satisfies InstallStatusResp })
  })

  it('reports a missing setup-token configuration', async () => {
    const result = await request(createEnv(new FakeDb(), createKv(), { SETUP_TOKEN: undefined }), '/install/status')
    expect(result.body.data).toEqual({ state: 'configuration_required', reason: 'setup_token_missing', schema_version: null })
  })

  it('distinguishes missing bindings', async () => {
    const db = new FakeDb()
    const noDb = await request({ ...createEnv(db), DB: undefined }, '/install/status')
    const noKv = await request({ ...createEnv(db), SESSION: undefined }, '/install/status')
    const neither = await request({ ...createEnv(db), DB: undefined, SESSION: undefined }, '/install/status')
    expect(noDb.body.data).toEqual({ state: 'bindings_missing', missing: ['DB'] })
    expect(noKv.body.data).toEqual({ state: 'bindings_missing', missing: ['SESSION'] })
    expect(neither.body.data).toEqual({ state: 'bindings_missing', missing: ['DB', 'SESSION'] })
  })

  it('distinguishes unavailable bindings', async () => {
    const badDb = new FakeDb(); badDb.failProbe = true
    const dbResult = await request(createEnv(badDb), '/install/status')
    const kvResult = await request(createEnv(new FakeDb(), createKv({ failGet: true })), '/install/status')
    expect(dbResult.body.data).toEqual({ state: 'unavailable', reason: 'database_unreachable' })
    expect(kvResult.body.data).toEqual({ state: 'unavailable', reason: 'session_store_unreachable' })
  })

  it('treats legacy credentials as installed and backfills the marker', async () => {
    const db = new FakeDb({ admin_username: 'legacy', admin_password: 'stored-hash' })
    const result = await request(createEnv(db), '/install/status')
    expect(result.body.data).toEqual({ state: 'installed', schema_version: 1 })
    expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
  })

  it('treats the installation marker as an irreversible lock', async () => {
    const markerOnly = new FakeDb({ installation_schema_version: 1 })
    const partial = new FakeDb({ installation_schema_version: 1, admin_username: 'partial' })
    const status = await request(createEnv(markerOnly), '/install/status')
    const post = await request(createEnv(partial), '/install', postBody('other', 'second-password'))
    expect(status.body.data).toEqual({ state: 'installed', schema_version: 1 })
    expect(post.body.code).toBe(1002)
    expect(JSON.parse(partial.settings.get('admin_username') ?? 'null')).toBe('partial')
    expect(partial.settings.has('admin_password')).toBe(false)
  })

  it('reports installed before requiring the session binding', async () => {
    const db = new FakeDb({ installation_schema_version: 1 })
    const missing = await request({ ...createEnv(db), SESSION: undefined }, '/install/status')
    const unavailable = await request(createEnv(db, createKv({ failGet: true })), '/install/status')
    expect(missing.body.data).toEqual({ state: 'installed', schema_version: 1 })
    expect(unavailable.body.data).toEqual({ state: 'installed', schema_version: 1 })
  })

  it('rejects cross-origin installation before checking the setup token', async () => {
    const result = await request(createEnv(new FakeDb()), '/install', {
      ...postBody(), headers: { ...postBody().headers, Origin: 'https://attacker.example' },
    })
    expect(result.response.status).toBe(403)
    expect(result.body.code).toBe(1005)
  })

  it('rate limits failed setup-token attempts atomically in D1', async () => {
    const db = new FakeDb()
    const env = createEnv(db)
    const attempts = await Promise.all(Array.from({ length: 6 }, () =>
      request(env, '/install', { ...postBody(), headers: { ...postBody().headers, 'X-Setup-Token': 'wrong' } })))
    expect(attempts.filter((result) => result.body.code === 1004).length).toBeGreaterThanOrEqual(1)
    expect(db.rateLimits.get('install:unknown')?.count).toBe(6)
    const limited = await request(env, '/install', postBody())
    expect(limited.body.code).toBe(1004)
  })

  it('validates administrator credentials', async () => {
    const env = createEnv(new FakeDb())
    const cases = [
      await request(env, '/install', { method: 'POST', headers: setupHeaders, body: '{' }),
      await request(env, '/install', postBody('admin', 'too-short')),
      await request(env, '/install', postBody(' ', 'secure-password')),
      await request(env, '/install', postBody('bad\nname', 'secure-password')),
      await request(env, '/install', postBody('a'.repeat(65), 'secure-password')),
    ]
    for (const result of cases) expect(result.body.code).toBe(1002)
  })

  it('initializes schema, stores all credential markers and creates a session', async () => {
    const db = new FakeDb(); const kv = createKv()
    const result = await request(createEnv(db, kv), '/install', postBody())
    const data = result.body.data as LoginResp
    expect(result.body.code).toBe(0)
    expect(db.executedSql).toContain('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
    expect(db.executedSql.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS install_rate_limits'))).toBe(true)
    expect(JSON.parse(db.settings.get('admin_username') ?? 'null')).toBe('admin')
    const passwordHash = JSON.parse(db.settings.get('admin_password') ?? 'null') as string
    await expect(verifyPassword('secure-password', passwordHash)).resolves.toBe(true)
    expect(db.settings.get('admin_bootstrap_username')).toBe(db.settings.get('admin_username'))
    expect(db.settings.get('admin_bootstrap_password')).toBe(db.settings.get('admin_password'))
    expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
    expect(data).toMatchObject({ username: 'admin' })
    expect(data.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('keeps the committed installation locked when session creation fails', async () => {
    const db = new FakeDb()
    db.failSettingsWrite = true
    const failed = await request(createEnv(db), '/install', postBody())
    expect(failed.body).toEqual({ code: 1500, msg: 'installation completed but session creation failed', data: null })
    expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
    const status = await request(createEnv(db), '/install/status')
    expect(status.body.data).toEqual({ state: 'installed', schema_version: 1 })
  })

  it('does not depend on KV deletion after committing credentials', async () => {
    const db = new FakeDb()
    const result = await request(createEnv(db, createKv({ failDelete: true })), '/install', postBody())
    expect(result.body.code).toBe(0)
    expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
  })

  it('does not write credentials or create a session when schema initialization fails', async () => {
    const db = new FakeDb(); const kv = createKv(); db.failSchemaBatch = true
    const result = await request(createEnv(db, kv), '/install', postBody())
    expect(result.body).toEqual({ code: 1500, msg: 'installation failed', data: null })
    expect(db.settings.has('admin_username')).toBe(false)
    expect(db.settings.has('installation_schema_version')).toBe(false)
    expect(kv.puts).toHaveLength(0)
  })

  it('recovers a transient claim after batch and cleanup failures', async () => {
    vi.useFakeTimers()
    try {
      const db = new FakeDb()
      db.failCredentialBatchOnce = true
      db.failClaimDeleteOnce = true
      const env = createEnv(db)

      const failed = await request(env, '/install', postBody('admin', 'secure-password'))
      expect(failed.body.code).toBe(1500)
      expect(JSON.parse(db.settings.get('admin_username') ?? 'null')).toMatch(/^__cf_navs_install_claim__:/)
      expect(db.settings.has('admin_password')).toBe(false)
      expect(db.settings.has('installation_schema_version')).toBe(false)

      vi.advanceTimersByTime(11 * 60 * 1000)
      const retried = await request(env, '/install', postBody('admin', 'secure-password'))

      expect(retried.body.code).toBe(0)
      expect(JSON.parse(db.settings.get('admin_username') ?? 'null')).toBe('admin')
      expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers an expired uncommitted installation claim', async () => {
    const staleClaim = `__cf_navs_install_claim__:${Date.now() - 11 * 60 * 1000}:abandoned`
    const db = new FakeDb({ admin_username: staleClaim })

    const result = await request(createEnv(db), '/install', postBody('admin', 'secure-password'))

    expect(result.body.code).toBe(0)
    expect(JSON.parse(db.settings.get('admin_username') ?? 'null')).toBe('admin')
    expect(JSON.parse(db.settings.get('installation_schema_version') ?? 'null')).toBe(1)
  })

  it('refuses repeated installation without overwriting credentials', async () => {
    const db = new FakeDb(); const env = createEnv(db)
    const first = await request(env, '/install', postBody('admin', 'first-password'))
    const storedPassword = db.settings.get('admin_password')
    const repeated = await request(env, '/install', postBody('other', 'second-password'))
    expect(first.body.code).toBe(0)
    expect(repeated.body.code).toBe(1002)
    expect(JSON.parse(db.settings.get('admin_username') ?? 'null')).toBe('admin')
    expect(db.settings.get('admin_password')).toBe(storedPassword)
    expect(db.executedSql.filter((sql) => sql.includes('CREATE TABLE settings'))).toHaveLength(1)
  })
})
