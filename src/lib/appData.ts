import type { AdminData, Bookmark, Category, PublicBookmark, PublicData, PublicSettings, Settings } from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import { colorToRgbString } from './color'

export { toPublicSettings } from '../../shared/settings'

export type AdminCategorySummary = {
  id: string | number
  title: string
  icon?: string
  bookmarkCount?: number
}

export type AdminBookmarkSummary = {
  id: string | number
  category_id: string | number
  title: string
  url: string
  icon?: string
  icon_source?: string
  icon_background_color?: string
  icon_blob?: string
  icon_cached?: boolean | number | null
  description?: string
  description_mode?: 'always' | 'hover' | 'hidden' | null
  open_method?: 'same_tab' | 'new_tab' | 'modal'
}

export type SettingsFormValue = Pick<
  Settings,
  'site_title' | 'site_title_color' | 'site_title_font_size' | 'public_mode' | 'theme' | 'background_preset_id' | 'custom_css' | 'custom_js' | 'image_host_url' | 'background' | 'backgrounds' | 'search_engine' | 'card_size' | 'card_style' | 'card_icon_size' | 'card_show_description' | 'card_description_mode' | 'card_background_color' | 'card_background_opacity' | 'card_icon_show_title' | 'card_text_color' | 'search_box_show' | 'search_engine_selector_show' | 'content_layout' | 'navigation' | 'footer_html'
>

export function toAdminCategories(categories: Category[], bookmarks: Bookmark[]): AdminCategorySummary[] {
  const bookmarkCountByCategory = new Map<number, number>()
  for (const bookmark of bookmarks) {
    bookmarkCountByCategory.set(
      bookmark.category_id,
      (bookmarkCountByCategory.get(bookmark.category_id) ?? 0) + 1,
    )
  }

  return categories.map((category) => ({
    id: category.id,
    title: category.title,
    icon: category.icon ?? '',
    bookmarkCount: bookmarkCountByCategory.get(category.id) ?? 0,
  }))
}

export function toAdminBookmarks(bookmarks: Bookmark[]): AdminBookmarkSummary[] {
  return bookmarks.map((bookmark) => ({
    id: bookmark.id,
    category_id: bookmark.category_id,
    title: bookmark.title,
    url: bookmark.url,
    icon: bookmark.icon ?? '',
    icon_source: bookmark.icon_source ?? '',
    icon_background_color: bookmark.icon_background_color ?? '',
    icon_blob: bookmark.icon_blob ?? '',
    icon_cached: bookmark.icon_cached ?? false,
    description: bookmark.description ?? '',
    description_mode: bookmark.description_mode ?? null,
    open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
  }))
}

export function toPublicBookmark(bookmark: Bookmark): PublicBookmark {
  return {
    id: bookmark.id,
    category_id: bookmark.category_id,
    title: bookmark.title,
    url: bookmark.url,
    icon: bookmark.icon,
    icon_source: bookmark.icon_source,
    icon_background_color: bookmark.icon_background_color,
    icon_blob: bookmark.icon_blob,
    icon_cached: bookmark.icon_cached,
    description: bookmark.description,
    description_mode: bookmark.description_mode ?? null,
    open_method: bookmark.open_method,
    sort: bookmark.sort,
  }
}

export function toPublicBookmarks(bookmarks: Bookmark[]): PublicBookmark[] {
  return bookmarks.map(toPublicBookmark)
}

export function toSettingsForm(settings: Settings | null): SettingsFormValue | null {
  if (!settings) return null

  return {
    site_title: settings.site_title,
    site_title_color: settings.site_title_color,
    site_title_font_size: settings.site_title_font_size,
    public_mode: settings.public_mode,
    theme: settings.theme,
    background_preset_id: settings.background_preset_id,
    custom_css: settings.custom_css,
    custom_js: settings.custom_js,
    image_host_url: settings.image_host_url,
    background: settings.background,
    backgrounds: settings.backgrounds,
    search_engine: settings.search_engine,
    card_size: settings.card_size,
    card_style: settings.card_style,
    card_icon_size: settings.card_icon_size,
    card_show_description: settings.card_show_description,
    card_description_mode: settings.card_description_mode,
    card_background_color: settings.card_background_color,
    card_background_opacity: settings.card_background_opacity,
    card_icon_show_title: settings.card_icon_show_title,
    card_text_color: settings.card_text_color,
    search_box_show: settings.search_box_show,
    search_engine_selector_show: settings.search_engine_selector_show,
    content_layout: settings.content_layout,
    navigation: settings.navigation,
    footer_html: settings.footer_html,
  }
}

export function getDataVersion(data: { version?: string } | null | undefined): string | null {
  return typeof data?.version === 'string' && data.version ? data.version : null
}

export function stripPublicDataVersion(data: PublicData): PublicData {
  const { version: _version, ...rest } = data
  return rest as PublicData
}

export function stripAdminDataVersion(data: AdminData): AdminData {
  const { version: _version, ...rest } = data
  return rest as AdminData
}

function recordsEqual(a: object, b: object): boolean {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    if (!Object.is(left[key], right[key])) return false
  }

  return true
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true

  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function mergeRowsById<T extends { id: number }>(current: T[], next: T[]): T[] {
  if (current.length === 0) return next

  const currentById = new Map(current.map((item) => [item.id, item]))
  let changed = current.length !== next.length

  const merged = next.map((item, index) => {
    const existing = currentById.get(item.id)
    const value = existing && recordsEqual(existing, item) ? existing : item
    if (current[index] !== value) changed = true
    return value
  })

  return changed ? merged : current
}

export function mergePublicData(current: PublicData | null, next: PublicData): PublicData {
  if (!current) return next

  const categories = mergeRowsById(current.categories, next.categories)
  const bookmarks = mergeRowsById(current.bookmarks, next.bookmarks)
  const settings = jsonEqual(current.settings, next.settings) ? current.settings : next.settings

  if (categories === current.categories && bookmarks === current.bookmarks && settings === current.settings) {
    return current
  }

  return { categories, bookmarks, settings }
}

export function mergeAdminData(current: AdminData, next: AdminData): AdminData {
  const categories = mergeRowsById(current.categories, next.categories)
  const bookmarks = mergeRowsById(current.bookmarks, next.bookmarks)
  const settings = jsonEqual(current.settings, next.settings) ? current.settings : next.settings

  if (categories === current.categories && bookmarks === current.bookmarks && settings === current.settings) {
    return current
  }

  return { categories, bookmarks, settings }
}

export function adminDataToPublicData(data: AdminData, settings: Settings): PublicData {
  return {
    categories: data.categories,
    bookmarks: toPublicBookmarks(data.bookmarks),
    settings: toPublicSettings(settings),
  }
}

export function buildHomeBackground(settings: PublicSettings | null, theme: 'light' | 'dark'): string {
  if (!settings) return ''

  const background = settings.backgrounds?.[theme] ?? settings.background
  const blur = Math.min(40, Math.max(0, Number(background.blur) || 0))
  const mask = Math.min(1, Math.max(0, Number(background.mask) ?? 0.3))
  const maskColor = background.maskColor?.trim() || '#000000'

  let layer = background.value
  if (background.type === 'image' && background.value) {
    layer = `url("${background.value}") center / cover no-repeat`
  }
  const backgroundFilter = blur > 0 ? `blur(${blur}px)` : 'none'
  const backgroundTransform = blur > 0 ? 'scale(1.06)' : 'none'
  const cardColor = settings.card_background_color?.trim() || '#ffffff'
  const cardOpacity = typeof settings.card_background_opacity === 'number'
    ? Math.min(1, Math.max(0, settings.card_background_opacity))
    : 0.9
  const cardRgb = colorToRgbString(cardColor)

  return [
    `--home-background: ${layer};`,
    `--home-background-blur: ${blur}px;`,
    `--home-background-filter: ${backgroundFilter};`,
    `--home-background-transform: ${backgroundTransform};`,
    `--home-background-mask: ${mask};`,
    `--home-background-mask-color: ${maskColor};`,
    `--card-bg-rgb: ${cardRgb};`,
    `--card-bg-opacity: ${cardOpacity};`,
  ].join(' ')
}
