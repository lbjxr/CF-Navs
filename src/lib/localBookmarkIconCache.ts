const CACHE_NAME = 'cf-navs-bookmark-icons-v2'
const LEGACY_CACHE_NAMES = ['cf-navs-bookmark-icons-v1']
const MAX_LOCAL_ICON_CACHE_BYTES = 512 * 1024
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

let legacyCacheCleanup: Promise<void> | null = null

function clearLegacyCacheStorage(): Promise<void> {
  if (!canUseCacheStorage()) return Promise.resolve()
  const deleteCache = typeof caches.delete === 'function' ? caches.delete.bind(caches) : null
  if (!deleteCache) return Promise.resolve()
  if (!legacyCacheCleanup) {
    legacyCacheCleanup = Promise.all(
      LEGACY_CACHE_NAMES.map((name) => deleteCache(name)),
    ).then(() => undefined).catch(() => undefined)
  }
  return legacyCacheCleanup
}

function isObjectIconProxyUrl(url: string): boolean {
  if (url.startsWith('/api/icon/')) return true
  try {
    const parsed = new URL(url)
    return typeof location !== 'undefined' && parsed.origin === location.origin && parsed.pathname.startsWith('/api/icon/')
  } catch {
    return false
  }
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

async function responseToIconBlob(response: Response): Promise<Blob | null> {
  if (!response.ok) return null

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) return null

  const blob = await response.blob()
  return blob.size > 0 ? blob : null
}

function responseToObjectUrl(response: Response): Promise<string | null> {
  return responseToIconBlob(response).then((blob) => (blob ? URL.createObjectURL(blob) : null))
}

// 「经常访问」与普通分类会把同一本书签各挂一个 BookmarkCard，同一 tick 内对同一条对象代理
// URL 发两次 fetch。对象图标是 no-store、不持久化，所以只能合并**在途**请求，不缓存完成结果：
// 按完整 URL（含 v/cv/key）索引，拿到同一份正文后各自生成独立 object URL，成功或失败都立即移除，
// 下一次挂载重新经过可见性闸门。
export type BookmarkIconFetchResult = {
  url: string | null
  status: 'ready' | 'retryable' | 'unavailable'
}

type IconPayload = { blob: Blob | null; status: BookmarkIconFetchResult['status'] }

async function responseToIconPayload(response: Response): Promise<IconPayload> {
  if (!response.ok) {
    return { blob: null, status: response.status === 408 || response.status === 429 || response.status >= 500 ? 'retryable' : 'unavailable' }
  }
  const blob = await responseToIconBlob(response)
  // A 200 fallback is displayable, but must not stop recovery as if it were the
  // real icon. Object responses are all no-store, so retries must remain bounded.
  return { blob, status: response.headers.get('X-Icon-Fallback') === '1' || !blob ? 'retryable' : 'ready' }
}

const pendingObjectIcons = new Map<string, Promise<IconPayload>>()

async function fetchObjectIcon(url: string): Promise<BookmarkIconFetchResult> {
  let pending = pendingObjectIcons.get(url)
  if (!pending) {
    pending = fetch(url, { credentials: 'same-origin', cache: 'force-cache' })
      .then(responseToIconPayload)
      .finally(() => pendingObjectIcons.delete(url))
    pendingObjectIcons.set(url, pending)
  }
  const { blob, status } = await pending
  return { url: blob ? URL.createObjectURL(blob) : null, status }
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
  void cacheKey
  return null
}

export async function readCachedBookmarkIconUrl(cacheKey: string): Promise<string | null> {
  await clearLegacyCacheStorage()
  const dataUri = readCachedBookmarkIconDataUri(cacheKey)
  if (dataUri) return dataUri

  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const request = cacheRequest(cacheKey)
    const cached = await cache.match(request)
    const cacheControl = cached?.headers.get('cache-control')?.toLowerCase() ?? ''
    const canPersist = cached !== undefined && cached.headers.get('X-Icon-Fallback') !== '1' && !/\bno-store\b/.test(cacheControl)
    if (!canPersist) {
      if (cached) await cache.delete(request)
      return null
    }
    return await responseToObjectUrl(cached)
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
  await clearLegacyCacheStorage()
  if (!isDataImage(dataUri)) return
  await deleteCachedBookmarkIcon(cacheKey)
}

export async function fetchBookmarkIcon(cacheKey: string, url: string): Promise<BookmarkIconFetchResult> {
  await clearLegacyCacheStorage()
  if (!url) return { url: null, status: 'unavailable' }

  try {
    if (isObjectIconProxyUrl(url)) return await fetchObjectIcon(url)
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'force-cache',
    })
    if (!response.ok) return { url: null, status: response.status >= 500 || response.status === 429 || response.status === 408 ? 'retryable' : 'unavailable' }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) return { url: null, status: 'unavailable' }

    const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? ''
    const contentLengthHeader = response.headers.get('content-length')
    const contentLength = contentLengthHeader === null ? Number.NaN : Number(contentLengthHeader)
    const canPersist =
      Number.isFinite(contentLength) &&
      contentLength >= 0 &&
      contentLength <= MAX_LOCAL_ICON_CACHE_BYTES &&
      response.headers.get('X-Icon-Fallback') !== '1' &&
      !isObjectIconProxyUrl(url) &&
      !/\bno-store\b/.test(cacheControl)
    if (canUseCacheStorage() && canPersist) {
      const cache = await caches.open(CACHE_NAME)
      await deleteStaleCacheStorageEntries(cache, cacheKey)
      await cache.put(cacheRequest(cacheKey), response.clone())
    }

    const { blob, status } = await responseToIconPayload(response)
    return { url: blob ? URL.createObjectURL(blob) : null, status }
  } catch {
    return { url: null, status: 'retryable' }
  }
}

export interface FetchCachedIconResult {
  url: string | null
  stale: boolean
}

export async function fetchCachedBookmarkIconUrl(
  cacheKey: string,
  requestSeq: { current: number },
): Promise<FetchCachedIconResult> {
  const seq = ++requestSeq.current
  const url = await readCachedBookmarkIconUrl(cacheKey)
  if (seq !== requestSeq.current) {
    if (url) revokeLocalIconUrl(url)
    return { url: null, stale: true }
  }
  return { url, stale: false }
}

