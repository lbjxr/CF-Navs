import { describe, expect, it } from 'vitest'
import type { AdminBookmarkSummary, AdminCategorySummary } from '../../src/lib/appData'
import {
  clampAdminListPage,
  buildAdminCategoryGroups,
  createAdminListPage,
  createAdminSortDraft,
  filterAdminBookmarks,
  filterAdminCategoryGroups,
  getAdminBookmarkCategoryOptions,
  filterAdminCategories,
  getAdminCategoryBookmarkCount,
  getAdminCategoryTitle,
  getAdminListTotalPages,
  getAdminSortIds,
  reorderAdminSortDraft,
} from '../../src/lib/adminListState'

const categories: AdminCategorySummary[] = [
  { id: 1, parent_id: null, title: 'Tools', icon: 'tool', sort: 1, bookmarkCount: 8 },
  { id: 2, parent_id: null, title: 'Documentation', icon: 'book', sort: 0 },
  { id: 3, parent_id: 1, title: 'Frontend', icon: 'code', sort: 0 },
]

const bookmarks: AdminBookmarkSummary[] = [
  {
    id: 10,
    category_id: 1,
    title: 'GitHub',
    url: 'https://github.com',
    description: 'Code hosting',
  },
  {
    id: 11,
    category_id: 2,
    title: 'Svelte',
    url: 'https://svelte.dev/docs',
    description: 'Framework docs',
  },
  {
    id: 12,
    category_id: 'missing',
    title: 'Worker API',
    url: 'https://developers.cloudflare.com/workers',
    description: '',
  },
]

describe('admin list state helpers', () => {
  it('filters bookmarks by title, URL, and category title', () => {
    expect(filterAdminBookmarks(bookmarks, categories, ' github ')).toEqual([bookmarks[0]])
    expect(filterAdminBookmarks(bookmarks, categories, 'SVELTE.DEV')).toEqual([bookmarks[1]])
    expect(filterAdminBookmarks(bookmarks, categories, 'documentation')).toEqual([bookmarks[1]])
    expect(filterAdminBookmarks(bookmarks, categories, 'absent')).toEqual([])
  })

  it('keeps blank bookmark search as the original list', () => {
    expect(filterAdminBookmarks(bookmarks, categories, '   ')).toBe(bookmarks)
  })

  it('filters categories by title and keeps blank search as the original list', () => {
    expect(filterAdminCategories(categories, ' doc ')).toEqual([categories[1]])
    expect(filterAdminCategories(categories, '   ')).toBe(categories)
  })

  it('derives category titles and count fallback values', () => {
    expect(getAdminCategoryTitle(categories, 1)).toBe('Tools')
    expect(getAdminCategoryTitle(categories, 3)).toBe('Tools / Frontend')
    expect(getAdminCategoryTitle(categories, 'missing')).toBe('未分类')
    expect(getAdminCategoryTitle(categories, 'missing', 'Unknown')).toBe('Unknown')

    expect(getAdminCategoryBookmarkCount(categories[0], bookmarks)).toBe(8)
    expect(getAdminCategoryBookmarkCount(categories[1], bookmarks)).toBe(1)
  })

  it('groups roots with children and keeps ancestors during category search', () => {
    const groups = buildAdminCategoryGroups(categories)
    expect(groups.map((group) => group.root.id)).toEqual([2, 1])
    expect(groups[1].children.map((category) => category.id)).toEqual([3])
    expect(filterAdminCategoryGroups(groups, 'frontend')).toEqual([
      { root: categories[0], children: [categories[2]] },
    ])
    expect(filterAdminCategoryGroups(groups, 'tools')).toEqual([
      { root: categories[0], children: [categories[2]] },
    ])
  })

  it('builds hierarchical bookmark options and searches child bookmarks by parent path', () => {
    expect(getAdminBookmarkCategoryOptions(categories)).toEqual([
      { id: 2, title: 'Documentation', children: [] },
      {
        id: 1,
        title: 'Tools',
        children: [{ id: 3, title: 'Frontend', children: [] }],
      },
    ])

    const childBookmark = { ...bookmarks[0], id: 13, category_id: 3, title: 'Vite' }
    expect(filterAdminBookmarks([childBookmark], categories, 'tools')).toEqual([childBookmark])
    expect(filterAdminBookmarks([childBookmark], categories, 'frontend')).toEqual([childBookmark])
  })

  it('creates a clamped page view with display range metadata', () => {
    const items = Array.from({ length: 21 }, (_, index) => index + 1)

    expect(getAdminListTotalPages(items.length, 10)).toBe(3)
    expect(clampAdminListPage(99, 3)).toBe(3)
    expect(clampAdminListPage(-5, 3)).toBe(1)

    expect(createAdminListPage(items, 3, 10)).toEqual({
      page: 3,
      totalPages: 3,
      items: [21],
      start: 21,
      end: 21,
      total: 21,
    })

    expect(createAdminListPage(items, 99, 10).page).toBe(3)
    expect(createAdminListPage([], 2, 10)).toMatchObject({
      page: 1,
      totalPages: 1,
      items: [],
      start: 0,
      end: 0,
      total: 0,
    })
  })

  it('creates sortable drafts, reorders by ids, and exposes save ids', () => {
    const draft = createAdminSortDraft(bookmarks)

    expect(draft).toEqual(bookmarks)
    expect(draft).not.toBe(bookmarks)
    expect(reorderAdminSortDraft(draft, [12, '10', 'unknown']).map((bookmark) => bookmark.id)).toEqual([12, 10])
    expect(getAdminSortIds(draft)).toEqual([10, 11, 12])
  })
})
