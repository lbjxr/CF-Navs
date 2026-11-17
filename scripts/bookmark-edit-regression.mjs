// Actual production build, isolated Chrome, intercepted synthetic requests only.
// Run after npm run build; an optional dist path provides a pre-fix negative control.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { CdpSession, sleep } from './lib/cdpSession.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'))
const output = await mkdtemp(path.join(tmpdir(), 'cf-navs-edit-'))
const bundled = await build({ entryPoints: [path.join(root, 'src/lib/settingsForm.ts')], bundle: true, platform: 'node', format: 'esm', write: false })
const { emptySettingsForm } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
const assets = new Map()
async function collectAssets(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = `${prefix}/${entry.name}`
    if (entry.isDirectory()) await collectAssets(path.join(directory, entry.name), key)
    else assets.set(key, await readFile(path.join(directory, entry.name)))
  }
}
await collectAssets(dist)
assert(assets.has('/index.html'), 'Run npm run build first')
const reservation = createServer()
await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const chromeExe = process.env.CHROME_EXE || (process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe') : '/usr/bin/google-chrome')
const cdp = new CdpSession({ chromeExe, debugPort: port, userDataDir: path.join(output, 'cf-navs-chrome-profile-edit'), headless: true, noSandbox: process.env.CHROME_NO_SANDBOX === '1' })
const origin = 'https://bookmark-edit.example'
const sourceIcon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>').toString('base64')
const source = { id: 1, category_id: 1, title: 'Original bookmark', url: `${origin}/destination`, icon: sourceIcon, icon_source: 'custom', icon_background_color: null, description: 'Fixture description', description_mode: 'hover', open_method: 1, is_private: true }
const fixture = {
  version: 'edit-fixture', dataset_epoch: 'a'.repeat(32), icon_epoch: 0,
  settings: { ...structuredClone(emptySettingsForm), site_title: 'Bookmark edit regression', site_title_show: false, most_visited_count: 0 },
  categories: [{ id: 1, parent_id: null, title: 'Fixture collection', icon: 'B', sort: 0, created_at: 1, is_private: false }],
  bookmarks: [{ ...source, icon: null, icon_blob: null, icon_display: 'image', icon_cached: true, sort: 0, created_at: 1 }],
}
const report = { scenarios: [], errors: [], requests: [] }
let held = []
let holdRead = false
let holdChunk = false
let failRead = false
let failSave = false
let saves = []
const expectedCancelled = new Set()
const requests = new Map()
const ok = data => ({ code: 0, msg: 'ok', data })
async function fulfill(event, body, contentType = 'application/json') {
  await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }],
    body: (typeof body === 'string' || Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(JSON.stringify(body))).toString('base64') })
}
async function handleRequest(event) {
  const url = new URL(event.request.url)
  if (url.origin === 'https://favicon.im' && event.request.method === 'GET') {
    return fulfill(event, Buffer.from(sourceIcon.split(',')[1], 'base64'), 'image/svg+xml')
  }
  assert.equal(url.origin, origin, 'Unexpected external network request')
  report.requests.push({ path: url.pathname, method: event.request.method })
  if ((url.pathname === '/api/bookmarks/1' && event.request.method === 'GET' && holdRead) || (/\/BookmarkEditModal-[^/]+\.js$/.test(url.pathname) && holdChunk)) {
    held.push(event)
    return
  }
  if (url.pathname === '/api/bookmarks/1' && event.request.method === 'GET') return fulfill(event, failRead ? { code: 1500, msg: 'Fixture read failure', data: null } : ok(source))
  if (url.pathname === '/api/bookmarks/1' && event.request.method === 'PUT') {
    const body = JSON.parse(event.request.postData)
    saves.push(body)
    if (failSave) return fulfill(event, { code: 1500, msg: 'Fixture save failure', data: null })
    Object.assign(source, body)
    Object.assign(fixture.bookmarks[0], source)
    return fulfill(event, { ...ok({ ...source, icon_blob: sourceIcon, sort: 0, created_at: 1 }), data_version: fixture.version })
  }
  if (url.pathname === '/api/bookmarks/1/icon-cache/refresh') return fulfill(event, ok({ icon_blob: sourceIcon, icon_update: 'unchanged' }))
  if (url.pathname === '/api/install/status') return fulfill(event, ok({ state: 'installed', schema_version: 4 }))
  if (url.pathname === '/api/admin/data' || url.pathname === '/api/public/data') return fulfill(event, ok(fixture))
  if (url.pathname === '/api/data/version') return fulfill(event, ok({ version: fixture.version, dataset_epoch: fixture.dataset_epoch, icon_epoch: 0, site_title: fixture.settings.site_title, public_mode: true }))
  if (url.pathname === '/api/icon-access') return fulfill(event, ok({ key: 'fixture-key', expires_at: Date.now() + 60_000 }))
  if (/^\/api\/(icon\/|iconify\/)/.test(url.pathname) || /favicon/.test(url.pathname)) return fulfill(event, Buffer.from(sourceIcon.split(',')[1], 'base64'), 'image/svg+xml')
  assert.equal(event.request.method, 'GET', 'Unexpected mutation')
  const file = url.pathname === '/' ? '/index.html' : url.pathname
  assert(assets.has(file), `Unexpected fixture path: ${file}`)
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
  return fulfill(event, assets.get(file), mime[path.extname(file)] || 'application/octet-stream')
}
async function release(kind) {
  const matches = held.filter(event => kind === 'read' ? event.request.url.endsWith('/api/bookmarks/1') : /\/assets\//.test(event.request.url))
  held = held.filter(event => !matches.includes(event))
  if (kind === 'read') holdRead = false
  else holdChunk = false
  for (const event of matches) await handleRequest(event)
}
async function waitFor(fn, maxMs = 5000) {
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    if (await cdp.call(fn)) return
    await sleep(50)
  }
  throw new Error(`Timed out: ${fn.name}`)
}
async function click(selector) {
  const point = await cdp.call(selector => {
    const element = document.querySelector(selector)
    if (!element) throw Error('Control missing: ' + selector)
    element.scrollIntoView({ block: 'nearest' })
    const r = element.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (!element.contains(hit)) throw Error('Control obscured: ' + selector)
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, selector)
  await cdp.mouse(point.x, point.y)
}
async function key(name, code, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: code, modifiers })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code, modifiers })
}
async function openEdit() {
  const point = await cdp.call(() => {
    const card = document.querySelector('.bookmark-card')
    card.scrollIntoView({ block: 'center' })
    const r = card.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await cdp.mouse(point.x, point.y, { button: 'right' })
  await waitFor(function menuReady() { return Boolean(document.querySelector('[data-testid="bookmark-context-edit"]')) })
  await cdp.call(() => {
    window.__editStart = performance.now()
    window.__shellMs = null
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="bookmark-modal"]')) { window.__shellMs = performance.now() - window.__editStart; observer.disconnect() }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  await click('[data-testid="bookmark-context-edit"]')
  await waitFor(function shellReady() { return Boolean(document.querySelector('[data-testid="bookmark-modal"]')) })
}
async function scenario(name, run) {
  const result = { name, passed: false }
  report.scenarios.push(result)
  await run(result)
  result.passed = true
  console.log('PASS ' + name)
}

try {
  await cdp.start()
  await cdp.attach()
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify({ browserStartedByTest: cdp.startedByTest, pid: cdp.chromeProcess?.pid, targetId: cdp.targetId, profile: cdp.userDataDir, port }))
  cdp.on('Network.requestWillBeSent', event => { requests.set(event.requestId, { path: new URL(event.request.url).pathname, method: event.request.method }) })
  cdp.on('Fetch.requestPaused', event => { void handleRequest(event).catch(error => { report.errors.push(error.message); void cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {}) }) })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('cf-navs:guide-seen','1');localStorage.setItem('cf-navs.auth',JSON.stringify({token:'fixture-session',username:'fixture',expires_at:Date.now()+3600000}));delete Navigator.prototype.serviceWorker;" })
  await cdp.setViewport({ width: 1366, height: 768, scale: 1 })
  await cdp.navigate(origin + '/')
  await waitFor(function homeReady() { return Boolean(document.querySelector('.bookmark-card')) })
  await scenario('cold open shows shell before both data and editor chunk', async result => {
    holdRead = true
    holdChunk = true
    const before = report.requests.length
    await openEdit()
    assert.equal(held.length, 2, 'Data and editor chunk must start together')
    result.shellMs = await cdp.call(() => window.__shellMs)
    assert(result.shellMs < 250, `Shell took ${result.shellMs} ms`)
    const state = await cdp.call(() => ({ reading: document.querySelector('[role="status"]')?.textContent, save: Boolean(document.querySelector('[data-testid="bookmark-modal"] button[type="submit"]')), overflow: document.body.style.overflow }))
    assert.match(state.reading, /正在读取书签/)
    assert(!state.save)
    assert.equal(state.overflow, 'hidden')
    assert(!report.requests.slice(before).some(request => request.path === '/api/admin/data' || request.path.endsWith('icon-cache/refresh')))
    await release('chunk')
    assert(await cdp.call(() => Boolean(document.querySelector('[data-testid="bookmark-edit-read-state"]'))))
    await release('read')
    await waitFor(function formReady() { return Boolean(document.querySelector('[data-testid="bookmark-modal"] form')) })
    const icon = await cdp.call(() => document.querySelector('.icon-row input').value)
    assert.equal(icon, sourceIcon, 'Lossy snapshot icon must be replaced by source icon')
    assert.equal(await cdp.call(() => document.body.style.overflow), 'hidden')
    await click('[data-testid="bookmark-modal"] .modal-header button')
    await waitFor(function modalClosed() { return !document.querySelector('[data-testid="bookmark-modal"]') })
    assert.equal(await cdp.call(() => document.body.style.overflow), '')
  })
  await scenario('cancel while reading never opens a late form', async () => {
    holdRead = true
    await openEdit()
    const read = held.find(event => event.request.url.endsWith('/api/bookmarks/1'))
    expectedCancelled.add(read.networkId)
    await key('Escape', 27)
    await waitFor(function closedAfterCancel() { return !document.querySelector('[data-testid="bookmark-modal"]') })
    held = held.filter(event => event !== read)
    holdRead = false
    await fulfill(read, ok(source)).catch(() => {})
    assert(!await cdp.call(() => Boolean(document.querySelector('[data-testid="bookmark-modal"]'))))
  })
  await scenario('read failure offers retry without an editable form', async () => {
    failRead = true
    await openEdit()
    await waitFor(function readFailed() { return Boolean(document.querySelector('[data-testid="bookmark-modal"] [role="alert"]')) })
    assert(!await cdp.call(() => Boolean(document.querySelector('[data-testid="bookmark-modal"] input'))))
    failRead = false
    await click('[data-testid="bookmark-edit-read-state"] .retry-button')
    await waitFor(function retryReady() { return Boolean(document.querySelector('[data-testid="bookmark-modal"] form')) })
    await click('[data-testid="bookmark-modal"] .modal-header button')
  })
  await scenario('save failure preserves the draft and retry retains the original icon', async () => {
    await openEdit()
    await waitFor(function readyForSave() { return Boolean(document.querySelector('[data-testid="bookmark-modal"] form')) })
    await click('input[placeholder="例如：Svelte 官方网站"]')
    await key('a', 65, 2)
    await cdp.send('Input.insertText', { text: 'Edited fixture title' })
    failSave = true
    await click('[data-testid="bookmark-modal"] button[type="submit"]')
    await waitFor(function saveFailed() { return document.querySelector('[data-testid="bookmark-modal"] .error-text')?.textContent.includes('Fixture save failure') })
    assert.equal(await cdp.call(() => document.querySelector('input[placeholder="例如：Svelte 官方网站"]').value), 'Edited fixture title')
    failSave = false
    await click('[data-testid="bookmark-modal"] button[type="submit"]')
    await waitFor(function saved() { return !document.querySelector('[data-testid="bookmark-modal"]') })
    assert.equal(saves.length, 2)
    assert(saves.every(saved => saved.icon === sourceIcon && saved.icon_source === 'custom' && saved.is_private === true))
    assert.equal(source.title, 'Edited fixture title')
  })
  for (const viewport of [{ width: 390, height: 844 }, { width: 1000, height: 300 }]) {
    await scenario(`responsive edit ${viewport.width}x${viewport.height}`, async result => {
      await cdp.setViewport({ ...viewport, scale: 1 })
      await openEdit()
      await waitFor(function responsiveReady() { return Boolean(document.querySelector('[data-testid="bookmark-modal"] form')) })
      result.metrics = await cdp.call(() => {
        const dialog = document.querySelector('[data-testid="bookmark-modal"]')
        const r = dialog.getBoundingClientRect()
        return { insideViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, noOverflow: document.documentElement.scrollWidth <= innerWidth }
      })
      assert(result.metrics.insideViewport && result.metrics.noOverflow)
      await writeFile(path.join(output, `edit-${viewport.width}.png`), Buffer.from(await cdp.screenshotBase64(), 'base64'))
      await click('[data-testid="bookmark-modal"] .modal-header button')
    })
  }
} catch (error) { report.errors.push(error.stack) }
finally {
  for (const event of held) await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' }).catch(() => {})
  report.consoleErrors = cdp.consoleErrors
  report.pageExceptions = cdp.pageExceptions
  report.expectedCancellations = cdp.failedRequests.filter(event => expectedCancelled.has(event.requestId))
  report.failedRequests = cdp.failedRequests.filter(event => !expectedCancelled.has(event.requestId)).map(event => ({ ...event, ...requests.get(event.requestId) }))
  report.httpErrors = cdp.responses.filter(response => response.status >= 400)
  report.cleanup = await cdp.cleanup()
  report.passed = report.scenarios.length === 6 && report.scenarios.every(result => result.passed) &&
    [report.errors, report.consoleErrors, report.pageExceptions, report.failedRequests, report.httpErrors, report.cleanup.errors].every(items => items.length === 0) && report.cleanup.remainingProcesses === 0 && report.cleanup.profileRemoved
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.filter(result => result.passed).length, total: report.scenarios.length, shellMs: report.scenarios[0]?.shellMs, report: path.join(output, 'report.json'), cleanup: report.cleanup, errors: report.errors }))
  if (!report.passed) process.exitCode = 1
}
