import type { CardSizeSetting, CategoryDisplaySetting, PublicSettings, Settings } from './types'

export const CATEGORY_DISPLAY_DEFAULTS: CategoryDisplaySetting = {
 root_font_size: 16,
 root_icon_size: 20,
 child_font_size: 14,
 child_icon_size: 18,
}

export const CATEGORY_DISPLAY_LIMITS = {
 root_font_size: { min: 12, max: 28 },
 root_icon_size: { min: 14, max: 36 },
 child_font_size: { min: 11, max: 24 },
 child_icon_size: { min: 12, max: 32 },
} as const

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
 if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
 return Math.min(max, Math.max(min, Math.round(value)))
}

export function normalizeCategoryDisplaySetting(value: unknown): CategoryDisplaySetting {
 const source = value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Partial<Record<keyof CategoryDisplaySetting, unknown>>
  : {}
 return {
  root_font_size: normalizeInteger(source.root_font_size, CATEGORY_DISPLAY_DEFAULTS.root_font_size, CATEGORY_DISPLAY_LIMITS.root_font_size.min, CATEGORY_DISPLAY_LIMITS.root_font_size.max),
  root_icon_size: normalizeInteger(source.root_icon_size, CATEGORY_DISPLAY_DEFAULTS.root_icon_size, CATEGORY_DISPLAY_LIMITS.root_icon_size.min, CATEGORY_DISPLAY_LIMITS.root_icon_size.max),
  child_font_size: normalizeInteger(source.child_font_size, CATEGORY_DISPLAY_DEFAULTS.child_font_size, CATEGORY_DISPLAY_LIMITS.child_font_size.min, CATEGORY_DISPLAY_LIMITS.child_font_size.max),
  child_icon_size: normalizeInteger(source.child_icon_size, CATEGORY_DISPLAY_DEFAULTS.child_icon_size, CATEGORY_DISPLAY_LIMITS.child_icon_size.min, CATEGORY_DISPLAY_LIMITS.child_icon_size.max),
 }
}
export const CARD_SIZE_DEFAULTS: CardSizeSetting = {
 width: 80,
 height: 60,
}

export const CARD_SIZE_LIMITS = {
 width: { min: 44, max: 400 },
 height: { min: 0, max: 300 },
} as const

export const CARD_ICON_SIZE_LIMITS = { min: 40, max: 100 } as const

export function normalizeCardSizeSetting(value: unknown): CardSizeSetting {
 const source = value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Partial<Record<keyof CardSizeSetting, unknown>>
  : {}
 return {
  width: normalizeInteger(source.width, CARD_SIZE_DEFAULTS.width, CARD_SIZE_LIMITS.width.min, CARD_SIZE_LIMITS.width.max),
  height: normalizeInteger(source.height, CARD_SIZE_DEFAULTS.height, CARD_SIZE_LIMITS.height.min, CARD_SIZE_LIMITS.height.max),
 }
}

export function normalizeCardIconSize(value: unknown): number {
 return normalizeInteger(value, 60, CARD_ICON_SIZE_LIMITS.min, CARD_ICON_SIZE_LIMITS.max)
}


export const SETTINGS_KEYS = [
 'site_title',
 'site_title_color',
 'site_title_font_size',
 'public_mode',
 'browser_sync_enabled',
 'theme',
 'background_preset_id',
 'background',
 'backgrounds',
 'custom_css',
 'custom_js',
 'image_host_url',
 'search_engine',
 'card_size',
 'card_style',
 'card_icon_size',
 'category_display',
 'card_show_description',
 'card_description_mode',
 'card_background_color',
 'card_background_opacity',
 'card_icon_show_title',
 'card_text_color',
 'search_box_show',
 'search_engine_selector_show',
 'content_layout',
 'navigation',
 'footer_html',
 'most_visited_count',
 'site_title_show',
] as const satisfies readonly (keyof Settings)[]

export const PUBLIC_SETTINGS_KEYS = [
 'site_title',
 'site_title_color',
 'site_title_font_size',
 'theme',
 'background_preset_id',
 'background',
 'backgrounds',
 'search_engine',
 'image_host_url',
 'card_size',
 'card_style',
 'card_icon_size',
 'category_display',
 'card_show_description',
 'card_description_mode',
 'card_background_color',
 'card_background_opacity',
 'card_icon_show_title',
 'card_text_color',
 'search_box_show',
 'search_engine_selector_show',
 'content_layout',
 'navigation',
 'footer_html',
 'custom_css',
 'custom_js',
 'most_visited_count',
 'site_title_show',
] as const satisfies readonly (keyof PublicSettings)[]

export const PUBLIC_DATA_SETTINGS_KEYS = [
 'public_mode',
 ...PUBLIC_SETTINGS_KEYS,
] as const satisfies readonly (keyof Settings)[]

export function toPublicSettings(settings: Settings): PublicSettings {
 return {
  site_title: settings.site_title,
  site_title_color: settings.site_title_color,
  site_title_font_size: settings.site_title_font_size,
  theme: settings.theme,
  background_preset_id: settings.background_preset_id,
  background: settings.background,
  backgrounds: settings.backgrounds,
  search_engine: settings.search_engine,
  image_host_url: settings.image_host_url,
  card_size: settings.card_size,
  card_style: settings.card_style,
  card_icon_size: settings.card_icon_size,
  category_display: settings.category_display,
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
  custom_css: settings.custom_css,
  custom_js: settings.custom_js,
  most_visited_count: settings.most_visited_count,
  site_title_show: settings.site_title_show,
 }
}
