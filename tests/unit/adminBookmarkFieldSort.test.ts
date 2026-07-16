import { describe, expect, it } from 'vitest'
import { cycleAdminBookmarkSort, sortAdminBookmarks } from '../../src/lib/adminListState'

const bookmarks = [
  { id: 1, category_id: 1, title: 'B', url: 'https://www.example.com/z', open_method: 'new_tab' as const },
  { id: 2, category_id: 1, title: 'A', url: 'https://example.com/a', open_method: 'same_tab' as const },
  { id: 3, category_id: 1, title: 'C', url: 'https://api.example.com/a', open_method: 'modal' as const },
]

describe('admin bookmark field sort', () => {
  it('cycles asc, desc and none and switches fields from asc', () => {
    expect(cycleAdminBookmarkSort({ field: null, direction: null }, 'title')).toEqual({ field: 'title', direction: 'asc' })
    expect(cycleAdminBookmarkSort({ field: 'title', direction: 'asc' }, 'title')).toEqual({ field: 'title', direction: 'desc' })
    expect(cycleAdminBookmarkSort({ field: 'title', direction: 'desc' }, 'title')).toEqual({ field: null, direction: null })
    expect(cycleAdminBookmarkSort({ field: 'title', direction: 'desc' }, 'url')).toEqual({ field: 'url', direction: 'asc' })
  })

  it('sorts hosts from right to left and preserves same-host path order', () => {
    expect(sortAdminBookmarks(bookmarks, { field: 'url', direction: 'asc' }).map((item) => item.id)).toEqual([2, 3, 1])
    const sameHost = [
      { ...bookmarks[0], id: 10, url: 'https://example.com/z' },
      { ...bookmarks[0], id: 11, url: 'https://example.com/a' },
    ]
    expect(sortAdminBookmarks(sameHost, { field: 'url', direction: 'asc' }).map((item) => item.id)).toEqual([10, 11])
  })
})
