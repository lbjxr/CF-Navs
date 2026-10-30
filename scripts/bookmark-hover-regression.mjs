// Real built homepage, synthetic data, and intercepted requests only: no server or credentials.
// Run after npm run build. An optional build directory supports a pre-fix negative control.
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
const output = await mkdtemp(path.join(tmpdir(), 'cf-navs-hover-'))
const bundled = await build({
  entryPoints: [path.join(root, 'src/lib/settingsForm.ts')], bundle: true,
  platform: 'node', format: 'esm', write: false,
})
const { emptySettingsForm } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`)
const assets = new Map()
async function collectAssets(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = `${prefix}/${entry.name}`
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectAssets(file, key)
    else assets.set(key, await readFile(file))
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
const session = new CdpSession({
  chromeExe, debugPort: port, userDataDir: path.join(output, 'cf-navs-chrome-profile-hover'),
  headless: true, noSandbox: process.env.CHROME_NO_SANDBOX === '1',
})
const report = { build: dist, scenarios: [], requestErrors: [] }
const requests = new Map()
let fixture
let origin
let clicks = 0

function makeFixture(theme, style, descriptionMode) {
  return {
    version: 'hover-fixture', icon_epoch: 0,
    settings: {
      ...structuredClone(emptySettingsForm), site_title: 'Bookmark hover regression', site_title_show: false,
      theme, card_style: style, card_description_mode: descriptionMode,
      card_size: { width: 216, height: 70 }, card_icon_size: 80,
      card_background_opacity: theme === 'dark' ? 0.15 : 0.9, most_visited_count: 5,
      content_layout: { max_width: 1440, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
      backgrounds: {
        light: { type: 'gradient', value: 'linear-gradient(110deg, #dcfce7, #e0f2fe)', blur: 0, mask: 0 },
        dark: { type: 'gradient', value: 'linear-gradient(110deg, #143e2b, #164761)', blur: 0, mask: 0 },
      },
    },
    categories: [{ id: 1, parent_id: null, title: 'Sample collection', icon: 'B', sort: 0, is_private: false }],
    bookmarks: Array.from({ length: 48 }, (_, i) => ({
      id: i + 1, category_id: 1, title: `Library ${String(i + 1).padStart(2, '0')}`,
      url: `${origin}/destination/${i + 1}`, icon: String.fromCharCode(65 + i % 26), icon_source: null,
      icon_blob: null, icon_background_color: null, icon_display: 'text',
      description: `Sample bookmark ${i + 1} with a multi-line tooltip description.`,
      description_mode: null, sort: i, open_method: 2, is_private: false, click_count: i < 5 ? 100 - i : 0,
    })),
  }
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }
async function fulfill(event) {
  const url = new URL(event.request.url)
  assert.equal(url.origin, origin, 'No request may leave the synthetic origin')
  let body
  let contentType = 'application/json'
  const ok = value => Buffer.from(JSON.stringify({ code: 0, msg: 'ok', data: value }))
  if (event.request.method === 'POST' && /^\/api\/public\/bookmarks\/\d+\/click$/.test(url.pathname)) {
    clicks += 1
    body = ok(null)
  } else {
    assert.equal(event.request.method, 'GET', 'Unexpected mutation')
    if (url.pathname === '/api/install/status') body = ok({ state: 'installed', schema_version: 4 })
    else if (url.pathname === '/api/data/version') body = ok({ version: fixture.version, icon_epoch: 0, site_title: fixture.settings.site_title, public_mode: true })
    else if (url.pathname === '/api/public/data') body = ok(fixture)
    else if (/^\/destination\/\d+$/.test(url.pathname)) {
      body = Buffer.from('<!doctype html><html><head><link rel="icon" href="data:,"></head><body><h1>Fixture destination</h1></body></html>')
      contentType = 'text/html'
    } else {
      const file = url.pathname === '/' ? '/index.html' : url.pathname
      body = assets.get(file)
      assert(body, `Unexpected asset or API: ${url.pathname}`)
      contentType = mime[path.extname(file)] || 'application/octet-stream'
    }
  }
  await session.send('Fetch.fulfillRequest', {
    requestId: event.requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Cache-Control', value: 'no-store' }],
    body: body.toString('base64'),
  })
}

const move = (x, y) => session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
async function key(key, windowsVirtualKeyCode) {
  await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode })
  await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode })
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (await session.call(fn)) return
    await sleep(100)
  }
  throw new Error(`Timed out: ${fn.name}`)
}
function readCard() {
  const card = document.querySelector('[data-hover-probe]')
  const shell = card.closest('.bookmark-card-shell')
  const r = card.getBoundingClientRect()
  const css = getComputedStyle(card)
  return {
    x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom,
    hover: card.matches(':hover'), focused: card.matches(':focus-visible'),
    tooltip: Number(getComputedStyle(card, '::after').opacity),
    tooltipDisplay: getComputedStyle(card, '::after').display,
    hasTooltip: card.classList.contains('bookmark-tooltip-anchor'),
    shellHover: shell.matches(':hover'), shellZIndex: getComputedStyle(shell).zIndex,
    backdrop: css.backdropFilter, shadow: css.boxShadow,
  }
}
async function jitter(point, expected) {
  const samples = []
  for (let i = 0; i < 18; i++) {
    // Subpixel horizontal motion repeats real hit tests without leaving the edge being tested.
    await move(point.x + i % 2 * 0.02, point.y)
    await sleep(45)
    samples.push(await session.call(readCard))
  }
  const result = {
    point, expected,
    flips: samples.slice(1).filter((s, i) => s.hover !== samples[i].hover).length,
    travel: Math.max(...samples.map(s => s.y)) - Math.min(...samples.map(s => s.y)),
    last: samples.at(-1),
  }
  assert.equal(result.flips, 0, `Edge hover flipped ${result.flips} times`)
  assert(result.travel < 0.01, `Card moved ${result.travel}px under the pointer`)
  assert.equal(result.last.hover, expected, 'Edge hit area changed')
  if (result.last.hasTooltip) assert.equal(result.last.tooltip, expected ? 1 : 0, 'Tooltip did not settle')
  assert.equal(result.last.shellZIndex, expected && result.last.hasTooltip ? '1' : '0', 'Only a visible tooltip may promote the card shell')
  return result
}

async function runScenario({ theme, style, descriptionMode = 'hover', scale = 1.25, mobile = false, reduced = false }) {
  const result = { theme, style, descriptionMode, scale, mobile, reduced, edges: [] }
  report.scenarios.push(result)
  origin = `https://hover-${report.scenarios.length}.example`
  fixture = makeFixture(theme, style, descriptionMode)
  clicks = 0
  try {
    await session.clearViewport()
    await session.setViewport({ width: mobile ? 390 : 1600, height: mobile ? 844 : 1100, mobile, scale })
    await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
    await session.navigate(`${origin}/`)
    await waitFor(function homepageReady() { return document.querySelectorAll('.root-category-list .bookmark-card').length === 48 })
    await session.call(() => {
      const cards = [...document.querySelectorAll('.root-category-list .bookmark-card')]
      const rows = [...new Set(cards.map(card => card.getBoundingClientRect().y))]
      const card = cards.find(card => card.getBoundingClientRect().y === rows[2])
      card.dataset.hoverProbe = ''
      card.scrollIntoView({ block: 'center' })
    })
    await move(mobile ? 385 : 1595, 5)
    await sleep(200)
    const base = await session.call(readCard)
    assert.equal(base.shellZIndex, '0', 'Idle cards must not be promoted')
    assert.match(base.backdrop, /blur\(20px\)/, 'Glass surface was removed')
    result.noOverflow = await session.call(() => document.documentElement.scrollWidth <= innerWidth)
    assert(result.noOverflow, 'Horizontal overflow')
    if (mobile) {
      result.touch = await session.call(() => ({ noHover: matchMedia('(hover: none)').matches, tooltipDisplay: getComputedStyle(document.querySelector('[data-hover-probe]'), '::after').display }))
      assert(result.touch.noHover, 'Touch emulation missing')
      assert.equal(result.touch.tooltipDisplay, 'none')
    } else {
      // Test the transparent rounded corner, not just the link's moving hit area.
      // CDP clips use document coordinates even after scrollIntoView.
      const cardClip = await session.call(() => {
        const r = document.querySelector('[data-hover-probe]').getBoundingClientRect()
        return { x: Math.floor(r.x + scrollX) - 12, y: Math.floor(r.y + scrollY) - 12, width: Math.ceil(r.width) + 24, height: Math.ceil(r.height) + 24, scale: 1 }
      })
      const cornerBefore = (await session.send('Page.captureScreenshot', { format: 'png', clip: cardClip })).data
      await move(base.x + 1, base.bottom - 1)
      await sleep(200)
      const corner = await session.call(readCard)
      assert(!corner.hover && corner.shellHover, 'Probe must hit the empty shell corner, not the link')
      assert.equal(corner.shellZIndex, '0', 'Empty corner hover promoted the glass layer')
      const cornerAfter = (await session.send('Page.captureScreenshot', { format: 'png', clip: cardClip })).data
      assert.equal(cornerAfter === cornerBefore, true, 'Empty corner hover changed the card pixels')
      result.emptyCornerUnchanged = true
      await move(1595, 5)
      await sleep(200)
      const upperClip = await session.call(() => {
        const cards = [...document.querySelectorAll('.bookmark-card')].slice(0, 5)
        const first = cards[0].getBoundingClientRect()
        const last = cards.at(-1).getBoundingClientRect()
        if (first.y < 0 || first.bottom + 30 > innerHeight) throw new Error('Upper-row probe must be visible')
        return { x: Math.floor(first.x + scrollX) - 10, y: Math.floor(first.bottom + scrollY) - 10, width: Math.ceil(last.right - first.x) + 20, height: 40, scale: 1 }
      })
      assert(upperClip.y >= 0, 'Upper-row visual probe must remain in the viewport')
      const upperBefore = (await session.send('Page.captureScreenshot', { format: 'png', clip: upperClip })).data
      const points = [
        { x: base.x + base.width / 2, y: base.bottom - 0.2 },
        { x: base.x + base.width / 2, y: base.bottom - 0.8 },
        { x: base.x + base.width / 2, y: base.bottom + 0.2 },
        { x: base.x + base.width / 2, y: base.y + 0.2 },
        { x: base.x + 0.2, y: base.y + base.height / 2 },
        { x: base.x + base.width - 0.2, y: base.y + base.height / 2 },
        { x: base.x + 4, y: base.bottom - 8 },
        { x: base.x + 1, y: base.bottom - 1 },
      ]
      for (const point of points) {
        await move(1595, 5)
        await sleep(200)
        const expected = await session.call(point => document.querySelector('[data-hover-probe]').contains(document.elementFromPoint(point.x, point.y)), point)
        result.edges.push(await jitter(point, expected))
        const upperAfter = (await session.send('Page.captureScreenshot', { format: 'png', clip: upperClip })).data
        assert(upperBefore === upperAfter, 'Untouched upper-row pixels changed during edge hover')
      }
      result.upperRowUnchanged = true
      assert.equal(clicks, 0, 'Hover triggered a click')
      await move(1595, 5)
      await session.call(() => {
        const links = [...document.querySelectorAll('a[href]')]
        links[links.indexOf(document.querySelector('[data-hover-probe]')) - 1].focus()
      })
      await key('Tab', 9)
      await sleep(200)
      result.keyboard = await session.call(readCard)
      assert(result.keyboard.focused, 'Real Tab did not focus the card')
      assert.equal(result.keyboard.shellZIndex, result.keyboard.hasTooltip ? '1' : '0', 'Keyboard promotion must match tooltip visibility')
      assert.match(result.keyboard.shadow, /3px/, 'Keyboard focus ring missing')
      assert(Math.abs(result.keyboard.y - base.y) < 0.01, 'Focus moved the card')
      // Exercise the CSS states while a tooltip-capable link is still focused.
      result.layerPriority = await session.call(() => {
        const card = document.querySelector('[data-hover-probe]')
        const shell = card.closest('.bookmark-card-shell')
        try {
          shell.classList.add('context-menu-open')
          const menuZIndex = getComputedStyle(shell).zIndex
          shell.classList.remove('context-menu-open')
          card.classList.add('sort-mode')
          return { menuZIndex, sortZIndex: getComputedStyle(shell).zIndex, sortTooltipDisplay: getComputedStyle(card, '::after').display }
        } finally {
          shell.classList.remove('context-menu-open')
          card.classList.remove('sort-mode')
        }
      })
      assert.equal(result.layerPriority.menuZIndex, '130', 'Tooltip promotion overrode the context-menu layer')
      assert.equal(result.layerPriority.sortZIndex, '0', 'Sorting promoted a hidden tooltip')
      if (result.keyboard.hasTooltip) assert.equal(result.layerPriority.sortTooltipDisplay, 'none')
      await session.call(() => document.activeElement.blur())
    }
    await writeFile(path.join(output, `scenario-${report.scenarios.length}.png`), Buffer.from(await session.screenshotBase64(), 'base64'))
    // Exercise the real link handler and destination at the formerly unstable bottom edge.
    const current = await session.call(readCard)
    if (mobile) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: current.x + current.width / 2, y: current.y + current.height / 2 }] })
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else await session.mouse(current.x + current.width / 2, current.bottom - 0.8)
    await waitFor(function destinationLoaded() {
      return location.pathname.startsWith('/destination/') && document.readyState === 'complete' &&
        document.querySelector('h1')?.textContent === 'Fixture destination'
    })
    assert.equal(clicks, 1, 'Expected exactly one click registration')
    result.passed = true
    console.log(`PASS ${theme}/${style}/${descriptionMode} dpr=${scale} mobile=${mobile} reduced=${reduced}`)
  } catch (error) {
    result.error = error.message
    result.passed = false
    console.error(`FAIL ${theme}/${style}: ${error.message}`)
  }
}

try {
  await session.start()
  const ownership = { startedByTest: session.startedByTest, pid: session.chromeProcess?.pid, profile: session.userDataDir, port }
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify(ownership))
  await session.attach()
  await writeFile(path.join(output, 'ownership.json'), JSON.stringify({ ...ownership, targetId: session.targetId, sessionId: session.sessionId }))
  report.browser = await session.send('Browser.getVersion')
  session.on('Network.requestWillBeSent', event => {
    requests.set(event.requestId, { url: event.request.url, type: event.type, scenario: report.scenarios.length })
  })
  session.on('Fetch.requestPaused', event => {
    void fulfill(event).catch(async error => {
      report.requestErrors.push(error.message)
      await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {})
    })
  })
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  // Service worker/network behavior is out of scope; all rendering uses the actual built assets.
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('cf-navs:guide-seen','1');delete Navigator.prototype.serviceWorker;" })
  for (const theme of ['dark', 'light']) {
    await runScenario({ theme, style: 'info', descriptionMode: 'always', scale: 1 })
    for (const style of ['info', 'icon']) {
      await runScenario({ theme, style })
      await runScenario({ theme, style, mobile: true, scale: 2 })
    }
  }
  for (const style of ['info', 'icon']) {
    await runScenario({ theme: 'dark', style, scale: 1.5 })
    await runScenario({ theme: 'dark', style, scale: 2 })
    await runScenario({ theme: 'dark', style, reduced: true })
  }
} catch (error) {
  report.error = error.stack
} finally {
  report.consoleErrors = session.consoleErrors
  report.pageExceptions = session.pageExceptions
  report.failedRequests = session.failedRequests.map(request => ({ ...request, ...requests.get(request.requestId) }))
  report.httpErrors = session.responses.filter(response => response.status >= 400)
  report.cleanup = await session.cleanup()
  report.passed = report.scenarios.length === 16 && report.scenarios.every(s => s.passed) && !report.error &&
    [report.requestErrors, report.consoleErrors, report.pageExceptions, report.failedRequests, report.httpErrors, report.cleanup.errors].every(items => items.length === 0) &&
    report.cleanup.remainingProcesses === 0 && report.cleanup.profileRemoved
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.filter(s => s.passed).length, total: report.scenarios.length, report: path.join(output, 'report.json'), cleanup: report.cleanup }))
  if (!report.passed) process.exitCode = 1
}
