import { describe, expect, it } from 'vitest'
import { getIconCardTrackWidth } from '../../src/lib/bookmarkCardLayout'

describe('bookmark card layout helpers', () => {
  it('keeps title-bearing compact cards wide enough for mobile icon grids', () => {
    expect(getIconCardTrackWidth(60, true)).toBe(72)
  })

  it('does not expand compact cards when titles are hidden', () => {
    expect(getIconCardTrackWidth(60, false)).toBe(60)
  })

  it('preserves larger configured icon sizes', () => {
    expect(getIconCardTrackWidth(100, true)).toBe(100)
  })
})
