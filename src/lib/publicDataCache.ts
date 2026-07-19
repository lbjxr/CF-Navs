import type { PublicData } from '../../shared/types'
import { normalizeCategories } from '../../shared/categoryHierarchy'
import { clearSnapshots, currentSnapshotOrigin, hashSnapshotScope, readSnapshot, type SnapshotStorageConfig, writeSnapshot } from './snapshotStorage'

type CachedPublicDataPayload = { saved_at: number; version?: string | null; data: PublicData }
export interface CachedPublicDataEntry { version: string | null; data: PublicData }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsePayload(value: unknown): CachedPublicDataEntry | null {
  if (!isRecord(value) || !isRecord(value.data)) return null
  if (!Array.isArray(value.data.categories) || !Array.isArray(value.data.bookmarks) || !isRecord(value.data.settings)) return null
  const data = value.data as unknown as PublicData
  return {
    version: typeof value.version === 'string' ? value.version : null,
    data: { ...data, categories: normalizeCategories(data.categories) },
  }
}

const storage: SnapshotStorageConfig<CachedPublicDataEntry> = {
  cacheName: 'cf-navs-public-data-v1',
  cachePathPrefix: '/public-data/',
  storagePrefix: 'cf-navs.public-data.',
  parse: parsePayload,
}

function cacheKey(): string { return hashSnapshotScope(currentSnapshotOrigin()) }

export async function readCachedPublicDataEntry(): Promise<CachedPublicDataEntry | null> {
  return readSnapshot(storage, cacheKey())
}

export async function writeCachedPublicData(data: PublicData, version: string | null = null): Promise<void> {
  const payload: CachedPublicDataPayload = { saved_at: Date.now(), version, data }
  await writeSnapshot(storage, cacheKey(), payload)
}

export async function clearCachedPublicData(): Promise<void> { await clearSnapshots(storage) }
