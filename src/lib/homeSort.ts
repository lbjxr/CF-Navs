import type { BookmarkReorganizeReq, PublicBookmark, PublicCategory } from '../../shared/types'

export function moveBookmarkToCategory(
  draft: PublicBookmark[],
  bookmarkId: number,
  targetCategoryId: number,
): PublicBookmark[] | null {
  const bookmark = draft.find((item) => item.id === bookmarkId)
  if (!bookmark || bookmark.category_id === targetCategoryId) return null

  return [
    ...draft.filter((item) => item.id !== bookmarkId),
    { ...bookmark, category_id: targetCategoryId },
  ]
}

export function buildHomeSortCategoryOrders(
  categories: PublicCategory[],
  draft: PublicBookmark[],
): BookmarkReorganizeReq['category_orders'] {
  const grouped = new Map<number, number[]>()
  for (const category of categories) grouped.set(category.id, [])
  for (const bookmark of draft) grouped.get(bookmark.category_id)?.push(bookmark.id)

  return categories.map((category) => ({
    category_id: category.id,
    ids: grouped.get(category.id) ?? [],
  }))
}
