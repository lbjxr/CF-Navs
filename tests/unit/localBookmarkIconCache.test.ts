import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBookmarkIconCacheKey,
  deleteCachedBookmarkIcon,
  fetchBookmarkIcon,
  fetchCachedBookmarkIconUrl,
  isDataImage,
  readCachedBookmarkIconDataUri,
  readCachedBookmarkIconUrl,
  revokeLocalIconUrl,
  writeBookmarkIconDataUri,
} from '../../src/lib/localBookmarkIconCache'
// Existing URL/cache assertions also exercise the richer production result API.
const fetchAndCacheBookmarkIconUrl = async (key: string, url: string) => (await fetchBookmarkIcon(key, url)).url


const STORAGE_PREFIX = 'cf-navs.bookmark-icon.'
let legacyCacheDeletes: string[] = []
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

function setupCacheStorage() {
  legacyCacheDeletes = []
  const localStorage = setupLocalStorage()
  const entries = new Map<string, Response>()
  const cache = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    keys: async () => [],
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response.clone())
    },
    delete: async (request: Request) => entries.delete(request.url),
  }
  const caches = {
    open: vi.fn(async () => cache),
    delete: async (name: string) => {
      legacyCacheDeletes.push(name)
      return name === 'cf-navs-bookmark-icons-v1'
    },
  }

  vi.stubGlobal('caches', caches)
  vi.stubGlobal('window', { localStorage, caches })
  const testUrl = class extends URL { }
  Object.assign(testUrl, {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
  vi.stubGlobal('URL', testUrl)
  return entries
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

  it('does not persist embedded data URIs through the legacy unscoped writer', async () => {
    const storage = setupLocalStorage()
    const entries = setupCacheStorage()
    const cacheKey = createBookmarkIconCacheKey({ id: 1, icon: 'data:image/png;base64,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:image/png;base64,a')

    expect(storage.getItem(storageKey(cacheKey))).toBeNull()
    expect(readCachedBookmarkIconDataUri(cacheKey)).toBeNull()
    expect(entries.size).toBe(0)
  })

  it('ignores non-image data URIs', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 1, icon: 'data:text/plain,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:text/plain,a')

    expect(readCachedBookmarkIconDataUri(cacheKey)).toBeNull()
  })

  it('removes old localStorage entries without writing an unscoped replacement', async () => {
    const localStorage = setupLocalStorage()
    const firstKey = createBookmarkIconCacheKey({ id: 9, icon: 'data:image/png;base64,old', iconSource: 'custom' })
    const secondKey = createBookmarkIconCacheKey({ id: 9, icon: 'data:image/png;base64,new', iconSource: 'custom' })

    localStorage.setItem(storageKey(firstKey), 'data:image/png;base64,old')
    localStorage.setItem(storageKey(secondKey), 'data:image/png;base64,stale')
    await writeBookmarkIconDataUri(firstKey, 'data:image/png;base64,old')
    await writeBookmarkIconDataUri(secondKey, 'data:image/png;base64,new')

    expect(localStorage.getItem(storageKey(firstKey))).toBeNull()
    expect(localStorage.getItem(storageKey(secondKey))).toBeNull()
    expect(localStorage.keys().filter((key) => key.startsWith(`${STORAGE_PREFIX}9-`))).toHaveLength(0)
  })

  it('deletes cached localStorage entries and degrades without Cache Storage', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 3, icon: 'data:image/png;base64,a', iconSource: 'custom' })

    await writeBookmarkIconDataUri(cacheKey, 'data:image/png;base64,a')
    await deleteCachedBookmarkIcon(cacheKey)

    expect(readCachedBookmarkIconDataUri(cacheKey)).toBeNull()
    await expect(readCachedBookmarkIconUrl('missing-cache-key')).resolves.toBeNull()
  })

  it('persists fetched remote icons in Cache Storage for later browser sessions', async () => {
    const entries = setupCacheStorage()
    vi.stubGlobal('fetch', vi.fn(async () => {
      const response = new Response('<svg/>', {
        headers: { 'content-type': 'image/svg+xml', 'content-length': '6' },
      })
      return response
    }))
    const cacheKey = createBookmarkIconCacheKey({ id: 4, icon: 'https://example.com/icon.svg', iconSource: 'custom' })

    const firstUrl = await fetchAndCacheBookmarkIconUrl(cacheKey, 'https://example.com/icon.svg')
    const reopenedUrl = await readCachedBookmarkIconUrl(cacheKey)

    expect(firstUrl).toMatch(/^blob:/)
    expect(reopenedUrl).toMatch(/^blob:/)
    expect(entries.size).toBe(1)
    expect(legacyCacheDeletes).toContain('cf-navs-bookmark-icons-v1')
    if (firstUrl) revokeLocalIconUrl(firstUrl)
    if (reopenedUrl) revokeLocalIconUrl(reopenedUrl)
  })

  it('persists an external URL even when its pathname resembles the object proxy', async () => {
    const entries = setupCacheStorage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', {
      headers: { 'content-type': 'image/svg+xml', 'content-length': '6' },
    })))

    const iconUrl = await fetchAndCacheBookmarkIconUrl('4-external-api-path', 'https://external.example/api/icon/logo.svg')

    expect(iconUrl).toMatch(/^blob:/)
    expect(entries.size).toBe(1)
    if (iconUrl) revokeLocalIconUrl(iconUrl)
  })

  it('does not persist same-origin object icon proxy responses', async () => {
    const entries = setupCacheStorage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', {
      headers: { 'content-type': 'image/svg+xml', 'content-length': '6' },
    })))

    const iconUrl = await fetchAndCacheBookmarkIconUrl('4-proxy', '/api/icon/4?v=stable&cv=4')

    expect(iconUrl).toMatch(/^blob:/)
    expect(entries.size).toBe(0)
    if (iconUrl) revokeLocalIconUrl(iconUrl)
  })

  it('coalesces overlapping object-proxy loads into one request with independent object URLs', async () => {
    const entries = setupCacheStorage()
    let releaseBody!: (blob: Blob) => void
    const body = new Promise<Blob>((resolve) => { releaseBody = resolve })
    const response = new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
    const readBody = vi.spyOn(response, 'blob').mockReturnValue(body)
    const fetchMock = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(
      new Response('<svg>denied</svg>', { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const blobs = new Map<string, Blob>()
    vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
      const url = `blob:card-${blobs.size}`
      blobs.set(url, blob as Blob)
      return url
    })
    const url = '/api/icon/42?v=same&cv=4'
    const first = fetchAndCacheBookmarkIconUrl('42-frequent', url)
    const second = fetchAndCacheBookmarkIconUrl('42-ordinary', url)
    await vi.waitFor(() => expect(readBody).toHaveBeenCalledTimes(1))
    releaseBody(new Blob(['<svg>public</svg>'], { type: 'image/svg+xml' }))
    const [a, b] = await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).not.toBe(b)
    expect(await blobs.get(a!)!.text()).toBe('<svg>public</svg>')
    expect(await blobs.get(b!)!.text()).toBe('<svg>public</svg>')
    revokeLocalIconUrl(a!)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(a)
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(b)

    // A settled request shares nothing: a later read re-hits the visibility gate.
    const later = await fetchAndCacheBookmarkIconUrl('42-later', url)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await blobs.get(later!)!.text()).toBe('<svg>denied</svg>')
    expect(entries.size).toBe(0)
    revokeLocalIconUrl(b!)
    revokeLocalIconUrl(later!)
  })

  it('never coalesces across authorization grants or icon versions', async () => {
    setupCacheStorage()
    const releases: Array<(response: Response) => void> = []
    const fetchMock = vi.fn((_url: string) => new Promise<Response>((resolve) => { releases.push(resolve) }))
    vi.stubGlobal('fetch', fetchMock)
    const urls = [
      '/api/icon/42?v=one&cv=4',
      '/api/icon/42?v=one&cv=4&key=A',
      '/api/icon/42?v=one&cv=4&key=B',
      '/api/icon/42?v=two&cv=4',
    ]
    const pending = urls.map((url) => fetchAndCacheBookmarkIconUrl('42-cache-key', url))
    await vi.waitFor(() => expect(releases).toHaveLength(4))
    for (const release of releases) release(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    for (const url of await Promise.all(pending)) if (url) revokeLocalIconUrl(url)
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(urls)
  })

  it.each(['network', 'body', 'http', 'type', 'empty'])('evicts a %s failure so a remount can retry', async (failure) => {
    setupCacheStorage()
    const response = new Response(failure === 'empty' ? '' : '<svg/>', {
      status: failure === 'http' ? 503 : 200,
      headers: { 'content-type': failure === 'type' ? 'text/plain' : 'image/svg+xml' },
    })
    if (failure === 'body') vi.spyOn(response, 'blob').mockRejectedValue(new Error('body interrupted'))
    const fetchMock = vi.fn()
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('network interrupted'))
    else fetchMock.mockResolvedValueOnce(response)
    fetchMock.mockResolvedValueOnce(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetchMock)
    const url = '/api/icon/42?v=recovery&cv=4'
    await expect(fetchAndCacheBookmarkIconUrl('42', url)).resolves.toBeNull()
    const recovered = await fetchAndCacheBookmarkIconUrl('42', url)
    expect(recovered).toMatch(/^blob:/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    if (recovered) revokeLocalIconUrl(recovered)
  })

  it('does not persist fallback, no-store, or oversized icon responses', async () => {
    const entries = setupCacheStorage()
    const responses = [
      new Response('<svg/>', {
        headers: { 'content-type': 'image/svg+xml', 'X-Icon-Fallback': '1' },
      }),
      new Response('<svg/>', {
        headers: { 'content-type': 'image/svg+xml', 'cache-control': 'private, no-store' },
      }),
      new Response('<svg/>', {
        headers: {
          'content-type': 'image/svg+xml',
          'content-length': String(512 * 1024 + 1),
        },
      }),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift()!))

    const fallbackUrl = await fetchAndCacheBookmarkIconUrl('4-fallback', '/api/icon/4')
    const privateUrl = await fetchAndCacheBookmarkIconUrl('5-private', '/api/icon/5')
    const oversizedUrl = await fetchAndCacheBookmarkIconUrl('6-oversized', '/api/icon/6')

    expect(fallbackUrl).toMatch(/^blob:/)
    expect(privateUrl).toMatch(/^blob:/)
    expect(oversizedUrl).toMatch(/^blob:/)
    expect(entries.size).toBe(0)
    if (fallbackUrl) revokeLocalIconUrl(fallbackUrl)
    if (privateUrl) revokeLocalIconUrl(privateUrl)
    if (oversizedUrl) revokeLocalIconUrl(oversizedUrl)
  })

  it('deletes stale fallback and no-store entries when reading', async () => {
    const entries = setupCacheStorage()
    entries.set('https://cf-navs.local/bookmark-icon/6-fallback', new Response('<svg/>', {
      headers: { 'content-type': 'image/svg+xml', 'X-Icon-Fallback': '1' },
    }))
    entries.set('https://cf-navs.local/bookmark-icon/7-private', new Response('<svg/>', {
      headers: { 'content-type': 'image/svg+xml', 'cache-control': 'private, no-store' },
    }))

    await expect(readCachedBookmarkIconUrl('6-fallback')).resolves.toBeNull()
    await expect(readCachedBookmarkIconUrl('7-private')).resolves.toBeNull()
    expect(entries.size).toBe(0)
  })
})

describe('fetchCachedBookmarkIconUrl', () => {
  beforeEach(() => {
    setupLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the cached URL and marks it as fresh when no race occurs', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 1, icon: 'data:image/png;base64,a', iconSource: 'custom' })
    localStorage.setItem(storageKey(cacheKey), 'data:image/png;base64,a')
    const entries = setupCacheStorage()
    entries.set(`https://cf-navs.local/bookmark-icon/${encodeURIComponent(cacheKey)}`, new Response('a', { headers: { 'content-type': 'image/png' } }))

    const seq = { current: 0 }
    const result = await fetchCachedBookmarkIconUrl(cacheKey, seq)

    expect(result.stale).toBe(false)
    expect(result.url).toBe('blob:test')
    expect(seq.current).toBe(1)
  })

  it('returns stale=true and revokes URL when request counter has changed', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 2, icon: 'data:image/png;base64,b', iconSource: 'custom' })
    localStorage.setItem(storageKey(cacheKey), 'data:image/png;base64,b')
    const entries = setupCacheStorage()
    entries.set(`https://cf-navs.local/bookmark-icon/${encodeURIComponent(cacheKey)}`, new Response('b', { headers: { 'content-type': 'image/png' } }))

    const seq = { current: 0 }

    // Simulate a race: start fetch, then change seq externally
    const fetchPromise = fetchCachedBookmarkIconUrl(cacheKey, seq)
    seq.current = 999  // Simulate a newer request invalidating this one

    const result = await fetchPromise

    expect(result.stale).toBe(true)
    expect(result.url).toBeNull()
  })

  it('returns url=null, stale=false when no cache entry exists and request is fresh', async () => {
    const seq = { current: 0 }
    const result = await fetchCachedBookmarkIconUrl('nonexistent-key', seq)

    expect(result.stale).toBe(false)
    expect(result.url).toBeNull()
    expect(seq.current).toBe(1)
  })

  it('increments the request sequence counter', async () => {
    const cacheKey = createBookmarkIconCacheKey({ id: 3, icon: 'data:image/png;base64,c', iconSource: 'custom' })
    localStorage.setItem(storageKey(cacheKey), 'data:image/png;base64,c')
    const entries = setupCacheStorage()
    entries.set(`https://cf-navs.local/bookmark-icon/${encodeURIComponent(cacheKey)}`, new Response('c', { headers: { 'content-type': 'image/png' } }))

    const seq = { current: 5 }
    await fetchCachedBookmarkIconUrl(cacheKey, seq)

    expect(seq.current).toBe(6)
  })
})


describe('remote icon response classification', () => {
  it.each([
    [200, '1', 'retryable'],
    [200, null, 'ready'],
    [404, null, 'unavailable'],
    [429, null, 'retryable'],
    [503, null, 'retryable'],
  ] as const)('classifies status %s fallback=%s as %s', async (status, fallback, expected) => {
    setupCacheStorage()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { status, headers: {
      'content-type': 'image/svg+xml', ...(fallback ? { 'X-Icon-Fallback': fallback } : {}),
    } })))
    const result = await fetchBookmarkIcon('42', '/api/icon/42?cv=4')
    expect(result.status).toBe(expected)
    if (result.url) revokeLocalIconUrl(result.url)
  })
})
