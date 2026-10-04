export const LEGACY_ICON_LOCAL_STORAGE_PREFIX = 'cf-navs.bookmark-icon.'
export const LEGACY_ICON_CACHE_NAMES = ['cf-navs-bookmark-icons-v1'] as const
export const CURRENT_EXTERNAL_ICON_CACHE_NAME = 'cf-navs-bookmark-icons-v2'

interface LegacyStorage {
  readonly length: number
  key(index: number): string | null
  removeItem(key: string): void
}

interface LegacyCacheStorage {
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}

export interface LegacyIconMigrationResult {
  complete: boolean
  removedLocalStorageKeys: number
  deletedCaches: string[]
}

export function createLegacyIconCopyMigrator(options: {
  localStorage: () => LegacyStorage | null
  caches: () => LegacyCacheStorage | null
  now?: () => number
}) {
  const now = options.now ?? Date.now
  let inFlight: Promise<LegacyIconMigrationResult> | null = null
  let lastCompletedAt = Number.NEGATIVE_INFINITY
  let lastResult: LegacyIconMigrationResult | null = null

  return async function migrate(force = false): Promise<LegacyIconMigrationResult> {
    if (inFlight) return inFlight
    if (!force && lastResult?.complete && now() - lastCompletedAt < 1500) return lastResult

    const operation = (async (): Promise<LegacyIconMigrationResult> => {
      let complete = true
      let removedLocalStorageKeys = 0
      const deletedCaches: string[] = []

      try {
        const storage = options.localStorage()
        if (storage) {
          for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index)
            if (key?.startsWith(LEGACY_ICON_LOCAL_STORAGE_PREFIX)) {
              storage.removeItem(key)
              removedLocalStorageKeys += 1
            }
          }
        }
      } catch {
        complete = false
      }

      try {
        const cacheStorage = options.caches()
        if (cacheStorage) {
          const names = await cacheStorage.keys()
          for (const name of LEGACY_ICON_CACHE_NAMES) {
            if (!names.includes(name)) continue
            const deleted = await cacheStorage.delete(name)
            if (deleted || !(await cacheStorage.keys()).includes(name)) deletedCaches.push(name)
            else complete = false
          }
        }
      } catch {
        complete = false
      }

      return { complete, removedLocalStorageKeys, deletedCaches }
    })()

    inFlight = operation
    try {
      const result = await operation
      if (result.complete) {
        lastCompletedAt = now()
        lastResult = result
      }
      return result
    } finally {
      if (inFlight === operation) inFlight = null
    }
  }
}

const browserMigrator = createLegacyIconCopyMigrator({
  localStorage: () => typeof window === 'undefined' ? null : window.localStorage,
  caches: () => typeof window === 'undefined' || !('caches' in window) ? null : window.caches,
})

export function migrateLegacyIconCopies(force = false): Promise<LegacyIconMigrationResult> {
  return browserMigrator(force)
}
