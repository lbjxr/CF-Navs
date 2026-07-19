import type { Bookmark, Category } from '../../../shared/types'
import { normalizeCategoryParentId } from '../../../shared/categoryHierarchy'

// Pure helpers extracted from db/import.ts to enable unit testing
// without D1 database dependencies.

export function normalizeImportCategory(c: Category, now: number): Category {
  return {
    id: c.id,
    parent_id: normalizeCategoryParentId(c.parent_id),
    title: c.title,
    icon: c.icon ?? null,
    sort: Number.isFinite(c.sort) ? c.sort : 0,
    created_at: c.created_at || now,
  }
}

export function normalizeImportBookmark(b: Bookmark, now: number): Bookmark {
  const openMethod = b.open_method === 2 ? 2 : b.open_method === 3 ? 3 : 1
  return {
    id: b.id,
    category_id: b.category_id,
    title: b.title,
    url: b.url,
    icon: b.icon ?? null,
    icon_source: (b as unknown as Record<string, Bookmark['icon_source']>).icon_source ?? null,
    icon_background_color: (b as unknown as Record<string, string | null | undefined>).icon_background_color ?? null,
    icon_blob: (b as unknown as Record<string, string | null | undefined>).icon_blob ?? null,
    description: b.description ?? null,
    description_mode: b.description_mode ?? null,
    open_method: openMethod,
    sort: Number.isFinite(b.sort) ? b.sort : 0,
    created_at: b.created_at || now,
  }
}

export function remapImportRecords(
  categories: Category[],
  bookmarks: Bookmark[],
  now: number,
): { categories: Category[]; bookmarks: Bookmark[]; categoryIdMap: Map<number, number> } {
  const normalized = categories.map((category) => normalizeImportCategory(category, now))
  const roots = normalized
    .filter((category) => category.parent_id == null)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
  const children = normalized
    .filter((category) => category.parent_id != null)
    .sort((a, b) => (a.parent_id ?? 0) - (b.parent_id ?? 0) || a.sort - b.sort || a.id - b.id)
  const categoryIdMap = new Map<number, number>()
  const remappedCategories: Category[] = []
  let nextCategoryId = 1

  for (const root of roots) {
    const id = nextCategoryId++
    categoryIdMap.set(root.id, id)
    remappedCategories.push({ ...root, id, parent_id: null })
  }

  for (const child of children) {
    const parentId = categoryIdMap.get(child.parent_id as number)
    if (parentId == null) throw new Error(`missing remapped parent for category ${child.id}`)
    const id = nextCategoryId++
    categoryIdMap.set(child.id, id)
    remappedCategories.push({ ...child, id, parent_id: parentId })
  }

  const remappedBookmarks = bookmarks.map((bookmark) => {
    const normalizedBookmark = normalizeImportBookmark(bookmark, now)
    const categoryId = categoryIdMap.get(normalizedBookmark.category_id)
    if (categoryId == null) throw new Error(`missing remapped category for bookmark ${bookmark.id}`)
    return { ...normalizedBookmark, category_id: categoryId }
  })

  return { categories: remappedCategories, bookmarks: remappedBookmarks, categoryIdMap }
}

export function chunkImportRows<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('chunk size must be positive')
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}
