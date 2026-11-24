// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginModal from '../../src/components/LoginModal.svelte'
import { installNativeDialogStub } from '../helpers/nativeDialog'

// 只验证组件与原生 API、父状态和授权回调的接线。真实焦点包含、滚动 containment
// 与原生回焦点不能由 jsdom/stub 证明，必须在 Chrome 和目标移动浏览器中验证。
let nativeDialog: ReturnType<typeof installNativeDialogStub>
beforeEach(() => { nativeDialog = installNativeDialogStub() })
afterEach(() => {
  cleanup()
  nativeDialog.restore()
  vi.restoreAllMocks()
})

function dialogElement(): HTMLDialogElement {
  return document.querySelector('dialog') as HTMLDialogElement
}

async function fillCredentials() {
  await fireEvent.input(screen.getByLabelText('用户名'), { target: { value: ' visitor ' } })
  await fireEvent.input(screen.getByLabelText('密码'), { target: { value: ' pass with spaces ' } })
}

function requestNativeCancel(): Event {
  const event = new Event('cancel', { cancelable: true })
  dialogElement().dispatchEvent(event)
  return event
}

describe('LoginModal native modal synchronization', () => {
  it('uses showModal for parent open, close for parent dismissal, and keeps the closed node hidden', async () => {
    const onCancel = vi.fn()
    const view = render(LoginModal, { open: false, onCancel })
    const dialog = dialogElement()
    expect(dialog.open).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nativeDialog.showModal).not.toHaveBeenCalled()

    await view.rerender({ open: true })
    expect(nativeDialog.showModal).toHaveBeenCalledExactlyOnceWith()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(dialog.hasAttribute('aria-modal')).toBe(false)
    expect(dialog.hasAttribute('role')).toBe(false)
    expect(screen.getByLabelText('用户名').hasAttribute('autofocus')).toBe(true)

    await view.rerender({ error: '账号或密码错误', loading: true })
    expect(nativeDialog.showModal).toHaveBeenCalledTimes(1)
    expect(nativeDialog.close).not.toHaveBeenCalled()
    await view.rerender({ open: false })
    expect(nativeDialog.close).toHaveBeenCalledExactlyOnceWith()
    expect(screen.queryByRole('dialog')).toBeNull()
    nativeDialog.flushCloseEvents()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps credentials on loading/error changes and clears them only for a new parent open session', async () => {
    const view = render(LoginModal, { open: true })
    await fillCredentials()
    await view.rerender({ loading: true, error: '账号或密码错误' })
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe(' visitor ')
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe(' pass with spaces ')
    expect(screen.getByRole('alert').textContent).toBe('账号或密码错误')
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true')

    await view.rerender({ open: false, loading: false, error: '' })
    await view.rerender({ open: true })
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('')
  })

  it('routes native cancel through the parent and does not call cancellation again for the resulting close', async () => {
    const onCancel = vi.fn(() => { void view.rerender({ open: false }) })
    const view = render(LoginModal, { open: true, onCancel })
    expect(requestNativeCancel().defaultPrevented).toBe(true)
    await waitFor(() => expect(dialogElement().open).toBe(false))
    nativeDialog.flushCloseEvents()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it.each([
    { canCancel: false, loading: false, reason: '当前站点需要登录后才能访问，请完成登录。' },
    { canCancel: true, loading: true, reason: '正在验证账号，请稍候，完成后可继续操作。' },
  ])('refuses cancel when canCancel=$canCancel and loading=$loading, with an accessible reason', async ({ canCancel, loading, reason }) => {
    const onCancel = vi.fn()
    render(LoginModal, { open: true, canCancel, loading, onCancel })
    expect(requestNativeCancel().defaultPrevented).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    expect(dialogElement().open).toBe(true)
    expect(dialogElement().getAttribute('closedby')).toBe('none')
    expect(screen.getByRole('status').textContent).toBe(reason)
    const descriptionId = screen.getByLabelText('用户名').getAttribute('aria-describedby')
    expect(document.getElementById(descriptionId ?? '')?.textContent).toBe(reason)
    expect(screen.getAllByRole('button', { name: '取消' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true)
  })

  it('reopens a native close that would bypass the private gate without resetting credentials', async () => {
    const onCancel = vi.fn()
    render(LoginModal, { open: true, canCancel: false, onCancel })
    await fillCredentials()
    const dialog = dialogElement()
    dialog.returnValue = 'stale-result'
    dialog.close()
    nativeDialog.flushCloseEvents()
    await tick()
    expect(dialog.open).toBe(true)
    expect(nativeDialog.showModal).toHaveBeenCalledTimes(2)
    expect(onCancel).not.toHaveBeenCalled()
    expect(dialog.returnValue).toBe('')
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe(' visitor ')
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe(' pass with spaces ')
  })

  it('also restores a native close while loading and permits cancel again when the request finishes', async () => {
    const onCancel = vi.fn()
    const view = render(LoginModal, { open: true, loading: true, onCancel })
    dialogElement().close()
    nativeDialog.flushCloseEvents()
    await tick()
    expect(dialogElement().open).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    await view.rerender({ loading: false })
    expect(dialogElement().getAttribute('closedby')).toBe('closerequest')
    expect(requestNativeCancel().defaultPrevented).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('notifies the parent once for an allowed native close and honors the parent-kept-open decision', async () => {
    const onCancel = vi.fn()
    render(LoginModal, { open: true, onCancel })
    const dialog = dialogElement()
    dialog.close()
    nativeDialog.flushCloseEvents()
    await tick()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(true)
    dialog.dispatchEvent(new Event('close'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ignores delayed parent close events after reopening and after a successful parent dismissal', async () => {
    const onCancel = vi.fn()
    const view = render(LoginModal, { open: true, onCancel })
    await view.rerender({ open: false })
    await view.rerender({ open: true })
    nativeDialog.flushCloseEvents()
    expect(dialogElement().open).toBe(true)
    expect(onCancel).not.toHaveBeenCalled()
    await view.rerender({ open: false, loading: true })
    nativeDialog.flushCloseEvents()
    expect(dialogElement().open).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('handles a new native close even when an older parent close event is still queued', async () => {
    const onCancel = vi.fn()
    const view = render(LoginModal, { open: true, onCancel })
    await view.rerender({ open: false })
    await view.rerender({ open: true })
    dialogElement().close()
    nativeDialog.flushCloseEvents()
    await tick()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(dialogElement().open).toBe(true)
  })

  it('submits the trimmed username and raw password to the latest callback, then releases on unmount', async () => {
    const firstSubmit = vi.fn()
    const onSubmit = vi.fn()
    const view = render(LoginModal, { open: true, onSubmit: firstSubmit })
    await fillCredentials()
    await view.rerender({ onSubmit })
    await fireEvent.submit(document.querySelector('form') as HTMLFormElement)
    expect(firstSubmit).not.toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ username: 'visitor', password: ' pass with spaces ' })
    const dialog = dialogElement()
    view.unmount()
    expect(nativeDialog.close).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(false)
    nativeDialog.flushCloseEvents()
    await tick()
    expect(dialog.open).toBe(false)
  })
})
