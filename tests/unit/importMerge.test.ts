import { describe, expect, it } from 'vitest'
import { mergeImportData } from '../../worker/lib/db/importMerge'

describe('merge import data', () => {
  it('reuses case-insensitive categories, remaps ids and preserves settings', () => {
    const result = mergeImportData({
      categories: [{ id: 4, title: ' Work ', icon: 'x', sort: 0, created_at: 1 }],
      bookmarks: [], settings: null,
    }, {
      categories: [{ id: 1, title: 'work', icon: null, sort: 0, created_at: 1 }],
      bookmarks: [{ id: 1, category_id: 1, title: 'A', url: 'https://a.test', icon: null, icon_source: null, icon_background_color: null, icon_blob: null, description: null, description_mode: null, open_method: 1, sort: 0, created_at: 1 }],
      settings: { site_title: 'Imported' },
    })
    expect(result.reusedCategories).toBe(1)
    expect(result.createdCategories).toBe(0)
    expect(result.payload.bookmarks[0].category_id).toBe(4)
    expect(result.payload.settings).toBeUndefined()
  })
})
