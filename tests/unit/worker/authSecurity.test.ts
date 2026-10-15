import { describe, expect, it } from 'vitest'
import { extractBearerToken } from '../../../worker/middleware/auth'
import { getSessionTtlSeconds, isValidNewPassword } from '../../../worker/routes/auth'

describe('extractBearerToken', () => {
  it('returns null for null, undefined, or empty Authorization', () => {
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken(undefined)).toBeNull()
    expect(extractBearerToken('')).toBeNull()
  })

  it('returns null when Authorization lacks Bearer prefix', () => {
    expect(extractBearerToken('Basic abc')).toBeNull()
    expect(extractBearerToken('token123')).toBeNull()
  })

  it('extracts the token after Bearer prefix (case-insensitive)', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123')
    expect(extractBearerToken('bearer xyz')).toBe('xyz')
  })

  it('trims whitespace around the token', () => {
    expect(extractBearerToken('Bearer   token   ')).toBe('token')
    expect(extractBearerToken('Bearer\ttoken')).toBe('token')
  })

  it('returns null when Bearer is present but token is empty', () => {
    expect(extractBearerToken('Bearer')).toBeNull()
    expect(extractBearerToken('Bearer  ')).toBeNull()
  })
})

describe('getSessionTtlSeconds', () => {
  it('returns the default TTL for undefined, empty, or NaN input', () => {
    // DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60 = 604800
    expect(getSessionTtlSeconds(undefined)).toBe(604800)
    expect(getSessionTtlSeconds('')).toBe(604800)
    expect(getSessionTtlSeconds('not-a-number')).toBe(604800)
  })

  it('parses and returns valid positive integers', () => {
    expect(getSessionTtlSeconds('3600')).toBe(3600)
    expect(getSessionTtlSeconds('86400')).toBe(86400)
  })

  it('returns default for zero or negative values', () => {
    expect(getSessionTtlSeconds('0')).toBe(604800)
    expect(getSessionTtlSeconds('-1')).toBe(604800)
  })

  it('returns default for non-integer finite values (truncated)', () => {
    // parseInt('12.5') → 12 which is > 0
    expect(getSessionTtlSeconds('12.5')).toBe(12)
  })
})

describe('isValidNewPassword', () => {
  it('returns false for non-string values', () => {
    expect(isValidNewPassword(null)).toBe(false)
    expect(isValidNewPassword(undefined)).toBe(false)
    expect(isValidNewPassword(123)).toBe(false)
    expect(isValidNewPassword({})).toBe(false)
  })

  it('returns false for passwords shorter than 8 characters', () => {
    expect(isValidNewPassword('')).toBe(false)
    expect(isValidNewPassword('abc')).toBe(false)
    expect(isValidNewPassword('1234567')).toBe(false)
  })

  it('returns true for passwords between 8 and 256 characters', () => {
    expect(isValidNewPassword('12345678')).toBe(true)
    expect(isValidNewPassword('a'.repeat(8))).toBe(true)
    expect(isValidNewPassword('a'.repeat(256))).toBe(true)
  })

  it('returns false for passwords longer than 256 characters', () => {
    expect(isValidNewPassword('a'.repeat(257))).toBe(false)
  })
})
