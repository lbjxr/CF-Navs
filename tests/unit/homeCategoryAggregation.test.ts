// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/svelte'
import Home from '../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory, PublicSettings } from '../../shared/types'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  localStorage.setItem('cf-navs:guide-seen', '1')
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

it('空一级默认展示排序第一的二级分类，不跨分类聚合其它书签', () => {
  const bookmarks = [bm(10, 2, 'First Child Bookmark', 0), bm(11, 3, 'Other Child Bookmark', 5)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('First Child Bookmark')
  expect(panel.textContent).not.toContain('Other Child Bookmark')
  expect(panel.textContent).not.toContain(EMPTY_TEXT)
  expect(container.querySelector('#home-category-tab-2')?.classList.contains('active')).toBe(true)
})

it('空一级且首个二级分类为空时保持该分类空态，不改选其它分类', () => {
  const bookmarks = [bm(12, 3, 'Other Child Bookmark', 5)]
  render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks } })

  const panel = document.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).not.toContain('Other Child Bookmark')
  expect(panel.textContent).toContain(EMPTY_TEXT)
  expect(document.querySelector('#home-category-tab-2')?.classList.contains('active')).toBe(true)
})

it('一级自身有直属书签时不聚合，照常显示本分类书签且无「常用」小标题', () => {
  const rootWithBookmark = [bm(20, 1, 'Root Direct', 3), bm(21, 3, 'Child Hot', 9)]
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks: rootWithBookmark } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('Root Direct')
  expect(panel.querySelector('.scope-hot-caption')).toBeNull()
})

it('空私密一级（管理员可见）也按首个二级分类回落', () => {
  const privateRoot: PublicCategory = { id: 1, parent_id: null, title: 'PrivateRoot', icon: null, sort: 0, is_private: true }
  const publicChild: PublicCategory = { id: 2, parent_id: 1, title: 'PublicChild', icon: null, sort: 0 }
  const bookmarks = [bm(10, 2, 'Dashboard', 3)]
  const { container } = render(Home, { props: { categories: [privateRoot, publicChild], bookmarks, isAuthenticated: true } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  // 私密一级的默认回落也遵循同级 sort，不因登录态改变选择规则。
  expect(panel.textContent).toContain('Dashboard')
  expect(container.querySelector('#home-category-tab-2')?.classList.contains('active')).toBe(true)
})

it('空一级回落不受全局「经常访问」数量设置影响', () => {
  const bookmarks = [bm(10, 2, 'First Child Bookmark', 0)]
  const settings = { most_visited_count: 0 } as unknown as PublicSettings
  const { container } = render(Home, { props: { categories: [emptyRoot, childB, childA], bookmarks, settings } })

  const panel = container.querySelector('#home-category-panel-1') as HTMLElement
  expect(panel.textContent).toContain('First Child Bookmark')
  expect(container.querySelector('#home-category-tab-2')?.classList.contains('active')).toBe(true)
})
