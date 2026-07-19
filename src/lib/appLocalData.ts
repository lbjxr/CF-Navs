import type { Bookmark, Category, PublicBookmark, PublicCategory } from '../../shared/types'
import { toPublicBookmark } from './appData'

type SortableRow = {
  id: number
  sort: number
}

export function upsertById<T extends { id: number }>(items: T[], item: T): T[] {
  const exists = items.some((current) => current.id === item.id)
  return exists
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item]
}

export function removeById<T extends { id: number }>(items: T[], id: number): T[] {
  return items.filter((item) => item.id !== id)
}

export function removeBookmarksByCategory<T extends { category_id: number }>(bookmarks: T[], categoryId: number): T[] {
  return bookmarks.filter((bookmark) => bookmark.category_id !== categoryId)
}

export function updateBookmarkIconBlob<T extends { id: number; icon_blob: string | null }>(
  bookmarks: T[],
  bookmarkId: number,
  iconBlob: string | null,
): T[] {
  return bookmarks.map((bookmark) => (
    bookmark.id === bookmarkId ? { ...bookmark, icon_blob: iconBlob } : bookmark
  ))
}

export function applySortOrder<T extends SortableRow>(items: T[], ids: number[]): T[] {
  const sortById = new Map(ids.map((id, index) => [id, index]))

  return items
    .map((item) => (
      sortById.has(item.id)
        ? { ...item, sort: sortById.get(item.id) ?? item.sort }
        : item
    ))
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
}

export function applyCategorySiblingSort<T extends SortableRow & { parent_id: number | null }>(
  items: T[],
  parentId: number | null,
  ids: number[],
): T[] {
  const sortById = new Map(ids.map((id, index) => [id, index]))
  return items.map((item) => (
    item.parent_id === parentId && sortById.has(item.id)
      ? { ...item, sort: sortById.get(item.id) ?? item.sort }
      : item
  ))
}

export function upsertPublicBookmark(bookmarks: PublicBookmark[], bookmark: Bookmark): PublicBookmark[] {
  return upsertById(bookmarks, toPublicBookmark(bookmark))
}

export function buildPublicDataAfterCategoryDelete(
  categories: PublicCategory[],
  bookmarks: PublicBookmark[],
  categoryId: number,
): { categories: PublicCategory[]; bookmarks: PublicBookmark[] } {
  return {
    categories: removeById(categories, categoryId),
    bookmarks: removeBookmarksByCategory(bookmarks, categoryId),
  }
}

export function buildOrderedBookmarkIdsForCategory<T extends SortableRow & { category_id: number }>(
  bookmarks: T[],
  categoryId: number,
  orderedIdsInCategory: number[],
): number[] {
  const newOrderQueue = orderedIdsInCategory.map((id) => Number(id))
  let queueIndex = 0

  return [...bookmarks]
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((bookmark) => {
      if (bookmark.category_id === categoryId) {
        const replacement = newOrderQueue[queueIndex] ?? bookmark.id
        queueIndex += 1
        return replacement
      }
      return bookmark.id
    })
}

export function upsertCategory(categories: Category[], category: Category): Category[] {
  return upsertById(categories, category)
}

export function upsertBookmark(bookmarks: Bookmark[], bookmark: Bookmark): Bookmark[] {
  return upsertById(bookmarks, bookmark)
}

export function upsertPublicCategory(categories: PublicCategory[], category: Category): PublicCategory[] {
  return upsertById(categories, {
    id: category.id,
    parent_id: category.parent_id,
    title: category.title,
    icon: category.icon,
    sort: category.sort,
  })
}
