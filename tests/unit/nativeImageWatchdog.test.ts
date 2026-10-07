// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNativeImageWatchdog } from '../../src/lib/nativeImageWatchdog'

describe('native image watchdog', () => {
  let image: HTMLImageElement
  let callback: IntersectionObserverCallback
  let observer: IntersectionObserver
  let options: IntersectionObserverInit | undefined
  let rect: DOMRect
  let watchdog: ReturnType<typeof createNativeImageWatchdog>
  let onTimeout: ReturnType<typeof vi.fn>
  const url = '/icons/a.png'
  const nextUrl = '/icons/b.png'

  function intersection(visible: boolean) {
    callback([{
      target: image, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
      boundingClientRect: rect,
    } as IntersectionObserverEntry], observer)
  }
  function update(source = url, enabled = true) {
    watchdog.update({ url: source, enabled })
  }
  function hidden(value: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, value })
    document.dispatchEvent(new Event('visibilitychange'))
  }
  function online(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    hidden(false)
    online(true)
    rect = new DOMRect(10, 10, 24, 24)
    image = document.createElement('img')
    image.src = url
    image.loading = 'lazy'
    document.body.append(image)
    Object.defineProperties(image, {
      complete: { configurable: true, value: false },
      naturalWidth: { configurable: true, value: 0 },
    })
    vi.spyOn(image, 'getBoundingClientRect').mockImplementation(() => rect)
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        callback = cb
        options = init
        observer = this as unknown as IntersectionObserver
      }
    })
    onTimeout = vi.fn()
    watchdog = createNativeImageWatchdog(image, onTimeout)
  })

  afterEach(() => {
    watchdog.destroy()
    image.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'hidden')
    Reflect.deleteProperty(window.navigator, 'onLine')
    vi.useRealTimers()
  })

  it('waits for viewport confirmation, then times out once after 10 seconds', () => {
    expect(options).toEqual({ root: null, rootMargin: '0px', threshold: 0 })
    update()
    vi.advanceTimersByTime(30000)
    expect(vi.getTimerCount()).toBe(0)
    intersection(false)
    vi.advanceTimersByTime(30000)
    expect(onTimeout).not.toHaveBeenCalled()
    intersection(true)
    vi.advanceTimersByTime(9999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
    intersection(false)
    intersection(true)
    update(nextUrl)
    update(url)
    vi.advanceTimersByTime(30000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts a full deadline after leaving and reentering the viewport', () => {
    update()
    intersection(true)
    vi.advanceTimersByTime(9000)
    intersection(false)
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(20000)
    intersection(true)
    vi.advanceTimersByTime(9999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it.each(['load', 'error'])('%s ends the current wait', (event) => {
    update()
    intersection(true)
    vi.advanceTimersByTime(5000)
    image.dispatchEvent(new Event(event))
    intersection(true)
    update()
    vi.advanceTimersByTime(20000)
    expect(onTimeout).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not postpone the deadline on identical updates or visibility notifications', () => {
    update()
    intersection(true)
    vi.advanceTimersByTime(9000)
    update()
    intersection(true)
    online(true)
    vi.advanceTimersByTime(1000)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it.each(['source', 'disable', 'destroy'])('%s cancels the old deadline', (action) => {
    update()
    intersection(true)
    vi.advanceTimersByTime(9000)
    if (action === 'source') update(nextUrl)
    if (action === 'disable') update(url, false)
    if (action === 'destroy') watchdog.destroy()
    vi.advanceTimersByTime(1000)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(9000)
    if (action === 'source') expect(onTimeout).toHaveBeenCalledExactlyOnceWith(nextUrl)
    else expect(onTimeout).not.toHaveBeenCalled()
  })

  it.each(['hidden', 'offline'])('suspends while %s and resumes with a fresh deadline', (state) => {
    const suspend = state === 'hidden' ? hidden : (value: boolean) => online(!value)
    suspend(true)
    update()
    intersection(true)
    vi.advanceTimersByTime(20000)
    expect(vi.getTimerCount()).toBe(0)
    suspend(false)
    vi.advanceTimersByTime(9000)
    suspend(true)
    vi.advanceTimersByTime(20000)
    expect(onTimeout).not.toHaveBeenCalled()
    suspend(false)
    vi.advanceTimersByTime(9999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('ignores a stale queued callback even when switching away and back to the same URL', () => {
    const timers = vi.spyOn(window, 'setTimeout')
    update()
    intersection(true)
    const stale = timers.mock.calls[0][0] as () => void
    update(nextUrl)
    update(url)
    stale()
    expect(onTimeout).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(10000)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it.each(['before', 'during'])('does not report a successfully completed image (%s waiting)', (when) => {
    const complete = () => Object.defineProperties(image, {
      complete: { value: true }, naturalWidth: { value: 24 },
    })
    if (when === 'before') complete()
    update()
    intersection(true)
    if (when === 'during') complete()
    vi.advanceTimersByTime(10000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('does not mistake complete with zero natural width for success', () => {
    Object.defineProperty(image, 'complete', { value: true })
    update()
    intersection(true)
    vi.advanceTimersByTime(10000)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('falls back to geometry, rejects empty/offscreen boxes, and wakes on scroll/resize', () => {
    watchdog.destroy()
    vi.stubGlobal('IntersectionObserver', undefined)
    watchdog = createNativeImageWatchdog(image, onTimeout)
    rect = new DOMRect(0, 0, 0, 0)
    update()
    vi.advanceTimersByTime(20000)
    expect(vi.getTimerCount()).toBe(0)
    for (const box of [new DOMRect(-30, 0, 24, 24), new DOMRect(0, -30, 24, 24),
      new DOMRect(window.innerWidth, 0, 24, 24), new DOMRect(0, window.innerHeight, 24, 24)]) {
      rect = box
      window.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(20000)
      expect(onTimeout).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    }
    rect = new DOMRect(0, 0, 24, 24)
    image.dispatchEvent(new Event('scroll')) // Captured, even without bubbling.
    vi.advanceTimersByTime(9000)
    rect = new DOMRect(0, 0, 0, 0)
    window.dispatchEvent(new Event('resize'))
    expect(vi.getTimerCount()).toBe(0)
    rect = new DOMRect(0, 0, 24, 24)
    window.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(10000)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('rechecks fallback geometry at the deadline even without a scroll event', () => {
    watchdog.destroy()
    vi.stubGlobal('IntersectionObserver', undefined)
    watchdog = createNativeImageWatchdog(image, onTimeout)
    update()
    rect = new DOMRect(0, 0, 0, 0)
    vi.advanceTimersByTime(10000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('cleans up observers/listeners and rejects callbacks and updates after destruction', () => {
    const imageRemove = vi.spyOn(image, 'removeEventListener')
    const documentRemove = vi.spyOn(document, 'removeEventListener')
    const windowRemove = vi.spyOn(window, 'removeEventListener')
    update()
    intersection(true)
    watchdog.destroy()
    watchdog.destroy()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(imageRemove.mock.calls.map(([type]) => type)).toEqual(['load', 'error'])
    expect(documentRemove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    for (const type of ['online', 'offline', 'resize']) {
      expect(windowRemove).toHaveBeenCalledWith(type, expect.any(Function))
    }
    expect(windowRemove).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    intersection(true)
    update(nextUrl)
    hidden(false)
    online(true)
    vi.advanceTimersByTime(20000)
    expect(onTimeout).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts a fresh deadline when reenabled without changing the URL', () => {
    update()
    intersection(true)
    vi.advanceTimersByTime(9000)
    update(url, false)
    vi.advanceTimersByTime(20000)
    update()
    vi.advanceTimersByTime(9999)
    expect(onTimeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
  })

  it('removes fallback listeners on destruction', () => {
    watchdog.destroy()
    vi.stubGlobal('IntersectionObserver', undefined)
    watchdog = createNativeImageWatchdog(image, onTimeout)
    update()
    watchdog.destroy()
    const geometry = vi.mocked(image.getBoundingClientRect)
    geometry.mockClear()
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    hidden(false)
    online(true)
    expect(geometry).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('supports a custom deadline without mutating attributes or fetching', () => {
    watchdog.destroy()
    const original = image.outerHTML
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const setAttribute = vi.spyOn(image, 'setAttribute')
    const src = vi.spyOn(image, 'src', 'set')
    watchdog = createNativeImageWatchdog(image, onTimeout, 500)
    update()
    intersection(true)
    vi.advanceTimersByTime(500)
    expect(onTimeout).toHaveBeenCalledExactlyOnceWith(url)
    expect(image.outerHTML).toBe(original)
    expect(setAttribute).not.toHaveBeenCalled()
    expect(src).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
