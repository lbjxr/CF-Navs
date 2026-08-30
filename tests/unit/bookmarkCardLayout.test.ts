import { describe, expect, it } from 'vitest'
import {
  getIconCardTrackWidth,
  getInfoCardMobileTrackWidth,
  getInfoCardTrackWidth,
} from '../../src/lib/bookmarkCardLayout'

describe('bookmark card layout helpers', () => {
  it('keeps info card tracks within the confirmed width range', () => {
    expect(getInfoCardTrackWidth(43)).toBe(44)
    expect(getInfoCardTrackWidth(44)).toBe(44)
    expect(getInfoCardTrackWidth(400)).toBe(400)
    expect(getInfoCardTrackWidth(401)).toBe(400)
  })

  it('keeps mobile info card tracks readable while following larger widths', () => {
    expect(getInfoCardMobileTrackWidth(44)).toBe(150)
    expect(getInfoCardMobileTrackWidth(200)).toBe(200)
    expect(getInfoCardMobileTrackWidth(400)).toBe(400)
  })

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
