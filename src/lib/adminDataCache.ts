import type { AdminData } from '../../shared/types'
import { normalizeCategories } from '../../shared/categoryHierarchy'
import { getStoredAuthSession } from './api'
import { clearSnapshots, currentSnapshotOrigin, hashSnapshotScope, pruneOtherSnapshots, readSnapshot, type SnapshotStorageConfig, writeSnapshot } from './snapshotStorage'

type CachedAdminDataPayload = { saved_at: number; version?: string | null; data: AdminData }
export interface CachedAdminDataEntry { version: string | null; data: AdminData }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsePayload(value: unknown): CachedAdminDataEntry | null {
  if (!isRecord(value) || !isRecord(value.data)) return null
  const data = value.data
  if (!Array.isArray(data.categories) || !Array.isArray(data.bookmarks) || !isRecord(data.settings) || typeof data.settings.background_preset_id !== 'string') return null
  const adminData = data as unknown as AdminData
  return {
    version: typeof value.version === 'string' ? value.version : null,
    data: { ...adminData, categories: normalizeCategories(adminData.categories) },
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

export async function readCachedAdminData(): Promise<AdminData | null> { return (await readCachedAdminDataEntry())?.data ?? null }

export async function readCachedAdminDataEntry(): Promise<CachedAdminDataEntry | null> {
  const key = sessionCacheKey()
  if (!key) return null
  await pruneOtherSnapshots(storage, key)
  return readSnapshot(storage, key)
}

export async function writeCachedAdminData(data: AdminData, version: string | null = null): Promise<void> {
  const key = sessionCacheKey()
  if (!key || !data.settings) return
  await pruneOtherSnapshots(storage, key)
  const payload: CachedAdminDataPayload = { saved_at: Date.now(), version, data }
  await writeSnapshot(storage, key, payload)
}

export async function clearCachedAdminData(): Promise<void> { await clearSnapshots(storage) }
