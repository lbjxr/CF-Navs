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
  const listeners: Record<string, FetchListener> = {}

  const cache = {
    async put(request: Request | string, response: Response) {
      const url = typeof request === 'string' ? request : request.url
      puts.push({ url, cacheControl: response.headers.get('Cache-Control') })
    },
    async addAll() { },
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
        return []
      },
      async delete() {
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
  }
}

function iconResponse(cacheControl: string): Response {
  return new Response('<svg/>', {
    status: 200,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': cacheControl },
  })
}

describe('service worker icon caching', () => {
  it('caches a public category icon so repeat visits skip the network', async () => {
    const sw = loadServiceWorker(() => iconResponse('public, max-age=604800, s-maxage=518400, immutable'))

    const response = await sw.dispatchFetch('https://nav.example.com/api/category-icon/1?v=abc')

    expect(response?.status).toBe(200)
    expect(sw.puts).toHaveLength(1)
    expect(sw.puts[0].url).toContain('/api/category-icon/1')
  })

  it('never writes a no-store category icon to Cache Storage', async () => {
    // 私密对象的图标只在带签名授权时返回真实内容，服务端标记 `private, no-store`。
    // Cache Storage 不会自己遵守 Cache-Control：写进去就会被后续访客态 cache-first 命中。
    const sw = loadServiceWorker(() => iconResponse('private, no-store'))

    const response = await sw.dispatchFetch('https://nav.example.com/api/category-icon/2?key=1799999999999.sig')

    expect(response?.status).toBe(200)
    expect(sw.puts).toHaveLength(0)
  })

  it('leaves bookmark icon and iconify proxies to HTTP caching', async () => {
    // 性能契约：/api/icon/* 与 /api/iconify/* 不进 Cache Storage
    const sw = loadServiceWorker(() => iconResponse('public, max-age=604800'))

    expect(await sw.dispatchFetch('https://nav.example.com/api/icon/1')).toBeNull()
    expect(await sw.dispatchFetch('https://nav.example.com/api/iconify/mdi/home.svg')).toBeNull()
    expect(sw.puts).toHaveLength(0)
  })
})
