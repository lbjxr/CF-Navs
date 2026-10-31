const DEFAULT_CONFIG = {
  baseUrl: '',
  token: '',
  expiresAt: 0,
  username: '',
  enabled: false,
}
const PENDING_KEY = 'pendingSyncBookmarks'
let dialogWindowId = null
let dialogOpening = null
let pendingMutation = Promise.resolve()

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

async function openSyncDialog() {
  if (dialogOpening) return dialogOpening
  dialogOpening = (async () => {
    if (dialogWindowId !== null) {
      try {
        await chrome.windows.update(dialogWindowId, { focused: true })
        return
      } catch {
        dialogWindowId = null
      }
    }
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL('sync-dialog.html'),
      type: 'popup',
      width: 430,
      height: 520,
      focused: true,
    })
    dialogWindowId = window.id ?? null
  })()
  try {
    await dialogOpening
  } finally {
    dialogOpening = null
  }
}

async function enqueue(bookmark) {
  if (!bookmark?.url) return
  await mutatePending(async () => {
    const pending = await getPending()
    if (pending.some((item) => item.url === bookmark.url)) return
    pending.push({ title: bookmark.title || bookmark.url, url: bookmark.url })
    await chrome.storage.local.set({ [PENDING_KEY]: pending })
  })
  const config = await getConfig()
  if (config.enabled && config.baseUrl && config.token) await openSyncDialog()
}

chrome.bookmarks.onCreated.addListener((_id, bookmark) => {
  enqueue(bookmark).catch((error) => console.warn('[CF-Navs] failed to open sync dialog', error))
})

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === dialogWindowId) dialogWindowId = null
})

chrome.action.onClicked.addListener(() => {
  getPending().then((pending) => {
    if (pending.length) return openSyncDialog()
    return chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 400, height: 690 })
  }).catch((error) => console.warn('[CF-Navs] failed to open extension window', error))
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-config') {
    getConfig().then((config) => sendResponse({ ok: true, config }))
    return true
  }

  if (message?.type === 'get-sync-dialog') {
    Promise.all([getPending(), apiRequest('/api/categories')])
      .then(async ([pending, categories]) => {
        if (!pending.length) {
          sendResponse({ ok: false, error: '没有待同步的收藏' })
          return
        }
        const config = await getConfig()
        const selectedCategoryId = config.lastCategoryId
        sendResponse({
          ok: true,
          pending: { ...pending[0], count: pending.length },
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
      const pending = await getPending()
      if (!pending.length) throw new Error('没有待同步的收藏')
      const result = await syncBookmarks([pending[0]], categoryId)
      const remaining = pending.slice(1)
      await chrome.storage.local.set({ [PENDING_KEY]: remaining, lastCategoryId: categoryId })
      return {
        ok: true,
        result,
        pending: remaining.length ? { ...remaining[0], count: remaining.length } : null,
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
    getPending().then((pending) => {
      if (!pending.length) {
        sendResponse({ ok: false, error: '没有待同步的收藏' })
        return
      }
      return openSyncDialog().then(() => sendResponse({ ok: true }))
    }).catch((error) => sendResponse({ ok: false, error: error.message || '打开失败' }))
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
