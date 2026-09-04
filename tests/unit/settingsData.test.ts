import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gradientPresets } from '../../src/lib/themePresets'
import {
  DEFAULT_SETTINGS,
  isValidNavigationSetting,
  readRawSettingsRows,
  settingsFromPatchDefaults,
  settingsFromRows,
} from '../../worker/lib/settingsData'

const schemaSql = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')

function readSchemaSetting(key: string): unknown {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = schemaSql.match(new RegExp(`\\('${escapedKey}',\\s*'((?:''|[^'])*)'\\)`))
  if (!match) throw new Error(`Missing schema setting: ${key}`)
  return JSON.parse(match[1].replace(/''/g, "'"))
}

describe('worker settings data helpers', () => {
  it('keeps worker defaults aligned with schema seed settings', () => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(readSchemaSetting(key)).toEqual(value)
    }
  })

  it('uses the light ocean-depths preset for newly initialized sites', () => {
    const preset = gradientPresets.find((item) => item.id === 'ocean-depths')

    expect(preset).toBeDefined()
    expect(DEFAULT_SETTINGS.theme).toBe('light')
    expect(DEFAULT_SETTINGS.background_preset_id).toBe('ocean-depths')
    expect(DEFAULT_SETTINGS.background).toEqual(preset?.light)
    expect(DEFAULT_SETTINGS.backgrounds).toEqual({
      light: preset?.light,
      dark: preset?.dark,
    })
    expect(DEFAULT_SETTINGS.card_background_color).toBe(preset?.cardBackgroundColor)
    expect(DEFAULT_SETTINGS.card_background_opacity).toBe(preset?.cardBackgroundOpacity)
    expect(DEFAULT_SETTINGS.card_text_color).toBe(preset?.cardTextColor)
    expect(DEFAULT_SETTINGS.site_title_color).toBe(preset?.siteTitleColor)
  })

  it('normalizes patch defaults and rejects invalid background preset ids', () => {
    const settings = settingsFromPatchDefaults({
      site_title: 'Custom title',
      background_preset_id: 'unknown-preset' as never,
    })

    expect(settings.site_title).toBe('Custom title')
    expect(settings.background_preset_id).toBe('custom')
    expect(settings.search_engine.current).toBe(DEFAULT_SETTINGS.search_engine.current)
  })

  it('parses raw rows with base overrides and malformed JSON fallback', () => {
    const raw = readRawSettingsRows([
      { key: 'site_title', value: '"Stored title"' },
      { key: 'custom_css', value: 'body { color: red; }' },
      { key: 'public_mode', value: null },
    ])

    expect(raw.get('site_title')).toBe('Stored title')
    expect(raw.get('custom_css')).toBe('body { color: red; }')
    expect(raw.has('public_mode')).toBe(false)

    const settings = settingsFromRows(
      [{ key: 'site_title', value: '"Stored title"' }],
      { site_title: 'Override title' },
    )
    expect(settings.site_title).toBe('Override title')
  })

  it('normalizes partial background settings without breaking theme backgrounds', () => {
    const settings = settingsFromRows([
      {
        key: 'background',
        value: JSON.stringify({ type: 'invalid', value: 123, blur: 'bad', mask: 0.4 }),
      },
      {
        key: 'backgrounds',
        value: JSON.stringify({
          light: { type: 'gradient', value: 'linear-gradient(red, blue)', blur: 2, mask: 0.2, maskColor: '#fff' },
          dark: { type: 'invalid' },
        }),
      },
    ])

    expect(settings.background).toEqual({
      ...DEFAULT_SETTINGS.background,
      mask: 0.4,
    })
    expect(settings.backgrounds.light).toEqual({
      type: 'gradient',
      value: 'linear-gradient(red, blue)',
      blur: 2,
      mask: 0.2,
      maskColor: '#fff',
    })
    expect(settings.backgrounds.dark).toEqual(settings.background)
  })

  it('falls back from missing or invalid navigation settings', () => {
    expect(settingsFromRows([]).navigation).toEqual({ position: 'left', always_expanded: false, top_layout: 'scroll' })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'bottom', always_expanded: 'yes' }) },
    ]).navigation).toEqual({ position: 'left', always_expanded: false, top_layout: 'scroll' })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top' }) },
    ]).navigation).toEqual({ position: 'left', always_expanded: false, top_layout: 'scroll' })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top', always_expanded: true }) },
    ]).navigation).toEqual({ position: 'top', always_expanded: true, top_layout: 'scroll' })
  })

  it('preserves and normalizes navigation top_layout', () => {
    // 旧数据无 top_layout：安全降级 'scroll'，保留 position/always_expanded
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top', always_expanded: true }) },
    ]).navigation).toEqual({ position: 'top', always_expanded: true, top_layout: 'scroll' })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top', always_expanded: true, top_layout: 'wrap' }) },
    ]).navigation).toEqual({ position: 'top', always_expanded: true, top_layout: 'wrap' })
    // 非法 top_layout 回退 'scroll'，其余字段不丢
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top', always_expanded: false, top_layout: 'grid' }) },
    ]).navigation).toEqual({ position: 'top', always_expanded: false, top_layout: 'scroll' })
  })

  it('normalizes category display and card size boundaries from persisted settings', () => {
    expect(settingsFromRows([]).category_display).toEqual({
      root_font_size: 16,
      root_icon_size: 20,
      child_font_size: 14,
      child_icon_size: 18,
    })
    expect(settingsFromRows([
      {
        key: 'category_display',
        value: JSON.stringify({ root_font_size: 40, root_icon_size: 8, child_font_size: 'bad', child_icon_size: 40 }),
      },
      { key: 'card_size', value: JSON.stringify({ width: 20, height: 500 }) },
      { key: 'card_icon_size', value: JSON.stringify(20) },
    ])).toMatchObject({
      category_display: { root_font_size: 28, root_icon_size: 14, child_font_size: 14, child_icon_size: 32 },
      card_size: { width: 44, height: 300 },
      card_icon_size: 40,
    })
  })

  it('validates navigation payloads without mutating them', () => {
    expect(isValidNavigationSetting({ position: 'left', always_expanded: false })).toBe(true)
    expect(isValidNavigationSetting({ position: 'top', always_expanded: true })).toBe(true)
    expect(isValidNavigationSetting({ position: 'bottom', always_expanded: false })).toBe(false)
    expect(isValidNavigationSetting({ position: 'left' })).toBe(false)

    // 谓词对 top_layout 不作断言，也不得就地补写：归一化只体现在 normalizeNavigationSetting 的返回值上
    const legacy: Record<string, unknown> = { position: 'top', always_expanded: true }
    const illegal: Record<string, unknown> = { position: 'top', always_expanded: true, top_layout: 'grid' }

    expect(isValidNavigationSetting(legacy)).toBe(true)
    expect(isValidNavigationSetting(illegal)).toBe(true)
    expect(legacy).toEqual({ position: 'top', always_expanded: true })
    expect(illegal).toEqual({ position: 'top', always_expanded: true, top_layout: 'grid' })
  })
})
