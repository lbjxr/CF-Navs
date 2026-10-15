import { describe, expect, it } from 'vitest'
import {
  MAX_IMPORT_BOOKMARKS,
  MAX_IMPORT_CATEGORIES,
  validateImportPayload,
} from '../../../worker/lib/importValidation'

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
      droppedBookmarks: 0,
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

describe('import payload size limits', () => {
  function bookmark(id: number) {
    return { ...validPayload.bookmarks[0], id }
  }

  it('rejects an oversized category list with an actionable message', () => {
    // 之前完全不限长度：用户导入一个超大书签文件只会拿到一个没有解释的 500
    const categories = Array.from({ length: MAX_IMPORT_CATEGORIES + 1 }, (_, index) => ({
      ...validPayload.categories[0],
      id: index + 1,
    }))

    expect(validateImportPayload({ ...validPayload, categories })).toEqual({
      ok: false,
      message: `too many categories, limit is ${MAX_IMPORT_CATEGORIES}`,
    })
  })

  it('rejects an oversized bookmark list with an actionable message', () => {
    const bookmarks = Array.from({ length: MAX_IMPORT_BOOKMARKS + 1 }, (_, index) => bookmark(index + 1))

    expect(validateImportPayload({ ...validPayload, bookmarks })).toEqual({
      ok: false,
      message: `too many bookmarks, limit is ${MAX_IMPORT_BOOKMARKS}`,
    })
  })

  it('accepts a list exactly at the limit', () => {
    const bookmarks = Array.from({ length: MAX_IMPORT_BOOKMARKS }, (_, index) => bookmark(index + 1))

    expect(validateImportPayload({ ...validPayload, bookmarks }).ok).toBe(true)
  })
})

describe('import bookmark url policy', () => {
  function bookmarkWithUrl(id: number, url: string) {
    return { ...validPayload.bookmarks[0], id, url }
  }

  it('drops script-capable urls instead of failing the whole import', () => {
    // 为了一条 javascript: 小书签让整次备份恢复失败，是比丢一条更糟的结果。
    const result = validateImportPayload({
      ...validPayload,
      bookmarks: [
        bookmarkWithUrl(10, 'https://github.com'),
        bookmarkWithUrl(11, 'javascript:alert(1)'),
        bookmarkWithUrl(12, 'data:text/html,x'),
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.droppedBookmarks).toBe(2)
    expect(result.payload.bookmarks.map((bookmark) => bookmark.id)).toEqual([10])
  })

  it('rescues schemeless urls rather than dropping them', () => {
    const result = validateImportPayload({
      ...validPayload,
      bookmarks: [bookmarkWithUrl(10, 'example.com/tools')],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.droppedBookmarks).toBe(0)
    expect(result.payload.bookmarks[0].url).toBe('https://example.com/tools')
  })

  it('keeps valid urls as the exact same object', () => {
    // 备份恢复不该重写地址，也不该产生多余的对象拷贝。
    const original = bookmarkWithUrl(10, 'https://github.com')
    const result = validateImportPayload({ ...validPayload, bookmarks: [original] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.payload.bookmarks[0]).toBe(original)
  })

  it('still reports duplicate ids and missing categories before dropping', () => {
    // 丢弃发生在引用校验之后：坏 URL 不该掩盖掉结构性错误。
    expect(validateImportPayload({
      ...validPayload,
      bookmarks: [bookmarkWithUrl(10, 'javascript:alert(1)'), bookmarkWithUrl(10, 'https://a.com')],
    })).toEqual({ ok: false, message: 'duplicate bookmark id: 10' })
  })
})
