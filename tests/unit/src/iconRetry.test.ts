// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIconRetry } from '../../../src/lib/iconRetry'

let dispose: (() => void) | undefined
beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => { dispose?.(); vi.useRealTimers() })

describe('bounded icon recovery', () => {
  it('limits automatic retries and rate-limits later focus probes', async () => {
    const retry = vi.fn(() => controller.failed())
    const controller = createIconRetry(retry)
    dispose = controller.dispose
    controller.failed()
    await vi.advanceTimersByTimeAsync(90000)
    expect(retry).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(0)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('online'))
    expect(retry).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(30000)
    expect(retry).toHaveBeenCalledTimes(4)
    window.dispatchEvent(new Event('online'))
    expect(retry).toHaveBeenCalledTimes(5)
  })

  it('defers requests while hidden or offline and recovers on visibility/online', async () => {
    const retry = vi.fn()
    const controller = createIconRetry(retry)
    dispose = controller.dispose
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    controller.failed()
    await vi.advanceTimersByTimeAsync(1200)
    expect(retry).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(retry).not.toHaveBeenCalled()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('cancels timers and listeners on success, identity change or disposal', async () => {
    const retry = vi.fn()
    const controller = createIconRetry(retry)
    dispose = controller.dispose
    controller.failed()
    controller.reset()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(20000)
    expect(retry).not.toHaveBeenCalled()
    controller.failed()
    controller.dispose()
    controller.failed()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(20000)
    expect(retry).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
