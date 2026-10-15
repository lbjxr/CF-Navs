// CF-Navs service worker.
// Strategy:
// - App shell and hashed assets: cache first.
// - Navigations: stale-while-revalidate — serve the cached shell immediately, refresh in the background.
// - `/api/category-icon/*` is network-only. The Worker performs the authoritative visibility gate before
//   its edge cache, and Cache Storage cannot revoke a private/public transition for an old entry.
// - Any icon response marked `no-store` (private objects fetched with a signed access key)
//   is never written to Cache Storage — Cache Storage does not honour Cache-Control on its own.
// - `/api/icon/*` and `/api/iconify/*` do not write bookmark icon responses to Cache Storage; Iconify
//   keeps its existing asset cache because it is not a user-private object endpoint.
// - Other `/api/*` requests: network only.

// Vite replaces this marker with a fingerprint of the built shell, SW, and chunks.
// The source fallback keeps the unbuilt public file usable during local development.
const CACHE = 'cf-navs-v17'
const RUNTIME_CACHE_PREFIX = 'cf-navs-v'
const APP_SHELL = ['/index.html', '/manifest.webmanifest', '/icon.ico', '/icon.png']
const MAX_ICON_CACHE_BYTES = 512 * 1024
// Iconify 缓存条目上限 + LRU 淘汰：图标种类无界（用户可任意输入 prefix:name），
// 不设上限会让 Cache Storage 无限增长。LRU 列表是 SW 作用域的尽力而为记录，
// SW 重启后丢失不影响正确性（只影响淘汰精度）。
const MAX_ICONIFY_CACHE_ENTRIES = 500
const iconifyLru = [] // 按最近访问排序，队首最旧
const SHELL_URL = '/index.html'

function isBuildAsset(request) {
  const pathname = new URL(
    typeof request === 'string' ? request : request.url,
    self.location.origin,
  ).pathname
  return pathname === '/assets' || pathname.startsWith('/assets/')
}

function isHtmlResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  return contentType.toLowerCase().includes('text/html')
}

function isCacheableResponse(request, response) {
  if (!response.ok) return false
  if (!isBuildAsset(request)) return true
  return !isHtmlResponse(response)
}

function assetNotFoundResponse() {
  return new Response(null, {
    status: 404,
    statusText: 'Not Found',
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function normalizeBuildAssetResponse(request, response) {
  if (!isBuildAsset(request) || !isHtmlResponse(response)) return response
  return assetNotFoundResponse()
}

// Installation may follow /index.html -> /. Chromium rejects that cached
// redirected Response for navigations whose redirect mode is "manual". Preserve
// bytes/headers but create a fresh response; clone so background shell comparison
// can still read the cached response independently.
function navigationResponse(response) {
  if (!response || !response.redirected) return response
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function matchCurrentCache(request) {
  return caches.open(CACHE).then((cache) => cache.match(request))
}

function cacheResponse(request, response) {
  if (!isCacheableResponse(request, response)) return

  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
}



function touchIconifyLru(url) {
  const index = iconifyLru.indexOf(url)
  if (index !== -1) iconifyLru.splice(index, 1)
  iconifyLru.push(url)
}

async function evictIconifyLru(cache) {
  while (iconifyLru.length > MAX_ICONIFY_CACHE_ENTRIES) {
    const oldest = iconifyLru.shift()
    try {
      await cache.delete(oldest)
    } catch {
      // 忽略删除失败
    }
  }
}

function cacheIconResponse(request, response) {
  if (!response.ok) return
  if (response.type === 'opaque') return
  // 私密对象的图标带签名授权，服务端标记 `private, no-store`。Cache Storage 不会自己
  // 遵守 Cache-Control，写进去就等于把私密图标留在这台机器上、并让下一个访客（同一
  // 浏览器 profile 下的访客态）cache-first 命中它。必须显式拒收。
  if ((response.headers.get('Cache-Control') || '').includes('no-store')) return

  const contentLengthHeader = response.headers.get('Content-Length')
  if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader)) return
  const contentLength = Number(contentLengthHeader)
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_ICON_CACHE_BYTES) return
  const copy = response.clone()
  const url = request.url
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, copy).then(() => cache))
    .then((cache) => {
      touchIconifyLru(url)
      return evictIconifyLru(cache)
    })
    .catch(() => undefined)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(RUNTIME_CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

// 构建产物预热。
//
// APP_SHELL 里没有 /assets/*（文件名带 hash，写死会立刻失效），而 SW 在首次访问时
// 还没接管页面，拦不到当次的 JS/CSS 请求。结果是第一次访问结束后 Cache Storage 里
// 一个构建产物都没有，`/assets/*` 的 cache-first 要到第三次访问才真正生效。
//
// 让页面把自己实际用到的资源清单发过来，不需要构建插件，也不会因为 hash 变化失效。
async function precacheAsset(cache, url) {
  const request = new Request(new URL(url, self.location.origin))
  const cached = await cache.match(request)
  if (cached) {
    if (isCacheableResponse(request, cached)) return
    await cache.delete(request)
  }

  try {
    const response = normalizeBuildAssetResponse(request, await fetch(request))
    if (isCacheableResponse(request, response)) await cache.put(request, response)
  } catch {
    // 预缓存是 best-effort；失败不应影响页面或其余资源。
  }
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'precache-assets' || !Array.isArray(data.urls)) return

  const urls = data.urls
    .filter((value) => typeof value === 'string')
    .filter((value) => {
      try {
        const url = new URL(value, self.location.origin)
        return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
      } catch {
        return false
      }
    })
    .slice(0, 50)

  if (urls.length === 0) return

  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(urls.map((url) => precacheAsset(cache, url))))
      .catch(() => undefined),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  const isIconifyAsset =
    url.protocol === 'https:' &&
    url.hostname === 'api.iconify.design' &&
    url.pathname.endsWith('.svg')
  if (isIconifyAsset) {
    event.respondWith(
      matchCurrentCache(request).then(
        (cached) => {
          if (cached) {
            touchIconifyLru(request.url)
            return cached
          }
          return fetch(request).then((response) => {
            cacheIconResponse(request, response)
            return response
          })
        },
      ),
    )
    return
  }

  if (url.origin !== self.location.origin) return


  if (url.pathname.startsWith('/api/')) return

  const isStatic = isBuildAsset(request) || APP_SHELL.includes(url.pathname)
  if (isStatic) {
    event.respondWith(
      matchCachedStatic(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const safeResponse = normalizeBuildAssetResponse(request, response)
            cacheResponse(request, safeResponse)
            return safeResponse
          }),
      ).then((response) => request.mode === 'navigate' ? navigationResponse(response) : response),
    )
    return
  }

  // 导航请求：stale-while-revalidate。
  //
  // 之前是 network-first，加上 HTML 的 `no-cache, must-revalidate`，等于每次打开
  // 页面都必须先等一个完整网络往返才能开始渲染，本地缓存只在离线时才用得上。
  //
  // 代价：部署新版本后用户下一次打开看到的仍是旧版，再刷一次才更新。
  // 发布会替换 dist 并移除旧 hash 资源，因此 CACHE 版本必须随构建产物递增，
  // 否则旧 HTML 会引用已经不存在的 chunk。检测到新版本时会通知页面，由页面决定怎么提示。
  if (request.mode === 'navigate') {
    event.respondWith(
      matchCurrentCache(SHELL_URL).then((cached) => {
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
              const changed = cached ? await shellChanged(cached, response) : true
              cacheResponse(SHELL_URL, response)
              if (cached && changed) notifyClients({ type: 'shell-updated' })
            }
            return response
          })
          .catch(() => cached || caches.match('/'))

        if (!cached) return network

        // 后台更新不能让请求悬空：respondWith 之后 waitUntil 保活。
        event.waitUntil(network.catch(() => undefined))
        return cached
      }).then(navigationResponse),
    )
  }
})

async function matchCachedStatic(request) {
  const cached = await matchCurrentCache(request)
  if (!cached) return null
  if (isCacheableResponse(request, cached)) return cached

  await caches.open(CACHE).then((cache) => cache.delete(request)).catch(() => undefined)
  return null
}

async function shellChanged(cached, response) {
  try {
    const [before, after] = await Promise.all([cached.clone().text(), response.clone().text()])
    return before !== after
  } catch {
    return false
  }
}

function notifyClients(message) {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) client.postMessage(message)
  }).catch(() => undefined)
}
