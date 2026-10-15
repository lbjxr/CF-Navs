const DEFAULT_CONFIG = {
  baseUrl: '',
  token: '',
  expiresAt: 0,
  username: '',
  enabled: false,
}

// API 版本前缀：扩展固定走版本化路径（/api/v1），不跟随服务端 main 分支的破坏性变更。
// 旧的 /api 前缀保留兼容，仅作过渡。
const API_VERSION_PREFIX = '/api/v1'

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

async function getConfig() {
  const stored = await chrome.storage.local.get(DEFAULT_CONFIG)
  return { ...DEFAULT_CONFIG, ...stored, baseUrl: normalizeBaseUrl(stored.baseUrl) }
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${API_VERSION_PREFIX}/login`, {
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

async function syncBookmarks(bookmarks) {
  const config = await getConfig()
  if (!config.enabled || !config.baseUrl || !config.token || !bookmarks.length) return { created: 0, skipped: 0 }

  if (config.expiresAt && config.expiresAt <= Date.now()) {
    await chrome.storage.local.set({ token: '', expiresAt: 0 })
    throw new Error('登录会话已过期，请打开扩展重新登录')
  }

  const response = await fetch(`${config.baseUrl}${API_VERSION_PREFIX}/browser-sync/bookmarks`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ bookmarks: bookmarks.map((item) => ({ title: item.title, url: item.url })) }),
  })
  const payload = await response.json().catch(() => null)
  if (response.status === 401) {
    await chrome.storage.local.set({ token: '', expiresAt: 0 })
    throw new Error('登录会话已过期，请打开扩展重新登录')
  }
  if (!response.ok || !payload || payload.code !== 0) {
    throw new Error(payload?.msg || '同步失败')
  }
  return payload.data
}

let pending = []
let timer = 0

function enqueue(bookmark) {
  if (!bookmark?.url) return
  pending.push({ title: bookmark.title || bookmark.url, url: bookmark.url })
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const batch = pending.splice(0, 100)
    try {
      await syncBookmarks(batch)
    } catch (error) {
      console.warn('[CF-Navs] bookmark sync failed', error)
    }
  }, 800)
}

chrome.bookmarks.onCreated.addListener((_id, bookmark) => enqueue(bookmark))

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-config') {
    getConfig().then((config) => sendResponse({ ok: true, config }))
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
