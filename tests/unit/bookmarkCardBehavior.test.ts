// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import BookmarkCard from '../../src/components/BookmarkCard.svelte'
import { recordBookmarkClick } from '../../src/lib/dataService'
import { installNativeDialogStub } from '../helpers/nativeDialog'
import type { PublicBookmark } from '../../shared/types'

vi.mock('../../src/lib/dataService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/lib/dataService')>(),
  recordBookmarkClick: vi.fn(),
}))

function bookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 701, category_id: 1,
    title: '完整中文长标题'.repeat(12),
    url: `https://example.test/${'long-path-'.repeat(24)}`,
    description: `第一段完整说明\n${'长说明内容'.repeat(80)}`,
    icon: '字', icon_source: null, icon_cached: false,
    icon_blob: null, icon_background_color: null, open_method: 1, sort: 0,
    ...overrides,
  }
}

let native: ReturnType<typeof installNativeDialogStub>
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  native = installNativeDialogStub()
  fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('IntersectionObserver', undefined)
})
afterEach(() => {
  cleanup()
  native.flushCloseEvents()
  native.restore()
  vi.unstubAllGlobals()
})

const styles = ['info', 'icon'] as const
const sizeCases = styles.flatMap((style) => [40, 60, 120].map((height) => ({ style, height })))
const modeCases = styles.flatMap((style) => (['preview', 'sortMode'] as const).map((mode) => ({ style, mode })))
const linkCases = styles.flatMap((style) => ([1, 2, 3] as const).map((openMethod) => ({ style, openMethod })))

describe('bookmark cards without a separate details action', () => {
  it.each(styles)('%s card has no details button or dialog and preserves its primary link and text', (style) => {
    const item = bookmark()
    const { container } = render(BookmarkCard, { bookmark: item, style, sourceCategoryTitle: '来源分类' })
    const link = container.querySelector('a.bookmark-card') as HTMLAnchorElement
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
    expect(link.getAttribute('href')).toBe(item.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.querySelector('button')).toBeNull()
    expect(container.textContent).toContain(item.title)
    if (style === 'info') expect(container.querySelector('.bookmark-source')?.textContent).toBe('来源分类')
    else expect(link.getAttribute('title')).toContain('来自：来源分类')
    expect(native.showModal).not.toHaveBeenCalled()
    expect(recordBookmarkClick).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(sizeCases)('$style card retains its configured dimensions at height=$height', ({ style, height }) => {
    const { container } = render(BookmarkCard, { bookmark: bookmark(), style, width: 160, height, iconSize: 48 })
    const shell = container.querySelector('.bookmark-card-shell') as HTMLElement
    const link = container.querySelector('a.bookmark-card') as HTMLAnchorElement
    expect(shell.classList.contains(style === 'info' ? 'is-info' : 'is-icon')).toBe(true)
    if (style === 'info') {
      expect(shell.style.height).toBe(`${height}px`)
      expect(link.style.height).toBe(`${height}px`)
    } else {
      expect(shell.style.height).toBe('')
      expect(link.style.height).toBe('48px')
      expect(link.style.width).toBe('48px')
    }
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
  })

  it.each(modeCases)('$style $mode remains non-navigating and has no details action before or after return', async ({ style, mode }) => {
    const item = bookmark()
    const view = render(BookmarkCard, { bookmark: item, style, [mode]: true })
    const link = view.container.querySelector('a.bookmark-card') as HTMLAnchorElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(recordBookmarkClick).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
    await view.rerender({ bookmark: item, style, [mode]: false })
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
    expect((view.container.querySelector('a.bookmark-card') as HTMLAnchorElement).getAttribute('href')).toBe(item.url)
    expect(native.showModal).not.toHaveBeenCalled()
  })

  it.each(linkCases)('$style primary link records one visit and retains open_method=$openMethod', async ({ style, openMethod }) => {
    const item = bookmark({ open_method: openMethod })
    const { container } = render(BookmarkCard, { bookmark: item, style })
    const link = container.querySelector('a.bookmark-card') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(item.url)
    expect(link.getAttribute('target')).toBe(openMethod === 1 ? '_blank' : null)
    // Suppress jsdom navigation only; the real card handler still records and chooses its access mode.
    link.addEventListener('click', (event) => event.preventDefault(), { once: true })
    await fireEvent.click(link)
    expect(recordBookmarkClick).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(native.showModal).not.toHaveBeenCalled()
    expect(Boolean(document.querySelector('iframe'))).toBe(openMethod === 3)
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
  })
})
