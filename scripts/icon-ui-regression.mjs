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
let apiToken = ''
const redact = value => String(value).replaceAll(process.env.ADMIN_PASS, '[redacted]').replaceAll(apiToken || '\u0000', '[redacted]').replace(/([?&](?:key|token)=)[^\s&"']+/g, '$1[redacted]')
const check = (name, value) => { report.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); console.log('PASS ' + name) }
async function api(route, body, method = 'POST') {
  const response = await fetch(base + '/api' + route, { method, headers: { 'content-type': 'application/json', ...(apiToken ? { authorization: 'Bearer ' + apiToken } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const envelope = await response.json()
  if (!response.ok || envelope.code !== 0) throw new Error('Fixture API failed: ' + route + ' (' + response.status + ')')
  return envelope.data
}
async function until(fn, message, timeout = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { if (await cdp.call(fn).catch(() => false)) return; await sleep(100) }
  throw new Error('Timed out: ' + message)
}
async function click(selector, text = null) {
  const bounds = await cdp.call(function (query, label) {
    const element = [...document.querySelectorAll(query)].find(item => !label || item.textContent.includes(label))
    if (!element) return null
    element.scrollIntoView({ block: 'center' })
    const r = element.getBoundingClientRect()
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, selector, text)
  assert.ok(bounds, 'Visible target ' + selector)
  await cdp.mouse(bounds.x, bounds.y)
}
try {
  const login = await api('/login', { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS })
  apiToken = login.token
  const category = await api('/categories', { title: 'Local icon fixture', icon: '📁' })
  const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="green"/></svg>').toString('base64')
  await api('/bookmarks', { category_id: category.id, title: 'Local private icon', url: 'https://example.com', icon, icon_source: 'custom', is_private: true })
  await cdp.start(); report.ownership.pid = cdp.chromeProcess.pid; report.ownership.browserStartedByTest = cdp.startedByTest
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  await cdp.attach(); report.ownership.targetId = cdp.targetId
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
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
  await click('[data-testid="admin-tab-settings"]')
  await until(() => Boolean(document.querySelector('.settings-submenu')), 'settings panel')
  await click('.settings-submenu button', '设备缓存')
  await until(() => Boolean(document.querySelector('.device-cache input')), 'device controls')
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
} catch (error) {
  report.errors.push(redact(error.stack || error.message)); process.exitCode = 1
  if (cdp.ws) report.uiState = await cdp.call(() => ({ checked: document.querySelector('.device-cache input')?.checked, disabled: document.querySelector('.device-cache input')?.disabled, active: document.activeElement?.tagName, status: document.querySelector('.device-status')?.textContent })).catch(() => null)
}
finally {
  if (cdp.ws) await cdp.call(async function () {
    const session = JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')
    if (session?.token) await fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + session.token } })
    localStorage.removeItem('cf-navs.auth')
  }).catch(error => report.errors.push(redact(error.message)))
  if (apiToken) await api('/logout').catch(error => report.errors.push(redact(error.message)))
  report.evidence = { consoleErrors: cdp.consoleErrors.map(item => ({ ...item, text: redact(item.text) })), pageExceptions: cdp.pageExceptions.map(item => ({ ...item, text: redact(item.text) })), failedRequests: cdp.failedRequests, unexpectedHttp: cdp.responses.filter(item => item.status >= 400).map(item => ({ status: item.status, url: item.url.split('?')[0] })) }
  report.cleanup = await cdp.cleanup()
  if (report.cleanup.errors.length || report.cleanup.warnings.length || !report.cleanup.profileRemoved || Object.values(report.evidence).some(items => items.length)) process.exitCode = 1
  await writeFile(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.checks.filter(item => item.passed).length, total: report.checks.length, errors: report.errors, uiState: report.uiState, evidence: report.evidence, cleanup: report.cleanup, output }, null, 2))
}
