import {
  BUILTIN_BACKGROUND_PRESET_IDS,
  type Settings,
} from '../../shared/types'
import { SETTINGS_KEYS } from '../../shared/settings'

// Keep these defaults aligned with schema.sql seed settings.
export const DEFAULT_SETTINGS: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'color', value: '#f8fafc', blur: 0, mask: 0.18, maskColor: '#ffffff' },
    dark: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  },
  custom_css: '',
  custom_js: '',
  image_host_url: '',
  search_engine: {
    current: 'Google',
    engines: [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
    ],
  },
  card_size: { width: 80, height: 60 },
  card_style: 'info',
  card_icon_size: 60,
  card_show_description: true,
  card_background_color: '#ffffff',
  card_background_opacity: 0.9,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: {
    max_width: 1200,
    max_width_unit: 'px',
    margin_x: 0,
    margin_top: 0,
    margin_bottom: 0,
  },
  navigation: {
    position: 'left',
    always_expanded: false,
  },
  footer_html: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeBackgroundSetting(value: unknown, fallback: Settings['background']): Settings['background'] {
  if (!isRecord(value)) return { ...fallback }

  const type = value.type === 'image' || value.type === 'gradient' || value.type === 'color'
    ? value.type
    : fallback.type
  return {
    type,
    value: typeof value.value === 'string' ? value.value : fallback.value,
    blur: typeof value.blur === 'number' ? value.blur : fallback.blur,
    mask: typeof value.mask === 'number' ? value.mask : fallback.mask,
    maskColor: typeof value.maskColor === 'string' ? value.maskColor : fallback.maskColor,
  }
}

function normalizeThemeBackgroundSettings(value: unknown, fallbackBackground: Settings['background']): Settings['backgrounds'] {
  const fallback = isRecord(value) ? value : {}
  return {
    light: normalizeBackgroundSetting(fallback.light, fallbackBackground),
    dark: normalizeBackgroundSetting(fallback.dark, fallbackBackground),
  }
}

function normalizeBackgroundPresetId(value: unknown): Settings['background_preset_id'] {
  if (value === 'custom') return 'custom'
  return BUILTIN_BACKGROUND_PRESET_IDS.includes(value as typeof BUILTIN_BACKGROUND_PRESET_IDS[number])
    ? value as typeof BUILTIN_BACKGROUND_PRESET_IDS[number]
    : 'custom'
}

function normalizeNavigationSetting(value: unknown): Settings['navigation'] {
  return isValidNavigationSetting(value)
    ? { position: value.position, always_expanded: value.always_expanded }
    : { ...DEFAULT_SETTINGS.navigation }
}

export function isValidNavigationSetting(value: unknown): value is Settings['navigation'] {
  if (!isRecord(value)) return false
  return (
    (value.position === 'left' || value.position === 'top') &&
    typeof value.always_expanded === 'boolean'
  )
}

export function readRawSettingsRows(rows: Array<{ key: string; value: string | null }>): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const row of rows) {
    if (row.value == null) continue
    try {
      map.set(row.key, JSON.parse(row.value))
    } catch {
      map.set(row.key, row.value)
    }
  }
  return map
}

export function settingsFromRawMap(raw: Map<string, unknown>): Settings {
  const out = { ...DEFAULT_SETTINGS } as Settings
  const assignSetting = <K extends keyof Settings>(key: K) => {
    if (raw.has(key)) {
      out[key] = raw.get(key) as Settings[K]
    }
  }
  for (const key of SETTINGS_KEYS) assignSetting(key)
  out.background_preset_id = normalizeBackgroundPresetId(out.background_preset_id)
  out.background = normalizeBackgroundSetting(out.background, DEFAULT_SETTINGS.background)
  out.backgrounds = normalizeThemeBackgroundSettings(raw.get('backgrounds'), out.background)
  out.navigation = normalizeNavigationSetting(raw.get('navigation'))
  return out
}

export function settingsFromRows(
  rows: Array<{ key: string; value: string | null }>,
  base: Partial<Settings> = {},
): Settings {
  const raw = readRawSettingsRows(rows)
  for (const key of SETTINGS_KEYS) {
    if (base[key] !== undefined) {
      raw.set(key, base[key])
    }
  }
  return settingsFromRawMap(raw)
}

export function settingsFromPatchDefaults(patch: Partial<Settings>): Settings {
  const raw = new Map<string, unknown>()
  for (const key of SETTINGS_KEYS) {
    if (patch[key] !== undefined) {
      raw.set(key, patch[key])
    }
  }
  return settingsFromRawMap(raw)
}
