import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  getHorizontalNavigationMetrics,
  getAnchoredOverlayPosition,
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

  it('left-aligns an overlay with its anchor and clamps it inside the viewport', () => {
    expect(getAnchoredOverlayPosition({
      anchorLeft: 160,
      anchorBottom: 64,
      overlayWidth: 220,
      viewportWidth: 1200,
    })).toEqual({ left: 160, top: 72 })

    expect(getAnchoredOverlayPosition({
      anchorLeft: 1100,
      anchorRight: 1160,
      anchorBottom: 64,
      overlayWidth: 220,
      viewportWidth: 1200,
    })).toEqual({ left: 940, top: 72 })

    expect(getAnchoredOverlayPosition({
      anchorLeft: -20,
      anchorBottom: 40,
      overlayWidth: 220,
      viewportWidth: 320,
    })).toEqual({ left: 8, top: 48 })
  })

  // 顶部子菜单的全部交互——打开/关闭、键盘焦点入口、方向键循环、Escape 归还焦点、
  // 点浮层外关闭、失效父项清理——改由真 DOM 断言：见 tests/unit/topNavigationSubmenu.test.ts。

  it('raises the hovered bookmark shell with its tooltip', () => {
    const source = readFileSync('src/components/BookmarkCard.svelte', 'utf8')

    expect(source).toContain('z-index: 0;')
    expect(source).toContain('.bookmark-card-shell:hover,')
    expect(source).toContain('.bookmark-card-shell:focus-within')
    expect(source).toContain('z-index: 1;')
  })

  it('hides native sidebars scrollbars without disabling vertical scrolling', () => {
    const source = readFileSync('src/components/Sidebar.svelte', 'utf8')

    expect(source).toContain('overflow-y: auto;')
    expect(source).toContain('scrollbar-width: none;')
    expect(source).toContain('.toc-nav::-webkit-scrollbar')
    expect(source).toContain('display: none;')
  })
})
