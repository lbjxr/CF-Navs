// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BookmarkModalShell from '../../src/components/BookmarkModalShell.svelte'

afterEach(cleanup)

describe('bookmark edit loading shell', () => {
  it('shows loading immediately with no save fields and allows cancel', async () => {
    const onCancel = vi.fn()
    render(BookmarkModalShell, { reading: true, onCancel })
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toContain('正在读取书签')
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('announces failures and provides a working retry', async () => {
    const onRetry = vi.fn()
    render(BookmarkModalShell, { readError: '读取失败，请重试。', onRetry })
    expect(screen.getByRole('alert').textContent).toBe('读取失败，请重试。')
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('false')
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('cancels with Escape, traps Tab and restores focus and scrolling on unmount', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onCancel = vi.fn()
    const view = render(BookmarkModalShell, { reading: true, onCancel })
    const dialog = screen.getByRole('dialog')
    expect(document.activeElement).toBe(dialog)
    await fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }))
    await fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })
})
