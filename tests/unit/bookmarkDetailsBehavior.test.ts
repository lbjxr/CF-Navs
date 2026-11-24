// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import BookmarkCard from '../../src/components/BookmarkCard.svelte'
import { recordBookmarkClick } from '../../src/lib/dataService'
import { installNativeDialogStub } from '../helpers/nativeDialog'
import type { PublicBookmark } from '../../shared/types'

vi.mock('../../src/lib/dataService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/lib/dataService')>(),
  recordBookmarkClick: vi.fn(),
}))

function bookmark(over: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 701, category_id: 1,
    title: '完整中文长标题'.repeat(12),
    url: `https://example.test/${'long-path-'.repeat(24)}`,
    description: `第一段完整说明\n${'长说明内容'.repeat(80)}`,
    icon: '字', icon_source: null, icon_cached: false,
    icon_blob: null, icon_background_color: null, open_method: 1, sort: 0,
    ...over,
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const detailsButton = () => screen.getByRole('button', { name: /查看「.*」详情/ })
const detailsDialog = () => screen.getByRole('dialog', { name: '书签详情' }) as HTMLDialogElement

async function closeDetails() {
  detailsDialog().close()
  native.flushCloseEvents()
  await tick()
}

describe('bookmark full details native dialog', () => {
  it.each(['info', 'icon'] as const)('%s card has an independent visible detail action with complete data and no visit or fetch', async (style) => {
    const item = bookmark()
    const view = render(BookmarkCard, { bookmark: item, style, descriptionMode: 'hidden', showDescription: false, sourceCategoryTitle: '来源分类' })
    const button = detailsButton()
    expect(button.textContent).toBe('详情')
    expect(button.closest('a')).toBeNull()
    expect(view.container.querySelectorAll('a.bookmark-card')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(native.showModal).not.toHaveBeenCalled()
    await fireEvent.click(button)
    const dialog = detailsDialog()
    expect(native.showModal).toHaveBeenCalledExactlyOnceWith()
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('.details-title')?.textContent).toBe(item.title)
    expect(dialog.querySelector('.details-description')?.textContent).toBe(item.description)
    expect(dialog.querySelector('.details-url')?.textContent).toBe(item.url)
    expect(dialog.querySelector('.details-source')?.textContent).toBe('来源分类')
    expect(dialog.querySelector('a')).toBeNull()
    expect(dialog.querySelector('form')?.method).toBe('dialog')
    expect(recordBookmarkClick).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('native close synchronizes parent state and a later explicit open mounts a fresh dialog', async () => {
    render(BookmarkCard, { bookmark: bookmark() })
    await fireEvent.click(detailsButton())
    const first = detailsDialog()
    first.returnValue = 'close'
    await closeDetails()
    expect(first.returnValue).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(native.close).toHaveBeenCalledTimes(1)
    await fireEvent.click(detailsButton())
    expect(detailsDialog()).not.toBe(first)
    expect(native.showModal).toHaveBeenCalledTimes(2)
  })

  it.each(['sortMode', 'preview'] as const)('%s clears the active native modal and does not revive it on return', async (flag) => {
    const view = render(BookmarkCard, { bookmark: bookmark() })
    await fireEvent.click(detailsButton())
    const dialog = detailsDialog()
    await view.rerender({ bookmark: bookmark(), [flag]: true })
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
    expect(dialog.open).toBe(false)
    expect(native.close).toHaveBeenCalledTimes(1)
    native.flushCloseEvents()
    await view.rerender({ bookmark: bookmark(), [flag]: false })
    expect(detailsButton()).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
  })

  it.each(['sortMode', 'preview'] as const)('initial %s mounts safely with no detail action, then enables it normally', async (flag) => {
    const view = render(BookmarkCard, { bookmark: bookmark(), height: 120, [flag]: true })
    expect(screen.queryByRole('button', { name: /查看「.*」详情/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
    expect(native.showModal).not.toHaveBeenCalled()
    expect((view.container.querySelector('a.bookmark-card') as HTMLAnchorElement).style.height).toBe('120px')
    await view.rerender({ bookmark: bookmark(), height: 120, [flag]: false })
    await fireEvent.click(detailsButton())
    expect(detailsDialog().open).toBe(true)
  })

  it('reusing a card for another bookmark releases the old modal and ignores its delayed close', async () => {
    const view = render(BookmarkCard, { bookmark: bookmark() })
    await fireEvent.click(detailsButton())
    const oldDialog = detailsDialog()
    const next = bookmark({ id: 702, title: '另一条书签', url: 'https://another.test/' })
    await view.rerender({ bookmark: next })
    expect(oldDialog.open).toBe(false)
    expect(screen.queryByRole('dialog', { name: '书签详情' })).toBeNull()
    await fireEvent.click(detailsButton())
    const current = detailsDialog()
    native.flushCloseEvents()
    await tick()
    expect(current.open).toBe(true)
    expect(current.querySelector('.details-title')?.textContent).toBe(next.title)
  })

  it('unmount closes the native modal before discarding its node', async () => {
    const view = render(BookmarkCard, { bookmark: bookmark() })
    await fireEvent.click(detailsButton())
    const dialog = detailsDialog()
    view.unmount()
    expect(dialog.open).toBe(false)
    expect(dialog.isConnected).toBe(false)
    expect(native.close).toHaveBeenCalledTimes(1)
  })

  it('detail pointer/touch/click does not reach ancestors or start the card long press', async () => {
    vi.useFakeTimers()
    const onEdit = vi.fn()
    const view = render(BookmarkCard, { bookmark: bookmark(), canEdit: true, onEdit })
    const ancestor = vi.fn()
    for (const type of ['pointerdown', 'touchstart', 'click']) view.container.addEventListener(type, ancestor)
    const touch = { touches: [{ clientX: 10, clientY: 10 }] }
    // A detail gesture also cancels a timer that began on the primary link.
    await fireEvent.touchStart(view.container.querySelector('a.bookmark-card')!, touch)
    ancestor.mockClear()
    await fireEvent.pointerDown(detailsButton(), { pointerType: 'touch' })
    await fireEvent.touchStart(detailsButton(), touch)
    await vi.advanceTimersByTimeAsync(600)
    expect(screen.queryByTestId('bookmark-context-edit')).toBeNull()
    await fireEvent.click(detailsButton())
    expect(ancestor).not.toHaveBeenCalled()
    expect(detailsDialog().open).toBe(true)
    // Reading/holding the modal's text must not start the card's ancestor gesture.
    await fireEvent.touchStart(detailsDialog(), touch)
    await vi.advanceTimersByTimeAsync(600)
    expect(screen.queryByTestId('bookmark-context-edit')).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    expect(recordBookmarkClick).not.toHaveBeenCalled()
    await closeDetails()
    // Existing primary-link long press remains the edit-menu entry.
    await fireEvent.touchStart(view.container.querySelector('a.bookmark-card')!, touch)
    await vi.advanceTimersByTimeAsync(501)
    await vi.waitFor(() => expect(screen.queryByTestId('bookmark-context-edit')).not.toBeNull())
  })

  it.each([1, 2, 3] as const)('primary link still records a visit and retains open_method=%s', async (openMethod) => {
    const item = bookmark({ open_method: openMethod })
    const view = render(BookmarkCard, { bookmark: item })
    const link = view.container.querySelector('a.bookmark-card') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(item.url)
    expect(link.getAttribute('target')).toBe(openMethod === 1 ? '_blank' : null)
    // Suppress jsdom's unimplemented navigation only; the card's actual click handler still runs.
    link.addEventListener('click', (event) => event.preventDefault(), { once: true })
    await fireEvent.click(link)
    expect(recordBookmarkClick).toHaveBeenCalledExactlyOnceWith(item.id)
    expect(native.showModal).not.toHaveBeenCalled()
    expect(Boolean(document.querySelector('iframe'))).toBe(openMethod === 3)
  })
})
