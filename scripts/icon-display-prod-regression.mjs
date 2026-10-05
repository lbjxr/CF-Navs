// Read-only test-site comparison: never create/edit/delete server bookmarks.
// Optional ICON_COMPARE_CATEGORY selects a category by title (environment only).
// Failure injection affects only the test-owned browser's local-copy requests.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { requireAdminCredentials, redactCredentials } from './lib/verifyCredentials.mjs'
import { resolveBaseUrl, resolveSetting } from './lib/verifyTarget.mjs'

const base = resolveBaseUrl()
const credentials = requireAdminCredentials()
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-navs-icon-compare-'))
const profile = path.join(output, 'cf-navs-chrome-profile-compare')
const probe = net.createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const browser = new CdpSession({ chromeExe: resolveSetting('CHROME_EXE', 'chromeExe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), debugPort: port, userDataDir: profile, headless: true })
const report = { checks: [], samples: {}, errors: [], serverCrudWrites: 0 }
let injected = 0
const injectedIds = new Set()
let categoryId = null
function check(name, passed, detail = {}) {
  report.checks.push({ name, passed: Boolean(passed), detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
}
async function wait(fn, args = [], timeout = 60000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await browser.call(fn, ...args)
    if (result) return result
    await sleep(150)
  }
  throw new Error('Timed out waiting for comparison UI')
}
async function click(selector, text = '') {
  const point = await wait((sel, label) => {
    const element = [...document.querySelectorAll(sel)].find(item => !label || item.textContent.includes(label))
    if (!element || element.disabled) return null
    element.scrollIntoView({ block: 'center' })
    const rect = element.getBoundingClientRect()
    return rect.width && rect.height ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null
  }, [selector, text])
  await browser.mouse(point.x, point.y)
}
async function controls() {
  await browser.navigate(base + '/admin')
  await click('[data-testid="admin-tab-settings"]')
  await click('.settings-submenu button', '设备缓存')
  await wait(() => Boolean(document.querySelector('.device-cache input')))
}
async function sample(name) {
  await browser.navigate(base)
  await wait(() => Boolean(document.querySelector('.bookmark-card-shell')))
  let selector = 'body'
  if (categoryId !== null) {
    const target = await wait(id => {
      const root = document.querySelector(`[data-home-category-scope="${id}"]`)
      if (root) return { selector: `[data-sort-category-id="${id}"]`, control: `[data-home-category-scope="${id}"] .scope-root-trigger` }
      const tab = document.getElementById(`home-category-tab-${id}`)
      const scope = tab?.closest('[data-home-category-scope]')
      return scope ? { selector: `[data-sort-category-id="${id}"]`, control: `#home-category-tab-${id}` } : null
    }, [categoryId])
    selector = target.selector
    await click(target.control)
  }
  const count = await wait(sel => document.querySelectorAll(sel + ' .bookmark-card-shell').length, [selector])
  if (!count || count > 1500) throw new Error('No comparison cards or unsafe sample size')
  for (let index = 0; index < count; index += 4) {
    await browser.call((sel, i) => document.querySelectorAll(sel + ' .bookmark-card-shell')[i]?.scrollIntoView({ block: 'center', behavior: 'instant' }), selector, index)
    await sleep(140)
  }
  await browser.waitForNetworkIdle(1200, 20000)
  await sleep(1800)
  const cards = await browser.call(async sel => {
    const values = await Promise.all([...document.querySelectorAll(sel + ' .bookmark-card-shell')].map(async card => {
      const identity = (card.getAttribute('aria-label') || '') + '\n' + (card.querySelector('a')?.href || '')
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
      const key = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
      const image = card.querySelector('img')
      return { key, loaded: Boolean(image?.complete && image.naturalWidth > 0), textFallback: !image }
    }))
    return values
  }, selector)
  report.samples[name] = { count, loaded: cards.filter(card => card.loaded).length, textFallback: cards.filter(card => card.textFallback).length, cards }
  await browser.call(sel => document.querySelector(sel)?.scrollIntoView({ block: 'start', behavior: 'instant' }), selector)
  const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(output, name + '.png'), Buffer.from(screenshot.data, 'base64'))
  return cards
}
function compare(name, baseline, next) {
  const loaded = baseline.filter(card => card.loaded)
  const regressed = loaded.filter(card => !next.some(other => other.key === card.key && other.loaded))
  check(name, loaded.length > 0 && regressed.length === 0, { expectedImages: loaded.length, regressed: regressed.map(card => card.key) })
}
try {
  await browser.start()
  await browser.attach()
  report.ownership = { profile, port, pid: browser.chromeProcess?.pid, targetId: browser.targetId }
  await fs.writeFile(path.join(output, 'ownership.json'), JSON.stringify(report.ownership))
  await browser.setViewport({ width: 1600, height: 1000, mobile: false, scale: 1 })
  await browser.navigate(base)
  const loggedIn = await browser.call(async (username, password) => {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
    const body = await response.json()
    if (body.code !== 0) return false
    localStorage.setItem('cf-navs.auth', JSON.stringify(body.data))
    return true
  }, credentials.username, credentials.password)
  if (!loggedIn) throw new Error('Test account login failed')
  if (process.env.ICON_COMPARE_CATEGORY) {
    categoryId = await browser.call(async title => {
      const auth = JSON.parse(localStorage.getItem('cf-navs.auth'))
      const data = await (await fetch('/api/admin/data', { headers: { authorization: 'Bearer ' + auth.token } })).json()
      return data.data?.categories?.find(category => category.title === title)?.id ?? null
    }, process.env.ICON_COMPARE_CATEGORY)
    if (categoryId === null) throw new Error('Requested category not found; comparison scope not changed silently')
  }
  const baseline = await sample('disabled')
  check('baseline has real loaded images', baseline.some(card => card.loaded), { cards: baseline.length })
  await controls()
  await click('.device-cache input')
  await wait(() => document.querySelector('.device-status')?.textContent.includes('下次刷新'))
  compare('cold cache preserves every baseline image', baseline, await sample('cold'))
  compare('warm cache preserves every baseline image', baseline, await sample('warm'))
  await controls()
  browser.on('Fetch.requestPaused', event => {
    injected++
    if (event.networkId) injectedIds.add(event.networkId)
    void browser.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 503,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify({ code: 1, msg: 'Isolated verification failure', data: { protocol: 1, reason: 'unavailable' } })).toString('base64') }).catch(() => { report.errors.push('Failed to fulfill injected response') })
  })
  await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/icon-local-copy', requestStage: 'Request' }] })
  await click('.device-actions button', '清理此设备图标副本')
  await wait(() => document.querySelector('.device-status')?.textContent.startsWith('已启用'))
  compare('copy-service failure preserves every baseline image', baseline, await sample('copy-failure'))
  check('copy failure injection was exercised', injected > 0, { injected })
  await browser.send('Fetch.disable')
} catch (error) {
  report.errors.push(redactCredentials(String(error.message), credentials))
} finally {
  if (browser.ws) {
    await browser.send('Fetch.disable').catch(() => undefined)
    await browser.call(async () => {
      const auth = JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')
      if (auth?.token) await fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + auth.token } })
      localStorage.removeItem('cf-navs.auth')
    }).catch(() => { report.errors.push('Test session logout failed') })
  }
  report.evidence = { consoleErrors: browser.consoleErrors.length, pageExceptions: browser.pageExceptions.length,
    unexpectedHttp: browser.responses.filter(response => response.status >= 400 && !injectedIds.has(response.requestId)).map(response => ({ status: response.status, path: new URL(response.url).pathname })),
    failedRequests: browser.failedRequests.map(request => ({ type: request.type, canceled: request.canceled, error: request.errorText })) }
  report.cleanup = await browser.cleanup()
  report.passed = report.checks.filter(item => item.passed).length
  await fs.writeFile(path.join(output, 'report.json'), redactCredentials(JSON.stringify(report, null, 2), credentials))
  console.log(JSON.stringify({ passed: report.passed, total: report.checks.length, samples: Object.fromEntries(Object.entries(report.samples).map(([key, value]) => [key, { count: value.count, loaded: value.loaded, textFallback: value.textFallback }])), errors: report.errors, evidence: report.evidence, cleanup: report.cleanup, output }, null, 2))
  if (report.errors.length || report.checks.some(item => !item.passed) || report.evidence.consoleErrors || report.evidence.pageExceptions || report.evidence.unexpectedHttp.length || report.cleanup.errors.length || report.cleanup.warnings.length || !report.cleanup.profileRemoved) process.exitCode = 1
}
