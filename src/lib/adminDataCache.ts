import { ICON_SNAPSHOT_VERSION, needsIconSnapshotRefresh, projectBookmarkIconSnapshot } from './iconSnapshot'
import type { AdminData } from '../../shared/types'
import { normalizeCategories } from '../../shared/categoryHierarchy'
import { getStoredAuthSession } from './api'
import { isRecord } from './guards'
import { clearSnapshots, currentSnapshotOrigin, hashSnapshotScope, pruneOtherSnapshots, readSnapshot, type SnapshotStorageConfig, writeSnapshot } from './snapshotStorage'

type CachedAdminDataPayload = { saved_at: number; icon_snapshot_version: number; version?: string | null; data: AdminData }
export interface CachedAdminDataEntry { version: string | null; data: AdminData; needsIconProjection?: boolean }

function parsePayload(value: unknown): CachedAdminDataEntry | null {
  if (!isRecord(value) || !isRecord(value.data)) return null
  const data = value.data
  if (!Array.isArray(data.categories) || !Array.isArray(data.bookmarks) || !isRecord(data.settings) || typeof data.settings.background_preset_id !== 'string') return null
  const adminData = data as unknown as AdminData
  const projected = projectBookmarkIconSnapshot(adminData)
  return {
    ...(projected !== adminData ? { needsIconProjection: true } : {}),
    version: !needsIconSnapshotRefresh(value.icon_snapshot_version, projected) && typeof value.version === 'string' ? value.version : null,
    data: { ...projected, categories: normalizeCategories(projected.categories) },
  }
}

const storage: SnapshotStorageConfig<CachedAdminDataEntry> = {
  cacheName: 'cf-navs-admin-data-v1',
  cachePathPrefix: '/admin-data/',
  storagePrefix: 'cf-navs.admin-data.',
  parse: parsePayload,
}

function sessionCacheKey(): string | null {
  const session = getStoredAuthSession()
  if (!session) return null
  return `${hashSnapshotScope(currentSnapshotOrigin())}-${hashSnapshotScope(`${session.username}:${session.token}:${session.expires_at}`)}`
}

// A clear must finish after an already-started write, and before a new session's
// write. Serializing this small persistence boundary prevents cache resurrection
// without coupling storage to stores or UI lifecycles.
let pendingStorage: Promise<void> = Promise.resolve()
function withStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingStorage.then(operation)
  pendingStorage = result.then(() => undefined, () => undefined)
  return result
}

export function readCachedAdminDataEntry(isCurrent: () => boolean = () => true): Promise<CachedAdminDataEntry | null> {
  const key = sessionCacheKey()
  const valid = () => key !== null && isCurrent() && sessionCacheKey() === key
  return withStorage(async () => {
    if (!valid() || !key) return null
    await pruneOtherSnapshots(storage, key)
    if (!valid()) return null
    const entry = await readSnapshot(storage, key)
    if (entry?.needsIconProjection && valid()) await writeSnapshot(storage, key, { saved_at: Date.now(), icon_snapshot_version: ICON_SNAPSHOT_VERSION, version: entry.version, data: entry.data })
    return valid() ? entry : null
  })
}

export function writeCachedAdminData(
  data: AdminData,
  version: string | null = null,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const key = sessionCacheKey()
  const valid = () => key !== null && isCurrent() && sessionCacheKey() === key
  return withStorage(async () => {
    if (!valid() || !key || !data.settings) return
    await pruneOtherSnapshots(storage, key)
    if (!valid()) return
    const payload: CachedAdminDataPayload = { saved_at: Date.now(), icon_snapshot_version: ICON_SNAPSHOT_VERSION, version, data: projectBookmarkIconSnapshot(data) }
    await writeSnapshot(storage, key, payload)
    // A native Cache.put already in flight cannot be aborted. Remove its result
    // before letting the next queued operation (including a new login) proceed.
    if (!valid()) await clearSnapshots(storage)
  })
}

export function clearCachedAdminData(): Promise<void> {
  return withStorage(() => clearSnapshots(storage))
}
