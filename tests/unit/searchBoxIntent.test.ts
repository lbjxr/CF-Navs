// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import SearchBox from '../../src/components/SearchBox.svelte'
import SearchBoxBindHarness from '../helpers/statefulLeaf/SearchBoxBindHarness.svelte'
import type { SearchEngineSetting } from '../../shared/types'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const setting: SearchEngineSetting = {
  current: 'Alpha',
  engines: ['Alpha', 'Beta'].map((name) => ({ name, icon: '', url_template: `https://search.test/${name}?q={q}&again={q}` })),
}
const input = () => screen.getByRole('searchbox') as HTMLInputElement
const submitButton = () => screen.getByRole('button', { name: /网页搜索：/ }) as HTMLButtonElement
const form = () => document.querySelector('form') as HTMLFormElement
const submit = () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

function enter(over: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true, ...over })
  input().dispatchEvent(event)
  return event
}

describe('SearchBox filter and external search intent', () => {
  it('keeps the field/button description outside the visual layout and updates the selected engine without submitting', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBoxBindHarness, { searchEngine: setting, query: '' })
    const hint = document.getElementById(input().getAttribute('aria-describedby')!)!
    expect(hint.classList.contains('sr-only')).toBe(true)
    expect(hint.textContent).toContain('筛选本站收藏')
    expect(hint.textContent).toContain('使用 Alpha 搜索网页')
    expect(submitButton().getAttribute('aria-describedby')).toBe(hint.id)
    expect(hint.textContent).toContain('新标签页')
    expect(input().id).toBe('search-query')
    await fireEvent.input(input(), { target: { value: 'draft keyword' } })
    expect(screen.getByTestId('bound-query').textContent).toBe('draft keyword')
    await fireEvent.click(screen.getByRole('button', { name: /当前搜索引擎/ }))
    await fireEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(hint.textContent).toContain('使用 Beta 搜索网页')
    expect(submitButton().getAttribute('aria-label')).toContain('Beta')
    expect(open).not.toHaveBeenCalled()
  })

  it('keeps input/binding available without an external engine and explains why the button is unavailable', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBoxBindHarness, { searchEngine: null, query: '' })
    await fireEvent.input(input(), { target: { value: 'collection filter' } })
    expect(input().readOnly).toBe(false)
    expect(screen.getByTestId('bound-query').textContent).toBe('collection filter')
    expect(document.getElementById(input().getAttribute('aria-describedby')!)?.textContent).toContain('未配置网页搜索引擎')
    expect(submitButton().disabled).toBe(true)
    submit()
    expect(open).not.toHaveBeenCalled()
  })

  it('blocks an IME-confirming Enter/form event, then allows the next ordinary Enter to use the native submit path once', async () => {
    const open = vi.fn()
    const onCompositionChange = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBox, { searchEngine: setting, query: '  中文 & text ', onCompositionChange })
    await fireEvent.compositionStart(input())
    expect(onCompositionChange).toHaveBeenLastCalledWith(true)
    expect(enter({ isComposing: true }).defaultPrevented).toBe(true)
    submit()
    expect(open).not.toHaveBeenCalled()
    await fireEvent.compositionEnd(input())
    expect(onCompositionChange).toHaveBeenLastCalledWith(false)
    // Safari may deliver compositionend before the confirming keydown.
    expect(enter({ isComposing: false, keyCode: 229 }).defaultPrevented).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(enter().defaultPrevented).toBe(false)
    // jsdom has no native Enter default action; Chrome verifies the physical keystroke.
    submit()
    expect(open).toHaveBeenCalledExactlyOnceWith('https://search.test/Alpha?q=%E4%B8%AD%E6%96%87%20%26%20text&again=%E4%B8%AD%E6%96%87%20%26%20text', '_blank', 'noopener,noreferrer')
  })

  it('recognizes native composing flags even without an observed compositionstart and preserves explicit click submission', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(SearchBox, { searchEngine: setting, query: 'ready' })
    expect(enter({ isComposing: true }).defaultPrevented).toBe(true)
    expect(open).not.toHaveBeenCalled()
    expect(enter({ keyCode: 229 }).defaultPrevented).toBe(true)
    expect(enter().defaultPrevented).toBe(false)
    submit()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('clears the composition readiness projection on unmount and preserves the read-only preview', async () => {
    const onCompositionChange = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const view = render(SearchBox, { searchEngine: setting, query: 'draft', onCompositionChange })
    await fireEvent.compositionStart(input())
    view.unmount()
    expect(onCompositionChange.mock.calls.map(([active]) => active)).toEqual([true, false])
    render(SearchBox, { searchEngine: setting, query: 'preview', preview: true })
    expect(input().readOnly).toBe(true)
    expect(document.getElementById(input().getAttribute('aria-describedby')!)?.textContent).toContain('只读预览')
    submit()
    expect(open).not.toHaveBeenCalled()
  })

  it('entering a read-only preview releases unfinished composition so normal Enter works after returning', async () => {
    const onCompositionChange = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const view = render(SearchBox, { searchEngine: setting, query: 'ready', onCompositionChange })
    await fireEvent.compositionStart(input())
    await view.rerender({ searchEngine: setting, query: 'ready', preview: true, onCompositionChange })
    expect(onCompositionChange).toHaveBeenLastCalledWith(false)
    await view.rerender({ searchEngine: setting, query: 'ready', preview: false, onCompositionChange })
    expect(enter().defaultPrevented).toBe(false)
    submit()
    expect(open).toHaveBeenCalledTimes(1)
  })
})
