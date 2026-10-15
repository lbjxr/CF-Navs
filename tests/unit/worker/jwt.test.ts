import { describe, expect, it } from 'vitest'
import { getJwtSecret, rotateJwtSecret, signJwt, verifyJwt } from '../../../worker/lib/jwt'

function createFakeDb(initial: Record<string, unknown> = {}): {
  db: D1Database
  values: Map<string, string>
} {
  const values = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)])
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
            results: keys.map((key) => ({ key, value: values.get(key) ?? null })),
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

describe('JWT stateless authentication utilities', () => {
  it('signs and verifies JWT tokens correctly', async () => {
    const secret = 'super-secret-key-1234567890-test'
    const payload = { username: 'admin', exp: Date.now() + 10000 }

    const token = await signJwt(payload, secret)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

    const verified = await verifyJwt(token, secret)
    expect(verified).toEqual(payload)
  })

  it('fails verification with tampered signatures or wrong secrets', async () => {
    const secret = 'super-secret-key-1234567890-test'
    const wrongSecret = 'wrong-secret-key-1234567890-test'
    const payload = { username: 'admin', exp: Date.now() + 10000 }

    const token = await signJwt(payload, secret)

    // Test verification with incorrect secret
    const verifiedWrongSecret = await verifyJwt(token, wrongSecret)
    expect(verifiedWrongSecret).toBeNull()

    // Test verification with tampered token
    const tamperedToken = token.slice(0, -3) + 'abc'
    const verifiedTampered = await verifyJwt(tamperedToken, secret)
    expect(verifiedTampered).toBeNull()
  })

  it('retrieves, generates, and rotates signing secrets in D1 database settings', async () => {
    const { db, values } = createFakeDb()

    // Key should not exist in initial mock db
    expect(values.has('jwt_secret')).toBe(false)

    // Getting secret should generate it
    const secret1 = await getJwtSecret(db)
    expect(secret1).toHaveLength(64)
    expect(values.has('jwt_secret')).toBe(true)

    // Fetching again should return cached / stored value
    const secret2 = await getJwtSecret(db)
    expect(secret2).toBe(secret1)

    // Rotating secret should change the value in D1 and cache
    const secret3 = await rotateJwtSecret(db)
    expect(secret3).toHaveLength(64)
    expect(secret3).not.toBe(secret1)

    const secret4 = await getJwtSecret(db)
    expect(secret4).toBe(secret3)
  })
})
