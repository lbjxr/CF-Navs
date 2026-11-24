// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import Home from '../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory, PublicSettings } from '../../shared/types'

const categories: PublicCategory[] = [{ id: 1, parent_id: null, title: '工具', icon: null, sort: 0 }]
const bookmarks: PublicBookmark[] = ['Alpha', 'Beta'].map((title, index) => ({
  id: index + 1, category_id: 1, title, url: `https://${title.toLowerCase()}.test/`,
  icon: title[0], icon_source: null, icon_blob: null, icon_cached: false, icon_background_color: null,
  description: null, open_method: 1, sort: 0, click_count: 0,
}))

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.setItem('cf-navs:guide-seen', '1')
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
  vi.stubGlobal('open', vi.fn())
  Element.prototype.scrollIntoView = () => {}
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const input = () => document.querySelector('#search-query') as HTMLInputElement
const status = () => screen.getByTestId('home-search-status')
async function typeQuery(value: string) {
  await fireEvent.input(input(), { target: { value } })
}
async function settle(ms = 120) { await vi.advanceTimersByTimeAsync(ms); await tick() }

describe('Home filter and search-status integration', () => {
  it('typing filters locally after the existing delay and publishes only settled counts on one persistent status node', async () => {
    render(Home, { categories, bookmarks })
    const node = status()
    expect(node.textContent).toBe('')
    await typeQuery('alpha')
    expect(status().textContent).toBe('')
    await settle(119)
    expect(document.querySelector('.search-results')).toBeNull()
    await settle(1)
    expect(document.querySelector('.search-results')?.textContent).toContain('Alpha')
    expect(document.querySelector('.search-results')?.textContent).not.toContain('Beta')
    expect(status().textContent).toBe('找到 1 个收藏。')
    await typeQuery('no-match-marker')
    expect(status().textContent).toBe('')
    await settle()
    expect(screen.getByRole('heading', { name: '没有匹配的书签' })).toBeTruthy()
    expect(status().textContent).toBe('没有匹配的收藏。')
    await typeQuery('')
    await settle()
    expect(status()).toBe(node)
    expect(status().textContent).toBe('已显示全部 2 个收藏。')
    expect(document.querySelector('.root-category-list')?.textContent).toContain('Alpha')
    expect(document.querySelector('.root-category-list')?.textContent).toContain('Beta')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('clearing before the deadline cancels the old query so empty input cannot flash old results', async () => {
    render(Home, { categories, bookmarks })
    await typeQuery('a')
    await settle(60)
    await typeQuery('')
    await settle(60)
    expect(input().value).toBe('')
    expect(document.querySelector('.search-results')).toBeNull()
    expect(status().textContent).toBe('')
    await settle()
    expect(document.querySelector('.search-results')).toBeNull()
  })

  it('returning to the already settled query cancels a newer pending query', async () => {
    render(Home, { categories, bookmarks })
    await typeQuery('alpha')
    await settle()
    await typeQuery('beta')
    await settle(60)
    await typeQuery('alpha')
    await settle(60)
    expect(document.querySelector('.search-results')?.textContent).toContain('Alpha')
    expect(document.querySelector('.search-results')?.textContent).not.toContain('Beta')
    await settle()
    expect(document.querySelector('.search-results')?.textContent).not.toContain('Beta')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('composition readiness passes through Hero and silences intermediate counts while filtering keeps its own owner', async () => {
    render(Home, { categories, bookmarks })
    await fireEvent.compositionStart(input())
    await typeQuery('alpha')
    await settle()
    expect(document.querySelector('.search-results')?.textContent).toContain('Alpha')
    expect(status().textContent).toBe('')
    await fireEvent.compositionEnd(input())
    expect(status().textContent).toBe('找到 1 个收藏。')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('zero-result recovery offers web search only when the visible search box has an engine', async () => {
    const settings = {
      search_box_show: true,
      search_engine: { current: 'Alpha', engines: [{ name: 'Alpha', icon: '', url_template: 'https://search.test/?q={q}' }] },
    } as PublicSettings
    const view = render(Home, { categories, bookmarks, settings })
    await typeQuery('no-match-marker')
    await settle()
    expect(document.querySelector('.empty-panel p')?.textContent).toContain('在搜索框按 Enter')
    await view.rerender({ categories, bookmarks, settings: { ...settings, search_engine: { current: '', engines: [] } } })
    expect(document.querySelector('.empty-panel p')?.textContent).toBe('换个关键词试试，或清空输入查看全部收藏。')
    await view.rerender({ categories, bookmarks, settings: { ...settings, search_box_show: false } })
    expect(document.querySelector('.empty-panel p')?.textContent).not.toContain('Enter')
    expect(window.open).not.toHaveBeenCalled()
  })
})
