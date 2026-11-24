// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import BookmarkCardCompact from '../../src/components/BookmarkCardCompact.svelte'
import BookmarkCardInfo from '../../src/components/BookmarkCardInfo.svelte'
import BookmarkContextMenu from '../../src/components/BookmarkContextMenu.svelte'
import BookmarkIconCandidatePicker from '../../src/components/BookmarkIconCandidatePicker.svelte'
import HomeCategoryScope from '../../src/components/HomeCategoryScope.svelte'
import Sidebar from '../../src/components/Sidebar.svelte'
import SpotlightBookmarkIcon from '../../src/components/SpotlightBookmarkIcon.svelte'
import ThemeBackgroundCard from '../../src/components/settings/ThemeBackgroundCard.svelte'
import BaseFieldsBindHarness from '../helpers/level1/BaseFieldsBindHarness.svelte'
import HeroSearchBindHarness from '../helpers/level1/HeroSearchBindHarness.svelte'
import IconifyBindHarness from '../helpers/level1/IconifyBindHarness.svelte'
import type { BackgroundSetting, IconifyCandidate, PublicBookmark, PublicSettings } from '../../shared/types'
import type { BookmarkFormValue } from '../../src/lib/adminTypes'
import type { IconCandidate } from '../../src/lib/icons'
import { LEFT_NAV_COLLAPSED_STORAGE_KEY } from '../../src/lib/navigationLayout'

function pointer(type: string, init: { pointerId: number; clientX: number; button?: number }): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX, button: init.button ?? 0 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  Object.defineProperty(event, 'pointerId', { value: init.pointerId })
  return event
}

// 代码审查三轮第 24 项（APP_SPLIT_PLAN 第 8g 步）：迁移前写成的行为基线。
// 11 个层级 1 首页 / 书签组件：被父组件 `bind:` 的字段经 tests/helpers/level1/ 下的 legacy 替身父组件观察写回；
// GradientBackgroundInput 的 change 派发经真实 legacy 父组件 ThemeBackgroundCard 观察；其余直接挂载、
// 以 rerender 推送新 props。既有 topNavigationSubmenu / categoryCollapseBehavior / homeCategoryScopeActions /
// bookmarkContextMenuPlacement / bookmarkIconRecovery 继续覆盖各自部分。迁移为 runes 时本文件不应改动。

beforeEach(() => {
  // jsdom 没有 scrollIntoView；分类树打开时会把选中项滚入视野。
  Element.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

async function flush(): Promise<void> {
  await tick()
  await tick()
}

const bookmark: PublicBookmark = {
  id: 7, category_id: 1, title: 'Svelte', url: 'https://svelte.dev/', icon: null, icon_source: null,
  icon_background_color: null, icon_blob: null, description: '编译器框架', open_method: 1, sort: 0,
}

describe('BookmarkBaseFields：legacy 父组件 bind: 的 7 个字段写回', () => {
  const categories = [
    { id: 1, title: '工具', children: [] },
    { id: 2, title: '学习', children: [] },
  ]
  function renderFields(extra: Record<string, unknown> = {}) {
    const form = {
      category_id: 1 as string | number | undefined, title: '旧标题', url: 'https://a.test/', open_method: 'new_tab' as BookmarkFormValue['open_method'],
      is_private: false, description: '', description_mode: 'inherit' as BookmarkFormValue['description_mode'],
    }
    const seen: Record<string, unknown>[] = []
    const view = render(BaseFieldsBindHarness, { props: { form, categories, onForm: (next: Record<string, unknown>) => seen.push(next), ...extra } })
    return { form, seen, latest: () => seen[seen.length - 1], ...view }
  }

  it('文本 / 下拉 / 复选框写回父表单', async () => {
    const { latest } = renderFields()
    await fireEvent.input(screen.getByPlaceholderText('例如：Svelte 官方网站'), { target: { value: '新标题' } })
    await fireEvent.input(screen.getByPlaceholderText('https://example.com'), { target: { value: 'https://b.test/' } })
    await fireEvent.input(screen.getByPlaceholderText('补充说明，可选'), { target: { value: '说明' } })
    const selects = Array.from(document.querySelectorAll('select'))
    await fireEvent.change(selects[0], { target: { value: 'modal' } })
    await fireEvent.change(selects[1], { target: { value: 'hover' } })
    await fireEvent.click(screen.getByRole('checkbox'))
    await flush()
    expect(latest()).toMatchObject({ title: '新标题', url: 'https://b.test/', description: '说明', open_method: 'modal', description_mode: 'hover', is_private: true })
  })

  it('分类树选择写回 category_id；父组件改值后输入框跟随', async () => {
    const { latest, rerender } = renderFields()
    await fireEvent.click(screen.getByTestId('bookmark-category-tree-select'))
    await fireEvent.click(screen.getByRole('treeitem', { name: /学习/ }))
    await flush()
    expect(String(latest().category_id)).toBe('2')

    await rerender({ form: { category_id: 1, title: '外部标题', url: 'https://c.test/', open_method: 'same_tab', is_private: true, description: 'd', description_mode: 'always' } })
    await flush()
    expect((screen.getByPlaceholderText('例如：Svelte 官方网站') as HTMLInputElement).value).toBe('外部标题')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('链接失焦回调、解析中提示、loading 禁用复选框', async () => {
    const onUrlBlur = vi.fn()
    renderFields({ onUrlBlur, titleLoading: true, loading: true })
    await fireEvent.blur(screen.getByPlaceholderText('https://example.com'))
    expect(onUrlBlur).toHaveBeenCalledTimes(1)
    expect(screen.getByText('解析中…')).toBeTruthy()
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true)
  })
})

describe('BookmarkCardCompact / BookmarkCardInfo：链接与回调', () => {
  it('Compact：点击与右键把原生事件交给当前回调，标题链接同样转发；回调换新后用新的', async () => {
    const onLinkClick = vi.fn((event: MouseEvent) => event.preventDefault())
    const onContextMenu = vi.fn((event: MouseEvent) => event.preventDefault())
    const { container, rerender } = render(BookmarkCardCompact, { props: { bookmark, tooltipText: 'Svelte 提示', onLinkClick, onContextMenu } })
    const [card, title] = Array.from(container.querySelectorAll('a'))
    expect(card.getAttribute('href')).toBe('https://svelte.dev/')
    expect(card.getAttribute('target')).toBe('_blank')
    expect(card.getAttribute('data-tooltip')).toBe('Svelte 提示')
    expect(title.textContent?.trim()).toBe('Svelte')

    await fireEvent.click(card)
    await fireEvent.contextMenu(title)
    expect(onLinkClick).toHaveBeenCalledTimes(1)
    expect(onLinkClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent)
    expect(onContextMenu).toHaveBeenCalledTimes(1)

    const next = vi.fn()
    await rerender({ onLinkClick: next, showIconTitle: false, preview: true, themeOverride: 'light' })
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(container.querySelector('a')?.classList.contains('preview-light')).toBe(true)
    await fireEvent.click(container.querySelector('a') as HTMLAnchorElement)
    expect(next).toHaveBeenCalledTimes(1)
    expect(onLinkClick).toHaveBeenCalledTimes(1)
  })

  it('Info：描述显示模式、来源分类、悬停提示与图标加载失败回调', async () => {
    const onIconError = vi.fn()
    const { container, rerender } = render(BookmarkCardInfo, {
      props: { bookmark, tooltipText: '提示', iconUrl: 'https://svelte.dev/icon.png', onIconError, sourceCategoryTitle: '工具', openInNewTab: false },
    })
    const link = container.querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('target')).toBeNull()
    expect(screen.getByText('编译器框架')).toBeTruthy()
    expect(screen.getByText('工具')).toBeTruthy()
    expect(link.getAttribute('data-tooltip')).toBe('')

    await fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(onIconError).toHaveBeenCalledTimes(1)

    await rerender({ descriptionMode: 'hover' })
    expect(screen.queryByText('编译器框架')).toBeNull()
    expect(link.getAttribute('data-tooltip')).toBe('提示')
    expect(link.classList.contains('bookmark-tooltip-anchor')).toBe(true)

    await rerender({ showDescription: false })
    expect(link.getAttribute('data-tooltip')).toBe('')
  })

  it('Info：未传 descriptionMode 时按 showDescription 取初始默认', () => {
    render(BookmarkCardInfo, { props: { bookmark, showDescription: false } })
    expect(screen.queryByText('编译器框架')).toBeNull()
  })
})

describe('BookmarkContextMenu：操作与事件边界', () => {
  const categories = [
    { id: 1, title: '工具', children: [] },
    { id: 2, title: '学习', children: [] },
  ]

  it('编辑回调；菜单内 click / pointerdown 不冒泡到 window，Escape 以外的按键也不冒泡', async () => {
    const onEdit = vi.fn()
    const outside = vi.fn()
    window.addEventListener('click', outside)
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', outside)
    try {
      render(BookmarkContextMenu, { props: { categories, currentCategoryId: 1, onEdit } })
      await fireEvent.click(screen.getByTestId('bookmark-context-edit'))
      expect(onEdit).toHaveBeenCalledTimes(1)
      await fireEvent.pointerDown(screen.getByRole('menu'))
      await fireEvent.keyDown(screen.getByTestId('bookmark-context-edit'), { key: 'Enter' })
      expect(outside).not.toHaveBeenCalled()
      await fireEvent.keyDown(screen.getByTestId('bookmark-context-edit'), { key: 'Escape' })
      expect(outside).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('click', outside)
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', outside)
    }
  })

  it('选择不同分类后只调用一次 onMoveBookmark（数字 id）并收起选择器，提交结束前不重复提交', async () => {
    let resolve!: () => void
    const onMoveBookmark = vi.fn(() => new Promise<void>((r) => { resolve = r }))
    const stringIds = [{ id: '1', title: '工具', children: [] }, { id: '2', title: '学习', children: [] }]
    render(BookmarkContextMenu, { props: { categories: stringIds, currentCategoryId: 1, onMoveBookmark, canMove: true } })
    await fireEvent.click(screen.getByTestId('bookmark-context-move'))
    expect(screen.getByTestId('bookmark-context-move-picker')).toBeTruthy()

    await fireEvent.click(screen.getByTestId('bookmark-context-move-select'))
    await fireEvent.click(screen.getByRole('treeitem', { name: /学习/ }))
    await flush()
    expect(onMoveBookmark).toHaveBeenCalledTimes(1)
    expect(onMoveBookmark).toHaveBeenCalledWith(2)
    expect(screen.queryByTestId('bookmark-context-move-picker')).toBeNull()

    // 上一次移动尚未结束：再次打开并选另一分类也不重复提交
    await fireEvent.click(screen.getByTestId('bookmark-context-move'))
    await fireEvent.click(screen.getByTestId('bookmark-context-move-select'))
    await fireEvent.click(screen.getByRole('treeitem', { name: /学习/ }))
    await flush()
    expect(onMoveBookmark).toHaveBeenCalledTimes(1)
    resolve()
  })

  it('选当前分类不提交；canMove 为假或没有分类时不显示「移动」', async () => {
    const onMoveBookmark = vi.fn()
    const { rerender } = render(BookmarkContextMenu, { props: { categories, currentCategoryId: 1, onMoveBookmark, canMove: true } })
    await fireEvent.click(screen.getByTestId('bookmark-context-move'))
    await fireEvent.click(screen.getByTestId('bookmark-context-move-select'))
    await fireEvent.click(screen.getByRole('treeitem', { name: /工具/ }))
    await flush()
    expect(onMoveBookmark).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByText('取消'))
    await flush()

    await rerender({ canMove: false })
    expect(screen.queryByTestId('bookmark-context-move')).toBeNull()
    await rerender({ canMove: true, categories: [] })
    expect(screen.queryByTestId('bookmark-context-move')).toBeNull()
  })
})

describe('BookmarkIconCandidatePicker', () => {
  const candidates: IconCandidate[] = [
    { source: 'direct', label: '站点图标', url: 'https://a.test/favicon.ico' },
    { source: 'logo_surf', label: '文字图标', url: 'logo' },
  ]

  it('选中态按表单判断，点击把候选交给回调；无候选时按 urlFilled 给提示', async () => {
    const onSelect = vi.fn()
    const form = { icon: 'https://a.test/favicon.ico', icon_source: 'direct' } as BookmarkFormValue
    const { rerender } = render(BookmarkIconCandidatePicker, { props: { candidates, form, onSelect } })
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].className).toContain('selected')
    expect(buttons[1].className).not.toContain('selected')
    await fireEvent.click(buttons[1])
    expect(onSelect).toHaveBeenCalledWith(candidates[1])

    await rerender({ form: { icon: '', icon_source: 'logo_surf' } as BookmarkFormValue })
    expect(screen.getAllByRole('button')[1].className).toContain('selected')

    await rerender({ candidates: [] })
    expect(screen.getByText('填写链接地址后将自动生成图标选项')).toBeTruthy()
    await rerender({ urlFilled: true })
    expect(screen.getByText('请输入有效链接以生成图标候选')).toBeTruthy()
  })
})

describe('GradientBackgroundInput：经真实 legacy 父组件 ThemeBackgroundCard', () => {
  // 第 8i 步 ThemeBackgroundCard 自身改为 runes：`change` 事件改为 `onchange` 回调 prop（参数即原 e.detail）。
  it('改起始色后父组件派发的新背景是重组后的渐变；父组件推送新值后两端颜色跟随', async () => {
    const background: BackgroundSetting = { type: 'gradient', value: 'linear-gradient(135deg, #111111, #222222)', blur: 0, mask: 0, maskColor: '#000000' }
    const onChange = vi.fn()
    const { rerender } = render(ThemeBackgroundCard, { props: { theme: 'dark', background, onchange: onChange } })

    await fireEvent.input(screen.getByLabelText('起始颜色'), { target: { value: '#abcdef' } })
    await flush()
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'gradient', value: 'linear-gradient(135deg, #abcdef, #222222)' }))

    await rerender({ background: { ...background, value: 'radial-gradient(circle, rgb(1, 2, 3) 10%, #445566)' } })
    await flush()
    expect((screen.getByLabelText('起始颜色') as HTMLInputElement).value).toBe('rgb(1, 2, 3)')
    expect((screen.getByLabelText('结束颜色') as HTMLInputElement).value).toBe('#445566')

    await rerender({ background: { ...background, value: '#778899' } })
    await flush()
    expect((screen.getByLabelText('起始颜色') as HTMLInputElement).value).toBe('#778899')
  })
})

describe('HomeHeroSearch：legacy 父组件 bind:query', () => {
  it('输入写回父组件、父组件清空后输入框跟随；标题 / 搜索框按设置显隐', async () => {
    const queries: string[] = []
    const { container, rerender } = render(HeroSearchBindHarness, { props: { onQuery: (q: string) => queries.push(q) } })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('导航')
    expect((screen.getByRole('heading', { level: 1 }) as HTMLElement).style.color).toBe('rgb(18, 52, 86)')

    await fireEvent.input(screen.getByRole('searchbox', { name: '搜索关键词' }), { target: { value: 'svelte' } })
    await flush()
    expect(queries[queries.length - 1]).toBe('svelte')

    await fireEvent.click(screen.getByTestId('harness-clear'))
    await flush()
    expect((screen.getByRole('searchbox', { name: '搜索关键词' }) as HTMLInputElement).value).toBe('')

    await rerender({ settings: { site_title_show: false, search_box_show: false } as PublicSettings, preview: true, themeOverride: 'light' })
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('searchbox', { name: '搜索关键词' })).toBeNull()
    expect(container.querySelector('.hero-search')?.classList.contains('preview-light')).toBe(true)
  })
})

describe('IconifySelector：legacy 父组件 bind:iconifyName 与回调', () => {
  const candidate: IconifyCandidate = { name: 'mdi:home', prefix: 'mdi', icon: 'home', label: 'Home', collection: 'MDI', url: '', preview_url: 'https://p.test/home.svg', colored: false }

  it('输入写回、父组件改值后输入框跟随；按钮回调与禁用', async () => {
    const names: string[] = []
    const onOpenLibrary = vi.fn()
    const onSelectIcon = vi.fn()
    const { rerender } = render(IconifyBindHarness, { props: { onName: (n: string) => names.push(n), onOpenLibrary, onSelectIcon } })
    const input = screen.getByLabelText('Iconify 图标名') as HTMLInputElement
    await fireEvent.input(input, { target: { value: 'mdi:home' } })
    await flush()
    expect(names[names.length - 1]).toBe('mdi:home')

    await fireEvent.click(screen.getByTestId('harness-set-name'))
    await flush()
    expect(input.value).toBe('mdi:star')

    await fireEvent.click(screen.getByText('打开 Iconify 图标库'))
    expect(onOpenLibrary).toHaveBeenCalledTimes(1)
    const use = screen.getByRole('button', { name: '使用 Iconify' }) as HTMLButtonElement
    expect(use.disabled).toBe(true)
    await rerender({ iconifyPreviewUrl: 'https://p.test/star.svg', iconifySelected: true })
    expect(use.disabled).toBe(false)
    expect(use.getAttribute('aria-pressed')).toBe('true')
    await fireEvent.click(use)
    expect(onSelectIcon).toHaveBeenCalledTimes(1)
  })

  it('候选、搜索中、搜索错误与候选错误', async () => {
    const onSelectCandidate = vi.fn()
    const { rerender } = render(IconifyBindHarness, { props: { iconifySearchCandidates: [candidate], iconifyUseConfirmed: true, confirmedIconifyName: 'mdi:home', onSelectCandidate, candidateError: '候选失败' } })
    const button = screen.getByTitle('mdi:home - MDI')
    expect(button.className).toContain('selected')
    await fireEvent.click(button)
    expect(onSelectCandidate).toHaveBeenCalledWith(candidate)
    expect(screen.getByText('候选失败')).toBeTruthy()

    await rerender({ iconifySearchCandidates: [], iconifySearchLoading: true })
    expect(screen.getByText('Iconify 图标搜索中...')).toBeTruthy()
    await rerender({ iconifySearchLoading: false, iconifySearchError: '搜索失败' })
    expect(screen.getByText('搜索失败')).toBeTruthy()
  })
})

describe('HomeCategoryScope：选择、键盘与菜单收起', () => {
  const children = [
    { id: 11, title: '编辑器', icon: null, count: 3 },
    { id: 12, title: '设计', icon: null, count: 1 },
  ]

  it('根 / 子分类点击回调，activeId 切换 tablist 语义，tab 键盘导航到两端并触发选择', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(HomeCategoryScope, { props: { rootId: 1, title: '工具', totalCount: 4, children, activeId: 1, onSelect } })
    expect(screen.getByRole('button', { name: /工具/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group')).toBeTruthy()
    expect(screen.getByText('（4）')).toBeTruthy()

    await fireEvent.click(screen.getByTitle('设计'))
    expect(onSelect).toHaveBeenLastCalledWith(12)

    await rerender({ activeId: 11 })
    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /编辑器/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /编辑器/ }).getAttribute('aria-controls')).toBe('home-category-panel-1')

    screen.getByRole('tab', { name: /编辑器/ }).focus()
    await fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith(12)
    await fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith(11)

    await fireEvent.click(screen.getByRole('button', { name: /工具/ }))
    expect(onSelect).toHaveBeenLastCalledWith(1)
    await rerender({ panelId: 'custom-panel' })
    expect(screen.getByRole('button', { name: /工具/ }).getAttribute('aria-controls')).toBe('custom-panel')
  })

  it('菜单打开时操作被撤掉则菜单收起；再给回操作后仍为收起态', async () => {
    const onAddBookmark = vi.fn()
    const { rerender } = render(HomeCategoryScope, { props: { rootId: 1, title: '工具', children, reserveActions: true, onAddBookmark } })
    await fireEvent.click(screen.getByRole('button', { name: '工具 更多操作' }))
    expect(screen.getByRole('menu')).toBeTruthy()

    await rerender({ onAddBookmark: undefined })
    expect(screen.queryByRole('button', { name: '工具 更多操作' })).toBeNull()
    await rerender({ onAddBookmark })
    expect(screen.getByRole('button', { name: '工具 更多操作' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: '工具 更多操作' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: '新增书签' }))
    expect(onAddBookmark).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Sidebar：左侧导航状态与上报', () => {
  const items = [
    { id: 'cat-1', categoryId: 1, title: '常用工具', icon: null, count: 2, children: [{ id: 'cat-11', categoryId: 11, title: '编辑器', icon: null, count: 1 }] },
    { id: 'cat-2', categoryId: 2, title: '学习资料', icon: null, count: 1 },
  ]
  const persistent = { position: 'left' as const, always_expanded: true, top_layout: 'scroll' as const }
  const hover = { position: 'left' as const, always_expanded: false, top_layout: 'scroll' as const }
  const top = { position: 'top' as const, always_expanded: false, top_layout: 'scroll' as const }
  let width = 1280

  beforeEach(() => {
    width = 1280
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width })
  })

  it('常驻展开：读取本地收起偏好并上报，切换后写回并再次上报；切到悬停模式上报 false', async () => {
    window.localStorage.setItem(LEFT_NAV_COLLAPSED_STORAGE_KEY, 'true')
    const onPersistentExpansionChange = vi.fn()
    const { container, rerender } = render(Sidebar, { props: { items, activeId: null, navigation: persistent, onPersistentExpansionChange } })
    await flush()
    const aside = container.querySelector('.toc-sidebar') as HTMLElement
    // 挂载前按默认展开上报 true，挂载后读到本地收起偏好再上报 false
    expect(onPersistentExpansionChange.mock.calls.map((call) => call[0])).toEqual([true, false])
    expect(aside.classList.contains('expanded')).toBe(false)

    const toggle = screen.getByRole('button', { name: /分类导航$/ })
    const wasExpanded = aside.classList.contains('expanded')
    await fireEvent.click(toggle)
    await flush()
    expect(aside.classList.contains('expanded')).toBe(!wasExpanded)
    expect(onPersistentExpansionChange).toHaveBeenLastCalledWith(!wasExpanded)
    expect(window.localStorage.getItem(LEFT_NAV_COLLAPSED_STORAGE_KEY)).toBe(String(wasExpanded))
    const calls = onPersistentExpansionChange.mock.calls.length

    await rerender({ items: [...items] })
    await flush()
    expect(onPersistentExpansionChange).toHaveBeenCalledTimes(calls)

    await rerender({ navigation: hover })
    await flush()
    expect(onPersistentExpansionChange).toHaveBeenLastCalledWith(false)
    expect(container.querySelector('.toc-sidebar')?.classList.contains('persistent')).toBe(false)
  })

  it('悬停模式：鼠标移入展开、移出收起', async () => {
    const { container } = render(Sidebar, { props: { items, activeId: null, navigation: hover } })
    const aside = container.querySelector('.toc-sidebar') as HTMLElement
    expect(aside.classList.contains('expanded')).toBe(false)
    await fireEvent.mouseEnter(aside)
    expect(aside.classList.contains('expanded')).toBe(true)
    await fireEvent.mouseLeave(aside)
    expect(aside.classList.contains('expanded')).toBe(false)
  })

  it('移动端：按钮打开 / 遮罩关闭 / Escape 关闭；点子项导航后收起；切到顶部导航关闭', async () => {
    width = 500
    const onNavigate = vi.fn()
    const { container, rerender } = render(Sidebar, { props: { items, activeId: 'cat-11', navigation: hover, onNavigate } })
    await flush()
    const aside = () => container.querySelector('.toc-sidebar') as HTMLElement
    expect(aside().classList.contains('mobile-hidden')).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: '目录导航' }))
    expect(aside().classList.contains('mobile-hidden')).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: '关闭目录导航' }))
    expect(aside().classList.contains('mobile-hidden')).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: '目录导航' }))
    await fireEvent.keyDown(document, { key: 'Escape' })
    await flush()
    expect(aside().classList.contains('mobile-hidden')).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: '目录导航' }))
    await fireEvent.click(screen.getByTitle('编辑器'))
    expect(onNavigate).toHaveBeenCalledWith('cat-11')
    expect(aside().classList.contains('mobile-hidden')).toBe(true)

    await fireEvent.click(screen.getByRole('button', { name: '目录导航' }))
    await rerender({ navigation: top })
    await flush()
    await rerender({ navigation: hover })
    await flush()
    expect(aside().classList.contains('mobile-hidden')).toBe(true)
  })

  it('左侧导航：activeId 改到另一父级的子项时自动展开该父级，手动收起的不被重新展开', async () => {
    const twoParents = [
      ...items,
      { id: 'cat-3', categoryId: 3, title: '娱乐', icon: null, count: 1, children: [{ id: 'cat-31', categoryId: 31, title: '音乐', icon: null, count: 1 }] },
    ]
    const { rerender } = render(Sidebar, { props: { items: twoParents, activeId: 'cat-11', navigation: persistent } })
    expect(screen.getByTitle('编辑器')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '收起 常用工具 的子分类' }))
    expect(screen.queryByTitle('编辑器')).toBeNull()

    await rerender({ activeId: 'cat-31' })
    expect(screen.getByTitle('音乐')).toBeTruthy()
    expect(screen.queryByTitle('编辑器')).toBeNull()

    // 手动收起当前父级后，先离开到无父级的分类再回来，会重新展开
    await fireEvent.click(screen.getByRole('button', { name: '收起 娱乐 的子分类' }))
    expect(screen.queryByTitle('音乐')).toBeNull()
    await rerender({ activeId: 'cat-31' })
    expect(screen.queryByTitle('音乐')).toBeNull()
    await rerender({ activeId: 'cat-2' })
    await rerender({ activeId: 'cat-31' })
    expect(screen.getByTitle('音乐')).toBeTruthy()
  })

  it('顶部导航：挂载与分行切换后上报导航高度与底边', async () => {
    const onTopNavHeightChange = vi.fn()
    const onTopNavBottomChange = vi.fn()
    const { rerender } = render(Sidebar, { props: { items, activeId: null, navigation: top, onTopNavHeightChange, onTopNavBottomChange } })
    await flush()
    expect(onTopNavHeightChange).toHaveBeenCalled()
    expect(onTopNavBottomChange).toHaveBeenCalled()
    const calls = onTopNavHeightChange.mock.calls.length
    await rerender({ navigation: { ...top, top_layout: 'wrap' as const } })
    await flush()
    expect(onTopNavHeightChange.mock.calls.length).toBeGreaterThan(calls)
    expect(screen.getByTestId('top-navigation').classList.contains('wrap')).toBe(true)
  })

  it('顶部导航：鼠标拖动超过阈值后吞掉随后的一次点击', async () => {
    const onNavigate = vi.fn()
    const { container } = render(Sidebar, { props: { items, activeId: null, navigation: top, onNavigate } })
    const track = container.querySelector('.top-track') as HTMLElement
    Object.assign(track, { hasPointerCapture: () => false, setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
    await fireEvent(track, pointer('pointerdown', { pointerId: 1, clientX: 100 }))
    await fireEvent(track, pointer('pointermove', { pointerId: 1, clientX: 60 }))
    expect(track.classList.contains('dragging')).toBe(true)
    expect(track.setPointerCapture).toHaveBeenCalledWith(1)
    await fireEvent(track, pointer('pointerup', { pointerId: 1, clientX: 60 }))
    expect(track.classList.contains('dragging')).toBe(false)
    await fireEvent.click(screen.getByTitle('学习资料'))
    expect(onNavigate).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByTitle('学习资料'))
    expect(onNavigate).toHaveBeenCalledWith('cat-2')
  })
})

describe('SpotlightBookmarkIcon：文字回退与换书签', () => {
  it('无图标时显示文字图标，换书签后跟随', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    try {
      const { container, rerender } = render(SpotlightBookmarkIcon, { props: { bookmark: { ...bookmark, icon: null } } })
      const text = () => container.querySelector('.spotlight-option-icon')?.textContent?.trim()
      expect(container.querySelector('img')).toBeNull()
      const first = text()
      expect(first).toBeTruthy()
      await rerender({ bookmark: { ...bookmark, id: 8, title: 'Zed', icon: null } })
      expect(text()).not.toBe(first)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
