import type { AdminData } from '../../shared/types'
import { getStoredAuthSession } from './api'

const CACHE_NAME = 'cf-navs-admin-data-v1'
const CACHE_ORIGIN = 'https://cf-navs.local'
const STORAGE_PREFIX = 'cf-navs.admin-data.'
const MAX_LOCAL_STORAGE_BYTES = 3_500_000

type CachedAdminDataPayload = {
  saved_at: number
  data: AdminData
}

function canUseCacheStorage(): boolean {
  return typeof window !== 'undefined' && 'caches' in window
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && 'localStorage' in window
}

function hash(input: string): string {
  let value = 0
  for (let i = 0; i < input.length; i += 1) {
    value = Math.imul(31, value) + input.charCodeAt(i) | 0
  }
  return Math.abs(value).toString(36)
}

function currentOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'local'
}

function sessionCacheKey(): string | null {
  const session = getStoredAuthSession()
  if (!session) return null
  return `${hash(currentOrigin())}-${hash(`${session.username}:${session.token}:${session.expires_at}`)}`
}

function cacheRequest(cacheKey: string): Request {
  return new Request(`${CACHE_ORIGIN}/admin-data/${encodeURIComponent(cacheKey)}`, {
    method: 'GET',
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAdminData(value: unknown): value is AdminData {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.categories) &&
    Array.isArray(value.bookmarks) &&
    isRecord(value.settings) &&
    typeof value.settings.background_preset_id === 'string'
  )
}

function parsePayload(value: unknown): AdminData | null {
  if (!isRecord(value) || !isAdminData(value.data)) return null
  return value.data
}

async function readCacheStorage(cacheKey: string): Promise<AdminData | null> {
  if (!canUseCacheStorage()) return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(cacheRequest(cacheKey))
    if (!cached) return null
    return parsePayload(await cached.json())
  } catch {
    return null
  }
}

function readLocalStorage(cacheKey: string): AdminData | null {
  if (!canUseLocalStorage()) return null

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${cacheKey}`)
    if (!raw) return null
    return parsePayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function readCachedAdminData(): Promise<AdminData | null> {
  const cacheKey = sessionCacheKey()
  if (!cacheKey) return null

  return readLocalStorage(cacheKey) ?? await readCacheStorage(cacheKey)
}

export async function writeCachedAdminData(data: AdminData): Promise<void> {
  const cacheKey = sessionCacheKey()
  if (!cacheKey || !data.settings) return

  const payload: CachedAdminDataPayload = {
    saved_at: Date.now(),
    data,
  }
  const serialized = JSON.stringify(payload)

  if (canUseCacheStorage()) {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(
        cacheRequest(cacheKey),
        new Response(serialized, {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        }),
      )
    } catch {
      // Browser cache persistence is best-effort.
    }
  }

  if (canUseLocalStorage() && serialized.length <= MAX_LOCAL_STORAGE_BYTES) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${cacheKey}`, serialized)
    } catch {
      // Quota/private mode failures should not block the app.
    }
  }
}

export async function clearCachedAdminData(): Promise<void> {
  if (canUseCacheStorage()) {
    try {
      await caches.delete(CACHE_NAME)
    } catch {
      // Best-effort cleanup.
    }
  }

  if (canUseLocalStorage()) {
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (key?.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key)
        }
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}
