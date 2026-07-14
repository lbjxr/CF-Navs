import type { BackgroundPresetId, BackgroundSetting, SearchEngine, SearchEngineSetting, ThemeMode } from '../../shared/types'
import type { SettingsFormValue } from './appData'
import { parseCssColor, splitCssColorAlpha } from './color'
import { gradientPresets, type GradientPresetId } from './themePresets'

export type SettingsFormModel = SettingsFormValue

export const themeOptions: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'auto', label: '跟随系统', hint: '根据设备当前主题自动切换。' },
  { value: 'light', label: '浅色', hint: '始终使用浅色主题。' },
  { value: 'dark', label: '深色', hint: '始终使用深色主题。' },
]

export const backgroundTypeOptions: Array<{ value: BackgroundSetting['type']; label: string; hint: string }> = [
  { value: 'color', label: '纯色', hint: '支持 #hex、rgb()、rgba()，也可用颜色拾取器。' },
  { value: 'gradient', label: '渐变', hint: '支持完整 CSS 渐变，也可用下方两端颜色生成。' },
  { value: 'image', label: '图片', hint: '填写图片外链 URL；配置图床后可快速上传。' },
]

export const defaultLightBackground: BackgroundSetting = {
  type: 'color',
  value: '#f8fafc',
  blur: 0,
  mask: 0.18,
  maskColor: '#ffffff',
}

export const defaultDarkBackground: BackgroundSetting = {
  type: 'color',
  value: '#0f172a',
  blur: 0,
  mask: 0.3,
  maskColor: '#000000',
}

export const defaultLightGradient = { start: '#e0f2fe', end: '#f8fafc' }
export const defaultDarkGradient = { start: '#1e3a8a', end: '#0f172a' }

export const defaultSearchEngine: SearchEngineSetting = {
  current: 'Google',
  engines: [
    { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
    { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
  ],
}

export const emptySettingsForm: SettingsFormModel = {
  site_title: '',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
  custom_css: '',
  custom_js: '',
  image_host_url: '',
  background: { ...defaultDarkBackground },
  backgrounds: {
    light: { ...defaultLightBackground },
    dark: { ...defaultDarkBackground },
  },
  search_engine: {
    current: defaultSearchEngine.current,
    engines: defaultSearchEngine.engines.map((engine) => ({ ...engine })),
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
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'left', always_expanded: false },
  footer_html: '',
}

export function cloneSettingsForm(source: SettingsFormModel): SettingsFormModel {
  return {
    site_title: source.site_title,
    site_title_color: source.site_title_color,
    site_title_font_size: source.site_title_font_size,
    public_mode: source.public_mode,
    theme: source.theme,
    background_preset_id: source.background_preset_id,
    custom_css: source.custom_css,
    custom_js: source.custom_js,
    image_host_url: source.image_host_url,
    background: { ...source.background },
    backgrounds: {
      light: { ...source.backgrounds.light },
      dark: { ...source.backgrounds.dark },
    },
    search_engine: {
      current: source.search_engine.current,
      engines: source.search_engine.engines.map((engine) => ({ ...engine })),
    },
    card_size: { ...source.card_size },
    card_style: source.card_style,
    card_icon_size: source.card_icon_size,
    card_show_description: source.card_show_description,
    card_background_color: source.card_background_color,
    card_background_opacity: source.card_background_opacity,
    card_icon_show_title: source.card_icon_show_title,
    card_text_color: source.card_text_color,
    search_box_show: source.search_box_show,
    search_engine_selector_show: source.search_engine_selector_show,
    content_layout: { ...source.content_layout },
    navigation: { ...source.navigation },
    footer_html: source.footer_html,
  }
}

export function normalizeBackgroundPresetId(input: unknown): BackgroundPresetId {
  return input === 'custom' || gradientPresets.some((preset) => preset.id === input)
    ? input as BackgroundPresetId
    : 'custom'
}

function resolveBackgroundPresetId(
  source: Partial<SettingsFormModel> | null | undefined,
  lightBackground: BackgroundSetting | undefined,
  darkBackground: BackgroundSetting | undefined,
): BackgroundPresetId {
  const presetId = normalizeBackgroundPresetId(source?.background_preset_id)
  if (presetId !== 'custom') {
    return presetId
  }

  if (lightBackground && darkBackground) {
    const normalizedLight = normalizeBackground(lightBackground, defaultLightBackground)
    const normalizedDark = normalizeBackground(darkBackground, defaultDarkBackground)
    const matched = gradientPresets.find((preset) => (
      backgroundPresetValueEquals(normalizedLight, preset.light) &&
      backgroundPresetValueEquals(normalizedDark, preset.dark)
    ))
    if (matched) return matched.id
  }

  return 'custom'
}

export function createSettingsFormState(
  source: Partial<SettingsFormModel> | null | undefined,
): SettingsFormModel {
  const background = source?.background
  const lightBackground = source?.backgrounds?.light ?? background
  const darkBackground = source?.backgrounds?.dark ?? background
  const searchEngine = source?.search_engine
  const cardSize = source?.card_size
  const contentLayout = source?.content_layout
  const navigation = source?.navigation
  return {
    site_title: source?.site_title ?? '',
    site_title_color: source?.site_title_color ?? '#ffffff',
    site_title_font_size: typeof source?.site_title_font_size === 'number' ? source.site_title_font_size : 32,
    public_mode: source?.public_mode ?? true,
    theme: source?.theme ?? 'auto',
    background_preset_id: resolveBackgroundPresetId(source, lightBackground, darkBackground),
    custom_css: source?.custom_css ?? '',
    custom_js: source?.custom_js ?? '',
    image_host_url: source?.image_host_url ?? '',
    background: {
      type: background?.type ?? defaultDarkBackground.type,
      value: background?.value ?? defaultDarkBackground.value,
      blur: typeof background?.blur === 'number' ? background.blur : defaultDarkBackground.blur,
      mask: typeof background?.mask === 'number' ? background.mask : defaultDarkBackground.mask,
      maskColor: background?.maskColor ?? defaultDarkBackground.maskColor,
    },
    backgrounds: {
      light: {
        type: lightBackground?.type ?? defaultLightBackground.type,
        value: lightBackground?.value ?? defaultLightBackground.value,
        blur: typeof lightBackground?.blur === 'number' ? lightBackground.blur : defaultLightBackground.blur,
        mask: typeof lightBackground?.mask === 'number' ? lightBackground.mask : defaultLightBackground.mask,
        maskColor: lightBackground?.maskColor ?? defaultLightBackground.maskColor,
      },
      dark: {
        type: darkBackground?.type ?? defaultDarkBackground.type,
        value: darkBackground?.value ?? defaultDarkBackground.value,
        blur: typeof darkBackground?.blur === 'number' ? darkBackground.blur : defaultDarkBackground.blur,
        mask: typeof darkBackground?.mask === 'number' ? darkBackground.mask : defaultDarkBackground.mask,
        maskColor: darkBackground?.maskColor ?? defaultDarkBackground.maskColor,
      },
    },
    search_engine: {
      current: searchEngine?.current ?? defaultSearchEngine.current,
      engines:
        searchEngine?.engines && searchEngine.engines.length > 0
          ? searchEngine.engines.map((engine) => ({
              name: engine.name ?? '',
              icon: engine.icon ?? '',
              url_template: engine.url_template ?? '',
            }))
          : defaultSearchEngine.engines.map((engine) => ({ ...engine })),
    },
    card_size: {
      width: typeof cardSize?.width === 'number' ? cardSize.width : 80,
      height: typeof cardSize?.height === 'number' ? cardSize.height : 60,
    },
    card_style: source?.card_style ?? 'info',
    card_icon_size: typeof source?.card_icon_size === 'number' ? source.card_icon_size : 60,
    card_show_description: source?.card_show_description ?? true,
    card_background_color: source?.card_background_color ?? '#ffffff',
    card_background_opacity: typeof source?.card_background_opacity === 'number' ? source.card_background_opacity : 0.9,
    card_icon_show_title: source?.card_icon_show_title ?? true,
    card_text_color: source?.card_text_color ?? '',
    search_box_show: source?.search_box_show ?? true,
    search_engine_selector_show: source?.search_engine_selector_show ?? true,
    content_layout: {
      max_width: typeof contentLayout?.max_width === 'number' ? contentLayout.max_width : 1200,
      max_width_unit: contentLayout?.max_width_unit === '%' ? '%' : 'px',
      margin_x: typeof contentLayout?.margin_x === 'number' ? contentLayout.margin_x : 0,
      margin_top: typeof contentLayout?.margin_top === 'number' ? contentLayout.margin_top : 0,
      margin_bottom: typeof contentLayout?.margin_bottom === 'number' ? contentLayout.margin_bottom : 0,
    },
    navigation: {
      position: navigation?.position === 'top' ? 'top' : 'left',
      always_expanded: navigation?.always_expanded ?? false,
    },
    footer_html: source?.footer_html ?? '',
  }
}

function normalizeEngines(engines: SearchEngine[]): SearchEngine[] {
  return engines.map((engine) => ({
    name: engine.name.trim(),
    icon: engine.icon.trim(),
    url_template: engine.url_template.trim(),
  }))
}

function normalizeBackground(source: BackgroundSetting, fallback: BackgroundSetting): BackgroundSetting {
  const maskColor = splitCssColorAlpha(source.maskColor, fallback.maskColor, source.mask)
  return {
    type: source.type,
    value: source.value.trim(),
    blur: clampNumber(source.blur, 0, 40),
    mask: clampNumber(maskColor.alpha, 0, 1),
    maskColor: maskColor.color,
  }
}

export function normalizeSettingsForm(source: SettingsFormModel): SettingsFormModel {
  const engines = normalizeEngines(source.search_engine.engines)
  const current = engines.some((engine) => engine.name === source.search_engine.current)
    ? source.search_engine.current
    : engines[0]?.name ?? ''
  const cardBackgroundColor = splitCssColorAlpha(
    source.card_background_color,
    '#ffffff',
    source.card_background_opacity,
  )
  const lightBackground = normalizeBackground(source.backgrounds.light, defaultLightBackground)
  const darkBackground = normalizeBackground(source.backgrounds.dark, defaultDarkBackground)
  return {
    site_title: source.site_title.trim(),
    site_title_color: source.site_title_color?.trim() ?? '',
    site_title_font_size: clampNumber(source.site_title_font_size, 16, 72),
    public_mode: source.public_mode,
    theme: source.theme,
    background_preset_id: source.background_preset_id,
    custom_css: source.custom_css?.trim() ?? '',
    custom_js: source.custom_js?.trim() ?? '',
    image_host_url: source.image_host_url.trim(),
    background: source.theme === 'dark' ? darkBackground : lightBackground,
    backgrounds: {
      light: lightBackground,
      dark: darkBackground,
    },
    search_engine: { current, engines },
    card_size: {
      width: clampNumber(source.card_size.width, 80, 400),
      height: clampNumber(source.card_size.height, 0, 300),
    },
    card_style: source.card_style === 'icon' ? 'icon' : 'info',
    card_icon_size: clampNumber(source.card_icon_size, 40, 100),
    card_show_description: source.card_show_description,
    card_background_color: cardBackgroundColor.color,
    card_background_opacity: clampNumber(cardBackgroundColor.alpha, 0, 1),
    card_icon_show_title: source.card_icon_show_title,
    card_text_color: source.card_text_color?.trim() ?? '',
    search_box_show: source.search_box_show,
    search_engine_selector_show: source.search_engine_selector_show,
    content_layout: {
      max_width: clampNumber(
        source.content_layout.max_width,
        source.content_layout.max_width_unit === '%' ? 40 : 640,
        source.content_layout.max_width_unit === '%' ? 100 : 2400,
      ),
      max_width_unit: source.content_layout.max_width_unit === '%' ? '%' : 'px',
      margin_x: clampNumber(source.content_layout.margin_x, 0, 100),
      margin_top: clampNumber(source.content_layout.margin_top, 0, 50),
      margin_bottom: clampNumber(source.content_layout.margin_bottom, 0, 50),
    },
    navigation: {
      position: source.navigation.position === 'top' ? 'top' : 'left',
      always_expanded: Boolean(source.navigation.always_expanded),
    },
    footer_html: source.footer_html.trim(),
  }
}

export function clampNumber(input: number, min: number, max: number): number {
  if (!Number.isFinite(input)) return min
  return Math.min(max, Math.max(min, input))
}

function gradientValue(start: string, end: string): string {
  return `linear-gradient(135deg, ${start}, ${end})`
}

function isGradientValue(input: string): boolean {
  return /gradient\s*\(/i.test(input)
}

export function normalizeBackgroundValueForType(
  currentValue: string,
  nextType: BackgroundSetting['type'],
  defaults: { color: string; gradientStart: string; gradientEnd: string },
): string {
  const trimmed = currentValue.trim()

  if (nextType === 'color') {
    return parseCssColor(trimmed) ? trimmed : defaults.color
  }

  if (nextType === 'gradient') {
    return isGradientValue(trimmed)
      ? trimmed
      : gradientValue(parseCssColor(trimmed) ? trimmed : defaults.gradientStart, defaults.gradientEnd)
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : ''
}

export function cloneBackgroundSetting(source: BackgroundSetting): BackgroundSetting {
  return { ...source }
}

function comparableText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function backgroundPresetValueEquals(current: BackgroundSetting, target: BackgroundSetting): boolean {
  return current.type === target.type && comparableText(current.value) === comparableText(target.value)
}

function findGradientPresetByBackgroundValues(source: SettingsFormModel) {
  return gradientPresets.find((item) => (
    backgroundPresetValueEquals(source.backgrounds.light, item.light) &&
    backgroundPresetValueEquals(source.backgrounds.dark, item.dark)
  ))
}

export function getActiveGradientPresetId(source: SettingsFormModel): GradientPresetId | 'custom' {
  const presetId = normalizeBackgroundPresetId(source.background_preset_id)
  if (presetId !== 'custom' && gradientPresets.some((item) => item.id === presetId)) {
    return presetId
  }
  return findGradientPresetByBackgroundValues(source)?.id ?? 'custom'
}
