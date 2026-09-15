// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import ConfirmDialog from '../../src/components/ConfirmDialog.svelte'

// 二次确认弹层的可观察契约。此前只有源码文本断言（`toContain('function handleCancel() {\n    if (loading) return')`
// 之类），那种断言连缩进都钉进去了，改个格式就红，却证明不了「处理中还能不能点确认」「Enter 会不会
// 绕过禁用态」。这里挂载真实弹层，按点击与键盘两条路径断言。

afterEach(cleanup)

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(ConfirmDialog, {
    props: {
      open: true,
      title: '删除分类',
      message: '该分类下的书签会一起删除。',
      itemTitle: '常用工具',
      variant: 'danger',
      onConfirm,
      onCancel,
      ...overrides,
    },
  })
  return { onConfirm, onCancel }
}

const confirmButton = () => screen.getByRole('button', { name: '确认' })
const cancelButton = () => screen.getByRole('button', { name: '取消' })

describe('二次确认弹层', () => {
  it('关闭态什么都不渲染', () => {
    renderDialog({ open: false })

    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('以 alertdialog 呈现，标题与说明都接进无障碍树', () => {
    renderDialog()

    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // 读屏要能同时播报标题和后果说明，光有标题不够
    const labelId = dialog.getAttribute('aria-labelledby') as string
    const descId = dialog.getAttribute('aria-describedby') as string
    expect(document.getElementById(labelId)?.textContent).toBe('删除分类')
    expect(document.getElementById(descId)?.textContent).toBe('该分类下的书签会一起删除。')
    expect(dialog.textContent).toContain('常用工具')
  })

  it('点确认与取消各自只触发自己的回调', async () => {
    const { onConfirm, onCancel } = renderDialog()

    await fireEvent.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()

    await fireEvent.click(cancelButton())
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('Enter 等于点确认，Escape 等于点取消', async () => {
    const { onConfirm, onCancel } = renderDialog()

    await fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('处理中时两个按钮都禁用，点击与键盘都不再触发——否则会重复提交删除', async () => {
    const { onConfirm, onCancel } = renderDialog({ loading: true })

    // 进行中态把确认按钮的可见文本换成「处理中...」，可访问名随之改变
    const confirming = screen.getByRole('button', { name: '处理中...' }) as HTMLButtonElement
    expect(confirming.disabled).toBe(true)
    expect((cancelButton() as HTMLButtonElement).disabled).toBe(true)

    await fireEvent.click(confirming)
    await fireEvent.click(cancelButton())
    await fireEvent.keyDown(window, { key: 'Enter' })
    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('确认被禁用时取消仍然可用——不能把用户关在弹层里', async () => {
    const { onConfirm, onCancel } = renderDialog({ confirmDisabled: true })

    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
    expect((cancelButton() as HTMLButtonElement).disabled).toBe(false)

    await fireEvent.click(confirmButton())
    await fireEvent.keyDown(window, { key: 'Enter' })
    expect(onConfirm).not.toHaveBeenCalled()

    await fireEvent.click(cancelButton())
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('点遮罩等于取消', async () => {
    const { onCancel } = renderDialog()

    await fireEvent.click(screen.getByRole('button', { name: '取消确认' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('弹层关闭时键盘不再走确认路径', async () => {
    const { onConfirm } = renderDialog({ open: false })

    await fireEvent.keyDown(window, { key: 'Enter' })

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
