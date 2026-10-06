// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assessModalActions, pageModalMetrics, pageModalsClosed, waitForModal, pageModalFault } from '../../scripts/lib/modalAcceptanceProbe.mjs'

function bounds(element: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => ({ left, top, right: left + width, bottom: top + height, x: left, y: top, width, height }) })
}
function fixture() {
  document.body.innerHTML = '<div data-testid="bookmark-modal"><form><div class="modal-actions"><button type="button">取消</button><button type="submit" disabled>保存</button></div></form></div>'
  const card = document.querySelector('[data-testid="bookmark-modal"]')!
  const bar = card.querySelector('.modal-actions')!
  const [cancel, save] = [...bar.querySelectorAll('button')]
  bounds(card, 10, 10, 370, 824)
  bounds(bar, 24, 770, 342, 54)
  bounds(cancel, 218, 781, 60, 32)
  bounds(save, 286, 781, 60, 32)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number, y: number) => [...bar.querySelectorAll('button')].find((e) => { const b = e.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom }) ?? card })
  return { card, bar, cancel, save }
}
const measure = () => pageModalMetrics().results.bookmarkActions

beforeEach(() => { vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('acceptance modal readiness and action bar contract', () => {
  it('waits for lazy UI readiness without synthesizing input', async () => {
    vi.useFakeTimers()
    let ready = false
    setTimeout(() => { ready = true }, 900)
    const pending = waitForModal(async () => ready, 'lazy dialog')
    await vi.advanceTimersByTimeAsync(960)
    expect(await pending).toBe(true)
  })
  it('fails a missing required element rather than skipping', async () => {
    vi.useFakeTimers()
    const pending = expect(waitForModal(async () => null, 'missing dialog', 160)).rejects.toThrow('missing dialog')
    await vi.advanceTimersByTimeAsync(240)
    await pending
    expect(assessModalActions(null)).toEqual({ passed: false, failures: ['missing-action-bar'] })
  })
  it('does not accept an unrelated dialog as the bookmark modal', () => {
    document.body.innerHTML = '<div class="modal-card" aria-labelledby="unrelated-dialog"></div>'
    expect(pageModalMetrics().results.bookmarkModal).toBeNull()
  })
  it('accepts the actual form action bar including a disabled empty-form save button', () => {
    fixture()
    expect(assessModalActions(measure())).toEqual({ passed: true, failures: [] })
  })
  it('does not measure an unrelated footer as the action bar', () => {
    const { bar } = fixture()
    bar.className = 'different-contract'
    bar.innerHTML = '<footer><button>取消</button><button>保存</button></footer>'
    expect(measure()).toBeNull()
    expect(assessModalActions(measure()).passed).toBe(false)
  })
  it('rejects an empty bar rather than passing zero buttons on one row', () => {
    fixture().bar.innerHTML = ''
    expect(assessModalActions(measure()).failures).toContain('missing-required-controls')
  })
  it('rejects a missing cancel or save control', () => {
    fixture().save.remove()
    expect(assessModalActions(measure()).passed).toBe(false)
  })
  it('rejects invisible controls and disabled cancel', () => {
    const { cancel } = fixture()
    cancel.style.display = 'none'
    expect(assessModalActions(measure()).passed).toBe(false)
    cancel.style.display = ''
    cancel.disabled = true
    expect(assessModalActions(measure()).passed).toBe(false)
  })
  it('rejects hidden action bars', () => {
    fixture().bar.style.visibility = 'hidden'
    expect(assessModalActions(measure()).failures).toContain('hidden-action-bar')
  })
  it('rejects wrapping and buttons outside the bar', () => {
    const { save } = fixture()
    bounds(save, 286, 813, 60, 32)
    expect(assessModalActions(measure()).failures).toEqual(expect.arrayContaining(['wrapped', 'buttonsInside']))
  })
  it('allows subpixel alignment differences but not a second row', () => {
    const { save } = fixture()
    bounds(save, 286, 781.4, 60, 32)
    expect(assessModalActions(measure()).passed).toBe(true)
  })
  it('rejects card overflow even when the viewport is not exceeded', () => {
    bounds(fixture().bar, 0, 770, 390, 54)
    expect(assessModalActions(measure()).failures).toContain('overflowsCard')
  })
  it('rejects vertical viewport overflow', () => {
    bounds(fixture().bar, 24, 820, 342, 54)
    expect(assessModalActions(measure()).failures).toContain('overflowsViewport')
  })
  it('rejects an occluding overlay', () => {
    fixture()
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.body })
    expect(assessModalActions(measure()).failures).toContain('hitTargets')
  })
  it.each(['missing', 'empty', 'hidden', 'overflow', 'covered'])('restores the original DOM after %s negative control', (fault) => {
    fixture()
    const original = document.body.innerHTML
    const saved = pageModalFault(fault)
    expect(document.body.innerHTML).not.toBe(original)
    expect(pageModalFault('restore', saved)).toBe(true)
    expect(document.body.innerHTML).toBe(original)
    expect(assessModalActions(measure()).passed).toBe(true)
  })
  it('keeps dialog close verification read-only', () => {
    const { card } = fixture()
    const cancel = vi.fn()
    card.addEventListener('click', cancel)
    expect(pageModalsClosed()).toBe(false)
    expect(cancel).not.toHaveBeenCalled()
    card.remove()
    expect(pageModalsClosed()).toBe(true)
  })
})

describe('acceptance precache readiness', () => {
  function probe() {
    const source = readFileSync('scripts/prod-acceptance.mjs', 'utf8')
    const start = source.indexOf('async function waitForPrecache(')
    const end = source.indexOf('// ── 场景', start)
    return new Function('pageCacheReport', 'sleep', source.slice(start, end) + '; return waitForPrecache')(
      () => {}, (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    )
  }

  it('waits for both entry assets to arrive in the same runtime cache', async () => {
    vi.useFakeTimers()
    const empty = { entries: [{ key: 'cf-navs-v123', urls: [] }], totalBytes: 0 }
    const ready = { entries: [{ key: 'cf-navs-v123', urls: ['/assets/index-ready.js', '/assets/index-ready.css'] }], totalBytes: 100 }
    const call = vi.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(empty).mockResolvedValue(ready)
    const pending = probe()({ call })
    await vi.runAllTimersAsync()
    expect(await pending).toBe(ready)
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('returns missing evidence at timeout so the acceptance assertion still fails', async () => {
    vi.useFakeTimers()
    const empty = { entries: [], totalBytes: 0 }
    const pending = probe()({ call: vi.fn(async () => empty) }, 300)
    await vi.runAllTimersAsync()
    expect(await pending).toBe(empty)
  })
})
