import { describe, expect, it } from 'vitest'
import type { PublicBookmark, PublicCategory } from '../../shared/types'
import { buildHomeSortCategoryOrders, moveBookmarkToCategory } from '../../src/lib/homeSort'

const categories: PublicCategory[] = [
  { id: 1, parent_id: null, title: 'Root', icon: null, sort: 0 },
  { id: 2, parent_id: 1, title: 'Child', icon: null, sort: 0 },
  { id: 3, parent_id: null, title: 'Empty', icon: null, sort: 1 },
]

const bookmark = (id: number, category_id: number): PublicBookmark => ({
  id,
  category_id,
  title: `Bookmark ${id}`,
  url: `https://example.com/${id}`,
  icon: null,
  icon_source: null,
  icon_background_color: null,
  icon_blob: null,
  description: null,
  open_method: 1,
  sort: id,
})

describe('home sorting helpers', () => {
  it('moves a bookmark to the end of the target category draft', () => {
    const draft = [bookmark(1, 1), bookmark(2, 2)]

    expect(moveBookmarkToCategory(draft, 1, 2)).toEqual([
      bookmark(2, 2),
      bookmark(1, 2),
    ])
  })

  it('does not create a draft for a missing or same-category bookmark', () => {
    const draft = [bookmark(1, 1)]

    expect(moveBookmarkToCategory(draft, 1, 1)).toBeNull()
    expect(moveBookmarkToCategory(draft, 9, 2)).toBeNull()
  })

  it('includes empty categories in the complete reorganize snapshot', () => {
    expect(buildHomeSortCategoryOrders(categories, [bookmark(2, 2), bookmark(1, 1)])).toEqual([
      { category_id: 1, ids: [1] },
      { category_id: 2, ids: [2] },
      { category_id: 3, ids: [] },
    ])
  })
})
