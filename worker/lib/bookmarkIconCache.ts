import type { IconSource } from '../../shared/types'
import { fetchCacheableIcon, iconBytesToDataUri, shouldPersistIconBlob } from './iconData'
import { setIconBlob } from './db'

export interface BookmarkIconCacheResult {
  iconBlob: string | null
  reuseExisting: boolean
  wrote: boolean
}

export async function cacheBookmarkIconBlob(
  db: D1Database,
  bookmarkId: number,
  iconUrl: string | null | undefined,
  iconSource: IconSource | string | null | undefined,
  timeoutMs?: number,
): Promise<BookmarkIconCacheResult> {
  if (!iconUrl) {
    await setIconBlob(db, bookmarkId, null)
    return { iconBlob: null, reuseExisting: false, wrote: true }
  }

  if (iconUrl.startsWith('data:image/')) {
    await setIconBlob(db, bookmarkId, iconUrl)
    return { iconBlob: iconUrl, reuseExisting: false, wrote: true }
  }

  if (!shouldPersistIconBlob(iconUrl, iconSource)) {
    await setIconBlob(db, bookmarkId, null)
    return { iconBlob: null, reuseExisting: false, wrote: true }
  }

  const icon = await fetchCacheableIcon(iconUrl, timeoutMs)
  if (!icon) return { iconBlob: null, reuseExisting: true, wrote: false }

  const blob = iconBytesToDataUri(icon)
  await setIconBlob(db, bookmarkId, blob)
  return { iconBlob: blob, reuseExisting: false, wrote: true }
}
