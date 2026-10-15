import { describe, expect, it } from 'vitest'
import {
  colorToRgbString,
  formatCssColor,
  hsvToRgb,
  normalizeHexColor,
  parseCssColor,
  rgbToHsv,
  splitCssColorAlpha,
} from '../../../src/lib/color'

describe('color helpers', () => {
  it('normalizes short and alpha hex values to six digit lowercase hex', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    expect(normalizeHexColor('#abcd')).toBe('#aabbcc')
    expect(normalizeHexColor('#AABBCCDD')).toBe('#aabbcc')
    expect(normalizeHexColor('not-a-color')).toBeNull()
  })

  it('parses rgb, rgba, and slash alpha syntax', () => {
    expect(parseCssColor('rgb(255 128 0)')).toMatchObject({
      hex: '#ff8000',
      alpha: 1,
      red: 255,
      green: 128,
      blue: 0,
    })
    expect(parseCssColor('rgba(10, 20, 30, 50%)')).toMatchObject({
      hex: '#0a141e',
      alpha: 0.5,
    })
    expect(parseCssColor('rgb(100% 50% 0% / .25)')).toMatchObject({
      hex: '#ff8000',
      alpha: 0.25,
    })
  })

  it('formats alpha colors and extracts alpha only when the input includes it', () => {
    expect(formatCssColor('#336699', 1)).toBe('#336699')
    expect(formatCssColor('#336699', 0.25)).toBe('rgba(51, 102, 153, 0.25)')
    expect(splitCssColorAlpha('#33669980', '#ffffff', 0.9)).toEqual({
      color: '#336699',
      alpha: expect.closeTo(0.5, 0.01),
    })
    expect(splitCssColorAlpha('#336699', '#ffffff', 0.9)).toEqual({
      color: '#336699',
      alpha: 0.9,
    })
  })

  it('returns an rgb triplet string with fallback for invalid colors', () => {
    expect(colorToRgbString('rgba(1, 2, 3, .4)')).toBe('1 2 3')
    expect(colorToRgbString('bad', '7 8 9')).toBe('7 8 9')
  })

  it('converts rgb to hsv for primary and achromatic colors', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0 })
    expect(rgbToHsv(255, 0, 0).s).toBeCloseTo(100, 5)
    expect(rgbToHsv(255, 0, 0).v).toBeCloseTo(100, 5)

    const green = rgbToHsv(0, 128, 0)
    expect(green.h).toBeCloseTo(120, 5)
    expect(green.s).toBeCloseTo(100, 5)

    const grey = rgbToHsv(128, 128, 128)
    expect(grey.h).toBe(0)
    expect(grey.s).toBeCloseTo(0, 5)
    expect(grey.v).toBeCloseTo((128 / 255) * 100, 5)
  })

  it('converts hsv to rgb and round-trips through rgbToHsv', () => {
    expect(hsvToRgb(0, 100, 100)).toEqual({ red: 255, green: 0, blue: 0 })
    expect(hsvToRgb(240, 100, 100)).toEqual({ red: 0, green: 0, blue: 255 })
    expect(hsvToRgb(0, 0, 100)).toEqual({ red: 255, green: 255, blue: 255 })

    for (const sample of [
      { red: 182, green: 164, blue: 47 },
      { red: 51, green: 102, blue: 153 },
      { red: 18, green: 52, blue: 86 },
    ]) {
      const hsv = rgbToHsv(sample.red, sample.green, sample.blue)
      expect(hsvToRgb(hsv.h, hsv.s, hsv.v)).toEqual(sample)
    }
  })
})
