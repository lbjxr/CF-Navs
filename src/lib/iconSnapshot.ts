import type { AdminData, PublicData } from '../../shared/types'

/** Snapshots retain descriptors, not a second copy of bookmark image bytes. */
export function projectBookmarkIconSnapshot<T extends AdminData | PublicData>(data: T): T {
  let changed = Object.prototype.hasOwnProperty.call(data, 'auth_receipt')
  const bookmarks = data.bookmarks.map(bookmark => {
    const embedded = /^data:image\//i.test(bookmark.icon ?? '')
    if (!embedded && !bookmark.icon_blob) return bookmark
    changed = true
    return { ...bookmark, icon: embedded ? null : bookmark.icon, icon_blob: null, icon_display: 'image' as const }
  })
  if (!changed) return data
  const { auth_receipt: _receipt, ...metadata } = data
  return { ...metadata, bookmarks } as T
}
