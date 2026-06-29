import type { BackupData, Bookmark, Category, ImportReq, Settings } from '../../shared/types'

export type ImportSource = 'cf-navs' | 'sunpanel'

export interface PreparedImport {
  payload: ImportReq
  categories: number
  bookmarks: number
  sourceLabel: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeUrl(value: unknown): string {
  const text = readString(value).trim()
  if (!text) return ''
  return text
}

function faviconForUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    return hostname ? `https://favicon.im/${hostname}?larger=true` : ''
  } catch {
    return ''
  }
}

function normalizeImageIcon(icon: unknown, fallbackUrl: string): string | null {
  if (typeof icon === 'string') {
    const trimmed = icon.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
    return faviconForUrl(fallbackUrl) || null
  }

  if (!isRecord(icon)) {
    return faviconForUrl(fallbackUrl) || null
  }

  const src = readString(icon.src).trim()
  const itemType = readNumber(icon.itemType, 0)

  if (itemType === 2 && (src.startsWith('http://') || src.startsWith('https://'))) {
    return src
  }

  return faviconForUrl(fallbackUrl) || null
}

function normalizeIconBackground(icon: unknown): string | null {
  if (!isRecord(icon)) return null
  const color = readString(icon.backgroundColor).trim()
  return color || null
}

function sunPanelOpenMethodToCFNavs(value: unknown): 1 | 2 | 3 {
  const method = readNumber(value, 2)
  if (method === 1) return 2
  if (method === 3) return 3
  return 1
}

function prepareCFNavsImport(parsed: unknown): PreparedImport {
  if (!isRecord(parsed)) {
    throw new Error('Invalid backup JSON')
  }

  const data = parsed as Partial<BackupData>
  if (!Array.isArray(data.categories) || !Array.isArray(data.bookmarks)) {
    throw new Error('Backup file is missing categories / bookmarks')
  }

  return {
    payload: {
      categories: data.categories as Category[],
      bookmarks: data.bookmarks as Bookmark[],
      settings: (data.settings ?? undefined) as Partial<Settings> | undefined,
    },
    categories: data.categories.length,
    bookmarks: data.bookmarks.length,
    sourceLabel: 'CF-Navs backup',
  }
}

function prepareSunPanelImport(parsed: unknown): PreparedImport {
  if (!isRecord(parsed)) {
    throw new Error('Invalid SunPanel JSON')
  }

  const icons = parsed.icons
  if (!Array.isArray(icons)) {
    throw new Error('SunPanel file is missing icons')
  }

  const now = Date.now()
  const categories: Category[] = []
  const bookmarks: Bookmark[] = []
  let bookmarkId = 1

  icons.forEach((rawCategory, categoryIndex) => {
    if (!isRecord(rawCategory)) return

    const categoryId = categoryIndex + 1
    categories.push({
      id: categoryId,
      title: readString(rawCategory.title, `Category ${categoryId}`).trim() || `Category ${categoryId}`,
      icon: null,
      sort: readNumber(rawCategory.sort, categoryIndex),
      created_at: now,
    })

    const children = rawCategory.children
    if (!Array.isArray(children)) return

    children.forEach((rawBookmark, bookmarkIndex) => {
      if (!isRecord(rawBookmark)) return

      const url = normalizeUrl(rawBookmark.url)
      if (!url) return

      const nextBookmarkId = bookmarkId++
      bookmarks.push({
        id: nextBookmarkId,
        category_id: categoryId,
        title: readString(rawBookmark.title, `Bookmark ${nextBookmarkId}`).trim() || `Bookmark ${nextBookmarkId}`,
        url,
        icon: normalizeImageIcon(rawBookmark.icon, url),
        icon_source: null,
        icon_background_color: normalizeIconBackground(rawBookmark.icon),
        description: readString(rawBookmark.description).trim() || null,
        open_method: sunPanelOpenMethodToCFNavs(rawBookmark.openMethod),
        sort: readNumber(rawBookmark.sort, bookmarkIndex),
        created_at: now,
      })
    })
  })

  if (categories.length === 0) {
    throw new Error('SunPanel file does not contain importable categories')
  }

  return {
    payload: { categories, bookmarks },
    categories: categories.length,
    bookmarks: bookmarks.length,
    sourceLabel: 'SunPanel export',
  }
}

export function prepareImportPayload(parsed: unknown, source: ImportSource): PreparedImport {
  return source === 'sunpanel' ? prepareSunPanelImport(parsed) : prepareCFNavsImport(parsed)
}
