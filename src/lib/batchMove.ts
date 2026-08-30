import type { BookmarkBatchMovePosition, BookmarkBatchMoveReq } from '../../shared/types'
import type { AdminBookmarkSummary } from './appData'

export function buildBookmarkBatchMoveRequest(
  bookmarks: AdminBookmarkSummary[],
  categoryId: number,
  position: BookmarkBatchMovePosition,
): BookmarkBatchMoveReq | null {
  if (!Number.isInteger(categoryId) || categoryId <= 0 || bookmarks.length === 0) return null

  const expected = bookmarks.map((bookmark) => ({
    id: Number(bookmark.id),
    category_id: Number(bookmark.category_id),
    sort: Number(bookmark.sort),
  }))
  if (expected.some((item) => !Number.isInteger(item.id) || !Number.isInteger(item.category_id) || !Number.isInteger(item.sort))) {
    return null
  }

  return {
    ids: expected.map((item) => item.id),
    category_id: categoryId,
    position,
    expected,
  }
}
