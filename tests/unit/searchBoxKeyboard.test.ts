// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { flushSync, tick } from 'svelte'
import SearchBox from '../../src/components/SearchBox.svelte'
import type { SearchEngineSetting } from '../../shared/types'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setting(over: Partial<SearchEngineSetting> = {}): SearchEngineSetting {
  return {
    current: 'Beta',
    engines: ['Alpha', 'Beta', 'Gamma'].map((name) => ({
      name,
      icon: '',
      url_template: `https://search.test/${name.toLowerCase()}?q={q}`,
    })),
    ...over,
  }
}

const trigger = () => screen.getByRole('button', { name: /当前搜索引擎/ }) as HTMLButtonElement
const option = (name: string) => screen.getByRole('option', { name }) as HTMLButtonElement
const input = () => screen.getByRole('searchbox') as HTMLInputElement

function expectActive(name: string) {
  expect(document.activeElement).toBe(option(name))
  expect(option(name).tabIndex).toBe(0)
  expect(screen.getAllByRole('option').filter((item) => item.tabIndex === 0)).toEqual([option(name)])
}

describe('SearchBox rich picker keyboard model', () => {
  it.each(['ArrowDown', 'ArrowUp'])('%s opens on the current selection with one Tab stop', async (key) => {
    render(SearchBox, { searchEngine: setting() })
    trigger().focus()
    await fireEvent.keyDown(trigger(), { key })
    expectActive('Beta')
    expect(option('Beta').getAttribute('aria-selected')).toBe('true')
    expect(trigger().getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('arrows wrap and Home/End move focus without committing a selection', async () => {
    render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    await fireEvent.keyDown(option('Beta'), { key: 'ArrowDown' })
    expectActive('Gamma')
    await fireEvent.keyDown(option('Gamma'), { key: 'ArrowDown' })
    expectActive('Alpha')
    await fireEvent.keyDown(option('Alpha'), { key: 'ArrowUp' })
    expectActive('Gamma')
    await fireEvent.keyDown(option('Gamma'), { key: 'Home' })
    expectActive('Alpha')
    await fireEvent.keyDown(option('Alpha'), { key: 'End' })
    expectActive('Gamma')
    expect(option('Gamma').getAttribute('aria-selected')).toBe('false')
    expect(option('Beta').getAttribute('aria-selected')).toBe('true')
    expect(trigger().getAttribute('aria-label')).toBe('当前搜索引擎：Beta')
  })

  it('Escape returns focus and reopening starts at the unchanged selection', async () => {
    render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    await fireEvent.keyDown(option('Beta'), { key: 'End' })
    await fireEvent.keyDown(option('Gamma'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute('aria-label')).toBe('当前搜索引擎：Beta')
    await fireEvent.keyDown(trigger(), { key: 'ArrowUp' })
    expectActive('Beta')
  })

  it('native option click commits once, closes and returns focus without submitting', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBox, { searchEngine: setting(), query: 'pending query' })
    await fireEvent.click(trigger())
    expectActive('Beta')
    // jsdom does not synthesize native Enter/Space clicks; real Chrome covers them.
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      option('Gamma').dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(screen.queryByRole('listbox')).not.toBeNull()
    }
    await fireEvent.click(option('Gamma'))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger().getAttribute('aria-label')).toBe('当前搜索引擎：Gamma')
    expect(document.activeElement).toBe(trigger())
    expect(input().value).toBe('pending query')
    expect(open).not.toHaveBeenCalled()
  })

  it.each([false, true])('Tab keeps native navigation (shift=%s) and closes after focus moves', async (shiftKey) => {
    render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
    option('Beta').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expectActive('Beta')
    // Explicitly simulate the browser's default focus movement; jsdom has no Tab default action.
    const next = shiftKey ? trigger() : input()
    next.focus()
    await tick()
    expect(document.activeElement).toBe(next)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('IME composition does not open, navigate or dismiss the picker', async () => {
    render(SearchBox, { searchEngine: setting() })
    trigger().focus()
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown', isComposing: true })
    expect(screen.queryByRole('listbox')).toBeNull()
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown', keyCode: 229 })
    expect(screen.queryByRole('listbox')).toBeNull()
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    for (const key of ['ArrowUp', 'Home', 'End', 'Escape']) {
      await fireEvent.keyDown(option('Beta'), { key, isComposing: true })
      expectActive('Beta')
    }
  })

  it('repairs focused options on reorder/removal and follows a new default on reopen', async () => {
    const view = render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    await fireEvent.keyDown(option('Beta'), { key: 'End' })
    const list = setting().engines
    await view.rerender({ searchEngine: setting({ engines: [list[2], list[0], list[1]] }) })
    expectActive('Gamma')
    await view.rerender({ searchEngine: setting({ engines: [list[0], list[1]] }) })
    expectActive('Beta')
    await fireEvent.keyDown(option('Beta'), { key: 'Escape' })
    await view.rerender({ searchEngine: setting({ current: 'Alpha' }) })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expectActive('Alpha')
    expect(option('Alpha').getAttribute('aria-selected')).toBe('true')
  })

  it.each(['hidden', 'single', 'empty', 'preview'])('closing an unavailable picker (%s) preserves a connected focus target', async (mode) => {
    const view = render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    await view.rerender({
      searchEngine: mode === 'empty' ? null : mode === 'single' ? setting({ engines: [setting().engines[0]] }) : setting(),
      showEngineSelector: mode !== 'hidden',
      preview: mode === 'preview',
    })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(input())
    if (mode !== 'hidden') await fireEvent.keyDown(view.container.querySelector('.engine-icon-button') as HTMLButtonElement, { key: 'ArrowDown' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('an unavailable-picker fallback cannot steal focus from a newly reopened menu', async () => {
    const view = render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const unavailable = view.rerender({ searchEngine: setting({ engines: [setting().engines[0]] }) })
    flushSync()
    const restored = view.rerender({ searchEngine: setting() })
    flushSync()
    trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    flushSync()
    await Promise.all([unavailable, restored])
    await tick()
    expectActive('Beta')
  })

  it('an unavailable-picker fallback respects a newer focus outside the picker', async () => {
    const view = render(SearchBox, { searchEngine: setting() })
    await fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const elsewhere = document.createElement('button')
    // appendChild avoids the Cloudflare HTMLRewriter Element.append overload.
    document.body.appendChild(elsewhere)
    try {
      const unavailable = view.rerender({ searchEngine: setting({ engines: [] }) })
      flushSync()
      elsewhere.focus()
      await unavailable
      await tick()
      expect(document.activeElement).toBe(elsewhere)
      expect(screen.queryByRole('listbox')).toBeNull()
    } finally {
      elsewhere.remove()
    }
  })

  it('pending opening cannot steal focus after the user leaves', async () => {
    render(SearchBox, { searchEngine: setting() })
    const button = trigger()
    button.focus()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    input().focus()
    await tick()
    expect(document.activeElement).toBe(input())
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('multiple instances control independent lists and focus within their own picker', async () => {
    const first = render(SearchBox, { searchEngine: setting() })
    const second = render(SearchBox, { searchEngine: setting({ current: 'Alpha' }) })
    const firstTrigger = within(first.container).getByRole('button', { name: /当前搜索引擎/ })
    const secondTrigger = within(second.container).getByRole('button', { name: /当前搜索引擎/ })
    expect(firstTrigger.getAttribute('aria-controls')).not.toBe(secondTrigger.getAttribute('aria-controls'))
    await fireEvent.keyDown(firstTrigger, { key: 'ArrowDown' })
    const firstOption = within(first.container).getByRole('option', { name: 'Beta' })
    expect(document.activeElement).toBe(firstOption)
    secondTrigger.focus()
    await fireEvent.keyDown(secondTrigger, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(within(second.container).getByRole('option', { name: 'Alpha' }))
    expect(within(first.container).queryByRole('listbox')).toBeNull()
  })
})
