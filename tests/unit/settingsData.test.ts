import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  isValidNavigationSetting,
  readRawSettingsRows,
  settingsFromPatchDefaults,
  settingsFromRows,
} from '../../worker/lib/settingsData'

describe('worker settings data helpers', () => {
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
