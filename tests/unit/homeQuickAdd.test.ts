// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import Home from '../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory } from '../../shared/types'

const categories: PublicCategory[] = [{ id: 1, parent_id: null, title: '工具', icon: null, sort: 0 }]
const saved: PublicBookmark = {
  id: 1, category_id: 1, title: '已保存', url: 'https://saved.example/Path', icon: 'S',
  icon_source: null, icon_blob: null, icon_cached: false, icon_background_color: null, description: null,
  open_method: 1, sort: 0, click_count: 0,
}

beforeEach(() => {
  vi.useFakeTimers()
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

async function inputQuery(query: string, settle = true): Promise<void> {
  await fireEvent.input(document.querySelector('#search-query') as HTMLInputElement, { target: { value: query } })
  if (settle) await vi.advanceTimersByTimeAsync(120)
  await tick()
}

function quickAddButton(): HTMLElement | null {
  const panel = document.querySelector('.empty-panel') as HTMLElement | null
  return panel ? within(panel).queryByRole('button', { name: '新增书签' }) : null
}

describe('home search quick-add', () => {
  it('offers the current URL only after its empty search settles and prefills it', async () => {
    const onOpenCreateBookmark = vi.fn()
    render(Home, { props: { categories, bookmarks: [saved], isAuthenticated: true, onOpenCreateBookmark } })
    await inputQuery('new.example/Case?q=Value', false)
    expect(quickAddButton()).toBeNull()
    await vi.advanceTimersByTimeAsync(119)
    expect(quickAddButton()).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(quickAddButton()).not.toBeNull()
    await fireEvent.click(quickAddButton()!)
    expect(onOpenCreateBookmark).toHaveBeenCalledExactlyOnceWith(undefined, 'https://new.example/Case?q=Value')
  })

  it.each(['wwer', 'javascript:alert(1)', 'https://', 'https://bad..example'])('does not offer quick-add for %s', async (query) => {
    render(Home, { props: { categories, isAuthenticated: true, onOpenCreateBookmark: vi.fn() } })
    await inputQuery(query)
    expect(screen.getByRole('heading', { name: '没有匹配的书签' })).toBeTruthy()
    expect(quickAddButton()).toBeNull()
  })

  it('removes a stale action immediately while the next query is pending', async () => {
    render(Home, { props: { categories, bookmarks: [saved], isAuthenticated: true, onOpenCreateBookmark: vi.fn() } })
    await inputQuery('new.example')
    expect(quickAddButton()).not.toBeNull()
    await inputQuery('saved.example', false)
    expect(quickAddButton()).toBeNull()
    await vi.advanceTimersByTimeAsync(120)
    expect(quickAddButton()).toBeNull()
    expect(document.querySelector('.search-results')?.textContent).toContain('已保存')
  })

  it('hides the action on logout and when no creation handler is connected', async () => {
    const { rerender } = render(Home, { props: { categories, isAuthenticated: true, onOpenCreateBookmark: vi.fn() } })
    await inputQuery('new.example')
    expect(quickAddButton()).not.toBeNull()
    await rerender({ isAuthenticated: false })
    expect(quickAddButton()).toBeNull()
    await rerender({ isAuthenticated: true, onOpenCreateBookmark: undefined })
    expect(quickAddButton()).toBeNull()
  })

  it('removes the action when the new bookmark appears in the search results', async () => {
    const { rerender } = render(Home, { props: { categories, isAuthenticated: true, onOpenCreateBookmark: vi.fn() } })
    await inputQuery('saved.example')
    expect(quickAddButton()).not.toBeNull()
    await rerender({ bookmarks: [saved] })
    expect(quickAddButton()).toBeNull()
    expect(document.querySelector('.search-results')?.textContent).toContain('已保存')
  })

  it('wires the settings-menu action to an ordinary empty bookmark draft', async () => {
    const onOpenCreateBookmark = vi.fn()
    render(Home, { props: { categories, isAuthenticated: true, onOpenCreateBookmark } })
    await fireEvent.click(screen.getByTestId('home-actions-menu-trigger'))
    await fireEvent.click(screen.getByTestId('home-create-bookmark'))
    expect(onOpenCreateBookmark).toHaveBeenCalledExactlyOnceWith()
  })
})
