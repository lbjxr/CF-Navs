// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

type PanelView = 'popup' | 'sync' | 'pending-list'
type PanelMessage = { type: string; view?: PanelView }
type PanelResponse = { ok: boolean; visible: boolean; view?: PanelView }
type MessageListener = (
  message: PanelMessage,
  sender: object,
  sendResponse: (response: PanelResponse) => void,
) => boolean

const CONTENT_SOURCE = 'cf-navs-extension-content'
const contentScript = readFileSync('browser-extension/content.js', 'utf8')
const windows: JSDOM[] = []

function createRuntime() {
  const listeners: MessageListener[] = []
  const runtime = {
    lastError: undefined,
    sendMessage: vi.fn((_message: PanelMessage, callback?: () => void) => callback?.()),
    // No extension server is needed to exercise the real iframe DOM. Extension
    // origins and actual pointer hit testing are covered in Chrome verification.
    getURL: vi.fn((_file: string) => 'about:blank'),
    onMessage: { addListener: vi.fn((listener: MessageListener) => listeners.push(listener)) },
  }
  return { runtime, listeners }
}

function createPanelHost() {
  // Each controller gets its own real DOM/global scope; closing it also removes
  // the script's document/window listeners and any iframe timers after a test.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://host.example/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  windows.push(dom)
  const { runtime, listeners } = createRuntime()
  Object.defineProperty(dom.window, 'chrome', { value: { runtime } })
  const inject = () => dom.window.eval(contentScript)
  inject()

  const send = (message: PanelMessage) => {
    const respond = vi.fn<(response: PanelResponse) => void>()
    for (const listener of listeners) listener(message, {}, respond)
    expect(respond).toHaveBeenCalledTimes(1)
    return respond.mock.calls[0][0]
  }
  const panel = () => {
    const frame = dom.window.document.querySelector<HTMLIFrameElement>('iframe[data-cf-navs-panel="true"]')
    if (!frame) throw new Error('The content script did not create its panel iframe')
    return frame
  }
  const pointerDown = (target: Element) => {
    // jsdom 26 has no PointerEvent constructor, but its DOM dispatches pointerdown
    // with the same capture/bubble path. Real pointer input is verified in Chrome.
    const event = new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true })
    target.dispatchEvent(event)
    return event
  }
  const settleMessages = () => new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0))
  return { dom, runtime, inject, send, panel, pointerDown, settleMessages }
}

function createWebFrame(document: Document) {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  return frame
}

afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close()
})

describe('browser extension panel dismissal', () => {
  it.each<PanelView>(['popup', 'sync', 'pending-list'])(
    'dismisses %s from a captured outside pointerdown without blocking the page control',
    (view) => {
      const host = createPanelHost()
      host.send({ type: 'show-panel', view })
      const frame = host.panel()
      const messagesBefore = host.runtime.sendMessage.mock.calls.slice()
      const control = host.dom.window.document.createElement('input')
      control.type = 'checkbox'
      host.dom.window.document.body.appendChild(control)
      const stopAtTarget = vi.fn((event: Event) => event.stopPropagation())
      const onClick = vi.fn()
      control.addEventListener('pointerdown', stopAtTarget)
      control.addEventListener('click', onClick)

      const event = host.pointerDown(control)
      expect(stopAtTarget).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(false)
      expect(frame.hidden).toBe(true)
      expect(frame.style.getPropertyValue('display')).toBe('none')
      expect(frame.style.getPropertyPriority('display')).toBe('important')
      expect(frame.isConnected).toBe(true)

      control.click()
      expect(onClick).toHaveBeenCalledTimes(1)
      expect(control.checked).toBe(true)
      expect(host.runtime.sendMessage.mock.calls).toEqual(messagesBefore)
    },
  )

  it('keeps the panel visible for clicks and input inside its frame', () => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'popup' })
    const frame = host.panel()
    const input = frame.contentDocument!.createElement('input')
    frame.contentDocument!.body.appendChild(input)

    host.pointerDown(frame)
    host.pointerDown(input)
    input.focus()
    input.value = 'unfinished input'
    input.dispatchEvent(new host.dom.window.Event('input', { bubbles: true }))

    expect(host.dom.window.document.activeElement).toBe(frame)
    expect(frame.hidden).toBe(false)
    expect(frame.style.getPropertyValue('display')).toBe('block')
    expect(input.value).toBe('unfinished input')
  })

  it.each(['show-panel', 'toggle-panel'])('reuses the hidden frame and draft when reopened with %s', (type) => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'sync' })
    const frame = host.panel()
    const input = frame.contentDocument!.createElement('input')
    input.value = 'unsaved bookmark title'
    frame.contentDocument!.body.appendChild(input)
    const messagesBefore = host.runtime.sendMessage.mock.calls.slice()
    host.pointerDown(host.dom.window.document.body)
    expect(frame.hidden).toBe(true)

    expect(host.send({ type, view: 'sync' })).toMatchObject({ ok: true, visible: true, view: 'sync' })

    expect(host.panel()).toBe(frame)
    expect(frame.contentDocument!.querySelector('input')).toBe(input)
    expect(input.value).toBe('unsaved bookmark title')
    expect(host.runtime.getURL).toHaveBeenCalledTimes(1)
    expect(host.runtime.sendMessage.mock.calls).toEqual(messagesBefore)
  })

  it.each([1, 2])('forwards a pointerdown from iframe depth %i without owning a panel', async (depth) => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'popup' })
    const messages: MessageEvent[] = []
    host.dom.window.addEventListener('message', (event) => messages.push(event))
    let document = host.dom.window.document
    const children = []
    for (let level = 0; level < depth; level += 1) {
      const frame = createWebFrame(document)
      const { runtime } = createRuntime()
      const childWindow = frame.contentWindow as unknown as JSDOM['window']
      Object.defineProperty(childWindow, 'chrome', { value: { runtime } })
      childWindow.eval(contentScript)
      childWindow.eval(contentScript)
      document = frame.contentDocument!
      document.dispatchEvent(new host.dom.window.Event('visibilitychange'))
      children.push({ runtime, document })
    }
    const control = document.createElement('input')
    control.type = 'checkbox'
    document.body.appendChild(control)
    const stopAtTarget = vi.fn((event: Event) => event.stopPropagation())
    control.addEventListener('pointerdown', stopAtTarget)

    const event = host.pointerDown(control)
    control.click()
    await host.settleMessages()

    expect(stopAtTarget).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(false)
    expect(control.checked).toBe(true)
    expect(messages).toHaveLength(1)
    expect(messages[0].data).toEqual({ source: CONTENT_SOURCE, type: 'outside-pointerdown' })
    for (const child of children) {
      expect(child.runtime.sendMessage).not.toHaveBeenCalled()
      expect(child.runtime.onMessage.addListener).not.toHaveBeenCalled()
      expect(child.runtime.getURL).not.toHaveBeenCalled()
      expect(child.document.querySelector('[data-cf-navs-panel]')).toBeNull()
    }
    // jsdom postMessage omits event.source. This proves forwarding only; the
    // following tests supply MessageEvent.source to test the receiver boundary.
  })

  it.each([1, 2])('accepts an outside-pointer message from iframe depth %i', (depth) => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'popup' })
    const frame = host.panel()
    const messagesBefore = host.runtime.sendMessage.mock.calls.slice()
    let outsideFrame = createWebFrame(host.dom.window.document)
    for (let level = 1; level < depth; level += 1) outsideFrame = createWebFrame(outsideFrame.contentDocument!)

    host.dom.window.dispatchEvent(new host.dom.window.MessageEvent('message', {
      data: { source: CONTENT_SOURCE, type: 'outside-pointerdown' },
      source: outsideFrame.contentWindow,
    }))

    expect(frame.hidden).toBe(true)
    expect(frame.isConnected).toBe(true)
    expect(host.runtime.sendMessage.mock.calls).toEqual(messagesBefore)
  })

  it('rejects outside-pointer messages from the panel, the host itself, or a missing sender', () => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'popup' })
    const frame = host.panel()

    for (const source of [frame.contentWindow, host.dom.window, null]) {
      host.dom.window.dispatchEvent(new host.dom.window.MessageEvent('message', {
        data: { source: CONTENT_SOURCE, type: 'outside-pointerdown' },
        source: source as Window | null,
      }))
      expect(frame.hidden).toBe(false)
    }
  })

  it('rejects malformed or unrelated messages from a child frame', () => {
    const host = createPanelHost()
    host.send({ type: 'show-panel', view: 'popup' })
    const frame = host.panel()
    const outsideFrame = createWebFrame(host.dom.window.document)
    for (const data of [
      null,
      {},
      { type: 'outside-pointerdown' },
      { source: CONTENT_SOURCE, type: 'show-panel' },
      { source: 'unrelated', type: 'outside-pointerdown' },
      { source: 'cf-navs-extension-panel', type: 'close-panel' },
    ]) {
      host.dom.window.dispatchEvent(new host.dom.window.MessageEvent('message', {
        data,
        source: outsideFrame.contentWindow,
      }))
      expect(frame.hidden).toBe(false)
    }
  })

  it('keeps injection and toolbar toggles idempotent', () => {
    const host = createPanelHost()
    host.send({ type: 'toggle-panel', view: 'popup' })
    const frame = host.panel()

    host.inject()
    expect(host.runtime.onMessage.addListener).toHaveBeenCalledTimes(1)
    expect(host.send({ type: 'toggle-panel', view: 'popup' }).visible).toBe(false)
    expect(host.send({ type: 'toggle-panel', view: 'popup' }).visible).toBe(true)
    expect(host.panel()).toBe(frame)
    expect(host.dom.window.document.querySelectorAll('iframe[data-cf-navs-panel="true"]')).toHaveLength(1)
  })

  it('wires the content script into web frames and their about:blank children', () => {
    // Manifest wiring only; the tests above execute the content script behavior.
    const manifest = JSON.parse(readFileSync('browser-extension/manifest.json', 'utf8'))
    const injection = manifest.content_scripts.find((entry: { js: string[] }) => entry.js.includes('content.js'))
    expect(injection).toMatchObject({ all_frames: true, match_about_blank: true })
  })
})
