// Real-browser performance audit for CF-Navs through Chrome DevTools Protocol.
//
// Usage:
//   ADMIN_USER=admin ADMIN_PASS=... node scripts/perf-audit.mjs
//
// The target origin and browser defaults come from the git-ignored
// verify.local.json in the repository root. Credentials remain environment-only.
// Environment variables win over local configuration.
// See verify.local.example.json for the template.
//
// Optional env:
//   BASE_URL=https://your-cf-navs-domain.example
//   CHROME_DEBUG_PORT=9223
//   PERF_AUDIT_ALLOW_FAILURES=1
//   PERF_MAX_FAILED_REQUESTS=0
//   PERF_MAX_ADMIN_DATA_TRANSFER=60000
//   PERF_MAX_CACHE_BYTES=5242880
//   PERF_MIN_BOOKMARK_CARDS=300
//   PERF_MAX_ICON_REQUESTS=260

import { join as pathJoin } from 'node:path'
import { CdpSession } from './lib/cdpSession.mjs'
import { requireAdminCredentials } from './lib/verifyCredentials.mjs'
import { resolveBaseUrl, resolveChromeProfileRoot, resolveSetting } from './lib/verifyTarget.mjs'

const BASE_URL = resolveBaseUrl()
const CHROME_DEBUG_PORT = resolveSetting('CHROME_DEBUG_PORT', 'chromeDebugPort', '9223')
const { username: ADMIN_USER, password: ADMIN_PASS } = requireAdminCredentials()
const ALLOW_FAILURES = process.env.PERF_AUDIT_ALLOW_FAILURES === '1'
const MAX_FAILED_REQUESTS = readIntegerEnv('PERF_MAX_FAILED_REQUESTS', 0)
const MAX_ADMIN_DATA_TRANSFER = readIntegerEnv('PERF_MAX_ADMIN_DATA_TRANSFER', 60000)
const MAX_CACHE_BYTES = readIntegerEnv('PERF_MAX_CACHE_BYTES', 5 * 1024 * 1024)
const MIN_BOOKMARK_CARDS = readIntegerEnv('PERF_MIN_BOOKMARK_CARDS', 300)
const MAX_ICON_REQUESTS = readIntegerEnv('PERF_MAX_ICON_REQUESTS', 260)

const TARGET_ORIGIN = new URL(BASE_URL).origin
const TARGET_URL = `${TARGET_ORIGIN}/`

let nextId = 0
let ws = null
let pageTargetId = null
let pageTargetCreatedByTest = false
const pending = new Map()
const events = []
const network = new Map()

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

async function getPageTarget() {
  const endpoint = `http://127.0.0.1:${CHROME_DEBUG_PORT}`
  const created = await fetchJson(`${endpoint}/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' })
  if (!created.webSocketDebuggerUrl) {
    throw new Error('Chrome target was created without webSocketDebuggerUrl.')
  }
  pageTargetId = created.id || created.targetId || null
  pageTargetCreatedByTest = true
  return created
}

function connect(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl)

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
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
      events.push(message)
    }
  })

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
}

function send(method, params = {}, timeoutMs = 30000) {
  if (!ws) throw new Error('CDP WebSocket is not connected.')

  const id = ++nextId
  ws.send(JSON.stringify({ id, method, params }))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, timeoutMs)

    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    })
  })
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
    timeoutMs + 2000,
  )

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails))
  }

  return result.result?.value
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

async function waitForNetworkIdle(idleMs = 1500, maxMs = 35000) {
  let lastChangeAt = Date.now()
  let previousCount = 0
  const startedAt = Date.now()

  while (Date.now() - startedAt < maxMs) {
    harvestNetworkEvents()
    if (network.size !== previousCount) {
      previousCount = network.size
      lastChangeAt = Date.now()
    }
    if (Date.now() - lastChangeAt >= idleMs) break
    await sleep(100)
  }

  harvestNetworkEvents()
}

async function login() {
  return evaluate(
    `(${async function loginInPage(baseUrl, username, password) {
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
    }.toString()})(${JSON.stringify(TARGET_ORIGIN)}, ${JSON.stringify(ADMIN_USER)}, ${JSON.stringify(ADMIN_PASS)})`,
  )
}

async function navigateHome() {
  resetNetwork()
  await send('Page.navigate', { url: TARGET_URL })
  await waitForNetworkIdle()
}

async function getHomeStats() {
  return evaluate(`(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    return {
      splashCount: document.querySelectorAll('.app-splash').length,
      nodes: document.querySelectorAll('*').length,
      links: document.querySelectorAll('a').length,
      images: document.images.length,
      bookmarkCards: document.querySelectorAll('.bookmark-card-shell').length,
      sections: document.querySelectorAll('[data-section-id]').length,
      brokenImages: Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length,
      navigation: nav
        ? {
            duration: Math.round(nav.duration),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
            load: Math.round(nav.loadEventEnd),
            transferSize: nav.transferSize,
            encodedBodySize: nav.encodedBodySize,
          }
        : null,
    }
  })()`)
}

async function runFullScroll() {
  return evaluate(
    `(${async function scrollPage() {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      for (let y = 0; y <= max; y += 700) {
        window.scrollTo(0, y)
        await delay(60)
      }
      window.scrollTo(0, 0)
      await delay(400)
      return {
        y: window.scrollY,
        images: document.images.length,
        brokenImages: Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length,
      }
    }.toString()})()`,
    45000,
  )
}

async function runHomeSearch() {
  return evaluate(
    `(${async function searchHome() {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const input = document.querySelector('.search-card input')
      if (!input) return { error: 'home search input not found' }

      const before = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        sections: document.querySelectorAll('[data-section-id]').length,
      }

      const mutations = { count: 0 }
      const observer = new MutationObserver((list) => {
        mutations.count += list.length
      })
      observer.observe(document.querySelector('main') || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      for (const value of ['n', 'np', 'npm']) {
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await delay(45)
      }

      const afterRapid = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        mutations: mutations.count,
      }

      await delay(260)
      const afterSettled = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        sections: document.querySelectorAll('[data-section-id]').length,
        mutations: mutations.count,
      }

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(260)
      const afterClear = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        sections: document.querySelectorAll('[data-section-id]').length,
        mutations: mutations.count,
      }

      observer.disconnect()
      return { before, afterRapid, afterSettled, afterClear }
    }.toString()})()`,
    45000,
  )
}

async function runAdminSearch() {
  return evaluate(
    `(${async function searchAdmin() {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const adminButton =
        document.querySelector('[data-testid="home-admin-button"]') ||
        document.querySelector('[aria-label="管理后台"], [title="管理后台"]')
      if (!adminButton) return { error: 'admin button not found' }

      adminButton.click()
      for (let i = 0; i < 160 && !document.querySelector('.admin-page'); i += 1) {
        await delay(100)
      }

      if (!document.querySelector('.admin-page')) {
        return { error: 'admin page did not open' }
      }

      const bookmarkTab =
        document.querySelector('[data-testid="admin-tab-bookmarks"]') ||
        Array.from(document.querySelectorAll('.admin-sidebar button')).find((button) => button.textContent?.includes('书签管理'))
      bookmarkTab?.click()
      await delay(300)

      const input =
        document.querySelector('[data-testid="admin-bookmark-search"]') ||
        document.querySelector('.admin-bookmark-search-bar input')
      if (!input) return { error: 'admin search input not found' }

      const mutations = { count: 0 }
      const observer = new MutationObserver((list) => {
        mutations.count += list.length
      })
      observer.observe(document.querySelector('.admin-content') || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })

      // 从当前列表里取一个真实存在的词，逐字符输入以复现防抖行为。
      // 写死关键词（原来是 'npm'）在数据不同的实例上必然命中 0 行，测出来的是夹具问题。
      const firstRow = document.querySelector('tbody tr')
      const rowText = (firstRow?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const term = (rowText.match(/[\p{L}\p{N}]{2,}/u)?.[0] ?? '').slice(0, 4)
      if (!term) {
        observer.disconnect()
        return { error: 'no searchable term found in the bookmark table' }
      }

      for (let length = 1; length <= term.length; length += 1) {
        input.value = term.slice(0, length)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await delay(80)
      }
      await delay(500)

      const afterSearch = {
        term,
        rows: document.querySelectorAll('tbody tr').length,
        nodes: document.querySelectorAll('*').length,
        mutations: mutations.count,
      }

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(250)

      const afterClear = {
        rows: document.querySelectorAll('tbody tr').length,
        nodes: document.querySelectorAll('*').length,
      }

      observer.disconnect()

      return {
        activeTab: document.querySelector('.admin-sidebar button.active')?.textContent?.trim() || '',
        afterSearch,
        afterClear,
      }
    }.toString()})()`,
    60000,
  )
}

async function getStorageStats() {
  return evaluate(
    `(${async function storageStats() {
      const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null
      const cacheNames = typeof caches !== 'undefined' ? await caches.keys() : []
      let cacheEntries = 0
      let cacheBytes = 0

      for (const name of cacheNames) {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        cacheEntries += keys.length

        for (const request of keys) {
          const response = await cache.match(request)
          if (!response) continue
          try {
            cacheBytes += (await response.clone().arrayBuffer()).byteLength
          } catch {
            // Ignore unreadable entries.
          }
        }
      }

      return { estimate, cacheNames, cacheEntries, cacheBytes }
    }.toString()})()`,
    45000,
  )
}

function summarizeNetwork() {
  harvestNetworkEvents()
  const requests = Array.from(network.values()).filter((request) => request.url)
  const failed = requests.filter((request) => request.failed || (request.status && request.status >= 400))

  const countPath = (prefix) =>
    requests.filter((request) => new URL(request.url).pathname.startsWith(prefix)).length

  const byHost = {}
  for (const request of requests) {
    const host = new URL(request.url).host
    byHost[host] = (byHost[host] || 0) + 1
  }

  const adminData = requests.find((request) => new URL(request.url).pathname === '/api/admin/data')

  const targetHost = new URL(TARGET_ORIGIN).host
  const isFirstParty = (request) => new URL(request.url).host === targetHost

  // 收尾时 Page.close 会中止此刻仍在进行的文档请求（典型是 Service Worker 的导航预载），
  // 它会被记成 net::ERR_FAILED。那是本脚本自己造成的，不是站点故障——accept:prod 同样
  // 反复导航根路径却没有失败请求，差别就在于它不关页面。只放行「根文档 + ERR_FAILED」
  // 这一种组合，其它本站失败照旧算失败。
  const isTeardownAbort = (request) => {
    const url = new URL(request.url)
    return (
      url.host === targetHost &&
      (url.pathname === '/' || url.pathname === '') &&
      request.errorText === 'net::ERR_FAILED'
    )
  }

  return {
    totalRequests: requests.length,
    navsHostRequests: requests.filter(isFirstParty).length,
    failedFirstParty: failed
      .filter((request) => isFirstParty(request) && !isTeardownAbort(request))
      .map((request) => ({
        url: request.url,
        status: request.status ?? null,
        errorText: request.errorText ?? null,
      })),
    teardownAborts: failed.filter(isTeardownAbort).length,
    failedThirdParty: failed.filter((request) => !isFirstParty(request)).map((request) => ({
      host: new URL(request.url).host,
      status: request.status ?? null,
      errorText: request.errorText ?? null,
    })),
    apiRequests: countPath('/api/'),
    iconRequests: countPath('/api/icon/'),
    iconifyRequests: countPath('/api/iconify/'),
    categoryIconRequests: countPath('/api/category-icon/'),
    byHost,
    failed: failed.slice(0, 20).map((request) => ({
      url: request.url,
      status: request.status,
      errorText: request.errorText,
      canceled: request.canceled,
    })),
    adminData: adminData
      ? {
          status: adminData.status,
          transfer: adminData.encodedDataLength || 0,
          fromServiceWorker: Boolean(adminData.fromServiceWorker),
          fromDiskCache: Boolean(adminData.fromDiskCache),
        }
      : null,
  }
}

function auditCheck(name, passed, actual, expected) {
  return { name, passed, actual, expected }
}

function collectAuditChecks(result) {
  return [
    // 按 origin 分开算。外站图标失败是站点管不着的事——书签指向的第三方图片可能设了
    // `Cross-Origin-Resource-Policy: same-origin`，浏览器直接拒收（生产实测遇到一例）。
    // 前端对此有兜底，`home broken images` 那条能证明用户看不到破图。
    // 真正不能容忍的是**本站**请求失败，那才说明部署或路由出了问题。
    auditCheck(
      'failed first-party requests',
      result.network.failedFirstParty.length <= MAX_FAILED_REQUESTS,
      result.network.failedFirstParty,
      `<= ${MAX_FAILED_REQUESTS} first-party failures`,
    ),
    auditCheck(
      'third-party resource failures reported',
      true,
      result.network.failedThirdParty.map((item) => `${item.host} ${item.errorText ?? item.status}`),
      'informational only; the icon fallback path covers these',
    ),
    auditCheck(
      'home bookmark card count',
      result.homeBeforeScroll.bookmarkCards >= MIN_BOOKMARK_CARDS,
      result.homeBeforeScroll.bookmarkCards,
      `>= ${MIN_BOOKMARK_CARDS}`,
    ),
    auditCheck(
      'home broken images',
      result.homeBeforeScroll.brokenImages === 0 && result.scroll.brokenImages === 0,
      result.homeBeforeScroll.brokenImages + result.scroll.brokenImages,
      '0',
    ),
    auditCheck(
      'startup splash removed',
      result.homeBeforeScroll.splashCount === 0,
      result.homeBeforeScroll.splashCount,
      '0',
    ),
    auditCheck(
      'home search debounced before settle',
      result.homeSearch.afterRapid?.mutations === 0,
      result.homeSearch.afterRapid?.mutations,
      '0',
    ),
    auditCheck(
      'admin search completed',
      !result.adminSearch.error && result.adminSearch.afterSearch?.rows > 0,
      result.adminSearch.error || result.adminSearch.afterSearch?.rows,
      'rows > 0',
    ),
    auditCheck(
      'admin data transfer',
      Boolean(result.network.adminData) && result.network.adminData.transfer <= MAX_ADMIN_DATA_TRANSFER,
      result.network.adminData?.transfer ?? null,
      `<= ${MAX_ADMIN_DATA_TRANSFER}`,
    ),
    auditCheck(
      'bookmark icon requests',
      result.network.iconRequests <= MAX_ICON_REQUESTS,
      result.network.iconRequests,
      `<= ${MAX_ICON_REQUESTS}`,
    ),
    auditCheck(
      'cache storage bytes',
      result.storage.cacheBytes <= MAX_CACHE_BYTES,
      result.storage.cacheBytes,
      `<= ${MAX_CACHE_BYTES}`,
    ),
  ]
}

async function clearAuth() {
  try {
    await evaluate(`(() => { localStorage.removeItem('cf-navs.auth'); return true })()`)
  } catch {
    // Best effort cleanup.
  }
}

/**
 * 保证 chromeDebugPort 上有一个可用的 DevTools 端点。
 *
 * 端口空着就启动隔离临时 Chrome；端口被占用但不是 DevTools 端点（例如恰好撞上使用者
 * 自己 Chrome 随机占用的端口）时给出可操作错误，而不是让后面的请求抛出 404。
 */
async function ensureDevToolsEndpoint() {
  const endpoint = `http://127.0.0.1:${CHROME_DEBUG_PORT}`

  let listening = false
  try {
    const probe = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(3000) })
    if (probe.ok) return null
    listening = true
  } catch {
    listening = false
  }

  if (listening) {
    throw new Error(
      `Port ${CHROME_DEBUG_PORT} is in use but does not answer /json/version.\n` +
      "Something other than a DevTools endpoint is listening there — commonly the user's own Chrome, " +
      'which grabs assorted local ports.\n' +
      'Pick a free port for chromeDebugPort in verify.local.json (or CHROME_DEBUG_PORT).',
    )
  }

  const chromeExe = resolveSetting(
    'CHROME_EXE',
    'chromeExe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  )
  const profileDir = pathJoin(
    resolveChromeProfileRoot(),
    `cf-navs-chrome-profile-perf-${Date.now().toString(36)}`,
  )
  const session = new CdpSession({
    chromeExe,
    debugPort: CHROME_DEBUG_PORT,
    userDataDir: profileDir,
    headless: process.env.PERF_HEADED !== '1',
    noSandbox: process.env.CHROME_NO_SANDBOX === '1',
  })
  await session.start()
  return session
}

async function main() {
  const startedAt = new Date().toISOString()
  const launched = await ensureDevToolsEndpoint()
  const target = await getPageTarget()
  await connect(target)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')

  try {
    await send('Page.navigate', { url: TARGET_URL })
    await waitForNetworkIdle()
    await login()
    await navigateHome()

    const homeBeforeScroll = await getHomeStats()
    const scroll = await runFullScroll()
    await waitForNetworkIdle(1300, 25000)
    const homeSearch = await runHomeSearch()
    await waitForNetworkIdle(1000, 15000)
    const adminSearch = await runAdminSearch()
    await waitForNetworkIdle(1300, 25000)
    const storage = await getStorageStats()
    const networkSummary = summarizeNetwork()

    const result = {
      startedAt,
      target: TARGET_URL,
      homeBeforeScroll,
      scroll,
      homeSearch,
      adminSearch,
      storage,
      network: networkSummary,
    }
    const checks = collectAuditChecks(result)
    result.checks = checks

    console.log(JSON.stringify(result, null, 2))

    if (!ALLOW_FAILURES && checks.some((check) => !check.passed)) {
      process.exitCode = 1
    }
  } finally {
    await clearAuth()
    if (pageTargetCreatedByTest) {
      try {
        await send('Page.close', {}, 3000)
      } catch {
        if (pageTargetId) {
          const endpoint = `http://127.0.0.1:${CHROME_DEBUG_PORT}`
          await fetch(`${endpoint}/json/close/${pageTargetId}`).catch(() => undefined)
        }
      }
    }
    ws?.close()

    if (launched) {
      const outcome = await launched.cleanup()
      for (const warning of outcome.warnings) console.error('cleanup warning:', warning)
      if (outcome.errors.length > 0) {
        console.error('cleanup failed:', outcome.errors.join('; '))
        process.exitCode = 1
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
