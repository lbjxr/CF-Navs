import type { PublicBookmark, PublicCategory } from '../../shared/types'
import {
  buildCategoryForest,
  filterCategoryForest,
  flattenCategoryForest,
  getCategoryPathMap,
  normalizeCategories,
  type CategoryNode,
} from '../../shared/categoryHierarchy'

export type HomeSection = {
  id: string
  title: string
  count: number
  children: HomeSection[]
}

export type HomeCategorySelection = {
  root: CategoryNode<PublicCategory> | null
  child: CategoryNode<PublicCategory> | null
}

export function clampTitleFontSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return 32
  return Math.min(72, Math.max(16, Number(value)))
}

export function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase()
}

export function buildSearchIndex(
  items: PublicBookmark[],
  categoryTitles: Map<number, string>,
): Map<number, string> {
  const nextIndex = new Map<number, string>()

  for (const bookmark of items) {
    nextIndex.set(
      bookmark.id,
      [
        bookmark.title,
        bookmark.url,
        bookmark.description ?? '',
        categoryTitles.get(bookmark.category_id) ?? '',
      ].join('\n').toLowerCase(),
    )
  }

  return nextIndex
}

export function bookmarkMatchesSearch(
  bookmark: PublicBookmark,
  keyword: string,
  searchIndex: Map<number, string>,
): boolean {
  return (searchIndex.get(bookmark.id) ?? '').includes(keyword)
}

export function getVisibleCategoryIds(items: PublicBookmark[]): Set<number> {
  const ids = new Set<number>()
  for (const bookmark of items) {
    ids.add(bookmark.category_id)
  }
  return ids
}

export function groupBookmarksByCategory(items: PublicBookmark[]): Map<number, PublicBookmark[]> {
  const grouped = new Map<number, PublicBookmark[]>()

  for (const bookmark of items) {
    const list = grouped.get(bookmark.category_id) ?? []
    list.push(bookmark)
    grouped.set(bookmark.category_id, list)
  }

  return grouped
}

export function getCategoryTreeBookmarkCount(
  category: CategoryNode<PublicCategory>,
  categoryBookmarks: Map<number, PublicBookmark[]>,
): number {
  return (categoryBookmarks.get(category.id)?.length ?? 0)
    + category.children.reduce(
      (total, child) => total + (categoryBookmarks.get(child.id)?.length ?? 0),
      0,
    )
}

export function getHomeSections(
  categories: CategoryNode<PublicCategory>[],
  categoryBookmarks: Map<number, PublicBookmark[]>,
): HomeSection[] {
  return categories.map((category) => {
    const children = (category.children ?? []).map((child) => ({
      id: `category-${child.id}`,
      title: child.title,
      count: categoryBookmarks.get(child.id)?.length ?? 0,
      children: [],
    }))

    return {
      id: `category-${category.id}`,
      title: category.title,
      count: getCategoryTreeBookmarkCount(category, categoryBookmarks),
      children,
    }
  })
}

export function resolveHomeActiveSectionId(sections: HomeSection[], activeId: string): string {
  const ids = new Set(sections.flatMap((section) => [section.id, ...section.children.map((child) => child.id)]))
  return ids.has(activeId) ? activeId : sections[0]?.id ?? ''
}

export function resolveHomeCategorySelection(
  forest: CategoryNode<PublicCategory>[],
  activeId: string | number | null | undefined,
): HomeCategorySelection {
  const normalizedId = String(activeId ?? '')

  for (const root of forest) {
    if (`category-${root.id}` === normalizedId || String(root.id) === normalizedId) {
      return { root, child: null }
    }

    const child = root.children.find((candidate) => (
      `category-${candidate.id}` === normalizedId || String(candidate.id) === normalizedId
    ))
    if (child) return { root, child }
  }

  return { root: forest[0] ?? null, child: null }
}

export function getVisibleCategoryForest(
  forest: CategoryNode<PublicCategory>[],
  visibleCategoryIds: Set<number> | null,
): CategoryNode<PublicCategory>[] {
  return visibleCategoryIds ? filterCategoryForest(forest, visibleCategoryIds) : forest
}

export type HomeScrollTargetInput = {
  currentScroll: number
  targetTop: number
  windowHeight: number
  documentHeight: number
  desiredTopDistance?: number
}

export function getHomeScrollTarget({
  currentScroll,
  targetTop,
  windowHeight,
  documentHeight,
  desiredTopDistance = 80,
}: HomeScrollTargetInput): number {
  const targetScroll = currentScroll + targetTop - desiredTopDistance
  const maxScroll = documentHeight - windowHeight
  return Math.max(0, Math.min(targetScroll, maxScroll))
}

export function createHomeDataMemo() {
  let sortedCategoriesSource: PublicCategory[] | null = null
  let sortedCategoriesMemo: PublicCategory[] = []
  let categoryForestSource: PublicCategory[] | null = null
  let categoryForestMemo: CategoryNode<PublicCategory>[] = []
  let sortedBookmarksSource: PublicBookmark[] | null = null
  let sortedBookmarksMemo: PublicBookmark[] = []
  let categoryTitleSource: PublicCategory[] | null = null
  let categoryTitleMemo = new Map<number, string>()
  let searchIndexBookmarksSource: PublicBookmark[] | null = null
  let searchIndexCategoriesSource: PublicCategory[] | null = null
  let searchIndexMemo = new Map<number, string>()

  return {
    getSortedCategories(items: PublicCategory[]): PublicCategory[] {
      if (items === sortedCategoriesSource) return sortedCategoriesMemo

      sortedCategoriesSource = items
      sortedCategoriesMemo = flattenCategoryForest(buildCategoryForest(normalizeCategories(items)))
      return sortedCategoriesMemo
    },

    getCategoryForest(items: PublicCategory[]): CategoryNode<PublicCategory>[] {
      if (items === categoryForestSource) return categoryForestMemo

      categoryForestSource = items
      categoryForestMemo = buildCategoryForest(normalizeCategories(items))
      return categoryForestMemo
    },

    getSortedBookmarks(items: PublicBookmark[]): PublicBookmark[] {
      if (items === sortedBookmarksSource) return sortedBookmarksMemo

      sortedBookmarksSource = items
      sortedBookmarksMemo = [...items].sort((a, b) => a.sort - b.sort)
      return sortedBookmarksMemo
    },

    getCategoryTitleMap(items: PublicCategory[]): Map<number, string> {
      if (items === categoryTitleSource) return categoryTitleMemo

      categoryTitleSource = items
      categoryTitleMemo = getCategoryPathMap(items)
      return categoryTitleMemo
    },

    getSearchIndex(
      items: PublicBookmark[],
      categoryItems: PublicCategory[],
      categoryTitles: Map<number, string>,
    ): Map<number, string> {
      if (items === searchIndexBookmarksSource && categoryItems === searchIndexCategoriesSource) {
        return searchIndexMemo
      }

      searchIndexBookmarksSource = items
      searchIndexCategoriesSource = categoryItems
      searchIndexMemo = buildSearchIndex(items, categoryTitles)
      return searchIndexMemo
    },
  }
}
