import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAX_BATCH_IDS,
  MAX_SORT_IDS,
  isNonEmptyString,
  isOptionalString,
  parseBatchIds,
  parseSortIds,
} from '../../../worker/lib/routeHelpers'

describe('route helper predicates', () => {
  it('recognizes non-empty strings', () => {
    expect(isNonEmptyString('a')).toBe(true)
    expect(isNonEmptyString('  a  ')).toBe(true)
    expect(isNonEmptyString('')).toBe(false)
    expect(isNonEmptyString('   ')).toBe(false)
    expect(isNonEmptyString(null)).toBe(false)
    expect(isNonEmptyString(1)).toBe(false)
  })

  it('accepts optional strings including explicit null', () => {
    expect(isOptionalString(undefined)).toBe(true)
    expect(isOptionalString(null)).toBe(true)
    expect(isOptionalString('')).toBe(true)
    expect(isOptionalString(0)).toBe(false)
    expect(isOptionalString([])).toBe(false)
  })
})

describe('batch id parsing', () => {
  it('deduplicates while preserving order', () => {
    expect(parseBatchIds([3, 1, 3, 2])).toEqual([3, 1, 2])
  })

  it('rejects empty, oversized and malformed lists', () => {
    expect(parseBatchIds([])).toBeNull()
    expect(parseBatchIds('nope')).toBeNull()
    expect(parseBatchIds([1, 0])).toBeNull()
    expect(parseBatchIds([1, -2])).toBeNull()
    expect(parseBatchIds([1, 1.5])).toBeNull()
    expect(parseBatchIds([1, '2'])).toBeNull()
    expect(parseBatchIds(Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => i + 1))).toBeNull()
  })

  it('accepts exactly the limit', () => {
    const ids = Array.from({ length: MAX_BATCH_IDS }, (_, i) => i + 1)
    expect(parseBatchIds(ids)).toHaveLength(MAX_BATCH_IDS)
  })
})

describe('sort id parsing', () => {
  it('allows an empty list because a scope can legitimately be empty', () => {
    expect(parseSortIds([])).toEqual([])
  })

  it('rejects malformed entries', () => {
    expect(parseSortIds('nope')).toBeNull()
    expect(parseSortIds([1, 0])).toBeNull()
    expect(parseSortIds([1, null])).toBeNull()
  })

  it('caps the list length', () => {
    // 之前完全不限长度，一次超大 payload 就能打爆 CPU 和 D1 语句配额
    expect(parseSortIds(Array.from({ length: MAX_SORT_IDS }, (_, i) => i + 1))).toHaveLength(MAX_SORT_IDS)
    expect(parseSortIds(Array.from({ length: MAX_SORT_IDS + 1 }, (_, i) => i + 1))).toBeNull()
  })
})

describe('route helper deduplication', () => {
  const routeFiles = [
    'worker/routes/bookmarks.ts',
    'worker/routes/categories.ts',
    'worker/routes/data.ts',
    'worker/routes/favicon.ts',
    'worker/routes/settings.ts',
  ]

  it('leaves no local copies behind in any route file', () => {
    // badRequest 曾经在 5 个文件里各写一遍，readJson 4 遍，AppContext 别名 5 遍。
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source, file).not.toContain('function badRequest')
      expect(source, file).not.toContain('async function readJson')
      expect(source, file).not.toContain('type AppContext = Context<HonoEnv>')
      expect(source, file).not.toContain('function parseId(')
      expect(source, file).not.toContain('function isNonEmptyString')
      expect(source, file).not.toContain('function isOptionalString')
      expect(source, file).not.toContain('function parseBatchIds')
    }
  })

  it('uses the shared sort cap in both sort routes', () => {
    for (const file of ['worker/routes/bookmarks.ts', 'worker/routes/categories.ts']) {
      expect(readFileSync(file, 'utf8'), file).toContain('parseSortIds(')
    }
  })
})
