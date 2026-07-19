import type { AdminBookmarkSummary, AdminCategorySummary } from './appData'
import { buildCategoryTreeOptions, type CategoryTreeOption } from './categorySelect'
import { DEFAULT_PAGE_SIZE, clampPage, pageCount, pageEnd, pageStart, slicePage } from './pagination'
import { reorderByIds } from './reorder'

type AdminSortableItem = {
  id: string | number
}

export type AdminListPage<T> = {
  page: number
  totalPages: number
  items: T[]
  start: number
  end: number
  total: number
}

export function getAdminCategoryTitle(
  categories: AdminCategorySummary[],
  categoryId: string | number,
  fallback = '未分类',
): string {
  return getAdminCategoryPathMap(categories).get(categoryId) ?? fallback
}

export function getAdminCategoryPathMap(categories: AdminCategorySummary[]): Map<string | number, string> {
  const byId = new Map(categories.map((category) => [Number(category.id), category]))
  return new Map(categories.map((category) => {
    const parent = category.parent_id == null ? null : byId.get(Number(category.parent_id))
    return [category.id, parent ? `${parent.title} / ${category.title}` : category.title]
  }))
}

export function getAdminCategoryBookmarkCount(
  category: AdminCategorySummary,
  bookmarks: AdminBookmarkSummary[],
): number {
  return category.bookmarkCount ?? bookmarks.filter((bookmark) => bookmark.category_id === category.id).length
}

export function filterAdminBookmarks(
  bookmarks: AdminBookmarkSummary[],
  categories: AdminCategorySummary[],
  search: string,
): AdminBookmarkSummary[] {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return bookmarks

  const categoryTitleById = new Map(
    [...getAdminCategoryPathMap(categories)].map(([id, path]) => [id, path.toLowerCase()]),
  )

  return bookmarks.filter((bookmark) => {
    const categoryTitle = categoryTitleById.get(bookmark.category_id) ?? ''
    return (
      bookmark.title.toLowerCase().includes(normalizedSearch) ||
      bookmark.url.toLowerCase().includes(normalizedSearch) ||
      categoryTitle.includes(normalizedSearch)
    )
  })
}

export function filterAdminCategories(
  categories: AdminCategorySummary[],
  search: string,
): AdminCategorySummary[] {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return categories
  return categories.filter((category) => category.title.toLowerCase().includes(normalizedSearch))
}

export type AdminCategoryGroup = {
  root: AdminCategorySummary
  children: AdminCategorySummary[]
}

function compareAdminCategories(a: AdminCategorySummary, b: AdminCategorySummary): number {
  return Number(a.sort ?? 0) - Number(b.sort ?? 0) || Number(a.id) - Number(b.id)
}

export function buildAdminCategoryGroups(categories: AdminCategorySummary[]): AdminCategoryGroup[] {
  const roots = categories
    .filter((category) => category.parent_id == null)
    .sort(compareAdminCategories)
  const childrenByParent = new Map<number, AdminCategorySummary[]>()

  for (const category of categories) {
    if (category.parent_id == null) continue
    const parentId = Number(category.parent_id)
    const children = childrenByParent.get(parentId) ?? []
    children.push(category)
    childrenByParent.set(parentId, children)
  }

  return roots.map((root) => ({
    root,
    children: (childrenByParent.get(Number(root.id)) ?? []).sort(compareAdminCategories),
  }))
}

export function filterAdminCategoryGroups(
  groups: AdminCategoryGroup[],
  search: string,
): AdminCategoryGroup[] {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return groups

  return groups.flatMap((group) => {
    if (group.root.title.toLowerCase().includes(normalizedSearch)) return [group]
    const children = group.children.filter((child) => child.title.toLowerCase().includes(normalizedSearch))
    return children.length > 0 ? [{ root: group.root, children }] : []
  })
}

export function flattenAdminCategoryGroups(groups: AdminCategoryGroup[]): AdminCategorySummary[] {
  return groups.flatMap((group) => [group.root, ...group.children])
}

export function getAdminBookmarkCategoryOptions(
  categories: AdminCategorySummary[],
): CategoryTreeOption[] {
  return buildCategoryTreeOptions(categories)
}

export function createAdminListPage<T>(
  items: T[],
  requestedPage: number,
  pageSize = DEFAULT_PAGE_SIZE,
): AdminListPage<T> {
  const total = items.length
  const totalPages = pageCount(total, pageSize)
  const page = clampPage(requestedPage, totalPages)

  return {
    page,
    totalPages,
    items: slicePage(items, page, pageSize),
    start: pageStart(page, total, pageSize),
    end: pageEnd(page, total, pageSize),
    total,
  }
}

export function getAdminListTotalPages(total: number, pageSize = DEFAULT_PAGE_SIZE): number {
  return pageCount(total, pageSize)
}

export function clampAdminListPage(page: number, totalPages: number): number {
  return clampPage(page, totalPages)
}

export function createAdminSortDraft<T>(items: T[]): T[] {
  return [...items]
}

export function reorderAdminSortDraft<T extends AdminSortableItem>(
  items: T[],
  orderedIds: Array<string | number>,
): T[] {
  return reorderByIds(items, orderedIds)
}

export function getAdminSortIds<T extends AdminSortableItem>(items: T[]): Array<string | number> {
  return items.map((item) => item.id)
}

export type AdminBookmarkSortField = 'title' | 'category' | 'url' | 'open_method'
export type AdminBookmarkSortDirection = 'asc' | 'desc' | null

export interface AdminBookmarkSortState {
  field: AdminBookmarkSortField | null
  direction: AdminBookmarkSortDirection
}

export function cycleAdminBookmarkSort(state: AdminBookmarkSortState, field: AdminBookmarkSortField): AdminBookmarkSortState {
  if (state.field !== field) return { field, direction: 'asc' }
  if (state.direction === 'asc') return { field, direction: 'desc' }
  return { field: null, direction: null }
}

function hostKey(url: string): { valid: boolean; parts: string[]; port: number } {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    if (!hostname) return { valid: false, parts: [], port: -1 }
    if (/^\d+(?:\.\d+){3}$/.test(hostname)) {
      return { valid: true, parts: hostname.split('.').map((part) => part.padStart(3, '0')), port: parsed.port ? Number(parsed.port) : -1 }
    }
    if (hostname.includes(':')) return { valid: true, parts: [hostname], port: parsed.port ? Number(parsed.port) : -1 }
    return { valid: true, parts: hostname.split('.').reverse(), port: parsed.port ? Number(parsed.port) : -1 }
  } catch {
    return { valid: false, parts: [], port: -1 }
  }
}

function compareHost(a: ReturnType<typeof hostKey>, b: ReturnType<typeof hostKey>): number {
  if (a.valid !== b.valid) return a.valid ? -1 : 1
  if (!a.valid) return 0
  if (a.parts.length !== b.parts.length) {
    const shared = Math.min(a.parts.length, b.parts.length)
    for (let i = 0; i < shared; i += 1) {
      const result = a.parts[i].localeCompare(b.parts[i])
      if (result) return result
    }
    return a.parts.length - b.parts.length
  }
  for (let i = 0; i < a.parts.length; i += 1) {
    const result = a.parts[i].localeCompare(b.parts[i])
    if (result) return result
  }
  return a.port - b.port
}

export function compareAdminBookmarkField(
  a: AdminBookmarkSummary,
  b: AdminBookmarkSummary,
  field: AdminBookmarkSortField,
  categories: AdminCategorySummary[] = [],
): number {
  if (field === 'url') return compareHost(hostKey(a.url), hostKey(b.url))
  if (field === 'category') return getAdminCategoryTitle(categories, a.category_id).localeCompare(getAdminCategoryTitle(categories, b.category_id), 'zh-CN')
  if (field === 'open_method') return Number(a.open_method === 'same_tab' ? 2 : a.open_method === 'modal' ? 3 : 1) - Number(b.open_method === 'same_tab' ? 2 : b.open_method === 'modal' ? 3 : 1)
  return a.title.localeCompare(b.title, 'zh-CN', { sensitivity: 'base' })
}

export function sortAdminBookmarks(
  bookmarks: AdminBookmarkSummary[],
  state: AdminBookmarkSortState,
  categories: AdminCategorySummary[] = [],
): AdminBookmarkSummary[] {
  if (!state.field || !state.direction) return bookmarks
  const direction = state.direction === 'asc' ? 1 : -1
  return bookmarks
    .map((bookmark, index) => ({ bookmark, index }))
    .sort((a, b) => {
      if (state.field === 'url') {
        const left = hostKey(a.bookmark.url)
        const right = hostKey(b.bookmark.url)
        if (left.valid !== right.valid) return left.valid ? -1 : 1
        return compareHost(left, right) * direction || a.index - b.index
      }
      return compareAdminBookmarkField(a.bookmark, b.bookmark, state.field!, categories) * direction || a.index - b.index
    })
    .map(({ bookmark }) => bookmark)
}
