// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import AnalyticsPanel from '../../src/components/admin/AnalyticsPanel.svelte'
import BookmarkListPanel from '../../src/components/admin/BookmarkListPanel.svelte'
import CategoryListPanel from '../../src/components/admin/CategoryListPanel.svelte'
import BackgroundSettingsSection from '../../src/components/settings/BackgroundSettingsSection.svelte'
import BasicSettingsSection from '../../src/components/settings/BasicSettingsSection.svelte'
import CardSettingsSection from '../../src/components/settings/CardSettingsSection.svelte'
import CategoryDisplaySettingsSection from '../../src/components/settings/CategoryDisplaySettingsSection.svelte'
import HeroSettingsSection from '../../src/components/settings/HeroSettingsSection.svelte'
import NavigationSettingsSection from '../../src/components/settings/NavigationSettingsSection.svelte'
import SearchEngineSettingsSection from '../../src/components/settings/SearchEngineSettingsSection.svelte'
import SectionFormHarness from '../helpers/uiLeaf/SectionFormHarness.svelte'
import { createSettingsFormState, type SettingsFormModel } from '../../src/lib/settingsForm'

// 代码审查三轮第 25 项（APP_SPLIT_PLAN 第 8h 步）：迁移前写成的行为基线。
// admin/ 三个面板直接挂载、以 rerender 推送新数据；七个设置分区经 tests/helpers/uiLeaf/SectionFormHarness
// （以 SettingsPanel 的方式 `bind:form` 的 legacy 替身）观察写回父表单的每一份新 form。
// 既有 adminEmptyState / adminBookmarkBatchBehavior / adminMobileTruncation / adminIconAccess /
// categoryCollapseBehavior / adminSettingsBehavior / searchEngineSettingsSelect / uiLeafComponentsBehavior 继续覆盖各自部分。
// 迁移为 runes 时本文件不应改动。

const checkHealth = vi.fn()
vi.mock('../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, bookmarks: { ...actual.api.bookmarks, checkHealth: (...args: unknown[]) => checkHealth(...args) } },
  }
})

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
  checkHealth.mockReset()
})

async function flush(): Promise<void> {
  await tick()
  await tick()
}

const categories = [
  { id: 1, title: '常用工具', parent_id: null, is_private: false, sort: 1 },
  { id: 2, title: '设计资源', parent_id: null, is_private: false, sort: 2 },
  { id: 3, title: '图标', parent_id: 2, is_private: false, sort: 1 },
  { id: 4, title: '配色', parent_id: 2, is_private: false, sort: 2 },
]

function bookmark(id: number, categoryId: number, title: string, clicks = 0) {
  return { id, category_id: categoryId, title, url: `https://${title.toLowerCase()}.example.com`, is_private: false, sort: id, click_count: clicks, open_method: 'new_tab', icon: null, description: '' }
}

const manyBookmarks = (count: number, clicks = (i: number) => i) =>
  Array.from({ length: count }, (_, i) => bookmark(i + 1, 1, `Site${String(i + 1).padStart(2, '0')}`, clicks(i)))

describe('AnalyticsPanel', () => {
  it('统计与排行：按点击降序、最多 20 条且只含有点击的书签', () => {
    const bookmarks = manyBookmarks(25, (i) => (i < 22 ? i + 1 : 0))
    const { container } = render(AnalyticsPanel, { props: { bookmarks, categories } })
    const scrollRegion = screen.getByRole('region', { name: '最常访问 Top 20' })
    expect(scrollRegion.tabIndex).toBe(0)
    scrollRegion.focus()
    expect(document.activeElement).toBe(scrollRegion)
    const ranks = Array.from(container.querySelectorAll('.top-item strong')).map((node) => node.textContent)
    expect(ranks).toHaveLength(20)
    expect(ranks[0]).toBe('Site22')
    expect(ranks[19]).toBe('Site03')
    expect(container.querySelector('.admin-status-panel')?.textContent).toContain(String((22 * 23) / 2))
    expect(container.querySelector('.admin-status-panel')?.textContent).toMatch(/22\s*\/ 25/)
    expect(container.querySelector('.top-item .progress-bar')?.getAttribute('style')).toContain('width: 100%')
  })

  it('零访问分页：翻页、数据缩减后页码夹回范围', async () => {
    const zero = manyBookmarks(23, () => 0)
    const { container, rerender } = render(AnalyticsPanel, { props: { bookmarks: zero, categories } })
    expect(screen.getByRole('region', { name: '最常访问 Top 20' }).hasAttribute('tabindex')).toBe(false)
    const names = () => Array.from(container.querySelectorAll('.zero-item strong')).map((node) => node.getAttribute('title'))
    expect(names()[0]).toBe('Site01')
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(names()).toEqual(['Site21', 'Site22', 'Site23'])
    expect((screen.getByRole('button', { name: '下一页' }) as HTMLButtonElement).disabled).toBe(true)

    await rerender({ bookmarks: zero.slice(0, 12) })
    expect(names()).toEqual(['Site11', 'Site12'])
    await fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(names()[0]).toBe('Site01')
  })
})

function renderBookmarks(bookmarks: ReturnType<typeof bookmark>[], extra: Record<string, unknown> = {}) {
  return render(BookmarkListPanel, { props: { isAuthenticated: true, categories, bookmarks, ...extra } })
}

const rowTitles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr')).map((row) => row.querySelector('[title]')?.getAttribute('title'))

describe('BookmarkListPanel', () => {
  it('搜索过滤并回到第一页；排序表头三态循环', async () => {
    const list = manyBookmarks(15)
    const { container } = renderBookmarks(list)
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('2 / 2')).toBeTruthy()

    await fireEvent.input(screen.getByTestId('admin-bookmark-search'), { target: { value: 'Site' } })
    expect(screen.getByText('1 / 2')).toBeTruthy()
    await fireEvent.input(screen.getByTestId('admin-bookmark-search'), { target: { value: 'Site1' } })
    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(6)

    await fireEvent.input(screen.getByTestId('admin-bookmark-search'), { target: { value: '' } })
    const titleSort = () => screen.getByRole('button', { name: /^标题，/ })
    const titleHeader = () => titleSort().closest('th') as HTMLElement
    // 表头按钮的 aria-label 由 sortButtonLabel(...) 生成；legacy 下该调用只在挂载时求值（见 CHANGELOG 第 25 项），
    // 这里只钉初始文案与 aria-sort / 实际排序结果。
    expect(titleSort().getAttribute('aria-label')).toContain('当前未排序')
    await fireEvent.click(titleSort())
    expect(titleHeader().getAttribute('aria-sort')).toBe('ascending')
    expect(rowTitles(container)[0]).toBe('Site01')
    await fireEvent.click(titleSort())
    expect(titleHeader().getAttribute('aria-sort')).toBe('descending')
    expect(rowTitles(container)[0]).toBe('Site15')
    await fireEvent.click(titleSort())
    expect(titleHeader().getAttribute('aria-sort')).toBe('none')
    expect(rowTitles(container)[0]).toBe('Site01')
  })

  it('数据缩减后页码夹回范围；被删掉的书签从选择中剔除', async () => {
    const list = manyBookmarks(15)
    const { rerender } = renderBookmarks(list)
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择书签 Site01' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择书签 Site02' }))
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: '批量书签操作' }).textContent).toContain('已选 2 项')

    await rerender({ bookmarks: list.slice(1, 9) })
    await flush()
    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: '批量书签操作' }).textContent).toContain('已选 1 项')
  })

  it('全选当前页与半选态；跨页选择摘要', async () => {
    renderBookmarks(manyBookmarks(15))
    const all = screen.getByRole('checkbox', { name: '全选当前页' }) as HTMLInputElement
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择书签 Site03' }))
    expect(all.indeterminate).toBe(true)
    await fireEvent.click(all)
    expect(all.checked).toBe(true)
    expect(all.indeterminate).toBe(false)
    expect(screen.getByRole('toolbar', { name: '批量书签操作' }).textContent).toContain('已选 10 项（跨 1 页）')
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择书签 Site11' }))
    expect(screen.getByRole('toolbar', { name: '批量书签操作' }).textContent).toContain('已选 11 项（跨 2 页）')
    await fireEvent.input(screen.getByTestId('admin-bookmark-search'), { target: { value: 'nomatch' } })
    expect(screen.getByRole('toolbar', { name: '批量书签操作' }).textContent).toContain('（当前筛选外仍保留）')
  })

  it('排序模式：进入时清空搜索，保存把当前顺序交给回调后退出；取消直接退出', async () => {
    const onSortBookmarks = vi.fn()
    renderBookmarks(manyBookmarks(3), { onSortBookmarks })
    await fireEvent.input(screen.getByTestId('admin-bookmark-search'), { target: { value: 'Site0' } })
    await fireEvent.click(screen.getByRole('button', { name: '排序' }))
    expect((screen.getByTestId('admin-bookmark-search') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('toolbar', { name: '排序操作' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '保存排序' }))
    await flush()
    expect(onSortBookmarks).toHaveBeenCalledWith([1, 2, 3])
    expect(screen.queryByRole('toolbar', { name: '排序操作' })).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: '排序' }))
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('toolbar', { name: '排序操作' })).toBeNull()
    expect(onSortBookmarks).toHaveBeenCalledTimes(1)
  })

  it('链接健康检测：分批调用、显示进度与结果', async () => {
    let release!: () => void
    checkHealth
      .mockImplementationOnce(async (ids: number[]) => ids.map((id) => ({ id, status: 200, ok: true })))
      .mockImplementationOnce((ids: number[]) => new Promise((resolve) => { release = () => resolve(ids.map((id) => ({ id, status: 404, ok: false }))) }))
    const { container } = renderBookmarks(manyBookmarks(12))
    await fireEvent.click(screen.getByRole('button', { name: '检测链接健康' }))
    await vi.waitFor(() => expect(screen.getByText('正在检测 (10/12)')).toBeTruthy())
    expect(checkHealth.mock.calls[0][0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(container.querySelector('tbody tr')?.textContent).toContain('200')
    release()
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '检测链接健康' })).toBeTruthy())
    expect(checkHealth.mock.calls[1][0]).toEqual([11, 12])
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(container.querySelector('tbody tr')?.textContent).toContain('404')
  })

  it('批量移动成功后清空选择并关闭弹层', async () => {
    const onBatchMoveBookmarks = vi.fn()
    renderBookmarks(manyBookmarks(3), { onBatchMoveBookmarks })
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择书签 Site01' }))
    await fireEvent.click(screen.getByRole('button', { name: '移动到分类' }))
    const dialog = screen.getByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('radio', { name: /插入到顶部/ }))
    await fireEvent.click(within(dialog).getByRole('button', { name: '确认移动' }))
    await flush()
    expect(onBatchMoveBookmarks).toHaveBeenCalledTimes(1)
    expect(onBatchMoveBookmarks.mock.calls[0][0]).toMatchObject({ position: 'start' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('toolbar', { name: '批量书签操作' })).toBeNull()
  })
})

describe('CategoryListPanel', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `分类${String(i + 1).padStart(2, '0')}`, parent_id: null, is_private: false, sort: i + 1 }))

  it('分页与数据缩减后夹回；被删掉的分类从选择中剔除', async () => {
    const { rerender } = render(CategoryListPanel, { props: { isAuthenticated: true, categories: many, bookmarks: [] } })
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择分类 分类01' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '选择分类 分类02' }))
    expect(screen.getByRole('button', { name: '删除已选 (2)' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('分类11')).toBeTruthy()

    await rerender({ categories: many.slice(1, 8) })
    await flush()
    expect(screen.getByText('分类02')).toBeTruthy()
    expect(screen.getByText('1 / 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: '删除已选 (1)' })).toBeTruthy()
  })

  it('全选当前页；批量删除把选中 id 交给回调', async () => {
    const onBatchDeleteCategories = vi.fn()
    render(CategoryListPanel, { props: { isAuthenticated: true, categories, bookmarks: [], onBatchDeleteCategories } })
    await fireEvent.click(screen.getByRole('checkbox', { name: '全选当前页' }))
    await fireEvent.click(screen.getByRole('button', { name: /删除已选/ }))
    expect([...onBatchDeleteCategories.mock.calls[0][0]].sort()).toEqual([1, 2, 3, 4])
    await fireEvent.click(screen.getByRole('button', { name: '清除选择' }))
    expect(screen.getByRole('button', { name: '删除已选 (0)' })).toBeTruthy()
  })

  it('一级与子级排序：保存时带上父级 id；取消回到列表', async () => {
    const onSortCategories = vi.fn()
    render(CategoryListPanel, { props: { isAuthenticated: true, categories, bookmarks: [], onSortCategories } })
    await fireEvent.click(screen.getByTestId('admin-category-sort-button'))
    expect(screen.getByRole('toolbar', { name: '排序操作' }).textContent).toContain('一级分类')
    await fireEvent.click(screen.getByRole('button', { name: '保存排序' }))
    await flush()
    expect(onSortCategories).toHaveBeenLastCalledWith(null, [1, 2])

    // 只有「设计资源」有两个以上子分类，它的子级排序按钮是除顶部按钮外唯一的「排序」按钮
    const childSort = screen.getAllByRole('button', { name: /排序/ }).filter((button) => button !== screen.getByTestId('admin-category-sort-button'))
    expect(childSort).toHaveLength(1)
    await fireEvent.click(childSort[0])
    expect(screen.getByRole('toolbar', { name: '排序操作' }).textContent).toContain('设计资源')
    await fireEvent.click(screen.getByRole('button', { name: '保存排序' }))
    await flush()
    expect(onSortCategories).toHaveBeenLastCalledWith(2, [3, 4])

    await fireEvent.click(screen.getByTestId('admin-category-sort-button'))
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('toolbar', { name: '排序操作' })).toBeNull()
  })
})

function renderSection(section: unknown, overrides: Partial<SettingsFormModel> = {}, extra: Record<string, unknown> = {}) {
  const form = createSettingsFormState(overrides)
  const seen: SettingsFormModel[] = []
  const view = render(SectionFormHarness, { props: { section, form, onForm: (next: SettingsFormModel) => seen.push(next), ...extra } })
  return { form, seen, latest: () => seen[seen.length - 1], ...view }
}

describe('设置分区经 legacy 父组件 bind:form 写回', () => {
  it('Card：描述策略决定 card_show_description，并随风格切换显示极简标题开关', async () => {
    // 挂载时即按描述策略校正（此时还没有任何 clone）
    const { latest, form } = renderSection(CardSettingsSection, { card_style: 'info', card_description_mode: 'always', card_show_description: false })
    await flush()
    expect(form.card_show_description).toBe(true)
    expect(latest().card_show_description).toBe(true)
    await fireEvent.click(screen.getByRole('radio', { name: '隐藏' }))
    await flush()
    expect(latest().card_description_mode).toBe('hidden')
    expect(latest().card_show_description).toBe(false)
    await fireEvent.click(screen.getByRole('radio', { name: /始终显示/ }))
    await flush()
    expect(latest().card_show_description).toBe(true)

    await fireEvent.click(screen.getByRole('radio', { name: /极简风格/ }))
    await flush()
    expect(latest().card_style).toBe('icon')
    expect(screen.getByRole('switch', { name: '显示极简卡片标题' })).toBeTruthy()
  })

  it('Basic：站点标题输入、主题单选写回；saving 禁用整个分区', async () => {
    const { latest, rerender } = renderSection(BasicSettingsSection, { site_title: '旧站点', theme: 'auto' })
    const title = screen.getByDisplayValue('旧站点') as HTMLInputElement
    await fireEvent.input(title, { target: { value: '新站点' } })
    await flush()
    expect(latest().site_title).toBe('新站点')
    const dark = screen.getAllByRole('radio').find((node) => (node as HTMLInputElement).value === 'dark') as HTMLInputElement
    await fireEvent.click(dark)
    await flush()
    expect(latest().theme).toBe('dark')

    await rerender({ saving: true })
    expect((title.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
  })

  it('Hero：开关与最多访问数量写回', async () => {
    const { latest } = renderSection(HeroSettingsSection, { most_visited_count: 8, search_box_show: true })
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '12' } })
    await flush()
    expect(latest().most_visited_count).toBe(12)
    await fireEvent.click(screen.getByRole('switch', { name: '显示搜索框' }))
    await flush()
    expect(latest().search_box_show).toBe(false)
    expect(latest().most_visited_count).toBe(12)
  })

  it('Navigation：位置单选切换左右专属开关的可用性；常驻展开写回；边距写回', async () => {
    const { latest } = renderSection(NavigationSettingsSection, { navigation: { position: 'left', always_expanded: false, top_layout: 'scroll' } })
    const always = () => screen.getByRole('switch', { name: '左侧导航始终展开' }) as HTMLButtonElement
    const wrap = () => screen.getByRole('switch', { name: '顶部分类分行显示' }) as HTMLButtonElement
    expect(always().disabled).toBe(false)
    expect(wrap().disabled).toBe(true)
    await fireEvent.click(always())
    await flush()
    expect(latest().navigation.always_expanded).toBe(true)

    await fireEvent.click(screen.getByRole('radio', { name: '顶部固定' }))
    await flush()
    expect(latest().navigation.position).toBe('top')
    expect(always().disabled).toBe(true)
    expect(wrap().disabled).toBe(false)
    expect(screen.getByRole('radio', { name: '顶部固定' }).closest('label')?.classList.contains('active')).toBe(true)

    await fireEvent.input(screen.getByRole('slider', { name: '桌面左右边距' }), { target: { value: '24' } })
    await flush()
    expect(latest().content_layout.margin_x).toBe(24)
  })

  it('Background：强调色写回（预设整套写回见 uiLeafComponentsBehavior）', async () => {
    const { latest } = renderSection(BackgroundSettingsSection, {})
    const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    await fireEvent.input(inputs[0], { target: { value: '#123456' } })
    await flush()
    expect(latest().custom_accent_color).toBe('#123456')
  })

  it('CategoryDisplay：标题颜色与字号写回', async () => {
    const { latest } = renderSection(CategoryDisplaySettingsSection, {})
    const sliders = screen.getAllByRole('slider')
    await fireEvent.input(sliders[0], { target: { value: '19' } })
    await flush()
    expect(latest().category_display.root_font_size).toBe(19)
    const colorInputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[]
    await fireEvent.input(colorInputs[0], { target: { value: '#abcdef' } })
    await flush()
    expect(latest().category_display.root_title_color).toBe('#abcdef')
  })

  it('SearchEngine：增删引擎、删除当前默认引擎时回落到第一个、改名写回', async () => {
    const engines = [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
    ]
    const { latest } = renderSection(SearchEngineSettingsSection, { search_engine: { current: 'Bing', engines } })
    await fireEvent.click(screen.getByRole('button', { name: '+ 添加搜索引擎' }))
    await flush()
    expect(latest().search_engine.engines).toHaveLength(3)
    expect(latest().search_engine.engines[2].url_template).toBe('https://example.com/search?q={q}')

    const removes = screen.getAllByRole('button', { name: /删除/ })
    await fireEvent.click(removes[1])
    await flush()
    expect(latest().search_engine.engines.map((engine) => engine.name)).toEqual(['Google', ''])
    expect(latest().search_engine.current).toBe('Google')

    const name = screen.getAllByPlaceholderText('引擎名称 (如 Google)')[1] as HTMLInputElement
    await fireEvent.input(name, { target: { value: 'DuckDuckGo' } })
    await flush()
    expect(latest().search_engine.engines[1].name).toBe('DuckDuckGo')
    expect(Array.from(document.querySelectorAll('select option')).map((option) => option.textContent)).toEqual(['Google', 'DuckDuckGo'])
  })
})
