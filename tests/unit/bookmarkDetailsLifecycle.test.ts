// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BookmarkDetailsDialog from '../../src/components/BookmarkDetailsDialog.svelte'
import type { PublicBookmark } from '../../shared/types'
import { installNativeDialogStub } from '../helpers/nativeDialog'

// Native API wiring and parent notification only. Top layer, Tab, Escape, focus
// return and long-content geometry are verified with real Chrome, not this stub.
let nativeDialog: ReturnType<typeof installNativeDialogStub>
beforeEach(() => { nativeDialog = installNativeDialogStub() })
afterEach(() => {
  cleanup()
  nativeDialog.restore()
  vi.restoreAllMocks()
})

function bookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 1, category_id: 1, title: '完整书签标题',
    url: 'https://reading.example/long-path', description: '完整说明',
    icon: null, icon_source: null, icon_background_color: null, icon_blob: null,
    open_method: 1, sort: 0, ...overrides,
  }
}

const element = () => document.querySelector('dialog') as HTMLDialogElement

describe('bookmark details native lifecycle', () => {
  it('opens natively once and exposes a named dialog and native close control', () => {
    render(BookmarkDetailsDialog, { bookmark: bookmark() })
    expect(nativeDialog.showModal).toHaveBeenCalledExactlyOnceWith()
    expect(element().open).toBe(true)
    expect(screen.getByRole('dialog', { name: '书签详情' })).toBe(element())
    expect(screen.getByRole('button', { name: '关闭详情' }).hasAttribute('autofocus')).toBe(true)
    expect(element().querySelector('form')?.getAttribute('method')).toBe('dialog')
  })

  it('renders the full supplied title, description, URL and source as text', () => {
    const data = bookmark({
      title: '长中文标题（完整内容）'.repeat(12),
      description: '第一段说明\n第二段 <script>literal text</script> ' + '详细内容'.repeat(40),
      url: 'https://reading.example/' + 'unbroken-path'.repeat(20),
    })
    render(BookmarkDetailsDialog, { bookmark: data, sourceCategoryTitle: '完整来源分类' })
    expect(element().querySelector('h2')?.textContent).toBe(data.title)
    expect(element().querySelector('.details-description')?.textContent).toBe(data.description)
    expect(element().querySelector('.details-url')?.textContent).toBe(data.url)
    expect(screen.getByText('完整来源分类')).toBeDefined()
    expect(element().querySelector('script')).toBeNull()
  })

  it('uses the empty-description fallback and omits an absent source', () => {
    render(BookmarkDetailsDialog, { bookmark: bookmark({ description: null }) })
    expect(screen.getByText('暂无说明')).toBeDefined()
    expect(screen.queryByText('来源分类')).toBeNull()
  })

  it('updates supplied content without reopening or discarding the modal', async () => {
    const view = render(BookmarkDetailsDialog, { bookmark: bookmark() })
    const initial = element()
    await view.rerender({ bookmark: bookmark({ title: '更新标题', description: '更新说明' }) })
    expect(element()).toBe(initial)
    expect(initial.open).toBe(true)
    expect(screen.getByRole('heading', { name: '更新标题' })).toBeDefined()
    expect(screen.getByText('更新说明')).toBeDefined()
    expect(nativeDialog.showModal).toHaveBeenCalledTimes(1)
  })

  it('notifies the parent once for native dismissal and clears stale return values', () => {
    const onClose = vi.fn()
    render(BookmarkDetailsDialog, { bookmark: bookmark(), onClose })
    const dialog = element()
    dialog.returnValue = 'old-choice'
    dialog.close()
    nativeDialog.flushCloseEvents()
    expect(onClose).toHaveBeenCalledExactlyOnceWith()
    expect(dialog.returnValue).toBe('')
    dialog.dispatchEvent(new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores an obsolete close event while the dialog is still open', () => {
    const onClose = vi.fn()
    render(BookmarkDetailsDialog, { bookmark: bookmark(), onClose })
    element().dispatchEvent(new Event('close'))
    expect(element().open).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on unmount without notifying a disposed parent from a queued event', () => {
    const onClose = vi.fn()
    const view = render(BookmarkDetailsDialog, { bookmark: bookmark(), onClose })
    const dialog = element()
    view.unmount()
    expect(dialog.open).toBe(false)
    expect(nativeDialog.close).toHaveBeenCalledExactlyOnceWith()
    nativeDialog.flushCloseEvents()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps reopened instances independent of a removed dialog and its close event', () => {
    const firstClose = vi.fn()
    const secondClose = vi.fn()
    const first = render(BookmarkDetailsDialog, { bookmark: bookmark(), onClose: firstClose })
    const previousId = element().getAttribute('aria-labelledby')
    first.unmount()
    render(BookmarkDetailsDialog, { bookmark: bookmark({ id: 2 }), onClose: secondClose })
    expect(element().getAttribute('aria-labelledby')).not.toBe(previousId)
    nativeDialog.flushCloseEvents()
    expect(element().open).toBe(true)
    expect(firstClose).not.toHaveBeenCalled()
    expect(secondClose).not.toHaveBeenCalled()
  })
})
