// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/svelte'
import BookmarkListPanel from '../../src/components/admin/BookmarkListPanel.svelte'
import AnalyticsPanel from '../../src/components/admin/AnalyticsPanel.svelte'

// PROB-18b 第 2 个文件：`adminMobileLayout.test.ts` 里「移动端截断标题/URL 但保留完整值」
// 那两组断言迁到组件层。
//
// 原断言是 `expect(source).toContain('truncateUnicodeText(bookmark.title, 12)')`——只能证明
// 源码里写了这个调用，证明不了截断后**完整值仍然可访问**（`title` / `aria-label` / `href`）。
// 这条约束来自 `ADMIN_MOBILE_LAYOUT_PLAN.md`：截断只是视觉手段，完整信息不能丢。
//
// 纯 CSS 布局断言（grid-template-columns、padding、position、safe-area-inset）留在原文件，
// 它们要 computed style 才能证明，属 PROB-18c。

afterEach(cleanup)

const category = (id: number, title: string) => ({
  id, parent_id: null, title, icon: '', bookmarkCount: 0,
})

// 24 字素的标题 + 长 URL：两个截断阈值（书签列表 12、访问分析 20）都必须真的被触发。
// 刻意不取 20 —— truncateUnicodeText 在 `长度 <= 阈值` 时原样返回，取 20 会让访问分析那条
// 变成「没截断」而假失败。
const LONG_TITLE = '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾甲乙丙丁'
const LONG_URL = 'https://example.com/very/long/path/that/exceeds/twenty/characters?q=1'

const bookmark = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  category_id: 1,
  title: LONG_TITLE,
  url: LONG_URL,
  icon: '',
  description: '',
  open_method: 'new_tab' as const,
  sort: 1,
  click_count: 0,
  ...overrides,
})

describe('书签列表的移动端截断', () => {
  it('截断只影响显示，完整标题仍由 title/aria-label 提供', () => {
    render(BookmarkListPanel, {
      props: { isAuthenticated: true, categories: [category(1, '常用工具')], bookmarks: [bookmark()] },
    })

    // 完整标题必须留在无障碍树里：截断版本是 aria-hidden 的装饰
    const titleHost = screen.getByLabelText(LONG_TITLE)
    expect(titleHost.getAttribute('title')).toBe(LONG_TITLE)

    const full = titleHost.querySelector('.admin-bookmark-title-full')
    const mobile = titleHost.querySelector('.admin-bookmark-title-mobile')
    expect(full?.textContent).toBe(LONG_TITLE)
    expect(mobile?.getAttribute('aria-hidden')).toBe('true')

    // 截断版本确实更短、且以省略号结尾，而不是原样重复一遍
    const truncated = mobile?.textContent ?? ''
    expect(truncated.length).toBeLessThan(LONG_TITLE.length)
    expect(truncated.endsWith('…')).toBe(true)
    expect(LONG_TITLE.startsWith(truncated.slice(0, -1))).toBe(true)
  })

  it('移动端 URL 截断不改变链接目标', () => {
    // 这是原断言真正想保住的东西：href 必须是完整地址，否则点开就是错的。
    render(BookmarkListPanel, {
      props: { isAuthenticated: true, categories: [category(1, '常用工具')], bookmarks: [bookmark()] },
    })

    const link = screen.getByLabelText(`打开 ${LONG_URL}`)
    expect(link.getAttribute('href')).toBe(LONG_URL)
    expect(link.getAttribute('title')).toBe(LONG_URL)
    expect((link.textContent ?? '').trim().endsWith('…')).toBe(true)
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('短标题不被截断，也不追加省略号', () => {
    // 阈值边界：只有超长才截断，否则会给正常标题凭空加省略号
    render(BookmarkListPanel, {
      props: { isAuthenticated: true, categories: [category(1, '常用工具')], bookmarks: [bookmark({ title: '短标题' })] },
    })

    const mobile = screen.getByLabelText('短标题').querySelector('.admin-bookmark-title-mobile')
    expect(mobile?.textContent).toBe('短标题')
  })

  it('私密书签的标记出现在元信息里', () => {
    render(BookmarkListPanel, {
      props: {
        isAuthenticated: true,
        categories: [category(1, '常用工具')],
        bookmarks: [bookmark({ is_private: true })],
      },
    })

    expect(screen.getAllByTitle('仅登录后可见').length).toBeGreaterThan(0)
  })
})

describe('访问分析的零访问列表截断', () => {
  it('标题与 URL 各截到 20 字素，完整值仍可访问', () => {
    render(AnalyticsPanel, {
      props: { categories: [category(1, '常用工具')], bookmarks: [bookmark({ click_count: 0 })] },
    })

    const title = screen.getByLabelText(LONG_TITLE)
    expect(title.getAttribute('title')).toBe(LONG_TITLE)
    expect((title.textContent ?? '').endsWith('…')).toBe(true)

    const link = screen.getByLabelText(`打开 ${LONG_URL}`)
    expect(link.getAttribute('href')).toBe(LONG_URL)
    expect(link.getAttribute('title')).toBe(LONG_URL)
    expect((link.textContent ?? '').trim().endsWith('…')).toBe(true)
  })

  it('全部书签都有访问记录时显示祝贺态而不是空列表', () => {
    render(AnalyticsPanel, {
      props: { categories: [category(1, '常用工具')], bookmarks: [bookmark({ click_count: 3 })] },
    })

    expect(screen.getByRole('heading', { name: '非常棒！' })).toBeTruthy()
    expect(screen.queryByLabelText(`打开 ${LONG_URL}`)).toBeNull()
  })
})
