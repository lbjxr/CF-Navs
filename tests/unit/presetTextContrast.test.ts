import { describe, expect, it } from 'vitest'
import { gradientPresets, type ThemeGradientPreset } from '../../src/lib/themePresets'
import { presetRenderTokens } from '../../src/lib/themePresetRender'
import { resolveThemeAccentColor, resolveThemeAccentTextColor, buildHomeBackground } from '../../src/lib/appData'
import { parseCssColor } from '../../src/lib/color'
import { compositeColors, contrastRatio, type RgbaColor } from '../../src/lib/colorContrast'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'

const color = (value: string): RgbaColor => {
  const parsed = parseCssColor(value)
  if (!parsed) throw new Error(`Invalid fixture color: ${value}`)
  return parsed
}
// Independent reference for the existing paper sidebar: page → sidebar → hovered group → active item.
// Chromium verification samples the actual rendering; this arithmetic alone is not visual acceptance.
function paperActiveSurface(preset: ThemeGradientPreset, mode: 'light' | 'dark'): RgbaColor {
  const page = color(preset[mode].value)
  const card = { ...color(mode === 'light' ? preset.cardBackgroundColor : preset.darkCardBackgroundColor), alpha: preset.cardBackgroundOpacity }
  const accent = color(mode === 'light' ? preset.accentColor : preset.darkAccentColor)
  const sidebar = compositeColors({ ...card, alpha: card.alpha * 0.88 }, page)
  const mix = (weight: number): RgbaColor => {
    const alpha = weight + (1 - weight) * card.alpha
    const channel = (front: number, back: number) => (front * weight + back * (1 - weight) * card.alpha) / alpha
    return { red: channel(accent.red, card.red), green: channel(accent.green, card.green), blue: channel(accent.blue, card.blue), alpha }
  }
  return compositeColors(mix(0.14), compositeColors(mix(0.08), sidebar))
}

describe('preset text colors remain separate from decoration', () => {
  it('keeps render tokens aligned for every preset without replacing its decorative colors', () => {
    expect(gradientPresets).toHaveLength(22)
    for (const preset of gradientPresets) {
      const tokens = presetRenderTokens[preset.id]
      expect(tokens.accentColor).toBe(preset.accentColor)
      expect(tokens.darkAccentColor).toBe(preset.darkAccentColor)
      expect(tokens.accentTextColor).toBe(preset.accentTextColor)
      expect(tokens.darkAccentTextColor).toBe(preset.darkAccentTextColor)
      if (preset.surface === 'glass') {
        expect(tokens.accentTextColor).toBe(tokens.accentColor)
        expect(tokens.darkAccentTextColor).toBe(tokens.darkAccentColor)
      }
    }
  })

  it('keeps paper navigation and counts readable against the alpha-composited active surface', () => {
    for (const preset of gradientPresets.filter(item => item.surface === 'flat')) {
      for (const mode of ['light', 'dark'] as const) {
        const surface = paperActiveSurface(preset, mode)
        const text = mode === 'light' ? preset.accentTextColor : preset.darkAccentTextColor
        const helper = mode === 'light' ? preset.lightCardDescriptionColor : preset.darkCardDescriptionColor
        expect(contrastRatio(color(text), surface), `${preset.id}/${mode} text`).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(color(helper), surface), `${preset.id}/${mode} count`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('preserves custom accent values and publishes a dedicated text variable in the real background builder', () => {
    const custom = { ...DEFAULT_SETTINGS, site_title: 'Fixture', background_preset_id: 'custom' as const, custom_accent_color: '#aabbcc', custom_dark_accent_color: '#ddeeff' }
    expect(resolveThemeAccentTextColor(custom, 'light')).toBe('#aabbcc')
    expect(resolveThemeAccentTextColor(custom, 'dark')).toBe('#ddeeff')
    const preset = { ...custom, background_preset_id: 'paper-clay' as const }
    expect(resolveThemeAccentColor(preset, 'light')).toBe('#b08f89')
    expect(resolveThemeAccentTextColor(preset, 'light')).toBe('#352824')
    expect(buildHomeBackground(preset, 'light')).toContain('--theme-accent-color: #b08f89;')
    expect(buildHomeBackground(preset, 'light')).toContain('--theme-accent-text-color: #352824;')
    expect(custom.custom_accent_color).toBe('#aabbcc')
  })
})
