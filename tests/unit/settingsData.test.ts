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
    expect(settingsFromRows([]).navigation).toEqual({ position: 'left', always_expanded: false })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'bottom', always_expanded: 'yes' }) },
    ]).navigation).toEqual({ position: 'left', always_expanded: false })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top' }) },
    ]).navigation).toEqual({ position: 'left', always_expanded: false })
    expect(settingsFromRows([
      { key: 'navigation', value: JSON.stringify({ position: 'top', always_expanded: true }) },
    ]).navigation).toEqual({ position: 'top', always_expanded: true })
  })

  it('validates complete navigation payloads for settings updates', () => {
    expect(isValidNavigationSetting({ position: 'left', always_expanded: false })).toBe(true)
    expect(isValidNavigationSetting({ position: 'top', always_expanded: true })).toBe(true)
    expect(isValidNavigationSetting({ position: 'bottom', always_expanded: false })).toBe(false)
    expect(isValidNavigationSetting({ position: 'left' })).toBe(false)
  })
})
