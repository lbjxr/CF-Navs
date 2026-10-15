// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import SearchSpotlight from '../../../src/components/SearchSpotlight.svelte'
import { api } from '../../../src/lib/api'
import { publicStore } from '../../../src/lib/stores'
import type { PublicBookmark, PublicCategory } from '../../../shared/types'

const bookmark = (over: Record<string, unknown>): PublicBookmark => ({
  id: 0,
  category_id: 1,
  title: '',
  url: 'https://example.com',
  icon: '',
  icon_source: null,
  icon_blob: '',
  icon_cached: false,
  description: '',
  open_method: 1,
  sort: 0,
  click_count: 0,
  is_private: false,
  ...over,
}) as unknown as PublicBookmark

const categories = [
  { id: 1, parent_id: null, title: '工具', icon: '', sort: 1 },
] as unknown as PublicCategory[]

beforeEach(() => {
  vi.spyOn(api.public, 'registerClick').mockResolvedValue(null as never)
  vi.spyOn(publicStore, 'incrementClick').mockImplementation(() => undefined)
  // jsdom 不实现 scrollIntoView；键盘导航把高亮项滚入可视区时会调用它。
  Element.prototype.scrollIntoView = () => { }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SearchSpotlight', () => {
  it('打开时呈现 combobox + listbox 语义', () => {
    render(SearchSpotlight, { props: { open: true, bookmarks: [], categories } })
    const input = screen.getByRole('combobox')
    expect(input.getAttribute('aria-controls')).toBe('spotlight-listbox')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('空查询展示常用书签（按点击数，纯内存零请求）', async () => {
    const items = [
      bookmark({ id: 1, title: '低频', click_count: 1 }),
      bookmark({ id: 2, title: '高频', click_count: 9 }),
      bookmark({ id: 3, title: '零访问', click_count: 0 }),
    ]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()
    expect(screen.getByText('常用书签')).toBeTruthy()
    const options = screen.getAllByRole('option')
    // click_count>0 的按降序，零访问不进常用列表
    expect(options[0].textContent).toContain('高频')
    expect(options.some((o) => o.textContent?.includes('低频'))).toBe(true)
    expect(options.some((o) => o.textContent?.includes('零访问'))).toBe(false)
  })

  it('结果行按书签真实图标显示，并保留文字图标回退', async () => {
    const items = [
      bookmark({
        id: 11,
        title: '图片书签',
        icon: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
        icon_source: 'custom',
        click_count: 3,
      }),
      bookmark({ id: 12, title: 'Iconify 书签', icon: 'mdi:home', icon_source: 'iconify', click_count: 2 }),
      bookmark({ id: 13, title: '文字书签', icon: 'TXT', icon_source: 'custom', click_count: 1 }),
    ]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()

    const options = screen.getAllByRole('option')
    expect(options[0].querySelector('img')?.getAttribute('src')).toContain('data:image/svg+xml')
    expect(options[1].querySelector('img')?.getAttribute('src')).toBe('/api/iconify/mdi/home.svg')
    expect(options[2].querySelector('.icon-text')?.textContent).toBe('TXT')
    expect(options.every((option) => option.querySelector('[aria-hidden="true"]'))).toBe(true)
  })

  it('真实图标加载失败后回退到稳定文字图标', async () => {
    const items = [bookmark({ id: 14, title: '失败图标', icon: 'data:image/png;base64,broken', icon_source: 'custom', click_count: 1 })]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()

    const option = screen.getAllByRole('option')[0]
    const image = option.querySelector('img') as HTMLImageElement
    await fireEvent.error(image)
    await tick()

    expect(option.querySelector('img')).toBeNull()
    expect(option.querySelector('.icon-text')?.textContent).toBe('失')
  })

  it('icon_cached 书签走 /api/icon 代理路径', async () => {
    const fetch = vi.fn(async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    vi.stubGlobal('fetch', fetch)
    const TestURL = class extends URL {}
    Object.assign(TestURL, { createObjectURL: () => 'blob:spotlight', revokeObjectURL: vi.fn() })
    vi.stubGlobal('URL', TestURL)
    const items = [bookmark({
      id: 15,
      title: '缓存图标',
      icon: 'https://example.com/icon.png',
      icon_cached: true,
      click_count: 1,
    })]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()

    await waitFor(() => {
      const option = screen.getAllByRole('option')[0]
      expect(option.querySelector('img')?.getAttribute('src')).toBe('blob:spotlight')
      expect(fetch.mock.calls[0]?.[0]).toMatch(/^\/api\/icon\/15\?v=/)
    })
  })

  it('输入即时过滤（无防抖延迟）', async () => {
    const items = [
      bookmark({ id: 1, title: 'GitHub', url: 'https://github.com' }),
      bookmark({ id: 2, title: 'Google', url: 'https://google.com' }),
    ]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'git' } })
    await tick()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('GitHub')
  })

  it('结果上限 50 并显示「还有 N 条」', async () => {
    const items = Array.from({ length: 62 }, (_, i) => bookmark({ id: i + 1, title: `npm 包 ${i}`, url: `https://npm/${i}` }))
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'npm' } })
    await tick()
    expect(screen.getAllByRole('option')).toHaveLength(50)
    expect(screen.getByText(/还有 12 条/)).toBeTruthy()
  })

  it('↑↓ 到端循环，aria-activedescendant 指向现存 option', async () => {
    const items = [
      bookmark({ id: 1, title: 'A', click_count: 3 }),
      bookmark({ id: 2, title: 'B', click_count: 2 }),
    ]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()
    const input = screen.getByRole('combobox')
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-0')

    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await tick()
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-1')

    await fireEvent.keyDown(input, { key: 'ArrowDown' }) // 到端循环回首项
    await tick()
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-0')

    await fireEvent.keyDown(input, { key: 'ArrowUp' }) // 首项再上循环到末项
    await tick()
    expect(input.getAttribute('aria-activedescendant')).toBe('spotlight-opt-1')
  })

  it('方向键导航把当前高亮项滚入可视区', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const items = [
      bookmark({ id: 1, title: 'A', click_count: 3 }),
      bookmark({ id: 2, title: 'B', click_count: 2 }),
    ]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories } })
    await tick()
    const input = screen.getByRole('combobox')

    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await tick()
    // 高亮已移到第 2 项，被滚入可视区的应是该项对应的 option 元素。
    const active = document.getElementById('spotlight-opt-1')
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.instances).toContain(active)
  })

  it('Enter 打开高亮项：open_method=1 走新窗口并登记点击（只一次）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const onClose = vi.fn()
    const items = [bookmark({ id: 7, title: 'Solo', url: 'https://solo.com', open_method: 1, click_count: 1 })]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories, onClose } })
    await tick()

    await fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })

    expect(openSpy).toHaveBeenCalledTimes(1)
    expect(openSpy).toHaveBeenCalledWith('https://solo.com', '_blank', 'noopener,noreferrer')
    expect(publicStore.incrementClick).toHaveBeenCalledWith(7)
    expect(api.public.registerClick).toHaveBeenCalledWith(7)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('open_method=3 委托 onViewBookmark 并关闭，不新开窗口', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const onClose = vi.fn()
    const onViewBookmark = vi.fn()
    const items = [bookmark({ id: 8, title: '弹层', url: 'https://modal.com', open_method: 3, click_count: 1 })]
    render(SearchSpotlight, { props: { open: true, bookmarks: items, categories, onClose, onViewBookmark } })
    await tick()

    await fireEvent.click(screen.getAllByRole('option')[0])

    expect(onViewBookmark).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(openSpy).not.toHaveBeenCalled()
    expect(publicStore.incrementClick).toHaveBeenCalledWith(8)
  })

  it('Escape 与遮罩点击都调用 onClose', async () => {
    const onClose = vi.fn()
    render(SearchSpotlight, { props: { open: true, bookmarks: [], categories, onClose } })
    await fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    await fireEvent.click(screen.getByLabelText('关闭搜索'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
