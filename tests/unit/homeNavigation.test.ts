import { describe, expect, it } from 'vitest'
import type { PublicBookmark, PublicCategory } from '../../shared/types'
import { buildCategoryForest } from '../../shared/categoryHierarchy'
import type { HomeSection } from '../../src/lib/homeData'
import {
  getCategoryTreeBookmarkCount,
  getCategoryHotBookmarks,
  getHomeScrollTarget,
  getHomeCategoryGroups,
  getHomeSections,
  getMostVisitedBookmarks,
  resolveActiveHomeRootId,
  resolveHomeActiveSectionId,
  resolveHomeCategoryForRoot,
  resolveHomeCategorySelection,
} from '../../src/lib/homeData'

const categories: PublicCategory[] = [
  { id: 1, parent_id: null, title: 'Tools', icon: 'https://example.com/tools.svg', sort: 0 },
  { id: 3, parent_id: 1, title: 'Frontend', icon: 'F', sort: 0 },
  { id: 2, parent_id: null, title: 'Docs', icon: null, sort: 1 },
]

function bookmark(id: number, categoryId: number): PublicBookmark {
  return {
    id,
    category_id: categoryId,
    title: `Bookmark ${id}`,
    url: `https://example.com/${id}`,
    icon: null,
    icon_source: 'custom',
    icon_background_color: null,
    icon_blob: null,
    description: null,
    description_mode: null,
    open_method: 1,
    sort: id,
  }
}

const forest = buildCategoryForest(categories)
const groupedBookmarks = new Map([
  [1, [bookmark(1, 1), bookmark(2, 1)]],
  [3, [bookmark(3, 3)]],
  [2, [bookmark(4, 2)]],
])

const sections: HomeSection[] = [
  {
    id: 'category-1',
    categoryId: 1,
    title: 'Tools',
    icon: 'https://example.com/tools.svg',
    count: 3,
    children: [{
      id: 'category-3',
      categoryId: 3,
      title: 'Frontend',
      icon: 'F',
      count: 1,
      children: [],
    }],
  },
  { id: 'category-2', categoryId: 2, title: 'Docs', icon: null, count: 1, children: [] },
]

describe('home navigation helpers', () => {
  it('uses aggregate counts for root navigation and direct counts for children', () => {
    expect(getHomeSections(forest, groupedBookmarks)).toEqual(sections)
    expect(getCategoryTreeBookmarkCount(forest[0], groupedBookmarks)).toBe(3)
  })

  it('keeps the active category only while it remains available', () => {
    expect(resolveHomeActiveSectionId(sections, 'category-2')).toBe('category-2')
    expect(resolveHomeActiveSectionId(sections, 'category-3')).toBe('category-3')
    expect(resolveHomeActiveSectionId(sections, 'missing')).toBe('category-1')
    expect(resolveHomeActiveSectionId([], 'category-1')).toBe('')
  })

  it('resolves a root scope and its optional child filter', () => {
    expect(resolveHomeCategorySelection(forest, 'category-1')).toMatchObject({
      root: { id: 1 },
      child: null,
    })
    expect(resolveHomeCategorySelection(forest, 'category-3')).toMatchObject({
      root: { id: 1 },
      child: { id: 3 },
    })
    expect(resolveHomeCategorySelection(forest, 'missing')).toMatchObject({
      root: { id: 1 },
      child: null,
    })
    expect(resolveHomeCategorySelection([], 'category-1')).toEqual({ root: null, child: null })
  })

  it('defaults every root group to direct bookmarks and accepts only its own children', () => {
    expect(resolveHomeCategoryForRoot(forest[0], undefined).id).toBe(1)
    expect(resolveHomeCategoryForRoot(forest[0], undefined, groupedBookmarks).id).toBe(1)
    expect(resolveHomeCategoryForRoot(forest[0], 'category-3').id).toBe(3)
    expect(resolveHomeCategoryForRoot(forest[0], 3).id).toBe(3)
    expect(resolveHomeCategoryForRoot(forest[0], 'category-2').id).toBe(1)

    const groups = getHomeCategoryGroups(forest, new Map([[1, 3]]))
    expect(groups.map((group) => ({ root: group.root.id, selected: group.selected.id }))).toEqual([
      { root: 1, selected: 3 },
      { root: 2, selected: 2 },
    ])
  })
  it('空一级默认回落到按 sort 排序的首个子分类', () => {
    const emptyRoot = buildCategoryForest([
      { id: 4, parent_id: null, title: 'Empty root', icon: null, sort: 0 },
      { id: 5, parent_id: 4, title: 'First child', icon: null, sort: 0 },
    ])[0]
    const bookmarks = new Map([[5, [bookmark(5, 5)]]])

    expect(resolveHomeCategoryForRoot(emptyRoot, undefined, bookmarks).id).toBe(5)
    expect(resolveHomeCategoryForRoot(emptyRoot, 4, bookmarks).id).toBe(5)
    expect(resolveHomeCategoryForRoot(emptyRoot, 'category-5', bookmarks).id).toBe(5)
    expect(getHomeCategoryGroups([emptyRoot], new Map([[4, 4]]), bookmarks)[0].selected.id).toBe(5)
    expect(getHomeCategoryGroups([emptyRoot], new Map(), bookmarks)[0].selected.id).toBe(5)
  })

  it('getCategoryHotBookmarks: 频次优先 + sort 回填 + 封顶', () => {
    const tree = buildCategoryForest([
      { id: 10, parent_id: null, title: 'Root', icon: null, sort: 0 },
      { id: 11, parent_id: 10, title: 'A', icon: null, sort: 0 },
      { id: 12, parent_id: 10, title: 'B', icon: null, sort: 1 },
    ])[0]
    const hot = (id: number, cat: number, click: number): PublicBookmark => ({ ...bookmark(id, cat), click_count: click })
    const bm = new Map<number, PublicBookmark[]>([
      [11, [hot(101, 11, 5), hot(102, 11, 0)]],
      [12, [hot(103, 12, 9), hot(104, 12, 3)]],
    ])
    expect(getCategoryHotBookmarks(tree, bm, 3).map((b) => b.id)).toEqual([103, 101, 104])
    expect(getCategoryHotBookmarks(tree, bm, 2).map((b) => b.id)).toEqual([103, 101])
    expect(getCategoryHotBookmarks(tree, bm, 10).map((b) => b.id)).toEqual([103, 101, 104, 102])
    expect(getCategoryHotBookmarks(tree, bm, 0)).toEqual([])
  })

  it('getCategoryHotBookmarks: 全零点击按 sort 回填非空；剔除私密书签但保留子树全部公开书签', () => {
    const tree = buildCategoryForest([
      { id: 20, parent_id: null, title: 'Root', icon: null, sort: 0 },
      { id: 21, parent_id: 20, title: 'A', icon: null, sort: 0 },
      { id: 22, parent_id: 20, title: 'B', icon: null, sort: 1 },
    ])[0]
    const mk = (id: number, cat: number, extra: Partial<PublicBookmark> = {}): PublicBookmark => ({ ...bookmark(id, cat), click_count: 0, ...extra })
    const bm = new Map<number, PublicBookmark[]>([
      [21, [mk(201, 21), mk(202, 21, { is_private: true })]],
      [22, [mk(203, 22)]],
    ])
    // 私密书签 202 被剔除；两个子分类的公开书签 201/203 都保留（不再按匿名可见集丢弃祖先私密的公开子分类）
    expect(getCategoryHotBookmarks(tree, bm, 5).map((b) => b.id)).toEqual([201, 203])
  })

  it('getCategoryHotBookmarks: 不改入参桶', () => {
    const tree = buildCategoryForest([
      { id: 30, parent_id: null, title: 'Root', icon: null, sort: 0 },
      { id: 31, parent_id: 30, title: 'A', icon: null, sort: 0 },
    ])[0]
    const bucket: PublicBookmark[] = [{ ...bookmark(301, 31), click_count: 1 }, { ...bookmark(302, 31), click_count: 9 }]
    const bm = new Map([[31, bucket]])
    getCategoryHotBookmarks(tree, bm, 5)
    expect(bucket.map((b) => b.id)).toEqual([301, 302])
  })

  it('tracks the last root above the navigation threshold or the first root below it', () => {
    expect(resolveActiveHomeRootId(new Map([
      [1, -240],
      [2, 62],
      [3, 480],
    ]), 96)).toBe(2)
    expect(resolveActiveHomeRootId(new Map([
      [1, 180],
      [2, 620],
    ]), 96)).toBe(1)
    expect(resolveActiveHomeRootId(new Map(), 96)).toBeNull()
  })

  it('excludes private bookmarks from most-visited results', () => {
    const items = [
      { ...bookmark(1, 1), click_count: 4, is_private: true },
      { ...bookmark(2, 1), click_count: 3, is_private: 1 },
      { ...bookmark(3, 1), click_count: 2, is_private: false },
      { ...bookmark(4, 1), click_count: 1 },
    ]

    expect(getMostVisitedBookmarks(items, 10).map((item) => item.id)).toEqual([3, 4])
  })

  it('selects positive most-visited bookmarks without mutating the source', () => {
    const items = [
      { ...bookmark(4, 1), sort: 0, click_count: 0 },
      { ...bookmark(3, 1), sort: 2, click_count: 8 },
      { ...bookmark(2, 1), sort: 1, click_count: 8 },
      { ...bookmark(1, 1), sort: 3, click_count: 12 },
    ]
    const originalIds = items.map((item) => item.id)

    expect(getMostVisitedBookmarks(items, 3).map((item) => item.id)).toEqual([1, 2, 3])
    expect(items.map((item) => item.id)).toEqual(originalIds)
    expect(getMostVisitedBookmarks(items, 1.9).map((item) => item.id)).toEqual([1])
    expect(getMostVisitedBookmarks(items, 20).map((item) => item.id)).toEqual([1, 2, 3])
    expect(getMostVisitedBookmarks(items, 0)).toEqual([])
    expect(getMostVisitedBookmarks(items, -4)).toEqual([])
  })

  it('clamps smooth-scroll targets to document bounds', () => {
    expect(getHomeScrollTarget({
      currentScroll: 200,
      targetTop: 300,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(420)

    expect(getHomeScrollTarget({
      currentScroll: 1100,
      targetTop: 500,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(1200)

    expect(getHomeScrollTarget({
      currentScroll: 20,
      targetTop: 30,
      windowHeight: 800,
      documentHeight: 2000,
    })).toBe(0)

    expect(getHomeScrollTarget({
      currentScroll: 500,
      targetTop: 320,
      windowHeight: 700,
      documentHeight: 2200,
      desiredTopDistance: 96,
    })).toBe(724)
  })
})
