import { describe, expect, it } from 'vitest'
import { clampSliderValue, formatSliderValue } from '../../../src/lib/sliderFormat'

describe('formatSliderValue', () => {
  it('formats px and percent units', () => {
    expect(formatSliderValue(42, { format: 'px' })).toBe('42 px')
    expect(formatSliderValue(15, { format: 'percent' })).toBe('15%')
    expect(formatSliderValue(0, { format: 'percent' })).toBe('0%')
  })

  it('formats a 0-1 ratio as a rounded percentage', () => {
    expect(formatSliderValue(0.65, { format: 'ratio-percent' })).toBe('65%')
    expect(formatSliderValue(0.1, { format: 'ratio-percent' })).toBe('10%')
    expect(formatSliderValue(0.655, { format: 'ratio-percent', percentDigits: 1 })).toBe('65.5%')
  })

  it('uses the zero label for count and unit otherwise', () => {
    expect(formatSliderValue(0, { format: 'count', zeroLabel: '0 (隐藏)' })).toBe('0 (隐藏)')
    expect(formatSliderValue(0, { format: 'count', zeroLabel: '已禁用' })).toBe('已禁用')
    expect(formatSliderValue(8, { format: 'count', countUnit: '个' })).toBe('8 个')
    expect(formatSliderValue(3, { format: 'count' })).toBe('3')
  })

  it('returns empty string for non-finite input', () => {
    expect(formatSliderValue(Number.NaN, { format: 'px' })).toBe('')
  })
})

describe('clampSliderValue', () => {
  it('clamps into range and falls back to min for non-finite', () => {
    expect(clampSliderValue(150, 0, 100)).toBe(100)
    expect(clampSliderValue(-5, 0, 100)).toBe(0)
    expect(clampSliderValue(50, 0, 100)).toBe(50)
    expect(clampSliderValue(Number.NaN, 10, 100)).toBe(10)
  })
})
