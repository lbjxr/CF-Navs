import type { BackgroundSetting } from '../../shared/types'
import { clampAlpha, parseCssColor, type ParsedCssColor } from './color'

export type RgbaColor = Pick<ParsedCssColor, 'red' | 'green' | 'blue' | 'alpha'>
export interface TextContrastResult {
  ratio: number | null
  reason: 'image' | 'gradient' | 'transparent' | 'unsupported' | null
}

/** Source-over composition retains fractional channels until luminance is calculated. */
export function compositeColors(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const frontAlpha = clampAlpha(foreground.alpha)
  const backAlpha = clampAlpha(background.alpha)
  const alpha = frontAlpha + backAlpha * (1 - frontAlpha)
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 }
  const channel = (front: number, back: number) =>
    (front * frontAlpha + back * backAlpha * (1 - frontAlpha)) / alpha
  return {
    red: channel(foreground.red, background.red),
    green: channel(foreground.green, background.green),
    blue: channel(foreground.blue, background.blue),
    alpha,
  }
}

function luminance(color: RgbaColor): number {
  const linear = (channel: number) => {
    const value = Math.min(255, Math.max(0, channel)) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue)
}

/** A translucent reference has an unknown backdrop, so it cannot prove contrast. */
export function contrastRatio(foreground: RgbaColor, background: RgbaColor): number | null {
  if (background.alpha !== 1) return null
  const text = compositeColors(foreground, background)
  const front = luminance(text)
  const back = luminance(background)
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05)
}

/** Checks the flat homepage background and its mask; spatial/image backgrounds need actual sampling. */
export function assessTextContrast(textColor: string, background: BackgroundSetting): TextContrastResult {
  const text = parseCssColor(textColor)
  const mask = parseCssColor(background.maskColor)
  if (!text || !mask) return { ratio: null, reason: 'unsupported' }
  const cover = { ...mask, alpha: mask.alpha * clampAlpha(background.mask) }
  // An opaque mask makes the reference known even when an image or gradient is behind it.
  if (cover.alpha === 1) return { ratio: contrastRatio(text, cover), reason: null }
  if (background.type !== 'color') return { ratio: null, reason: background.type === 'image' ? 'image' : 'gradient' }
  const base = parseCssColor(background.value)
  if (!base) return { ratio: null, reason: 'unsupported' }
  const surface = compositeColors(cover, base)
  const ratio = contrastRatio(text, surface)
  return { ratio, reason: ratio === null ? 'transparent' : null }
}
