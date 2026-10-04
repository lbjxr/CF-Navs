// Local-only Q04 page performance harness. Invoked by smoke-local with a disposable Worker/D1.
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'

const base = process.env.BASE_URL
if (!base || new URL(base).hostname !== '127.0.0.1' || !process.env.ADMIN_PASS) throw new Error('Use npm run regression:icons:perf')
const id = randomBytes(4).toString('hex')
const profile = path.join(os.tmpdir(), 'cf-navs-chrome-profile-category-perf-' + id)
const output = path.join(os.tmpdir(), 'cf-navs-category-icon-perf-' + id + '.json')
const chromeExe = process.env.CHROME_EXE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync)
if (!chromeExe) throw new Error('Chrome executable unavailable')
const probe = net.createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const debugPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const cdp = new CdpSession({ chromeExe, debugPort, userDataDir: profile, headless: true })
const report = { checks: [], rounds: [], ownership: { profile, debugPort }, errors: [] }
let token = ''
const categoryCopyRequests = []
const bookmarkCopyRequests = []
const check = (name, value, detail = null) => {
  report.checks.push({ name, passed: Boolean(value), ...(detail ? { detail } : {}) })
  assert.ok(value, name)
  console.log('PASS ' + name)
}
const api = async (route, body, method = 'POST') => {
  const response = await fetch(base + '/api' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const envelope = await response.json()
  if (!response.ok || envelope.code !== 0) throw new Error(`Fixture API failed: ${route} (${response.status})`)
  return envelope.data
}
async function waitFor(fn, label, timeout = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await cdp.call(fn).catch(() => false)) return Date.now() - started
    await sleep(80)
  }
  throw new Error('Timed out: ' + label)
}
async function clearLocalCopies() {
  await cdp.call(async () => {
    const request = indexedDB.deleteDatabase('cf-navs-object-icons-v1')
    await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => resolve() })
  })
}
async function click(selector) {
  const point = await cdp.call(query => {
    const element = document.querySelector(query)
    if (!element) return null
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, selector)
  if (!point) throw new Error('Missing clickable target: ' + selector)
  await cdp.mouse(point.x, point.y)
}
async function measureRound(label, prepare, ready) {
  const beforeCategory = categoryCopyRequests.length
  const beforeBookmark = bookmarkCopyRequests.length
  const started = Date.now()
  await prepare()
  await waitFor(ready, label)
  await cdp.waitForNetworkIdle(300, 10000)
  const result = {
    label,
    readyMs: Date.now() - started,
    categoryCopyRequests: categoryCopyRequests.length - beforeCategory,
    bookmarkCopyRequests: bookmarkCopyRequests.length - beforeBookmark,
    failedRequests: cdp.failedRequests.length,
  }
  return result
}

try {
  const login = await api('/login', { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS })
  token = login.token
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="teal"/></svg>').toString('base64')
  const root = await api('/categories', { title: 'Perf root category', icon })
  const categories = [root]
  for (let index = 1; index < 30; index += 1) categories.push(await api('/categories', { parent_id: root.id, title: `Perf child category ${index}`, icon }))
  await api('/settings', { navigation: { position: 'top', always_expanded: false } }, 'PUT')
  for (let index = 0; index < 100; index += 1) {
    const category = categories[index % categories.length]
    await api('/bookmarks', { category_id: category.id, title: `Perf bookmark ${index + 1}`, url: `https://example.com/perf-${index + 1}`, icon, icon_source: 'custom', is_private: false })
  }
  await cdp.start()
  report.ownership.pid = cdp.chromeProcess.pid
  report.ownership.browserStartedByTest = cdp.startedByTest
  await cdp.attach()
  report.ownership.targetId = cdp.targetId
  report.ownership.sessionId = cdp.sessionId
  cdp.on('Network.requestWillBeSent', event => {
    try {
      const url = new URL(event.request.url)
      if (url.pathname === '/api/icon-local-copy') {
        let payload = null
        try { payload = JSON.parse(event.request.postData ?? 'null') } catch { /* Ignore malformed telemetry. */ }
        if (payload?.object_type === 'category') categoryCopyRequests.push(event.requestId)
        if (payload?.object_type === 'bookmark') bookmarkCopyRequests.push(event.requestId)
      }
    } catch { /* Ignore non-URL CDP events. */ }
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.navigate(base)
  await cdp.call(async (username, password) => {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
    const payload = await response.json()
    if (payload.code !== 0) throw new Error('Browser fixture login failed')
    localStorage.setItem('cf-navs.auth', JSON.stringify(payload.data))
  }, process.env.ADMIN_USER, process.env.ADMIN_PASS)
  await cdp.navigate(base + '/admin')
  await waitFor(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'admin settings tab')
  await cdp.call(() => document.querySelector('[data-testid="admin-tab-settings"]')?.click())
  await waitFor(() => Boolean(document.querySelector('.settings-submenu')), 'settings submenu')
  await cdp.call(() => [...document.querySelectorAll('.settings-submenu button')].find(button => button.textContent.includes('设备缓存'))?.click())
  await waitFor(() => Boolean(document.querySelector('.device-cache input')), 'device cache controls')
  await cdp.call(() => document.querySelector('.device-cache input')?.click())
  await waitFor(() => document.querySelector('.device-status')?.textContent?.startsWith('已启用'), 'trusted device cache')
  await cdp.navigate(base)
  const homeReady = () => {
    const images = [...document.querySelectorAll('[data-home-category-scope] [data-category-icon] img')]
    return images.length >= 30 && images.filter(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:')).length >= 30
  }
  const prepareHome = async () => {
    await cdp.navigate(base)
    await cdp.call(async () => {
      for (const element of document.querySelectorAll('[data-home-category-scope] [data-category-icon]')) {
        element.scrollIntoView({ block: 'center', behavior: 'instant' })
        await new Promise(resolve => setTimeout(resolve, 35))
      }
    })
  }
  const sidebarReady = () => {
    const images = [...document.querySelectorAll('[data-testid="top-navigation"] [role="menu"] [data-category-icon] img')]
    return images.length >= 29 && images.every(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }
  const searchReady = () => {
    const groups = [...document.querySelectorAll('.search-category-group')]
    const images = [...document.querySelectorAll('.search-category-group [data-category-icon] img')]
    return groups.length >= 1 && images.length >= 1 && images.every(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }
  const adminReady = () => document.querySelectorAll('.admin-compact-card [data-category-icon] img').length >= 30 && [...document.querySelectorAll('.admin-compact-card [data-category-icon] img')].filter(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:')).length >= 30
  const prepareSidebar = async () => {
    await cdp.navigate(base)
    await waitFor(() => Boolean(document.querySelector('[data-testid="top-navigation"]')), 'top navigation')
    await click('.top-submenu-toggle')
  }
  const prepareSearch = async () => {
    await cdp.navigate(base)
    await click('.search-input')
    await cdp.send('Input.insertText', { text: 'Perf root category' })
    await waitFor(() => document.querySelectorAll('.search-category-group').length >= 1, 'search result groups')
    await cdp.call(async () => {
      for (const element of document.querySelectorAll('.search-category-group [data-category-icon]')) {
        element.scrollIntoView({ block: 'center', behavior: 'instant' })
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    })
  }
  const prepareAdmin = async () => {
    await cdp.navigate(base + '/admin')
    await waitFor(() => Boolean(document.querySelector('[data-testid="admin-tab-categories"]')), 'admin navigation')
    await click('[data-testid="admin-tab-categories"]')
    await waitFor(() => Boolean(document.querySelector('.admin-tree-toggle')), 'admin category tree')
    await click('.admin-tree-toggle')
  }
  for (let round = 1; round <= 5; round += 1) {
    await clearLocalCopies()
    const coldHome = await measureRound(`round-${round} cold home categories`, prepareHome, homeReady)
    const hotHome = await measureRound(`round-${round} hot home categories`, prepareHome, homeReady)
    const hotSidebar = await measureRound(`round-${round} hot Sidebar submenu`, prepareSidebar, sidebarReady)
    const hotSearch = await measureRound(`round-${round} hot search groups`, prepareSearch, searchReady)
    await cdp.call(() => { const input = document.querySelector('.search-input'); if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })) } })
    const hotAdmin = await measureRound(`round-${round} hot admin categories`, prepareAdmin, adminReady)
    report.rounds.push({ round, coldHome, hotHome, hotSidebar, hotSearch, hotAdmin })
  }
  const all = report.rounds.flatMap(round => [round.coldHome, round.hotHome, round.hotSidebar, round.hotSearch, round.hotAdmin])
  check('five cold/hot rounds cover 100 bookmarks and 30 categories', report.rounds.length === 5 && all.every(item => item.readyMs >= 0))
  const unclassifiedFailures = cdp.failedRequests.filter(item => !(item.canceled && item.errorText === 'net::ERR_ABORTED'))
  check('category paths produce no unclassified failed requests', unclassifiedFailures.length === 0, { failedRequests: unclassifiedFailures })
  check('cold home materializes category copies and hot home reuses them', report.rounds.every(round => round.coldHome.categoryCopyRequests >= 30 && round.hotHome.categoryCopyRequests === 0))
  check('hot Sidebar, search and admin paths reuse trusted category copies', report.rounds.every(round => round.hotSidebar.categoryCopyRequests === 0 && round.hotSearch.categoryCopyRequests === 0 && round.hotAdmin.categoryCopyRequests === 0))
  report.summary = {
    coldHomeReadyMs: report.rounds.map(round => round.coldHome.readyMs),
    hotHomeReadyMs: report.rounds.map(round => round.hotHome.readyMs),
    sidebarReadyMs: report.rounds.map(round => round.hotSidebar.readyMs),
    searchReadyMs: report.rounds.map(round => round.hotSearch.readyMs),
    adminReadyMs: report.rounds.map(round => round.hotAdmin.readyMs),
  }
} catch (error) {
  report.errors.push(String(error?.stack ?? error))
  if (cdp.ws) report.diagnostics = await cdp.call(() => ({
    path: location.pathname,
    scopeCount: document.querySelectorAll('[data-home-category-scope]').length,
    categoryIconCount: document.querySelectorAll('[data-home-category-scope] [data-category-icon]').length,
    imageCount: document.querySelectorAll('[data-home-category-scope] [data-category-icon] img').length,
    loadedBlobCount: [...document.querySelectorAll('[data-home-category-scope] [data-category-icon] img')].filter(image => image.complete && image.naturalWidth > 0 && image.src.startsWith('blob:')).length,
    imageSources: [...document.querySelectorAll('[data-home-category-scope] [data-category-icon] img')].slice(0, 5).map(image => ({ src: image.src, complete: image.complete, naturalWidth: image.naturalWidth })),
    bodyText: document.body.innerText.slice(0, 500),
    searchGroupCount: document.querySelectorAll('.search-category-group').length,
    searchIconCount: document.querySelectorAll('.search-category-group [data-category-icon]').length,
    searchGroupHtml: document.querySelector('.search-category-group')?.outerHTML.slice(0, 2000) ?? null,
  })).catch(diagnosticError => ({ error: String(diagnosticError?.message ?? diagnosticError) }))
  process.exitCode = 1
} finally {
  if (cdp.ws) await cdp.call(async () => {
    const session = JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')
    if (session?.token) await fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + session.token } })
    localStorage.removeItem('cf-navs.auth')
  }).catch(error => report.errors.push(String(error?.message ?? error)))
  if (token) await api('/logout').catch(error => report.errors.push(String(error?.message ?? error)))
  report.evidence = { consoleErrors: cdp.consoleErrors, pageExceptions: cdp.pageExceptions, failedRequests: cdp.failedRequests.filter(item => !(item.canceled && item.errorText === 'net::ERR_ABORTED')), expectedCanceledRequests: cdp.failedRequests.filter(item => item.canceled && item.errorText === 'net::ERR_ABORTED').length, unexpectedHttp: cdp.responses.filter(item => item.status >= 400) }
  report.cleanup = await cdp.cleanup()
  if (report.cleanup.errors.length || report.cleanup.warnings.length || !report.cleanup.profileRemoved || report.evidence.consoleErrors.length || report.evidence.pageExceptions.length || report.evidence.failedRequests.length || report.evidence.unexpectedHttp.length) process.exitCode = 1
  await writeFile(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.checks.filter(item => item.passed).length, total: report.checks.length, summary: report.summary, errors: report.errors, evidence: report.evidence, cleanup: report.cleanup, output }, null, 2))
}
