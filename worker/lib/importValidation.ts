import type { Bookmark, Category, ImportReq } from '../../shared/types'

export type ImportValidationResult =
  | { ok: true; payload: ImportReq }
  | { ok: false; message: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isValidCategory(value: unknown): value is Category {
  if (!isPlainObject(value)) return false
  return (
    Number.isInteger(value.id) &&
    (value.id as number) > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.icon === null || value.icon === undefined || typeof value.icon === 'string')
  )
}

function isValidBookmark(value: unknown): value is Bookmark {
  if (!isPlainObject(value)) return false
  return (
    Number.isInteger(value.id) &&
    (value.id as number) > 0 &&
    Number.isInteger(value.category_id) &&
    (value.category_id as number) > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
      typeof value.url === 'string' &&
    value.url.trim().length > 0 &&
    (value.description_mode === null || value.description_mode === undefined || value.description_mode === 'always' || value.description_mode === 'hover' || value.description_mode === 'hidden')
  )
}

export function validateImportPayload(body: unknown): ImportValidationResult {
  if (!isPlainObject(body)) {
    return { ok: false, message: 'invalid import payload' }
  }

  if (!Array.isArray(body.categories) || !Array.isArray(body.bookmarks)) {
    return { ok: false, message: 'categories / bookmarks must be arrays' }
  }
  if (!body.categories.every(isValidCategory)) {
    return { ok: false, message: 'invalid category in payload' }
  }
  if (!body.bookmarks.every(isValidBookmark)) {
    return { ok: false, message: 'invalid bookmark in payload' }
  }

  const categoryIds = new Set<number>()
  for (const category of body.categories) {
    if (categoryIds.has(category.id)) {
      return { ok: false, message: `duplicate category id: ${category.id}` }
    }
    categoryIds.add(category.id)
  }

  const bookmarkIds = new Set<number>()
  for (const bookmark of body.bookmarks) {
    if (bookmarkIds.has(bookmark.id)) {
      return { ok: false, message: `duplicate bookmark id: ${bookmark.id}` }
    }
    bookmarkIds.add(bookmark.id)

    if (!categoryIds.has(bookmark.category_id)) {
      return { ok: false, message: `bookmark ${bookmark.id} references missing category ${bookmark.category_id}` }
    }
  }

  if (body.settings !== undefined && !isPlainObject(body.settings)) {
    return { ok: false, message: 'invalid settings' }
  }
  if (body.mode !== undefined && body.mode !== 'replace' && body.mode !== 'merge') {
    return { ok: false, message: 'invalid import mode' }
  }

  return {
    ok: true,
    payload: {
      categories: body.categories,
      bookmarks: body.bookmarks,
      settings: body.settings,
      mode: body.mode,
    },
  }
}
