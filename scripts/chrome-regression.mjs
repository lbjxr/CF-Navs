// Real-browser functional regression suite for CF-Navs through Chrome DevTools Protocol.
//
// Required:
//   ADMIN_USER=admin ADMIN_PASS=... npm run regression:chrome
//
// Optional:
//   BASE_URL=https://navs.bjlius.com
//   CHROME_DEBUG_PORT=9228
//   CHROME_EXE="C:\Program Files\Google\Chrome\Application\chrome.exe"
//   CHROME_USER_DATA_DIR=D:\tmp\cf-navs-chrome-profile-9228
//   REGRESSION_ALLOW_FAILURES=1
//   REGRESSION_MIN_BOOKMARK_CARDS=1
//   REGRESSION_MIN_CATEGORIES=1
//   REGRESSION_MIN_BOOKMARKS=1
//   REGRESSION_CLEAR_ORIGIN_DATA=1

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { rm } from 'node:fs/promises'
import WebSocket from 'ws'

const BASE_URL = (process.env.BASE_URL || 'https://navs.bjlius.com').replace(/\/+$/, '')
const CHROME_DEBUG_PORT = process.env.CHROME_DEBUG_PORT || '9228'
const CHROME_EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CHROME_USER_DATA_DIR =
  process.env.CHROME_USER_DATA_DIR || `D:\\tmp\\cf-navs-chrome-profile-${CHROME_DEBUG_PORT}`
const ADMIN_USER = process.env.ADMIN_USER || ''
const ADMIN_PASS = process.env.ADMIN_PASS || ''
const ALLOW_FAILURES = process.env.REGRESSION_ALLOW_FAILURES === '1'
const MIN_BOOKMARK_CARDS = readIntegerEnv('REGRESSION_MIN_BOOKMARK_CARDS', 1)
const MIN_CATEGORIES = readIntegerEnv('REGRESSION_MIN_CATEGORIES', 1)
const MIN_BOOKMARKS = readIntegerEnv('REGRESSION_MIN_BOOKMARKS', 1)
const CLEAR_ORIGIN_DATA = process.env.REGRESSION_CLEAR_ORIGIN_DATA === '1'

const TARGET_ORIGIN = new URL(BASE_URL).origin
const TARGET_URL = `${TARGET_ORIGIN}/`
const DEBUG_ENDPOINT = `http://127.0.0.1:${CHROME_DEBUG_PORT}`

let nextId = 0
let ws = null
let chromeProcess = null
let startedChrome = false
let browserSessionMode = false
let browserSessionId = null
let browserTargetId = null
let chromeConnectionMode = 'debug-port'
let chromeConnectedPort = CHROME_DEBUG_PORT
const pending = new Map()
const events = []
const network = new Map()
const consoleMessages = []
const pageExceptions = []

if (!ADMIN_USER || !ADMIN_PASS) {
  usageError('Missing credentials.')
}

function usageError(message) {
  console.error(message)
  console.error('Required: ADMIN_USER and ADMIN_PASS environment variables.')
  process.exit(2)
}

function readIntegerEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.json()
}

async function isChromeDebugPortReady() {
  try {
    const version = await fetchJson(`${DEBUG_ENDPOINT}/json/version`, { signal: AbortSignal.timeout(1200) })
    return Boolean(version.webSocketDebuggerUrl || version.Browser)
  } catch {
    return false
  }
}

async function ensureChrome() {
  if (await isChromeDebugPortReady()) return

  const active = await readDevToolsActivePort()
  if (active) return

  if (!existsSync(CHROME_EXE)) {
    throw new Error(`Chrome debug port is unavailable and CHROME_EXE was not found: ${CHROME_EXE}`)
  }

  chromeProcess = spawn(CHROME_EXE, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${CHROME_USER_DATA_DIR}`,
    'about:blank',
  ], {
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  })
  startedChrome = true

  const startedAt = Date.now()
  while (Date.now() - startedAt < 15000) {
    if (await isChromeDebugPortReady()) return
    await sleep(250)
  }

  throw new Error(`Chrome did not expose CDP on ${DEBUG_ENDPOINT}`)
}

async function readDevToolsActivePort() {
  const candidates = [
    process.env.CHROME_DEVTOOLS_ACTIVE_PORT_FILE,
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data\\DevToolsActivePort`
      : '',
  ].filter(Boolean)

  for (const filePath of candidates) {
    try {
      const [port, browserPath] = (await readFile(filePath, 'utf8')).trim().split(/\r?\n/)
      if (!port || !browserPath) continue
      return {
        port,
        browserPath,
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}${browserPath}`,
      }
    } catch {
      // Try the next possible profile path.
    }
  }

  return null
}

async function getPageTarget() {
  const targets = await fetchJson(`${DEBUG_ENDPOINT}/json/list`)
  const existing =
    targets.find((target) => target.type === 'page' && target.url.startsWith(TARGET_ORIGIN)) ||
    targets.find((target) => target.type === 'page')

  if (existing?.webSocketDebuggerUrl) return existing

  const created = await fetchJson(`${DEBUG_ENDPOINT}/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' })
  if (!created.webSocketDebuggerUrl) {
    throw new Error('Chrome target was created without webSocketDebuggerUrl.')
  }
  return created
}

function connect(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl)

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())
    if (message.id && pending.has(message.id)) {
      const handlers = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) {
        handlers.reject(new Error(JSON.stringify(message.error)))
      } else {
        handlers.resolve(message.result || {})
      }
      return
    }

    if (message.method) {
      if (message.method === 'Fetch.requestPaused') {
        void fulfillBlockedWriteRequest(message.params)
      }
      events.push(message)
      captureRuntimeEvent(message)
    }
  })

  return new Promise((resolveOpen, rejectOpen) => {
    ws.once('open', resolveOpen)
    ws.once('error', rejectOpen)
  })
}

async function connectBrowserSession(target) {
  await connect(target)
  browserSessionMode = true
  chromeConnectionMode = 'devtools-active-port'
  chromeConnectedPort = target.port

  const created = await sendBrowserCommand('Target.createTarget', { url: TARGET_URL })
  browserTargetId = created.targetId

  const attached = await sendBrowserCommand('Target.attachToTarget', {
    targetId: browserTargetId,
    flatten: true,
  })
  browserSessionId = attached.sessionId
}

function captureRuntimeEvent(message) {
  if (message.method === 'Runtime.consoleAPICalled') {
    const params = message.params || {}
    if (['error', 'assert'].includes(params.type)) {
      consoleMessages.push({
        type: params.type,
        text: (params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' '),
        url: params.stackTrace?.callFrames?.[0]?.url || '',
      })
    }
  }

  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params?.exceptionDetails || {}
    pageExceptions.push({
      text: details.text || '',
      exception: details.exception?.description || details.exception?.value || '',
      url: details.url || details.stackTrace?.callFrames?.[0]?.url || '',
      lineNumber: details.lineNumber,
      columnNumber: details.columnNumber,
    })
  }
}

function send(method, params = {}, timeoutMs = 30000) {
  if (!ws) throw new Error('CDP WebSocket is not connected.')

  const id = ++nextId
  ws.send(JSON.stringify({
    id,
    method,
    params,
    ...(browserSessionMode && browserSessionId ? { sessionId: browserSessionId } : {}),
  }))

  return new Promise((resolveSend, rejectSend) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      rejectSend(new Error(`CDP timeout: ${method}`))
    }, timeoutMs)

    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer)
        resolveSend(result)
      },
      reject: (error) => {
        clearTimeout(timer)
        rejectSend(error)
      },
    })
  })
}

function sendBrowserCommand(method, params = {}, timeoutMs = 30000) {
  const previousSession = browserSessionId
  browserSessionId = null
  try {
    return send(method, params, timeoutMs)
  } finally {
    browserSessionId = previousSession
  }
}

async function fulfillBlockedWriteRequest(params) {
  if (!params?.requestId) return

  try {
    await send('Fetch.fulfillRequest', {
      requestId: params.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'content-type', value: 'application/json; charset=utf-8' },
        { name: 'cache-control', value: 'no-store' },
      ],
      body: Buffer.from(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: { icon_blob: null },
      })).toString('base64'),
    })
  } catch {
    // If the request already continued or Chrome closed, do not fail cleanup.
  }
}

async function evaluate(expression, timeoutMs = 30000) {
  const result = await send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    },
    timeoutMs + 3000,
  )

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails))
  }

  return result.result?.value
}

async function pageFunction(fn, ...args) {
  return evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`)
}

async function clearBrowserState() {
  if (CLEAR_ORIGIN_DATA || startedChrome) {
    try {
      await send('Storage.clearDataForOrigin', {
        origin: TARGET_ORIGIN,
        storageTypes: 'local_storage,session_storage,cache_storage',
      })
      return
    } catch {
      // Fall back to page-scoped storage cleanup below.
    }
  }

  await evaluate(`(() => {
    localStorage.removeItem('cf-navs.auth')
    sessionStorage.clear()
    return true
  })()`)
}

async function login() {
  return pageFunction(async function loginInPage(baseUrl, username, password) {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await response.json()
    if (!response.ok || body.code !== 0) {
      throw new Error(`login failed: ${JSON.stringify(body)}`)
    }
    localStorage.setItem('cf-navs.auth', JSON.stringify(body.data))
    return { username: body.data.username, expires_at: body.data.expires_at }
  }, TARGET_ORIGIN, ADMIN_USER, ADMIN_PASS)
}

async function navigateHome() {
  resetNetwork()
  await send('Page.navigate', { url: TARGET_URL })
  await waitForSelector('.app-shell, .app-splash', 30000)
  await waitForNetworkIdle()
}

async function waitForSelector(selector, timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const found = await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, 2500)
    if (found) return true
    await sleep(150)
  }
  throw new Error(`Timed out waiting for selector: ${selector}`)
}

async function waitForCondition(fn, timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await pageFunction(fn)
    if (value) return value
    await sleep(150)
  }
  return null
}

function resetNetwork() {
  network.clear()
  events.length = 0
}

function harvestNetworkEvents() {
  for (const event of events.splice(0)) {
    const params = event.params || {}
    const requestId = params.requestId
    if (!requestId) continue

    const item = network.get(requestId) || { requestId }

    if (event.method === 'Network.requestWillBeSent') {
      item.url = params.request?.url
      item.method = params.request?.method
      item.type = params.type
    } else if (event.method === 'Network.responseReceived') {
      item.status = params.response?.status
      item.mimeType = params.response?.mimeType
      item.fromDiskCache = Boolean(params.response?.fromDiskCache)
      item.fromServiceWorker = Boolean(params.response?.fromServiceWorker)
    } else if (event.method === 'Network.loadingFinished') {
      item.encodedDataLength = params.encodedDataLength || item.encodedDataLength || 0
      item.finished = true
    } else if (event.method === 'Network.loadingFailed') {
      item.failed = true
      item.errorText = params.errorText
      item.canceled = params.canceled
    }

    network.set(requestId, item)
  }
}

async function waitForNetworkIdle(idleMs = 1000, maxMs = 30000) {
  let lastChangeAt = Date.now()
  let previousSnapshot = ''
  const startedAt = Date.now()

  while (Date.now() - startedAt < maxMs) {
    harvestNetworkEvents()
    const snapshot = Array.from(network.values())
      .map((item) => `${item.requestId}:${item.finished}:${item.failed}:${item.status || ''}`)
      .join('|')
    if (snapshot !== previousSnapshot) {
      previousSnapshot = snapshot
      lastChangeAt = Date.now()
    }
    if (Date.now() - lastChangeAt >= idleMs) break
    await sleep(100)
  }

  harvestNetworkEvents()
}

async function runApiChecks() {
  return pageFunction(async function apiChecks(baseUrl) {
    const getEnvelope = async (path, options = {}) => {
      const response = await fetch(`${baseUrl}${path}`, options)
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      return { status: response.status, code: body?.code, msg: body?.msg, data: body?.data }
    }

    const auth = JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')
    const headers = auth?.token ? { authorization: `Bearer ${auth.token}` } : {}

    const health = await getEnvelope('/api/health')
    const version = await getEnvelope('/api/data/version', { headers })
    const config = await getEnvelope('/api/config')
    const admin = await getEnvelope('/api/admin/data', { headers, cache: 'no-store' })
    const iconify = await getEnvelope('/api/iconify-search?query=github', { headers })

    return {
      health: { status: health.status, code: health.code, okStatus: health.data?.status },
      version: { status: version.status, code: version.code, hasVersion: typeof version.data?.version === 'string' && version.data.version.length > 0 },
      config: {
        status: config.status,
        code: config.code,
        hasTitle: typeof config.data?.site_title === 'string',
        publicModeType: typeof config.data?.public_mode,
      },
      admin: {
        status: admin.status,
        code: admin.code,
        categories: admin.data?.categories?.length ?? 0,
        bookmarks: admin.data?.bookmarks?.length ?? 0,
        hasSettings: Boolean(admin.data?.settings),
      },
      iconify: {
        status: iconify.status,
        code: iconify.code,
        candidates: iconify.data?.candidates?.length ?? 0,
      },
    }
  }, TARGET_ORIGIN)
}

async function runHomeChecks() {
  return pageFunction(async function homeChecks() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const byLabel = (label) =>
      document.querySelector(`[aria-label="${label}"], [title="${label}"]`)
    const searchInput = document.querySelector('#search-query')
    const themeButton =
      document.querySelector('[data-testid="home-theme-toggle"]') ||
      byLabel('切换到深色模式') ||
      byLabel('切换到浅色模式')
    const beforeTheme = document.documentElement.dataset.theme || ''
    themeButton?.click()
    await delay(100)
    const afterTheme = document.documentElement.dataset.theme || ''
    themeButton?.click()
    await delay(100)

    const beforeCards = document.querySelectorAll('.bookmark-card-shell').length
    const beforeSections = document.querySelectorAll('.category-section').length

    let search = null
    if (searchInput) {
      searchInput.value = 'npm'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(220)
      search = {
        filteredCards: document.querySelectorAll('.bookmark-card-shell').length,
        filteredSections: document.querySelectorAll('.category-section').length,
      }
      searchInput.value = ''
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(220)
      search.clearedCards = document.querySelectorAll('.bookmark-card-shell').length
    }

    return {
      title: document.title,
      splashCount: document.querySelectorAll('.app-splash').length,
      appShell: Boolean(document.querySelector('.app-shell')),
      adminButton: Boolean(document.querySelector('[data-testid="home-admin-button"]') || byLabel('管理后台')),
      themeChanged: beforeTheme !== afterTheme,
      searchInput: Boolean(searchInput),
      bookmarkCards: beforeCards,
      sections: beforeSections,
      brokenImages: Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length,
      search,
    }
  })
}

async function openAdminFromHome() {
  const result = await pageFunction(async function clickAdmin() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const button =
      document.querySelector('[data-testid="home-admin-button"]') ||
      document.querySelector('[aria-label="管理后台"], [title="管理后台"]')
    if (!button) return { ok: false, error: 'home admin button not found' }
    button.click()
    for (let i = 0; i < 180; i += 1) {
      if (document.querySelector('.admin-page')) return { ok: true }
      await delay(100)
    }
    return { ok: false, error: 'admin page did not open' }
  })
  await waitForNetworkIdle()
  return result
}

async function runAdminChecks() {
  return pageFunction(async function adminChecks() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const buttonByText = (text) =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(text))
    const click = async (selector) => {
      const button = document.querySelector(selector)
      if (!button) return false
      button.click()
      await delay(450)
      return true
    }
    const clickTab = async (testIdSelector, text) => {
      const button = document.querySelector(testIdSelector) || buttonByText(text)
      if (!button) return false
      button.click()
      await delay(450)
      return true
    }

    const counts = {
      categoryCards: document.querySelectorAll('.admin-compact-card').length,
      categoryStatus: Array.from(document.querySelectorAll('.admin-status-item strong')).map((node) => node.textContent?.trim() || ''),
    }

    await clickTab('[data-testid="admin-tab-bookmarks"]', '书签管理')
    const bookmarkSearch =
      document.querySelector('[data-testid="admin-bookmark-search"]') ||
      document.querySelector('.admin-bookmark-search-bar input, .bookmark-search-bar input')
    let bookmarkSearchResult = null
    if (bookmarkSearch) {
      bookmarkSearch.value = 'npm'
      bookmarkSearch.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(350)
      bookmarkSearchResult = {
        rowsAfterSearch: document.querySelectorAll('tbody tr').length,
      }
      bookmarkSearch.value = ''
      bookmarkSearch.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(250)
      bookmarkSearchResult.rowsAfterClear = document.querySelectorAll('tbody tr').length
    }

    await clickTab('[data-testid="admin-tab-settings"]', '站点设置')
    for (let i = 0; i < 80 && !document.querySelector('.settings-panel'); i += 1) {
      await delay(100)
    }
    const settings = {
      rendered: Boolean(document.querySelector('.settings-panel')),
      inputs: document.querySelectorAll('.settings-panel input, .settings-panel select, .settings-panel textarea').length,
    }

    await clickTab('[data-testid="admin-tab-backup"]', '数据备份')
    const backup = {
      rendered: Boolean(document.querySelector('.backup-panel')),
      sourceSelect: Boolean(document.querySelector('#import-source')),
      exportButton: Array.from(document.querySelectorAll('.backup-panel button')).some((button) =>
        button.textContent?.includes('导出')
      ),
      importInput: Boolean(document.querySelector('.backup-panel input[type="file"]')),
    }

    await clickTab('[data-testid="admin-tab-categories"]', '分类管理')

    return {
      adminPage: Boolean(document.querySelector('.admin-page')),
      homeButton: Boolean(document.querySelector('[data-testid="admin-home-button"], [aria-label="返回首页"], [title="返回首页"]')),
      logoutButton: Boolean(document.querySelector('[data-testid="admin-logout-button"], [aria-label="退出登录"], [title="退出登录"]')),
      activeTab: document.querySelector('.admin-sidebar .active')?.textContent?.trim() || '',
      counts,
      bookmarkSearch: {
        inputFound: Boolean(bookmarkSearch),
        ...bookmarkSearchResult,
      },
      settings,
      backup,
    }
  })
}

async function runContextMenuChecks() {
  await pageFunction(async function returnHomeIfNeeded() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const homeButton =
      document.querySelector('[data-testid="admin-home-button"]') ||
      document.querySelector('[aria-label="返回首页"], [title="返回首页"]')
    if (homeButton) {
      homeButton.click()
      for (let i = 0; i < 120; i += 1) {
        if (document.querySelector('.bookmark-card-shell')) return true
        await delay(100)
      }
    }
    return Boolean(document.querySelector('.bookmark-card-shell'))
  })
  await waitForNetworkIdle()

  const coords = await pageFunction(function firstBookmarkCenter() {
    const card = document.querySelector('.bookmark-card-shell')
    if (!card) return null
    const rect = card.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  })

  if (!coords) {
    return { ok: false, error: 'bookmark card not found' }
  }

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: coords.x, y: coords.y, button: 'none' })
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: coords.x,
    y: coords.y,
    button: 'right',
    buttons: 2,
    clickCount: 1,
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: coords.x,
    y: coords.y,
    button: 'right',
    buttons: 0,
    clickCount: 1,
  })

  const menu = await waitForCondition(function contextMenuVisible() {
    return Boolean(
      document.querySelector('.bookmark-context-menu [data-testid="bookmark-context-edit"]') ||
      Array.from(document.querySelectorAll('.bookmark-context-menu button'))
        .some((button) => button.textContent?.includes('编辑'))
    )
  }, 5000)

  if (!menu) {
    return { ok: false, error: 'context menu did not open', coords }
  }

  const modal = await pageFunction(async function openEditModal() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const editButton =
      document.querySelector('[data-testid="bookmark-context-edit"]') ||
      Array.from(document.querySelectorAll('.bookmark-context-menu button'))
        .find((button) => button.textContent?.includes('编辑'))
    editButton?.click()
    for (let i = 0; i < 120; i += 1) {
      if (document.querySelector('[data-testid="bookmark-modal"], .modal-card[role="dialog"]')) break
      await delay(100)
    }
    const dialog = document.querySelector('[data-testid="bookmark-modal"], .modal-card[role="dialog"]')
    const titleInput = Array.from(document.querySelectorAll('[data-testid="bookmark-modal"] input, .modal-card[role="dialog"] input'))
      .find((input) => input.placeholder?.includes('Svelte') || input.type === 'text')
    const urlInput = Array.from(document.querySelectorAll('[data-testid="bookmark-modal"] input, .modal-card[role="dialog"] input'))
      .find((input) => input.type === 'url')
    const cancel = Array.from(document.querySelectorAll('[data-testid="bookmark-modal"] button, .modal-card[role="dialog"] button'))
      .find((button) => button.textContent?.trim() === '取消')
    const result = {
      opened: Boolean(dialog),
      titleValueLength: titleInput?.value?.length || 0,
      urlValue: urlInput?.value || '',
      cancelFound: Boolean(cancel),
    }
    cancel?.click()
    await delay(150)
    result.closed = !document.querySelector('[data-testid="bookmark-modal"], .modal-card[role="dialog"]')
    return result
  })

  return { ok: Boolean(modal.opened && modal.closed), coords, modal }
}

async function runLogoutCheck() {
  return pageFunction(async function logoutCheck() {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const button =
      document.querySelector('[data-testid="admin-logout-button"]') ||
      document.querySelector('[data-testid="home-logout-button"]') ||
      document.querySelector('[aria-label="退出登录"], [title="退出登录"]')
    button?.click()
    for (let i = 0; i < 100; i += 1) {
      if (!localStorage.getItem('cf-navs.auth')) break
      await delay(100)
    }
    await delay(300)
    return {
      logoutButtonFound: Boolean(button),
      authCleared: !localStorage.getItem('cf-navs.auth'),
      loginButtonVisible: Boolean(document.querySelector('[data-testid="home-login-button"], [data-testid="admin-login-button"], [aria-label="管理员登录"], [title="管理员登录"]')),
      currentViewHome: Boolean(document.querySelector('.app-shell')),
    }
  })
}

function summarizeNetwork() {
  harvestNetworkEvents()
  const requests = Array.from(network.values()).filter((request) => request.url)
  const failed = requests.filter((request) => {
    if (request.failed && !request.canceled) return true
    if (!request.status || request.status < 400) return false
    const url = new URL(request.url)
    if (url.pathname === '/favicon.ico' && request.status === 404) return false
    return true
  })

  const byPath = {}
  for (const request of requests) {
    const url = new URL(request.url)
    if (url.origin !== TARGET_ORIGIN) continue
    byPath[url.pathname] = (byPath[url.pathname] || 0) + 1
  }

  return {
    totalRequests: requests.length,
    failed: failed.slice(0, 30).map((request) => ({
      url: request.url,
      status: request.status,
      errorText: request.errorText,
      canceled: request.canceled,
    })),
    byPath,
  }
}

function check(name, passed, actual, expected) {
  return { name, passed, actual, expected }
}

function collectChecks(result) {
  return [
    check('no failed network requests', result.network.failed.length === 0, result.network.failed.length, '0'),
    check('no console errors', result.consoleErrors.length === 0, result.consoleErrors.length, '0'),
    check('no page exceptions', result.pageExceptions.length === 0, result.pageExceptions.length, '0'),
    check('api health ok', result.api.health.status === 200 && result.api.health.code === 0, result.api.health, 'HTTP 200 code 0'),
    check('api version ok', result.api.version.status === 200 && result.api.version.code === 0 && result.api.version.hasVersion, result.api.version, 'version number'),
    check('admin aggregate ok', result.api.admin.status === 200 && result.api.admin.code === 0 && result.api.admin.hasSettings, result.api.admin, 'AdminData'),
    check('admin categories present', result.api.admin.categories >= MIN_CATEGORIES, result.api.admin.categories, `>= ${MIN_CATEGORIES}`),
    check('admin bookmarks present', result.api.admin.bookmarks >= MIN_BOOKMARKS, result.api.admin.bookmarks, `>= ${MIN_BOOKMARKS}`),
    check('iconify search ok', result.api.iconify.status === 200 && result.api.iconify.code === 0, result.api.iconify, 'HTTP 200 code 0'),
    check('home app rendered', result.home.appShell && result.home.splashCount === 0, result.home, 'app shell without splash'),
    check('home bookmark cards present', result.home.bookmarkCards >= MIN_BOOKMARK_CARDS, result.home.bookmarkCards, `>= ${MIN_BOOKMARK_CARDS}`),
    check('home images not broken', result.home.brokenImages === 0, result.home.brokenImages, '0'),
    check('home theme toggle works', result.home.themeChanged, result.home.themeChanged, true),
    check('home search clears back', result.home.search?.clearedCards === result.home.bookmarkCards, result.home.search, 'clearedCards equals initial'),
    check('admin opened from home', result.openAdmin.ok, result.openAdmin, 'ok'),
    check('admin shell rendered', result.admin.adminPage && result.admin.homeButton && result.admin.logoutButton, result.admin, 'admin controls visible'),
    check('admin bookmark search works', result.admin.bookmarkSearch.inputFound && result.admin.bookmarkSearch.rowsAfterClear >= 1, result.admin.bookmarkSearch, 'search input and rows'),
    check('settings tab rendered', result.admin.settings.rendered && result.admin.settings.inputs > 0, result.admin.settings, 'settings form'),
    check('backup tab rendered', result.admin.backup.rendered && result.admin.backup.sourceSelect && result.admin.backup.importInput, result.admin.backup, 'backup controls'),
    check('bookmark context edit modal works', result.contextMenu.ok, result.contextMenu, 'right-click edit open/cancel'),
    check('logout clears auth', result.logout.logoutButtonFound && result.logout.authCleared, result.logout, 'auth cleared'),
  ]
}

async function cleanup() {
  try {
    await evaluate(`(() => { localStorage.removeItem('cf-navs.auth'); sessionStorage.clear(); return true })()`, 3000)
  } catch {
    // Best effort.
  }

  if (browserSessionMode && browserTargetId) {
    try {
      await sendBrowserCommand('Target.closeTarget', { targetId: browserTargetId }, 3000)
    } catch {
      // Best effort cleanup.
    }
  }

  try {
    ws?.close()
  } catch {
    // Best effort.
  }

  if (startedChrome && chromeProcess) {
    try {
      chromeProcess.kill()
    } catch {
      // Best effort.
    }

    await sleep(500)
    if (CHROME_USER_DATA_DIR.includes(`cf-navs-chrome-profile-${CHROME_DEBUG_PORT}`)) {
      await rm(CHROME_USER_DATA_DIR, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  await ensureChrome()
  const activeTarget = await readDevToolsActivePort()
  if (activeTarget && !(await isChromeDebugPortReady())) {
    await connectBrowserSession(activeTarget)
  } else {
    const target = await getPageTarget()
    await connect(target)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Fetch.enable', {
    patterns: [
      {
        urlPattern: '*/api/bookmarks/*/icon-cache/refresh',
        requestStage: 'Request',
      },
    ],
  })

  try {
    await send('Page.navigate', { url: TARGET_URL })
    await waitForNetworkIdle()
    await clearBrowserState()
    await login()
    await navigateHome()

    const api = await runApiChecks()
    const home = await runHomeChecks()
    const openAdmin = await openAdminFromHome()
    const admin = await runAdminChecks()
    const contextMenu = await runContextMenuChecks()
    const logout = await runLogoutCheck()
    await waitForNetworkIdle()

    const result = {
      startedAt,
      target: TARGET_URL,
      chromeDebugPort: CHROME_DEBUG_PORT,
      chromeConnectionMode,
      chromeConnectedPort,
      startedChrome,
      api,
      home,
      openAdmin,
      admin,
      contextMenu,
      logout,
      network: summarizeNetwork(),
      consoleErrors: consoleMessages,
      pageExceptions,
    }
    result.checks = collectChecks(result)

    console.log(JSON.stringify(result, null, 2))

    if (!ALLOW_FAILURES && result.checks.some((item) => !item.passed)) {
      process.exitCode = 1
    }
  } finally {
    await cleanup()
  }
}

main().catch(async (error) => {
  console.error(error)
  await cleanup()
  process.exit(1)
})
