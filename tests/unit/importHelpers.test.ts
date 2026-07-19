import { describe, expect, it } from 'vitest'
import { normalizeImportCategory, normalizeImportBookmark, remapImportRecords } from '../../worker/lib/db/importHelpers'
import type { Bookmark, Category } from '../../shared/types'

describe('normalizeImportCategory', () => {
  const now = 1700000000000

  it('passes through well-formed categories', () => {
    const input: Category = { id: 1, title: 'Tools', icon: '/icon.svg', sort: 3, created_at: 100 }
    const output = normalizeImportCategory(input, now)

    expect(output).toEqual({
      id: 1,
      parent_id: null,
      title: 'Tools',
      icon: '/icon.svg',
      sort: 3,
      created_at: 100,
    })
  })

  it('defaults null icon to null', () => {
    const input: Category = { id: 2, title: 'Empty', icon: null, sort: 0, created_at: 0 }
    const output = normalizeImportCategory(input, now)

    expect(output.icon).toBeNull()
  })

  it('defaults missing or NaN sort to 0', () => {
    const input: Category = { id: 3, title: 'Bad', icon: null, sort: NaN, created_at: 0 }
    const output = normalizeImportCategory(input, now)

    expect(output.sort).toBe(0)
  })

  it('defaults missing sort (undefined) to 0', () => {
    const input = { id: 4, title: 'NoSort', icon: null, created_at: 0 } as unknown as Category
    const output = normalizeImportCategory(input, now)

    expect(output.sort).toBe(0)
  })

  it('falls back to now when created_at is falsy', () => {
    const input: Category = { id: 5, title: 'Fresh', icon: null, sort: 1, created_at: 0 }
    const output = normalizeImportCategory(input, now)

    expect(output.created_at).toBe(now)
  })

  it('keeps negative sort if finite', () => {
    const input: Category = { id: 6, title: 'Neg', icon: null, sort: -5, created_at: 50 }
    const output = normalizeImportCategory(input, now)

    expect(output.sort).toBe(-5)
  })
})

describe('normalizeImportBookmark', () => {
  const now = 1700000000000

  const base: Bookmark = {
    id: 1,
    category_id: 10,
    title: 'GitHub',
    url: 'https://github.com',
    icon: 'https://favicon.im/github.com',
    icon_source: 'favicon_im' as const,
    icon_background_color: '#333',
    icon_blob: null,
    description: 'Code host',
    description_mode: null,
    open_method: 1,
    sort: 5,
    created_at: 100,
  }

  it('passes through well-formed bookmarks', () => {
    const output = normalizeImportBookmark(base, now)
    expect(output).toEqual(base)
  })

  it('clamps open_method 1/2/3 correctly', () => {
    expect(normalizeImportBookmark({ ...base, open_method: 1 }, now).open_method).toBe(1)
    expect(normalizeImportBookmark({ ...base, open_method: 2 }, now).open_method).toBe(2)
    expect(normalizeImportBookmark({ ...base, open_method: 3 }, now).open_method).toBe(3)
    // Everything else maps to 1
    expect(normalizeImportBookmark({ ...base, open_method: 0 as 1 | 2 | 3 }, now).open_method).toBe(1)
    expect(normalizeImportBookmark({ ...base, open_method: 4 as 1 | 2 | 3 }, now).open_method).toBe(1)
    expect(normalizeImportBookmark({ ...base, open_method: 99 as 1 | 2 | 3 }, now).open_method).toBe(1)
  })

  it('defaults null icon to null', () => {
    const output = normalizeImportBookmark({ ...base, icon: null }, now)
    expect(output.icon).toBeNull()
  })

  it('defaults missing optional fields to null', () => {
    const stripped = {
      id: 2,
      category_id: 10,
      title: 'Stripped',
      url: 'https://example.com',
      icon: null,
      open_method: 1 as 1 | 2 | 3,
      sort: 0,
      created_at: 0,
    } as unknown as Bookmark

    const output = normalizeImportBookmark(stripped, now)

    expect(output.description).toBeNull()
    expect(output.icon_source).toBeNull()
    expect(output.icon_background_color).toBeNull()
    expect(output.icon_blob).toBeNull()
  })

  it('defaults NaN sort to 0', () => {
    const output = normalizeImportBookmark({ ...base, sort: NaN }, now)
    expect(output.sort).toBe(0)
  })

  it('falls back to now when created_at is falsy', () => {
    const output = normalizeImportBookmark({ ...base, created_at: 0 }, now)
    expect(output.created_at).toBe(now)
  })

  it('keeps explicit sort and icon data', () => {
    const output = normalizeImportBookmark(base, now)
    expect(output.sort).toBe(5)
    expect(output.icon_source).toBe('favicon_im')
    expect(output.icon_background_color).toBe('#333')
    expect(output.description).toBe('Code host')
  })
})

describe('remapImportRecords', () => {
  it('inserts roots before children and rewrites parent and bookmark category ids', () => {
    const result = remapImportRecords([
      { id: 10, parent_id: 20, title: 'Child', icon: null, sort: 0, created_at: 1 },
      { id: 20, parent_id: null, title: 'Root', icon: null, sort: 0, created_at: 1 },
    ], [{
      id: 30,
      category_id: 10,
      title: 'Bookmark',
      url: 'https://bookmark.test',
      icon: null,
      icon_source: null,
      icon_background_color: null,
      icon_blob: null,
      description: null,
      description_mode: null,
      open_method: 1,
      sort: 0,
      created_at: 1,
    }], 100)

    expect(result.categories.map((category) => ({ id: category.id, parent_id: category.parent_id, title: category.title }))).toEqual([
      { id: 1, parent_id: null, title: 'Root' },
      { id: 2, parent_id: 1, title: 'Child' },
    ])
    expect(result.bookmarks[0].category_id).toBe(2)
    expect(result.categoryIdMap).toEqual(new Map([[20, 1], [10, 2]]))
  })
})
