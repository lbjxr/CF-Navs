import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminData, LoginResp } from '../../shared/types'
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

const { authSession } = vi.hoisted(() => ({
  authSession: { current: null as LoginResp | null },
}))

vi.mock('../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api')>()
  return {
    ...actual,
    getStoredAuthSession: () => authSession.current,
  }
})

const adminData: AdminData = {
  categories: [{ id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0, created_at: 100 }],
  bookmarks: [],
  settings: DEFAULT_SETTINGS,
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

function setSession(username: string, token: string): void {
  authSession.current = { username, token, expires_at: 1234567890 }
}

describe('adminDataCache', () => {
  beforeEach(() => {
    vi.resetModules()
    authSession.current = null
    installBrowserStorage()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T00:00:00Z'))
  })

  it('does not read or write when there is no auth session', async () => {
    const { readCachedAdminDataEntry, writeCachedAdminData } = await import('../../src/lib/adminDataCache')

    await writeCachedAdminData(adminData, 'v1')

    expect(await readCachedAdminDataEntry()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('writes and reads a versioned admin snapshot scoped to the active session', async () => {
    setSession('admin', 'token-a')
    const { readCachedAdminDataEntry, writeCachedAdminData } = await import('../../src/lib/adminDataCache')

    await writeCachedAdminData(adminData, 'v1')

    expect(await readCachedAdminDataEntry()).toEqual({ version: 'v1', data: adminData })
  })

  it('removes stale admin snapshots when the active session changes', async () => {
    const storage = installBrowserStorage()
    setSession('admin', 'token-a')
    const { readCachedAdminDataEntry, writeCachedAdminData } = await import('../../src/lib/adminDataCache')

    await writeCachedAdminData(adminData, 'old')
    const oldKey = storage.key(0)
    expect(oldKey).toMatch(/^cf-navs\.admin-data\./)

    setSession('admin', 'token-b')
    await writeCachedAdminData({ ...adminData, categories: [{ ...adminData.categories[0], id: 2 }] }, 'new')

    expect(storage.getItem(oldKey as string)).toBeNull()
    expect(await readCachedAdminDataEntry()).toEqual({
      version: 'new',
      data: { ...adminData, categories: [{ ...adminData.categories[0], id: 2 }] },
    })
  })

  it('clears all admin snapshots but keeps unrelated localStorage keys', async () => {
    const storage = installBrowserStorage()
    setSession('admin', 'token-a')
    const { clearCachedAdminData, writeCachedAdminData } = await import('../../src/lib/adminDataCache')

    await writeCachedAdminData(adminData, 'v1')
    storage.setItem('cf-navs.admin-data.other-session', JSON.stringify({ data: adminData }))
    storage.setItem('unrelated', 'keep')

    await clearCachedAdminData()

    expect(storage.getItem('unrelated')).toBe('keep')
    expect(Array.from({ length: storage.length }, (_, index) => storage.key(index))).toEqual(['unrelated'])
  })

  it('does not retain an oversized aggregate snapshot', async () => {
    const storage = installBrowserStorage()
    setSession('admin', 'token-a')
    const { readCachedAdminDataEntry, writeCachedAdminData } = await import('../../src/lib/adminDataCache')

    await writeCachedAdminData({
      ...adminData,
      categories: [{ ...adminData.categories[0], title: 'x'.repeat(1_600_000) }],
    }, 'large')

    expect(storage.length).toBe(0)
    expect(await readCachedAdminDataEntry()).toBeNull()
  })
})
