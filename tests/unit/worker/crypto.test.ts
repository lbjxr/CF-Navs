import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../../worker/lib/crypto'

describe('password crypto helpers', () => {
  it('hashes passwords with random salts and verifies only the matching password', async () => {
    const first = await hashPassword('correct horse battery staple')
    const second = await hashPassword('correct horse battery staple')

    expect(first).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(second).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(second).not.toBe(first)
    await expect(verifyPassword('correct horse battery staple', first)).resolves.toBe(true)
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false)
    await expect(verifyPassword('correct horse battery staple', 'not-a-valid-hash')).resolves.toBe(false)
  })
})
