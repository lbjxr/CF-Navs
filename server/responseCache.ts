// Node 进程内响应缓存（替代 Cloudflare caches.default 的 match/put/delete 子集）。
//
// 边界：有界（条目数 + 总字节双上限，LRU 淘汰）、非持久化（重启即清）、
// 只存 GET 且响应不带 no-store/private 的条目，遵守响应自身的 max-age。
// 共享代码通过全局 caches.default 访问（worker/lib/cache.ts、iconResponses.ts），
// 由 installGlobalCache 在服务启动时安装。

interface CacheEntry {
  status: number
  headers: Array<[string, string]>
  body: Uint8Array
  expiresAt: number | null
  size: number
}

export interface ResponseCacheHandle {
  /** 形状与标准 Cache 对象一致，可直接挂到 caches.default。 */
  cache: Cache
  stats: () => { entries: number; bytes: number }
  clear: () => void
}

export interface ResponseCacheOptions {
  maxEntries: number
  maxBytes: number
}

export function createResponseCache(options: ResponseCacheOptions): ResponseCacheHandle {
  const entries = new Map<string, CacheEntry>()
  let totalBytes = 0

  const keyOf = (request: Request): string => `${request.method} ${request.url}`

  function drop(key: string): boolean {
    const entry = entries.get(key)
    if (!entry) return false
    entries.delete(key)
    totalBytes -= entry.size
    return true
  }

  function evictIfNeeded(): void {
    while (entries.size > options.maxEntries || totalBytes > options.maxBytes) {
      const oldest = entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      drop(oldest)
    }
  }

  const cache = {
    async match(request: Request): Promise<Response | undefined> {
      const key = keyOf(request)
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        drop(key)
        return undefined
      }
      // LRU：命中后刷新到最新位置
      entries.delete(key)
      entries.set(key, entry)
      return new Response(entry.body.slice(), {
        status: entry.status,
        headers: entry.headers,
      })
    },

    async put(request: Request, response: Response): Promise<void> {
      if (request.method !== 'GET') return
      const cacheControl = response.headers.get('cache-control') ?? ''
      if (/no-store|private/i.test(cacheControl)) return
      const body = new Uint8Array(await response.arrayBuffer())
      const maxAge = /max-age=(\d+)/i.exec(cacheControl)
      const entry: CacheEntry = {
        status: response.status,
        headers: [...response.headers.entries()],
        body,
        expiresAt: maxAge ? Date.now() + Number(maxAge[1]) * 1000 : null,
        size: body.byteLength,
      }
      const key = keyOf(request)
      drop(key)
      entries.set(key, entry)
      totalBytes += entry.size
      evictIfNeeded()
    },

    async delete(request: Request): Promise<boolean> {
      return drop(keyOf(request))
    },
  }

  return {
    cache: cache as unknown as Cache,
    stats: () => ({ entries: entries.size, bytes: totalBytes }),
    clear: () => {
      entries.clear()
      totalBytes = 0
    },
  }
}

/** 把缓存安装为全局 caches.default（共享代码唯一的缓存访问方式）。 */
export function installGlobalCache(cache: Cache): void {
  const storage = {
    default: cache,
    open: async () => cache,
    has: async () => true,
    delete: async () => false,
    keys: async () => [],
    match: async () => undefined,
  }
  Object.defineProperty(globalThis, 'caches', { value: storage, configurable: true })
}
