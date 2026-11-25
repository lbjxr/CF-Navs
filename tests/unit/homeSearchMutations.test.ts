// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyHomeSearchMutations } from '../../scripts/lib/homeSearchMutations.mjs'

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

function fixture() {
  document.body.innerHTML = `<main><div class="search-card"><input /></div><section data-section-id="fixture">
    <span data-category-icon><img alt="" /></span><h3>Category</h3>
    <div class="bookmark-grid"><article class="bookmark-card-shell">
      <div class="bookmark-icon is-info"><span class="icon-text">A</span></div>
      <h4 class="bookmark-title">Title</h4>
    </article></div><div class="unknown">Other</div>
  </section></main>`
  return document.querySelector('main')!
}

async function observeMutation(root: Element, mutate: () => void, attributes = false) {
  const records: MutationRecord[] = []
  const observer = new MutationObserver((batch) => { records.push(...batch) })
  observer.observe(root, { childList: true, characterData: true, subtree: true, attributes })
  try {
    mutate()
    await Promise.resolve()
    expect(records.length).toBeGreaterThan(0)
    return records
  } finally { observer.disconnect() }
}

function expectCounts(records: MutationRecord[], resultRecords: number, decorativeRecords: number, cardStructureRecords = 0) {
  const counts = classifyHomeSearchMutations(records)
  expect(counts).toEqual({ rawRecords: records.length, resultRecords, decorativeRecords, cardStructureRecords })
  expect(counts.rawRecords).toBe(counts.resultRecords + counts.decorativeRecords)
}

interface SearchResult {
  before: { cards: number }
  afterSettled: { cards: number; mutations: number; cardStructureMutations: number }
  immediateAfterLastKey: number
  rebuiltAfterSettle: boolean
  resultSetChanged: boolean
  batches: { at: number; rawRecords: number; resultRecords: number; decorativeRecords: number; cardStructureRecords: number }[]
}

function serializedPageSearch() {
  // Execute the real page function without importing the top-level target/config runner.
  const source = readFileSync('scripts/perf-audit.mjs', 'utf8')
  const start = source.indexOf('async function searchHome(')
  const end = source.indexOf('}.toString()})(', start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return new Function(`"use strict"; return (${source.slice(start, end + 1)})`)() as
    (classify: typeof classifyHomeSearchMutations) => Promise<SearchResult>
}

async function runPageSearch(mode: 'unknown' | 'filter' | 'immediate', classify = classifyHomeSearchMutations) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const root = fixture()
  const grid = root.querySelector('.bookmark-grid')!
  const second = grid.firstElementChild!.cloneNode(true) as Element
  grid.appendChild(second)
  const input = root.querySelector('input')!
  let timer: ReturnType<typeof setTimeout> | undefined
  input.addEventListener('input', () => {
    clearTimeout(timer)
    const value = input.value
    if (mode === 'immediate') {
      root.querySelector('.bookmark-title')!.firstChild!.textContent = value
      return
    }
    if (mode === 'filter') setTimeout(() => {
      root.querySelector('.bookmark-icon')!.replaceChildren(document.createElement('img'))
    }, 20)
    timer = setTimeout(() => {
      if (mode === 'unknown') root.querySelector('.unknown')!.textContent = value
      else if (value) second.remove()
      else grid.appendChild(second)
    }, mode === 'unknown' ? 100 : 120)
  })
  const pending = serializedPageSearch()(classify)
  await vi.runAllTimersAsync()
  return pending
}

describe('home search mutation classification', () => {
  it.each(['image', 'fallback'])('ignores bookmark icon replacement to %s', async (mode) => {
    const root = fixture()
    const icon = root.querySelector('.bookmark-icon')!
    if (mode === 'fallback') icon.replaceChildren(document.createElement('img'))
    const replacement = document.createElement(mode === 'image' ? 'img' : 'span')
    if (mode === 'fallback') replacement.className = 'icon-text'
    const records = await observeMutation(root, () => { icon.replaceChildren(replacement) })
    expectCounts(records, 0, records.length)
    expect(root.querySelectorAll('.bookmark-card-shell')).toHaveLength(1)
  })

  it('ignores category icon fallback replacement and its text updates', async () => {
    const root = fixture()
    const icon = root.querySelector('[data-category-icon]')!
    const fallback = document.createElement('span')
    fallback.className = 'category-icon-text category-icon-fallback'
    fallback.textContent = 'C'
    const replacement = await observeMutation(root, () => { icon.replaceChildren(fallback) })
    expectCounts(replacement, 0, replacement.length)
    const text = await observeMutation(root, () => { fallback.firstChild!.textContent = 'D' })
    expectCounts(text, 0, text.length)
  })

  it.each(['.bookmark-title', 'h3', '.unknown'])('keeps %s text changes as real results', async (selector) => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector(selector)!.firstChild!.textContent = 'Changed'
    })
    expectCounts(records, records.length, 0)
  })

  it('keeps unknown additions outside and inside an icon as real results', async () => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector('.unknown')!.appendChild(document.createElement('span'))
      root.querySelector('.bookmark-icon')!.appendChild(document.createElement('button'))
    })
    expectCounts(records, 2, 0)
  })

  it('keeps a title inside an icon as a result rather than decorative text', async () => {
    const root = fixture()
    const title = document.createElement('span')
    title.className = 'icon-text bookmark-title'
    title.textContent = 'Title'
    root.querySelector('.bookmark-icon')!.replaceChildren(title)
    const records = await observeMutation(root, () => { title.firstChild!.textContent = 'Changed' })
    expectCounts(records, records.length, 0)
  })

  it.each(['add', 'remove'])('keeps whole-card %s mutations as real results', async (operation) => {
    const root = fixture()
    const grid = root.querySelector('.bookmark-grid')!
    const records = await observeMutation(root, () => {
      if (operation === 'add') grid.appendChild(grid.firstElementChild!.cloneNode(true))
      else grid.firstElementChild!.remove()
    })
    expectCounts(records, records.length, 0, records.length)
  })

  it.each(['add', 'remove'])('keeps nested-card %s mutations even inside an icon', async (operation) => {
    const root = fixture()
    const icon = root.querySelector('.bookmark-icon')!
    const wrapper = document.createElement('span')
    wrapper.className = 'icon-text'
    const card = document.createElement('article')
    card.className = 'bookmark-card-shell'
    wrapper.appendChild(card)
    if (operation === 'remove') icon.replaceChildren(wrapper)
    const records = await observeMutation(root, () => {
      if (operation === 'add') icon.appendChild(wrapper)
      else wrapper.remove()
    })
    expectCounts(records, records.length, 0, records.length)
  })

  it('keeps icon-root and result-container replacements as real results', async () => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector('.bookmark-icon')!.remove()
      root.querySelector('.bookmark-grid')!.replaceChildren()
    })
    expectCounts(records, 2, 0, 1)
  })

  it('preserves real records in a mixed batch alongside decorative replacements', async () => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector('.bookmark-icon')!.replaceChildren(document.createElement('img'))
      root.querySelector('.bookmark-title')!.firstChild!.textContent = 'Changed'
    })
    expectCounts(records, 1, 1)
  })

  it('does not treat a result container with an icon marker as dedicated decoration', async () => {
    const root = fixture()
    const grid = root.querySelector('.bookmark-grid')!
    grid.replaceChildren()
    grid.classList.add('bookmark-icon')
    const records = await observeMutation(root, () => { grid.appendChild(document.createElement('img')) })
    expectCounts(records, records.length, 0)
  })

  it.each(['result-container', 'title'])('keeps text beneath a %s ancestor as a real result', async (ancestor) => {
    const root = fixture()
    const icon = root.querySelector('.bookmark-icon')!
    const text = icon.querySelector('.icon-text')!
    if (ancestor === 'result-container') icon.classList.add('bookmark-grid')
    else {
      const title = document.createElement('span')
      title.className = 'bookmark-title'
      icon.replaceChildren(title)
      title.appendChild(text)
    }
    const records = await observeMutation(root, () => { text.firstChild!.textContent = 'Changed' })
    expectCounts(records, records.length, 0)
  })

  it('keeps unobserved mutation types conservative rather than ignoring them', async () => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector('.bookmark-icon')!.setAttribute('data-unknown', 'changed')
    }, true)
    expectCounts(records, records.length, 0)
  })

  it('serializes without module closures and returns counts without DOM or private content', async () => {
    const root = fixture()
    const records = await observeMutation(root, () => {
      root.querySelector('.bookmark-icon')!.replaceChildren(document.createElement('img'))
      root.querySelector('.bookmark-title')!.firstChild!.textContent = 'Changed'
    })
    const serialized = new Function(`"use strict"; return (${classifyHomeSearchMutations.toString()})`)() as typeof classifyHomeSearchMutations
    expect(serialized(records)).toEqual({ rawRecords: 2, resultRecords: 1, decorativeRecords: 1, cardStructureRecords: 0 })
    expect(Object.values(serialized(records)).every((value) => typeof value === 'number')).toBe(true)
  })

  it('rejects a late unknown mutation when the actual card result set never changes', async () => {
    const result = await runPageSearch('unknown')
    expect(result.immediateAfterLastKey).toBe(0)
    expect(result.afterSettled.mutations).toBeGreaterThan(0)
    expect(result.afterSettled.cardStructureMutations).toBe(0)
    expect(result.before.cards).toBe(result.afterSettled.cards)
    expect(result.resultSetChanged).toBe(false)
    expect(result.rebuiltAfterSettle).toBe(false)
  })

  it('accepts real debounced card filtering while ignoring immediate icon decoration', async () => {
    const result = await runPageSearch('filter')
    expect(result.before.cards).toBe(2)
    expect(result.afterSettled.cards).toBe(1)
    expect(result.afterSettled.cardStructureMutations).toBeGreaterThan(0)
    expect(result.immediateAfterLastKey).toBe(0)
    expect(result.resultSetChanged).toBe(true)
    expect(result.rebuiltAfterSettle).toBe(true)
    expect(result.batches.some((batch) => batch.decorativeRecords > 0)).toBe(true)
    expect(result.batches.every((batch) => Object.values(batch).every((value) => typeof value === 'number'))).toBe(true)
  })

  it('rejects all-ignored records even when the card set actually changes', async () => {
    const result = await runPageSearch('filter', (records) => {
      const rawRecords = Array.from(records).length
      return { rawRecords, resultRecords: 0, decorativeRecords: rawRecords, cardStructureRecords: 0 }
    })
    expect(result.resultSetChanged).toBe(true)
    expect(result.immediateAfterLastKey).toBe(0)
    expect(result.afterSettled.cardStructureMutations).toBe(0)
    expect(result.rebuiltAfterSettle).toBe(false)
  })

  it('counts a real immediate mutation sharing the final keystroke timestamp', async () => {
    const result = await runPageSearch('immediate')
    expect(result.immediateAfterLastKey).toBeGreaterThan(0)
    expect(result.rebuiltAfterSettle).toBe(false)
  })

  it('wires serialized classification and both result-evidence guards into the verifier', () => {
    const source = readFileSync('scripts/perf-audit.mjs', 'utf8')
    // Wiring only; the real MutationObserver records above prove classification behavior.
    expect(source).toContain('classifyMutations(list)')
    expect(source).toContain('${classifyHomeSearchMutations.toString()}')
    expect(source).toContain('result.homeSearch.immediateAfterLastKey === 0 && result.homeSearch.rebuiltAfterSettle === true')
    expect(source).toContain('batch.cardStructureRecords > 0 && batch.at > lastKeyAt + IMMEDIATE_WINDOW_MS')
    expect(source).toContain('batch.at >= lastKeyAt')
    expect(source).toContain('const IMMEDIATE_WINDOW_MS = 60')
  })
})
