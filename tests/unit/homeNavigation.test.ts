import { describe, expect, it } from 'vitest'
import type { PublicBookmark, PublicCategory } from '../../shared/types'
import { buildCategoryForest } from '../../shared/categoryHierarchy'
import type { HomeSection } from '../../src/lib/homeData'
import {
  getCategoryTreeBookmarkCount,
  getHomeScrollTarget,
  getHomeSections,
  resolveHomeActiveSectionId,
  resolveHomeCategorySelection,
} from '../../src/lib/homeData'

const categories: PublicCategory[] = [
  { id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0 },
  { id: 3, parent_id: 1, title: 'Frontend', icon: null, sort: 0 },
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
    title: 'Tools',
    count: 3,
    children: [{ id: 'category-3', title: 'Frontend', count: 1, children: [] }],
  },
  { id: 'category-2', title: 'Docs', count: 1, children: [] },
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
