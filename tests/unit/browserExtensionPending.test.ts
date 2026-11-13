// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

type PendingBookmark = { title: string; url: string; browserBookmarkId?: string }
type PendingMessage = { type: string; keys?: string[] }
type PendingResponse = { ok: boolean; error?: string; items?: unknown[]; count?: number }
type MessageListener = (
  message: PendingMessage,
  sender: object,
  respond: (response: PendingResponse) => void,
) => boolean

const backgroundScript = readFileSync('browser-extension/background.js', 'utf8')
const sessionScript = readFileSync('browser-extension/panel-session.js', 'utf8')
const clientScript = readFileSync('browser-extension/panel-client.js', 'utf8')
const pendingScript = readFileSync('browser-extension/pending-list.js', 'utf8')
const pendingHtml = readFileSync('browser-extension/pending-list.html', 'utf8')
const windows: JSDOM[] = []
const fixtures: PendingBookmark[] = [
  { title: 'Alpha', url: 'https://alpha.example/', browserBookmarkId: '11' },
  { title: 'Beta', url: 'https://beta.example/', browserBookmarkId: '22' },
  { title: 'Gamma', url: 'https://gamma.example/', browserBookmarkId: '33' },
]

async function createPendingPanel(initial = fixtures) {
  // Execute both production scripts. Only Chrome's storage, bookmarks and tab
  // boundaries are replaced; filtering and the runtime message handler are real.
  const local: Record<string, unknown> = { pendingSyncBookmarks: structuredClone(initial) }
  const session: Record<string, unknown> = {}
  const area = (data: Record<string, unknown>) => ({
    get: vi.fn(async (defaults: Record<string, unknown>) => structuredClone({ ...defaults, ...data })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)) }),
    remove: vi.fn(async (key: string) => { delete data[key] }),
  })
  const storage = { local: area(local), session: area(session) }
  const bookmarks = initial.filter((item) => item.browserBookmarkId).map((item) => ({
    id: item.browserBookmarkId!, title: item.title, url: item.url,
  }))
  const listeners: MessageListener[] = []
  const event = () => ({ addListener: vi.fn() })
  const webTab = { id: 1, url: 'https://host.example/', active: true }
  const tabs = {
    query: vi.fn(async () => [webTab]),
    get: vi.fn(async () => webTab),
    sendMessage: vi.fn(async () => ({ ok: true })),
    onActivated: event(), onUpdated: event(), onRemoved: event(),
  }
  runInNewContext(`${sessionScript}\n${backgroundScript}`, {
    URL, console, structuredClone, importScripts: vi.fn(),
    chrome: {
      storage, tabs,
      bookmarks: {
        get: async (id: string) => bookmarks.filter((item) => item.id === id),
        search: async ({ url }: { url: string }) => bookmarks.filter((item) => item.url === url),
        onCreated: event(),
      },
      windows: { WINDOW_ID_NONE: -1, onFocusChanged: event() },
      action: { onClicked: event() },
      runtime: { onMessage: { addListener: (listener: MessageListener) => listeners.push(listener) } },
    },
  })
  expect(listeners).toHaveLength(1)

  const dom = new JSDOM(pendingHtml, {
    url: 'https://extension.example/pending-list.html',
    runScripts: 'outside-only',
  })
  windows.push(dom)
  const sendMessage = vi.fn((message: PendingMessage, respond: (response: PendingResponse) => void) => {
    listeners[0](message, { tab: webTab }, respond)
  })
  Object.defineProperty(dom.window, 'chrome', { value: { runtime: { sendMessage } } })
  const confirm = vi.fn(() => true)
  dom.window.confirm = confirm
  dom.window.eval(clientScript)
  dom.window.eval(pendingScript)

  const input = (selector: string) => {
    const element = dom.window.document.querySelector<HTMLInputElement>(selector)
    if (!element) throw new Error(`Missing pending-list control: ${selector}`)
    return element
  }
  const checkboxes = () => Array.from(dom.window.document.querySelectorAll<HTMLInputElement>('.item-select'))
  const selected = () => checkboxes().filter((element) => element.checked).map((element) => element.dataset.key)
  const choose = (...keys: string[]) => {
    for (const element of checkboxes()) {
      if (element.checked !== keys.includes(element.dataset.key!)) element.click()
    }
  }
  const stored = () => local.pendingSyncBookmarks as PendingBookmark[]
  const status = () => input('#status').textContent
  const idle = async () => { await vi.waitFor(() => expect(input('#refresh').disabled).toBe(false)) }
  await idle()
  return { dom, input, checkboxes, selected, choose, stored, status, idle, local, session, storage, bookmarks, tabs, sendMessage, confirm }
}

afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close()
})

describe('browser extension pending selection', () => {
  it('starts with no selection and reports the selected count', async () => {
    const panel = await createPendingPanel()
    expect(panel.checkboxes()).toHaveLength(3)
    expect(panel.selected()).toEqual([])
    expect(panel.input('#select-all').checked).toBe(false)
    expect(panel.input('#remove-selected').disabled).toBe(true)
    expect(panel.input('#sync-selected').disabled).toBe(true)
    expect(panel.input('#summary').textContent).toContain('已选 0 条')
  })

  it('deletes only one checked record and leaves the remaining records unchecked', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    expect(panel.input('#select-all').indeterminate).toBe(true)
    expect(panel.input('#summary').textContent).toContain('已选 1 条')
    panel.input('#remove-selected').click()
    await panel.idle()

    expect(panel.confirm).toHaveBeenCalledWith(expect.stringContaining('选中的 1 条'))
    expect(panel.sendMessage).toHaveBeenCalledWith({ type: 'remove-pending', keys: ['bookmark:22'] }, expect.any(Function))
    expect(panel.stored()).toEqual([fixtures[0], fixtures[2]])
    expect(panel.bookmarks).toHaveLength(3)
    expect(panel.checkboxes()).toHaveLength(2)
    expect(panel.selected()).toEqual([])
    expect(panel.input('#remove-selected').disabled).toBe(true)
    expect(panel.input('#sync-selected').disabled).toBe(true)
  })

  it('keeps a partial selection through refresh and uses it for deletion', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.input('#select-all').indeterminate).toBe(true)

    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([fixtures[0], fixtures[2]])
  })

  it('does not select records that arrive while refreshing an explicitly selected batch', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:11', 'bookmark:22', 'bookmark:33')
    const added = { title: 'New', url: 'https://new.example/' }
    panel.local.pendingSyncBookmarks = [...panel.stored(), added]
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.selected()).toEqual(['bookmark:11', 'bookmark:22', 'bookmark:33'])
    expect(panel.checkboxes()).toHaveLength(4)
    expect(panel.input('#select-all').indeterminate).toBe(true)

    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([added])
    expect(panel.selected()).toEqual([])
  })

  it('drops a selection that no longer exists without selecting its neighbors', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.local.pendingSyncBookmarks = [fixtures[0], fixtures[2]]
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.selected()).toEqual([])
    expect(panel.input('#remove-selected').disabled).toBe(true)
    expect(panel.input('#select-all').indeterminate).toBe(false)
  })

  it('retains the selection when bookmark status changes', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.bookmarks[1].url = 'https://changed.example/'
    panel.bookmarks.splice(2, 1)
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.dom.window.document.querySelectorAll('.item.changed')).toHaveLength(1)
    expect(panel.dom.window.document.querySelectorAll('.item.missing')).toHaveLength(1)
    expect(panel.stored()).toEqual(fixtures)
  })

  it('cancels deletion without changing storage or selection', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.confirm.mockReturnValue(false)
    panel.input('#remove-selected').click()
    expect(panel.stored()).toEqual(fixtures)
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.sendMessage.mock.calls.some(([message]) => message.type === 'remove-pending')).toBe(false)
  })

  it('deletes two checked records while retaining the unchecked middle record', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:11', 'bookmark:33')
    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([fixtures[1]])
    expect(panel.selected()).toEqual([])
  })

  it('deletes all records only after explicitly selecting all', async () => {
    const panel = await createPendingPanel()
    panel.choose()
    panel.input('#select-all').click()
    expect(panel.selected()).toHaveLength(3)
    expect(panel.input('#select-all').indeterminate).toBe(false)
    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([])
    expect(panel.input('#select-all').disabled).toBe(true)
    expect(panel.input('#remove-selected').disabled).toBe(true)
  })

  it('disables both batch actions after deselecting all', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:11', 'bookmark:22', 'bookmark:33')
    panel.input('#select-all').click()
    expect(panel.selected()).toEqual([])
    expect(panel.input('#remove-selected').disabled).toBe(true)
    expect(panel.input('#sync-selected').disabled).toBe(true)
    panel.input('#remove-selected').click()
    expect(panel.confirm).not.toHaveBeenCalled()
    expect(panel.stored()).toEqual(fixtures)
  })

  it('preserves rows and selection after a failed refresh', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'))
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.status()).toBe('Storage unavailable')
    expect(panel.checkboxes()).toHaveLength(3)
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.stored()).toEqual(fixtures)
    panel.input('#refresh').click()
    await panel.idle()
    expect(panel.selected()).toEqual(['bookmark:22'])
  })

  it('keeps selection after a failed delete so a retry has the same scope', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.storage.local.set.mockRejectedValueOnce(new Error('Storage is full'))
    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.status()).toBe('Storage is full')
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.stored()).toEqual(fixtures)
    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([fixtures[0], fixtures[2]])
  })

  it('locks checkbox input while a refresh is pending', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    let finishRead!: (value: Record<string, unknown>) => void
    panel.storage.local.get.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve }))
    panel.input('#refresh').click()
    await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'))
    expect(panel.checkboxes().every((element) => element.disabled)).toBe(true)
    expect(panel.input('#select-all').disabled).toBe(true)
    expect(panel.input('#remove-selected').disabled).toBe(true)
    panel.checkboxes()[0].click()
    finishRead(structuredClone(panel.local))
    await panel.idle()
    expect(panel.selected()).toEqual(['bookmark:22'])
    expect(panel.checkboxes().every((element) => !element.disabled)).toBe(true)
  })

  it('passes only selected keys to the existing sync flow', async () => {
    const panel = await createPendingPanel()
    panel.choose('bookmark:22')
    panel.input('#sync-selected').click()
    await vi.waitFor(() => expect(panel.session.syncSelectionKeys).toEqual(['bookmark:22']))
    expect(panel.stored()).toEqual(fixtures)
    expect(panel.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'show-panel', view: 'sync', revision: 1 })
  })

  it('deletes one legacy record with a URL key without affecting other missing records', async () => {
    const legacy = fixtures.map(({ title, url }) => ({ title, url }))
    const panel = await createPendingPanel(legacy)
    expect(panel.dom.window.document.querySelectorAll('.item.missing')).toHaveLength(3)
    panel.choose('url:https://beta.example/')
    panel.input('#remove-selected').click()
    await panel.idle()
    expect(panel.stored()).toEqual([legacy[0], legacy[2]])
    expect(panel.selected()).toEqual([])
  })
})
