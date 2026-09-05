// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import CategoryListPanel from '../../src/components/admin/CategoryListPanel.svelte'
import BookmarkListPanel from '../../src/components/admin/BookmarkListPanel.svelte'

// PROB-18b：把 adminEmptyStateMarkup.test.ts 的源码文本断言迁到组件层。
//
// 原断言是 `expect(source).toContain('暂无分类')`——只能证明文件里写了那串字符，证明不了
// 空态**在正确的条件下渲染**、CTA **真的可点**、以及「没有分类时不要引导用户去加书签」这条
// 实际的产品逻辑。这里在真实 DOM 上按状态组合渲染并断言可观察结果。

afterEach(cleanup)

const category = (id: number, title: string, parent_id: number | null = null) => ({
  id, parent_id, title, icon: '', bookmarkCount: 0,
})

const bookmark = (id: number, category_id: number, title: string) => ({
  id, category_id, title, url: `https://example.com/${id}`, icon: '', description: '',
  open_method: 'new_tab' as const, sort: id, click_count: 0,
})

// 空态区的 CTA 与页头同名按钮共存，必须按空态容器定位，不能靠出现顺序。
function emptyStateButton(headingText: string): HTMLElement {
  const emptyState = screen.getByRole('heading', { name: headingText }).closest('.admin-empty-state')
  const button = emptyState?.querySelector('button')
  if (!button) throw new Error(`空态「${headingText}」里没有按钮`)
  return button as HTMLElement
}

describe('分类面板空态', () => {
  it('加载中显示加载态，不显示「暂无分类」也不给 CTA', () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categoriesLoading: true, categories: [] } })

    expect(screen.getByRole('heading', { name: '正在加载分类…' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '暂无分类' })).toBeNull()
  })

  it('无分类时给出可点的「新增分类」CTA', async () => {
    const onOpenCreateCategory = vi.fn()
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: [], onOpenCreateCategory } })

    expect(screen.getByRole('heading', { name: '暂无分类' })).toBeTruthy()
    // CTA 必须真的可点：源码文本断言只能看到按钮的文字
    await fireEvent.click(emptyStateButton('暂无分类'))
    expect(onOpenCreateCategory).toHaveBeenCalledTimes(1)
  })

  it('访客态的空态 CTA 是禁用的', () => {
    // 漏写 disabled={!isAuthenticated} 会让访客点开创建弹窗，这条能抓住。
    // 只断言 disabled，不用 fireEvent 假点：jsdom 的 dispatchEvent 会把事件送到
    // 禁用按钮上（真实浏览器不会），拿它当「点了没反应」的证据是自欺。
    render(CategoryListPanel, { props: { isAuthenticated: false, categories: [] } })

    expect((emptyStateButton('暂无分类') as HTMLButtonElement).disabled).toBe(true)
  })

  it('有分类但搜索无结果时是「没有匹配」而不是「暂无分类」，且不再给 CTA', async () => {
    // 这两种空态的区别决定了给用户什么建议：一个该去创建，一个该改关键词。
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: [category(1, '常用工具')] } })

    await fireEvent.input(screen.getByPlaceholderText('搜索分类…'), { target: { value: '不存在的关键词' } })

    expect(screen.getByRole('heading', { name: '没有匹配的分类' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '暂无分类' })).toBeNull()
  })
})

describe('书签面板空态', () => {
  it('一个分类都没有时引导去建分类，不给「新增书签」CTA', () => {
    // 没有分类时新增书签必然失败，所以这一档刻意不给 CTA。
    render(BookmarkListPanel, { props: { isAuthenticated: true, bookmarks: [], categories: [] } })

    expect(screen.getByRole('heading', { name: '暂无书签' })).toBeTruthy()
    expect(screen.getByText('请先在分类面板中创建至少一个分类，再添加书签。')).toBeTruthy()
    // 空态区不给 CTA；页头的「新增书签」按钮是另一个入口，这里断言空态里没有
    const emptyState = screen.getByRole('heading', { name: '暂无书签' }).closest('.admin-empty-state')
    expect(emptyState?.querySelector('button')).toBeNull()
  })

  it('已有分类但没有书签时给出可点的「新增书签」CTA', async () => {
    const onOpenCreateBookmark = vi.fn()
    render(BookmarkListPanel, {
      props: { isAuthenticated: true, bookmarks: [], categories: [category(1, '常用工具')], onOpenCreateBookmark },
    })

    await fireEvent.click(emptyStateButton('暂无书签'))
    expect(onOpenCreateBookmark).toHaveBeenCalledTimes(1)
  })

  it('加载中不显示「暂无书签」，避免把加载中误报成空数据', () => {
    render(BookmarkListPanel, { props: { isAuthenticated: true, bookmarksLoading: true, bookmarks: [], categories: [] } })

    expect(screen.getByRole('heading', { name: '正在加载书签…' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '暂无书签' })).toBeNull()
  })

  it('有书签但搜索无结果时不显示「暂无书签」', async () => {
    render(BookmarkListPanel, {
      props: { isAuthenticated: true, categories: [category(1, '常用工具')], bookmarks: [bookmark(1, 1, 'GitHub')] },
    })

    await fireEvent.input(screen.getByPlaceholderText('搜索标题、链接或分类…'), { target: { value: '不存在的关键词' } })

    expect(screen.queryByRole('heading', { name: '暂无书签' })).toBeNull()
  })
})

describe('空态文案不含编辑事故残留', () => {
  // 曾有一次用 PowerShell 写文件把字面量 `n 当换行符写进了模板。它不是换行，会作为
  // 两个可见字符渲染在页面上——所以按渲染文本断言，比在源码里搜字符串更贴近后果。
  it('两个面板的空态渲染文本里没有字面量反引号 n', () => {
    render(CategoryListPanel, { props: { isAuthenticated: true, categories: [] } })
    const categoryEmpty = screen.getByRole('heading', { name: '暂无分类' }).closest('.admin-empty-state')
    expect(categoryEmpty?.textContent ?? '').not.toContain('`n')

    cleanup()

    render(BookmarkListPanel, { props: { isAuthenticated: true, bookmarks: [], categories: [] } })
    const bookmarkEmpty = screen.getByRole('heading', { name: '暂无书签' }).closest('.admin-empty-state')
    expect(bookmarkEmpty?.textContent ?? '').not.toContain('`n')
  })
})
