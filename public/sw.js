// CF-Navs Service Worker —— 离线 app shell + 静态资源缓存
// 策略：
//  - /api/icon/*   缓存优先（图标 blob，带 hash 版本号天然去重）
//  - /api/category-icon/* 缓存优先（分类图标代理）
//  - /api/iconify/* 缓存优先（新增/编辑弹窗的 Iconify 预览代理）
//  - https://api.iconify.design/* 缓存优先（兼容旧版本或手动直连的 Iconify SVG）
//  - /api/*        永不缓存（始终走网络）
//  - 导航请求       网络优先，离线回退到缓存的 index.html
//  - /assets/*等    缓存优先（构建产物带 hash，安全长期缓存）

const CACHE = 'cf-navs-v11'
const RUNTIME_CACHE_PREFIX = 'cf-navs-v'
const APP_SHELL = ['/index.html', '/manifest.webmanifest', '/icon.svg']
const ICON_FALLBACK_TTL_MS = 5 * 60 * 1000
const ICON_FALLBACK_CACHED_AT = 'X-CF-Navs-Fallback-Cached-At'

function cacheResponse(request, response) {
  if (!response.ok) return

  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
}

function isIconFallback(response) {
  return response.headers.get('X-Icon-Fallback') === '1'
}

function fallbackResponseForCache(response) {
  const headers = new Headers(response.headers)
  headers.set(ICON_FALLBACK_CACHED_AT, String(Date.now()))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function matchCachedIcon(request) {
  const cached = await caches.match(request)
  if (!cached) return null

  if (!isIconFallback(cached)) {
    return cached
  }

  const cachedAt = Number(cached.headers.get(ICON_FALLBACK_CACHED_AT) || '0')
  if (cachedAt > 0 && Date.now() - cachedAt <= ICON_FALLBACK_TTL_MS) {
    return cached
  }

  caches.open(CACHE).then((cache) => cache.delete(request)).catch(() => undefined)
  return null
}

function cacheIconResponse(request, response) {
  if (!response.ok) return

  const copy = response.clone()
  const cached = isIconFallback(copy) ? fallbackResponseForCache(copy) : copy
  caches.open(CACHE).then((cache) => cache.put(request, cached)).catch(() => undefined)
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
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            }
            return response
          }),
      ),
    )
    return
  }

  if (url.origin !== self.location.origin) return

  // 图标代理缓存优先；其他 /api/* 不缓存
  const isIconProxy =
    url.pathname.startsWith('/api/icon/') ||
    url.pathname.startsWith('/api/category-icon/') ||
    url.pathname.startsWith('/api/iconify/')
  if (isIconProxy) {
    event.respondWith(
      matchCachedIcon(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            cacheIconResponse(request, response)
            return response
          }),
      ),
    )
    return
  }

  if (url.pathname.startsWith('/api/')) return // 其他 API 不缓存

  // 导航请求：网络优先，离线回退 app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
            cacheResponse('/index.html', response)
          }
          return response
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    )
    return
  }

  // 静态资源：缓存优先
  const isStatic = url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname)
  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            cacheResponse(request, response)
            return response
          }),
      ),
    )
  }
})
