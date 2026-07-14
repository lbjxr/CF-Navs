import { describe, expect, it } from 'vitest'
import { gradientPresets } from '../../src/lib/themePresets'
import {
  cloneSettingsForm,
  createSettingsFormState,
  defaultLightBackground,
  emptySettingsForm,
  getActiveGradientPresetId,
  normalizeBackgroundPresetId,
  normalizeBackgroundValueForType,
  normalizeSettingsForm,
} from '../../src/lib/settingsForm'

describe('settings form model', () => {
  it('keeps every built-in background preset available through the shared preset contract', () => {
    expect(gradientPresets).toHaveLength(13)
    expect(gradientPresets.map((preset) => preset.id)).toEqual([
      'clear-teal', 'mist-slate', 'coral-sky', 'sage-graphite', 'lumen-amber', 'ember-night',
      'violet-dawn', 'ocean-depths', 'aurora-borealis', 'citrus-sunset', 'rose-orbit',
      'indigo-noir', 'terracotta-dune',
    ])
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
      background_preset_id: 'custom',
      backgrounds: {
        light: { ...preset.light },
        dark: { ...preset.dark },
      },
    })

    expect(form.background_preset_id).toBe(preset.id)
    expect(getActiveGradientPresetId(form)).toBe(preset.id)
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
})
