// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/svelte'
import Home from '../../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory, PublicSettings } from '../../../shared/types'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => { })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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

it('空一级（首个子分类为空）聚合展示其它子分类的常用书签，而非空态', () => {
  const bookmarks = [bm(10, 3, 'Hot Bookmark', 5)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childA, childB], bookmarks } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('Hot Bookmark')
  expect(panel.textContent).not.toContain(EMPTY_TEXT)
  expect(panel.querySelector('.scope-hot-caption')?.textContent).toBe('常用（来自 1 个子分类）')
  // 卡片标注来源二级分类名
  expect(panel.querySelector('.bookmark-source')?.textContent).toBe('ChildB')
})

it('空一级且子树全零点击时按 sort 回填，仍非空', () => {
  const bookmarks = [bm(11, 2, 'Cold A', 0), bm(12, 3, 'Cold B', 0)]
  render(Home, { props: { categories: [emptyRoot, childA, childB], bookmarks } })

  expect(screen.getByText('Cold A')).toBeTruthy()
  expect(screen.getByText('Cold B')).toBeTruthy()
  expect(screen.queryByText(EMPTY_TEXT)).toBeNull()
})

it('一级自身有直属书签时不聚合，照常显示本分类书签且无「常用」小标题', () => {
  const rootWithBookmark = [bm(20, 1, 'Root Direct', 3), bm(21, 3, 'Child Hot', 9)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childA, childB], bookmarks: rootWithBookmark } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('Root Direct')
  expect(panel.querySelector('.scope-hot-caption')).toBeNull()
})

it('空私密一级（管理员可见）聚合其公开子分类的常用书签（Issue #31 复核回归）', () => {
  const privateRoot: PublicCategory = { id: 1, parent_id: null, title: 'PrivateRoot', icon: null, sort: 0, is_private: true }
  const publicChild: PublicCategory = { id: 2, parent_id: 1, title: 'PublicChild', icon: null, sort: 0 }
  const bookmarks = [bm(10, 2, 'Dashboard', 3)]
  const { container } = render(Home, { props: { categories: [privateRoot, publicChild], bookmarks, isAuthenticated: true } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  // 私密一级自身无直属书签，但其公开子分类的高频书签必须聚合显示，而不是因匿名可见集被丢弃
  expect(panel.textContent).toContain('Dashboard')
  expect(panel.querySelector('.scope-hot-caption')?.textContent).toBe('常用（来自 1 个子分类）')
  expect(panel.querySelector('.bookmark-source')?.textContent).toBe('PublicChild')
})

it('分类聚合数量与全局「经常访问」解耦：most_visited_count=0 仍显示聚合区（Issue #31 第 2 点后续）', () => {
  const bookmarks = [bm(10, 3, 'Hot Bookmark', 5)]
  // 全局「经常访问」数量设为 0；分类聚合改用固定上限 CATEGORY_HOT_LIMIT，不应因此被隐藏
  const settings = { most_visited_count: 0 } as unknown as PublicSettings
  const { container } = render(Home, { props: { categories: [emptyRoot, childA, childB], bookmarks, settings } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('Hot Bookmark')
  expect(panel.querySelector('.scope-hot-caption')).not.toBeNull()
})
