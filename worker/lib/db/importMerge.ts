import type { AdminData, Bookmark, Category, ImportReq } from '../../../shared/types'

export interface MergeResult {
  payload: Pick<ImportReq, 'categories' | 'bookmarks' | 'settings'>
  createdCategories: number
  reusedCategories: number
  skippedBookmarks: number
}

export function mergeImportData(current: AdminData, incoming: Pick<ImportReq, 'categories' | 'bookmarks' | 'settings'>): MergeResult {
  const categories = current.categories.map((category) => ({ ...category }))
  const bookmarks = current.bookmarks.map((bookmark) => ({ ...bookmark }))
  const byName = new Map(categories.map((category) => [category.title.trim().toLowerCase(), category]))
  let nextCategoryId = Math.max(0, ...categories.map((category) => category.id)) + 1
  let nextBookmarkId = Math.max(0, ...bookmarks.map((bookmark) => bookmark.id)) + 1
  let createdCategories = 0
  let reusedCategories = 0
  let skippedBookmarks = 0
  const categoryMap = new Map<number, Category>()
  const now = Date.now()

  incoming.categories.forEach((incomingCategory, index) => {
    const key = incomingCategory.title.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) { categoryMap.set(incomingCategory.id, existing); reusedCategories += 1; return }
    const category: Category = { ...incomingCategory, id: nextCategoryId++, sort: categories.length + index, created_at: incomingCategory.created_at || now }
    categories.push(category)
    byName.set(key, category)
    categoryMap.set(incomingCategory.id, category)
    createdCategories += 1
  })

  const nextSortByCategory = new Map<number, number>()
  categories.forEach((category) => nextSortByCategory.set(category.id, Math.max(-1, ...bookmarks.filter((bookmark) => bookmark.category_id === category.id).map((bookmark) => bookmark.sort))))
  incoming.bookmarks.forEach((incomingBookmark) => {
    const category = categoryMap.get(incomingBookmark.category_id)
    if (!category) { skippedBookmarks += 1; return }
    const sort = (nextSortByCategory.get(category.id) ?? -1) + 1
    nextSortByCategory.set(category.id, sort)
    const bookmark: Bookmark = { ...incomingBookmark, id: nextBookmarkId++, category_id: category.id, sort, created_at: incomingBookmark.created_at || now }
    bookmarks.push(bookmark)
  })
  return { payload: { categories, bookmarks }, createdCategories, reusedCategories, skippedBookmarks }
}
