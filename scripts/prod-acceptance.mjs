// CF-Navs 生产验收：只读探针（Tier 0）。
//
// 用法：
//   node scripts/prod-acceptance.mjs
//   npm run accept:prod
//
// 目标站点与凭据来自被 Git 忽略的 verify.local.json（模板见 verify.local.example.json），
// 或同名环境变量。真实域名与凭据不写进任何会提交的文件。
//
// ── 为什么单独一个脚本，而不是往 chrome-regression.mjs 里加 ────────────────────
// chrome-regression.mjs 会真实改写再还原管理员密码。那是 Tier 1 写操作：一旦进程在
// 改完密码、还没还原时被打断（Ctrl+C、断网、Chrome 崩溃），临时密码只存在于内存里，
// 管理员访问就永久丢失。本脚本刻意只做**零写入**的检查，因此可以无条件对生产跑，
// 不需要每次都权衡风险。
//
// ── 分层 ──────────────────────────────────────────────────────────────────────
//   Tier 0（本脚本）：不产生任何服务端状态变化。登出只作废本次自己创建的会话。
//   Tier 1（需逐次授权）：改设置再还原——S3 自定义 JS、REQ-08b 逐套预设视觉。
//   Tier 2（生产禁止）：replace/merge 导入会清库；密码轮换。只在本地实例做。
//
// 覆盖的 backlog 条目见 docs/guides/PRODUCTION_ACCEPTANCE.md 的对照表。

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { pageModalMetrics, pageModalControl, pageModalsClosed, assessModalActions, waitForModal, pageModalFault } from './lib/modalAcceptanceProbe.mjs'
import {
  pickExportSample,
  verifyExportDownload,
  pageReadExportSource,
  pageInstallExportCapture,
  pageReadExportDownload,
  pageRestoreExportCapture,
  pageExportControl,
} from './lib/backupExportProbe.mjs'
import { redactCredentials, requireAdminCredentials } from './lib/verifyCredentials.mjs'
import { resolveBaseUrl, resolveChromeProfileRoot, resolveSetting } from './lib/verifyTarget.mjs'

const BASE_URL = resolveBaseUrl()
const TARGET_ORIGIN = new URL(BASE_URL).origin
const TARGET_URL = `${TARGET_ORIGIN}/`

const CHROME_EXE = resolveSetting(
  'CHROME_EXE',
  'chromeExe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
)
const DEBUG_PORT = resolveSetting('ACCEPT_DEBUG_PORT', 'acceptDebugPort', '9231')
const PROFILE_DIR = path.join(
  resolveChromeProfileRoot(),
  `cf-navs-chrome-profile-accept-${Date.now().toString(36)}`,
)
const HEADLESS = process.env.ACCEPT_HEADED !== '1'
const NO_SANDBOX = process.env.CHROME_NO_SANDBOX === '1'
const SCOPE = process.env.ACCEPT_SCOPE || 'all'
if (!['all', 'modals'].includes(SCOPE)) throw new Error('ACCEPT_SCOPE must be all or modals')
const ALLOW_FAILURES = process.env.ACCEPT_ALLOW_FAILURES === '1'
const MAX_CACHE_BYTES = Number.parseInt(process.env.ACCEPT_MAX_CACHE_BYTES || '', 10) || 5 * 1024 * 1024
const REVOCATION_WINDOW_MS = Number.parseInt(process.env.ACCEPT_REVOCATION_WINDOW_MS || '', 10) || 15000
const SHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  process.env.ACCEPT_SCREENSHOT_DIR || 'tmp/acceptance',
)

const credentials = requireAdminCredentials()
const checks = []

function check(id, backlog, passed, detail) {
  checks.push({ id, backlog, status: passed ? 'pass' : 'fail', detail })
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${id}  [${backlog}]${detail ? `  ${detail}` : ''}`)
  return passed
}

// 实例上不存在被测对象（例如没有任何私密分类）是环境事实，不是缺陷。
// 记为 skip 并如实打印原因，不计入失败，也不影响退出码——否则真失败会被噪声淹没。
function skip(id, backlog, reason) {
  checks.push({ id, backlog, status: 'skip', detail: reason })
  console.log(`  SKIP  ${id}  [${backlog}]  ${reason}`)
  return false
}

function phase(title) {
  console.log(`\n${title}`)
}

// ── 页面上下文函数：不能捕获宿主闭包，参数必须可序列化 ────────────────────────

function pageLogin(origin, username, password) {
  return fetch(`${origin}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
    .then((response) => response.json())
    .then((body) => {
      if (body?.code === 0 && body?.data) {
        localStorage.setItem('cf-navs.auth', JSON.stringify(body.data))
        return { ok: true, token: body.data.token, expiresAt: body.data.expires_at ?? null }
      }
      return { ok: false, code: body?.code ?? null }
    })
}

function pageClearSiteState() {
  return (async () => {
    localStorage.clear()
    sessionStorage.clear()
    for (const key of await caches.keys()) await caches.delete(key)
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? []
    for (const registration of registrations) await registration.unregister()
    return { unregistered: registrations.length }
  })()
}

function pageCacheReport() {
  return (async () => {
    const keys = await caches.keys()
    const entries = []
    let totalBytes = 0

    for (const key of keys) {
      const cache = await caches.open(key)
      const requests = await cache.keys()
      let bytes = 0
      const urls = []
      for (const request of requests) {
        urls.push(request.url)
        const response = await cache.match(request)
        if (!response) continue
        const buffer = await response.clone().arrayBuffer().catch(() => null)
        if (buffer) bytes += buffer.byteLength
      }
      totalBytes += bytes
      entries.push({ key, count: requests.length, bytes, urls })
    }

    return { keys, totalBytes, entries }
  })()
}

function pageProbeAnonymous(origin, ids, token) {
  return (async () => {
    const probeJson = async (url) => {
      try {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
        let code = null
        try {
          code = (await response.clone().json())?.code ?? null
        } catch {
          code = null
        }
        return { status: response.status, code }
      } catch (error) {
        return { status: 0, code: null, error: String(error).slice(0, 200) }
      }
    }

    // 图标端点不返回 JSON，也不返回 401——按内容指纹比对，这才是「不泄露」的判据。
    const fingerprint = async (url) => {
      try {
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store' })
        const buffer = await response.arrayBuffer()
        const digest = await crypto.subtle.digest('SHA-256', buffer)
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
        return {
          status: response.status,
          bytes: buffer.byteLength,
          sha256: hex,
          contentType: response.headers.get('content-type') ?? '',
          cacheControl: response.headers.get('cache-control') ?? '',
        }
      } catch (error) {
        return { status: 0, bytes: 0, sha256: '', error: String(error).slice(0, 200) }
      }
    }

    const results = { adminData: await probeJson(`${origin}/api/admin/data`) }

    // 基线：一个几乎不可能存在的 id。私密对象的匿名响应必须与它逐字节相同。
    const absentId = 999999999
    results.absentBookmarkIcon = await fingerprint(`${origin}/api/icon/${absentId}`)
    results.absentCategoryIcon = await fingerprint(`${origin}/api/category-icon/${absentId}`)

    // 授权基线：拿一个短寿命 key，证明该对象确实有真实图标可取。
    // 没有这一步，「匿名拿到兜底」可能只是因为它本来就没图标，断言就是空转。
    let grantKey = ''
    if (token) {
      try {
        const grant = await fetch(`${origin}/api/icon-access`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        grantKey = (await grant.json().catch(() => null))?.data?.key ?? ''
      } catch {
        grantKey = ''
      }
    }
    results.grantAcquired = Boolean(grantKey)

    if (ids.bookmarkId != null) {
      results.privateBookmarkIcon = await fingerprint(`${origin}/api/icon/${ids.bookmarkId}`)
      if (grantKey) {
        results.authorizedBookmarkIcon = await fingerprint(
          `${origin}/api/icon/${ids.bookmarkId}?key=${encodeURIComponent(grantKey)}`,
        )
      }
    }
    if (ids.categoryId != null) {
      results.privateCategoryIcon = await fingerprint(`${origin}/api/category-icon/${ids.categoryId}`)
      if (grantKey) {
        results.authorizedCategoryIcon = await fingerprint(
          `${origin}/api/category-icon/${ids.categoryId}?key=${encodeURIComponent(grantKey)}`,
        )
      }
    }
    return results
  })()
}

function pageFindPrivateIds(origin, token) {
  return (async () => {
    const response = await fetch(`${origin}/api/admin/data`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const body = await response.json().catch(() => null)
    const categories = body?.data?.categories ?? []
    const bookmarks = body?.data?.bookmarks ?? []

    const privateCategory = categories.find((item) => item.is_private === true || item.is_private === 1)
    const privateCategoryIds = new Set(
      categories
        .filter((item) => item.is_private === true || item.is_private === 1)
        .map((item) => Number(item.id)),
    )
    const bookmarkInPrivate = bookmarks.find((item) => privateCategoryIds.has(Number(item.category_id)))

    return {
      categoryCount: categories.length,
      bookmarkCount: bookmarks.length,
      categoryId: privateCategory ? Number(privateCategory.id) : null,
      bookmarkId: bookmarkInPrivate ? Number(bookmarkInPrivate.id) : null,
    }
  })()
}

function pageLogoutAndProbe(origin, token) {
  return (async () => {
    const logout = await fetch(`${origin}/api/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    const logoutBody = await logout.json().catch(() => null)
    localStorage.removeItem('cf-navs.auth')
    return { status: logout.status, code: logoutBody?.code ?? null, store: logoutBody?.data?.store ?? null }
  })()
}

function pageProbeRevoked(origin, token) {
  return fetch(`${origin}/api/admin/data`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
    .then(async (response) => ({
      status: response.status,
      code: (await response.json().catch(() => null))?.code ?? null,
    }))
    .catch(() => ({ status: 0, code: null }))
}


async function closeModals(session) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await session.call(pageModalsClosed)) return { closed: true }
    const cancel = await session.call(pageModalControl, 'cancel') ?? await session.call(pageModalControl, 'category-cancel')
    if (cancel) { await session.mouse(cancel.x, cancel.y); await sleep(180); continue }
    for (const type of ['keyDown', 'keyUp']) {
      await session.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    }
    await sleep(180)
  }
  return { closed: await session.call(pageModalsClosed) }
}

function pageDeployedBundle() {
  const scripts = [...document.querySelectorAll('script[src]')].map((node) => node.getAttribute('src') ?? '')
  const entry = scripts.find((src) => /\/assets\/index-[^/]+\.js$/.test(src))
  return { entry: entry ?? null, scripts: scripts.slice(0, 8) }
}

function pageHomeSummary() {
  return {
    title: document.title,
    appMounted: Boolean(document.querySelector('.home-shell, [data-home-category-scope]')),
    scopes: document.querySelectorAll('[data-home-category-scope]').length,
    cards: document.querySelectorAll('.bookmark-card-shell, .bookmark-card').length,
    brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length,
    swController: Boolean(navigator.serviceWorker?.controller),
  }
}

// Cache.put and SW prewarming are asynchronous. Wait for the observable entries,
// but preserve the failing result if the bounded readiness window expires.
async function waitForPrecache(session, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  let cache
  do {
    cache = await session.call(pageCacheReport)
    const ready = cache.entries.some((entry) => /^cf-navs-v[0-9a-f]+$/i.test(entry.key) &&
      entry.urls.some((url) => /\/assets\/index-[^/]+\.js$/.test(url)) &&
      entry.urls.some((url) => /\/assets\/index-[^/]+\.css$/.test(url)))
    if (ready || Date.now() >= deadline) return cache
    await sleep(100)
  } while (Date.now() < deadline)
  return cache
}

// ── 场景 ──────────────────────────────────────────────────────────────────────

async function runFirstVisitChecks(session) {
  phase('L1 / L3 首访与预缓存')

  await session.send('Page.bringToFront')
  await session.navigate(TARGET_URL)
  await waitForModal(async () => (await session.call(pageHomeSummary)).appMounted, 'initial home ready', 30000)
  await session.call(pageClearSiteState)
  await session.send('Page.navigate', { url: 'about:blank' })
  await waitForModal(() => session.call(() => location.href === 'about:blank'), 'old document disposed')
  session.resetEvidence()

  // 清空站点状态后的首访：安装状态探测应当恰好出现一次
  await session.navigate(TARGET_URL)
  await waitForModal(async () => (await session.call(pageHomeSummary)).appMounted, 'home ready', 30000)
  await session.waitForNetworkIdle()
  const firstVisitInstallProbes = session.responses.filter((item) =>
    item.url.includes('/api/install/status'),
  ).length
  check(
    'install-status-probed-once-on-first-visit',
    'PROB-13 L1',
    firstVisitInstallProbes === 1,
    `probes=${firstVisitInstallProbes}`,
  )

  const home = await session.call(pageHomeSummary)
  check('home-app-mounted', 'PROB-13 L1', home.appMounted === true, `scopes=${home.scopes}`)
  check('home-images-not-broken', 'PROB-23', home.brokenImages === 0, `broken=${home.brokenImages}`)

  // 二访：安装状态不再探测，且应有响应来自 Service Worker
  session.resetEvidence()
  await session.navigate(TARGET_URL)
  await waitForModal(async () => (await session.call(pageHomeSummary)).appMounted, 'home ready', 30000)
  await session.waitForNetworkIdle()

  const secondVisitInstallProbes = session.responses.filter((item) =>
    item.url.includes('/api/install/status'),
  ).length
  check(
    'install-status-not-probed-on-second-visit',
    'PROB-13 L1',
    secondVisitInstallProbes === 0,
    `probes=${secondVisitInstallProbes}`,
  )

  const swServed = session.responses.filter((item) => item.fromServiceWorker)
  check(
    'second-visit-served-by-service-worker',
    'PROB-13 L3',
    swServed.length > 0,
    `fromServiceWorker=${swServed.length}`,
  )

  const cache = await waitForPrecache(session)
  const precache = cache.entries.find((entry) => /^cf-navs-v[0-9a-f]+$/i.test(entry.key))
  const hasJs = Boolean(precache?.urls.some((url) => /\/assets\/index-[^/]+\.js$/.test(url)))
  const hasCss = Boolean(precache?.urls.some((url) => /\/assets\/index-[^/]+\.css$/.test(url)))
  check(
    'precache-holds-entry-bundle',
    'PROB-13 L3',
    Boolean(precache) && hasJs && hasCss,
    `cache=${precache?.key ?? 'none'} js=${hasJs} css=${hasCss}`,
  )
  check(
    'cache-storage-within-budget',
    'PROB-23',
    cache.totalBytes <= MAX_CACHE_BYTES,
    `${(cache.totalBytes / 1024 / 1024).toFixed(2)} MiB / ${(MAX_CACHE_BYTES / 1024 / 1024).toFixed(0)} MiB`,
  )

  return { cacheKeys: cache.keys, cacheBytes: cache.totalBytes, home }
}

async function runOfflineCheck(session) {
  phase('L4 离线可打开')

  await session.setOffline(true)
  try {
    session.resetEvidence()
    await session.navigate(TARGET_URL, { waitIdleMs: 900, timeoutMs: 20000 }).catch(() => { })
    await waitForModal(async () => (await session.call(pageHomeSummary)).appMounted, 'offline home ready', 15000).catch(() => {})
    const offline = await session.call(pageHomeSummary)
    check(
      'offline-navigation-renders-shell',
      'PROB-13 L4',
      offline.appMounted === true,
      `scopes=${offline.scopes}`,
    )
  } finally {
    await session.setOffline(false)
  }

  await session.navigate(TARGET_URL)
  await sleep(1200)
}

async function runAnonymousProbes(session, ids, token) {
  phase('PROB-20c 匿名边界')

  const anonymous = await session.call(pageProbeAnonymous, TARGET_ORIGIN, {
    bookmarkId: ids.bookmarkId,
    categoryId: ids.categoryId,
  }, token)

  // 管理数据端点确实返回 401 / code 1001（shared/types.ts：UNAUTHORIZED = 1001）。
  check(
    'anonymous-admin-data-denied',
    'PROB-20c',
    anonymous.adminData?.status === 401 || anonymous.adminData?.code === 1001,
    `status=${anonymous.adminData?.status} code=${anonymous.adminData?.code}`,
  )

  // 图标端点是另一套语义（PROB-20 方案 1，见 worker/routes/icon.ts 的注释）：匿名请求私密
  // 对象**不返回 401**，而是回落到不含标题与域名的兜底图标，表现与「id 不存在」逐字节一致——
  // 那才是不泄露存在性的做法。所以判据是三方指纹比对，不是 HTTP 状态码。
  const indistinguishable = (probe, baseline, label, id) => {
    if (!probe?.sha256 || !baseline?.sha256) {
      return check(`${label}-matches-absent-id`, 'PROB-20c', false, 'fingerprint unavailable')
    }
    return check(
      `${label}-matches-absent-id`,
      'PROB-20c',
      probe.sha256 === baseline.sha256,
      `id=${id} identical=${probe.sha256 === baseline.sha256} bytes=${probe.bytes}/${baseline.bytes}`,
    )
  }

  // 授权路径必须拿到**不同于**兜底的内容。缺了这一条，「匿名拿到兜底」可能只是因为该对象
  // 本来就没有图标，上面那条比对就是空转断言。
  const authorizedDiffers = (authorized, fallback, label) => {
    if (!authorized?.sha256) {
      return skip(`${label}-authorized-differs`, 'PROB-20b', 'no icon access grant, or the request failed')
    }
    if (authorized.sha256 === fallback?.sha256) {
      return skip(
        `${label}-authorized-differs`,
        'PROB-20b',
        'authorized response equals the fallback: this object has no stored icon, so the anonymous ' +
        'comparison above cannot tell protection apart from absence',
      )
    }
    return check(`${label}-authorized-differs`, 'PROB-20b', true, `bytes=${authorized.bytes}`)
  }

  if (ids.bookmarkId == null) {
    skip('anonymous-private-bookmark-icon-matches-absent-id', 'PROB-20c',
      'no bookmark inside a private category on this instance')
  } else {
    indistinguishable(anonymous.privateBookmarkIcon, anonymous.absentBookmarkIcon,
      'anonymous-private-bookmark-icon', ids.bookmarkId)
    authorizedDiffers(anonymous.authorizedBookmarkIcon, anonymous.privateBookmarkIcon,
      'private-bookmark-icon')
  }

  if (ids.categoryId == null) {
    skip('anonymous-private-category-icon-matches-absent-id', 'PROB-20c',
      'no private category on this instance')
  } else {
    indistinguishable(anonymous.privateCategoryIcon, anonymous.absentCategoryIcon,
      'anonymous-private-category-icon', ids.categoryId)
    authorizedDiffers(anonymous.authorizedCategoryIcon, anonymous.privateCategoryIcon,
      'private-category-icon')
  }

  // 授权响应绝不能进共享缓存，否则下一个匿名访客可能命中它（PROB-20b 的缓存隔离）。
  for (const [label, probe] of [
    ['bookmark', anonymous.authorizedBookmarkIcon],
    ['category', anonymous.authorizedCategoryIcon],
  ]) {
    if (!probe?.cacheControl) continue
    check(
      `authorized-${label}-icon-not-shared-cacheable`,
      'PROB-20b',
      /private/.test(probe.cacheControl) && /no-store/.test(probe.cacheControl),
      probe.cacheControl,
    )
  }

  return anonymous
}

async function runModalChecks(session) {
  phase('PROB-13 U1–U4 真实弹窗操作（桌面 + 390x844）')
  const measured = {}, requests = new Map(), browserErrors = []
  let active = true, stage = 'navigation', viewportLabel = ''
  session.on('Network.requestWillBeSent', (event) => {
    if (!active) return
    const url = new URL(event.request.url)
    if (!['http:', 'https:'].includes(url.protocol)) return
    requests.set(event.requestId, {
      requestId: event.requestId, viewport: viewportLabel, stage,
      path: url.pathname, sameOrigin: url.origin === TARGET_ORIGIN, method: event.request.method,
    })
  })
  session.on('Network.responseReceived', (event) => {
    if (active && requests.has(event.requestId)) requests.get(event.requestId).status = event.response.status
  })
  session.on('Network.loadingFailed', (event) => {
    if (active && requests.has(event.requestId)) Object.assign(requests.get(event.requestId), { error: event.errorText, canceled: Boolean(event.canceled) })
  })
  session.on('Log.entryAdded', ({ entry }) => {
    if (active && entry.level === 'error') browserErrors.push({ source: entry.source, text: entry.text, viewport: viewportLabel })
  })
  const consoleStart = session.consoleErrors.length, exceptionStart = session.pageExceptions.length
  const click = async (kind) => {
    const point = await waitForModal(() => session.call(pageModalControl, kind), kind)
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none' })
    await sleep(120)
    const ready = await waitForModal(() => session.call(pageModalControl, kind), kind + ' hit target')
    await session.mouse(ready.x, ready.y)
  }
  const openBookmark = async () => {
    if (await session.call(pageModalControl, 'desktop-add')) await click('desktop-add')
    else { await click('more'); await click('add') }
    await waitForModal(async () => (await session.call(pageModalMetrics)).results.bookmarkModal?.visible, 'bookmark dialog')
  }
  try {
    for (const [label, viewport] of [
      ['desktop', { width: 1440, height: 900, mobile: false, scale: 1 }],
      ['mobile', { width: 390, height: 844, mobile: true, scale: 2 }],
    ]) {
      viewportLabel = label
      stage = 'navigation'
      const result = measured[label] = { results: {} }
      try {
        await session.setViewport(viewport)
        await session.navigate(TARGET_URL)
        await session.send('Page.bringToFront')
        stage = 'interaction'
        await waitForModal(() => session.call(function homeReady() { return Boolean(document.querySelector('[data-home-category-scope]')) }), 'home category')
        if (!await session.call(pageModalControl, 'category')) await click('actions')
        await click('category')
        await waitForModal(async () => (await session.call(pageModalMetrics)).results.categoryModal?.visible, 'category dialog')
        await sleep(250)
        result.results.categoryModal = (await session.call(pageModalMetrics)).results.categoryModal
        await click('category-cancel')
        await waitForModal(() => session.call(pageModalsClosed), 'category cancel')
        await openBookmark()
        await sleep(250)
        const metrics = await session.call(pageModalMetrics)
        Object.assign(result.results, { bookmarkModal: metrics.results.bookmarkModal, bookmarkActions: metrics.results.bookmarkActions })
        result.viewportWidth = metrics.viewportWidth
        result.actions = assessModalActions(result.results.bookmarkActions)
        if (label === 'mobile' && result.actions.passed) {
          result.negativeControls = []
          for (const fault of ['missing', 'empty', 'hidden', 'overflow', 'covered']) {
            const saved = await session.call(pageModalFault, fault)
            let rejected
            try { rejected = !assessModalActions((await session.call(pageModalMetrics)).results.bookmarkActions).passed }
            finally { await session.call(pageModalFault, 'restore', saved) }
            const restored = assessModalActions((await session.call(pageModalMetrics)).results.bookmarkActions).passed
            result.negativeControls.push({ fault, rejected, restored })
            check('modal-negative-control-' + fault, 'PROB-13 U1–U4', rejected && restored, 'rejected=' + rejected + ' restored=' + restored)
          }
        }
        await mkdir(SHOT_DIR, { recursive: true })
        await writeFile(path.join(SHOT_DIR, 'bookmark-modal-' + label + '.png'), Buffer.from(await session.screenshotBase64(), 'base64'))
        await click('cancel')
        result.cancelClosed = Boolean(await waitForModal(() => session.call(pageModalsClosed), 'cancel closes bookmark dialog'))
        await openBookmark()
        result.initialFocusInside = await session.call(() => Boolean(document.activeElement?.closest('[data-testid="bookmark-modal"]')))
        await click('field')
        let cancelFocused = false
        for (let tab = 0; tab < 50; tab += 1) {
          cancelFocused = await session.call(function cancelHasFocus() {
            return document.activeElement?.matches('[data-testid="bookmark-modal"] form > .modal-actions button.ghost-button') === true
          })
          if (cancelFocused) break
          for (const type of ['keyDown', 'keyUp']) await session.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
          await sleep(30)
        }
        if (!cancelFocused) throw new Error('Cancel action not reachable by real Tab')
        for (const type of ['keyDown', 'keyUp']) await session.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {}) })
        result.keyboardCancelClosed = Boolean(await waitForModal(() => session.call(pageModalsClosed), 'keyboard cancel'))
        await session.waitForNetworkIdle()
      } catch (error) {
        result.error = String(error?.message ?? error)
      } finally {
        result.cleanup = await closeModals(session)
      }
      check('modal-real-input-' + label, 'PROB-13 U1–U4', !result.error && result.cancelClosed === true && result.keyboardCancelClosed === true && result.cleanup.closed === true, result.error ?? 'real mouse open/cancel; click input then Tab/Enter cancel')
    }
  } finally {
    active = false
    await session.clearViewport()
  }
  const desktop = measured.desktop?.results?.bookmarkModal, mobile = measured.mobile?.results?.bookmarkModal
  check('bookmark-modal-renders-on-both-viewports', 'PROB-13 U1–U4', Boolean(desktop?.visible && mobile?.visible), 'required visible dialogs')
  check('bookmark-modal-radius-consistent', 'PROB-13 U1–U4', Boolean(desktop && mobile && desktop.borderRadius === mobile.borderRadius), 'desktop and mobile radius')
  check('bookmark-modal-stays-inside-viewport', 'PROB-13 U1–U4', desktop?.overflowsViewport === false && mobile?.overflowsViewport === false, 'both axes')
  const verdict = assessModalActions(measured.mobile?.results?.bookmarkActions)
  check('bookmark-modal-actions-single-row-on-mobile', 'PROB-13 U1–U4', verdict.passed, verdict.passed ? 'two visible, contained and hit-testable controls' : verdict.failures.join(', '))
  const traffic = [...requests.values()]
  const unexpected = traffic.filter((r) => (r.status >= 400) || (r.error && !r.canceled))
  const writes = traffic.filter((r) => r.sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(r.method))
  const consoleErrors = session.consoleErrors.slice(consoleStart), exceptions = session.pageExceptions.slice(exceptionStart)
  check('modal-flow-no-server-writes', 'PROB-13 U1–U4', writes.length === 0, 'writes=' + writes.length)
  check('modal-flow-browser-diagnostics', 'PROB-13 U1–U4', unexpected.length === 0 && browserErrors.length === 0 && consoleErrors.length === 0 && exceptions.length === 0, 'unexpected=' + unexpected.length + ' log=' + browserErrors.length + ' console=' + consoleErrors.length + ' exceptions=' + exceptions.length)
  measured.evidence = { requests: traffic, unexpected, writes, browserErrors, consoleErrors, exceptions }
  return measured
}

async function captureViewportScreenshots(session) {
  phase('PROB-17 三档视口截图')

  await mkdir(SHOT_DIR, { recursive: true })
  const saved = []

  for (const [label, viewport] of [
    ['mobile-430x932', { width: 430, height: 932, mobile: true, scale: 2 }],
    ['tablet-768x1024', { width: 768, height: 1024, mobile: true, scale: 2 }],
    ['desktop-1440x900', { width: 1440, height: 900, mobile: false, scale: 1 }],
  ]) {
    await session.setViewport(viewport)
    await session.navigate(TARGET_URL)
    await sleep(1300)
    const base64 = await session.screenshotBase64()
    if (!base64) continue
    const file = path.join(SHOT_DIR, `home-${label}.png`)
    await writeFile(file, Buffer.from(base64, 'base64'))
    saved.push(path.relative(process.cwd(), file))
  }
  await session.clearViewport()

  check('viewport-screenshots-captured', 'PROB-17', saved.length === 3, saved.join(', '))
  return saved
}

async function runExportCheck(session, token) {
  phase('PROB-14 真实导出下载（只读，内容仅驻留内存）')
  const source = await session.call(pageReadExportSource, TARGET_ORIGIN, token)
  const sample = pickExportSample(source)
  if (!sample) {
    const reason = 'No nonempty child category with excluded bookmarks; complex export remains unverified'
    skip('partial-export-real-download', 'PROB-14', reason)
    return { status: 'skip', reason, categories: source.categories.length, bookmarks: source.bookmarks.length }
  }

  const waitFor = async (read, description) => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
      const value = await read()
      if (value) return value
      await sleep(50)
    }
    throw new Error(`Timed out waiting for ${description}`)
  }
  const control = async (kind) => {
    // requestAnimationFrame is suspended for background/occluded pages.
    await session.send('Page.bringToFront')
    return session.call(pageExportControl, kind, sample)
  }
  const click = async (kind) => {
    const target = await waitFor(async () => {
      const state = await control(kind)
      return state && !state.disabled ? state : null
    }, `export control ${kind}`)
    await session.mouse(target.x, target.y)
  }
  const exports = []
  const download = async (id, selectedIds, includeSettings) => {
    const settings = await control('settings')
    if (!settings) throw new Error('Export settings toggle is missing')
    if (settings.checked !== includeSettings) await click('settings')
    await click('export')
    const captured = await waitFor(
      () => session.call(pageReadExportDownload, exports.length),
      'the application download Blob',
    )
    const result = verifyExportDownload(source, captured, selectedIds, includeSettings)
    exports.push({ id, ...result })
    check(id, 'PROB-14', result.passed, JSON.stringify(result))
  }

  let backgroundTarget = null
  let foregroundRecovered = false
  let backgroundState = null
  let captureInstalled = false
  try {
    await session.setViewport({ width: 1440, height: 900, mobile: false, scale: 1 })
    await session.navigate(`${TARGET_ORIGIN}/admin`)
    backgroundTarget = (await session.send('Target.createTarget', { url: 'about:blank' })).targetId
    await session.send('Target.activateTarget', { targetId: backgroundTarget })
    backgroundState = await session.call(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }))
    await click('backup')
    foregroundRecovered = await session.call(() => document.visibilityState === 'visible' && document.hasFocus())
    check('export-control-restores-test-target', 'PROB-13', foregroundRecovered && backgroundState.focused === false, 'test target regains focus before synchronous layout measurement')
    await session.send('Target.closeTarget', { targetId: backgroundTarget }); backgroundTarget = null
    // Fail closed if capture misses an application download: never save production data to disk.
    await session.send('Page.setDownloadBehavior', { behavior: 'deny' })
    captureInstalled = await session.call(pageInstallExportCapture)
    await click('clear')
    const empty = await control('export')
    const emptyRejected = check('partial-export-rejects-empty-selection', 'PROB-14', empty?.disabled === true)

    await click('child')
    await download('partial-export-child-with-parent-no-settings', [sample.childId], false)
    await download('partial-export-child-with-settings', [sample.childId], true)
    await click('root')
    await download('partial-export-root-includes-children', sample.rootCategoryIds, true)
    return {
      status: emptyRejected && exports.every((result) => result.passed) ? 'pass' : 'fail',
      foregroundRecovered,
      backgroundState,
      sourceCategories: source.categories.length,
      sourceBookmarks: source.bookmarks.length,
      exports,
    }
  } finally {
    if (backgroundTarget) await session.send('Target.closeTarget', { targetId: backgroundTarget })
    if (captureInstalled && !await session.call(pageRestoreExportCapture)) {
      throw new Error('Export capture could not be restored')
    }
    await session.send('Page.setDownloadBehavior', { behavior: 'default' })
    await session.clearViewport()
  }
}

async function runLogoutRevocationCheck(session, token) {
  phase('PROB-19v 登出撤销（本次会话，最后执行）')

  const logout = await session.call(pageLogoutAndProbe, TARGET_ORIGIN, token)
  check(
    'logout-accepted',
    'PROB-19v',
    logout.code === 0,
    `status=${logout.status} code=${logout.code} store=${logout.store ?? 'n/a'}`,
  )

  // 撤销名单写入 KV 后要在别的 isolate 生效，存在传播窗口。轮询到生效为止并记录耗时，
  // 这是「≤15 秒」这条要求唯一能观察到的形式。
  const started = Date.now()
  let elapsed = null
  let last = null
  while (Date.now() - started < REVOCATION_WINDOW_MS) {
    last = await session.call(pageProbeRevoked, TARGET_ORIGIN, token)
    if (last.status === 401 || last.code === 1002) {
      elapsed = Date.now() - started
      break
    }
    await sleep(1000)
  }

  check(
    'revoked-token-rejected-within-window',
    'PROB-19v',
    elapsed != null,
    elapsed != null
      ? `took ${elapsed} ms (window ${REVOCATION_WINDOW_MS} ms)`
      : `still accepted after ${REVOCATION_WINDOW_MS} ms; last status=${last?.status} code=${last?.code}`,
  )

  return { logout, revocationMs: elapsed }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString()
  const session = new CdpSession({
    chromeExe: CHROME_EXE,
    debugPort: DEBUG_PORT,
    userDataDir: PROFILE_DIR,
    headless: HEADLESS,
    noSandbox: NO_SANDBOX,
    allowExisting: process.env.ACCEPT_ALLOW_EXISTING_CHROME === '1',
  })

  let cleanupOutcome = null
  const report = { startedAt, target: TARGET_URL, tier: 0, writeOperations: 'none', scope: SCOPE, excluded: SCOPE === 'modals' ? ['first-visit', 'offline', 'anonymous', 'export', 'viewport-screenshots'] : [] }

  try {
    await session.start()
    await session.attach()
    await session.send('Page.bringToFront')
    report.browserMode = session.startedByTest ? 'isolated-temp-browser' : 'existing-browser-on-port'
    report.profile = session.startedByTest ? PROFILE_DIR : '(not started by this run)'
    report.ownership = { browserStartedByTest: session.startedByTest, pid: session.chromeProcess?.pid ?? null, targetId: session.targetId, port: DEBUG_PORT }
    report.headed = !HEADLESS

    phase('部署版本')
    await session.navigate(TARGET_URL)
    await sleep(1000)

    const bundle = await session.call(pageDeployedBundle)
    report.deployedBundle = bundle.entry
    console.log(`  bundle: ${bundle.entry ?? '(not found)'}`)
    check(
      'entry-bundle-resolvable',
      'PROB-13',
      Boolean(bundle.entry),
      // 拿不到 entry bundle 说明测的可能不是本项目的页面，后面的结论都不可信
      bundle.entry ?? `scripts=${bundle.scripts.join(', ')}`,
    )

    if (SCOPE === 'all') {
      report.firstVisit = await runFirstVisitChecks(session)
      await runOfflineCheck(session)
    }

    phase('登录（仅用于读取管理数据）')
    const login = await session.call(pageLogin, TARGET_ORIGIN, credentials.username, credentials.password)
    if (!check('admin-login-succeeds', 'PROB-13', login.ok === true, `code=${login.code ?? 0}`)) {
      throw new Error('login failed; cannot run authenticated read-only probes')
    }

    if (SCOPE === 'all') {
      const ids = await session.call(pageFindPrivateIds, TARGET_ORIGIN, login.token)
      report.instance = {
        categories: ids.categoryCount,
        bookmarks: ids.bookmarkCount,
        hasPrivateCategory: ids.categoryId != null,
      }

      report.anonymous = await runAnonymousProbes(session, ids, login.token)
      report.export = await runExportCheck(session, login.token)

    }
    report.modals = await runModalChecks(session)
    if (SCOPE === 'all') report.screenshots = await captureViewportScreenshots(session)

    // 登出必须最后做：它作废本次的 token，后续读取都会 401
    await session.navigate(TARGET_URL)
    await sleep(1200)
    const relogin = await session.call(pageLogin, TARGET_ORIGIN, credentials.username, credentials.password)
    report.revocation = await runLogoutRevocationCheck(session, relogin.token)

    report.consoleErrors = session.consoleErrors
    report.pageExceptions = session.pageExceptions
    report.failedRequests = session.failedRequests

    check(
      'no-page-exceptions',
      'PROB-13',
      session.pageExceptions.length === 0,
      `exceptions=${session.pageExceptions.length}`,
    )
    check(
      'no-console-errors',
      'PROB-13',
      session.consoleErrors.length === 0,
      `errors=${session.consoleErrors.length}`,
    )
  } catch (error) {
    report.fatal = redactCredentials(String(error?.message ?? error), credentials)
    check('acceptance-run-completed', 'PROB-13', false, report.fatal)
  } finally {
    cleanupOutcome = await session.cleanup()
  }

  report.checks = checks
  report.passed = checks.filter((item) => item.status === 'pass').length
  report.failed = checks.filter((item) => item.status === 'fail').length
  report.skipped = checks.filter((item) => item.status === 'skip').length
  report.cleanup = cleanupOutcome

  phase('结果')
  console.log(`  passed ${report.passed} / failed ${report.failed} / skipped ${report.skipped}`)
  console.log(
    `  cleanup: target=${cleanupOutcome?.targetClosed} browser=${cleanupOutcome?.browserClosed} ` +
    `profile=${cleanupOutcome?.profileRemoved} errors=${cleanupOutcome?.errors.length ?? 0} ` +
    `warnings=${cleanupOutcome?.warnings?.length ?? 0}`,
  )
  for (const warning of cleanupOutcome?.warnings ?? []) console.log(`  cleanup warning: ${warning}`)

  const reportFile = path.join(SHOT_DIR, 'acceptance-report.json')
  await mkdir(SHOT_DIR, { recursive: true })
  await writeFile(reportFile, redactCredentials(JSON.stringify(report, null, 2), credentials))
  console.log(`  report: ${path.relative(process.cwd(), reportFile)}`)

  // 清理失败时不能报告完整通过——清理属于测试结果。
  const cleanupFailed = (cleanupOutcome?.errors.length ?? 0) > 0 || (session.startedByTest && cleanupOutcome?.profileRemoved !== true)
  if (cleanupFailed) console.error('  cleanup failed:', cleanupOutcome.errors.join('; '))

  if (!ALLOW_FAILURES && (report.failed > 0 || cleanupFailed)) process.exitCode = 1
}

main().catch(async (error) => {
  console.error(redactCredentials(String(error?.stack ?? error), credentials))
  process.exit(1)
})
