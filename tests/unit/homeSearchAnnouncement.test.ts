// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, describe, expect, it } from 'vitest'
import HomeContentSummary from '../../src/components/HomeContentSummary.svelte'

afterEach(cleanup)

const initial = {
  query: '', settled: true, active: true, showVisual: false, hasSearchQuery: false,
  visibleCategoriesCount: 2, visibleBookmarkCount: 8, totalCategories: 2, totalBookmarks: 8,
}

function snapshot(query: string, count: number, overrides: Partial<typeof initial> = {}) {
  return { ...initial, query, hasSearchQuery: Boolean(query.trim()), visibleBookmarkCount: count, ...overrides }
}

const status = () => screen.getByRole('status')
async function flush() { await tick(); await Promise.resolve() }

describe('home search result announcements', () => {
  it('keeps an empty polite status node mounted before a search or visual summary', async () => {
    const view = render(HomeContentSummary, initial)
    const live = status()
    expect(live.textContent).toBe('')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.getAttribute('aria-atomic')).toBe('true')
    expect(view.container.querySelector('.content-summary')).toBeNull()
    await view.rerender({ ...initial, totalBookmarks: 9 })
    expect(status()).toBe(live)
    expect(live.textContent).toBe('')
  })

  it('publishes only a settled result and clears the old speech snapshot while pending', async () => {
    const view = render(HomeContentSummary, initial)
    const live = status()
    await view.rerender(snapshot('first', 3))
    expect(live.textContent).toBe('找到 3 个收藏。')
    await view.rerender(snapshot('second', 0, { settled: false, showVisual: true }))
    expect(status()).toBe(live)
    expect(live.textContent).toBe('')
    await view.rerender(snapshot('second', 1, { settled: true, showVisual: true }))
    expect(live.textContent).toBe('找到 1 个收藏。')
  })

  it('does not repeatedly mutate the live region for an unchanged speech result', async () => {
    const view = render(HomeContentSummary, initial)
    const live = status()
    await view.rerender(snapshot('same', 3))
    await flush()
    const mutations: string[] = []
    const observer = new MutationObserver(() => { mutations.push(live.textContent ?? '') })
    observer.observe(live, { childList: true, characterData: true, subtree: true })
    try {
      await view.rerender(snapshot('same', 3, { visibleCategoriesCount: 1, showVisual: true }))
      await view.rerender(snapshot('same', 3, { totalCategories: 4 }))
      await flush()
      expect(mutations).toEqual([])
      expect(live.textContent).toBe('找到 3 个收藏。')
    } finally { observer.disconnect() }
  })

  it('announces zero results and the restored total after clearing a completed search', async () => {
    const view = render(HomeContentSummary, initial)
    const live = status()
    await view.rerender(snapshot('missing', 0))
    expect(live.textContent).toBe('没有匹配的收藏。')
    await view.rerender(snapshot('', 8))
    expect(status()).toBe(live)
    expect(live.textContent).toBe('已显示全部 8 个收藏。')
  })

  it('does not announce a canceled first search that never produced a filtered result', async () => {
    const view = render(HomeContentSummary, initial)
    await view.rerender(snapshot('draft', 8, { settled: false, hasSearchQuery: false }))
    await view.rerender(initial)
    expect(status().textContent).toBe('')
  })

  it('suppresses inactive results and rebases the settled snapshot after the guide closes', async () => {
    const view = render(HomeContentSummary, initial)
    const live = status()
    await view.rerender(snapshot('before', 3))
    await view.rerender(snapshot('hidden', 2, { active: false }))
    expect(live.textContent).toBe('')
    await view.rerender(snapshot('hidden', 2, { active: true, settled: false }))
    await view.rerender(snapshot('hidden', 2, { active: true, settled: true }))
    expect(status()).toBe(live)
    expect(live.textContent).toBe('')
    await view.rerender(snapshot('new', 1))
    expect(live.textContent).toBe('找到 1 个收藏。')
  })

  it('does not consume a newer query while rebasing an earlier pending query', async () => {
    const view = render(HomeContentSummary, { ...initial, active: false })
    await view.rerender(snapshot('old', 2, { active: false }))
    await view.rerender(snapshot('old', 2, { active: true, settled: false }))
    await view.rerender(snapshot('new', 1, { active: true, settled: true }))
    expect(status().textContent).toBe('找到 1 个收藏。')
  })

  it('keeps speech available when the optional visual summary is hidden', async () => {
    const view = render(HomeContentSummary, initial)
    await view.rerender(snapshot('visible-results', 3, { showVisual: false }))
    expect(status().textContent).toBe('找到 3 个收藏。')
    expect(view.container.querySelector('.content-summary')).toBeNull()
  })

  it('consumes a result behind an open native dialog without swallowing the next new query', async () => {
    const view = render(HomeContentSummary, initial)
    const modal = document.createElement('dialog')
    // This tests the publication guard, not jsdom's unavailable native inert behavior.
    modal.open = true
    document.body.appendChild(modal)
    try {
      await view.rerender(snapshot('behind-modal', 2))
      expect(status().textContent).toBe('')
      document.body.removeChild(modal)
      await view.rerender(snapshot('behind-modal', 2, { settled: false }))
      await view.rerender(snapshot('behind-modal', 2))
      expect(status().textContent).toBe('')
      await view.rerender(snapshot('new-query', 1))
      expect(status().textContent).toBe('找到 1 个收藏。')
    } finally {
      if (modal.parentNode) modal.parentNode.removeChild(modal)
    }
  })

  it('does not retain a previous page instance\'s announcement after unmount', async () => {
    const first = render(HomeContentSummary, initial)
    const oldStatus = status()
    await first.rerender(snapshot('first', 3))
    first.unmount()
    render(HomeContentSummary, initial)
    expect(status()).not.toBe(oldStatus)
    expect(status().textContent).toBe('')
  })

  it('finishes guide rebasing when its settled snapshot is consumed by a native dialog', async () => {
    const view = render(HomeContentSummary, { ...initial, active: false })
    await view.rerender(snapshot('same-query', 2, { active: true, settled: false }))
    const modal = document.createElement('dialog')
    modal.open = true
    document.body.appendChild(modal)
    try {
      await view.rerender(snapshot('same-query', 2))
      expect(status().textContent).toBe('')
      document.body.removeChild(modal)
      await view.rerender(snapshot('same-query', 3))
      expect(status().textContent).toBe('找到 3 个收藏。')
    } finally {
      if (modal.parentNode) modal.parentNode.removeChild(modal)
    }
  })
})
