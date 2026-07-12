import { describe, expect, it } from 'vitest'
import { ensureAdminBootstrap } from '../../worker/lib/bootstrap'
import { hashPassword, verifyPassword } from '../../worker/lib/crypto'
import type { Env } from '../../worker/types'

function createFakeDb(initial: Record<string, unknown> = {}): {
  db: D1Database
  values: Map<string, string>
} {
  const values = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  )

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = []
      const statement = {
        bind(...params: unknown[]) {
          bound = params
          return statement
        },
        async all() {
          const keys = bound as string[]
          return {
            results: keys
              .filter((key) => values.has(key))
              .map((key) => ({ key, value: values.get(key) ?? null })),
          }
        },
        async run() {
          if (sql.includes('INSERT INTO settings')) {
            values.set(String(bound[0]), String(bound[1]))
          }
          return { success: true }
        },
      }
      return statement
    },
  } as unknown as D1Database

  return { db, values }
}

function createEnv(
  db: D1Database,
  initUsername: string,
  initPassword: string,
  resetMarker?: string,
): Env {
  return {
    DB: db,
    INIT_ADMIN_USER: initUsername,
    INIT_ADMIN_PASSWORD: initPassword,
    RESET_ADMIN_CREDENTIALS: resetMarker,
    SESSION_TTL: '604800',
  } as Env
}

describe('admin bootstrap', () => {
  it('stores initial credentials and a separate bootstrap marker', async () => {
    const { db, values } = createFakeDb()
    const result = await ensureAdminBootstrap(createEnv(db, 'admin', 'first-password'))

    expect(result.username).toBe('admin')
    await expect(verifyPassword('first-password', result.passwordHash)).resolves.toBe(true)
    expect(JSON.parse(values.get('admin_bootstrap_username') ?? 'null')).toBe('admin')
    await expect(
      verifyPassword(
        'first-password',
        JSON.parse(values.get('admin_bootstrap_password') ?? 'null'),
      ),
    ).resolves.toBe(true)
  })

  it('applies changed INIT credentials without overriding later backend password changes', async () => {
    const currentPasswordHash = await hashPassword('backend-password')
    const bootstrapPasswordHash = await hashPassword('initial-password')
    const { db, values } = createFakeDb({
      admin_username: 'admin',
      admin_password: currentPasswordHash,
      admin_bootstrap_username: 'admin',
      admin_bootstrap_password: bootstrapPasswordHash,
    })

    const result = await ensureAdminBootstrap(createEnv(db, 'new-admin', 'new-password'))

    expect(result.username).toBe('new-admin')
    expect(result.resetApplied).toBe(true)
    await expect(verifyPassword('new-password', result.passwordHash)).resolves.toBe(true)
    expect(JSON.parse(values.get('admin_username') ?? 'null')).toBe('new-admin')

    const backendChangeHash = await hashPassword('changed-in-backend')
    values.set('admin_password', JSON.stringify(backendChangeHash))
    const unchanged = await ensureAdminBootstrap(createEnv(db, 'new-admin', 'new-password'))

    expect(unchanged.resetApplied).toBeUndefined()
    await expect(verifyPassword('changed-in-backend', unchanged.passwordHash)).resolves.toBe(true)
  })

  it('supports a one-time reset marker for existing databases without bootstrap markers', async () => {
    const currentPasswordHash = await hashPassword('old-password')
    const { db } = createFakeDb({
      admin_username: 'old-admin',
      admin_password: currentPasswordHash,
    })

    const result = await ensureAdminBootstrap(
      createEnv(db, 'new-admin', 'new-password', 'reset-2026-07-12'),
    )

    expect(result.username).toBe('new-admin')
    expect(result.resetApplied).toBe(true)
    await expect(verifyPassword('new-password', result.passwordHash)).resolves.toBe(true)

    const repeated = await ensureAdminBootstrap(
      createEnv(db, 'new-admin', 'new-password', 'reset-2026-07-12'),
    )
    expect(repeated.resetApplied).toBeUndefined()
  })

  it('can defer environment resets while changing the backend password', async () => {
    const currentPasswordHash = await hashPassword('current-password')
    const bootstrapPasswordHash = await hashPassword('initial-password')
    const { db } = createFakeDb({
      admin_username: 'admin',
      admin_password: currentPasswordHash,
      admin_bootstrap_username: 'admin',
      admin_bootstrap_password: bootstrapPasswordHash,
    })

    const result = await ensureAdminBootstrap(
      createEnv(db, 'admin', 'new-password'),
      { applyCredentialReset: false },
    )

    expect(result.resetApplied).toBeUndefined()
    await expect(verifyPassword('current-password', result.passwordHash)).resolves.toBe(true)
  })
})
