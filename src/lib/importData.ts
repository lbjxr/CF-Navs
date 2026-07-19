import type { BackupData, Bookmark, Category, ImportReq, Settings } from '../../shared/types'
import { normalizeCategories } from '../../shared/categoryHierarchy'
import { iconifyIcon } from './icons'

export type ImportSource = 'cf-navs' | 'sunpanel' | 'browser-html'

export interface PreparedImport {
  payload: ImportReq
  categories: number
  bookmarks: number
  sourceLabel: string
  skipped?: number
  retainedIcons?: number
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

interface NormalizedSunPanelIcon {
  icon: string | null
  icon_source: Bookmark['icon_source']
  icon_background_color: string | null
}

function readSunPanelIconValue(icon: unknown): string {
  if (typeof icon === 'string') {
    return icon.trim()
  }

  if (!isRecord(icon)) {
    return ''
  }

  return (
    readString(icon.src) ||
    readString(icon.icon) ||
    readString(icon.name) ||
    readString(icon.value) ||
    readString(icon.iconName)
  ).trim()
}

function normalizeSunPanelIcon(icon: unknown, fallbackUrl: string): NormalizedSunPanelIcon {
  const value = readSunPanelIconValue(icon)
  const iconify = iconifyIcon(value)
  const iconBackground = normalizeIconBackground(icon)

  if (iconify) {
    return {
      icon: iconify,
      icon_source: 'iconify',
      icon_background_color: iconBackground,
    }
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return {
      icon: value,
      icon_source: null,
      icon_background_color: iconBackground,
    }
  }

  return {
    icon: faviconForUrl(fallbackUrl) || null,
    icon_source: null,
    icon_background_color: iconBackground,
  }
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
      categories: normalizeCategories(data.categories as Category[]),
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
      parent_id: null,
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
      const normalizedIcon = normalizeSunPanelIcon(rawBookmark.icon, url)
      bookmarks.push({
        id: nextBookmarkId,
        category_id: categoryId,
        title: readString(rawBookmark.title, `Bookmark ${nextBookmarkId}`).trim() || `Bookmark ${nextBookmarkId}`,
        url,
        icon: normalizedIcon.icon,
        icon_source: normalizedIcon.icon_source,
        icon_background_color: normalizedIcon.icon_background_color,
        icon_blob: null,
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

export function parseImportJsonText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
}

export function detectImportSource(text: string, fileName = ''): ImportSource {
  if (/\.html?$/i.test(fileName) || /<!DOCTYPE NETSCAPE-Bookmark-file/i.test(text) || /<DL\b[^>]*>/i.test(text) && /<A\b[^>]*HREF=/i.test(text)) return 'browser-html'
  const parsed = parseImportJsonText(text)
  return isRecord(parsed) && Array.isArray(parsed.icons) ? 'sunpanel' : 'cf-navs'
}

export function prepareImportText(text: string, source: ImportSource): PreparedImport {
  if (source === 'browser-html') return prepareBrowserBookmarkHtml(text)
  return prepareImportPayload(parseImportJsonText(text), source)
}

function validBookmarkUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function titleFallback(title: string, url: string): string {
  if (title.trim()) return title.trim()
  try { return new URL(url).hostname || url } catch { return url }
}

export function prepareBrowserBookmarkHtml(text: string): PreparedImport {
  if (text.length > 20 * 1024 * 1024) throw new Error('书签 HTML 文件过大')
  if (!/<DL\b/i.test(text) || !/<A\b/i.test(text)) throw new Error('未找到有效的书签 HTML 结构')
  const now = Date.now()
  const categories: Category[] = []
  const bookmarks: Bookmark[] = []
  let nextCategoryId = 1
  let nextBookmarkId = 1
  let skipped = 0
  let retainedIcons = 0

  const rootByTitle = new Map<string, Category>()
  const childByPath = new Map<string, Category>()
  const nextSort = new Map<number, number>()
  function decode(value: string): string {
    return value.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  }
  function attribute(tag: string, name: string): string {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    return decode(match?.[1] ?? match?.[2] ?? match?.[3] ?? '')
  }
  function rootCategoryFor(title: string): Category {
    const normalized = title.trim() || '浏览器书签'
    const key = normalized.toLowerCase()
    const existing = rootByTitle.get(key)
    if (existing) return existing
    const category: Category = {
      id: nextCategoryId++,
      parent_id: null,
      title: normalized,
      icon: null,
      sort: rootByTitle.size,
      created_at: now,
    }
    categories.push(category)
    rootByTitle.set(key, category)
    nextSort.set(category.id, 0)
    return category
  }

  function categoryForPath(path: string[]): Category {
    if (path.length === 0) return rootCategoryFor('浏览器书签')
    const root = rootCategoryFor(path[0])
    if (path.length === 1) return root

    const childTitle = path.slice(1).join(' › ')
    const key = `${root.id}:${childTitle.toLowerCase()}`
    const existing = childByPath.get(key)
    if (existing) return existing
    const siblingSort = [...childByPath.values()].filter((category) => category.parent_id === root.id).length
    const category: Category = {
      id: nextCategoryId++,
      parent_id: root.id,
      title: childTitle,
      icon: null,
      sort: siblingSort,
      created_at: now,
    }
    categories.push(category)
    childByPath.set(key, category)
    nextSort.set(category.id, 0)
    return category
  }

  function parseLink(tag: string, title: string, categoryPath: string[]) {
    const url = attribute(tag, 'HREF').trim()
    if (!validBookmarkUrl(url)) { skipped += 1; return }
    const categoryId = categoryForPath(categoryPath).id
    const icon = (attribute(tag, 'ICON') || attribute(tag, 'ICON_URI')).trim() || null
    const safeIcon = icon && (/^https?:\/\//i.test(icon) || (/^data:image\//i.test(icon) && icon.length <= 256 * 1024)) ? icon : null
    if (safeIcon) retainedIcons += 1
    const sort = nextSort.get(categoryId) ?? 0
    nextSort.set(categoryId, sort + 1)
    bookmarks.push({
      id: nextBookmarkId++, category_id: categoryId,
      title: titleFallback(decode(title.replace(/<[^>]+>/g, '')), url), url,
      icon: safeIcon?.startsWith('data:') ? null : safeIcon,
      icon_source: safeIcon?.startsWith('data:') ? 'custom' : null,
      icon_background_color: null, icon_blob: safeIcon?.startsWith('data:') ? safeIcon : null,
      description: null, description_mode: null,
      open_method: 1, sort, created_at: Number(attribute(tag, 'ADD_DATE')) ? Number(attribute(tag, 'ADD_DATE')) * 1000 : now,
    })
  }

  const tokens = text.match(/<\/?(?:DL|H3|A|DD|DT)\b[^>]*>|[^<]+/gi) ?? []
  type DlContext = { categoryPath: string[] }
  const dlStack: DlContext[] = []
  let pendingHeading = ''
  let captureHeading = false
  let headingText = ''
  let captureLink = false
  let linkTag = ''
  let linkText = ''
  let captureDescription = false
  let descriptionText = ''
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      if (captureHeading) headingText += token
      if (captureLink) linkText += token
      if (captureDescription) descriptionText += token
      continue
    }
    if (/^<H3\b/i.test(token)) { captureHeading = true; headingText = ''; continue }
    if (/^<\/H3/i.test(token)) { captureHeading = false; pendingHeading = decode(headingText.replace(/<[^>]+>/g, '')).trim(); continue }
    if (/^<DL\b/i.test(token)) {
      const parent = dlStack[dlStack.length - 1]
      const categoryPath = pendingHeading
        ? [...(parent?.categoryPath ?? []), pendingHeading]
        : [...(parent?.categoryPath ?? [])]
      dlStack.push({ categoryPath })
      pendingHeading = ''
      continue
    }
    if (/^<\/DL/i.test(token)) { dlStack.pop(); continue }
    if (/^<A\b/i.test(token)) { captureLink = true; linkTag = token; linkText = ''; captureDescription = false; continue }
    if (/^<\/A/i.test(token)) {
      captureLink = false
      const categoryPath = dlStack[dlStack.length - 1]?.categoryPath ?? []
      // 浏览器导出通常会用第一层 H3（如“收藏夹栏”）包住整个目录树；
      // 该层只是导出容器，不作为业务分类，后续层级整体上移一级。
      parseLink(linkTag, linkText, categoryPath.slice(1))
      continue
    }
    if (/^<DD\b/i.test(token)) { captureDescription = true; descriptionText = ''; continue }
    if (captureDescription) { const description = decode(descriptionText).trim(); if (description && bookmarks.length > 0) bookmarks[bookmarks.length - 1].description = description; captureDescription = false }
  }
  if (captureDescription) { const description = decode(descriptionText).trim(); if (description && bookmarks.length > 0) bookmarks[bookmarks.length - 1].description = description }
  if (bookmarks.length === 0) throw new Error('书签文件中没有有效的 HTTP(S) 链接')
  return { payload: { categories, bookmarks, mode: 'replace' }, categories: categories.length, bookmarks: bookmarks.length, sourceLabel: '浏览器书签 HTML', skipped, retainedIcons }
}
