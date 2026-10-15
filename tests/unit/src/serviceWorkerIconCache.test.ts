// Service Worker 的行为测试：在 VM 里用假的 ServiceWorkerGlobalScope 跑 public/sw.js，
// 拿到真实注册的 fetch 监听器再派发请求。
//
// 为什么不用源码文本断言：`expect(source).toContain("no-store")` 只能证明文件里写了那串
// 字符，证明不了「私密图标真的没被写进 Cache Storage」——而后者才是 PROB-20b 的安全属性。

import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// 断言对象是 public/sw.js 的运行时缓存行为（公开图标写入 Cache Storage、`private, no-store` 图标绝不落盘、
// /api/icon/* 与 /api/iconify/* 不进 Cache Storage），不是 Svelte 组件：sw.js 不经打包、跑在 Service Worker
// 全局作用域，没有可挂载的东西（PROB-18）。所以文件头改用 node:vm 里的假 ServiceWorkerGlobalScope 跑真 sw.js、
// 派发真实 fetch 事件、断言真实的 Cache Storage put——这已经比任何组件挂载或源码文本都强。

type FetchListener = (event: FetchEventLike) => void

type FetchEventLike = {
  request: Request
  respondWith(response: Response | Promise<Response>): void
  waitUntil(promise: Promise<unknown>): void
}

type CachePut = { url: string; cacheControl: string | null }

function loadServiceWorker(networkResponse: (request: Request) => Response) {
  const puts: CachePut[] = []
  const deletedCaches: string[] = []
  const installedShells: string[] = []
  const cacheNames = ['cf-navs-v16', 'cf-navs-v17', 'unrelated-cache']
  const listeners: Record<string, FetchListener> = {}

  const cache = {
    async put(request: Request | string, response: Response) {
      const url = typeof request === 'string' ? request : request.url
      puts.push({ url, cacheControl: response.headers.get('Cache-Control') })
    },
    async addAll(urls: string[]) {
      installedShells.push(...urls)
    },
    async delete() {
      return true
    },
    async keys() {
      return []
    },
    async match() {
      return undefined
    },
  }

  const context = createContext({
    self: {
      addEventListener(type: string, listener: FetchListener) {
        listeners[type] = listener
      },
      location: new URL('https://nav.example.com/sw.js'),
      skipWaiting: async () => { },
      clients: { claim: async () => { }, matchAll: async () => [] },
      registration: { waiting: null },
    },
    caches: {
      async open() {
        return cache
      },
      async match() {
        return undefined
      },
      async keys() {
        return cacheNames
      },
      async delete(name: string) {
        deletedCaches.push(name)
        return true
      },
    },
    fetch: async (request: Request) => networkResponse(request),
    Response,
    Request,
    Headers,
    URL,
    Date,
    Promise,
    Number,
    console,
  })

  runInContext(readFileSync('public/sw.js', 'utf8'), context)

  return {
    puts,
    deletedCaches,
    installedShells,
    async dispatchFetch(url: string) {
      const request = new Request(url)
      let responded: Promise<Response> | Response | null = null
      const pending: Promise<unknown>[] = []
      listeners.fetch?.({
        request,
        respondWith(value) {
          responded = value
        },
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      const response = responded ? await responded : null
      await Promise.all(pending).catch(() => undefined)
      // sw.js 里的 `caches.open(...).then(put)` 是 fire-and-forget 的 promise 链。
      // 这里不睡固定时长，而是把微任务队列抽空——假 cache 全是同步 resolve 的，
      // 三轮 await 足以让链条走完，且与真实时间无关。
      for (let i = 0; i < 3; i += 1) await Promise.resolve()
      return response
    },
    async dispatchInstall() {
      const pending: Promise<unknown>[] = []
      listeners.install?.({
        request: new Request('https://nav.example.com/install'),
        respondWith() { },
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      await Promise.all(pending)
      for (let i = 0; i < 3; i += 1) await Promise.resolve()
    },
    async dispatchActivate() {
      const pending: Promise<unknown>[] = []
      listeners.activate?.({
        request: new Request('https://nav.example.com/activate'),
        respondWith() { },
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      await Promise.all(pending)
      return deletedCaches
    },
  }
}

function iconResponse(cacheControl: string, contentLength?: string): Response {
  const headers = new Headers({ 'Content-Type': 'image/svg+xml', 'Cache-Control': cacheControl })
  if (contentLength != null) headers.set('Content-Length', contentLength)
  return new Response('<svg/>', { status: 200, headers })
}

describe('service worker icon caching', () => {
  it('leaves category icon proxies on the network path', async () => {
    // 分类图标的隐私状态可在同一个 URL 下变化；SW 不能撤销旧 Cache Storage 条目。
    // 因此 SW 不接管 `/api/category-icon/*`，由 Worker 的可见性闸门和 edge cache 处理。
    const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400, must-revalidate'))

    expect(await sw.dispatchFetch('https://nav.example.com/api/category-icon/1?v=abc')).toBeNull()
    expect(await sw.dispatchFetch('https://nav.example.com/api/category-icon/2?v=abc&key=grant')).toBeNull()
    expect(sw.puts).toHaveLength(0)
  })

  it('leaves bookmark icon and iconify proxies to HTTP caching', async () => {
    // 性能契约：/api/icon/* 与 /api/iconify/* 不进 Cache Storage。
    const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400, must-revalidate'))

    expect(await sw.dispatchFetch('https://nav.example.com/api/icon/1')).toBeNull()
    expect(await sw.dispatchFetch('https://nav.example.com/api/iconify/mdi/home.svg')).toBeNull()
    expect(sw.puts).toHaveLength(0)
  })

  it('caches a non-opaque cross-origin Iconify response under the size limit', async () => {
    const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400', '20'))

    const response = await sw.dispatchFetch('https://api.iconify.design/mdi/home.svg')

    expect(response?.status).toBe(200)
    expect(sw.puts).toHaveLength(1)
  })

  it('rejects a cross-origin Iconify response without a reliable content length', async () => {
    const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400'))

    const response = await sw.dispatchFetch('https://api.iconify.design/mdi/home.svg')

    expect(response?.status).toBe(200)
    expect(sw.puts).toHaveLength(0)
  })

  it('rejects negative, fractional, and oversized Iconify content lengths', async () => {
    for (const length of ['-1', '1.5', String(512 * 1024 + 1)]) {
      const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400', length))
      const response = await sw.dispatchFetch('https://api.iconify.design/mdi/home.svg')

      expect(response?.status).toBe(200)
      expect(sw.puts).toHaveLength(0)
    }
  })
  it('rejects non-decimal Iconify content lengths', async () => {
    for (const length of ['1e2', '+1', '0x10']) {
      const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400', length))
      const response = await sw.dispatchFetch('https://api.iconify.design/mdi/home.svg')

      expect(response?.status).toBe(200)
      expect(sw.puts, `length=${length}`).toHaveLength(0)
    }
  })

  it('runs install and removes the previous runtime cache on activation', async () => {
    const sw = loadServiceWorker(() => iconResponse('public, max-age=0, s-maxage=518400, must-revalidate'))

    await sw.dispatchInstall()
    await sw.dispatchActivate()

    expect(sw.installedShells).toEqual(['/index.html', '/manifest.webmanifest', '/icon.ico', '/icon.png'])
    expect(sw.deletedCaches).toContain('cf-navs-v16')
    expect(sw.deletedCaches).not.toContain('cf-navs-v17')
    expect(sw.deletedCaches).not.toContain('unrelated-cache')
  })
})
