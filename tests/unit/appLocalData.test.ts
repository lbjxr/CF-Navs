import { describe, expect, it } from 'vitest'
import type { Bookmark, Category, PublicBookmark, PublicCategory } from '../../shared/types'
import {
  applySortOrder,
  buildOrderedBookmarkIdsForCategory,
  buildPublicDataAfterCategoryDelete,
  removeBookmarksByCategory,
  removeById,
  updateBookmarkIconBlob,
  upsertBookmark,
  upsertById,
  upsertCategory,
  upsertPublicBookmark,
  upsertPublicCategory,
} from '../../src/lib/appLocalData'

const categoryA: Category = { id: 1, title: 'Tools', icon: null, sort: 0, created_at: 100 }
const categoryB: Category = { id: 2, title: 'Docs', icon: 'book', sort: 1, created_at: 101 }
const categoryC: Category = { id: 3, title: 'Media', icon: null, sort: 2, created_at: 102 }

const bookmarkA: Bookmark = {
  id: 10,
  category_id: 1,
  title: 'GitHub',
  url: 'https://github.com',
  icon: null,
  icon_source: 'direct',
  icon_background_color: null,
  icon_blob: null,
  icon_cached: 0,
  description: null,
  open_method: 1,
  sort: 0,
  created_at: 200,
}

const bookmarkB: Bookmark = {
  ...bookmarkA,
  id: 11,
  category_id: 2,
  title: 'Docs',
  url: 'https://docs.example.com',
  sort: 1,
  created_at: 201,
}

const publicCategoryA: PublicCategory = {
  id: categoryA.id,
  title: categoryA.title,
  icon: categoryA.icon,
  sort: categoryA.sort,
}
const publicCategoryB: PublicCategory = {
  id: categoryB.id,
  title: categoryB.title,
  icon: categoryB.icon,
  sort: categoryB.sort,
}

const publicBookmarkA: PublicBookmark = {
  id: bookmarkA.id,
  category_id: bookmarkA.category_id,
  title: bookmarkA.title,
  url: bookmarkA.url,
  icon: bookmarkA.icon,
  icon_source: bookmarkA.icon_source,
  icon_background_color: bookmarkA.icon_background_color,
  icon_blob: bookmarkA.icon_blob,
  icon_cached: bookmarkA.icon_cached,
  description: bookmarkA.description,
  open_method: bookmarkA.open_method,
  sort: bookmarkA.sort,
}
const publicBookmarkB: PublicBookmark = {
  ...publicBookmarkA,
  id: bookmarkB.id,
  category_id: bookmarkB.category_id,
  title: bookmarkB.title,
  url: bookmarkB.url,
  sort: bookmarkB.sort,
}

describe('appLocalData upsert/remove helpers', () => {
  it('upserts by id while preserving existing item position', () => {
    const updated = { ...categoryA, title: 'Updated tools' }

    expect(upsertById([categoryA, categoryB], updated)).toEqual([updated, categoryB])
    expect(upsertById([categoryA], categoryB)).toEqual([categoryA, categoryB])
  })

  it('removes rows by id and bookmarks by category', () => {
    expect(removeById([categoryA, categoryB], categoryA.id)).toEqual([categoryB])
    expect(removeBookmarksByCategory([bookmarkA, bookmarkB], categoryA.id)).toEqual([bookmarkB])
  })
})

describe('appLocalData bookmark icon updates', () => {
  it('updates only the target bookmark icon blob and preserves other references', () => {
    const updated = updateBookmarkIconBlob([bookmarkA, bookmarkB], bookmarkA.id, 'data:image/png;base64,abc')

    expect(updated[0]).toEqual({ ...bookmarkA, icon_blob: 'data:image/png;base64,abc' })
    expect(updated[1]).toBe(bookmarkB)
  })
})

describe('appLocalData sort helpers', () => {
  it('applies sort order to matching ids and keeps non-matching rows ordered by sort then id', () => {
    const result = applySortOrder([categoryC, categoryA, categoryB], [3, 1])

    expect(result.map((item) => [item.id, item.sort])).toEqual([
      [3, 0],
      [1, 1],
      [2, 1],
    ])
  })

  it('rebuilds the global bookmark id list from a category-local drag order', () => {
    const bookmarks = [
      { id: 10, category_id: 1, sort: 0 },
      { id: 20, category_id: 2, sort: 1 },
      { id: 11, category_id: 1, sort: 2 },
      { id: 21, category_id: 2, sort: 3 },
    ]

    expect(buildOrderedBookmarkIdsForCategory(bookmarks, 1, [11, 10])).toEqual([11, 20, 10, 21])
  })
})

describe('appLocalData public data adapters', () => {
  it('upserts admin category/bookmark rows into public collections', () => {
    const updatedCategory = { ...categoryA, title: 'Updated tools' }
    const updatedBookmark = { ...bookmarkA, title: 'Updated GitHub', description: 'Repo host' }

    expect(upsertCategory([categoryA], updatedCategory)).toEqual([updatedCategory])
    expect(upsertBookmark([bookmarkA], updatedBookmark)).toEqual([updatedBookmark])
    expect(upsertPublicCategory([publicCategoryA], categoryB)).toEqual([publicCategoryA, publicCategoryB])

    const publicBookmarks = upsertPublicBookmark([publicBookmarkA], updatedBookmark)
    expect(publicBookmarks).toHaveLength(1)
    expect(publicBookmarks[0]).toMatchObject({
      id: bookmarkA.id,
      title: 'Updated GitHub',
      description: 'Repo host',
    })
    expect(publicBookmarks[0]).not.toHaveProperty('created_at')
  })

  it('builds public data after category deletion by removing category and child bookmarks', () => {
    expect(buildPublicDataAfterCategoryDelete(
      [publicCategoryA, publicCategoryB],
      [publicBookmarkA, publicBookmarkB],
      categoryA.id,
    )).toEqual({
      categories: [publicCategoryB],
      bookmarks: [publicBookmarkB],
    })
  })
})
