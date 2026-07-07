import { describe, expect, it } from 'vitest'
import type { Bookmark, PublicBookmark } from '../../shared/types'
import {
  createBookmarkDraft,
  createCategoryDraft,
  findBookmarkForEdit,
} from '../../src/lib/appModalState'

const adminBookmark: Bookmark = {
  id: 10,
  category_id: 1,
  title: 'Admin bookmark',
  url: 'https://admin.example.com',
  icon: null,
  icon_source: null,
  icon_background_color: null,
  icon_blob: null,
  icon_cached: null,
  description: null,
  open_method: 1,
  sort: 0,
  created_at: 100,
}

const publicBookmark: PublicBookmark = {
  id: 11,
  category_id: 2,
  title: 'Public bookmark',
  url: 'https://public.example.com',
  icon: 'mdi:home',
  icon_source: 'iconify',
  icon_background_color: '#ffffff',
  icon_blob: null,
  icon_cached: true,
  description: 'Public',
  open_method: 3,
  sort: 1,
}

describe('app modal state helpers', () => {
  it('creates empty category drafts', () => {
    expect(createCategoryDraft()).toEqual({
      title: '',
      icon: '',
    })
  })

  it('creates bookmark drafts with the selected fallback category', () => {
    expect(createBookmarkDraft(3)).toEqual({
      category_id: 3,
      title: '',
      url: '',
      icon: '',
      icon_background_color: '',
      description: '',
      open_method: 'new_tab',
    })
  })

  it('prefers admin bookmarks when finding an editable bookmark', () => {
    expect(findBookmarkForEdit(10, [adminBookmark], [publicBookmark])).toBe(adminBookmark)
    expect(findBookmarkForEdit('10', [adminBookmark], [{ ...publicBookmark, id: 10 }])).toBe(adminBookmark)
  })

  it('falls back to public bookmarks and returns null for missing ids', () => {
    expect(findBookmarkForEdit(11, [], [publicBookmark])).toBe(publicBookmark)
    expect(findBookmarkForEdit(99, [adminBookmark], [publicBookmark])).toBeNull()
  })
})
