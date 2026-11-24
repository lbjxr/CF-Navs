// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import BookmarkCard from '../../src/components/BookmarkCard.svelte'
import BookmarkEditModal from '../../src/components/BookmarkEditModal.svelte'
import CategoryEditModal from '../../src/components/CategoryEditModal.svelte'
import SearchSpotlight from '../../src/components/SearchSpotlight.svelte'
import AdminTabContent from '../../src/components/admin/AdminTabContent.svelte'
import ThemeBackgroundCard from '../../src/components/settings/ThemeBackgroundCard.svelte'
import Toast from '../../src/components/Toast.svelte'
import SettingsProbe from '../helpers/level2/SettingsProbe.svelte'
import { loadBookmarkContextMenu } from '../../src/lib/lazyBookmarkContextMenu'
import { toastStore } from '../../src/lib/toast'
import type { BackgroundSetting, PublicBookmark, PublicCategory } from '../../shared/types'

// 代码审查三轮第 26 项（APP_SPLIT_PLAN 第 8i 步）：迁移前写成的行为基线。
// 层级 2 的 6 个组件与 Toast 直接挂载，经 DOM、回调与 rerender 观察 `$:` / 本地状态 / 窗口监听 / 派发的效果。
// 既有 bookmarkIconRecovery / bookmarkCardLocalIconCache / lazyBookmarkContextMenu / searchSpotlight /
// uiLeafComponentsBehavior / level1ComponentsBehavior 继续覆盖各自部分。
// 迁移为 runes 时本文件只允许随 ThemeBackgroundCard 的派发事件改为回调 prop 而改写对应订阅方式。

const fetchSiteMeta = vi.fn()
const iconifySearch = vi.fn()
vi.mock('../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, bookmarks: { ...actual.api.bookmarks, fetchSiteMeta: (...args: unknown[]) => fetchSiteMeta(...args) } },
    iconifyApi: { ...actual.iconifyApi, search: (...args: unknown[]) => iconifySearch(...args) },
  }
})
vi.mock('../../src/lib/dataService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/dataService')>()
  return { ...actual, recordBookmarkClick: vi.fn() }
})

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
  Element.prototype.scrollIntoView = () => {}
  // Toast 的 fly 过渡依赖 Element.animate；jsdom 没有，给一个下一轮宏任务即结束的替身。
  Element.prototype.animate = function () {
    const animation = { onfinish: null as null | (() => void), cancel() {}, currentTime: 0, effect: null }
    setTimeout(() => animation.onfinish?.(), 0)
    return animation as unknown as Animation
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchSiteMeta.mockReset()
  iconifySearch.mockReset()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

async function flush(): Promise<void> {
  await tick()
  await tick()
}

function makeBookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 7, category_id: 1, title: 'Card', url: 'https://card.example', icon: 'C', icon_source: null,
    icon_cached: false, icon_blob: null, icon_background_color: null, description: null, open_method: 1, sort: 0,
    ...overrides,
  } as PublicBookmark
}

describe('BookmarkCard', () => {
  it('详情卡与图标卡按 style / width / height 计算外壳样式，描述显示默认随 showDescription', async () => {
    const { container, rerender } = render(BookmarkCard, {
      props: { bookmark: makeBookmark({ description: '描述文字' }), width: 200, height: 64, showDescription: false },
    })
    const shell = container.querySelector('.bookmark-card-shell') as HTMLElement
    expect(shell.classList.contains('is-info')).toBe(true)
    expect(shell.getAttribute('style')).toContain('--card-configured-min-width: 200px')
    // The configured height belongs to the main card; a detail footer may extend the shell.
    expect((container.querySelector('a.bookmark-card') as HTMLElement).style.height).toBe('64px')
    expect(container.textContent).not.toContain('描述文字')

    await rerender({ bookmark: makeBookmark(), style: 'icon', iconSize: 48, showIconTitle: true })
    const iconShell = container.querySelector('.bookmark-card-shell') as HTMLElement
    expect(iconShell.classList.contains('is-icon')).toBe(true)
    expect(iconShell.getAttribute('style')).toMatch(/^width: \d+px;$/)
  })

  it('图标显示覆盖与 bookmark 变化重算卡片文字图标与 tooltip', async () => {
    const { container, rerender } = render(BookmarkCard, { props: { bookmark: makeBookmark({ title: 'Alpha', icon: 'A' }) } })
    expect(container.querySelector('a.bookmark-card')).not.toBeNull()
    await rerender({ bookmark: makeBookmark({ title: 'Beta', icon: 'B', description: 'desc' }) })
    expect(container.querySelector('.bookmark-card-shell')?.getAttribute('aria-label')).toBe('Beta')
  })

  it('预览与排序模式阻止跳转；open_method=3 打开内嵌弹层，Escape 经窗口监听关闭', async () => {
    const preview = render(BookmarkCard, { props: { bookmark: makeBookmark(), preview: true } })
    const previewClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    preview.container.querySelector('a.bookmark-card')!.dispatchEvent(previewClick)
    expect(previewClick.defaultPrevented).toBe(true)
    preview.unmount()

    const { container } = render(BookmarkCard, { props: { bookmark: makeBookmark({ open_method: 3, title: 'Modal' }) } })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    container.querySelector('a.bookmark-card')!.dispatchEvent(click)
    await flush()
    expect(click.defaultPrevented).toBe(true)
    expect(document.querySelector('.link-modal-backdrop')).not.toBeNull()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await flush()
    expect(document.querySelector('.link-modal-backdrop')).toBeNull()
  })

  it('右键打开菜单后点击窗口关闭；另一张卡打开菜单时本卡关闭', async () => {
    await loadBookmarkContextMenu()
    const onEdit = vi.fn()
    const first = render(BookmarkCard, { props: { bookmark: makeBookmark({ id: 1 }), canEdit: true, onEdit } })
    const second = render(BookmarkCard, { props: { bookmark: makeBookmark({ id: 2 }), canEdit: true, onEdit } })
    const menus = () => document.querySelectorAll('[data-testid="bookmark-context-edit"]').length

    await fireEvent.contextMenu(first.container.querySelector('a.bookmark-card')!)
    await flush()
    expect(menus()).toBe(1)
    expect(first.container.querySelector('.bookmark-card-shell')?.classList.contains('context-menu-open')).toBe(true)

    await fireEvent.contextMenu(second.container.querySelector('a.bookmark-card')!)
    await flush()
    expect(menus()).toBe(1)
    expect(first.container.querySelector('.context-menu-open')).toBeNull()
    expect(second.container.querySelector('.context-menu-open')).not.toBeNull()

    await fireEvent.click(document.body)
    await flush()
    expect(menus()).toBe(0)
  })

  it('排序模式的移动按钮：阻止 pointerdown / touchstart / click 冒泡，点击打开带移动的菜单', async () => {
    await loadBookmarkContextMenu()
    const onMoveBookmark = vi.fn()
    const outer = document.createElement('div')
    document.body.appendChild(outer)
    const seen: string[] = []
    for (const type of ['pointerdown', 'touchstart', 'click']) outer.addEventListener(type, () => seen.push(type))
    const { container } = render(BookmarkCard, {
      target: outer,
      props: { bookmark: makeBookmark({ title: 'Mover' }), sortMode: true, onMoveBookmark, moveCategories: [] },
    })
    const trigger = screen.getByRole('button', { name: '移动「Mover」' })
    await fireEvent.pointerDown(trigger)
    await fireEvent.touchStart(trigger, { touches: [{ clientX: 1, clientY: 1 }] })
    await fireEvent.click(trigger)
    await flush()
    expect(seen).toEqual([])
    expect(container.querySelector('.context-menu-open')).not.toBeNull()
    expect(document.querySelector('[role="menu"]')).not.toBeNull()
    outer.remove()
  })

  it('长按 500ms 打开菜单，移动超过 10px 取消；打开后 700ms 内的点击不跳转', async () => {
    await loadBookmarkContextMenu()
    vi.useFakeTimers()
    const onEdit = vi.fn()
    const { container } = render(BookmarkCard, { props: { bookmark: makeBookmark(), canEdit: true, onEdit } })
    const shell = container.querySelector('.bookmark-card-shell')!

    await fireEvent.touchStart(shell, { touches: [{ clientX: 10, clientY: 10 }] })
    await fireEvent.touchMove(shell, { touches: [{ clientX: 30, clientY: 10 }] })
    vi.advanceTimersByTime(600)
    await tick()
    expect(container.querySelector('.context-menu-open')).toBeNull()

    await fireEvent.touchStart(shell, { touches: [{ clientX: 10, clientY: 10 }] })
    vi.advanceTimersByTime(500)
    await tick()
    expect(container.querySelector('.context-menu-open')).not.toBeNull()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    container.querySelector('a.bookmark-card')!.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    await tick()
    expect(container.querySelector('.context-menu-open')).not.toBeNull()
  })
})

const treeCategories = [
  { id: 1, label: '常用', title: '常用', depth: 0, children: [] },
  { id: 2, label: '设计', title: '设计', depth: 0, children: [] },
] as never[]

describe('BookmarkEditModal', () => {
  it('打开时锁滚动、按 value 与首个分类初始化表单；关闭解锁', async () => {
    const { rerender } = render(BookmarkEditModal, { props: { open: true, mode: 'create', value: null, categories: treeCategories } })
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('button', { name: '选择所属分类' }).getAttribute('title')).toBe('常用')
    expect((screen.getByPlaceholderText('https://example.com') as HTMLInputElement).value).toBe('')

    await rerender({ open: false, mode: 'create', value: null, categories: treeCategories })
    expect(document.body.style.overflow).toBe('')
    await rerender({ open: true, mode: 'edit', value: { id: 9, title: '已有', url: 'https://github.com', category_id: 2 }, categories: treeCategories })
    expect((screen.getByPlaceholderText('例如：Svelte 官方网站') as HTMLInputElement).value).toBe('已有')
    expect(screen.getByRole('button', { name: '选择所属分类' }).getAttribute('title')).toBe('设计')
  })

  it('同内容的 value 新对象不重置用户输入；内容变化才重置', async () => {
    const value = { id: 9, title: '已有', url: 'https://github.com', category_id: 1 }
    const { rerender } = render(BookmarkEditModal, { props: { open: true, mode: 'edit', value, categories: treeCategories } })
    const title = screen.getByPlaceholderText('例如：Svelte 官方网站') as HTMLInputElement
    await fireEvent.input(title, { target: { value: '改过' } })
    await rerender({ open: true, mode: 'edit', value: { ...value }, categories: treeCategories })
    expect(title.value).toBe('改过')
    await rerender({ open: true, mode: 'edit', value: { ...value, title: '新值' }, categories: treeCategories })
    expect((screen.getByPlaceholderText('例如：Svelte 官方网站') as HTMLInputElement).value).toBe('新值')
  })

  it('输入链接即时生成图标候选；选 Logo 方案后标题变化同步更新图标并随提交', async () => {
    const onSubmit = vi.fn()
    render(BookmarkEditModal, { props: { open: true, mode: 'create', value: null, categories: treeCategories, onSubmit } })
    expect(screen.queryByTitle('Favicon.im')).toBeNull()
    await fireEvent.input(screen.getByPlaceholderText('https://example.com'), { target: { value: 'https://github.com' } })
    await flush()
    expect(screen.getByTitle('Favicon.im')).toBeTruthy()

    await fireEvent.click(screen.getByTitle('文字图标'))
    await flush()
    await fireEvent.input(screen.getByPlaceholderText('例如：Svelte 官方网站'), { target: { value: 'Hub' } })
    await flush()
    await fireEvent.submit(document.querySelector('form.modal-form')!)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.icon_source).toBe('logo_surf')
    expect(decodeURIComponent(payload.icon)).toContain('>Hub<')
  })

  it('Iconify：输入名称后防抖搜索并显示候选，选中后写入图标；无效名称报错，改动表单任一字段清除错误', async () => {
    iconifySearch.mockResolvedValue({ candidates: [{ name: 'mdi:home', collection: 'Material', url: 'https://api.iconify.design/mdi/home.svg', preview_url: '/api/iconify/mdi/home.svg' }] })
    const onSubmit = vi.fn()
    render(BookmarkEditModal, {
      props: { open: true, mode: 'edit', value: { id: 1, title: 'T', url: 'https://github.com', icon_source: 'iconify', icon: '' }, categories: treeCategories, onSubmit },
    })
    const name = screen.getByLabelText('Iconify 图标名')
    await fireEvent.input(name, { target: { value: 'home' } })
    await vi.waitFor(() => expect(iconifySearch).toHaveBeenCalledWith('home', expect.anything()))
    await vi.waitFor(() => expect(screen.getByTitle('mdi:home - Material')).toBeTruthy())
    await fireEvent.click(screen.getByTitle('mdi:home - Material'))
    await flush()
    await fireEvent.submit(document.querySelector('form.modal-form')!)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ icon_source: 'iconify' })
    expect(onSubmit.mock.calls[0][0].icon).toContain('mdi')

    await fireEvent.input(name, { target: { value: '!!' } })
    await flush()
    await fireEvent.click(screen.getByRole('button', { name: '使用 Iconify' }))
    await flush()
    const errorText = () => Array.from(document.querySelectorAll('.iconify-section .field-error')).map((node) => node.textContent).join('')
    expect(errorText()).not.toBe('')
    await fireEvent.click(document.querySelector('input[type="checkbox"]')!)
    await flush()
    expect(errorText()).toBe('')
  })

  it('新建时链接失焦且标题为空才自动取站点标题；取消在保存中被忽略', async () => {
    fetchSiteMeta.mockResolvedValue({ title: '自动标题' })
    const onCancel = vi.fn()
    const { rerender } = render(BookmarkEditModal, { props: { open: true, mode: 'create', value: null, categories: treeCategories, onCancel } })
    const url = screen.getByPlaceholderText('https://example.com')
    await fireEvent.input(url, { target: { value: 'https://svelte.dev' } })
    await fireEvent.blur(url)
    await vi.waitFor(() => expect((screen.getByPlaceholderText('例如：Svelte 官方网站') as HTMLInputElement).value).toBe('自动标题'))
    expect(fetchSiteMeta).toHaveBeenCalledTimes(1)

    await rerender({ open: true, mode: 'create', value: null, categories: treeCategories, onCancel, loading: true })
    await fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0])
    expect(onCancel).not.toHaveBeenCalled()
  })
})

const flatCategories = [
  { id: 1, parent_id: null, title: '父级' },
  { id: 2, parent_id: null, title: '当前' },
  { id: 3, parent_id: 2, title: '子级' },
]

describe('CategoryEditModal', () => {
  it('有子分类时禁用上级选择并提示；无子分类时可选', async () => {
    const { rerender } = render(CategoryEditModal, { props: { open: true, mode: 'edit', value: { id: 2, title: '当前', parent_id: null, icon: '' } as never, categories: flatCategories } })
    expect((screen.getByRole('button', { name: '选择上级分类' }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toContain('该分类包含子分类')
    await rerender({ open: true, mode: 'edit', value: { id: 1, title: '父级', parent_id: null, icon: '' } as never, categories: flatCategories })
    expect((screen.getByRole('button', { name: '选择上级分类' }) as HTMLButtonElement).disabled).toBe(false)
    expect(document.body.textContent).not.toContain('该分类包含子分类')
  })

  it('手输 Iconify 图标地址视为已确认，提交 Iconify 地址；手输文字图标显示预览并原样提交', async () => {
    const onSubmit = vi.fn()
    render(CategoryEditModal, { props: { open: true, mode: 'create', value: null, categories: flatCategories, onSubmit } })
    await fireEvent.input(screen.getByPlaceholderText('例如：常用工具'), { target: { value: '  工具  ' } })
    const icon = screen.getByPlaceholderText('例如：🧰 或 icon-tools')
    await fireEvent.input(icon, { target: { value: 'https://api.iconify.design/mdi/home.svg' } })
    await flush()
    expect(screen.getByRole('button', { name: '使用 Iconify' }).getAttribute('aria-pressed')).toBe('true')
    await fireEvent.submit(document.querySelector('form.modal-form')!)
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ title: '工具', icon: expect.stringContaining('mdi') }))

    await fireEvent.input(icon, { target: { value: '🧰' } })
    await flush()
    expect(screen.getByRole('button', { name: '使用 Iconify' }).getAttribute('aria-pressed')).toBe('false')
    await fireEvent.submit(document.querySelector('form.modal-form')!)
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ icon: '🧰' }))
  })

  it('打开时按名称防抖搜索 Iconify；重开重置表单与错误', async () => {
    iconifySearch.mockResolvedValue({ candidates: [] })
    const { rerender } = render(CategoryEditModal, { props: { open: true, mode: 'create', value: null, categories: flatCategories } })
    await fireEvent.input(screen.getByLabelText('Iconify 图标名'), { target: { value: 'star' } })
    await vi.waitFor(() => expect(iconifySearch).toHaveBeenCalledWith('star', expect.anything()))
    await fireEvent.input(screen.getByPlaceholderText('例如：常用工具'), { target: { value: '临时' } })
    await rerender({ open: false, mode: 'create', value: null, categories: flatCategories })
    await rerender({ open: true, mode: 'create', value: null, categories: flatCategories })
    expect((screen.getByPlaceholderText('例如：常用工具') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Iconify 图标名') as HTMLInputElement).value).toBe('')
  })
})

const spotCategories: PublicCategory[] = [{ id: 1, title: '工具', parent_id: null, icon: null, sort: 0 } as PublicCategory]

describe('SearchSpotlight', () => {
  it('打开时锁滚动并聚焦输入框，关闭时解锁、还原焦点；重开清空查询', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const bookmarks = [makeBookmark({ id: 1, title: 'Alpha', click_count: 2 } as never)]
    const { rerender } = render(SearchSpotlight, { props: { open: false, bookmarks, categories: spotCategories } })
    await rerender({ open: true, bookmarks, categories: spotCategories })
    await flush()
    const input = screen.getByRole('combobox') as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect(document.body.style.overflow).toBe('hidden')
    await fireEvent.input(input, { target: { value: 'alp' } })

    await rerender({ open: false, bookmarks, categories: spotCategories })
    await flush()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
    await rerender({ open: true, bookmarks, categories: spotCategories })
    await flush()
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('')
    opener.remove()
  })

  it('结果变少时高亮夹回 0；鼠标移入切换高亮', async () => {
    const many = Array.from({ length: 5 }, (_, i) => makeBookmark({ id: i + 1, title: `Item${i}`, click_count: 10 - i } as never))
    const { rerender } = render(SearchSpotlight, { props: { open: true, bookmarks: many, categories: spotCategories } })
    await flush()
    const input = screen.getByRole('combobox')
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'End' })
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-4')
    await rerender({ open: true, bookmarks: many.slice(0, 2), categories: spotCategories })
    await flush()
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-0')
    await fireEvent.mouseEnter(screen.getAllByRole('option')[1])
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-1')
  })

  it('结果行副标题显示分类名，无分类时回落为链接', async () => {
    const bookmarks = [makeBookmark({ id: 1, title: 'InCat', category_id: 1, click_count: 3 } as never), makeBookmark({ id: 2, title: 'NoCat', category_id: 99, url: 'https://nocat.example', click_count: 1 } as never)]
    render(SearchSpotlight, { props: { open: true, bookmarks, categories: spotCategories } })
    await flush()
    const subs = Array.from(document.querySelectorAll('.spotlight-option-sub')).map((node) => node.textContent)
    expect(subs).toEqual(['工具', 'https://nocat.example'])
  })
})

describe('AdminTabContent', () => {
  it('按 activeTab 切换面板，设置页把 props 转交懒加载的设置组件', async () => {
    const onSubmitSettings = vi.fn()
    const { container, rerender } = render(AdminTabContent, { props: { activeTab: 'settings', settingsPanelComponent: null } })
    expect(container.textContent).toContain('Loading settings...')
    await rerender({ activeTab: 'settings', settingsPanelComponent: SettingsProbe as never, settingsValue: { site_title: 'X' } as never, settingsLoading: true, settingsSaving: false, settingsError: '出错', onSubmitSettings })
    const probe = container.querySelector('[data-testid="settings-probe"]') as HTMLElement
    expect(probe.dataset.loading).toBe('true')
    expect(probe.dataset.error).toBe('出错')
    expect(probe.dataset.title).toBe('X')
    await fireEvent.click(probe)
    expect(onSubmitSettings).toHaveBeenCalledWith({ ok: true })

    await rerender({ activeTab: 'backup' })
    expect(container.querySelector('#import-source')).not.toBeNull()
    await rerender({ activeTab: 'analytics' })
    expect(container.querySelector('.admin-content')?.children.length).toBeGreaterThan(0)
    expect(container.querySelector('#import-source')).toBeNull()
  })
})

describe('ThemeBackgroundCard', () => {
  it('切换背景类型时按主题默认值归一化并派发；新 background prop 整体替换本地状态', async () => {
    const background: BackgroundSetting = { type: 'image', value: 'https://img.example/a.jpg', blur: 0, mask: 0.2, maskColor: '#000000' }
    const onChange = vi.fn()
    const view = render(ThemeBackgroundCard, {
      props: { theme: 'dark', background, onchange: onChange },
    })
    expect(document.body.textContent).toContain('深色模式背景')
    expect(document.body.textContent).toContain('Dark')
    await fireEvent.click(screen.getByRole('radio', { name: '纯色' }))
    await flush()
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'color' }))
    expect(onChange.mock.calls.at(-1)![0].value).toMatch(/^#|rgb/)
    expect(screen.getByLabelText('深色模式背景颜色值')).toBeTruthy()

    await view.rerender({ theme: 'light', background: { ...background, type: 'gradient', value: 'linear-gradient(135deg, #111111, #222222)' } })
    await flush()
    expect(document.body.textContent).toContain('浅色模式背景')
    expect(screen.getByLabelText('起始颜色')).toBeTruthy()
  })

  it('valid=false 显示提示；字段写回后派发的是拷贝而不是原对象', async () => {
    const background: BackgroundSetting = { type: 'image', value: '', blur: 0, mask: 0.2, maskColor: '#000000' }
    const onChange = vi.fn()
    render(ThemeBackgroundCard, {
      props: { theme: 'light', background, valid: false, onchange: onChange },
    })
    expect(document.body.textContent).toContain('请填写浅色模式背景值')
    await fireEvent.input(screen.getByLabelText('浅色背景图片地址'), { target: { value: 'https://x.example/b.png' } })
    await flush()
    const sent = onChange.mock.calls.at(-1)![0]
    expect(sent.value).toBe('https://x.example/b.png')
    expect(sent).not.toBe(background)
  })
})

describe('Toast', () => {
  it('随 toastStore 渲染通知，点击关闭移除', async () => {
    const { container } = render(Toast)
    expect(container.querySelector('.toast-container')).toBeNull()
    const id = toastStore.addToast('已保存', 'success', { duration: null })
    await flush()
    expect(container.querySelector('.toast-item.toast-success')?.textContent).toContain('已保存')
    toastStore.addToast('失败', 'error', { duration: null })
    await flush()
    expect(container.querySelectorAll('.toast-item')).toHaveLength(2)
    await fireEvent.click(container.querySelectorAll('.toast-dismiss')[0])
    await new Promise((resolve) => setTimeout(resolve, 300))
    await flush()
    expect(Array.from(container.querySelectorAll('.toast-message')).map((node) => node.textContent)).toEqual(['失败'])
    toastStore.dismissToast(id)
  })
})
