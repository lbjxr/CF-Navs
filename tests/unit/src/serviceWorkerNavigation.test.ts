import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const origin = 'https://example.test'
function redirectedShell(body = '<!doctype html>cached shell'): Response {
  const response = new Response(body, { headers: { 'content-type': 'text/html', 'x-shell': 'preserved' } })
  Object.defineProperty(response, 'redirected', { value: true })
  // A real Cache.match()/Response.clone() preserves the internal redirected flag.
  response.clone = () => redirectedShell(body)
  return response
}

async function navigate(path: string, cached: Response | null, offline = false) {
  let handleFetch!: (event: unknown) => void
  const waits: Promise<unknown>[] = []
  const cache = {
    match: async () => cached?.clone(),
    put: vi.fn(async () => undefined),
  }
  const fetch = vi.fn(async () => {
    if (offline) throw new Error('offline')
    return redirectedShell('<!doctype html>network shell')
  })
  const context = createContext({
    self: {
      addEventListener: (name: string, handler: typeof handleFetch) => { if (name === 'fetch') handleFetch = handler },
      location: new URL(origin + '/sw.js'),
      clients: { matchAll: async () => [] },
    },
    caches: { open: async () => cache, match: async () => cached?.clone() },
    fetch, Request, Response, Headers, URL, Promise, Number, Date, console,
  })
  runInContext(readFileSync('public/sw.js', 'utf8'), context)
  const request = new Request(origin + path, { redirect: 'manual' })
  Object.defineProperty(request, 'mode', { value: 'navigate' })
  let result!: Promise<Response>
  handleFetch({
    request,
    respondWith: (response: Response | Promise<Response>) => { result = Promise.resolve(response) },
    waitUntil: (promise: Promise<unknown>) => { waits.push(promise) },
  })
  const response = await result
  await Promise.all(waits)
  return { response, fetch }
}

describe('service worker navigation response compatibility', () => {
  it.each(['/', '/admin', '/index.html'])('serves redirected cached HTML safely for %s', async (path) => {
    const { response } = await navigate(path, redirectedShell())
    expect(response.redirected).toBe(false)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-shell')).toBe('preserved')
    expect(await response.text()).toBe('<!doctype html>cached shell')
  })

  it('normalizes a cold navigation without losing network content', async () => {
    const { response } = await navigate('/', null)
    expect(response.redirected).toBe(false)
    expect(await response.text()).toBe('<!doctype html>network shell')
  })

  it('keeps cached HTML available offline even if installation followed a redirect', async () => {
    const { response } = await navigate('/', redirectedShell(), true)
    expect(response.redirected).toBe(false)
    expect(await response.text()).toBe('<!doctype html>cached shell')
  })
})
