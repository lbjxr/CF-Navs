import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicData } from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

const publicData: PublicData = {
  categories: [{ id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0 }],
  bookmarks: [],
  settings: toPublicSettings(DEFAULT_SETTINGS),
}

function installBrowserStorage(origin = 'https://navs.example.test'): MemoryStorage {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage, location: { origin } },
    configurable: true,
  })
  return storage
}

describe('publicDataCache', () => {
  it('refreshes legacy empty-icon metadata without discarding the offline snapshot', async () => {
    const { readCachedPublicDataEntry, writeCachedPublicData } = await import('../../src/lib/publicDataCache')
    const data = { ...publicData, bookmarks: [{ id: 7, icon_display: 'empty', icon_cached: false }] } as PublicData
    await writeCachedPublicData(data, 'v1')
    const key = localStorage.key(0)!
    const payload = JSON.parse(localStorage.getItem(key)!)
    delete payload.icon_snapshot_version
    localStorage.setItem(key, JSON.stringify(payload))
    const restored = await readCachedPublicDataEntry()
    expect(restored?.version).toBeNull()
    expect(restored?.data.bookmarks).toEqual(data.bookmarks)
    // A successful remote refresh writes a current snapshot; valid empty icons
    // must not force a full data download on every subsequent page load.
    await writeCachedPublicData(data, 'v2')
    expect((await readCachedPublicDataEntry())?.version).toBe('v2')
  })
  it('does not invalidate unaffected legacy snapshots', async () => {
    const { readCachedPublicDataEntry, writeCachedPublicData } = await import('../../src/lib/publicDataCache')
    await writeCachedPublicData(publicData, 'v1')
    const key = localStorage.key(0)!
    const payload = JSON.parse(localStorage.getItem(key)!)
    delete payload.icon_snapshot_version
    localStorage.setItem(key, JSON.stringify(payload))
    expect((await readCachedPublicDataEntry())?.version).toBe('v1')
  })

  beforeEach(() => {
    vi.resetModules()
    installBrowserStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00Z'))
  })

  it('writes and reads a versioned public data snapshot from localStorage', async () => {
    const { readCachedPublicDataEntry, writeCachedPublicData } = await import('../../src/lib/publicDataCache')

    await writeCachedPublicData(publicData, 'v1')

    expect(await readCachedPublicDataEntry()).toEqual({ version: 'v1', data: publicData })
  })

  it('returns null for invalid cached JSON instead of blocking startup', async () => {
    const storage = installBrowserStorage()
    const { readCachedPublicDataEntry, writeCachedPublicData } = await import('../../src/lib/publicDataCache')

    await writeCachedPublicData(publicData, 'v1')
    const key = storage.key(0)
    expect(key).toBeTruthy()
    storage.setItem(key as string, '{not-json')

    expect(await readCachedPublicDataEntry()).toBeNull()
  })

  it('clears all public data snapshots for every origin key', async () => {
    const storage = installBrowserStorage()
    const { clearCachedPublicData, writeCachedPublicData } = await import('../../src/lib/publicDataCache')

    await writeCachedPublicData(publicData, 'v1')
    storage.setItem('cf-navs.public-data.other-origin', JSON.stringify({ data: publicData }))
    storage.setItem('unrelated', 'keep')

    await clearCachedPublicData()

    expect(storage.getItem('unrelated')).toBe('keep')
    expect(Array.from({ length: storage.length }, (_, index) => storage.key(index))).toEqual(['unrelated'])
  })

  it('does not retain an oversized aggregate snapshot', async () => {
    const storage = installBrowserStorage()
    const { readCachedPublicDataEntry, writeCachedPublicData } = await import('../../src/lib/publicDataCache')

    await writeCachedPublicData({
      ...publicData,
      categories: [{ ...publicData.categories[0], title: 'x'.repeat(1_600_000) }],
    }, 'large')

    expect(storage.length).toBe(0)
    expect(await readCachedPublicDataEntry()).toBeNull()
  })
})
