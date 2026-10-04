import type { AdminData, PublicData } from '../../shared/types'

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
