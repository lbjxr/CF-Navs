// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeSearchBoxVisibility } from '../../../src/lib/searchBoxVisibility'

const realIO = globalThis.IntersectionObserver

afterEach(() => {
  globalThis.IntersectionObserver = realIO
  vi.restoreAllMocks()
})

// 注入可控的假 IntersectionObserver：记录 observe/disconnect，并把回调暴露出来手动触发。
function installFakeIO() {
  const state: {
    cb: IntersectionObserverCallback | null
    observed: Element[]
    disconnected: number
    options: IntersectionObserverInit | undefined
  } = { cb: null, observed: [], disconnected: 0, options: undefined }

  class FakeIO {
    constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      state.cb = cb
      state.options = options
    }
    observe(el: Element) { state.observed.push(el) }
    disconnect() { state.disconnected += 1 }
    unobserve() { }
    takeRecords() { return [] }
    root = null
    rootMargin = ''
    thresholds = []
  }
  globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver
  const emit = (isIntersecting: boolean) => state.cb?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
  return { state, emit }
}

describe('observeSearchBoxVisibility', () => {
  it('用 threshold:0 观察目标元素，并按相交状态回调 true/false', () => {
    const { state, emit } = installFakeIO()
    const el = document.createElement('div')
    const seen: boolean[] = []

    const stop = observeSearchBoxVisibility(el, (visible) => seen.push(visible))

    expect(state.observed).toEqual([el])
    expect(state.options?.threshold).toBe(0)
    expect(state.options?.rootMargin ?? undefined).toBeUndefined()

    emit(false) // 离屏
    emit(true) // 回到视口
    expect(seen).toEqual([false, true])

    stop()
    expect(state.disconnected).toBe(1)
  })

  it('无 IntersectionObserver 时回调恒 true 且清理为 no-op', () => {
    // @ts-expect-error 故意移除以模拟不支持的环境
    globalThis.IntersectionObserver = undefined
    const el = document.createElement('div')
    const seen: boolean[] = []

    const stop = observeSearchBoxVisibility(el, (visible) => seen.push(visible))

    expect(seen).toEqual([true])
    expect(() => stop()).not.toThrow()
  })
})
