import { describe, expect, it } from 'vitest'
import { validateImportPayload } from '../../worker/lib/importValidation'

const validPayload = {
  categories: [
    { id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0 },
  ],
  bookmarks: [
    {
      id: 10,
      category_id: 1,
      title: 'GitHub',
      url: 'https://github.com',
      icon: null,
      icon_source: null,
      icon_background_color: null,
      icon_blob: null,
      icon_cached: null,
      description: null,
      open_method: 1,
      sort: 0,
    },
  ],
  settings: { site_title: 'CF-Navs' },
}

describe('import payload validation', () => {
  it('accepts a valid import payload', () => {
    expect(validateImportPayload(validPayload)).toEqual({
      ok: true,
      payload: validPayload,
    })
  })

  it('rejects invalid shapes with route-compatible messages', () => {
    expect(validateImportPayload(null)).toEqual({ ok: false, message: 'invalid import payload' })
    expect(validateImportPayload({ categories: [], bookmarks: null })).toEqual({
      ok: false,
      message: 'categories / bookmarks must be arrays',
    })
    expect(validateImportPayload({ ...validPayload, categories: [{ id: 0, title: '' }] })).toEqual({
      ok: false,
      message: 'invalid category in payload',
    })
    expect(validateImportPayload({ ...validPayload, bookmarks: [{ id: 10, category_id: 1, title: '', url: '' }] })).toEqual({
      ok: false,
      message: 'invalid bookmark in payload',
    })
  })

  it('rejects duplicate ids and missing category references', () => {
    expect(validateImportPayload({
      ...validPayload,
      categories: [...validPayload.categories, { ...validPayload.categories[0] }],
    })).toEqual({ ok: false, message: 'duplicate category id: 1' })

    expect(validateImportPayload({
      ...validPayload,
      bookmarks: [...validPayload.bookmarks, { ...validPayload.bookmarks[0] }],
    })).toEqual({ ok: false, message: 'duplicate bookmark id: 10' })

    expect(validateImportPayload({
      ...validPayload,
      bookmarks: [{ ...validPayload.bookmarks[0], category_id: 99 }],
    })).toEqual({ ok: false, message: 'bookmark 10 references missing category 99' })
  })

  it('rejects null, array, or scalar settings when settings is present', () => {
    expect(validateImportPayload({ ...validPayload, settings: null })).toEqual({
      ok: false,
      message: 'invalid settings',
    })
    expect(validateImportPayload({ ...validPayload, settings: [] })).toEqual({
      ok: false,
      message: 'invalid settings',
    })
  })
})
