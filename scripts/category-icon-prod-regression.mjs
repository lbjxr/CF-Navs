// 生产测试站分类图标可信副本冷/热回归。
// 目标地址和凭据只从被 Git 忽略的 verify.local.json / 环境变量读取；本脚本不创建或修改服务端数据。

import net from 'node:net'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { requireAdminCredentials } from './lib/verifyCredentials.mjs'
import { resolveBaseUrl, resolveChromeProfileRoot, resolveSetting } from './lib/verifyTarget.mjs'

const base = resolveBaseUrl()
const origin = new URL(base).origin
const { username, password } = requireAdminCredentials()
const profile = path.join(resolveChromeProfileRoot(), `cf-navs-chrome-profile-category-prod-${randomBytes(4).toString('hex')}`)
const chromeExe = resolveSetting('CHROME_EXE', 'chromeExe', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const debugProbe = net.createServer()
await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', resolve))
const debugPort = debugProbe.address().port
await new Promise((resolve) => debugProbe.close(resolve))

const session = new CdpSession({ chromeExe, debugPort, userDataDir: profile, headless: true })
const checks = []
let token = ''

function check(id, passed, detail = '') {
  checks.push({ id, passed: Boolean(passed), detail })
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${id}${detail ? `  ${detail}` : ''}`)
  return Boolean(passed)
}

async function api(route, options = {}) {
  const response = await fetch(origin + route, options)
  const body = await response.json().catch(() => null)
  return { response, body }
}

async function waitFor(read, description, timeoutMs = 60000, ...args) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await session.call(read, ...args).catch(() => null)
    if (value) return value
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

async function rawNavigate(url) {
  await session.send('Page.navigate', { url })
  await waitFor((expectedOrigin) => location.href.startsWith(expectedOrigin) && document.readyState !== 'loading', 'document navigation', 30000, new URL(url).origin)
}

function pageReadCategoryCache(id) {
  return (async () => {
    const image = document.querySelector(`[data-home-category-scope="${id}"] [data-category-icon] img`)
    const request = indexedDB.open('cf-navs-object-icons-v1')
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const tx = db.transaction(['entries', 'bodies'], 'readonly')
      const read = (store, key) => new Promise((resolve, reject) => {
        const item = tx.objectStore(store).get(key)
        item.onsuccess = () => resolve(item.result)
        item.onerror = () => reject(item.error)
      })
      const [entry, body] = await Promise.all([read('entries', `category:${id}`), read('bodies', `category:${id}`)])
      return {
        image: image ? { src: image.src, complete: image.complete, width: image.naturalWidth } : null,
        entry: entry ? { objectType: entry.descriptor?.object_type, objectId: entry.descriptor?.object_id, state: entry.descriptor?.state } : null,
        bodyBytes: body?.size ?? 0,
      }
    } finally {
      db.close()
    }
  })()
}

async function enableDeviceCache() {
  await rawNavigate(`${origin}/admin`)
  await waitFor(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'admin navigation')
  await session.call(() => document.querySelector('[data-testid="admin-tab-settings"]')?.click())
  await waitFor(() => Boolean(document.querySelector('.settings-submenu')), 'settings panel')
  await session.call(() => [...document.querySelectorAll('.settings-submenu button')].find((item) => item.textContent.includes('设备缓存'))?.click())
  await waitFor(() => Boolean(document.querySelector('.device-cache input')), 'device cache controls')
  const checkbox = await session.call(() => {
    const input = document.querySelector('.device-cache input')
    if (!input) return null
    const box = input.getBoundingClientRect()
    return { checked: input.checked, x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  if (checkbox && !checkbox.checked) await session.mouse(checkbox.x, checkbox.y)
  await sleep(300)
  const status = await session.call(() => document.querySelector('.device-status')?.textContent ?? '')
  if (!status.startsWith('已启用')) await session.call(() => [...document.querySelectorAll('.device-actions button')].find((item) => item.textContent.includes('联网校验') && !item.disabled)?.click())
  await waitFor(() => document.querySelector('.device-status')?.textContent?.startsWith('已启用'), 'trusted device initialization')
}

async function disableDeviceCache() {
  try {
    await rawNavigate(`${origin}/admin`)
    await waitFor(() => Boolean(document.querySelector('[data-testid="admin-tab-settings"]')), 'cleanup admin navigation')
    await session.call(() => document.querySelector('[data-testid="admin-tab-settings"]')?.click())
    await waitFor(() => Boolean(document.querySelector('.settings-submenu')), 'cleanup settings panel')
    await session.call(() => [...document.querySelectorAll('.settings-submenu button')].find((item) => item.textContent.includes('设备缓存'))?.click())
    await waitFor(() => Boolean(document.querySelector('.device-cache input')), 'cleanup device controls')
    const checkbox = await session.call(() => {
      const input = document.querySelector('.device-cache input')
      if (!input || !input.checked) return null
      const box = input.getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })
    if (checkbox) {
      await session.mouse(checkbox.x, checkbox.y)
      await waitFor(() => document.querySelector('.device-status')?.textContent?.startsWith('未启用'), 'device cleanup')
    }
  } catch (error) {
    console.warn(`  cleanup warning: ${error.message}`)
  }
}

try {
  const login = await api('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!login.response.ok || login.body?.code !== 0) throw new Error(`login failed (${login.response.status})`)
  token = login.body.data.token

  await session.start()
  await session.attach()
  await session.setViewport({ width: 1366, height: 900, mobile: false, scale: 1 })
  await rawNavigate(base)
  await session.call((auth) => localStorage.setItem('cf-navs.auth', JSON.stringify(auth)), login.body.data)

  await enableDeviceCache()
  session.resetEvidence()
  await rawNavigate(base)
  await waitFor(() => document.querySelectorAll('[data-home-category-scope]').length > 0, 'home category data')
  const category = await session.call(() => {
    const scope = document.querySelector('[data-home-category-scope]')
    const id = Number(scope?.getAttribute('data-home-category-scope'))
    return Number.isSafeInteger(id) && id > 0 ? { id, title: scope?.querySelector('h2')?.textContent?.trim() ?? '' } : null
  })
  if (!category) throw new Error('no visible root category with an image icon')
  await session.call((id) => document.querySelector(`[data-home-category-scope="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' }), category.id)
  try {
    await waitFor((id) => {
      const image = document.querySelector(`[data-home-category-scope="${id}"] [data-category-icon] img`)
      return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
    }, 'cold trusted category blob', 60000, category.id)
  } catch (error) {
    const debug = await session.call((id) => ({
      device: localStorage.getItem('cf-navs.icon-device-v1'),
      scopeExists: Boolean(document.querySelector(`[data-home-category-scope="${id}"]`)),
      iconHtml: document.querySelector(`[data-home-category-scope="${id}"] [data-category-icon]`)?.outerHTML?.slice(0, 600) ?? null,
      requests: [...document.querySelectorAll('[data-home-category-scope]')].length,
    }), category.id).catch(() => null)
    const traffic = session.responses.filter((item) => item.url.includes('/api/icon-local-copy') || item.url.includes('/api/category-icon/')).map((item) => ({ url: item.url.split('?')[0], status: item.status }))
    throw new Error(`${error.message}; category=${category.id}; debug=${JSON.stringify(debug)}; traffic=${JSON.stringify(traffic)}`)
  }
  const cold = await session.call(pageReadCategoryCache, category.id)
  const coldCopies = session.responses.filter((item) => item.url.includes('/api/icon-local-copy') && item.status === 200).length
  check('category-cold-path-uses-trusted-blob', cold.image?.src?.startsWith('blob:') && cold.entry?.objectType === 'category' && cold.entry?.objectId === category.id && cold.entry?.state === 'ready' && cold.bodyBytes > 0 && coldCopies > 0, `id=${category.id} body=${cold.bodyBytes} copy200=${coldCopies}`)

  session.resetEvidence()
  await rawNavigate(base)
  await waitFor(() => document.querySelectorAll('[data-home-category-scope]').length > 0, 'home category data after reload')
  await session.call((id) => document.querySelector(`[data-home-category-scope="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'instant' }), category.id)
  await waitFor((id) => {
    const image = document.querySelector(`[data-home-category-scope="${id}"] [data-category-icon] img`)
    return Boolean(image?.complete && image.naturalWidth > 0 && image.src.startsWith('blob:'))
  }, 'hot trusted category blob', 60000, category.id)
  const hot = await session.call(pageReadCategoryCache, category.id)
  const hotCopies = session.responses.filter((item) => item.url.includes('/api/icon-local-copy')).length
  check('category-hot-path-reuses-indexeddb', hot.image?.src?.startsWith('blob:') && hot.entry?.objectType === 'category' && hot.entry?.objectId === category.id && hot.bodyBytes > 0 && hotCopies === 0, `id=${category.id} body=${hot.bodyBytes} copyRequests=${hotCopies}`)

  check('browser-has-no-console-errors', session.consoleErrors.length === 0, `errors=${session.consoleErrors.length}`)
  check('browser-has-no-page-exceptions', session.pageExceptions.length === 0, `exceptions=${session.pageExceptions.length}`)
  check('browser-has-no-unexpected-http-errors', session.responses.every((item) => item.status < 400), `responses=${session.responses.length}`)
  console.log(JSON.stringify({ category, checks, failedRequests: session.failedRequests, cleanup: 'pending' }, null, 2))
} finally {
  if (session.ws) await disableDeviceCache()
  if (session.ws) await session.call(() => localStorage.removeItem('cf-navs.auth')).catch(() => undefined)
  if (token) await fetch(origin + '/api/logout', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined)
  const cleanup = await session.cleanup()
  console.log(JSON.stringify({ cleanup }, null, 2))
  if (cleanup.errors.length > 0) process.exitCode = 1
}

if (checks.some((item) => !item.passed)) process.exitCode = 1
