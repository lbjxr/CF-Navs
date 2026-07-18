import { describe, expect, it } from 'vitest'
import { gradientPresets } from '../../src/lib/themePresets'
import {
  applyBackgroundPreset,
  applyCustomThemeBackground,
  cloneSettingsForm,
  createSettingsFormState,
  defaultLightBackground,
  emptySettingsForm,
  getActiveGradientPresetId,
  markBackgroundPresetCustom,
  normalizeBackgroundPresetId,
  normalizeBackgroundValueForType,
  normalizeSettingsForm,
  shouldAutoExpandAppearanceAdvanced,
} from '../../src/lib/settingsForm'

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number]
}

function mixColor(foreground: string, background: string, alpha: number): [number, number, number] {
  const foregroundRgb = hexToRgb(foreground)
  const backgroundRgb = hexToRgb(background)
  return foregroundRgb.map((channel, index) => (
    Math.round(channel * alpha + backgroundRgb[index] * (1 - alpha))
  )) as [number, number, number]
}

function relativeLuminance(color: [number, number, number]): number {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrastRatio(foreground: string, background: [number, number, number]): number {
  const foregroundLuminance = relativeLuminance(hexToRgb(foreground))
  const backgroundLuminance = relativeLuminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

describe('settings form model', () => {
  it('keeps every built-in background preset available through the shared preset contract', () => {
    expect(gradientPresets).toHaveLength(22)
    expect(gradientPresets.map((preset) => preset.id)).toEqual([
      'paper-sage', 'paper-clay', 'paper-wheat', 'paper-slate', 'paper-pine', 'paper-sakura', 'paper-lavender', 'paper-indigo', 'paper-amber',
      'clear-teal', 'mist-slate', 'coral-sky', 'sage-graphite', 'lumen-amber', 'ember-night',
      'violet-dawn', 'ocean-depths', 'aurora-borealis', 'citrus-sunset', 'rose-orbit',
      'indigo-noir', 'terracotta-dune',
    ])
    expect(gradientPresets.find((preset) => preset.id === 'paper-sage')?.surface).toBe('flat')
    expect(gradientPresets.filter((preset) => preset.surface === 'glass')).toHaveLength(13)
    expect(
      gradientPresets
        .filter((preset) => preset.surface === 'flat')
        .map((preset) => preset.light.value),
    ).toEqual([
      '#e8f0e3', '#f1e2de', '#f2e8d6', '#e0ebf0', '#e3ecdf',
      '#f3e1e7', '#e9e5f3', '#dbeaff', '#f4e6c8',
    ])
    expect(
      gradientPresets
        .filter((preset) => preset.surface === 'flat')
        .map((preset) => preset.accentColor),
    ).toEqual([
      '#71836f', '#b08f89', '#a98c65', '#718a98', '#5c6857',
      '#c88797', '#857bb8', '#5f769b', '#bd8b42',
    ])
    expect(
      gradientPresets
        .filter((preset) => preset.surface === 'flat')
        .map((preset) => preset.cardBackgroundColor),
    ).toEqual([
      '#f3f7f0', '#f8efec', '#faf3e6', '#eff5f7', '#f0f5ed',
      '#faedf1', '#f4f1f8', '#edf4ff', '#fbf3e2',
    ])
    expect(
      gradientPresets
        .filter((preset) => preset.surface === 'flat')
        .every((preset) => preset.cardBackgroundOpacity === 0.9),
    ).toBe(true)
  })

  it('keeps eye-care title and description colors readable across card opacity extremes', () => {
    const flatPresets = gradientPresets.filter((preset) => preset.surface === 'flat')

    for (const preset of flatPresets) {
      const lightPage = hexToRgb(preset.light.value)
      const lightCard = mixColor(preset.cardBackgroundColor, preset.light.value, preset.cardBackgroundOpacity)
      const darkPage = hexToRgb(preset.dark.value)
      const darkCard = mixColor(preset.darkCardBackgroundColor, preset.dark.value, preset.cardBackgroundOpacity)

      expect(contrastRatio(preset.lightCardTitleColor, lightPage)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(preset.lightCardTitleColor, lightCard)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(preset.lightCardDescriptionColor, lightPage)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(preset.lightCardDescriptionColor, lightCard)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(preset.darkCardTitleColor, darkPage)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(preset.darkCardTitleColor, darkCard)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(preset.darkCardDescriptionColor, darkPage)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(preset.darkCardDescriptionColor, darkCard)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('creates a complete editable form from partial settings', () => {
    const form = createSettingsFormState({
      site_title: 'My Nav',
      background: { type: 'color', value: '#ffffff', blur: 4, mask: 0.2, maskColor: '#ffffff' },
      search_engine: {
        current: 'Kagi',
        engines: [{ name: 'Kagi', icon: '', url_template: 'https://kagi.com/search?q={q}' }],
      },
    })

    expect(form.site_title).toBe('My Nav')
    expect(form.backgrounds.light.value).toBe('#ffffff')
    expect(form.backgrounds.dark.value).toBe('#ffffff')
    expect(form.search_engine.current).toBe('Kagi')
    expect(form.card_size).toEqual({ width: 80, height: 60 })
    expect(form.navigation).toEqual({ position: 'left', always_expanded: false })
  })

  it('normalizes and clamps settings before save', () => {
    const form = createSettingsFormState({
      site_title: '  CF-Navs  ',
      site_title_font_size: 200,
      theme: 'dark',
      custom_css: '  body{}  ',
      image_host_url: '  https://img.example.com  ',
      search_engine: {
        current: 'Missing',
        engines: [{ name: '  Google  ', icon: '  icon  ', url_template: '  https://google.com/search?q={q}  ' }],
      },
      card_size: { width: 20, height: 500 },
      card_icon_size: 500,
      card_background_color: 'rgba(18, 52, 86, 0.4)',
      card_background_opacity: 1,
      content_layout: { max_width: 10, max_width_unit: '%', margin_x: -1, margin_top: 90, margin_bottom: 90 },
      navigation: { position: 'invalid' as never, always_expanded: true },
      footer_html: '  <p>Footer</p>  ',
    })

    const normalized = normalizeSettingsForm(form)

    expect(normalized.site_title).toBe('CF-Navs')
    expect(normalized.site_title_font_size).toBe(72)
    expect(normalized.custom_css).toBe('body{}')
    expect(normalized.image_host_url).toBe('https://img.example.com')
    expect(normalized.search_engine.current).toBe('Google')
    expect(normalized.search_engine.engines[0]).toEqual({
      name: 'Google',
      icon: 'icon',
      url_template: 'https://google.com/search?q={q}',
    })
    expect(normalized.card_size).toEqual({ width: 80, height: 300 })
    expect(normalized.card_icon_size).toBe(100)
    expect(normalized.card_background_color).toBe('#123456')
    expect(normalized.card_background_opacity).toBe(0.4)
    expect(normalized.content_layout.max_width).toBe(40)
    expect(normalized.content_layout.margin_x).toBe(0)
    expect(normalized.content_layout.margin_top).toBe(50)
    expect(normalized.navigation).toEqual({ position: 'left', always_expanded: true })
    expect(normalized.footer_html).toBe('<p>Footer</p>')
  })

  it('detects gradient presets from background values', () => {
    const preset = gradientPresets[0]
    const form = createSettingsFormState({
      backgrounds: {
        light: { ...preset.light },
        dark: { ...preset.dark },
      },
    })

    expect(form.background_preset_id).toBe(preset.id)
    expect(getActiveGradientPresetId(form)).toBe(preset.id)
  })

  it('keeps an explicitly saved custom preset custom even when values match a built-in scheme', () => {
    const preset = gradientPresets[0]
    const form = createSettingsFormState({
      background_preset_id: 'custom',
      backgrounds: {
        light: { ...preset.light },
        dark: { ...preset.dark },
      },
    })

    expect(form.background_preset_id).toBe('custom')
    expect(getActiveGradientPresetId(form)).toBe('custom')
    expect(shouldAutoExpandAppearanceAdvanced(form)).toBe(true)
  })

  it('normalizes background values when switching type', () => {
    expect(normalizeBackgroundValueForType('not-a-color', 'color', {
      color: defaultLightBackground.value,
      gradientStart: '#000000',
      gradientEnd: '#ffffff',
    })).toBe(defaultLightBackground.value)

    expect(normalizeBackgroundValueForType('#111111', 'gradient', {
      color: defaultLightBackground.value,
      gradientStart: '#000000',
      gradientEnd: '#ffffff',
    })).toBe('linear-gradient(135deg, #111111, #ffffff)')

    expect(normalizeBackgroundValueForType('ftp://example.com/bg.png', 'image', {
      color: defaultLightBackground.value,
      gradientStart: '#000000',
      gradientEnd: '#ffffff',
    })).toBe('')
  })

  it('keeps cloned forms isolated from source mutation', () => {
    const cloned = cloneSettingsForm(emptySettingsForm)
    cloned.search_engine.engines[0].name = 'Changed'
    cloned.backgrounds.light.value = '#000000'
    cloned.navigation.position = 'top'

    expect(emptySettingsForm.search_engine.engines[0].name).toBe('Google')
    expect(emptySettingsForm.backgrounds.light.value).toBe(defaultLightBackground.value)
    expect(emptySettingsForm.navigation.position).toBe('left')
  })

  it('falls back to custom for unknown preset ids', () => {
    expect(normalizeBackgroundPresetId('unknown')).toBe('custom')
  })

  it('applies built-in presets and keeps their advanced panel collapsed by default', () => {
    const source = createSettingsFormState(null)
    const preset = gradientPresets[3]
    const next = applyBackgroundPreset(source, preset)

    expect(next.background_preset_id).toBe(preset.id)
    expect(next.backgrounds.light).toEqual(preset.light)
    expect(next.backgrounds.dark).toEqual(preset.dark)
    expect(next.card_background_color).toBe(preset.cardBackgroundColor)
    expect(next.card_background_opacity).toBe(preset.cardBackgroundOpacity)
    expect(shouldAutoExpandAppearanceAdvanced(next)).toBe(false)
  })

  it('marks background edits as custom and expands custom appearance settings', () => {
    const preset = gradientPresets[0]
    const source = applyBackgroundPreset(createSettingsFormState(null), preset)
    const editedBackground = { ...source.backgrounds.light, blur: 12, mask: 0.45 }
    const next = applyCustomThemeBackground(source, 'light', editedBackground)

    expect(next.background_preset_id).toBe('custom')
    expect(next.backgrounds.light).toEqual(editedBackground)
    expect(next.backgrounds.dark).toEqual(source.backgrounds.dark)
    expect(shouldAutoExpandAppearanceAdvanced(next)).toBe(true)
    expect(getActiveGradientPresetId(next)).toBe('custom')
    expect(createSettingsFormState(next).background_preset_id).toBe('custom')
    expect(markBackgroundPresetCustom(source).background_preset_id).toBe('custom')
  })

  it('keeps the selected preset when changing independent title and card dimensions', () => {
    const preset = gradientPresets[1]
    const next = applyBackgroundPreset(createSettingsFormState(null), preset)
    next.site_title_font_size = 46
    next.card_size = { width: 160, height: 90 }
    next.card_icon_size = 75

    expect(normalizeSettingsForm(next).background_preset_id).toBe(preset.id)
  })
})
