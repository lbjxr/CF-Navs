import type { Bookmark, PublicBookmark } from '../../shared/types'
import type { BookmarkFormValue, CategoryFormValue } from './adminTypes'

export function createCategoryDraft(): Partial<CategoryFormValue> {
  return {
    title: '',
    icon: '',
  }
}

export function createBookmarkDraft(categoryId: string | number | undefined): Partial<BookmarkFormValue> {
  return {
    category_id: categoryId,
    title: '',
    url: '',
    icon: '',
    icon_background_color: '',
    description: '',
    description_mode: 'inherit',
    open_method: 'new_tab',
  }
}

export function findBookmarkForEdit(
  bookmarkId: string | number,
  adminBookmarks: Bookmark[],
  publicBookmarks: PublicBookmark[] = [],
): Bookmark | PublicBookmark | null {
  const id = Number(bookmarkId)
  return (
    adminBookmarks.find((bookmark) => bookmark.id === id) ??
    publicBookmarks.find((bookmark) => bookmark.id === id) ??
    null
  )
}
