import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { vi } from 'vitest'

export type ExtensionView = 'popup' | 'pending-list' | 'sync'
export type PanelContext = { view: ExtensionView; revision: number; instanceId?: string }
export type ExtensionMessage = { type: string; panel?: PanelContext; [key: string]: unknown }
export type ExtensionResponse = { ok: boolean; error?: string; [key: string]: unknown }
export type ExtensionTab = { id: number; url: string; active: boolean; windowId: number }
export type ExtensionBookmark = { id: string; title: string; url: string }
export type ExtensionSession = {
  version: number; view: ExtensionView; revision: number; tabId: number | null;
  drafts: Partial<Record<ExtensionView, Record<string, unknown>>>;
}

function event() {
  const listeners: ((...args: unknown[]) => void)[] = []
  return {
    addListener: (listener: (...args: unknown[]) => void) => listeners.push(listener),
    emit: (...args: unknown[]) => { for (const listener of listeners) listener(...args) },
  }
}

export function createExtensionBackground() {
  const local: Record<string, unknown> = {
    baseUrl: 'https://navigation.example', token: 'synthetic-session', enabled: true,
    pendingSyncBookmarks: [
      { title: 'Alpha', url: 'https://alpha.example/', browserBookmarkId: '11' },
      { title: 'Beta', url: 'https://beta.example/', browserBookmarkId: '22' },
    ],
  }
  const session: Record<string, unknown> = {}
  const tabs: ExtensionTab[] = [
    { id: 1, url: 'https://host.example/a', active: true, windowId: 1 },
    { id: 2, url: 'https://host.example/b', active: false, windowId: 1 },
    { id: 3, url: 'https://host.example/c', active: false, windowId: 1 },
  ]
  const bookmarks: ExtensionBookmark[] = [
    { id: '11', title: 'Alpha', url: 'https://alpha.example/' },
    { id: '22', title: 'Beta', url: 'https://beta.example/' },
  ]
  const storageArea = (data: Record<string, unknown>) => ({
    get: vi.fn(async (defaults: Record<string, unknown>) => structuredClone({ ...defaults, ...data })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)) }),
    remove: vi.fn(async (key: string) => { delete data[key] }),
  })
  const storage = { local: storageArea(local), session: storageArea(session) }
  const calls: { tabId: number; message: ExtensionMessage }[] = []
  const sendToTab = vi.fn(async (tabId: number, message: ExtensionMessage) => {
    calls.push({ tabId, message: structuredClone(message) })
    return { ok: true, visible: true }
  })
  const categories = [{ id: 7, parent_id: null, title: 'Tools', sort: 0 }]
  const fetch = vi.fn(async (_url: string, _options?: { body?: string; method?: string }) => ({
    ok: true, status: 200,
    json: async () => ({ code: 0, data: _url.endsWith('/api/categories') ? categories : { created: 1, skipped: 0 } }),
  }))
  let listeners: ((message: ExtensionMessage, sender: object, respond: (response: ExtensionResponse) => void) => boolean)[] = []
  let events = { action: event(), created: event(), activated: event(), updated: event(), removed: event(), focused: event() }

  function startWorker() {
    listeners = []
    events = { action: event(), created: event(), activated: event(), updated: event(), removed: event(), focused: event() }
    const world = createContext({
      URL, structuredClone, console, fetch,
      importScripts: (file: string) => runInContext(readFileSync(`browser-extension/${file}`, 'utf8'), world),
      chrome: {
        storage,
        tabs: {
          get: async (id: number) => tabs.find((tab) => tab.id === id),
          query: async ({ active, windowId }: { active?: boolean; windowId?: number }) =>
            tabs.filter((tab) => (!active || tab.active) && (windowId == null || tab.windowId === windowId)),
          sendMessage: sendToTab, onActivated: events.activated, onUpdated: events.updated, onRemoved: events.removed,
        },
        bookmarks: {
          get: async (id: string) => bookmarks.filter((item) => item.id === id),
          search: async ({ url }: { url: string }) => bookmarks.filter((item) => item.url === url),
          onCreated: events.created,
        },
        scripting: { executeScript: vi.fn(async () => undefined) },
        windows: { WINDOW_ID_NONE: -1, onFocusChanged: events.focused },
        action: { onClicked: events.action },
        runtime: { onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) } },
      },
    })
    runInContext(readFileSync('browser-extension/background.js', 'utf8'), world)
  }
  startWorker()
  const send = (message: ExtensionMessage, tabId = 1) => new Promise<ExtensionResponse>((resolve) => {
    listeners[0](message, { tab: tabs.find((tab) => tab.id === tabId), url: 'chrome-extension://fixture/popup.html' }, resolve)
  })
  const state = () => session.panelSession as ExtensionSession
  const context = (): PanelContext => ({ view: state().view, revision: state().revision })
  const activate = (tabId: number) => {
    for (const tab of tabs) tab.active = tab.id === tabId
    events.activated.emit({ tabId, windowId: 1 })
  }
  const toolbar = async (tabId = 1) => {
    activate(tabId)
    const before = calls.length
    events.action.emit(tabs.find((tab) => tab.id === tabId))
    await vi.waitFor(() => {
      if (!calls.slice(before).some((call) => call.tabId === tabId && call.message.type === 'toggle-panel')) {
        throw new Error('Toolbar did not present a panel')
      }
    })
    return context()
  }
  const createBookmark = (bookmark: ExtensionBookmark) => {
    bookmarks.push(bookmark)
    events.created.emit(bookmark.id, bookmark)
  }
  return { local, session, storage, tabs, bookmarks, calls, fetch, categories, send, state, context, activate, toolbar, createBookmark, startWorker }
}
