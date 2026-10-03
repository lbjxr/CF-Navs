import type { IconSource } from '../../shared/types'
import { ICON_COPY_MAX_BYTES } from '../../shared/iconLocalCopy'
import { fetchIcon, iconBytesToDataUri } from './iconData'
import { getBookmarkIconData, setIconBlob } from './db'

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
  // Claim before fetching, so a later explicit refresh or source edit wins.
  const expected = await getBookmarkIconData(db, bookmarkId, true)
  const unchanged = { iconBlob: null, reuseExisting: true, wrote: false }
  if (!expected || expected.icon !== (iconUrl ?? null) || expected.icon_source !== (iconSource ?? null)) return unchanged
  let blob: string | null = null
  if (iconUrl?.startsWith('data:image/')) {
    blob = iconUrl
  } else if (iconUrl && /^https?:\/\//i.test(iconUrl)) {
    const outcome = await fetchIcon(iconUrl, timeoutMs, ICON_COPY_MAX_BYTES)
    if (!outcome.ok) return unchanged
    blob = iconBytesToDataUri(outcome.icon)
  }
  const wrote = await setIconBlob(db, bookmarkId, blob, expected)
  return wrote ? { iconBlob: blob, reuseExisting: false, wrote: true } : unchanged
}
