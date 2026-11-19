// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import Home from '../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory, PublicSettings } from '../../shared/types'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  localStorage.setItem('cf-navs:guide-seen', '1')
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => { })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function bm(id: number, categoryId: number, title: string, click = 0): PublicBookmark {
  return {
    id,
    category_id: categoryId,
    title,
    url: `https://example.com/${id}`,
    icon: null,
    icon_source: 'custom',
    icon_background_color: null,
    icon_blob: null,
    description: null,
    description_mode: null,
    open_method: 1,
    sort: id,
    click_count: click,
  }
}

const emptyRoot: PublicCategory = { id: 1, parent_id: null, title: 'EmptyRoot', icon: null, sort: 0 }
const childA: PublicCategory = { id: 2, parent_id: 1, title: 'ChildA', icon: null, sort: 0 }
const childB: PublicCategory = { id: 3, parent_id: 1, title: 'ChildB', icon: null, sort: 1 }
const EMPTY_TEXT = '这个分类下暂时还没有可展示的书签。'

function panel(container: HTMLElement): HTMLElement {
  return container.querySelector('#home-category-panel-1') as HTMLElement
}

function rootTrigger(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('[data-home-category-scope="1"] .scope-root-trigger') as HTMLButtonElement
}

function cardIds(container: HTMLElement): number[] {
  return [...panel(container).querySelectorAll('.bookmark-card')]
    .map((card) => Number(card.getAttribute('href')?.split('/').pop()))
}

it('空一级默认聚合子分类书签，按访问频次排序并标注来源（#43）', () => {
  const bookmarks = [bm(10, 2, 'First Child Bookmark', 0), bm(11, 3, 'Other Child Bookmark', 5)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  expect(cardIds(container)).toEqual([11, 10])
  expect(panel(container).querySelector('.scope-hot-caption')?.textContent).toBe('常用（来自 2 个子分类）')
  expect([...panel(container).querySelectorAll('.bookmark-source')].map((node) => node.textContent)).toEqual(['ChildB', 'ChildA'])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.scope-tabs .active')).toBeNull()
})

it('排序第一的子分类为空时仍聚合其它子分类，避免错误空态', () => {
  const bookmarks = [bm(12, 3, 'Other Child Bookmark', 5)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  expect(cardIds(container)).toEqual([12])
  expect(panel(container).textContent).not.toContain(EMPTY_TEXT)
  expect(panel(container).querySelector('.scope-hot-caption')?.textContent).toBe('常用（来自 1 个子分类）')
})

it('子分类全零点击时按 sort 回填，保持一级聚合非空', () => {
  const bookmarks = [bm(12, 3, 'Cold B'), bm(11, 2, 'Cold A')]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  expect(cardIds(container)).toEqual([11, 12])
  expect(panel(container).textContent).not.toContain(EMPTY_TEXT)
})

it('一级与所有子分类均为空时保留一级选中和真实空态', () => {
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks: [] } })

  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
  expect(panel(container).textContent).toContain(EMPTY_TEXT)
  expect(panel(container).querySelector('.scope-hot-caption')).toBeNull()
})

it('一级自身有直属书签时不聚合，照常显示本分类书签且无「常用」小标题', () => {
  const rootWithBookmark = [bm(20, 1, 'Root Direct', 3), bm(21, 3, 'Child Hot', 9)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks: rootWithBookmark } })

  expect(cardIds(container)).toEqual([20])
  expect(panel(container).querySelector('.scope-hot-caption')).toBeNull()
})

it('管理员可见的空私密一级聚合公开书签，并排除私密书签', () => {
  const privateRoot: PublicCategory = { id: 1, parent_id: null, title: 'PrivateRoot', icon: null, sort: 0, is_private: true }
  const publicChild: PublicCategory = { id: 2, parent_id: 1, title: 'PublicChild', icon: null, sort: 0 }
  const bookmarks = [
    bm(10, 2, 'Dashboard', 3),
    { ...bm(11, 2, 'Private Boolean', 100), is_private: true },
    { ...bm(12, 2, 'Private Integer', 200), is_private: 1 as const },
  ]
  const { container } = render(Home, { props: { categories: [privateRoot, publicChild], bookmarks, isAuthenticated: true } })

  expect(cardIds(container)).toEqual([10])
  expect(panel(container).querySelector('.scope-hot-caption')?.textContent).toBe('常用（来自 1 个子分类）')
  expect(panel(container).querySelector('.bookmark-source')?.textContent).toBe('PublicChild')
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
})

it('聚合固定最多显示 12 条，全局「经常访问」数量设为 0 仍可显示', () => {
  const bookmarks = Array.from({ length: 15 }, (_, i) => bm(10 + i, i % 2 ? 2 : 3, `Bookmark ${i}`, i + 1))
  const settings = { most_visited_count: 0 } as unknown as PublicSettings
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks, settings } })

  expect(cardIds(container)).toEqual(Array.from({ length: 12 }, (_, i) => 24 - i))
  expect(panel(container).querySelector('.scope-hot-caption')).not.toBeNull()
  expect(container.querySelector('#category--1')).toBeNull()
})

it('选择子分类后显示其直属书签，点击一级标题可返回聚合', async () => {
  const bookmarks = [bm(10, 2, 'Cold A'), bm(11, 3, 'Hot B', 5)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  await fireEvent.click(container.querySelector('#home-category-tab-3') as HTMLButtonElement)
  expect(cardIds(container)).toEqual([11])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('false')
  expect(container.querySelector('#home-category-tab-3')?.getAttribute('aria-selected')).toBe('true')
  expect(panel(container).querySelector('.scope-hot-caption')).toBeNull()

  await fireEvent.click(rootTrigger(container))
  expect(cardIds(container)).toEqual([11, 10])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.scope-tabs .active')).toBeNull()
})

it('显式选择空子分类时显示空态，返回一级后恢复其它子分类书签', async () => {
  const { container } = render(Home, {
    props: { categories: [emptyRoot, childB, childA], bookmarks: [bm(11, 3, 'Hot B', 5)] },
  })

  await fireEvent.click(container.querySelector('#home-category-tab-2') as HTMLButtonElement)
  expect(panel(container).textContent).toContain(EMPTY_TEXT)
  expect(panel(container).querySelector('.scope-hot-caption')).toBeNull()

  await fireEvent.click(rootTrigger(container))
  expect(cardIds(container)).toEqual([11])
  expect(panel(container).textContent).not.toContain(EMPTY_TEXT)
})

it.each(['left', 'top'] as const)('%s 导航点击空一级后恢复聚合及正确导航高亮', async (position) => {
  const settings = { navigation: { position, always_expanded: true, top_layout: 'scroll' }, most_visited_count: 0 } as PublicSettings
  const { container } = render(Home, {
    props: { categories: [emptyRoot, childB, childA], bookmarks: [bm(11, 3, 'Hot B', 5)], settings },
  })
  await fireEvent.click(container.querySelector('#home-category-tab-3') as HTMLButtonElement)
  await fireEvent.click(container.querySelector('aside button[title="EmptyRoot"]') as HTMLButtonElement)

  expect(cardIds(container)).toEqual([11])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('[aria-current="location"]')?.getAttribute('title')).toBe('EmptyRoot')
})

it('书签异步到达或直属书签被删除时保持一级选择，并更新聚合内容', async () => {
  const { container, rerender } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks: [] } })

  await rerender({ bookmarks: [bm(11, 3, 'Hot B', 5)] })
  expect(cardIds(container)).toEqual([11])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')

  await rerender({ bookmarks: [bm(20, 1, 'Root Direct'), bm(11, 3, 'Hot B', 5)] })
  expect(cardIds(container)).toEqual([20])
  await rerender({ bookmarks: [bm(11, 3, 'Hot B', 5)] })
  expect(cardIds(container)).toEqual([11])
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
})

it('收到一级聚焦请求时从已选择的子分类返回一级聚合', async () => {
  const { container, rerender } = render(Home, {
    props: { categories: [emptyRoot, childB, childA], bookmarks: [bm(11, 3, 'Hot B', 5)] },
  })
  await fireEvent.click(container.querySelector('#home-category-tab-3') as HTMLButtonElement)
  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('false')
  await rerender({ focusCategoryId: 1 })

  await waitFor(() => expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true'))
  expect(cardIds(container)).toEqual([11])
})

it('滚动侦测在抑制期结束后仍保持明确选择的一级分类', async () => {
  const frames: FrameRequestCallback[] = []
  vi.mocked(requestAnimationFrame).mockImplementation((callback) => frames.push(callback))
  const settings = { navigation: { position: 'left', always_expanded: true, top_layout: 'scroll' }, most_visited_count: 0 } as PublicSettings
  const { container } = render(Home, {
    props: { categories: [emptyRoot, childB, childA], bookmarks: [bm(11, 3, 'Hot B', 5)], settings },
  })
  frames.splice(0).forEach((callback) => callback(0))
  await fireEvent.click(container.querySelector('#home-category-tab-3') as HTMLButtonElement)
  await fireEvent.click(rootTrigger(container))
  vi.spyOn(performance, 'now').mockReturnValue(100_000)
  await fireEvent.scroll(window)
  expect(frames).toHaveLength(1)
  frames.shift()?.(0)
  await tick()

  expect(rootTrigger(container).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('[aria-current="location"]')?.getAttribute('title')).toBe('EmptyRoot')
})
