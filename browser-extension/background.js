importScripts('panel-session.js')

const DEFAULT_CONFIG = {
  baseUrl: '',
  token: '',
  expiresAt: 0,
  username: '',
  enabled: false,
}
const PENDING_KEY = 'pendingSyncBookmarks'
const RECENT_WEB_TAB_KEY = 'recentWebTabId'
const SYNC_SELECTION_KEY = 'syncSelectionKeys'
const PANEL_SESSION_KEY = 'panelSession'
let recentWebTabId = null
let pendingMutation = Promise.resolve()
let syncSelectionKeys = null
let syncSelectionLoaded = false
let syncSelectionRevision = 0
let panelIntent = 0
let syncingKey = null
const panelSession = createPanelSession({
  read: async () => chrome.storage.session
    ? (await chrome.storage.session.get({ [PANEL_SESSION_KEY]: null }))[PANEL_SESSION_KEY] : null,
  write: async (state) => {
    if (chrome.storage.session) await chrome.storage.session.set({ [PANEL_SESSION_KEY]: state })
  },
})

function messageContext(message, sender) {
  return message.panel ? { ...message.panel, tabId: sender.tab?.id ?? null } : null
}

async function requireCurrentPanel(message, sender) {
  const context = messageContext(message, sender)
  if (context && !await panelSession.isCurrent(context)) throw new Error('弹窗已切换，请在当前页面继续操作')
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

async function getConfig() {
  const stored = await chrome.storage.local.get(DEFAULT_CONFIG)
  return { ...DEFAULT_CONFIG, ...stored, baseUrl: normalizeBaseUrl(stored.baseUrl) }
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username: String(username || '').trim(), password }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload || payload.code !== 0 || !payload.data?.token) {
    throw new Error(payload?.msg || '登录失败')
  }
  return payload.data
}

async function apiRequest(path, options = {}) {
  const config = await getConfig()
  if (!config.enabled || !config.baseUrl || !config.token) throw new Error('请先登录并开启同步')

  if (config.expiresAt && config.expiresAt <= Date.now()) {
    await chrome.storage.local.set({ token: '', expiresAt: 0 })
    throw new Error('登录会话已过期，请打开扩展重新登录')
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${config.token}`,
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => null)
  if (response.status === 401) {
    await chrome.storage.local.set({ token: '', expiresAt: 0 })
    throw new Error('登录会话已过期，请打开扩展重新登录')
  }
  if (!response.ok || !payload || payload.code !== 0) {
    throw new Error(payload?.msg || '请求失败')
  }
  return payload.data
}

async function getPending() {
  const stored = await chrome.storage.local.get({ [PENDING_KEY]: [] })
  return Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] : []
}

function pendingKey(item) {
  const browserBookmarkId = String(item?.browserBookmarkId || '').trim()
  return browserBookmarkId ? `bookmark:${browserBookmarkId}` : `url:${String(item?.url || '')}`
}

function filterPendingBySelection(pending, selection) {
  if (!Array.isArray(selection)) return pending
  const selected = new Set(selection)
  return pending.filter((item) => selected.has(pendingKey(item)))
}

async function loadSyncSelection() {
  if (syncSelectionLoaded || !chrome.storage.session) return syncSelectionKeys
  try {
    const stored = await chrome.storage.session.get({ [SYNC_SELECTION_KEY]: null })
    if (!syncSelectionLoaded) {
      syncSelectionKeys = Array.isArray(stored[SYNC_SELECTION_KEY]) ? stored[SYNC_SELECTION_KEY] : null
    }
  } catch {
    if (!syncSelectionLoaded) syncSelectionKeys = null
  }
  syncSelectionLoaded = true
  return syncSelectionKeys
}

async function setSyncSelection(keys) {
  syncSelectionRevision += 1
  syncSelectionKeys = [...new Set((Array.isArray(keys) ? keys : []).filter((key) => typeof key === 'string' && key))]
  syncSelectionLoaded = true
  if (!chrome.storage.session) return
  try {
    await chrome.storage.session.set({ [SYNC_SELECTION_KEY]: syncSelectionKeys })
  } catch {
    // The in-memory selection remains usable for the current worker lifetime.
  }
}

async function clearSyncSelection() {
  syncSelectionRevision += 1
  syncSelectionKeys = null
  syncSelectionLoaded = true
  if (!chrome.storage.session) return
  try {
    await chrome.storage.session.remove(SYNC_SELECTION_KEY)
  } catch {
    // There is no selected batch to restore after removal.
  }
}

function mutatePending(operation) {
  const result = pendingMutation.then(operation, operation)
  pendingMutation = result.catch(() => undefined)
  return result
}

async function syncBookmarks(bookmarks, categoryId) {
  if (!bookmarks.length) return { created: 0, skipped: 0 }
  return apiRequest('/api/browser-sync/bookmarks', {
    method: 'POST',
    body: JSON.stringify({
      bookmarks: bookmarks.map((item) => ({ title: item.title, url: item.url })),
      ...(categoryId ? { category_id: categoryId } : {}),
    }),
  })
}

async function getBookmarkById(bookmarkId) {
  if (!bookmarkId) return null
  const bookmarks = await chrome.bookmarks.get(String(bookmarkId)).catch(() => [])
  return bookmarks.find((bookmark) => bookmark.url) || null
}

async function findBookmarkByUrl(url) {
  if (!url) return null
  const bookmarks = await chrome.bookmarks.search({ url }).catch(() => [])
  return bookmarks.find((bookmark) => bookmark.url === url) || null
}

async function inspectPendingBookmark(item) {
  const bookmarkById = await getBookmarkById(item.browserBookmarkId)
  const exactBookmark = bookmarkById?.url === item.url ? bookmarkById : await findBookmarkByUrl(item.url)
  if (exactBookmark) {
    return {
      status: 'present',
      browserBookmarkId: exactBookmark.id,
      currentTitle: exactBookmark.title,
      currentUrl: exactBookmark.url,
    }
  }
  if (bookmarkById) {
    return {
      status: 'changed',
      browserBookmarkId: bookmarkById.id,
      currentTitle: bookmarkById.title,
      currentUrl: bookmarkById.url,
    }
  }
  return { status: 'missing', browserBookmarkId: item.browserBookmarkId || null }
}

async function getPendingList() {
  return mutatePending(async () => {
    const pending = await getPending()
    const inspected = await Promise.all(pending.map(inspectPendingBookmark))
    const updatedPending = pending.map((item, index) => {
      const browserBookmarkId = inspected[index].browserBookmarkId
      return browserBookmarkId && browserBookmarkId !== item.browserBookmarkId
        ? { ...item, browserBookmarkId }
        : item
    })
    if (updatedPending.some((item, index) => item !== pending[index])) {
      await chrome.storage.local.set({ [PENDING_KEY]: updatedPending })
    }
    return updatedPending.map((item, index) => ({
      ...item,
      key: pendingKey(item),
      status: inspected[index].status,
      currentTitle: inspected[index].currentTitle || null,
      currentUrl: inspected[index].currentUrl || null,
    }))
  })
}

function normalizeEditableBookmark(value) {
  const title = typeof value?.title === 'string' ? value.title.trim() : ''
  const url = typeof value?.url === 'string' ? value.url.trim() : ''
  if (!title) throw new Error('书签标题不能为空')

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error()
  } catch {
    throw new Error('请输入有效的书签 URL（需以 http:// 或 https:// 开头）')
  }

  return { title: title.slice(0, 200), url }
}

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs.find((tab) => /^https?:\/\//i.test(tab.url || ''))?.id ?? null
}

function isWebTab(tab) {
  return Number.isInteger(tab?.id) && /^https?:\/\//i.test(tab.url || '')
}

async function loadRecentWebTab() {
  if (Number.isInteger(recentWebTabId) || !chrome.storage.session) return recentWebTabId
  try {
    const stored = await chrome.storage.session.get({ [RECENT_WEB_TAB_KEY]: null })
    if (Number.isInteger(stored[RECENT_WEB_TAB_KEY])) recentWebTabId = stored[RECENT_WEB_TAB_KEY]
  } catch {
    // Session storage is optional on older Chromium-based browsers.
  }
  return recentWebTabId
}

async function setRecentWebTab(tabId) {
  recentWebTabId = tabId
  if (!chrome.storage.session) return
  try {
    await chrome.storage.session.set({ [RECENT_WEB_TAB_KEY]: tabId })
  } catch {
    // The in-memory value remains usable for the current worker lifetime.
  }
}

async function clearRecentWebTab() {
  recentWebTabId = null
  if (!chrome.storage.session) return
  try {
    await chrome.storage.session.remove(RECENT_WEB_TAB_KEY)
  } catch {
    // There is no valid tab to restore after removal.
  }
}

async function rememberWebTab(tabId, tab = null) {
  if (!Number.isInteger(tabId)) return
  const candidate = tab || await chrome.tabs.get(tabId).catch(() => null)
  if (isWebTab(candidate) && candidate.active) {
    await setRecentWebTab(tabId)
  } else if (recentWebTabId === tabId && typeof candidate?.url === 'string') {
    await clearRecentWebTab()
  }
}

async function resolveWebTabId(preferredTabId = null) {
  await loadRecentWebTab()
  if (Number.isInteger(preferredTabId)) {
    const preferred = await chrome.tabs.get(preferredTabId).catch(() => null)
    if (isWebTab(preferred)) {
      await setRecentWebTab(preferredTabId)
      return preferredTabId
    }
  }

  const activeTabId = await getActiveTabId()
  if (activeTabId != null) {
    await setRecentWebTab(activeTabId)
    return activeTabId
  }

  if (Number.isInteger(recentWebTabId)) {
    const recent = await chrome.tabs.get(recentWebTabId).catch(() => null)
    if (isWebTab(recent)) return recentWebTabId
    await clearRecentWebTab()
  }

  const activeTabs = await chrome.tabs.query({ active: true })
  const activeWebTab = activeTabs.find(isWebTab)
  if (activeWebTab?.id != null) {
    await setRecentWebTab(activeWebTab.id)
    return activeWebTab.id
  }

  return getActiveTabId()
}

async function sendPanelMessage(tabId, message, injectIfMissing = false) {
  if (!Number.isInteger(tabId)) return false

  const send = async () => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message)
      return response?.ok === true
    } catch {
      return false
    }
  }

  if (await send()) return true
  if (!injectIfMissing) return false

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  } catch {
    return false
  }
  return send()
}

async function presentPanel(tabId, view, toggle = false, intent = ++panelIntent) {
  const targetTabId = await resolveWebTabId(tabId)
  if (intent !== panelIntent) return true
  const previous = await panelSession.get()
  const state = await panelSession.open(view, targetTabId)
  if (intent !== panelIntent) return true
  if (previous.tabId != null && previous.tabId !== targetTabId) {
    await sendPanelMessage(previous.tabId, { type: 'hide-panel' })
  }
  if (targetTabId == null) return false
  return sendPanelMessage(targetTabId, {
    type: toggle ? 'toggle-panel' : 'show-panel', view: state.view, revision: state.revision,
  }, true)
}

async function refreshCurrentPanel() {
  const state = await panelSession.get()
  return sendPanelMessage(state.tabId, { type: 'refresh-panel', view: state.view, revision: state.revision })
}

async function openSyncDialog(tabId = null, preserveSelection = false, intent = ++panelIntent) {
  if (!preserveSelection) await clearSyncSelection()
  return presentPanel(tabId, 'sync', false, intent)
}

async function openPendingList(tabId = null, intent = ++panelIntent) {
  await clearSyncSelection()
  return presentPanel(tabId, 'pending-list', false, intent)
}

async function togglePanel(tabId) {
  const intent = ++panelIntent
  const state = await panelSession.get()
  const view = state.view || ((await getPending()).length ? 'pending-list' : 'popup')
  return presentPanel(tabId, view, true, intent)
}

async function enqueue(bookmark, browserBookmarkId = null) {
  if (!bookmark?.url) return
  const intent = ++panelIntent
  const targetTabId = await resolveWebTabId()
  await mutatePending(async () => {
    const pending = await getPending()
    const existingIndex = pending.findIndex((item) => item.url === bookmark.url)
    const normalizedBookmarkId = browserBookmarkId ? String(browserBookmarkId) : ''
    if (existingIndex >= 0) {
      if (normalizedBookmarkId && pending[existingIndex].browserBookmarkId !== normalizedBookmarkId) {
        pending[existingIndex] = { ...pending[existingIndex], browserBookmarkId: normalizedBookmarkId }
        await chrome.storage.local.set({ [PENDING_KEY]: pending })
      }
      return
    }
    pending.push({
      title: bookmark.title || bookmark.url,
      url: bookmark.url,
      ...(normalizedBookmarkId ? { browserBookmarkId: normalizedBookmarkId } : {}),
    })
    await chrome.storage.local.set({ [PENDING_KEY]: pending })
  })
  const config = await getConfig()
  if (intent !== panelIntent) return
  if (config.enabled && config.baseUrl && config.token) {
    const state = await panelSession.get()
    const selection = await loadSyncSelection()
    const keepBatch = state.view === 'sync' && state.drafts.sync?.key &&
      !state.drafts.sync.completed && (!Array.isArray(selection) || selection.length > 0)
    const queued = (await getPending()).find((item) => item.url === bookmark.url)
    if (intent !== panelIntent) return
    if (queued) await panelSession.prepareSync(pendingKey(queued), keepBatch)
    await openSyncDialog(targetTabId, keepBatch, intent)
  } else {
    await refreshCurrentPanel()
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  rememberWebTab(tabId).catch(() => undefined)
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  chrome.tabs.query({ active: true, windowId })
    .then(([tab]) => rememberWebTab(tab?.id, tab))
    .catch(() => undefined)
})

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tab.active) rememberWebTab(tabId, tab).catch(() => undefined)
  // Same-document routing does not emit visibilitychange or destroy the frame.
  if (_changeInfo.url) sendPanelMessage(tabId, { type: 'hide-panel' }).catch(() => undefined)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recentWebTabId) clearRecentWebTab().catch(() => undefined)
  panelSession.forgetTab(tabId).catch((error) => console.warn('[CF-Navs] failed to retain closed-tab draft', error))
})

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  enqueue(bookmark, id).catch((error) => console.warn('[CF-Navs] failed to open sync dialog', error))
})

chrome.action.onClicked.addListener((tab) => {
  togglePanel(tab?.id).then((opened) => {
    if (!opened) console.warn('[CF-Navs] current tab cannot host the extension panel')
  }).catch((error) => console.warn('[CF-Navs] failed to toggle extension panel', error))
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (['get-panel-context', 'save-panel-draft', 'navigate-panel', 'hide-current-panel'].includes(message?.type)) {
    ;(async () => {
      if (message.type === 'get-panel-context') {
        const state = await panelSession.bind(messageContext(message, sender))
        return { ok: true, revision: state.revision, draft: state.drafts[message.panel?.view] || null }
      }
      await requireCurrentPanel(message, sender)
      if (message.type === 'save-panel-draft') {
        const saved = await panelSession.saveDraft(messageContext(message, sender), message.draft)
        if (!saved) throw new Error('弹窗已切换，请在当前页面继续操作')
        return { ok: true }
      }
      if (message.type === 'hide-current-panel') {
        const state = await panelSession.get()
        await sendPanelMessage(state.tabId, { type: 'hide-panel' })
        return { ok: true }
      }
      if (message.view !== 'popup') throw new Error('未知的扩展页面')
      const intent = ++panelIntent
      await clearSyncSelection()
      const opened = await presentPanel(sender.tab?.id, 'popup', false, intent)
      if (!opened) throw new Error('当前页面无法显示扩展悬窗，请切换到普通网页')
      return { ok: true }
    })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }
  if (message?.type === 'register-web-tab') {
    rememberWebTab(sender.tab?.id, sender.tab).then(() => sendResponse({ ok: true }))
    return true
  }

  if (message?.type === 'get-config') {
    getConfig().then(async (config) => {
      await requireCurrentPanel(message, sender)
      sendResponse({ ok: true, config })
    }).catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'get-sync-dialog') {
    requireCurrentPanel(message, sender).then(() => apiRequest('/api/categories'))
      .then(async (categories) => {
        // Read the queue/draft after the network request: another tab or a new
        // bookmark can change them while categories are still loading.
        const [pending, selection, state] = await Promise.all([getPending(), loadSyncSelection(), panelSession.get()])
        await requireCurrentPanel(message, sender)
        const candidates = filterPendingBySelection(pending, selection)
        if (!candidates.length) {
          sendResponse({ ok: true, pending: null, categories: [], syncing: false })
          return
        }
        const current = candidates.find((item) => pendingKey(item) === state.drafts.sync?.key) || candidates[0]
        const key = pendingKey(current)
        const config = await getConfig()
        await requireCurrentPanel(message, sender)
        const selectedCategoryId = config.lastCategoryId
        sendResponse({
          ok: true,
          pending: { ...current, key, count: candidates.length },
          draft: state.drafts.sync?.key === key ? state.drafts.sync : null,
          syncing: syncingKey === key,
          categories: Array.isArray(categories) ? categories : [],
          selectedCategoryId,
        })
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || '读取失败' }))
    return true
  }

  if (message?.type === 'confirm-sync') {
    const categoryId = Number(message.categoryId)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      sendResponse({ ok: false, error: '请选择有效分类' })
      return false
    }
    mutatePending(async () => {
      await requireCurrentPanel(message, sender)
      const pending = await getPending()
      const selection = await loadSyncSelection()
      const selectionRevision = syncSelectionRevision
      const candidates = filterPendingBySelection(pending, selection)
      if (!candidates.length) {
        throw new Error('没有待同步的收藏')
      }
      const currentKey = message.key || pendingKey(candidates[0])
      const current = candidates.find((item) => pendingKey(item) === currentKey)
      if (!current) throw new Error('这条收藏已处理或不在当前批次，请重新打开弹窗')
      const currentIndex = pending.findIndex((item) => pendingKey(item) === currentKey)
      if (currentIndex < 0) throw new Error('没有待同步的收藏')
      const edited = normalizeEditableBookmark({
        title: message.title ?? current.title,
        url: message.url ?? current.url,
      })
      const updatedPending = pending.slice()
      updatedPending[currentIndex] = { ...updatedPending[currentIndex], ...edited }
      await chrome.storage.local.set({ [PENDING_KEY]: updatedPending })
      syncingKey = currentKey
      try {
        const result = await syncBookmarks([edited], categoryId)
        const remaining = updatedPending.filter((_item, index) => index !== currentIndex)
        await chrome.storage.local.set({ [PENDING_KEY]: remaining, lastCategoryId: categoryId })
        let remainingSelection = await loadSyncSelection()
        if (selectionRevision === syncSelectionRevision && Array.isArray(selection)) {
          const remainingKeys = new Set(remaining.map(pendingKey))
          remainingSelection = selection.filter((key) => key !== currentKey && remainingKeys.has(key))
          // An empty selected batch is complete, not permission to sync the rest.
          await setSyncSelection(remainingSelection)
        }
        const nextCandidates = filterPendingBySelection(remaining, remainingSelection)
        const next = nextCandidates[0]
        await panelSession.finishSync(currentKey, next ? pendingKey(next) : null)
        return {
          ok: true,
          result,
          pending: next ? { ...next, key: pendingKey(next), count: nextCandidates.length } : null,
        }
      } finally {
        syncingKey = null
        await refreshCurrentPanel()
      }
    })
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || '同步失败' }))
    return true
  }

  if (message?.type === 'login') {
    const baseUrl = normalizeBaseUrl(message.baseUrl)
    login(baseUrl, message.username, message.password)
      .then(async (session) => {
        await chrome.storage.local.set({
          baseUrl,
          username: String(message.username || '').trim(),
          token: session.token,
          expiresAt: session.expires_at,
          enabled: true,
        })
        sendResponse({ ok: true, expiresAt: session.expires_at })
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || '登录失败' }))
    return true
  }

  if (message?.type === 'open-pending') {
    ;(async () => {
      await requireCurrentPanel(message, sender)
      const intent = ++panelIntent
      const pending = await getPending()
      if (!pending.length) {
        sendResponse({ ok: false, error: '没有待同步的收藏' })
        return
      }
      return openPendingList(sender.tab?.id, intent).then((opened) => {
        if (!opened) throw new Error('当前页面无法显示扩展悬窗，请切换到普通网页')
        sendResponse({ ok: true })
      })
    })().catch((error) => sendResponse({ ok: false, error: error.message || '打开失败' }))
    return true
  }

  if (message?.type === 'get-pending-list') {
    requireCurrentPanel(message, sender).then(getPendingList)
      .then(async (items) => {
        await requireCurrentPanel(message, sender)
        sendResponse({ ok: true, items })
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || '读取待同步收藏失败' }))
    return true
  }

  if (message?.type === 'start-selected-sync') {
    const keys = Array.isArray(message.keys) ? message.keys : []
    ;(async () => {
      await requireCurrentPanel(message, sender)
      const intent = ++panelIntent
      const pending = await getPending()
      const selectedKeys = [...new Set(keys.filter((key) => typeof key === 'string' && key))]
      const availableKeys = selectedKeys.filter((key) => pending.some((item) => pendingKey(item) === key))
      if (!availableKeys.length) throw new Error('请至少选择一条待同步收藏')
      await setSyncSelection(availableKeys)
      await panelSession.prepareSync(availableKeys[0], false)
      const opened = await openSyncDialog(sender.tab?.id, true, intent)
      if (!opened) {
        await clearSyncSelection()
        throw new Error('当前页面无法显示扩展悬窗，请切换到普通网页')
      }
      sendResponse({ ok: true })
    })()
      .catch((error) => sendResponse({ ok: false, error: error.message || '打开同步确认失败' }))
    return true
  }

  if (message?.type === 'remove-pending') {
    const keys = new Set(Array.isArray(message.keys) ? message.keys : [])
    if (!keys.size) {
      sendResponse({ ok: false, error: '请至少选择一条待同步收藏' })
      return false
    }
    mutatePending(async () => {
      await requireCurrentPanel(message, sender)
      const pending = await getPending()
      const remaining = pending.filter((item) => !keys.has(pendingKey(item)))
      await chrome.storage.local.set({ [PENDING_KEY]: remaining })
      const selection = await loadSyncSelection()
      if (Array.isArray(selection)) {
        await setSyncSelection(selection.filter((key) => !keys.has(key)))
      }
      return remaining
    })
      .then((remaining) => sendResponse({ ok: true, count: remaining.length }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '删除待同步收藏失败' }))
    return true
  }

  if (message?.type === 'clear-sync-selection') {
    clearSyncSelection()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '清除选择失败' }))
    return true
  }

  if (message?.type === 'set-enabled') {
    chrome.storage.local.set({ enabled: Boolean(message.enabled) })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '保存失败' }))
    return true
  }

  if (message?.type === 'clear-session') {
    chrome.storage.local.set({ token: '', expiresAt: 0, enabled: false })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '清除失败' }))
    return true
  }

  return false
})
