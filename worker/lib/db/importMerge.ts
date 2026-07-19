import type { AdminData, Bookmark, Category, ImportReq } from '../../../shared/types'

export interface MergeResult {
  payload: Pick<ImportReq, 'categories' | 'bookmarks' | 'settings'>
  createdCategories: number
  reusedCategories: number
  skippedBookmarks: number
}

function normalizedTitle(value: string): string {
  return value.trim().toLowerCase()
}

function categoryPathKey(parentId: number | null, title: string): string {
  return `${parentId == null ? 'root' : `child:${parentId}`}:${normalizedTitle(title)}`
}

export function mergeImportData(
  current: AdminData,
  incoming: Pick<ImportReq, 'categories' | 'bookmarks' | 'settings'>,
): MergeResult {
  const categories = current.categories.map((category) => ({ ...category }))
  const bookmarks = current.bookmarks.map((bookmark) => ({ ...bookmark }))
  const byPath = new Map(categories.map((category) => [categoryPathKey(category.parent_id, category.title), category]))
  const categoryMap = new Map<number, Category>()
  const nextSortByParent = new Map<string, number>()
  let nextCategoryId = Math.max(0, ...categories.map((category) => category.id)) + 1
  let nextBookmarkId = Math.max(0, ...bookmarks.map((bookmark) => bookmark.id)) + 1
  let createdCategories = 0
  let reusedCategories = 0
  let skippedBookmarks = 0
  const now = Date.now()

  for (const category of categories) {
    const scope = String(category.parent_id ?? 'root')
    nextSortByParent.set(scope, Math.max(nextSortByParent.get(scope) ?? -1, category.sort))
  }

  const incomingRoots = incoming.categories
    .filter((category) => category.parent_id == null)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
  const incomingChildren = incoming.categories
    .filter((category) => category.parent_id != null)
    .sort((a, b) => (a.parent_id ?? 0) - (b.parent_id ?? 0) || a.sort - b.sort || a.id - b.id)

  for (const incomingCategory of incomingRoots) {
    const key = categoryPathKey(null, incomingCategory.title)
    const existing = byPath.get(key)
    if (existing) {
      categoryMap.set(incomingCategory.id, existing)
      reusedCategories += 1
      continue
    }

    const sort = (nextSortByParent.get('root') ?? -1) + 1
    nextSortByParent.set('root', sort)
    const category: Category = {
      ...incomingCategory,
      id: nextCategoryId++,
      parent_id: null,
      sort,
      created_at: incomingCategory.created_at || now,
    }
    categories.push(category)
    byPath.set(key, category)
    categoryMap.set(incomingCategory.id, category)
    createdCategories += 1
  }

  for (const incomingCategory of incomingChildren) {
    const parent = categoryMap.get(incomingCategory.parent_id as number)
    if (!parent) continue
    const key = categoryPathKey(parent.id, incomingCategory.title)
    const existing = byPath.get(key)
    if (existing) {
      categoryMap.set(incomingCategory.id, existing)
      reusedCategories += 1
      continue
    }

    const scope = String(parent.id)
    const sort = (nextSortByParent.get(scope) ?? -1) + 1
    nextSortByParent.set(scope, sort)
    const category: Category = {
      ...incomingCategory,
      id: nextCategoryId++,
      parent_id: parent.id,
      sort,
      created_at: incomingCategory.created_at || now,
    }
    categories.push(category)
    byPath.set(key, category)
    categoryMap.set(incomingCategory.id, category)
    createdCategories += 1
  }

  const nextSortByCategory = new Map<number, number>()
  for (const category of categories) {
    nextSortByCategory.set(
      category.id,
      Math.max(-1, ...bookmarks.filter((bookmark) => bookmark.category_id === category.id).map((bookmark) => bookmark.sort)),
    )
  }

  for (const incomingBookmark of incoming.bookmarks) {
    const category = categoryMap.get(incomingBookmark.category_id)
    if (!category) {
      skippedBookmarks += 1
      continue
    }
    const sort = (nextSortByCategory.get(category.id) ?? -1) + 1
    nextSortByCategory.set(category.id, sort)
    const bookmark: Bookmark = {
      ...incomingBookmark,
      id: nextBookmarkId++,
      category_id: category.id,
      sort,
      created_at: incomingBookmark.created_at || now,
    }
    bookmarks.push(bookmark)
  }

  return {
    payload: { categories, bookmarks },
    createdCategories,
    reusedCategories,
    skippedBookmarks,
  }
}
