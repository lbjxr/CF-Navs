import { describe, expect, it } from 'vitest'
import { createDataVersion, buildSettingsPatchParams } from '../../../worker/lib/db/settingsHelpers'
import type { Settings } from '../../../shared/types'

describe('createDataVersion', () => {
  it('generates a version string with timestamp and random segments', () => {
    const version = createDataVersion()

    // Format: base36-timestamp - base36-random1 - base36-random2 (concatenated)
    const parts = version.split('-')
    expect(parts).toHaveLength(2)

    // First part is base36 timestamp (should parse as number)
    const timestampPart = parts[0]
    expect(timestampPart).toMatch(/^[0-9a-z]+$/)
    expect(Number.isNaN(Number.parseInt(timestampPart, 36))).toBe(false)

    // Second part is two concatenated base36 random values
    const randomPart = parts[1]
    expect(randomPart).toMatch(/^[0-9a-z]+$/)
    expect(randomPart.length).toBeGreaterThanOrEqual(2)
  })

  it('produces non-empty and unique versions across calls', () => {
    const v1 = createDataVersion()
    const v2 = createDataVersion()

    expect(v1.length).toBeGreaterThan(0)
    expect(v2.length).toBeGreaterThan(0)
    // Versions should differ (timestamp or random)
    expect(v1).not.toBe(v2)
  })

  it('returns a string that does not contain forbidden characters', () => {
    const version = createDataVersion()
    // Should only contain base36-safe characters and hyphen
    expect(version).toMatch(/^[0-9a-z-]+$/)
    expect(version).not.toContain(' ')
    expect(version).not.toContain('\n')
  })
})

describe('buildSettingsPatchParams', () => {
  it('returns null for an empty patch', () => {
    const result = buildSettingsPatchParams({})
    expect(result).toBeNull()
  })

  it('returns null when patch keys have undefined values', () => {
    const result = buildSettingsPatchParams({ site_title: undefined })
    expect(result).toBeNull()
  })

  it('generates placeholders and params for a single setting key', () => {
    const result = buildSettingsPatchParams({ site_title: 'CF-Navs' })

    expect(result).not.toBeNull()
    expect(result!.placeholders).toBe('(?, ?)')
    expect(result!.params).toEqual(['site_title', '"CF-Navs"'])
  })

  it('generates placeholders and params for multiple setting keys', () => {
    const result = buildSettingsPatchParams({
      site_title: 'Test Site',
      theme: 'dark' as Settings['theme'],
      public_mode: false,
    })

    expect(result).not.toBeNull()
    expect(result!.params).toHaveLength(6) // 3 keys * 2 (key + value)
    // SETTINGS_KEYS order: site_title, site_title_color, site_title_font_size, public_mode, theme, ...
    expect(result!.params[0]).toBe('site_title')
    expect(result!.params[1]).toBe('"Test Site"')
    expect(result!.params[2]).toBe('public_mode')
    expect(result!.params[3]).toBe('false')
    expect(result!.params[4]).toBe('theme')
    expect(result!.params[5]).toBe('"dark"')
    expect(result!.placeholders).toBe('(?, ?), (?, ?), (?, ?)')
  })

  it('skips keys that are not in the patch object', () => {
    const result = buildSettingsPatchParams({ site_title: 'Hi' })

    expect(result).not.toBeNull()
    // Should only include site_title, not other SETTINGS_KEYS
    expect(result!.params).toEqual(['site_title', '"Hi"'])
    expect(result!.placeholders).toBe('(?, ?)')
  })

  it('JSON-stringifies values', () => {
    const result = buildSettingsPatchParams({
      search_engine: { current: 'Google', engines: [] },
    } as Partial<Settings>)

    expect(result).not.toBeNull()
    // The value should be JSON.stringify'd
    const valueParam = result!.params[1] as string
    expect(valueParam).toBe(JSON.stringify({ current: 'Google', engines: [] }))
  })
})
