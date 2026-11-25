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
//   PERF_MAX_ICON_REQUESTS=270

import { join as pathJoin } from 'node:path'
import { CdpSession } from './lib/cdpSession.mjs'
import { requireAdminCredentials } from './lib/verifyCredentials.mjs'
import { resolveBaseUrl, resolveChromeProfileRoot, resolveSetting } from './lib/verifyTarget.mjs'
import { loginInPage } from './lib/browserLogin.mjs'
import { createOwnedTestSessions } from './lib/ownedTestSessions.mjs'
import { classifyHomeSearchMutations } from './lib/homeSearchMutations.mjs'

const BASE_URL = resolveBaseUrl()
const CHROME_DEBUG_PORT = resolveSetting('CHROME_DEBUG_PORT', 'chromeDebugPort', '9223')
const { username: ADMIN_USER, password: ADMIN_PASS } = requireAdminCredentials()
const ALLOW_FAILURES = process.env.PERF_AUDIT_ALLOW_FAILURES === '1'
const MAX_FAILED_REQUESTS = readIntegerEnv('PERF_MAX_FAILED_REQUESTS', 0)
const MAX_ADMIN_DATA_TRANSFER = readIntegerEnv('PERF_MAX_ADMIN_DATA_TRANSFER', 60000)
const MAX_CACHE_BYTES = readIntegerEnv('PERF_MAX_CACHE_BYTES', 5 * 1024 * 1024)
const MIN_BOOKMARK_CARDS = readIntegerEnv('PERF_MIN_BOOKMARK_CARDS', 300)
const MAX_ICON_REQUESTS = readIntegerEnv('PERF_MAX_ICON_REQUESTS', 270)

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

async function login(ownedSessions) {
  const result = await evaluate(
    `(${loginInPage.toString()})(${JSON.stringify(TARGET_ORIGIN)}, ${JSON.stringify(ADMIN_USER)}, ${JSON.stringify(ADMIN_PASS)}, true)`,
  )
  // 使用此次登录响应的准确 Token；不从可能已被其它会话改写的 localStorage 回取。
  if (result?.token) ownedSessions.register(result.token)
  if (result?.storageFailed) throw new Error('login storage initialization failed')
  if (!result?.ok) throw new Error(`login failed: status=${result?.status ?? 'unknown'} code=${result?.code ?? 'unknown'}`)
  return { username: result.username, expires_at: result.expires_at }
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
    `(${async function searchHome(classifyMutations) {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const input = document.querySelector('.search-card input')
      if (!input) return { error: 'home search input not found' }

      // 「立即重渲染」判定窗：低于任何合理防抖阈值（产品当前 120ms）。用 MutationObserver
      // 批次的真实时间戳判定，不依赖 setTimeout 精度，因此对测量环境卡顿免疫——过载环境下
      // 早先按键的间隔被拉长、防抖在打字途中触发的重渲染，其时间戳不落在「最后一次按键 + 60ms」
      // 窗内，不会误判为未防抖；未防抖实现则会在每次按键后一个 tick（远小于 60ms）内重渲染。
      const IMMEDIATE_WINDOW_MS = 60

      // DOM identities remain in the page realm and are never returned in diagnostics.
      const beforeCards = Array.from(document.querySelectorAll('.bookmark-card-shell'))
      const before = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: beforeCards.length,
        sections: document.querySelectorAll('[data-section-id]').length,
      }

      const start = performance.now()
      const batches = []
      const observer = new MutationObserver((list) => {
        batches.push({ at: performance.now() - start, ...classifyMutations(list) })
      })
      observer.observe(document.querySelector('main') || document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      })
      const totals = () => batches.reduce((sum, batch) => ({
        // Keep the existing mutations field for genuine result records only.
        mutations: sum.mutations + batch.resultRecords,
        rawMutations: sum.rawMutations + batch.rawRecords,
        decorativeMutations: sum.decorativeMutations + batch.decorativeRecords,
        cardStructureMutations: sum.cardStructureMutations + batch.cardStructureRecords,
      }), { mutations: 0, rawMutations: 0, decorativeMutations: 0, cardStructureMutations: 0 })

      const keyTimes = []
      for (const value of ['n', 'np', 'npm']) {
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        keyTimes.push(performance.now() - start)
        await delay(45)
      }

      const afterRapid = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        ...totals(),
      }

      await delay(260)
      const settledAt = performance.now() - start
      const settledCards = Array.from(document.querySelectorAll('.bookmark-card-shell'))
      const resultSetChanged = beforeCards.length !== settledCards.length ||
        beforeCards.some((card, index) => card !== settledCards[index])
      const afterSettled = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: settledCards.length,
        sections: document.querySelectorAll('[data-section-id]').length,
        ...totals(),
      }

      const lastKeyAt = keyTimes[keyTimes.length - 1]
      const gaps = keyTimes.slice(1).map((time, index) => Math.round(time - keyTimes[index]))
      // 只统计「最后一次按键」之后、判定窗内的真实结果批次，忽略已知图标子树的装饰替换：
      // 防抖实现把重渲染推迟到 ~120ms 后（窗外），
      // 未防抖实现在按键后一个 tick 内重渲染（窗内）。用真实时间戳，卡顿不影响判定。
      const immediateAfterLastKey = batches.filter(
        (batch) => batch.resultRecords > 0 && batch.at >= lastKeyAt && batch.at <= lastKeyAt + IMMEDIATE_WINDOW_MS,
      ).length
      // 正向佐证：窗后有明确卡片结构变更，且 settled 结果集合、顺序或节点身份真的改变。
      // 未知节点、标题或图标变化不能代替搜索结果变化。
      const rebuiltAfterSettle = resultSetChanged && batches.some(
        (batch) => batch.cardStructureRecords > 0 && batch.at > lastKeyAt + IMMEDIATE_WINDOW_MS && batch.at <= settledAt,
      )

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(260)
      const afterClear = {
        nodes: document.querySelectorAll('*').length,
        links: document.querySelectorAll('a').length,
        cards: document.querySelectorAll('.bookmark-card-shell').length,
        sections: document.querySelectorAll('[data-section-id]').length,
        ...totals(),
      }

      observer.disconnect()
      return {
        before,
        afterRapid,
        afterSettled,
        afterClear,
        keyTimes,
        gaps,
        maxGap: gaps.length ? Math.max(...gaps) : 0,
        immediateWindowMs: IMMEDIATE_WINDOW_MS,
        immediateAfterLastKey,
        rebuiltAfterSettle,
        resultSetChanged,
        settledAt,
        mutationSummary: {
          rawRecords: afterClear.rawMutations,
          resultRecords: afterClear.mutations,
          decorativeRecords: afterClear.decorativeMutations,
          cardStructureRecords: afterClear.cardStructureMutations,
          rawBatches: batches.length,
          resultBatches: batches.filter((batch) => batch.resultRecords > 0).length,
          decorativeBatches: batches.filter((batch) => batch.resultRecords === 0).length,
          mixedBatches: batches.filter((batch) => batch.resultRecords > 0 && batch.decorativeRecords > 0).length,
        },
        batches,
      }
    }.toString()})(${classifyHomeSearchMutations.toString()})`,
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

  const summarizePathRequests = (prefix) => {
    const selected = requests
      .filter((request) => new URL(request.url).pathname.startsWith(prefix))
      .map((request) => new URL(request.url))
    const paths = selected.map((url) => url.pathname)
    const counts = new Map()
    for (const path of paths) counts.set(path, (counts.get(path) || 0) + 1)
    const exactUrls = new Map()
    for (const url of selected) exactUrls.set(url.href, (exactUrls.get(url.href) || 0) + 1)
    const duplicateRequests = [...counts.values()]
      .filter((count) => count > 1)
      .reduce((total, count) => total + count - 1, 0)
    const exactDuplicateRequests = [...exactUrls.values()]
      .filter((count) => count > 1)
      .reduce((total, count) => total + count - 1, 0)
    return {
      total: paths.length,
      uniquePaths: counts.size,
      duplicateRequests,
      uniqueUrls: exactUrls.size,
      exactDuplicateRequests,
      repeatedPaths: [...counts.entries()]
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([path, count]) => ({ path, count })),
    }
  }

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
    iconRequestSummary: summarizePathRequests('/api/icon/'),
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
      // 时序稳健：只看「最后一次按键 + 60ms」窗内有没有立即重渲染（未防抖会命中），
      // 不再用连打全程的累计 mutation——那会在过载测量环境下把被拉长的按键间隔误判成缺防抖。
      'home search debounced before settle',
      result.homeSearch.immediateAfterLastKey === 0 && result.homeSearch.rebuiltAfterSettle === true,
      {
        immediateAfterLastKey: result.homeSearch.immediateAfterLastKey,
        afterRapidMutations: result.homeSearch.afterRapid?.mutations,
        gaps: result.homeSearch.gaps,
        afterSettledMutations: result.homeSearch.afterSettled?.mutations,
        rebuiltAfterSettle: result.homeSearch.rebuiltAfterSettle,
        resultSetChanged: result.homeSearch.resultSetChanged,
        mutationSummary: result.homeSearch.mutationSummary,
        keyTimes: result.homeSearch.keyTimes,
      },
      'no result rebuild within 60ms of the final keystroke, followed by a real result change after settle',
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
 * 选择可用的 DevTools 端点，或准备一个尚未启动的隔离 Chrome 会话。
 *
 * 端口空着就启动隔离临时 Chrome；端口被占用但不是 DevTools 端点（例如恰好撞上使用者
 * 自己 Chrome 随机占用的端口）时给出可操作错误，而不是让后面的请求抛出 404。
 */
async function prepareDevToolsSession() {
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
  return session
}

async function main() {
  const startedAt = new Date().toISOString()
  const ownedSessions = createOwnedTestSessions({ baseUrl: TARGET_ORIGIN })
  const launched = await prepareDevToolsSession()
  let result = null

  try {
    if (launched) await launched.start()
    const target = await getPageTarget()
    await connect(target)
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    await send('Page.navigate', { url: TARGET_URL })
    await waitForNetworkIdle()
    await login(ownedSessions)
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

    result = {
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

    if (!ALLOW_FAILURES && checks.some((check) => !check.passed)) {
      process.exitCode = 1
    }
  } finally {
    try {
      const testSessions = await ownedSessions.cleanup()
      if (result) result.testSessions = testSessions
      if (!testSessions.ok) {
        console.error('test session cleanup failed')
        process.exitCode = 1
      }
    } catch {
      if (result) result.testSessions = { ok: false, error: 'test session cleanup did not complete' }
      console.error('test session cleanup did not complete')
      process.exitCode = 1
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
        if (result) result.cleanup = outcome
        for (const warning of outcome.warnings) console.error('cleanup warning:', warning)
        if (outcome.errors.length > 0) {
          console.error('cleanup failed:', outcome.errors.join('; '))
          process.exitCode = 1
        }
      }
    }
  }
  if (result) console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
