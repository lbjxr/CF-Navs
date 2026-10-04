// Invoked by smoke-local.mjs --icons against its disposable Worker/D1 only.
import assert from 'node:assert/strict'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'

const base = process.env.BASE_URL
if (!base || new URL(base).hostname !== '127.0.0.1' || !process.env.ADMIN_PASS) throw new Error('Use npm run regression:icons:local; only a disposable local target is allowed')
const id = randomUUID().slice(0, 8)
const profile = path.join(os.tmpdir(), 'cf-navs-chrome-profile-ui-' + id)
const output = path.join(os.tmpdir(), 'cf-navs-icon-ui-' + id + '.json')
if (existsSync(profile) || path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir())) throw new Error('Invalid owned profile path')
const chromeExe = process.env.CHROME_EXE || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync)
if (!chromeExe) throw new Error('Chrome executable unavailable')
const probe = net.createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const debugPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const cdp = new CdpSession({ chromeExe, debugPort, userDataDir: profile, headless: true })
const report = { checks: [], ownership: { profile, debugPort }, errors: [], cleanup: null }
const compatMode = process.env.ICON_COMPAT_MODE === '1'
let apiToken = ''
let legacyTab = null
let firstDisplayCopyCount = null
let firstDisplayObjectIconCount = null
let firstDisplayRefreshCount = null
let firstDisplayCopyTraffic = null
const iconCopyRequests = []
const iconCopyResponses = []
const inspectedIconCopyResponses = new Map()
const objectIconRequests = []
const iconRefreshRequests = []
const bookmarkUpdateRequests = []
const aggregateResponses = []
const validatedProtocolConflictResponseIds = new Set()
const redact = value => String(value).replaceAll(process.env.ADMIN_PASS, '[redacted]').replaceAll(apiToken || '\u0000', '[redacted]').replace(/([?&](?:key|token)=)[^\s&"']+/g, '$1[redacted]')
const check = (name, value) => { report.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); console.log('PASS ' + name) }
async function api(route, body, method = 'POST') {
  const response = await fetch(base + '/api' + route, { method, headers: { 'content-type': 'application/json', ...(apiToken ? { authorization: 'Bearer ' + apiToken } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const envelope = await response.json()
  if (!response.ok || envelope.code !== 0) throw new Error('Fixture API failed: ' + route + ' (' + response.status + ')')
  return envelope.data
}
async function until(fn, message, timeout = 20000, ...args) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await cdp.call(fn, ...args).catch(() => false)) return; await sleep(100) }
  throw new Error('Timed out: ' + message)
}
async function readFixtureImage(title) {
  return cdp.call(function (label) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === label)
    const image = card?.querySelector('img')
    return { found: Boolean(card), src: image?.src ?? '', loaded: Boolean(image?.complete && image?.naturalWidth > 0) }
  }, title)
}
async function scrollFixtureIntoView(title) {
  return cdp.call(function (label) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === label)
    if (!card) return false
    card.scrollIntoView({ block: 'center', behavior: 'instant' })
    return true
  }, title)
}
async function inspectAggregateResponses(responses, label, expectedBody) {
  return Promise.all(responses.map(async response => {
    let body
    try {
      body = await cdp.send('Network.getResponseBody', { requestId: response.requestId })
    } catch (error) {
      throw new Error('Unable to inspect ' + response.path + ' response body: ' + String(error?.message ?? error))
    }
    const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body
    return text.includes(expectedBody)
  }))
}
async function click(selector, text = null) {
  const bounds = await cdp.call(function (query, label) {
    const element = [...document.querySelectorAll(query)].find(item => !label || item.textContent.includes(label))
    if (!element) return null
    element.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = element.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    return { x, y, hitIsTarget: hit === element || Boolean(hit && element.contains(hit)), hitTag: hit?.tagName ?? null, hitText: hit?.textContent?.trim().slice(0, 80) ?? '' }
  }, selector, text)
  assert.ok(bounds, 'Visible target ' + selector)
  assert.ok(bounds.hitIsTarget, `Click intercepted for ${selector}: ${bounds.hitTag} ${bounds.hitText}`)
  await cdp.mouse(bounds.x, bounds.y)
}
async function replaceText(selector, text) {
  await click(selector)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 })
  if (text) await cdp.send('Input.insertText', { text })
  else {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 })
  }
}
async function openSecondaryTab(url) {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })
  const tab = { targetId: created.targetId, sessionId: attached.sessionId }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = cdp.nextId++
    const timer = setTimeout(() => { cdp.pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 30000)
    cdp.pending.set(id, { resolve, reject, timer })
    cdp.ws.send(JSON.stringify({ id, method, params, sessionId: tab.sessionId }))
  })
  tab.send = send
  tab.evaluate = async (fn, ...args) => {
    const expression = `(${fn.toString()})(${args.map(arg => JSON.stringify(arg)).join(', ')})`
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'secondary page evaluation failed')
    return response.result?.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await tab.evaluate(() => ({ href: location.href, readyState: document.readyState })).catch(() => null)
    if (state?.href.startsWith(new URL(url).origin) && state.readyState === 'complete') return tab
    await sleep(100)
  }
  throw new Error('Secondary tab did not finish navigating')
}
async function inspectIconCopyResponse(response) {
  if (!inspectedIconCopyResponses.has(response.requestId)) {
    inspectedIconCopyResponses.set(response.requestId, (async () => {
      const request = iconCopyRequests.find(item => item.requestId === response.requestId) ?? null
      try {
        const body = await cdp.send('Network.getResponseBody', { requestId: response.requestId })
        const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body
        const payload = JSON.parse(text)?.data
        const descriptor = payload?.descriptor
        const summary = { protocol: payload?.protocol ?? null, persistence: payload?.persistence ?? null,
          hasImage: Object.prototype.hasOwnProperty.call(payload ?? {}, 'image'),
          image: payload?.image && typeof payload.image === 'object' ? { mime: payload.image.mime ?? null,
            byteLength: payload.image.byte_length ?? null, base64Length: typeof payload.image.base64 === 'string' ? payload.image.base64.length : null } : null,
          descriptor: descriptor ? { object_type: descriptor.object_type, object_id: descriptor.object_id,
            dataset_epoch: descriptor.dataset_epoch, write_epoch: descriptor.write_epoch,
            content_revision: descriptor.content_revision, state: descriptor.state } : null }
        if (response.status === 409) return { status: response.status, request, conflict: { ...summary, reason: payload?.reason ?? null } }
        return { status: response.status, request, result: summary }
      } catch { return { status: response.status, request, ...(response.status === 409
        ? { conflict: { protocol: null, reason: 'unreadable-response', hasImage: true, descriptor: null } }
        : { result: null }) }
      }
    })())
  }
  return inspectedIconCopyResponses.get(response.requestId)
}
async function readIconCopyTraffic(requestStart = 0, responseStart = 0) {
  const requests = iconCopyRequests.slice(requestStart)
  return Promise.all(iconCopyResponses.slice(responseStart).map(async response => {
    const detail = await inspectIconCopyResponse(response)
    return { ...detail, request: requests.find(item => item.requestId === response.requestId) ?? detail.request }
  }))
}
try {
  const login = await api('/login', { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS })
  apiToken = login.token
  const category = await api('/categories', { title: 'Local icon fixture', icon: '📁' })
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>').toString('base64')
  let fixtureTitle = 'Local trusted icon'
  const bookmark = await api('/bookmarks', { category_id: category.id, title: fixtureTitle, url: 'https://example.com', icon, icon_source: 'custom', is_private: false })
  await api(`/public/bookmarks/${bookmark.id}/click`)
  await cdp.start(); report.ownership.pid = cdp.chromeProcess.pid; report.ownership.browserStartedByTest = cdp.startedByTest
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  await cdp.attach(); report.ownership.targetId = cdp.targetId
  report.ownership.sessionId = cdp.sessionId
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  cdp.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url)
    if (url.pathname === '/api/icon-local-copy') {
      let payload = null
      try { payload = JSON.parse(event.request.postData ?? 'null') } catch { /* Retain only recognized descriptor fields. */ }
      iconCopyRequests.push({ method: event.request.method, path: url.pathname, requestId: event.requestId,
        descriptor: payload ? { object_id: payload.object_id, dataset_epoch: payload.dataset_epoch, expected_write_epoch: payload.expected_write_epoch,
          expected_content_revision: payload.expected_content_revision } : null })
    }
    if (url.pathname.startsWith('/api/icon/')) objectIconRequests.push({ method: event.request.method, path: url.pathname })
    if (/^\/api\/bookmarks\/\d+\/icon-cache\/refresh$/.test(url.pathname)) iconRefreshRequests.push({ method: event.request.method, path: url.pathname })
    if (url.pathname === '/api/bookmarks/' + bookmark.id) bookmarkUpdateRequests.push({ method: event.request.method, path: url.pathname })
  })
  cdp.on('Network.responseReceived', event => {
    const url = new URL(event.response.url)
    if (url.pathname === '/api/icon-local-copy') iconCopyResponses.push({ requestId: event.requestId, status: event.response.status })
    if (url.pathname === '/api/public/data' || url.pathname === '/api/admin/data') aggregateResponses.push({ requestId: event.requestId, path: url.pathname })
  })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.navigate(base)
  await cdp.call(async function (username, password) {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
    const payload = await response.json()
    if (payload.code !== 0) throw new Error('Browser fixture login failed')
    localStorage.setItem('cf-navs.auth', JSON.stringify(payload.data))
  }, process.env.ADMIN_USER, process.env.ADMIN_PASS)
  await cdp.navigate(base + '/admin')
  await until(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'admin navigation')
  if (compatMode) {
    const legacyKey = 'cf-navs.bookmark-icon.compat-probe'
    const preservedKey = 'cf-navs.compat-unrelated-probe'
    const cacheUrl = 'https://cf-navs.local/bookmark-icon/compat-probe'
    await cdp.call(async function (legacyStorageKey, preservedStorageKey, preservedUrl) {
      localStorage.setItem(legacyStorageKey, 'data:image/svg+xml;base64,PHN2Zy8+')
      localStorage.setItem(preservedStorageKey, 'keep')
      localStorage.setItem('cf-navs.icon-device-v1', JSON.stringify({ schema: 1, trusted: true,
        receipt: { cache_scope: 'a'.repeat(64), checked_at: Date.now(), expires_at: Date.now() + 60000 },
        dataset: 'b'.repeat(32), protocol: 1, observedAt: Date.now(), cleanupPending: false }))
      const oldCache = await caches.open('cf-navs-bookmark-icons-v1')
      await oldCache.put(new Request('https://cf-navs.local/bookmark-icon/compat-old'), new Response('legacy'))
      const currentCache = await caches.open('cf-navs-bookmark-icons-v2')
      await currentCache.put(new Request(preservedUrl), new Response('current-v2', { headers: { 'content-type': 'image/svg+xml' } }))
      const request = indexedDB.open('cf-navs-object-icons-v1', 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('control', { keyPath: 'key' })
        const entries = db.createObjectStore('entries', { keyPath: 'key' })
        entries.createIndex('last_used', 'last_used')
        db.createObjectStore('bodies')
      }
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      try {
        const tx = db.transaction(['control', 'entries', 'bodies'], 'readwrite')
        tx.objectStore('control').put({ key: 'active', schema: 1, enabled: true, scope: 'fixture-scope', generation: 'fixture-generation', bodyBytes: 1, entries: 1, indexBytes: 4096 })
        tx.objectStore('entries').put({ key: 'bookmark:999', generation: 'fixture-generation', descriptor: {}, mime: 'image/png', byte_length: 1, saved_at: Date.now(), last_used: Date.now(), metadata_bytes: 100 })
        tx.objectStore('bodies').put(new Blob(['x'], { type: 'image/png' }), 'bookmark:999')
        await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
      } finally { db.close() }
    }, legacyKey, preservedKey, cacheUrl)
    await cdp.send('Page.reload')
    await until(() => location.pathname === '/admin' && document.readyState === 'complete' && Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'compatibility build reload')
    await click('[data-testid="admin-tab-settings"]')
    await until(() => Boolean(document.querySelector('.settings-submenu')), 'compatibility settings panel')
    await click('.settings-submenu button', '设备缓存')
    await until(() => Boolean(document.querySelector('.settings-submenu')), 'compatibility device settings view')
    const readCompatibilityState = async function (legacyStorageKey, preservedStorageKey, preservedUrl) {
      const names = await caches.keys()
      const externalCache = await caches.open('cf-navs-bookmark-icons-v2')
      const preserved = await externalCache.match(new Request(preservedUrl))
      const request = indexedDB.open('cf-navs-object-icons-v1')
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      try {
        const tx = db.transaction(['entries', 'bodies'], 'readonly')
        const count = store => new Promise((resolve, reject) => { const item = tx.objectStore(store).count(); item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error) })
        const [entries, bodies] = await Promise.all([count('entries'), count('bodies')])
        const device = JSON.parse(localStorage.getItem('cf-navs.icon-device-v1') || 'null')
        return { legacyStorageRemoved: localStorage.getItem(legacyStorageKey) === null, unrelatedPreserved: localStorage.getItem(preservedStorageKey) === 'keep',
          legacyCacheRemoved: !names.includes('cf-navs-bookmark-icons-v1'), externalCachePreserved: await preserved?.text() === 'current-v2',
          trustedDisabled: device?.trusted === false && device.receipt === null, entries, bodies, panelHidden: !document.querySelector('.device-cache') }
      } finally { db.close() }
    }
    let compatibilityState = await cdp.call(readCompatibilityState, legacyKey, preservedKey, cacheUrl)
    for (let attempt = 0; attempt < 200 && !(compatibilityState.legacyStorageRemoved && compatibilityState.legacyCacheRemoved && compatibilityState.trustedDisabled && compatibilityState.entries === 0 && compatibilityState.bodies === 0); attempt += 1) {
      await sleep(100)
      compatibilityState = await cdp.call(readCompatibilityState, legacyKey, preservedKey, cacheUrl)
    }
    check('compatibility startup completes migration and namespace cleanup', compatibilityState.legacyStorageRemoved && compatibilityState.legacyCacheRemoved && compatibilityState.trustedDisabled && compatibilityState.entries === 0 && compatibilityState.bodies === 0)
    check('compatibility build disables trust and clears the new IndexedDB namespace', compatibilityState.trustedDisabled && compatibilityState.entries === 0 && compatibilityState.bodies === 0 && compatibilityState.panelHidden)
    check('compatibility migration removes only legacy namespaces and preserves v2/unrelated state', compatibilityState.legacyStorageRemoved && compatibilityState.legacyCacheRemoved && compatibilityState.unrelatedPreserved && compatibilityState.externalCachePreserved)
    await cdp.call(async function (preservedStorageKey, preservedUrl) {
      localStorage.removeItem(preservedStorageKey)
      const cache = await caches.open('cf-navs-bookmark-icons-v2')
      await cache.delete(new Request(preservedUrl))
    }, preservedKey, cacheUrl)
    await cdp.navigate(base)
    await scrollFixtureIntoView(fixtureTitle)
    await until(function (title) {
      const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === title)
      const image = card?.querySelector('img')
      return Boolean(image?.complete && image.naturalWidth > 0)
    }, 'standard icon rendering in compatibility build', 20000, fixtureTitle)
    const standardImage = await readFixtureImage(fixtureTitle)
    check('compatibility build restores projected images through the standard proxy', standardImage?.loaded && standardImage.src.startsWith(new URL(base).origin + '/api/icon/') && iconCopyRequests.length === 0)
  } else {
  await click('[data-testid="admin-tab-settings"]')
  await until(() => Boolean(document.querySelector('.settings-submenu')), 'settings panel')
  await click('.settings-submenu button', '设备缓存')
  await until(() => Boolean(document.querySelector('.device-cache input')), 'device controls')
  const legacyStorageKey = 'cf-navs.bookmark-icon.legacy-migration-probe'
  const preservedStorageKey = 'cf-navs.migration-unrelated-probe'
  const preservedCacheUrl = 'https://cf-navs.local/bookmark-icon/legacy-migration-probe'
  await cdp.call(async function (legacyKey, preservedKey, cacheUrl) {
    localStorage.setItem(legacyKey, 'data:image/svg+xml;base64,PHN2Zy8+')
    localStorage.setItem(preservedKey, 'keep')
    const oldCache = await caches.open('cf-navs-bookmark-icons-v1')
    await oldCache.put(new Request('https://cf-navs.local/bookmark-icon/old-probe'), new Response('legacy'))
    const currentCache = await caches.open('cf-navs-bookmark-icons-v2')
    await currentCache.put(new Request(cacheUrl), new Response('current-v2', { headers: { 'content-type': 'image/svg+xml' } }))
  }, legacyStorageKey, preservedStorageKey, preservedCacheUrl)
  await cdp.send('Page.reload')
  await until(() => location.pathname === '/admin' && document.readyState === 'complete' && Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'admin application after migration reload')
  await until(async function (legacyKey, cacheUrl) {
    const names = await caches.keys()
    const current = await caches.open('cf-navs-bookmark-icons-v2')
    const preserved = await current.match(new Request(cacheUrl))
    return localStorage.getItem(legacyKey) === null && !names.includes('cf-navs-bookmark-icons-v1') && await preserved?.text() === 'current-v2'
  }, 'legacy storage migration', 20000, legacyStorageKey, preservedCacheUrl)
  const migration = await cdp.call(async function (legacyKey, preservedKey, cacheUrl) {
    const names = await caches.keys()
    const current = await caches.open('cf-navs-bookmark-icons-v2')
    const preserved = await current.match(new Request(cacheUrl))
    return {
      legacyStorageRemoved: localStorage.getItem(legacyKey) === null,
      unrelatedStoragePreserved: localStorage.getItem(preservedKey) === 'keep',
      legacyCacheRemoved: !names.includes('cf-navs-bookmark-icons-v1'),
      currentCachePreserved: await preserved?.text() === 'current-v2',
    }
  }, legacyStorageKey, preservedStorageKey, preservedCacheUrl)
  check('reload removes old localStorage data and the dedicated v1 cache', migration.legacyStorageRemoved && migration.legacyCacheRemoved)
  check('migration preserves unrelated localStorage and the active v2 external-icon entry', migration.unrelatedStoragePreserved && migration.currentCachePreserved)
  await cdp.call(async function (preservedKey, cacheUrl) {
    localStorage.removeItem(preservedKey)
    const current = await caches.open('cf-navs-bookmark-icons-v2')
    await current.delete(new Request(cacheUrl))
  }, preservedStorageKey, preservedCacheUrl)
  await until(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'admin navigation after migration reload')
  await click('[data-testid="admin-tab-settings"]')
  await until(() => Boolean(document.querySelector('.settings-submenu')), 'settings panel after migration reload')
  await click('.settings-submenu button', '设备缓存')
  await until(() => Boolean(document.querySelector('.device-cache input')), 'device controls after migration reload')
  legacyTab = await openSecondaryTab(base)
  report.ownership.legacyTargetId = legacyTab.targetId
  report.ownership.legacySessionId = legacyTab.sessionId
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  await legacyTab.evaluate(async function () {
    localStorage.setItem('cf-navs.bookmark-icon.late-tab-probe', 'data:image/svg+xml;base64,PHN2Zy8+')
    const cache = await caches.open('cf-navs-bookmark-icons-v1')
    await cache.put(new Request('https://cf-navs.local/bookmark-icon/late-tab-probe'), new Response('late legacy body'))
  })
  await until(async function () {
    const names = await caches.keys()
    return localStorage.getItem('cf-navs.bookmark-icon.late-tab-probe') === null && !names.includes('cf-navs-bookmark-icons-v1')
  }, 'new tab cleans late legacy writes from the old tab', 20000)
  check('a real cross-tab storage event removes late localStorage and v1 writes', await cdp.call(async () => localStorage.getItem('cf-navs.bookmark-icon.late-tab-probe') === null && !(await caches.keys()).includes('cf-navs-bookmark-icons-v1')))
  await legacyTab.evaluate(async function () {
    const cache = await caches.open('cf-navs-bookmark-icons-v1')
    await cache.put(new Request('https://cf-navs.local/bookmark-icon/focus-probe'), new Response('focus legacy body'))
  })
  await cdp.send('Target.activateTarget', { targetId: legacyTab.targetId })
  await cdp.send('Target.activateTarget', { targetId: cdp.targetId })
  await until(async () => !(await caches.keys()).includes('cf-navs-bookmark-icons-v1'), 'new tab cleans cache-only late write on focus', 20000)
  check('focus restoration re-cleans a legacy Cache Storage write with no storage event', await cdp.call(async () => !(await caches.keys()).includes('cf-navs-bookmark-icons-v1')))
  await cdp.send('Target.closeTarget', { targetId: legacyTab.targetId })
  report.ownership.legacyTargetClosed = true
  legacyTab = null
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  check('device preference starts disabled', await cdp.call(() => !document.querySelector('.device-cache input').checked))
  check('device controls explain private/offline risks', await cdp.call(() => document.querySelector('.device-cache').textContent.includes('私密图片') && document.querySelector('.device-cache').textContent.includes('24 小时')))
  const beforeSettings = await api('/settings', undefined, 'GET')
  await click('.device-cache input')
  await until(() => document.querySelector('.device-status')?.textContent.startsWith('已启用'), 'trusted session initialization')
  check('real session receipt enables this device', await cdp.call(() => { const record = JSON.parse(localStorage.getItem('cf-navs.icon-device-v1')); return record.trusted && record.receipt?.cache_scope?.length === 64 && record.dataset?.length === 32 }))
  await click('.device-actions button', '清理此设备图标副本')
  await until(() => document.querySelector('.device-status')?.textContent.startsWith('已启用'), 'clear and reopen')
  check('clear preserves trust, not image bodies', await cdp.call(() => document.querySelector('.device-cache input').checked))
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  check('device panel fits narrow viewport', await cdp.call(() => { const panel = document.querySelector('.device-cache').getBoundingClientRect(); return panel.width > 0 && panel.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 }))
  await click('.device-actions button', '关闭并清理')
  await until(() => document.querySelector('.device-status')?.textContent.startsWith('未启用'), 'disable cleanup')
  check('disable removes permission immediately', await cdp.call(() => !JSON.parse(localStorage.getItem('cf-navs.icon-device-v1')).trusted))
  const afterSettings = await api('/settings', undefined, 'GET')
  check('device changes never save global site settings', JSON.stringify(beforeSettings) === JSON.stringify(afterSettings))
  // Keyboard activation of the real native checkbox must also work.
  await until(() => !document.querySelector('.device-cache input')?.disabled, 'enabled keyboard control')
  await cdp.call(() => document.querySelector('.device-cache input').focus())
  await until(() => document.activeElement === document.querySelector('.device-cache input'), 'checkbox focus')
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
  await until(() => document.querySelector('.device-status')?.textContent.startsWith('已启用'), 'keyboard enable')
  check('keyboard toggling is functional', await cdp.call(() => document.querySelector('.device-cache input').checked))
  const aggregateStart = aggregateResponses.length
  const copyStart = iconCopyRequests.length
  const copyResponseStart = iconCopyResponses.length
  const objectIconStart = objectIconRequests.length
  const refreshStart = iconRefreshRequests.length
  await cdp.navigate(base)
  await scrollFixtureIntoView(fixtureTitle)
  await until(function (title) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'trusted homepage icon materialization', 20000, fixtureTitle)
  await cdp.waitForNetworkIdle(500)
  const warmImage = await readFixtureImage(fixtureTitle)
  const warmStorage = await cdp.call(async function (id) {
    const request = indexedDB.open('cf-navs-object-icons-v1')
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction(['control', 'entries', 'bodies'], 'readonly')
      const read = (store, key) => new Promise((resolve, reject) => { const item = tx.objectStore(store).get(key); item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error) })
      const [control, entry, body] = await Promise.all([read('control', 'active'), read('entries', 'bookmark:' + id), read('bodies', 'bookmark:' + id)])
      return { enabled: control?.enabled === true, entry: entry?.descriptor?.state === 'ready', bodyBytes: body?.size ?? 0 }
    } finally { db.close() }
  }, bookmark.id)
  warmStorage.revision = await cdp.call(async function (id) {
    const request = indexedDB.open('cf-navs-object-icons-v1')
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction('entries', 'readonly')
      const item = tx.objectStore('entries').get('bookmark:' + id)
      const entry = await new Promise((resolve, reject) => { item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error) })
      return entry?.descriptor?.content_revision ?? null
    } finally { db.close() }
  }, bookmark.id)
  firstDisplayCopyCount = iconCopyRequests.length - copyStart
  firstDisplayObjectIconCount = objectIconRequests.length - objectIconStart
  firstDisplayRefreshCount = iconRefreshRequests.length - refreshStart
  firstDisplayCopyTraffic = await readIconCopyTraffic(copyStart, copyResponseStart)
  check('homepage renders the trusted image from an object URL', warmImage?.loaded && warmImage.src.startsWith('blob:'))
  check('first display stores the verified body in IndexedDB', warmStorage.enabled && warmStorage.entry && warmStorage.bodyBytes > 0)
  const firstDisplayConflict = firstDisplayCopyTraffic.filter(item => item.status === 409)
  const firstDisplayCopies = firstDisplayCopyTraffic.filter(item => item.status === 200)
  const conflict = firstDisplayConflict[0]
  const retry = firstDisplayCopyTraffic[1]
  const conflictDescriptor = conflict?.conflict?.descriptor
  const conflictRetryIsValid = firstDisplayCopyTraffic.length === 2 && firstDisplayConflict.length === 1 && firstDisplayCopies.length === 1 &&
    conflict?.conflict?.protocol === 1 && conflict.conflict.reason === 'conflict' && conflict.conflict.hasImage === false &&
    conflictDescriptor?.object_type === 'bookmark' && conflictDescriptor.object_id === bookmark.id &&
    conflictDescriptor.dataset_epoch === conflict.request?.descriptor?.dataset_epoch && conflictDescriptor.state === 'ready' &&
    /^sha256-[a-f0-9]{64}$/.test(conflictDescriptor.content_revision ?? '') &&
    retry?.request?.descriptor?.object_id === conflictDescriptor.object_id &&
    retry.request.descriptor.dataset_epoch === conflictDescriptor.dataset_epoch &&
    retry.request.descriptor.expected_write_epoch === conflictDescriptor.write_epoch &&
    retry.request.descriptor.expected_content_revision === conflictDescriptor.content_revision &&
    retry.result?.protocol === 1 && retry.result.persistence === 'session-scoped' && retry.result.hasImage &&
    retry.result.image?.byteLength > 0 && retry.result.image?.base64Length > 0 &&
    retry.result.descriptor?.object_id === conflictDescriptor.object_id &&
    retry.result.descriptor.dataset_epoch === conflictDescriptor.dataset_epoch &&
    retry.result.descriptor.write_epoch === conflictDescriptor.write_epoch &&
    retry.result.descriptor.content_revision === conflictDescriptor.content_revision
  const directCopyIsValid = firstDisplayCopyTraffic.length === 1 && firstDisplayCopies.length === 1 && firstDisplayConflict.length === 0 &&
    firstDisplayCopies[0].result?.protocol === 1 && firstDisplayCopies[0].result.persistence === 'session-scoped' &&
    firstDisplayCopies[0].result.hasImage && firstDisplayCopies[0].result.image?.byteLength > 0 &&
    firstDisplayCopies[0].result.image?.base64Length > 0 &&
    firstDisplayCopies[0].result.descriptor?.object_id === firstDisplayCopies[0].request?.descriptor?.object_id &&
    firstDisplayCopies[0].result.descriptor?.dataset_epoch === firstDisplayCopies[0].request?.descriptor?.dataset_epoch &&
    firstDisplayCopies[0].result.descriptor?.write_epoch === firstDisplayCopies[0].request?.descriptor?.expected_write_epoch &&
    firstDisplayCopies[0].result.descriptor?.content_revision === firstDisplayCopies[0].request?.descriptor?.expected_content_revision
  const noCopyNeeded = firstDisplayCopyTraffic.length === 0 && iconCopyRequests.length === copyStart
  const validFirstDisplayCopySequence = noCopyNeeded || directCopyIsValid || conflictRetryIsValid
  if (conflictRetryIsValid) validatedProtocolConflictResponseIds.add(iconCopyResponses[copyResponseStart]?.requestId)
  check('first display uses one valid body response, optionally after a body-free descriptor conflict',
    iconCopyRequests.length - copyStart <= 2 && firstDisplayCopies.length <= 1 && validFirstDisplayCopySequence)
  if (firstDisplayConflict.length > 0) check('descriptor conflict is excluded only after an exact successful retry', conflictRetryIsValid)
  check('most-visited placement reuses the trusted icon copy', await cdp.call(function (title) {
    const section = [...document.querySelectorAll('.category-section')].find(item => item.querySelector('h3')?.textContent.trim() === '经常访问')
    const card = [...(section?.querySelectorAll('.bookmark-card-shell') ?? [])].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, fixtureTitle))
  await cdp.call(function (categoryTitle, title) {
    const section = document.getElementById('category-' + categoryTitle)
    const card = [...(section?.querySelectorAll('.bookmark-card-shell') ?? [])].find(item => item.getAttribute('aria-label') === title)
    card?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, category.id, fixtureTitle)
  await until(function (categoryTitle, title) {
    const section = document.getElementById('category-' + categoryTitle)
    const card = [...(section?.querySelectorAll('.bookmark-card-shell') ?? [])].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'regular category icon reuse', 20000, category.id, fixtureTitle)
  check('regular category placement reuses the trusted icon copy', await cdp.call(function (categoryTitle, title) {
    const section = document.getElementById('category-' + categoryTitle)
    const card = [...(section?.querySelectorAll('.bookmark-card-shell') ?? [])].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, category.id, fixtureTitle))
  check('homepage placements do not fetch another icon body', iconCopyRequests.length - copyStart <= 2 && firstDisplayCopies.length <= 1)
  const warmAggregateResponses = aggregateResponses.slice(aggregateStart)
  const warmAggregateContainsBody = await inspectAggregateResponses(warmAggregateResponses, 'first display', icon)
  check('first display aggregate traffic does not repeat the inline image body', warmAggregateResponses.length === 0 || warmAggregateContainsBody.every(value => !value))

  const reloadCopyStart = iconCopyRequests.length
  const reloadObjectIconStart = objectIconRequests.length
  const reloadAggregateStart = aggregateResponses.length
  await cdp.navigate(base)
  await scrollFixtureIntoView(fixtureTitle)
  await until(function (title) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'trusted homepage icon restoration after reload', 20000, fixtureTitle)
  await cdp.waitForNetworkIdle(500)
  const restoredImage = await readFixtureImage(fixtureTitle)
  const restoredStorage = await cdp.call(async function (id) {
    const request = indexedDB.open('cf-navs-object-icons-v1')
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction('entries', 'readonly')
      const item = tx.objectStore('entries').get('bookmark:' + id)
      const entry = await new Promise((resolve, reject) => { item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error) })
      return entry?.descriptor?.state === 'ready'
    } finally { db.close() }
  }, bookmark.id)
  check('reload restores the image from IndexedDB', restoredImage?.loaded && restoredImage.src.startsWith('blob:') && restoredStorage)
  check('unchanged reload makes zero icon copy requests', iconCopyRequests.length === reloadCopyStart)
  check('unchanged reload makes zero ordinary object icon requests', objectIconRequests.length === reloadObjectIconStart)
  const reloadAggregateResponses = aggregateResponses.slice(reloadAggregateStart)
  const reloadAggregateContainsBody = await inspectAggregateResponses(reloadAggregateResponses, 'unchanged reload', icon)
  check('reload aggregate traffic does not repeat the inline image body', reloadAggregateResponses.length === 0 || reloadAggregateContainsBody.every(value => !value))
  report.iconWarmup = {
    bookmarkId: bookmark.id,
    warmCopyRequests: iconCopyRequests.length - copyStart,
    reloadCopyRequests: iconCopyRequests.length - reloadCopyStart,
    warmObjectIconRequests: objectIconRequests.length - objectIconStart,
    reloadObjectIconRequests: objectIconRequests.length - reloadObjectIconStart,
    warmAggregateResponses: warmAggregateResponses.length,
    warmAggregateContainsBody: warmAggregateContainsBody.some(Boolean),
    reloadAggregateResponses: reloadAggregateResponses.length,
    reloadAggregateContainsBody: reloadAggregateContainsBody.some(Boolean),
    warmStorage,
    restoredStorage,
  }

  await replaceText('.search-input', fixtureTitle)
  await until(function (title) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'homepage search icon reuse', 20000, fixtureTitle)
  check('homepage search reuses the verified icon body', await readFixtureImage(fixtureTitle).then(image => image?.loaded && image.src.startsWith('blob:')))
  await replaceText('.search-input', '')

  await cdp.call(() => document.activeElement?.blur())
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 })
  await until(() => Boolean(document.querySelector('.spotlight-input')), 'Spotlight open')
  await cdp.send('Input.insertText', { text: fixtureTitle })
  await until(function (title) {
    const option = [...document.querySelectorAll('.spotlight-option')].find(item => item.textContent.includes(title))
    const image = option?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'Spotlight icon reuse', 20000, fixtureTitle)
  check('Spotlight reuses the verified icon body', await cdp.call(function (title) {
    const option = [...document.querySelectorAll('.spotlight-option')].find(item => item.textContent.includes(title))
    const image = option?.querySelector('img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, fixtureTitle))
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await until(() => !document.querySelector('.spotlight-input'), 'Spotlight close')

  await cdp.navigate(base + '/admin')
  await until(() => Boolean(document.querySelector('[data-testid="admin-tab-bookmarks"]')), 'admin navigation')
  await click('[data-testid="admin-tab-bookmarks"]')
  await until(function (title) {
    const row = [...document.querySelectorAll('.admin-bookmark-table tbody tr')].find(item => item.textContent.includes(title))
    const image = row?.querySelector('.admin-icon-badge img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'admin bookmark icon reuse', 20000, fixtureTitle)
  check('admin bookmark list reuses the verified icon body', await cdp.call(function (title) {
    const row = [...document.querySelectorAll('.admin-bookmark-table tbody tr')].find(item => item.textContent.includes(title))
    const image = row?.querySelector('.admin-icon-badge img')
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, fixtureTitle))

  const refreshBeforeEdit = iconRefreshRequests.length
  await click('.admin-bookmark-table tbody tr .admin-inline-actions button', '编辑')
  await until(() => Boolean(document.querySelector('[data-testid="bookmark-modal"]')), 'bookmark editor open')
  await cdp.waitForNetworkIdle(500)
  check('opening the editor uses the icon refresh endpoint', iconRefreshRequests.length > refreshBeforeEdit)
  const updatedTitle = fixtureTitle + ' edited'
  await replaceText('[data-testid="bookmark-modal"] input[type="text"]', updatedTitle)
  const editFormState = await cdp.call(function () {
    const modal = document.querySelector('[data-testid="bookmark-modal"]')
    const form = modal?.querySelector('form')
    const title = modal?.querySelector('label input[type="text"]')
    const save = modal?.querySelector('.modal-actions .primary-button')
    return { title: title?.value ?? null, valid: form?.checkValidity() ?? false, saveDisabled: save?.disabled ?? true }
  })
  report.editFormState = editFormState
  check('edited bookmark form is valid before save', editFormState.valid && !editFormState.saveDisabled && editFormState.title === updatedTitle)
  report.saveTarget = await cdp.call(function () {
    const button = document.querySelector('[data-testid="bookmark-modal"] .modal-actions .primary-button')
    if (!button) return null
    button.scrollIntoView({ block: 'center', behavior: 'instant' })
    const rect = button.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { viewport: { width: innerWidth, height: innerHeight }, text: button.textContent.trim(), disabled: button.disabled, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hitTag: hit?.tagName ?? null, hitClass: hit?.className ?? '', hitText: hit?.textContent?.trim().slice(0, 80) ?? '', hitIsButton: hit === button || Boolean(hit && button.contains(hit)) }
  })
  check('bookmark editor actions stay above the mobile admin navigation', report.saveTarget.hitIsButton)
  await cdp.call(function () {
    window.__cfNavsSubmitEvents = []
    document.addEventListener('submit', event => {
      window.__cfNavsSubmitEvents.push({ formClass: event.target?.className ?? '', submitterText: event.submitter?.textContent?.trim() ?? '', at: Date.now() })
    }, true)
  })
  await click('[data-testid="bookmark-modal"] .modal-actions .primary-button', '保存')
  await sleep(300)
  report.mouseSubmitEvents = await cdp.call(() => window.__cfNavsSubmitEvents ?? [])
  report.submitInput = report.mouseSubmitEvents.length ? 'mouse' : null
  if (!report.submitInput) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await sleep(300)
    report.keyboardSubmitEvents = await cdp.call(() => window.__cfNavsSubmitEvents ?? [])
    if (report.keyboardSubmitEvents.length) report.submitInput = 'keyboard'
  }
  check('bookmark edit save triggers a real form submission', Boolean(report.submitInput))
  await until(() => !document.querySelector('[data-testid="bookmark-modal"]'), 'bookmark editor save')
  await until(function (title) {
    const row = [...document.querySelectorAll('.admin-bookmark-table tbody tr')].find(item => item.textContent.includes(title))
    return Boolean(row)
  }, 'edited bookmark appears in the admin list', 20000, updatedTitle)
  await cdp.waitForNetworkIdle(500)
  check('saving an edit refreshes the bookmark icon', iconRefreshRequests.length > refreshBeforeEdit + 1)
  check('metadata-only edit retains the existing local image body', await cdp.call(async function (id, revision) {
    const request = indexedDB.open('cf-navs-object-icons-v1')
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction(['entries', 'bodies'], 'readonly')
      const item = tx.objectStore('entries').get('bookmark:' + id)
      const entry = await new Promise((resolve, reject) => { item.onsuccess = () => resolve(item.result); item.onerror = () => reject(item.error) })
      const bodyRequest = tx.objectStore('bodies').get('bookmark:' + id)
      const body = await new Promise((resolve, reject) => { bodyRequest.onsuccess = () => resolve(bodyRequest.result); bodyRequest.onerror = () => reject(bodyRequest.error) })
      return entry?.descriptor?.content_revision === revision && body?.size > 0
    } finally { db.close() }
  }, bookmark.id, warmStorage.revision))
  check('all display paths share the existing local image copy', iconCopyRequests.length === reloadCopyStart)
  fixtureTitle = updatedTitle
  }
} catch (error) {
  report.errors.push(redact(error.stack || error.message)); process.exitCode = 1
  if (cdp.ws) report.uiState = await cdp.call(function (title) {
    const card = [...document.querySelectorAll('.bookmark-card-shell')].find(item => item.getAttribute('aria-label') === title)
    const image = card?.querySelector('img')
    const modal = document.querySelector('[data-testid="bookmark-modal"]')
    const form = modal?.querySelector('form')
    const save = modal?.querySelector('.modal-actions .primary-button')
    return { url: location.href, pageTitle: document.title, readyState: document.readyState, cardFound: Boolean(card), image: image ? { src: image.src, loaded: image.complete && image.naturalWidth > 0 } : null,
      modal: modal ? { text: modal.innerText.slice(0, 500), valid: form?.checkValidity(), saveDisabled: save?.disabled,
        fields: [...modal.querySelectorAll('input')].map(input => ({ type: input.type, value: input.value.slice(0, 160), disabled: input.disabled })) } : null,
      checked: document.querySelector('.device-cache input')?.checked, disabled: document.querySelector('.device-cache input')?.disabled, active: document.activeElement?.tagName, activeText: document.activeElement?.textContent?.trim().slice(0, 80), submitEvents: window.__cfNavsSubmitEvents ?? [], status: document.querySelector('.device-status')?.textContent }
  }, 'Local trusted icon').catch(() => null)
}
finally {
  if (legacyTab && cdp.ws) {
    try {
      await cdp.send('Target.closeTarget', { targetId: legacyTab.targetId }, 10000)
      report.ownership.legacyTargetClosed = true
    } catch (error) {
      report.errors.push('Secondary target cleanup failed: ' + redact(error.message))
      process.exitCode = 1
    }
  }
  if (cdp.ws) await cdp.call(async function () {
    const session = JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')
    if (session?.token) await fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + session.token } })
    localStorage.removeItem('cf-navs.auth')
  }).catch(error => report.errors.push(redact(error.message)))
  if (apiToken) await api('/logout').catch(error => report.errors.push(redact(error.message)))
  report.evidence = { consoleErrors: cdp.consoleErrors.map(item => ({ ...item, text: redact(item.text) })), pageExceptions: cdp.pageExceptions.map(item => ({ ...item, text: redact(item.text) })), failedRequests: cdp.failedRequests, unexpectedHttp: cdp.responses.filter(item => item.status >= 400 && !validatedProtocolConflictResponseIds.has(item.requestId)).map(item => ({ status: item.status, url: item.url.split('?')[0] })) }
  report.bookmarkUpdateRequests = bookmarkUpdateRequests
  report.firstDisplayCopyCount = firstDisplayCopyCount
  report.firstDisplayObjectIconCount = firstDisplayObjectIconCount
  report.firstDisplayRefreshCount = firstDisplayRefreshCount
  report.objectIconRequests = objectIconRequests
  report.iconRefreshRequests = iconRefreshRequests
  report.firstDisplayCopyTraffic = firstDisplayCopyTraffic
  report.iconCopyTraffic = await readIconCopyTraffic()
  report.cleanup = await cdp.cleanup()
  if (report.cleanup.errors.length || report.cleanup.warnings.length || !report.cleanup.profileRemoved || Object.values(report.evidence).some(items => items.length)) process.exitCode = 1
  await writeFile(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.checks.filter(item => item.passed).length, total: report.checks.length, errors: report.errors, uiState: report.uiState, evidence: report.evidence, cleanup: report.cleanup, output }, null, 2))
}
