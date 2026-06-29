// CF-Navs Service Worker —— 离线 app shell + 静态资源缓存
// 策略：
//  - /api/icon/*   缓存优先（图标 blob，带 hash 版本号天然去重）
//  - /api/category-icon/* 缓存优先（分类图标代理）
//  - https://api.iconify.design/* 缓存优先（Iconify SVG，新增/编辑预览和兜底直连）
//  - /api/*        永不缓存（始终走网络）
//  - 导航请求       网络优先，离线回退到缓存的 index.html
//  - /assets/*等    缓存优先（构建产物带 hash，安全长期缓存）

const CACHE = 'cf-navs-v3'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

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
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
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
  const isIconProxy = url.pathname.startsWith('/api/icon/') || url.pathname.startsWith('/api/category-icon/')
  if (isIconProxy) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok && response.headers.get('X-Icon-Fallback') !== '1') {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            }
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
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => undefined)
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
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            return response
          }),
      ),
    )
  }
})
