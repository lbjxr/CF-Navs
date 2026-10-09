// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageInstallSnapshotInterruption, pageReadSnapshotScopes } from '../../scripts/lib/snapshotInterruptionProbe.mjs'

const title = 'Browser edited abcdef12'
const payload = JSON.stringify({ data: { bookmarks: [{ id: 1, title }, { id: 2, title: 'Private fixture' }] } })
const oldKey = 'cf-navs.admin-data.old'
let bodies: Map<string, string>
let nativePut: ReturnType<typeof vi.fn>
class TestCache {
  async put(request: Request, response: Response) { await nativePut(request, response) }
  async keys() { return [...bodies.keys()].map(url => new Request(url)) }
  async match(request: Request) { const value = bodies.get(request.url); return value ? new Response(value) : undefined }
}
const probe = () => (window as any).__snapshotInterruption
beforeEach(() => {
  bodies = new Map()
  nativePut = vi.fn(async (request: Request, response: Response) => { bodies.set(request.url, await response.text()) })
  vi.stubGlobal('Cache', TestCache)
  vi.stubGlobal('caches', { keys: async () => ['cf-navs-admin-data-v1'], open: async () => new TestCache() })
  localStorage.clear()
})
afterEach(() => { probe()?.restore(); delete (window as any).__snapshotInterruption; vi.unstubAllGlobals() })

describe('native snapshot interruption probe', () => {
  it.each(['before', 'after'])('holds the %s boundary of a real matching cache write', async boundary => {
    pageInstallSnapshotInterruption({ storage: 'cache', boundary, bookmarkId: 1, title, privateId: 2 })
    const request = new Request('https://cf-navs.local/admin-data/old')
    expect(() => localStorage.setItem(oldKey, payload)).toThrow('Owned snapshot fallback probe')
    localStorage.setItem('unrelated', 'keep')
    const operation = new TestCache().put(request, new Response(payload))
    await vi.waitFor(() => expect(probe().state.held).toBe(true))
    expect(nativePut).toHaveBeenCalledTimes(boundary === 'after' ? 1 : 0)
    expect(probe().state.finished).toBe(false)
    probe().release(); await operation
    expect(nativePut).toHaveBeenCalledOnce()
    expect(bodies.get(request.url)).toBe(payload)
    expect(probe().state.finished).toBe(true)
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })

  it('does not hold unrelated data, public snapshots or a second write', async () => {
    pageInstallSnapshotInterruption({ storage: 'cache', boundary: 'before', bookmarkId: 1, title, privateId: 2 })
    const cache = new TestCache()
    await cache.put(new Request('https://cf-navs.local/public-data/public'), new Response(payload))
    await cache.put(new Request('https://cf-navs.local/admin-data/other'), new Response('{}'))
    expect(probe().state.hits).toBe(0)
    const request = new Request('https://cf-navs.local/admin-data/old')
    const pending = cache.put(request, new Response(payload))
    await vi.waitFor(() => expect(probe().state.held).toBe(true))
    probe().release(); await pending
    await cache.put(request, new Response(payload))
    expect(probe().state.hits).toBe(1)
    expect(nativePut).toHaveBeenCalledTimes(4)
  })

  it('detects deletion followed by rebuilding, which final-state assertions miss', async () => {
    pageInstallSnapshotInterruption({ storage: 'local', boundary: 'after', bookmarkId: 1, title, privateId: 2 })
    localStorage.setItem(oldKey, payload)
    localStorage.setItem('cf-navs.admin-data.new', payload)
    probe().protect('new')
    localStorage.removeItem('unrelated')
    localStorage.removeItem('cf-navs.admin-data.new')
    localStorage.setItem('cf-navs.admin-data.new', payload)
    expect(probe().state.protectedRemovals).toBe(1)
    const rows = await pageReadSnapshotScopes(1, title, 2)
    expect(rows.find((row: any) => row.scope === 'new')).toMatchObject({ titleMatches: true, privatePresent: true })
    expect(JSON.stringify(rows)).not.toContain(title)
    expect(probe().restore().restored).toBe(true)
  })
})
