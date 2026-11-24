import { describe, expect, it } from 'vitest'
import { assessTextContrast, compositeColors, contrastRatio, type RgbaColor } from '../../src/lib/colorContrast'
import { parseCssColor } from '../../src/lib/color'
import type { BackgroundSetting } from '../../shared/types'

const color = (value: string): RgbaColor => {
  const parsed = parseCssColor(value)
  if (!parsed) throw new Error(`Invalid fixture color: ${value}`)
  return parsed
}
const background = (value: string, overrides: Partial<BackgroundSetting> = {}): BackgroundSetting => ({
  type: 'color', value, blur: 0, mask: 0, maskColor: '#000000', ...overrides,
})

describe('text contrast on a known reference', () => {
  it('uses WCAG luminance and composes translucent text before measuring', () => {
    expect(contrastRatio(color('#000000'), color('#ffffff'))).toBe(21)
    expect(contrastRatio(color('#ffffff'), color('#ffffff'))).toBe(1)
    expect(contrastRatio(color('rgba(0, 0, 0, 0.5)'), color('#ffffff'))).toBeCloseTo(3.97665, 4)
    expect(contrastRatio(color('rgba(0, 0, 0, 0)'), color('#ffffff'))).toBe(1)
  })

  it('retains source-over alpha and fractional channels across multiple layers', () => {
    const mixed = compositeColors(color('rgba(255, 0, 0, 0.25)'), color('rgba(0, 0, 255, 0.5)'))
    expect(mixed.alpha).toBe(0.625)
    expect(mixed.red).toBe(102)
    expect(mixed.blue).toBe(153)
    const final = compositeColors(mixed, color('#ffffff'))
    expect(final).toEqual({ red: 159.375, green: 95.625, blue: 191.25, alpha: 1 })
    expect(contrastRatio(color('#000000'), mixed)).toBeNull()
  })

  it('includes the page mask instead of judging against the raw page or a card solid', () => {
    const result = assessTextContrast('#ffffff', background('#ffffff', { mask: 0.5 }))
    expect(result.reason).toBeNull()
    expect(result.ratio).toBeCloseTo(3.97665, 4)
    expect(assessTextContrast('#ffffff', background('#ffffff')).ratio).toBe(1)
  })

  it('cannot approve images, spatial gradients, unresolved colors or translucent references', () => {
    expect(assessTextContrast('#000000', background('url("example.png")', { type: 'image' }))).toEqual({ ratio: null, reason: 'image' })
    expect(assessTextContrast('#000000', background('linear-gradient(#fff, #000)', { type: 'gradient' }))).toEqual({ ratio: null, reason: 'gradient' })
    expect(assessTextContrast('var(--custom-color)', background('#ffffff'))).toEqual({ ratio: null, reason: 'unsupported' })
    expect(assessTextContrast('#000000', background('rgba(255, 255, 255, 0.5)'))).toEqual({ ratio: null, reason: 'transparent' })
  })

  it('can measure a fully opaque mask without claiming to sample the covered image', () => {
    const result = assessTextContrast('#000000', background('url("example.png")', { type: 'image', mask: 1, maskColor: '#ffffff' }))
    expect(result).toEqual({ ratio: 21, reason: null })
  })
})
