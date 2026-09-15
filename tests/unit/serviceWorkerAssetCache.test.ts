import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type LifecycleEventLike = {
  waitUntil(promise: Promise<unknown>): void
}

type FetchEventLike = LifecycleEventLike & {
  request: Request
  respondWith(response: Response | Promise<Response>): void
}

type MessageEventLike = LifecycleEventLike & {
  data: unknown
}

type CacheRecord = {
  url: string
  contentType: string | null
}

const ORIGIN = 'https://nav.example.com'

function cacheKey(input: Request | string): string {
  return new URL(typeof input === 'string' ? input : input.url, ORIGIN).href
}

function loadServiceWorker(
  networkResponse: (request: Request) => Response | Promise<Response>,
  initialEntries: Array<[string, Response]> = [],
  cacheNames: string[] = ['cf-navs-v16'],
) {
  const entries = new Map(initialEntries.map(([url, response]) => [cacheKey(url), response.clone()]))
  const puts: CacheRecord[] = []
  const deletes: string[] = []
  const deletedCaches: string[] = []
  const listeners: Record<string, ((event: FetchEventLike | MessageEventLike | LifecycleEventLike) => void)> = {}

  const cache = {
    async put(request: Request | string, response: Response) {
      entries.set(cacheKey(request), response.clone())
      puts.push({
        url: cacheKey(request),
        contentType: response.headers.get('content-type'),
      })
    },
    async match(request: Request | string) {
      return entries.get(cacheKey(request))?.clone()
    },
    async delete(request: Request | string) {
      const key = cacheKey(request)
      deletes.push(key)
      return entries.delete(key)
    },
    async addAll() { },
    async keys() {
      return [...entries.keys()].map((url) => new Request(url))
    },
  }

  const context = createContext({
    self: {
      addEventListener(type: string, listener: (event: FetchEventLike | MessageEventLike) => void) {
        listeners[type] = listener
      },
      location: new URL(`${ORIGIN}/sw.js`),
      skipWaiting: async () => { },
      clients: { claim: async () => { }, matchAll: async () => [] },
      registration: { waiting: null },
    },
    caches: {
      async open() {
        return cache
      },
      async match(request: Request | string) {
        return cache.match(request)
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
    deletes,
    deletedCaches,
    async dispatchFetch(url: string, navigate = false) {
      const request = new Request(url)
      if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' })
      let response: Response | Promise<Response> | null = null
      const pending: Promise<unknown>[] = []
      listeners.fetch?.({
        request,
        respondWith(value) {
          response = value
        },
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      const result = response ? await response : null
      await Promise.all(pending)
      for (let index = 0; index < 4; index += 1) await Promise.resolve()
      return result
    },
    async dispatchActivate() {
      const pending: Promise<unknown>[] = []
      listeners.activate?.({
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      await Promise.all(pending)
      for (let index = 0; index < 4; index += 1) await Promise.resolve()
    },
    async dispatchMessage(data: unknown) {
      const pending: Promise<unknown>[] = []
      listeners.message?.({
        data,
        waitUntil(promise) {
          pending.push(promise)
        },
      })
      await Promise.all(pending)
      for (let index = 0; index < 4; index += 1) await Promise.resolve()
    },
  }
}

describe('service worker build-asset caching', () => {
  it('returns a 404 and never caches HTML at missing JS or CSS asset URLs', async () => {
    const sw = loadServiceWorker(() => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    const responses = await Promise.all([
      sw.dispatchFetch(`${ORIGIN}/assets/missing.js`),
      sw.dispatchFetch(`${ORIGIN}/assets/missing.css`),
    ])

    expect(responses.map((response) => response?.status)).toEqual([404, 404])
    expect(responses.every((response) => response?.headers.get('Content-Type')?.includes('text/plain'))).toBe(true)
    expect(sw.puts).toHaveLength(0)
  })

  it('does not serve the cached shell for a navigated asset URL', async () => {
    const sw = loadServiceWorker(() => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }), [
      [`${ORIGIN}/index.html`, new Response('<!doctype html>shell', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })],
    ])

    const response = await sw.dispatchFetch(`${ORIGIN}/assets/missing.js`, true)

    expect(response?.status).toBe(404)
    expect(response?.headers.get('Content-Type')).toContain('text/plain')
    expect(sw.puts).toHaveLength(0)
  })

  it('evicts a cached HTML asset before retrying the network', async () => {
    const sw = loadServiceWorker(() => new Response('export default 1', {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
    }), [
      [`${ORIGIN}/assets/stale.js`, new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })],
    ])

    const response = await sw.dispatchFetch(`${ORIGIN}/assets/stale.js`)

    expect(response?.status).toBe(200)
    expect(await response?.text()).toBe('export default 1')
    expect(sw.deletes).toContain(`${ORIGIN}/assets/stale.js`)
    expect(sw.puts).toEqual([{
      url: `${ORIGIN}/assets/stale.js`,
      contentType: 'text/javascript; charset=utf-8',
    }])
  })

  it('does not precache an HTML response for an asset manifest entry', async () => {
    const sw = loadServiceWorker(() => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    await sw.dispatchMessage({
      type: 'precache-assets',
      urls: [`${ORIGIN}/assets/missing.css`],
    })

    expect(sw.puts).toHaveLength(0)
  })

  it('removes every previous runtime cache during activation', async () => {
    const sw = loadServiceWorker(
      () => new Response('ok'),
      [],
      ['cf-navs-v15', 'cf-navs-v16', 'cf-navs-veabae17f0b0e'],
    )

    await sw.dispatchActivate()

    expect(sw.deletedCaches).toEqual(['cf-navs-v15', 'cf-navs-veabae17f0b0e'])
  })
})
