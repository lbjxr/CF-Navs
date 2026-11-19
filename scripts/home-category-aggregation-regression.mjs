// Actual homepage build, isolated Chrome, synthetic data and intercepted requests only.
// Run after npm run build; an optional dist directory provides a pre-fix negative control.
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
const output = await mkdtemp(path.join(tmpdir(), 'cf-navs-category-aggregation-'))
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
const chromeExe = process.env.CHROME_EXE || (process.platform === 'win32'
  ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome')
const cdp = new CdpSession({ chromeExe, debugPort: port, userDataDir: path.join(output, 'cf-navs-chrome-profile-aggregation'), headless: true, noSandbox: process.env.CHROME_NO_SANDBOX === '1' })
const report = { scenarios: [], requestErrors: [] }
const requests = new Map()
let origin
let fixture
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="skyblue"/></svg>')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
const ok = data => Buffer.from(JSON.stringify({ code: 0, msg: 'ok', data }))

function bookmark(id, categoryId, clicks = 0, sort = id) {
  return { id, category_id: categoryId, title: `Fixture bookmark ${id}`, url: `${origin}/destination/${id}`,
    icon: 'B', icon_display: 'text', icon_source: null, icon_blob: null, icon_background_color: null,
    description: 'Synthetic category regression bookmark', description_mode: null, open_method: 1,
    sort, click_count: clicks, is_private: false }
}
function makeFixture({ position, theme, style, wrap }) {
  return { version: `aggregation-${report.scenarios.length}`, dataset_epoch: 'a'.repeat(32), icon_epoch: 0,
    settings: { ...structuredClone(emptySettingsForm), site_title: 'Category aggregation regression', site_title_show: false,
      theme, card_style: style, most_visited_count: 0,
      navigation: { position, always_expanded: true, top_layout: wrap ? 'wrap' : 'scroll' } },
    // Deliberately unsorted children; the first sorted child is empty.
    categories: [
      { id: 1, parent_id: null, title: 'Fixture library', icon: 'L', sort: 0 },
      { id: 4, parent_id: 1, title: 'Cold child', icon: 'C', sort: 2 },
      { id: 3, parent_id: 1, title: 'Hot child', icon: 'H', sort: 1 },
      { id: 2, parent_id: 1, title: 'Empty child', icon: 'E', sort: 0 },
      { id: 5, parent_id: null, title: 'Direct library', icon: 'D', sort: 1 },
      { id: 6, parent_id: 5, title: 'Direct child', icon: 'T', sort: 0 },
      { id: 7, parent_id: null, title: 'Long collection', icon: 'S', sort: 2 },
    ],
    bookmarks: [bookmark(301, 3, 3, 0), bookmark(302, 3, 20, 1), bookmark(401, 4, 7, 1), bookmark(402, 4, 0, 0),
      bookmark(501, 5), bookmark(601, 6, 50), ...Array.from({ length: 120 }, (_, i) => bookmark(700 + i, 7))] }
}
async function fulfill(event) {
  const url = new URL(event.request.url)
  assert.equal(url.origin, origin, 'No request may leave the synthetic origin')
  assert.equal(event.request.method, 'GET', 'Unexpected mutation')
  let body
  let contentType = 'application/json'
  if (url.pathname === '/api/install/status') body = ok({ state: 'installed', schema_version: 4 })
  else if (url.pathname === '/api/data/version') body = ok({ version: fixture.version, dataset_epoch: fixture.dataset_epoch, icon_epoch: 0, site_title: fixture.settings.site_title, public_mode: true })
  else if (url.pathname === '/api/public/data') body = ok(fixture)
  else if (/^\/api\/(icon\/|category-icon\/|iconify\/)/.test(url.pathname)) { body = svg; contentType = 'image/svg+xml' }
  else {
    const file = url.pathname === '/' ? '/index.html' : url.pathname
    body = assets.get(file)
    assert(body, `Unexpected asset or API: ${url.pathname}`)
    contentType = mime[path.extname(file)] || 'application/octet-stream'
  }
  await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }], body: body.toString('base64') })
}
async function waitFor(fn, ...args) {
  for (let i = 0; i < 100; i++) {
    if (await cdp.call(fn, ...args)) return
    await sleep(50)
  }
  throw new Error(`Timed out: ${fn.name}`)
}
async function activate(selector, mobile) {
  await cdp.call(selector => document.querySelector(selector)?.scrollIntoView({ block: 'nearest' }), selector)
  await sleep(150)
  const point = await cdp.call(selector => {
    const element = document.querySelector(selector)
    if (!element) throw new Error('Control missing: ' + selector)
    const r = element.getBoundingClientRect()
    const x = r.x + r.width / 2
    const y = r.y + r.height / 2
    if (!element.contains(document.elementFromPoint(x, y))) throw new Error('Control obscured: ' + selector)
    return { x, y }
  }, selector)
  if (mobile) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else await cdp.mouse(point.x, point.y)
  await sleep(100)
}
function readPanel(rootId = 1) {
  const panel = document.getElementById(`home-category-panel-${rootId}`)
  const scope = document.querySelector(`[data-home-category-scope="${rootId}"]`)
  return { ids: [...panel.querySelectorAll('.bookmark-card')].map(card => Number(new URL(card.href).pathname.split('/').pop())),
    rootPressed: scope.querySelector('.scope-root-trigger').getAttribute('aria-pressed'),
    selectedTab: scope.querySelector('.scope-tabs .active')?.id ?? null,
    caption: panel.querySelector('.scope-hot-caption')?.textContent ?? null,
    empty: panel.textContent.includes('这个分类下暂时还没有可展示的书签。'),
    sourceTitles: [...panel.querySelectorAll('.bookmark-source')].map(node => node.textContent),
    current: [...document.querySelectorAll('aside [aria-current="location"]')].map(node => node.title),
    noOverflow: document.documentElement.scrollWidth <= innerWidth }
}
function assertAggregate(state, style) {
  assert.equal(state.rootPressed, 'true', 'Empty root must remain selectable')
  assert.deepEqual(state.ids, [302, 401, 301, 402], 'Aggregate must rank across all children')
  assert.equal(state.selectedTab, null, 'Root selection must clear child highlights')
  assert.equal(state.caption, '常用（来自 2 个子分类）')
  assert.deepEqual(state.current, ['Fixture library'], 'Navigation must highlight the root')
  assert(state.noOverflow, 'Horizontal overflow')
  if (style === 'info') assert.deepEqual(state.sourceTitles, ['Hot child', 'Cold child', 'Hot child', 'Cold child'])
}
async function check(scenario, name, action) {
  try {
    await action()
    scenario.checks.push({ name, passed: true })
  } catch (error) {
    scenario.checks.push({ name, passed: false, error: error.message, state: await cdp.call(readPanel).catch(() => null) })
    console.error(`FAIL ${scenario.width}px ${name}: ${error.message}`)
  }
}
const configurations = [
  { position: 'left', theme: 'light', style: 'info', width: 1600, mobile: false },
  { position: 'top', theme: 'dark', style: 'icon', width: 1440, mobile: false },
  { position: 'top', theme: 'light', style: 'info', width: 1024, mobile: false, wrap: true },
  { position: 'left', theme: 'light', style: 'info', width: 390, mobile: true },
  { position: 'top', theme: 'dark', style: 'icon', width: 390, mobile: true },
  { position: 'left', theme: 'dark', style: 'info', width: 320, mobile: true },
]
async function runScenario(config) {
  const scenario = { ...config, checks: [] }
  report.scenarios.push(scenario)
  origin = `https://category-aggregation-${report.scenarios.length}.example`
  fixture = makeFixture(config)
  const rootSelector = '[data-home-category-scope="1"] .scope-root-trigger'
  try {
    await cdp.clearViewport()
    await cdp.setViewport({ width: config.width, height: config.mobile ? 844 : 1000, mobile: config.mobile, scale: config.mobile ? 2 : 1.25 })
    await cdp.navigate(`${origin}/`)
    await waitFor(function homepageReady() { return document.querySelectorAll('.root-category-group').length === 3 })
    await check(scenario, 'initial aggregate and source labels', async () => assertAggregate(await cdp.call(readPanel), config.style))
    await check(scenario, 'root with direct bookmarks', async () => {
      const state = await cdp.call(readPanel, 5)
      assert.deepEqual(state.ids, [501]); assert.equal(state.rootPressed, 'true'); assert.equal(state.caption, null)
    })
    await check(scenario, 'explicit empty child', async () => {
      await activate('#home-category-tab-2', config.mobile)
      const state = await cdp.call(readPanel)
      assert.deepEqual(state.ids, []); assert(state.empty); assert.equal(state.selectedTab, 'home-category-tab-2')
    })
    await check(scenario, 'explicit nonempty child', async () => {
      await activate('#home-category-tab-3', config.mobile)
      const state = await cdp.call(readPanel)
      assert.deepEqual(state.ids, [301, 302]); assert.equal(state.rootPressed, 'false'); assert.equal(state.caption, null)
    })
    await check(scenario, 'return through root heading', async () => {
      await activate(rootSelector, config.mobile)
      assertAggregate(await cdp.call(readPanel), config.style)
    })
    await check(scenario, 'return through root navigation', async () => {
      await activate('#home-category-tab-3', config.mobile)
      if (await cdp.call(() => Boolean(document.querySelector('.toc-sidebar.mobile-hidden')))) await activate('.toc-mobile-btn', config.mobile)
      await activate('aside button[title="Fixture library"]', config.mobile)
      await sleep(1000)
      assertAggregate(await cdp.call(readPanel), config.style)
    })
    await check(scenario, 'keyboard root activation', async () => {
      await activate('#home-category-tab-3', config.mobile)
      await cdp.call(selector => {
        const button = document.querySelector(selector)
        button.focus()
        if (document.activeElement !== button) throw new Error('Root button did not receive keyboard focus')
      }, rootSelector)
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await sleep(100)
      assertAggregate(await cdp.call(readPanel), config.style)
    })
    await check(scenario, 'scroll preserves explicit root selection', async () => {
      await activate(rootSelector, config.mobile)
      await sleep(1000)
      const before = await cdp.call(() => scrollY)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: config.width - 30, y: 240, deltaX: 0, deltaY: 30 })
      await waitFor(function scrolled(previous) { return scrollY > previous }, before)
      await sleep(100)
      assertAggregate(await cdp.call(readPanel), config.style)
    })
    await writeFile(path.join(output, `scenario-${report.scenarios.length}.png`), Buffer.from(await cdp.screenshotBase64(), 'base64'))
  } catch (error) { scenario.error = error.message }
  scenario.passed = !scenario.error && scenario.checks.length === 8 && scenario.checks.every(check => check.passed)
  console.log(`${scenario.passed ? 'PASS' : 'FAIL'} ${config.position}/${config.theme}/${config.style} width=${config.width}: ${scenario.checks.filter(check => check.passed).length}/8`)
}
try {
  await cdp.start()
  const ownership = { startedByTest: cdp.startedByTest, pid: cdp.chromeProcess?.pid, profile: cdp.userDataDir, port }
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify(ownership))
  await cdp.attach()
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify({ ...ownership, targetId: cdp.targetId, sessionId: cdp.sessionId }))
  report.browser = await cdp.send('Browser.getVersion')
  cdp.on('Network.requestWillBeSent', event => requests.set(event.requestId, { url: event.request.url, type: event.type }))
  cdp.on('Fetch.requestPaused', event => { void fulfill(event).catch(async error => {
    report.requestErrors.push(error.message)
    await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {})
  }) })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  // Cache/network policy is outside this UI regression; every page uses the real built assets.
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('cf-navs:guide-seen','1');delete Navigator.prototype.serviceWorker;" })
  for (const config of configurations) await runScenario(config)
} catch (error) { report.error = error.stack }
finally {
  report.consoleErrors = cdp.consoleErrors
  report.pageExceptions = cdp.pageExceptions
  report.failedRequests = cdp.failedRequests.map(request => ({ ...request, ...requests.get(request.requestId) }))
  report.httpErrors = cdp.responses.filter(response => response.status >= 400)
  report.cleanup = await cdp.cleanup()
  report.passed = report.scenarios.length === configurations.length && report.scenarios.every(scenario => scenario.passed) && !report.error &&
    [report.requestErrors, report.consoleErrors, report.pageExceptions, report.failedRequests, report.httpErrors, report.cleanup.errors].every(items => items.length === 0) &&
    report.cleanup.remainingProcesses === 0 && report.cleanup.profileRemoved
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, checks: report.scenarios.flatMap(s => s.checks).filter(c => c.passed).length,
    total: configurations.length * 8, report: path.join(output, 'report.json'), cleanup: report.cleanup }))
  if (!report.passed) process.exitCode = 1
}
