import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBookmarkIconCacheKey,
  deleteCachedBookmarkIcon,
  isDataImage,
  readCachedBookmarkIconDataUri,
  readCachedBookmarkIconUrl,
  writeBookmarkIconDataUri,
} from '../../src/lib/localBookmarkIconCache'

const STORAGE_PREFIX = 'cf-navs.bookmark-icon.'

class MemoryLocalStorage {
  private values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  clear(): void {
    this.values.clear()
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  keys(): string[] {
    return Array.from(this.values.keys())
  }
}

function storageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`
}

function setupLocalStorage() {
  const localStorage = new MemoryLocalStorage()
  vi.stubGlobal('localStorage', localStorage)
  vi.stubGlobal('window', { localStorage })
  return localStorage
}

describe('local bookmark icon cache', () => {
  beforeEach(() => {
    setupLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates stable cache keys that change with icon inputs', () => {
    const input = { id: 7, icon: 'https://example.com/icon.png', iconSource: 'custom' }

    expect(createBookmarkIconCacheKey(input)).toBe(createBookmarkIconCacheKey(input))
    expect(createBookmarkIconCacheKey(input)).not.toBe(createBookmarkIconCacheKey({
      ...input,
      icon: 'https://example.com/other.png',
    }))
    expect(createBookmarkIconCacheKey(input)).not.toBe(createBookmarkIconCacheKey({
      ...input,
      iconSource: 'google',
    }))
  })

  it('recognizes only image data URIs', () => {
    expect(isDataImage(' data:image/png;base64,abc ')).toBe(true)
    expect(isDataImage('data:image/svg+xml,<svg></svg>')).toBe(true)
    expect(isDataImage('data:text/plain,abc')).toBe(false)
    expect(isDataImage('https://example.com/icon.png')).toBe(false)
  })

  it('writes and reads cached data URIs through localStorage', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 1, icon: 'data:image/png;base64,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:image/png;base64,a')

    expect(readCachedBookmarkIconDataUri(cacheKey)).toBe('data:image/png;base64,a')
    await expect(readCachedBookmarkIconUrl(cacheKey)).resolves.toBe('data:image/png;base64,a')
  })

  it('ignores non-image data URIs', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 1, icon: 'data:text/plain,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:text/plain,a')

    expect(readCachedBookmarkIconDataUri(cacheKey)).toBeNull()
  })

  it('removes stale localStorage entries for the same bookmark id', async () => {
    const localStorage = setupLocalStorage()
    const firstKey = createBookmarkIconCacheKey({ id: 9, icon: 'data:image/png;base64,old', iconSource: 'custom' })
    const secondKey = createBookmarkIconCacheKey({ id: 9, icon: 'data:image/png;base64,new', iconSource: 'custom' })

    await writeBookmarkIconDataUri(firstKey, 'data:image/png;base64,old')
    await writeBookmarkIconDataUri(secondKey, 'data:image/png;base64,new')

    expect(localStorage.getItem(storageKey(firstKey))).toBeNull()
    expect(localStorage.getItem(storageKey(secondKey))).toBe('data:image/png;base64,new')
    expect(localStorage.keys().filter((key) => key.startsWith(`${STORAGE_PREFIX}9-`))).toHaveLength(1)
  })

  it('deletes cached localStorage entries and degrades without Cache Storage', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 3, icon: 'data:image/png;base64,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:image/png;base64,a')
    await deleteCachedBookmarkIcon(cacheKey)

    expect(readCachedBookmarkIconDataUri(cacheKey)).toBeNull()
    await expect(readCachedBookmarkIconUrl('missing-cache-key')).resolves.toBeNull()
  })
})
