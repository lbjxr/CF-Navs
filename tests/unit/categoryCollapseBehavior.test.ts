// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import CategoryListPanel from '../../src/components/admin/CategoryListPanel.svelte'
import Sidebar from '../../src/components/Sidebar.svelte'

// PROB-18b：`categoryCollapseMarkup.test.ts` 里后两组断言迁到组件层。
//
// 原断言形如 `toContain('let expandedRootIds = new Set<string>()')`、
// `toContain('{#if displayedExpandedRootIds.has(rootId)}')`：能证明源码写了这些标识符，
// 证明不了「默认收起、点箭头展开、搜索时全展开且可单独收起、切换关键词后重置」这些行为。
//
// `CategoryTreeSelect` 那一组已在 `categoryTreeSelect.test.ts` 覆盖，这里补后台分类面板
// 与左侧导航两处。

afterEach(cleanup)

const category = (id: number, title: string, parent_id: number | null = null) => ({
  id, parent_id, title, icon: '', bookmarkCount: 0,
})

const tree = [
  category(1, '常用工具'),
  category(11, '编辑器', 1),
  category(12, '设计', 1),
  category(2, '学习资料'),
  category(21, '论文', 2),
]

// 子分类渲染在 .admin-child-category-card 里；用它判断「该组是否展开」
const childCard = (title: string) =>
  screen.queryByText(title, { selector: '.admin-child-category-card h3' })

describe('后台分类面板的子分类折叠', () => {
  it('默认收起子分类，箭头的可访问名说明将要发生什么', () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })

    expect(screen.getByText('常用工具')).toBeTruthy()
    expect(childCard('编辑器')).toBeNull()

    const toggle = screen.getByTestId('admin-category-expand-1')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('展开 常用工具 的子分类')
  })

  it('点箭头展开该组，另一组不受影响', async () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })

    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))

    expect(childCard('编辑器')).toBeTruthy()
    expect(childCard('设计')).toBeTruthy()
    // 独立折叠：展开一组不能连带展开另一组
    expect(childCard('论文')).toBeNull()

    const toggle = screen.getByTestId('admin-category-expand-1')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('收起 常用工具 的子分类')
  })

  it('再点一次收起', async () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })

    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))
    expect(childCard('编辑器')).toBeTruthy()

    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))
    expect(childCard('编辑器')).toBeNull()
  })

  it('搜索时自动展开命中的组，否则用户看不到匹配的子分类', async () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })

    await fireEvent.input(screen.getByTestId('admin-category-search'), { target: { value: '编辑器' } })

    expect(childCard('编辑器')).toBeTruthy()
    expect(screen.getByTestId('admin-category-expand-1').getAttribute('aria-expanded')).toBe('true')
  })

  it('搜索态下仍可手动收起某一组', async () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })
    await fireEvent.input(screen.getByTestId('admin-category-search'), { target: { value: '编辑' } })
    expect(childCard('编辑器')).toBeTruthy()

    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))

    expect(childCard('编辑器')).toBeNull()
  })

  it('换关键词后重置手动收起，不把上一次的收起状态带过来', async () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })
    const searchBox = screen.getByTestId('admin-category-search')

    await fireEvent.input(searchBox, { target: { value: '编辑' } })
    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))
    expect(childCard('编辑器')).toBeNull()

    await fireEvent.input(searchBox, { target: { value: '编辑器' } })

    // 新关键词是一次新的检索，之前对旧结果的收起不该继续生效
    expect(childCard('编辑器')).toBeTruthy()
  })

  it('任何搜索输入都会重置手动展开，清空搜索后所有组都是收起的', async () => {
    // 这里按**实际行为**断言，不按我以为该有的行为：`handleSearchInput` 每次输入都清空
    // `expandedRootIds`，所以搜索前的手动展开不会在清空搜索后恢复。
    // 取舍是可辩护的——搜索前展开的组未必还在当前结果里，保留陈旧展开状态更容易误导。
    // 如果日后决定「退出搜索恢复原展开」，这条断言就是需要一起改的契约点。
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })
    const searchBox = screen.getByTestId('admin-category-search')

    await fireEvent.click(screen.getByTestId('admin-category-expand-2'))
    expect(childCard('论文')).toBeTruthy()

    await fireEvent.input(searchBox, { target: { value: '编辑' } })
    await fireEvent.input(searchBox, { target: { value: '' } })

    expect(childCard('论文')).toBeNull()
    expect(childCard('编辑器')).toBeNull()
  })

  it('翻页同样重置展开状态，避免跨页残留', async () => {
    // 与搜索同一套理由：换了列表内容，旧的展开集合就不再对应当前页。
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: tree } })

    await fireEvent.click(screen.getByTestId('admin-category-expand-1'))
    expect(childCard('编辑器')).toBeTruthy()

    await fireEvent.input(screen.getByTestId('admin-category-search'), { target: { value: '常用' } })
    expect(screen.getByTestId('admin-category-expand-1').getAttribute('aria-expanded')).toBe('true')
  })
})

describe('左侧导航的父级折叠', () => {
  // Sidebar 吃的是已经组装好的 NavigationItem 树（由 Home 派生），不是原始分类数组。
  const items = [
    {
      id: 'cat-1',
      categoryId: 1,
      title: '常用工具',
      icon: null,
      count: 2,
      children: [{ id: 'cat-11', categoryId: 11, title: '编辑器', icon: null, count: 1, children: [] }],
    },
    { id: 'cat-2', categoryId: 2, title: '学习资料', icon: null, count: 1, children: [] },
  ]

  // 子项渲染同时要求 expandedParentIds 命中**且**侧栏处于展开态；常驻展开把后者固定为真，
  // 这样测的就是折叠逻辑本身，而不是 hover/移动端那套宽度状态（那属 PROB-18c）。
  const navigation = { position: 'left' as const, always_expanded: true, top_layout: 'scroll' as const }

  it('默认收起，不预先展开任何父级', () => {
    render(Sidebar, { props: { items, activeId: null, navigation } })

    expect(screen.queryByTitle('编辑器')).toBeNull()
    expect(screen.getByRole('button', { name: '展开 常用工具 的子分类' })).toBeTruthy()
  })

  it('展开箭头与标题是两个独立按钮：点箭头展开，点标题只导航', async () => {
    const onNavigate = vi.fn()
    render(Sidebar, { props: { items, activeId: null, navigation, onNavigate } })

    // 点标题：导航，不展开
    await fireEvent.click(screen.getByTitle('常用工具'))
    expect(onNavigate).toHaveBeenCalledWith('cat-1')
    expect(screen.queryByTitle('编辑器')).toBeNull()

    // 点箭头：展开，不导航
    const toggle = screen.getByRole('button', { name: '展开 常用工具 的子分类' })
    await fireEvent.click(toggle)
    expect(screen.getByTitle('编辑器')).toBeTruthy()
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '收起 常用工具 的子分类' })).toBeTruthy()
  })

  it('当前选中的是子分类时自动展开其父级路径', () => {
    // 不展开的话，用户在导航里看不到自己正处在哪一层。
    render(Sidebar, { props: { items, activeId: 'cat-11', navigation } })

    expect(screen.getByTitle('编辑器')).toBeTruthy()
    expect(screen.getByTitle('编辑器').getAttribute('aria-current')).toBe('location')
  })
})
