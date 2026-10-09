import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginResp } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

const auth = vi.hoisted(() => ({ session: null as LoginResp | null }))
vi.mock('../../src/lib/api', () => ({ getStoredAuthSession: () => auth.session }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}

const data = { categories: [], bookmarks: [], settings: DEFAULT_SETTINGS }
let entries: Map<string, Response>
let cache: { keys: ReturnType<typeof vi.fn>; match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
let storage: { open: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetModules()
  auth.session = { username: 'test-admin', token: 'session-a', expires_at: 9999999999999 }
  entries = new Map()
  cache = {
    keys: vi.fn(async () => [...entries.keys()].map(url => new Request(url))),
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response) }),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  }
  storage = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => { entries.clear(); return true }),
  }
  // Cache Storage is the fallback when localStorage is unavailable.
  vi.stubGlobal('caches', storage)
  vi.stubGlobal('window', { caches: storage, location: { origin: 'https://example.test' } })
})

afterEach(() => vi.unstubAllGlobals())

describe('admin snapshot operation ownership', () => {
  it('preserves another tab snapshot when old writing and queued logout finish after its login', async () => {
    const oldTab = await import('../../src/lib/adminDataCache')
    const pending = deferred<void>()
    cache.put.mockImplementationOnce(async (request: Request, response: Response) => {
      await pending.promise
      entries.set(request.url, response)
    })
    const writing = oldTab.writeCachedAdminData(data, 'old')
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce())
    auth.session = null
    const clearing = oldTab.clearCachedAdminData()
    // Separate module instances model independent per-tab promise queues.
    vi.resetModules()
    const newTab = await import('../../src/lib/adminDataCache')
    auth.session = { username: 'test-admin', token: 'session-b', expires_at: 9999999999999 }
    await newTab.writeCachedAdminData(data, 'new')
    const newKey = [...entries.keys()][0]
    cache.delete.mockClear(); storage.delete.mockClear()
    pending.resolve(); await Promise.all([writing, clearing])
    expect(storage.delete).not.toHaveBeenCalled()
    expect(cache.delete.mock.calls.every(([request]) => request.url !== newKey)).toBe(true)
    expect(await newTab.readCachedAdminDataEntry()).toEqual({ data, version: 'new' })
    expect(entries.size).toBe(1)
  })

  it('finishes a pending old write before logout cleanup and a new-session write', async () => {
    const { writeCachedAdminData, clearCachedAdminData, readCachedAdminDataEntry } = await import('../../src/lib/adminDataCache')
    const pending = deferred<void>()
    cache.put.mockImplementationOnce(async (request: Request, response: Response) => {
      await pending.promise
      entries.set(request.url, response)
    })
    const oldWrite = writeCachedAdminData(data, 'old')
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce())
    auth.session = null
    const clear = clearCachedAdminData()
    auth.session = { username: 'test-admin', token: 'session-b', expires_at: 9999999999999 }
    const newWrite = writeCachedAdminData(data, 'new')
    pending.resolve()
    await Promise.all([oldWrite, clear, newWrite])
    expect(entries.size).toBe(1)
    expect(await readCachedAdminDataEntry()).toEqual({ data, version: 'new' })
  })

  it('does not write after the session changes during pruning', async () => {
    const { writeCachedAdminData } = await import('../../src/lib/adminDataCache')
    const pending = deferred<typeof cache>()
    storage.open.mockReturnValueOnce(pending.promise)
    const writing = writeCachedAdminData(data, 'old')
    await vi.waitFor(() => expect(storage.open).toHaveBeenCalledOnce())
    auth.session = null
    pending.resolve(cache)
    await writing
    expect(cache.put).not.toHaveBeenCalled()
    expect(entries.size).toBe(0)
  })

  it('removes an already-started write if its refresh becomes obsolete in the same session', async () => {
    const { writeCachedAdminData } = await import('../../src/lib/adminDataCache')
    let current = true
    const pending = deferred<void>()
    cache.put.mockImplementationOnce(async (request: Request, response: Response) => {
      await pending.promise
      entries.set(request.url, response)
    })
    const writing = writeCachedAdminData(data, 'old', () => current)
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce())
    current = false
    pending.resolve()
    await writing
    expect(entries.size).toBe(0)
  })

  it('discards a cached response resolved after logout', async () => {
    const { readCachedAdminDataEntry } = await import('../../src/lib/adminDataCache')
    const pending = deferred<Response>()
    cache.match.mockReturnValueOnce(pending.promise)
    const reading = readCachedAdminDataEntry()
    await vi.waitFor(() => expect(cache.match).toHaveBeenCalledOnce())
    auth.session = null
    pending.resolve(new Response(JSON.stringify({ data, version: 'old' })))
    expect(await reading).toBeNull()
  })
})
