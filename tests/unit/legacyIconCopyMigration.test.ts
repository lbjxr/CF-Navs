import { describe, expect, it, vi } from 'vitest'
import {
  createLegacyIconCopyMigrator,
  CURRENT_EXTERNAL_ICON_CACHE_NAME,
  LEGACY_ICON_LOCAL_STORAGE_PREFIX,
  LEGACY_ICON_CACHE_NAMES,
} from '../../src/lib/legacyIconCopyMigration'

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    key(index: number) { return Array.from(values.keys())[index] ?? null },
    removeItem(key: string) { values.delete(key) },
    setItem(key: string, value: string) { values.set(key, value) },
    keys: () => [...values.keys()],
  }
}

describe('legacy icon-copy migration', () => {
  it('removes only known legacy namespaces and preserves current and unrelated storage', async () => {
    const storage = memoryStorage({
      [`${LEGACY_ICON_LOCAL_STORAGE_PREFIX}8-old`]: 'data:image/png;base64,old',
      'cf-navs.icon-device-v1': '{"trusted":true}',
      'cf-navs.theme': 'dark',
      'unrelated.bookmark-icon.value': 'keep',
    })
    const names = [LEGACY_ICON_CACHE_NAMES[0], CURRENT_EXTERNAL_ICON_CACHE_NAME, 'cf-navs-shell-v7']
    const deleted: string[] = []
    const migrate = createLegacyIconCopyMigrator({
      localStorage: () => storage,
      caches: () => ({
        keys: async () => [...names],
        delete: async name => { deleted.push(name); const index = names.indexOf(name); if (index < 0) return false; names.splice(index, 1); return true },
      }),
    })

    const result = await migrate()

    expect(result).toEqual({ complete: true, removedLocalStorageKeys: 1, deletedCaches: [LEGACY_ICON_CACHE_NAMES[0]] })
    expect(storage.keys()).toEqual(['cf-navs.icon-device-v1', 'cf-navs.theme', 'unrelated.bookmark-icon.value'])
    expect(names).toEqual([CURRENT_EXTERNAL_ICON_CACHE_NAME, 'cf-navs-shell-v7'])
    expect(deleted).toEqual([LEGACY_ICON_CACHE_NAMES[0]])
  })

  it('is idempotent and removes a legacy write that appears after the first pass', async () => {
    const storage = memoryStorage({})
    let names = [LEGACY_ICON_CACHE_NAMES[0]]
    const migrate = createLegacyIconCopyMigrator({
      localStorage: () => storage,
      caches: () => ({
        keys: async () => [...names],
        delete: async name => { const before = names.length; names = names.filter(item => item !== name); return before !== names.length },
      }),
    })

    await migrate()
    storage.setItem(`${LEGACY_ICON_LOCAL_STORAGE_PREFIX}9-late`, 'data:image/png;base64,late')
    names.push(LEGACY_ICON_CACHE_NAMES[0])
    const repeated = await migrate(true)

    expect(repeated).toEqual({ complete: true, removedLocalStorageKeys: 1, deletedCaches: [LEGACY_ICON_CACHE_NAMES[0]] })
    expect(storage.keys()).toEqual([])
    expect(names).toEqual([])
  })

  it('reports partial cleanup failures and succeeds on a later retry', async () => {
    const storage = memoryStorage({ [`${LEGACY_ICON_LOCAL_STORAGE_PREFIX}1-old`]: 'old' })
    let denyCacheDelete = true
    const names = [LEGACY_ICON_CACHE_NAMES[0]]
    const migrate = createLegacyIconCopyMigrator({
      localStorage: () => storage,
      caches: () => ({
        keys: async () => [...names],
        delete: async name => {
          if (denyCacheDelete) throw new Error('blocked')
          const index = names.indexOf(name)
          if (index < 0) return false
          names.splice(index, 1)
          return true
        },
      }),
    })

    await expect(migrate()).resolves.toMatchObject({ complete: false, removedLocalStorageKeys: 1 })
    denyCacheDelete = false
    await expect(migrate(true)).resolves.toMatchObject({ complete: true, deletedCaches: [LEGACY_ICON_CACHE_NAMES[0]] })
  })

  it('coalesces overlapping startup scans', async () => {
    const keys = vi.fn(async () => [] as string[])
    const migrate = createLegacyIconCopyMigrator({ localStorage: () => null, caches: () => ({ keys, delete: async () => false }) })
    const [first, second] = await Promise.all([migrate(), migrate(true)])

    expect(first).toEqual(second)
    expect(keys).toHaveBeenCalledTimes(1)
  })
})
