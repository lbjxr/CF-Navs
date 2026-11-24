// PROB-40: actual build, native dialog, isolated Chrome and intercepted fixtures.
// Run after npm run build. No dev server, production requests or real credentials.
// LOGIN_REGRESSION_OUTPUT may name an external artifact parent directory.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { CdpSession, sleep } from './lib/cdpSession.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.resolve(process.argv[2] || path.join(root, 'dist'))
const outputParent = path.resolve(process.env.LOGIN_REGRESSION_OUTPUT || tmpdir())
assert(outputParent.toLowerCase() !== root.toLowerCase() && !outputParent.toLowerCase().startsWith(root.toLowerCase() + path.sep), 'Keep verification artifacts outside the repository')
await mkdir(outputParent, { recursive: true })
const output = await mkdtemp(path.join(outputParent, 'cf-navs-login-'))
const bundled = await build({ stdin: {
  contents: "export { emptySettingsForm } from './src/lib/settingsForm.ts'; export { toPublicSettings } from './shared/settings.ts';",
  resolveDir: root, loader: 'ts',
}, bundle: true, platform: 'node', format: 'esm', write: false })
const { emptySettingsForm, toPublicSettings } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
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
const chromeExe = process.env.CHROME_EXE || (process.platform === 'win32'
  ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe') : '/usr/bin/google-chrome')
const cdp = new CdpSession({ chromeExe, debugPort: port,
  userDataDir: path.join(output, 'cf-navs-chrome-profile-login'), headless: true,
  noSandbox: process.env.CHROME_NO_SANDBOX === '1' })
const origin = 'https://login-modal.example'
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2563eb"/></svg>')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
// Synthetic credentials stay in this process and the dedicated test page only.
const username = `fixture-${randomBytes(5).toString('hex')}`
const password = `Fixture-${randomBytes(12).toString('base64url')}`
const token = randomBytes(24).toString('base64url')
const grant = randomBytes(24).toString('base64url')
const report = { scope: 'Synthetic application build / native login dialog',
  buildHtmlSha256: createHash('sha256').update(assets.get('/index.html')).digest('hex'),
  scenarios: [], requestErrors: [], requests: [], errors: [] }
const requests = new Map()
let fixture
let fixtureCounter = 0
let loginOutcome = 'failure'
let loginRequestCount = 0
let credentialShapeValid = true
let heldLogin = null
let authenticated = false

function envelope(data) { return { code: 0, msg: 'ok', data } }
function makeFixture(publicMode = true, theme = 'light') {
  fixtureCounter += 1
  const settings = { ...structuredClone(emptySettingsForm), site_title: 'Login dialog verification',
    site_title_color: 'inherit', public_mode: publicMode, theme, most_visited_count: 0,
    search_engine: { current: 'Fixture search', engines: [{ name: 'Fixture search', icon: '', url_template: `${origin}/search?q={q}` }] },
    navigation: { position: 'top', always_expanded: false, top_layout: 'scroll' },
  }
  return { version: `login-${fixtureCounter}`, dataset_epoch: fixtureCounter.toString(16).padStart(32, '0'), icon_epoch: 0,
    settings, categories: [{ id: 1, parent_id: null, title: 'Fixture collection', icon: 'F', sort: 0, created_at: 1, is_private: false }],
    bookmarks: Array.from({ length: 72 }, (_, index) => ({ id: index + 1, category_id: 1,
      title: `Fixture bookmark ${index + 1}`, url: `${origin}/destination/${index + 1}`, icon: 'F',
      icon_display: 'text', icon_source: null, icon_blob: null, icon_cached: false,
      icon_background_color: null, description: 'Synthetic bookmark', description_mode: 'always',
      open_method: 1, sort: index, created_at: 1, click_count: 0, is_private: false })),
  }
}
async function fulfill(event, body, contentType = 'application/json') {
  await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }],
    body: (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))).toString('base64') })
}
async function finishLogin(event, outcome) {
  if (outcome === 'success') {
    authenticated = true
    return fulfill(event, envelope({ token, username, expires_at: Date.now() + 3_600_000 }))
  }
  return fulfill(event, { code: 1001, msg: 'Fixture login rejected', data: null })
}
async function handleRequest(event) {
  const url = new URL(event.request.url)
  assert.equal(url.origin, origin, 'No request may leave the synthetic origin')
  report.requests.push({ path: url.pathname, method: event.request.method })
  if (url.pathname === '/api/login' && event.request.method === 'POST') {
    loginRequestCount += 1
    const body = JSON.parse(event.request.postData)
    credentialShapeValid &&= body.username === username && body.password === password
    if (loginOutcome === 'held') { assert(!heldLogin, 'A second login request escaped the loading guard'); heldLogin = event; return }
    return finishLogin(event, loginOutcome)
  }
  assert.equal(event.request.method, 'GET', 'Unexpected mutation')
  if (url.pathname === '/api/install/status') return fulfill(event, envelope({ state: 'installed', schema_version: 4 }))
  if (url.pathname === '/api/data/version') return fulfill(event, envelope({ version: fixture.version,
    dataset_epoch: fixture.dataset_epoch, icon_epoch: 0, site_title: fixture.settings.site_title, public_mode: fixture.settings.public_mode }))
  if (url.pathname === '/api/public/data') {
    if (!fixture.settings.public_mode && !authenticated) return fulfill(event, { code: 1005, msg: 'forbidden',
      data: { site_title: fixture.settings.site_title, public_mode: false } })
    return fulfill(event, envelope({ ...fixture, settings: toPublicSettings(fixture.settings) }))
  }
  if (url.pathname === '/api/admin/data') { assert(authenticated, 'Admin data requested before login'); return fulfill(event, envelope(fixture)) }
  if (url.pathname === '/api/icon-access') { assert(authenticated, 'Icon access requested before login'); return fulfill(event, envelope({ key: grant, expires_at: Date.now() + 3_600_000 })) }
  if (/^\/api\/(icon\/|category-icon\/|iconify\/)/.test(url.pathname)) return fulfill(event, svg, 'image/svg+xml')
  const file = ['/', '/admin', '/recover'].includes(url.pathname) ? '/index.html' : url.pathname
  assert(assets.has(file), `Unexpected asset or API: ${url.pathname}`)
  return fulfill(event, assets.get(file), mime[path.extname(file)] || 'application/octet-stream')
}
async function waitFor(fn, ...args) {
  const started = Date.now()
  while (Date.now() - started < 7000) {
    if (await cdp.call(fn, ...args)) return
    await sleep(50)
  }
  throw new Error(`Timed out: ${fn.name}`)
}
async function key(name, code, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: code, modifiers })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: code, modifiers })
  await sleep(70)
}
async function point(selector) {
  return cdp.call(selector => {
    const element = document.querySelector(selector)
    if (!element) throw new Error('Control missing: ' + selector)
    element.scrollIntoView({ block: 'nearest' })
    const r = element.getBoundingClientRect()
    const x = r.x + r.width / 2, y = r.y + r.height / 2
    if (r.width <= 0 || r.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !element.contains(document.elementFromPoint(x, y))) {
      throw new Error('Control is hidden or obscured: ' + selector)
    }
    return { x, y }
  }, selector)
}
async function click(selector, mobile = false) {
  const p = await point(selector)
  if (mobile) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else await cdp.mouse(p.x, p.y)
  await sleep(150)
}
function dialogState() {
  const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
  const active = document.activeElement
  const r = dialog?.getBoundingClientRect()
  const activeRect = active?.getBoundingClientRect()
  return { exists: Boolean(dialog && (dialog.tagName !== 'DIALOG' || dialog.open)), native: dialog?.tagName === 'DIALOG', modal: Boolean(dialog?.matches(':modal')),
    open: Boolean(dialog?.open), focusInDialog: Boolean(dialog?.contains(active)),
    focusIsUsername: active?.getAttribute('autocomplete') === 'username',
    focusIsStableTrigger: active?.getAttribute('data-testid') === 'home-actions-menu-trigger',
    focusedTag: active?.tagName, focusVisible: Boolean(activeRect?.width && activeRect?.height),
    focusedBackgroundWidget: Boolean(active && active !== document.body && active !== document.documentElement && !dialog?.contains(active)),
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    dialogInsideViewport: Boolean(r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1),
    usernameEmpty: document.querySelector('[autocomplete="username"]')?.value === '',
    passwordEmpty: document.querySelector('[autocomplete="current-password"]')?.value === '',
    cancelsDisabled: [...(dialog?.querySelectorAll('.ghost-button') || [])].every(button => button.disabled),
    errorPresent: Boolean(dialog?.querySelector('.error-text')),
    errorAnnounced: Boolean(dialog?.querySelector('[role="alert"],.error-text[aria-live]')),
    homeVisible: Boolean(document.querySelector('.home-shell')),
    modalCount: document.querySelectorAll(':modal').length, scrollY,
  }
}
async function check(result, name, condition) {
  result.checks.push({ name, passed: Boolean(condition) })
  assert(condition, name)
}
async function scenario(name, run) {
  const result = { name, checks: [], passed: false }
  report.scenarios.push(result)
  try { await run(result); result.passed = true } catch (error) { result.error = error.message }
  if (heldLogin && !result.passed) {
    const event = heldLogin
    heldLogin = null
    loginOutcome = 'failure'
    await finishLogin(event, 'failure').catch(() => {})
  }
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${name}: ${result.checks.filter(item => item.passed).length}/${result.checks.length}${result.error ? ' — ' + result.error : ''}`)
}
async function navigateFixture({ publicMode = true, theme = 'light', viewport = { width: 1440, height: 900 } } = {}) {
  assert(!heldLogin, 'Resolve the held login before leaving the document')
  authenticated = false
  fixture = makeFixture(publicMode, theme)
  await cdp.send('Page.navigate', { url: 'about:blank' })
  await waitFor(function blankReady() { return location.href === 'about:blank' })
  await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' })
  await cdp.setViewport({ ...viewport, mobile: viewport.width <= 420, scale: 1 })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.width <= 420, maxTouchPoints: 5 })
  await cdp.send('Network.clearBrowserCache')
  await cdp.send('Page.navigate', { url: origin + '/?fixture=' + fixtureCounter })
  await waitFor(function fixtureReady(privateMode) {
    const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
    return privateMode ? Boolean(dialog && (dialog.tagName !== 'DIALOG' || dialog.open)) : Boolean(document.querySelector('.bookmark-card'))
  }, !publicMode)
  await sleep(250)
}
async function openLogin(mobile = false) {
  const trigger = await point('[data-testid="home-actions-menu-trigger"]')
  if (mobile) await click('[data-testid="home-actions-menu-trigger"]', true)
  else { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...trigger, button: 'none' }); await sleep(250) }
  await waitFor(function loginButtonVisible() { const r = document.querySelector('[data-testid="home-login-button"]')?.getBoundingClientRect(); return Boolean(r?.width && r?.height) })
  await click('[data-testid="home-login-button"]', mobile)
  await waitFor(function loginReady() {
    const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
    return Boolean(dialog && (dialog.tagName !== 'DIALOG' || dialog.open))
  })
  await sleep(120)
}
async function fillCredentials() {
  await click('[autocomplete="username"]')
  await key('a', 65, 2)
  await cdp.send('Input.insertText', { text: ' ' + username + ' ' })
  await click('[autocomplete="current-password"]')
  await cdp.send('Input.insertText', { text: password })
}
async function assertDraft(result) {
  await check(result, 'typed draft survived without rewriting', await cdp.call((username, password) =>
    document.querySelector('[autocomplete="username"]')?.value.trim() === username &&
    document.querySelector('[autocomplete="current-password"]')?.value === password, username, password))
}
async function closeWithEscape() {
  await key('Escape', 27)
  await waitFor(function loginClosed() {
    const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
    return !dialog || dialog.tagName === 'DIALOG' && !dialog.open
  })
}
async function screenshot(name) {
  assert(await cdp.call(() => !document.querySelector('[autocomplete="username"]')?.value && !document.querySelector('[autocomplete="current-password"]')?.value), 'Only screenshot empty login fields')
  await writeFile(path.join(output, name), Buffer.from(await cdp.screenshotBase64(), 'base64'))
}

try {
  await cdp.start()
  const ownership = { browserStartedByTest: cdp.startedByTest, pid: cdp.chromeProcess?.pid, profile: cdp.userDataDir, port }
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify(ownership))
  await cdp.attach()
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify({ ...ownership, targetId: cdp.targetId, sessionId: cdp.sessionId }))
  report.browser = (await cdp.send('Browser.getVersion')).product
  cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { path: new URL(event.request.url).pathname, method: event.request.method }))
  cdp.on('Fetch.requestPaused', event => { void handleRequest(event).catch(async error => {
    report.requestErrors.push(error.message)
    await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  }) })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  // Service Worker/cache lifecycle is a separate contract. Never substitute product code.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('cf-navs:guide-seen','1')}catch{};delete Navigator.prototype.serviceWorker;" })

  await scenario('public initial focus and native focus containment', async result => {
    await navigateFixture()
    await openLogin()
    let state = await cdp.call(dialogState)
    await check(result, 'the actual application opened a native modal', state.native && state.modal && state.open)
    await check(result, 'initial focus is the username field', state.focusIsUsername)
    for (const modifiers of [0, 8]) {
      for (let index = 0; index < 12; index += 1) {
        await key('Tab', 9, modifiers)
        state = await cdp.call(dialogState)
        assert(!state.focusedBackgroundWidget, `Tab escaped to ${state.focusedTag}`)
      }
    }
    await check(result, 'forward and reverse Tab never reached a background widget', true)
    await closeWithEscape()
    state = await cdp.call(dialogState)
    await check(result, 'Esc closes the public modal and releases native modal state', !state.exists && state.modalCount === 0)
    await check(result, 'focus returns to the visible settings-menu trigger', state.focusIsStableTrigger && state.focusVisible)
  })
  await scenario('cancel button and repeated open reset', async result => {
    await navigateFixture()
    await openLogin()
    await fillCredentials()
    await click('[aria-labelledby="login-modal-title"] .modal-header .ghost-button')
    await waitFor(function cancelClosed() {
      const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
      return !dialog || dialog.tagName === 'DIALOG' && !dialog.open
    })
    let state = await cdp.call(dialogState)
    await check(result, 'button cancel returns visible focus and releases native state', state.focusIsStableTrigger && state.focusVisible && state.modalCount === 0)
    for (let count = 0; count < 3; count += 1) {
      await openLogin()
      state = await cdp.call(dialogState)
      assert(state.modal && state.focusIsUsername && state.usernameEmpty && state.passwordEmpty, 'Repeated open retained draft or missed native focus')
      await closeWithEscape()
    }
    await check(result, 'three repeated open/close cycles reset fields and preserve modality', true)
  })
  await scenario('private gate survives repeated native close requests', async result => {
    await navigateFixture({ publicMode: false })
    await check(result, 'private boot opened modal without public content', (await cdp.call(dialogState)).modal && !(await cdp.call(dialogState)).homeVisible)
    for (let count = 0; count < 3; count += 1) { await key('Escape', 27); assert((await cdp.call(dialogState)).modal, 'Native Esc bypassed the private gate') }
    await check(result, 'three Escape requests kept the private modal active', true)
    await check(result, 'private denial is explained visibly or cancel is unavailable with explanation', await cdp.call(() => {
      const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
      return Boolean(dialog?.textContent?.match(/登录后|未公开|必须登录|请先登录/))
    }))
    await key('Tab', 9)
    await check(result, 'private focus remains within the modal', !(await cdp.call(dialogState)).focusedBackgroundWidget)
  })
  await scenario('pending login cannot be cancelled and failure preserves draft', async result => {
    await navigateFixture()
    await openLogin()
    await fillCredentials()
    loginOutcome = 'held'
    const before = loginRequestCount
    await click('[aria-labelledby="login-modal-title"] button[type="submit"]')
    await waitFor(function loginLoading() { return document.querySelector('[aria-labelledby="login-modal-title"] form')?.getAttribute('aria-busy') === 'true' })
    for (let count = 0; count < 20 && !heldLogin; count += 1) await sleep(50)
    assert(heldLogin, 'Login request was not held')
    for (let count = 0; count < 3; count += 1) { await key('Escape', 27); assert((await cdp.call(dialogState)).modal, 'Pending login was dismissed') }
    await check(result, 'pending login ignores repeated Esc and disables cancels', (await cdp.call(dialogState)).cancelsDisabled)
    await assertDraft(result)
    await click('[autocomplete="current-password"]')
    await key('Enter', 13)
    await sleep(150)
    await check(result, 'pending request did not double-submit', loginRequestCount === before + 1)
    const event = heldLogin
    heldLogin = null
    loginOutcome = 'failure'
    await finishLogin(event, 'failure')
    await waitFor(function failureReady() { return Boolean(document.querySelector('[aria-labelledby="login-modal-title"] .error-text')) })
    await assertDraft(result)
    await check(result, 'error is accessible and the modal remains active', (await cdp.call(dialogState)).errorAnnounced && (await cdp.call(dialogState)).modal)
    await click('[aria-labelledby="login-modal-title"] button[type="submit"]')
    await waitFor(function retryRejected() { return !document.querySelector('[aria-labelledby="login-modal-title"] button[type="submit"]')?.disabled })
    await check(result, 'failed login can retry without reopening', loginRequestCount === before + 2)
    await closeWithEscape()
  })
  await scenario('successful login closes native modal through the parent', async result => {
    await navigateFixture()
    await openLogin()
    await fillCredentials()
    loginOutcome = 'success'
    await click('[aria-labelledby="login-modal-title"] button[type="submit"]')
    await waitFor(function authenticatedHome() {
      const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
      return Boolean(document.querySelector('[data-testid="home-admin-button"]')) && (!dialog || dialog.tagName === 'DIALOG' && !dialog.open)
    })
    await check(result, 'successful login releases native modal and restores authenticated home', (await cdp.call(dialogState)).modalCount === 0 && authenticated)
    await check(result, 'parent loaded admin data after login', report.requests.some(row => row.path === '/api/admin/data'))
    await check(result, 'username trim and raw password survived the real submission path', credentialShapeValid)
  })
  await scenario('forgot-password transition releases native modal', async result => {
    await navigateFixture()
    await openLogin()
    await click('[aria-labelledby="login-modal-title"] .forgot-link')
    await waitFor(function recoveryReady() { return Boolean(document.querySelector('.recover-page')) })
    await check(result, 'forgot password replaced the login view and released modality', (await cdp.call(dialogState)).modalCount === 0 && !(await cdp.call(dialogState)).exists)
    let reachedRecoveryControl = false
    for (let count = 0; count < 8; count += 1) {
      await key('Tab', 9)
      if (await cdp.call(() => document.activeElement?.id === 'recover-token')) { reachedRecoveryControl = true; break }
    }
    await check(result, 'recovery controls remain reachable with actual Tab input', reachedRecoveryControl)
  })
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }, { width: 1000, height: 300 }]) {
    await scenario(`responsive modal ${viewport.width}x${viewport.height}`, async result => {
      await navigateFixture({ viewport, theme: viewport.width === 320 ? 'dark' : 'light' })
      await openLogin(viewport.width <= 420)
      const state = await cdp.call(dialogState)
      await check(result, 'dialog stays within viewport and page has no horizontal overflow', state.dialogInsideViewport && state.noHorizontalOverflow)
      await check(result, 'responsive initial focus is inside native modal', state.modal && state.focusIsUsername)
      const cancel = '[aria-labelledby="login-modal-title"] .modal-actions .ghost-button'
      await point(cancel)
      await check(result, 'last action can be scrolled into view and is not covered', true)
      await screenshot(`login-${viewport.width}.png`)
      await click(cancel, viewport.width <= 420)
      await waitFor(function responsiveClosed() {
        const dialog = document.querySelector('[aria-labelledby="login-modal-title"]')
        return !dialog || dialog.tagName === 'DIALOG' && !dialog.open
      })
      await check(result, 'responsive close releases native modality', (await cdp.call(dialogState)).modalCount === 0)
    })
  }
  await scenario('modal backdrop blocks background wheel scrolling', async result => {
    await navigateFixture()
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 100, y: 600, deltaX: 0, deltaY: 600 })
    await waitFor(function backgroundScrollable() { return scrollY > 100 })
    await openLogin()
    const before = await cdp.call(() => scrollY)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 5, y: 500, deltaX: 0, deltaY: 600 })
    await sleep(250)
    await check(result, 'wheel over backdrop does not scroll the background', Math.abs((await cdp.call(() => scrollY)) - before) <= 1)
    await closeWithEscape()
  })
} catch (error) { report.errors.push(error.stack) }
finally {
  if (heldLogin) {
    await finishLogin(heldLogin, 'failure').catch(() => {})
    heldLogin = null
  }
  report.consoleErrors = cdp.consoleErrors
  report.pageExceptions = cdp.pageExceptions
  report.failedRequests = cdp.failedRequests.map(event => ({ ...event, ...requests.get(event.requestId) }))
  report.httpErrors = cdp.responses.filter(row => row.status >= 400).map(row => ({ status: row.status, path: new URL(row.url).pathname }))
  report.cleanup = await cdp.cleanup()
  report.passed = report.scenarios.length === 10 && report.scenarios.every(item => item.passed) &&
    [report.errors, report.requestErrors, report.consoleErrors, report.pageExceptions, report.failedRequests, report.httpErrors, report.cleanup.errors].every(items => items.length === 0) &&
    report.cleanup.remainingProcesses === 0 && report.cleanup.profileRemoved
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.filter(item => item.passed).length,
    totalScenarios: report.scenarios.length, checks: report.scenarios.flatMap(item => item.checks).filter(item => item.passed).length,
    totalChecks: report.scenarios.flatMap(item => item.checks).length,
    report: path.join(output, 'report.json'), cleanup: report.cleanup,
    diagnostics: { consoleErrors: report.consoleErrors.length, pageExceptions: report.pageExceptions.length,
      failedRequests: report.failedRequests.length, httpErrors: report.httpErrors.length, requestErrors: report.requestErrors.length } }))
  if (!report.passed) process.exitCode = 1
}
