const CACHE_NAME = 'cf-navs-bookmark-icons-v1'
const CACHE_ORIGIN = 'https://cf-navs.local'
const CACHE_PATH_PREFIX = '/bookmark-icon/'
const STORAGE_PREFIX = 'cf-navs.bookmark-icon.'

export type BookmarkIconCacheInput = {
  id: string | number
  icon: string
  iconSource?: string | null
}

function canUseCacheStorage(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && 'localStorage' in window
}

function createHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
  }
  return Math.abs(hash).toString(36)
}

function cacheRequest(cacheKey: string): Request {
  return new Request(`${CACHE_ORIGIN}${CACHE_PATH_PREFIX}${encodeURIComponent(cacheKey)}`, {
    method: 'GET',
  })
}

function localStorageKey(cacheKey: string): string {
  return `${STORAGE_PREFIX}${cacheKey}`
}

function bookmarkCacheKeyPrefix(cacheKey: string): string | null {
  const separatorIndex = cacheKey.indexOf('-')
  if (separatorIndex <= 0) return null
  return cacheKey.slice(0, separatorIndex + 1)
}

function isBookmarkIconCacheRequest(request: Request, cacheKeyPrefix: string): boolean {
  try {
    const url = new URL(request.url)
    return (
      url.origin === CACHE_ORIGIN &&
      url.pathname.startsWith(`${CACHE_PATH_PREFIX}${encodeURIComponent(cacheKeyPrefix)}`)
    )
  } catch {
    return false
  }
}

function cacheKeyFromRequest(request: Request): string | null {
  try {
    const url = new URL(request.url)
    if (url.origin !== CACHE_ORIGIN || !url.pathname.startsWith(CACHE_PATH_PREFIX)) {
      return null
    }

    const encodedKey = url.pathname.slice(CACHE_PATH_PREFIX.length)
    return encodedKey ? decodeURIComponent(encodedKey) : null
  } catch {
    return null
  }
}

async function deleteStaleCacheStorageEntries(cache: Cache, cacheKey: string): Promise<void> {
  const cacheKeyPrefix = bookmarkCacheKeyPrefix(cacheKey)
  if (!cacheKeyPrefix) return

  const currentUrl = cacheRequest(cacheKey).url
  const requests = await cache.keys()
  await Promise.all(
    requests.map((request) => (
      request.url !== currentUrl && isBookmarkIconCacheRequest(request, cacheKeyPrefix)
        ? cache.delete(request)
        : Promise.resolve(false)
    )),
  )
}

function deleteStaleLocalStorageEntries(cacheKey: string): void {
  if (!canUseLocalStorage()) return

  const cacheKeyPrefix = bookmarkCacheKeyPrefix(cacheKey)
  if (!cacheKeyPrefix) return

  const currentKey = localStorageKey(cacheKey)
  const staleKeyPrefix = `${STORAGE_PREFIX}${cacheKeyPrefix}`
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(staleKeyPrefix) && key !== currentKey) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // Best-effort cleanup.
  }
}

function responseToObjectUrl(response: Response): Promise<string | null> {
  if (!response.ok) return Promise.resolve(null)

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) return Promise.resolve(null)

  return response.blob().then((blob) => {
    if (blob.size === 0) return null
    return URL.createObjectURL(blob)
  })
}

export function createBookmarkIconCacheKey(input: BookmarkIconCacheInput): string {
  return `${input.id}-${createHash(`${input.iconSource ?? ''}:${input.icon}`)}`
}

export function isDataImage(value: string): boolean {
  return /^data:image\//i.test(value.trim())
}

export function revokeLocalIconUrl(value: string): void {
  if (value.startsWith('blob:')) {
    URL.revokeObjectURL(value)
  }
}

export function readCachedBookmarkIconDataUri(cacheKey: string): string | null {
  if (!canUseLocalStorage()) return null

  try {
    const value = localStorage.getItem(localStorageKey(cacheKey))
    return value && isDataImage(value) ? value : null
  } catch {
    return null
  }
}

export async function readCachedBookmarkIconUrl(cacheKey: string): Promise<string | null> {
  const dataUri = readCachedBookmarkIconDataUri(cacheKey)
  if (dataUri) return dataUri

  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(cacheRequest(cacheKey))
    return cached ? await responseToObjectUrl(cached) : null
  } catch {
    return null
  }
}

export async function deleteCachedBookmarkIcon(cacheKey: string): Promise<void> {
  if (canUseLocalStorage()) {
    try {
      localStorage.removeItem(localStorageKey(cacheKey))
    } catch {
      // Best-effort cleanup.
    }
  }

  if (!canUseCacheStorage()) return

  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(cacheRequest(cacheKey))
  } catch {
    // Best-effort cleanup.
  }
}

export async function writeBookmarkIconDataUri(cacheKey: string, dataUri: string): Promise<void> {
  if (!isDataImage(dataUri)) return

  let storedInLocalStorage = false

  if (canUseLocalStorage()) {
    try {
      deleteStaleLocalStorageEntries(cacheKey)
      localStorage.setItem(localStorageKey(cacheKey), dataUri)
      storedInLocalStorage = true
    } catch {
      // Browser storage can be disabled or full; Cache Storage remains a fallback.
    }
  }

  if (!canUseCacheStorage()) return

  try {
    const cache = await caches.open(CACHE_NAME)
    await deleteStaleCacheStorageEntries(cache, cacheKey)

    if (storedInLocalStorage) {
      await cache.delete(cacheRequest(cacheKey))
      return
    }

    const response = await fetch(dataUri)
    await cache.put(cacheRequest(cacheKey), response)
  } catch {
    // Local cache is an optimization; rendering should not depend on it.
  }
}

export async function pruneBookmarkIconCacheStorageBackedByLocalStorage(): Promise<number> {
  if (!canUseCacheStorage() || !canUseLocalStorage()) return 0

  try {
    const cache = await caches.open(CACHE_NAME)
    const requests = await cache.keys()
    let deleted = 0

    await Promise.all(
      requests.map(async (request) => {
        const cacheKey = cacheKeyFromRequest(request)
        if (!cacheKey) return

        const dataUri = localStorage.getItem(localStorageKey(cacheKey))
        if (!dataUri || !isDataImage(dataUri)) return

        if (await cache.delete(request)) {
          deleted += 1
        }
      }),
    )

    return deleted
  } catch {
    return 0
  }
}

export async function fetchAndCacheBookmarkIconUrl(cacheKey: string, url: string): Promise<string | null> {
  if (!url) return null

  try {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'force-cache',
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) return null

    if (canUseCacheStorage()) {
      const cache = await caches.open(CACHE_NAME)
      await deleteStaleCacheStorageEntries(cache, cacheKey)
      await cache.put(cacheRequest(cacheKey), response.clone())
    }

    return await responseToObjectUrl(response)
  } catch {
    return null
  }
}
