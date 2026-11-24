import { vi } from 'vitest'

// jsdom 没有原生模态算法。这里只模拟 open 与异步 close 事件的接口接线，
// 不模拟 top layer、Tab containment、页面滚动或浏览器回焦点，这些需真实浏览器验证。
export function installNativeDialogStub() {
  const prototype = HTMLDialogElement.prototype
  const showDescriptor = Object.getOwnPropertyDescriptor(prototype, 'showModal')
  const closeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'close')
  const closeEvents: HTMLDialogElement[] = []

  const showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.open) return
    this.open = false
    closeEvents.push(this)
  })

  Object.defineProperty(prototype, 'showModal', { configurable: true, writable: true, value: showModal })
  Object.defineProperty(prototype, 'close', { configurable: true, writable: true, value: close })

  return {
    showModal,
    close,
    flushCloseEvents() {
      for (const dialog of closeEvents.splice(0)) dialog.dispatchEvent(new Event('close'))
    },
    restore() {
      if (showDescriptor) Object.defineProperty(prototype, 'showModal', showDescriptor)
      else Reflect.deleteProperty(prototype, 'showModal')
      if (closeDescriptor) Object.defineProperty(prototype, 'close', closeDescriptor)
      else Reflect.deleteProperty(prototype, 'close')
    },
  }
}
