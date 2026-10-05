import type { AdminData, PublicData } from '../../shared/types'

// Older clients could persist a locally inferred empty icon after overlooking
// icon_cached. Keep the snapshot for offline use, but bypass its data-version
// shortcut once online. Do not invent an image or delete valid local bodies.
export const ICON_SNAPSHOT_VERSION = 1
export function needsIconSnapshotRefresh(version: unknown, data: AdminData | PublicData): boolean {
  return version !== ICON_SNAPSHOT_VERSION && data.bookmarks.some(bookmark => bookmark.icon_display === 'empty')
}

/** Snapshots retain descriptors, not a second copy of object image bytes. */
export function projectBookmarkIconSnapshot<T extends AdminData | PublicData>(data: T): T {
  let changed = Object.prototype.hasOwnProperty.call(data, 'auth_receipt')
  const categories = data.categories.map(category => {
    const embedded = /^data:image\//i.test(category.icon ?? '')
    if (!embedded && !category.icon_blob) return category
    changed = true
    return { ...category, icon: embedded ? null : category.icon, icon_blob: null, icon_display: 'image' as const }
  })
  const bookmarks = data.bookmarks.map(bookmark => {
    const embedded = /^data:image\//i.test(bookmark.icon ?? '')
    if (!embedded && !bookmark.icon_blob) return bookmark
    changed = true
    return { ...bookmark, icon: embedded ? null : bookmark.icon, icon_blob: null, icon_display: 'image' as const }
  })
  if (!changed) return data
  const { auth_receipt: _receipt, ...metadata } = data
  return { ...metadata, categories, bookmarks } as T
}
