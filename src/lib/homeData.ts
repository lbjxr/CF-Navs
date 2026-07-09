import type { PublicBookmark, PublicCategory } from '../../shared/types'

export type HomeSection = {
  id: string
  title: string
  count: number
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

export function getHomeSections(
  categories: PublicCategory[],
  categoryBookmarks: Map<number, PublicBookmark[]>,
): HomeSection[] {
  return categories.map((category) => ({
    id: `category-${category.id}`,
    title: category.title,
    count: categoryBookmarks.get(category.id)?.length ?? 0,
  }))
}

export function getHomeSectionsKey(sections: HomeSection[]): string {
  return sections.map((section) => section.id).join('|')
}

export function resolveHomeActiveSectionId(sections: HomeSection[], activeId: string): string {
  return sections.some((section) => section.id === activeId) ? activeId : sections[0]?.id ?? ''
}

export function getNearestIntersectingSectionId(intersectingSectionTops: Map<string, number>): string {
  let nextActiveId = ''
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const [sectionId, distance] of intersectingSectionTops) {
    if (distance < nearestDistance) {
      nearestDistance = distance
      nextActiveId = sectionId
    }
  }

  return nextActiveId
}

export type HomeScrollTargetInput = {
  currentScroll: number
  targetTop: number
  windowHeight: number
  documentHeight: number
  desiredTopDistance?: number
}

export type HomeScrollAlignmentInput = {
  targetTop: number
  desiredTopDistance?: number
  tolerance?: number
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

export function isHomeScrollAligned({
  targetTop,
  desiredTopDistance = 80,
  tolerance = 4,
}: HomeScrollAlignmentInput): boolean {
  return Math.abs(targetTop - desiredTopDistance) <= tolerance
}

export function createHomeDataMemo() {
  let sortedCategoriesSource: PublicCategory[] | null = null
  let sortedCategoriesMemo: PublicCategory[] = []
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
      sortedCategoriesMemo = [...items].sort((a, b) => a.sort - b.sort)
      return sortedCategoriesMemo
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
      categoryTitleMemo = new Map(items.map((category) => [category.id, category.title]))
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
