// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/svelte'
import BookmarkCard from '../../../src/components/BookmarkCard.svelte'
import SpotlightBookmarkIcon from '../../../src/components/SpotlightBookmarkIcon.svelte'
import type { PublicBookmark } from '../../../shared/types'

const bookmark: PublicBookmark = {
  id: 42, category_id: 1, title: 'Recovery', url: 'https://example.test',
  icon: 'https://example.test/icon.png', icon_source: 'custom', icon_cached: true,
  icon_blob: null, icon_background_color: null, description: null, open_method: 1, sort: 0,
}
let urls = 0
beforeEach(() => {
  vi.useFakeTimers()
  urls = 0
  const TestURL = class extends URL {}
  Object.assign(TestURL, { createObjectURL: vi.fn(() => 'blob:recovery-' + ++urls), revokeObjectURL: vi.fn() })
  vi.stubGlobal('URL', TestURL)
  vi.stubGlobal('IntersectionObserver', undefined)
  const cache = { match: async () => undefined, keys: async () => [], put: vi.fn(), delete: async () => true }
  const caches = { open: async () => cache, delete: async () => true }
  vi.stubGlobal('caches', caches)
  Object.defineProperty(window, 'caches', { value: caches, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  window.localStorage.clear()
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function image(fallback = false) {
  return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: {
    'content-type': 'image/svg+xml', 'cache-control': 'no-store', ...(fallback ? { 'X-Icon-Fallback': '1' } : {}),
  } })
}

for (const [name, Component] of [['home', BookmarkCard], ['spotlight', SpotlightBookmarkIcon]] as const) {
  describe(name + ' icon recovery', () => {
    it.each(['', 'test-grant'])('recovers a fallback without editing (grant=%s)', async (iconAccessKey) => {
      const fetch = vi.fn().mockResolvedValueOnce(image(true)).mockResolvedValueOnce(image())
      vi.stubGlobal('fetch', fetch)
      const { container } = render(Component, { props: { bookmark, iconAccessKey } })
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovery-1'))
      await fireEvent.load(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(1200)
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovery-2'))
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fetch.mock.calls[1][0]).toBe(fetch.mock.calls[0][0])
      expect(String(fetch.mock.calls[0][0]).includes('key=')).toBe(Boolean(iconAccessKey))
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recovery-1')
      await fireEvent.load(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('recovers a network error and stops retries when unmounted', async () => {
      const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(image(true))
      vi.stubGlobal('fetch', fetch)
      const { unmount } = render(Component, { props: { bookmark } })
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
      await vi.advanceTimersByTimeAsync(1200)
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
      unmount()
      await vi.advanceTimersByTimeAsync(60000)
      window.dispatchEvent(new Event('focus'))
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    it('cancels the old retry budget when the authorization grant changes', async () => {
      const fetch = vi.fn().mockResolvedValueOnce(image(true)).mockResolvedValueOnce(image())
      vi.stubGlobal('fetch', fetch)
      const { container, rerender } = render(Component, { props: { bookmark, iconAccessKey: 'old-grant' } })
      await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
      await rerender({ bookmark, iconAccessKey: 'new-grant' })
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovery-2'))
      expect(fetch.mock.calls[1][0]).toContain('key=new-grant')
      await fireEvent.load(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it.each(['', 'test-grant'])('recovers an uncached HTTP icon after its direct image request fails (grant=%s)', async (iconAccessKey) => {
      const fetch = vi.fn(async () => image())
      vi.stubGlobal('fetch', fetch)
      const { container } = render(Component, { props: { bookmark: { ...bookmark, icon_cached: false }, iconAccessKey } })
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe(bookmark.icon))
      expect(fetch).not.toHaveBeenCalled()
      await fireEvent.error(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(1200)
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovery-1'))
      expect(fetch).toHaveBeenCalledOnce()
      expect(fetch.mock.calls[0]?.[0]).toMatch(/^\/api\/icon\/42\?v=/)
      expect(String(fetch.mock.calls[0]?.[0]).includes('key=')).toBe(Boolean(iconAccessKey))
      await fireEvent.load(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledOnce()
    })


    it('bounds uncached-icon recovery and stops retrying a permanently unavailable proxy', async () => {
      const fetch = vi.fn(async () => new Response('not found', { status: 404 }))
      vi.stubGlobal('fetch', fetch)
      const { container } = render(Component, { props: { bookmark: { ...bookmark, icon_cached: false } } })
      await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
      await fireEvent.error(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(1200)
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledOnce()
      expect(container.querySelector('img')).toBeNull()
    })

    it('recovers an uncached direct failure in duplicate cards with a single shared proxy request', async () => {
      const fetch = vi.fn(async () => image())
      vi.stubGlobal('fetch', fetch)
      const first = render(Component, { props: { bookmark: { ...bookmark, icon_cached: false } } })
      const second = render(Component, { props: { bookmark: { ...bookmark, icon_cached: false } } })
      await vi.waitFor(() => expect(first.container.querySelector('img')).not.toBeNull())
      await vi.waitFor(() => expect(second.container.querySelector('img')).not.toBeNull())
      await fireEvent.error(first.container.querySelector('img')!)
      await fireEvent.error(second.container.querySelector('img')!)
      window.dispatchEvent(new Event('focus'))
      await vi.waitFor(() => expect(first.container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/))
      await vi.waitFor(() => expect(second.container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/))
      expect(fetch).toHaveBeenCalledOnce()
      expect(first.container.querySelector('img')?.getAttribute('src')).not.toBe(second.container.querySelector('img')?.getAttribute('src'))
    })

    it('re-evaluates a failed direct icon when refreshed aggregate data acquires a cache', async () => {
      const fetch = vi.fn(async () => image())
      vi.stubGlobal('fetch', fetch)
      const { container, rerender } = render(Component, { props: { bookmark: { ...bookmark, icon_cached: false } } })
      await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
      await fireEvent.error(container.querySelector('img')!)
      await rerender({ bookmark: { ...bookmark, icon_cached: true } })
      await vi.waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:recovery-1'))
      expect(fetch).toHaveBeenCalledOnce()
    })

    it('does not retry forever when HTTP succeeds but image decoding fails', async () => {
      const fetch = vi.fn(async () => image())
      vi.stubGlobal('fetch', fetch)
      const { container } = render(Component, { props: { bookmark } })
      for (const delay of [1200, 4000, 10000]) {
        await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
        await fireEvent.error(container.querySelector('img')!)
        await vi.advanceTimersByTimeAsync(delay)
      }
      await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
      await fireEvent.error(container.querySelector('img')!)
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetch).toHaveBeenCalledTimes(4)
    })

  })
}
