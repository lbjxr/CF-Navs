// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageLegacySnapshots } from '../../scripts/lib/legacySnapshotProbe.mjs'

const adminKey = 'cf-navs.admin-data.test-scope'
const publicKey = 'cf-navs.public-data.test-scope'
const snapshot = () => ({ icon_snapshot_version: 1, version: 'unchanged-server-version', saved_at: 42, data: { categories: [{ id: 9 }], bookmarks: [
  { id: 1, title: 'Owned fixture', icon_display: 'image', icon: 'generated', icon_blob: 'synthetic', icon_revision: 'r1', icon_cached: true },
  { id: 2, title: 'Unrelated fixture', icon_display: 'image', icon: 'unchanged', icon_revision: 'r2' },
] } })
beforeEach(() => { localStorage.clear(); vi.stubGlobal('caches', { keys: async () => [] }) })
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

describe('owned-profile legacy icon snapshot probe', () => {
  it('damages only named synthetic records and preserves the server version shortcut', async () => {
    const original = snapshot()
    localStorage.setItem(adminKey, JSON.stringify(original))
    const result = await pageLegacySnapshots([1], 'admin', 'seed')
    const stored = JSON.parse(localStorage.getItem(adminKey)!)
    expect(stored.icon_snapshot_version).toBeUndefined()
    expect(stored.version).toBe(original.version)
    expect(stored.saved_at).toBe(42)
    expect(stored.data.categories).toEqual(original.data.categories)
    expect(stored.data.bookmarks[1]).toEqual(original.data.bookmarks[1])
    expect(stored.data.bookmarks[0]).toEqual({ ...original.data.bookmarks[0], icon: null, icon_blob: null, icon_revision: null, icon_cached: false, icon_display: 'empty' })
    expect(result).toEqual([{ storage: 'localStorage', matched: 1, version: null, empty: 1, images: 0 }])
  })
  it('does not expose scope keys, titles, URLs or image bodies in evidence', async () => {
    localStorage.setItem(adminKey, JSON.stringify(snapshot()))
    expect(JSON.stringify(await pageLegacySnapshots([1], 'admin'))).not.toMatch(/Owned|test-scope|generated|synthetic/)
  })
  it('does not modify data in inspect mode', async () => {
    const raw = JSON.stringify(snapshot())
    localStorage.setItem(adminKey, raw)
    expect((await pageLegacySnapshots([1], 'admin'))[0].images).toBe(1)
    expect(localStorage.getItem(adminKey)).toBe(raw)
  })
  it('isolates public and admin snapshots and leaves authentication untouched', async () => {
    const raw = JSON.stringify(snapshot())
    localStorage.setItem(adminKey, raw)
    localStorage.setItem(publicKey, raw)
    localStorage.setItem('cf-navs.auth', 'synthetic-session')
    await pageLegacySnapshots([1], 'public', 'seed')
    expect(localStorage.getItem(adminKey)).toBe(raw)
    expect(localStorage.getItem('cf-navs.auth')).toBe('synthetic-session')
    expect(JSON.parse(localStorage.getItem(publicKey)!).data.bookmarks[0].icon_display).toBe('empty')
  })
  it('returns no readiness evidence when owned records are absent', async () => {
    const raw = JSON.stringify(snapshot())
    localStorage.setItem(adminKey, raw)
    expect(await pageLegacySnapshots([99], 'admin', 'seed')).toEqual([])
    expect(localStorage.getItem(adminKey)).toBe(raw)
  })
  it('covers the CacheStorage fallback without opening unrelated caches', async () => {
    let current = snapshot()
    const request = { url: 'https://example.invalid/snapshot' }
    const open = vi.fn(async () => ({ keys: async () => [request], match: async () => ({ json: async () => structuredClone(current) }), put: async (_key: unknown, value: Response) => { current = await value.json() } }))
    vi.stubGlobal('caches', { keys: async () => ['cf-navs-admin-data-v1', 'unrelated'], open })
    expect(await pageLegacySnapshots([1], 'admin', 'seed')).toEqual([{ storage: 'CacheStorage', matched: 1, version: null, empty: 1, images: 0 }])
    expect(open).toHaveBeenCalledWith('cf-navs-admin-data-v1')
    expect(open).toHaveBeenCalledTimes(1)
    expect(current.data.bookmarks[1]).toEqual(snapshot().data.bookmarks[1])
  })
  it.each([['unknown', 'seed'], ['admin', 'invalid']])('rejects invalid scope/mode %s %s', async (scope, mode) => {
    await expect(pageLegacySnapshots([1], scope, mode)).rejects.toThrow('Invalid legacy')
  })
  it('rejects an empty ownership list', async () => { await expect(pageLegacySnapshots([], 'admin', 'seed')).rejects.toThrow('Invalid legacy') })
})
