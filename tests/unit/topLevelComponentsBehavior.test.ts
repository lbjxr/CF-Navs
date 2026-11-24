// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import CategorySection from '../../src/components/CategorySection.svelte'
import SettingsPanel from '../../src/components/SettingsPanel.svelte'
import AdvancedSettingsSection from '../../src/components/settings/AdvancedSettingsSection.svelte'
import SettingsHomePreview from '../../src/components/settings/SettingsHomePreview.svelte'
import Admin from '../../src/views/Admin.svelte'
import Home from '../../src/views/Home.svelte'
import SectionFormHarness from '../helpers/uiLeaf/SectionFormHarness.svelte'
import { createSettingsFormState, type SettingsFormModel } from '../../src/lib/settingsForm'
import { DEFAULT_SETTINGS } from '../../worker/lib/settingsData'
import type { PublicBookmark, PublicCategory } from '../../shared/types'

// 代码审查三轮第 27 项（APP_SPLIT_PLAN 第 8j 步）：迁移前写成的行为基线。
// 层级 3–4 的 6 个顶层组件直接挂载（AdvancedSettingsSection 经 SectionFormHarness 以 `bind:form` 观察写回），
// 经 DOM、回调与 rerender 观察 `$:`、本地状态、懒加载与 `bind:` 往返的效果。
// 既有 adminSettingsBehavior / homeCategoryAggregation / homeCategoryFocus / homeSortToolbar /
// homeBookmarkIconAccess / appComponent / categoryCollapseBehavior 继续覆盖各自部分。
// 迁移为 runes 时本文件不应改动。

beforeEach(() => {
  localStorage.setItem('cf-navs:guide-seen', '1')
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
  Element.prototype.scrollIntoView = () => {}
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function flush(): Promise<void> {
  await tick()
  await tick()
}

function bookmark(id: number, categoryId: number, title: string, clicks = 0): PublicBookmark {
  return {
    id, category_id: categoryId, title, url: `https://${title.toLowerCase().replace(/\s+/g, '')}.example`, icon: title[0], icon_source: null,
    icon_background_color: null, icon_blob: null, icon_cached: false, description: null, description_mode: null, open_method: 1, sort: id, click_count: clicks,
  } as PublicBookmark
}

const category: PublicCategory = { id: 5, parent_id: null, title: '工具', icon: null, sort: 0 }

describe('CategorySection', () => {
  it('标题 / 计数 / 网格变量随 props 更新；displayTitle 优先', async () => {
    const { container, rerender } = render(CategorySection, { props: { category, bookmarks: [bookmark(1, 5, 'Alpha')], cardWidth: 200 } })
    expect(container.querySelector('h3')?.textContent).toBe('工具')
    expect(container.querySelector('.section-count')?.textContent).toBe('共 1 个站点')
    expect(container.querySelector('section')?.id).toBe('category-5')
    const grid = () => container.querySelector('.bookmark-grid') as HTMLElement
    expect(grid().getAttribute('style')).toContain('--card-min-width: 200px')
    expect(grid().getAttribute('style')).toContain('--bookmark-grid-gap: 18px')

    await rerender({ category, bookmarks: [bookmark(1, 5, 'Alpha'), bookmark(2, 5, 'Beta')], displayTitle: '本分类', cardStyle: 'icon', cardIconSize: 48 })
    expect(container.querySelector('h3')?.textContent).toBe('本分类')
    expect(container.querySelector('.section-count')?.textContent).toBe('共 2 个站点')
    expect(grid().getAttribute('style')).toContain('--bookmark-grid-gap: 22px 24px')
    expect(grid().classList.contains('is-icon-grid')).toBe(true)
  })

  it('操作区：新增书签带分类 id；可排序且受控时显示排序入口，进入排序后切换为保存 / 取消', async () => {
    const onAddBookmark = vi.fn()
    const onRequestSort = vi.fn()
    const onCancelSortSession = vi.fn()
    let resolveSave: () => void = () => {}
    const onSaveSortSession = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve }))
    const props = { category, bookmarks: [bookmark(1, 5, 'Alpha')], canAddBookmark: true, onAddBookmark, onRequestSort, onCancelSortSession, onSaveSortSession }
    const { rerender } = render(CategorySection, { props: { ...props, canSort: true } })
    expect(screen.queryByRole('button', { name: '排序' })).toBeNull()

    await rerender({ ...props, canSort: true, controlledSortMode: false })
    await fireEvent.click(screen.getByRole('button', { name: '新增书签' }))
    expect(onAddBookmark).toHaveBeenCalledWith(5)
    await fireEvent.click(screen.getByRole('button', { name: '排序' }))
    expect(onRequestSort).toHaveBeenCalledTimes(1)

    await rerender({ ...props, canSort: true, controlledSortMode: true })
    expect(screen.queryByRole('button', { name: '新增书签' })).toBeNull()
    expect(document.querySelector('.sort-hint')).not.toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '保存排序' }))
    await flush()
    expect(screen.getByRole('button', { name: '保存排序' }).textContent).toContain('保存中')
    expect((screen.getByRole('button', { name: '取消排序' }) as HTMLButtonElement).disabled).toBe(true)
    resolveSave()
    await flush()
    expect(screen.getByRole('button', { name: '保存排序' }).textContent).toContain('保存排序')
    await fireEvent.click(screen.getByRole('button', { name: '取消排序' }))
    expect(onCancelSortSession).toHaveBeenCalledTimes(1)

    await rerender({ ...props, canSort: true, controlledSortMode: true, showSortActions: false })
    expect(document.querySelector('.sort-session-label')?.textContent).toContain('拖动书签到其他分类')
  })

  it('空分类：排序中显示投放区，否则按 showEmpty 显示空态', async () => {
    const { container, rerender } = render(CategorySection, { props: { category, bookmarks: [] } })
    expect(container.querySelector('.empty-card')).not.toBeNull()
    await rerender({ category, bookmarks: [], showEmpty: false })
    expect(container.querySelector('.empty-card')).toBeNull()
    await rerender({ category, bookmarks: [], canSort: true, controlledSortMode: true })
    expect(container.querySelector('.empty-sort-drop-zone')).not.toBeNull()
  })

  it('新建子分类按钮与卡片描述模式（默认随 cardShowDescription）', async () => {
    const onCreateSubcategory = vi.fn()
    const described = { ...bookmark(1, 5, 'Alpha'), description: '一段描述' }
    const { container, rerender } = render(CategorySection, { props: { category, bookmarks: [described], onCreateSubcategory, cardShowDescription: false } })
    await fireEvent.click(screen.getByRole('button', { name: '新建子分类' }))
    expect(onCreateSubcategory).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('一段描述')
    await rerender({ category, bookmarks: [described], onCreateSubcategory, cardShowDescription: true, cardDescriptionMode: 'always' })
    expect(container.textContent).toContain('一段描述')
  })
})

function renderAdvanced(overrides: Partial<SettingsFormModel> = {}) {
  const form = createSettingsFormState({ ...DEFAULT_SETTINGS, site_title: 'X', ...overrides } as never)
  const seen: SettingsFormModel[] = []
  const view = render(SectionFormHarness, { props: { section: AdvancedSettingsSection, form, onForm: (next: SettingsFormModel) => seen.push(next) } })
  return { form, seen, latest: () => seen[seen.length - 1], ...view }
}

describe('AdvancedSettingsSection', () => {
  it('浅 / 深背景页签切换卡片主题；改背景经回调写回并把配色方案切为自定义', async () => {
    const { latest } = renderAdvanced({
      background_preset_id: 'aurora' as never,
      backgrounds: { light: { type: 'image', value: 'https://img.example/light.jpg', blur: 0, mask: 0.2, maskColor: '#000000' }, dark: { type: 'image', value: 'https://img.example/dark.jpg', blur: 0, mask: 0.2, maskColor: '#000000' } },
    } as never)
    expect(document.body.textContent).toContain('浅色模式背景')
    expect((screen.getByLabelText('浅色背景图片地址') as HTMLInputElement).value).toBe('https://img.example/light.jpg')
    await fireEvent.click(screen.getByRole('radio', { name: '深色模式' }))
    await flush()
    expect(document.body.textContent).toContain('深色模式背景')
    expect((screen.getByLabelText('深色背景图片地址') as HTMLInputElement).value).toBe('https://img.example/dark.jpg')
    await fireEvent.click(screen.getByRole('radio', { name: '纯色' }))
    await flush()
    expect(latest().backgrounds.dark.type).toBe('color')
    expect(latest().background_preset_id).toBe('custom')
  })

  it('背景值为空时显示提示；图床地址存在时上传按钮打开图床', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderAdvanced({
      image_host_url: 'https://img.example/',
      backgrounds: { light: { type: 'image', value: '', blur: 0, mask: 0.2, maskColor: '#000000' }, dark: { type: 'color', value: '#000000', blur: 0, mask: 0.2, maskColor: '#000000' } },
    } as never)
    expect(document.body.textContent).toContain('请填写浅色模式背景值')
    await fireEvent.click(screen.getByRole('button', { name: '打开图床上传 ↗' }))
    expect(open).toHaveBeenCalledWith('https://img.example/upload', '_blank', 'noopener,noreferrer')
  })

  it('尺寸输入经 fieldset 的 input 同步写回父表单', async () => {
    const { form, latest } = renderAdvanced()
    await fireEvent.input(document.getElementById('settings-card-width')!, { target: { value: '220' } })
    await flush()
    expect(latest().card_size.width).toBe(220)
    // syncForm 在 tick 后整体 clone 写回（不只是字段被就地改写）
    expect(latest()).not.toBe(form)
  })
})

const previewSettings = () => createSettingsFormState({ ...DEFAULT_SETTINGS, site_title: '预览标题', custom_css: 'body{color:red}</style>', most_visited_count: 1 } as never)

describe('SettingsHomePreview', () => {
  it('预览随 settings 更新：标题、自定义 CSS 转义、常用数量、自定义脚本提示', async () => {
    const { container, rerender } = render(SettingsHomePreview, { props: { settings: previewSettings() } })
    expect(container.textContent).toContain('预览标题')
    const srcdoc = () => container.querySelector('iframe')?.getAttribute('srcdoc') ?? ''
    expect(srcdoc()).toContain('body{color:red}<\\/style>')
    expect(screen.queryByTestId('custom-js-preview-notice')).toBeNull()
    await rerender({ settings: { ...previewSettings(), site_title: '新标题', custom_js: 'alert(1)' } })
    expect(container.textContent).toContain('新标题')
    expect(screen.getByTestId('custom-js-preview-notice')).toBeTruthy()
  })

  it('主题切换按钮改写 data-theme 与按下态', async () => {
    render(SettingsHomePreview, { props: { settings: previewSettings() } })
    const stage = screen.getByTestId('home-preview-stage')
    expect(stage.dataset.theme).toBe('light')
    await fireEvent.click(screen.getByTestId('preview-theme-dark'))
    expect(stage.dataset.theme).toBe('dark')
    expect(screen.getByTestId('preview-theme-dark').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('#111827')
  })
})

describe('SettingsPanel', () => {
  const baseValue = { ...DEFAULT_SETTINGS, site_title: 'CF-Navs' }

  it('value 刷新保留未保存的修改；只有干净表单才同步新内容', async () => {
    const { rerender } = render(SettingsPanel, { props: { value: baseValue, onSubmit: vi.fn() } })
    const title = () => screen.getByDisplayValue(/CF-Navs|改过|服务端新值/) as HTMLInputElement
    await fireEvent.input(title(), { target: { value: '改过' } })
    await flush()
    expect(document.body.textContent).toContain('有未保存更改')
    await rerender({ value: { ...baseValue }, onSubmit: vi.fn() })
    expect(title().value).toBe('改过')
    await rerender({ value: { ...baseValue, site_title: '服务端新值' }, onSubmit: vi.fn() })
    expect(title().value).toBe('改过')
    expect(document.body.textContent).toContain('有未保存更改')
    await fireEvent.input(title(), { target: { value: 'CF-Navs' } })
    await flush()
    expect(title().value).toBe('服务端新值')
    expect(document.body.textContent).toContain('配置已同步')
  })

  it('预览主题经 bind:theme 跨分区保持；预览跟随未保存的标题', async () => {
    const { rerender } = render(SettingsPanel, { props: { value: baseValue, onSubmit: vi.fn() } })
    await fireEvent.click(screen.getByTestId('preview-theme-dark'))
    await fireEvent.input(screen.getByDisplayValue('CF-Navs'), { target: { value: '预览中' } })
    await flush()
    expect(screen.getByTestId('settings-home-preview').textContent).toContain('预览中')
    const submenu = screen.getAllByRole('button').find((button) => button.querySelector('strong')?.textContent === '搜索设置')!
    await fireEvent.click(submenu)
    await flush()
    expect(screen.getByTestId('home-preview-stage').dataset.theme).toBe('dark')
    // 加载态会卸载预览；重新出现时主题仍取自面板经 bind:theme 保存的值
    await rerender({ value: baseValue, loading: true })
    await rerender({ value: baseValue, loading: false })
    expect(screen.getByTestId('home-preview-stage').dataset.theme).toBe('dark')
  })

  it('提交发送归一化后的表单（去首尾空白）', async () => {
    const onSubmit = vi.fn()
    render(SettingsPanel, { props: { value: baseValue, onSubmit } })
    await fireEvent.input(screen.getByDisplayValue('CF-Navs'), { target: { value: '  空白标题  ' } })
    await flush()
    await fireEvent.submit(document.getElementById('settings-form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].site_title).toBe('空白标题')
  })
})

describe('Admin', () => {
  it('切换标签通知外层；进入设置页懒加载设置面板并转交 props', async () => {
    const onSelectTab = vi.fn()
    const { container } = render(Admin, { props: { isAuthenticated: true, onSelectTab, settingsValue: { ...DEFAULT_SETTINGS, site_title: '后台标题' } as never } })
    const sidebar = container.querySelector('nav, aside') as HTMLElement
    await fireEvent.click(within(sidebar).getAllByRole('button').find((button) => button.textContent?.includes('设置'))!)
    expect(onSelectTab).toHaveBeenCalledWith('settings')
    await waitFor(() => expect(container.querySelector('.settings-panel')).not.toBeNull())
    expect((screen.getByDisplayValue('后台标题') as HTMLInputElement).value).toBe('后台标题')
  })

  it('打开分类编辑框时懒加载，并把图床地址与分类表单转交', async () => {
    const { rerender } = render(Admin, { props: { isAuthenticated: true, categories: [{ id: 1, parent_id: null, title: '父级' }] as never, settingsValue: { image_host_url: 'https://img.example' } as never } })
    expect(document.querySelector('[aria-labelledby="category-modal-title"]')).toBeNull()
    await rerender({ categoryModalOpen: true, categoryModalMode: 'edit', activeCategory: { id: 1, title: '父级', parent_id: null, icon: '' } })
    await waitFor(() => expect(document.querySelector('[aria-labelledby="category-modal-title"]')).not.toBeNull())
    expect(screen.getByText('编辑分类')).toBeTruthy()
    expect((screen.getByPlaceholderText('例如：常用工具') as HTMLInputElement).value).toBe('父级')
    expect(screen.getByTitle('打开图床上传图标')).toBeTruthy()
  })

  it('导入来源经 bind:importSource 在切换标签后保持', async () => {
    const { container } = render(Admin, { props: { isAuthenticated: true } })
    const tab = (label: string) => within(container.querySelector('nav, aside') as HTMLElement).getAllByRole('button').find((button) => button.textContent?.includes(label))!
    await fireEvent.click(tab('备份'))
    // 同 searchEngineSettingsSelect：测试类型环境里 HTMLSelectElement 只能经 unknown 收窄
    const select = document.getElementById('import-source') as unknown as HTMLSelectElement
    const other = Array.from(select.options).find((option) => option.value !== select.value)!.value
    await fireEvent.change(select, { target: { value: other } })
    await fireEvent.click(tab('分类'))
    await fireEvent.click(tab('备份'))
    expect((document.getElementById('import-source') as unknown as HTMLSelectElement).value).toBe(other)
  })
})

const homeCategories: PublicCategory[] = [
  { id: 1, parent_id: null, title: '开发', icon: null, sort: 0 },
  { id: 2, parent_id: null, title: '设计', icon: null, sort: 1 },
  { id: 3, parent_id: 2, title: '配色', icon: null, sort: 0 },
]
const childTab = () => document.getElementById('home-category-tab-3') as HTMLButtonElement
const childActive = () => childTab().classList.contains('active')
const homeBookmarks = [bookmark(11, 1, 'GitHub', 5), bookmark(12, 1, 'Svelte', 2), bookmark(21, 2, 'Figma', 1), bookmark(31, 3, 'Coolors', 0)]

describe('Home', () => {
  it('搜索输入防抖 120ms 后过滤；清空后恢复分组视图', async () => {
    vi.useFakeTimers()
    const { container } = render(Home, { props: { categories: homeCategories, bookmarks: homeBookmarks } })
    const input = screen.getByPlaceholderText('输入关键词搜索')
    await fireEvent.input(input, { target: { value: 'figma' } })
    await tick()
    expect(container.querySelector('.search-results')).toBeNull()
    vi.advanceTimersByTime(119)
    await tick()
    expect(container.querySelector('.search-results')).toBeNull()
    vi.advanceTimersByTime(1)
    await flush()
    const results = container.querySelector('.search-results') as HTMLElement
    expect(results.textContent).toContain('Figma')
    expect(results.textContent).not.toContain('GitHub')
    await fireEvent.input(input, { target: { value: '' } })
    vi.advanceTimersByTime(120)
    await flush()
    expect(container.querySelector('.search-results')).toBeNull()
    expect(container.querySelector('.root-category-list')).not.toBeNull()
  })

  it('经常访问按 most_visited_count；页面标题回落顺序；分组标签切换选中子分类', async () => {
    const { container, rerender } = render(Home, { props: { categories: homeCategories, bookmarks: homeBookmarks, settings: { most_visited_count: 2, site_title: '站点' } as never } })
    expect(document.title).toBe('站点')
    const mostVisited = container.querySelector('#category--1') as HTMLElement
    expect(within(mostVisited).getAllByRole('link').map((link) => link.textContent?.trim()).filter(Boolean)).toHaveLength(2)
    await fireEvent.click(childTab())
    await flush()
    expect(childActive()).toBe(true)
    expect(childTab().getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[data-home-root-id="2"]')?.textContent).toContain('Coolors')
    await rerender({ title: '外部标题' })
    expect(document.title).toBe('外部标题')
  })

  it('跨分类排序：进入后显示工具条，保存提交整理结果并退出；失败保留错误条直到关闭', async () => {
    const onReorganizeBookmarks = vi.fn().mockRejectedValueOnce(new Error('冲突')).mockResolvedValueOnce(undefined)
    const { container } = render(Home, { props: { categories: homeCategories, bookmarks: homeBookmarks, isAuthenticated: true, onReorganizeBookmarks } })
    const enterSort = () => fireEvent.click(within(container.querySelector('[data-home-root-id="1"]') as HTMLElement).getAllByRole('button', { name: '排序' })[0])
    await enterSort()
    await flush()
    expect(container.querySelector('.home-sort-bar')).not.toBeNull()
    expect(container.querySelectorAll('[data-home-root-id="2"] .category-section')).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', { name: '保存排序' }))
    await flush()
    expect(screen.getByRole('alert').textContent).toContain('冲突')
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await flush()
    expect(container.querySelector('.home-sort-bar')).toBeNull()

    await enterSort()
    await flush()
    await fireEvent.click(within(container.querySelector('.home-sort-bar') as HTMLElement).getByRole('button', { name: '保存排序' }))
    await flush()
    expect(onReorganizeBookmarks).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.home-sort-bar')).toBeNull()
  })

  it('focusCategoryId 只在变化且分类存在时聚焦一次', async () => {
    const { rerender } = render(Home, { props: { categories: homeCategories, bookmarks: homeBookmarks, focusCategoryId: 99 } })
    await flush()
    expect(childActive()).toBe(false)
    await rerender({ focusCategoryId: 3 })
    await waitFor(() => expect(childActive()).toBe(true))
    await fireEvent.click(document.querySelector('[data-home-root-id="2"] .scope-root-trigger')!)
    await flush()
    expect(childActive()).toBe(false)
    await rerender({ focusCategoryId: 3, title: '变化' })
    await flush()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(childActive()).toBe(false)
  })
})
