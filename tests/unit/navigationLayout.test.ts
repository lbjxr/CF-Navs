import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  getHorizontalNavigationMetrics,
  LEFT_NAV_COLLAPSED_STORAGE_KEY,
  parseLeftNavigationCollapsed,
  readLeftNavigationCollapsed,
  writeLeftNavigationCollapsed,
} from '../../src/lib/navigationLayout'

describe('navigation layout helpers', () => {
  it('uses an explicit versioned value for the desktop left collapse preference', () => {
    expect(parseLeftNavigationCollapsed('true')).toBe(true)
    expect(parseLeftNavigationCollapsed('false')).toBe(false)
    expect(parseLeftNavigationCollapsed('1')).toBe(false)
    expect(parseLeftNavigationCollapsed(null)).toBe(false)
  })

  it('reads and writes storage without breaking when storage is blocked', () => {
    const setItem = vi.fn()
    const storage = { getItem: vi.fn(() => 'true'), setItem }

    expect(readLeftNavigationCollapsed(storage)).toBe(true)
    writeLeftNavigationCollapsed(storage, false)
    expect(setItem).toHaveBeenCalledWith(LEFT_NAV_COLLAPSED_STORAGE_KEY, 'false')

    expect(readLeftNavigationCollapsed({ getItem: () => { throw new Error('blocked') } })).toBe(false)
    expect(() => writeLeftNavigationCollapsed({ setItem: () => { throw new Error('blocked') } }, true)).not.toThrow()
  })

  it('derives overflow boundaries and a 70 percent scroll step', () => {
    expect(getHorizontalNavigationMetrics({ scrollLeft: 0, clientWidth: 500, scrollWidth: 1200 })).toEqual({
      overflow: true,
      canScrollLeft: false,
      canScrollRight: true,
      maxScrollLeft: 700,
      scrollStep: 350,
    })

    expect(getHorizontalNavigationMetrics({ scrollLeft: 700, clientWidth: 500, scrollWidth: 1200 })).toMatchObject({
      canScrollLeft: true,
      canScrollRight: false,
    })

    expect(getHorizontalNavigationMetrics({ scrollLeft: 0, clientWidth: 500, scrollWidth: 500 })).toMatchObject({
      overflow: false,
      canScrollLeft: false,
      canScrollRight: false,
    })
  })

  it('mutates the horizontal track through a local DOM reference while dragging', () => {
    const source = readFileSync('src/components/Sidebar.svelte', 'utf8')

    expect(source).toContain('const track = topTrack')
    expect(source).toContain('track.setPointerCapture(event.pointerId)')
    expect(source).toContain("track.style.scrollBehavior = 'auto'")
    expect(source).toContain('track.scrollLeft = dragStartScrollLeft - delta')
    expect(source).not.toContain('topTrack.setPointerCapture(event.pointerId)')
    expect(source).not.toContain('topTrack.scrollLeft = dragStartScrollLeft - delta')
  })
})
