// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensionBackground, type ExtensionMessage, type ExtensionResponse, type ExtensionView } from '../helpers/extensionBackground'

const windows: JSDOM[] = []
function openPage(host: ReturnType<typeof createExtensionBackground>, view: ExtensionView, tabId = 1) {
  const file = view === 'sync' ? 'sync-dialog' : view
  const dom = new JSDOM(readFileSync(`browser-extension/${file}.html`, 'utf8'), {
    url: `https://extension.example/${file}.html?panel=${host.state().revision}`,
    runScripts: 'outside-only', pretendToBeVisual: true,
  })
  windows.push(dom)
  const sendMessage = (message: ExtensionMessage, respond: (response: ExtensionResponse) => void) => {
    host.send(message, tabId).then(respond)
  }
  Object.defineProperty(dom.window, 'chrome', { value: { runtime: { sendMessage } } })
  dom.window.scrollTo = vi.fn()
  dom.window.eval(readFileSync('browser-extension/panel-client.js', 'utf8'))
  dom.window.eval(readFileSync(`browser-extension/${file}.js`, 'utf8'))
  const input = (id: string) => dom.window.document.getElementById(id) as HTMLInputElement
  const edit = (id: string, value: string) => {
    input(id).value = value
    input(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  }
  const resume = () => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    source: dom.window as unknown as Window,
    data: { source: 'cf-navs-extension-host', type: 'resume-panel', revision: host.state().revision },
  }))
  return { dom, input, edit, resume }
}

afterEach(() => { for (const dom of windows.splice(0)) dom.window.close() })

describe('extension pages resume their drafts', () => {
  it('restores edited sync fields and category in a different tab', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const first = openPage(host, 'sync')
    await vi.waitFor(() => expect(first.input('bookmark-title').disabled).toBe(false))
    first.edit('bookmark-title', 'Edited title')
    first.edit('bookmark-url', 'https://edited.example/')
    first.edit('category', '7')
    await vi.waitFor(() => expect(host.state().drafts.sync?.title).toBe('Edited title'))

    await host.toolbar(2)
    const second = openPage(host, 'sync', 2)
    await vi.waitFor(() => expect(second.input('bookmark-title').disabled).toBe(false))
    expect(second.input('bookmark-title').value).toBe('Edited title')
    expect(second.input('bookmark-url').value).toBe('https://edited.example/')
    expect(second.input('category').value).toBe('7')
  })

  it('preserves edits made while a resumed category request is loading', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const page = openPage(host, 'sync')
    await vi.waitFor(() => expect(page.input('bookmark-title').disabled).toBe(false))
    let release!: () => void
    const fetch = host.fetch.getMockImplementation()!
    host.fetch.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => { release = resolve })
      return fetch(...args)
    })
    page.resume()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    page.edit('bookmark-title', 'Edited while loading')
    release()
    await vi.waitFor(() => expect(host.state().drafts.sync?.title).toBe('Edited while loading'))
    expect(page.input('bookmark-title').value).toBe('Edited while loading')
    expect(page.input('category').value).toBe('7')
  })

  it('does not silently change an edited category when refreshed categories remove it', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const page = openPage(host, 'sync')
    await vi.waitFor(() => expect(page.input('bookmark-title').disabled).toBe(false))
    page.edit('bookmark-title', 'Keep title')
    host.categories.splice(0, 1, { id: 9, parent_id: null, title: 'Different', sort: 0 })
    page.resume()
    await vi.waitFor(() => expect(page.input('category').value).toBe(''))
    expect(page.input('sync').disabled).toBe(true)
    expect(page.input('bookmark-title').value).toBe('Keep title')
    page.input('category').value = '9'
    page.input('category').dispatchEvent(new page.dom.window.Event('change', { bubbles: true }))
    expect(page.input('sync').disabled).toBe(false)
  })

  it('retains list selection on another tab and returns home through the actual button handler', async () => {
    const host = createExtensionBackground()
    await host.toolbar(1)
    const first = openPage(host, 'pending-list')
    await vi.waitFor(() => expect(first.dom.window.document.querySelectorAll('.item-select')).toHaveLength(2))
    ;(first.dom.window.document.querySelectorAll('.item-select')[1] as HTMLInputElement).click()
    await vi.waitFor(() => expect(host.state().drafts['pending-list']?.selectedKeys).toEqual(['bookmark:22']))
    await host.toolbar(2)
    const second = openPage(host, 'pending-list', 2)
    await vi.waitFor(() => expect(second.dom.window.document.querySelectorAll('.item-select:checked')).toHaveLength(1))
    expect((second.dom.window.document.querySelector('.item-select:checked') as HTMLInputElement).dataset.key).toBe('bookmark:22')
    second.input('home').click()
    await vi.waitFor(() => expect(host.state().view).toBe('popup'))
    const home = openPage(host, 'popup', 2)
    await vi.waitFor(() => expect(home.input('status-text').textContent).toContain('同步已开启'))
  })

  it('preserves connection edits when a late config response arrives', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'navigate-panel', view: 'popup' })
    const page = openPage(host, 'popup')
    await vi.waitFor(() => expect(page.input('baseUrl').value).toBe('https://navigation.example'))
    page.edit('baseUrl', 'https://edited.example')
    page.edit('username', 'sample-user')
    page.resume()
    await vi.waitFor(() => expect(host.state().drafts.popup?.baseUrl).toBe('https://edited.example'))
    expect(page.input('baseUrl').value).toBe('https://edited.example')
    expect(page.input('username').value).toBe('sample-user')
  })
})
