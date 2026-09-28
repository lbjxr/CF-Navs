// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPublicDataFocusRefresh } from '../../src/lib/publicDataFocusRefresh'

describe('installPublicDataFocusRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('窗口重新获得焦点且页面可见时，防抖窗口过后刷新一次', () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    const stop = installPublicDataFocusRefresh(refresh, 300)

    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(299)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })

  it('focus 与 visibilitychange 连续触发合并为一次刷新', () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    const stop = installPublicDataFocusRefresh(refresh, 300)

    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(300)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })

  it('页面隐藏时 focus 不刷新，恢复可见后才刷新', () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    const stop = installPublicDataFocusRefresh(refresh, 300)

    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(300)
    expect(refresh).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(300)
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })

  it('卸载后取消挂起的刷新并移除监听', () => {
    vi.useFakeTimers()
    const refresh = vi.fn(async () => undefined)
    const stop = installPublicDataFocusRefresh(refresh, 300)

    window.dispatchEvent(new Event('focus'))
    stop()
    vi.advanceTimersByTime(300)
    expect(refresh).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(300)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('app wiring', () => {
  it('App.svelte 安装焦点刷新并在卸载时清理', () => {
    const source = readFileSync('src/App.svelte', 'utf8')
    expect(source).toContain('installPublicDataFocusRefresh(() => refreshCurrentData())')
    expect(source).toContain('stopPublicDataFocusRefresh?.()')
  })
})