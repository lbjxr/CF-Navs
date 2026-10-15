// Local-only ordinary object-icon concurrency experiment for IP-P2
// (docs/plans/ICON_REQUEST_PERFORMANCE_*). Evidence-gated verdict for the
// production bound of the ordinary same-origin /api/icon/ object scheduler.
//
// It boots ONE isolated wrangler dev Worker on a free port backed by a dedicated
// disposable local D1 (.wrangler/state-iconconc-<id>), initializes the schema out
// of band (wrangler d1 execute --file=./schema.sql), bootstraps a random in-process
// administrator via /api/login INIT_ADMIN, seeds the deterministic home355 tier
// through POST /api/import (replace, public_mode), and keeps the Worker RUNNING.
//
// Then, for each candidate concurrency N in {4, 6, 8, 200}, it launches a fresh
// isolated real Chrome (scripts/lib/cdpSession.mjs), injects
// window.__CF_NAVS_ICON_CONCURRENCY = N via Page.addScriptToEvaluateOnNewDocument
// (BEFORE any page script, so the module-singleton scheduler reads it at import),
// applies one fixed reproducible CDP network throttle to every N, logs in, and runs
// >= 3 rounds of the phase sequence cold_home -> full_scroll -> back_to_top ->
// home_search using REAL mouse-wheel + keyboard input. Each round/phase captures a
// phase-tagged CDP network timeline (requestWillBeSent/responseReceived/
// loadingFinished/loadingFailed), PerformanceObserver longtask counts, rAF frame
// gaps, first-visible-icon decode readiness, exact-duplicate URLs (sha256), broken
// images, console errors, page exceptions, failed requests, unexpected HTTP, and the
// /api/icon/ pathname count. Metrics are summarized to median/P95/max per N per phase.
//
// The verdict follows plan 5.2: among candidates with failed_requests=0 and
// broken_images=0, minimize cold-load first_view_ready (median + tail) and
// long_task/frame-gap; if first_view_ready is comparable, prefer the lower in-flight
// peak (less network pressure); NEVER select on request total alone. N=200 is the
// near-unbounded control (pre-fix ~212 burst). The recommended N is then re-run once
// at 390x844 to confirm no broken images or horizontal overflow.
//
// Strictly local and read-only toward any real site: never contacts production and
// never runs git. It does NOT modify product source, ordinary-icon-scale-fixtures.mjs,
// perf-audit.mjs or smoke-local.mjs; it reuses their libraries and isolation pattern.
//
// Local caveat (reported, not hidden): wrangler dev serves over HTTP/1.1, so the
// browser caps raw TCP concurrency at ~6 connections per origin regardless of N. What
// the scheduler bound actually changes locally is how many fetch() calls are issued
// simultaneously (observed as the CDP in-flight peak between requestWillBeSent and
// loadingFinished) and the resulting main-thread work pattern; it cannot reproduce
// production HTTP/2 raw concurrency. The comparison across N is fair because every N
// shares the identical fixture, throttle, viewport and build.
//
// Usage:
//   node scripts/ordinary-icon-concurrency-experiment.mjs
// Env (optional):
//   ICONCONC_ROUNDS=3           rounds per N (clamped to >= 3)
//   ICONCONC_PORT               fixed worker port, default auto free port
//   ICONCONC_READY_TIMEOUT      seconds to wait for /api/health, default 120
//   ICONCONC_OUTPUT=<path>      JSON report path (default <tmp>/ordinary-icon-concurrency-experiment.json)
//   ICONCONC_WRANGLER_CONFIG    wrangler config, default wrangler.local.toml then wrangler.toml
//   CHROME_EXE=<path>           Chrome executable
//   CHROME_NO_SANDBOX=1         pass --no-sandbox

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTier, computeColdHomeMount, publicCategoryIdSet } from './lib/scaleFixturePlan.mjs'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { pageInstallIconPerformanceProbe } from './lib/iconPerformanceProbe.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const localConfig = path.join(rootDir, 'wrangler.local.toml')
const publicConfig = path.join(rootDir, 'wrangler.toml')
const configPath =
  process.env.ICONCONC_WRANGLER_CONFIG || (existsSync(localConfig) ? localConfig : publicConfig)
const persistParent = path.join(rootDir, '.wrangler')
const persistTo = path.resolve(process.env.ICONCONC_PERSIST_TO || path.join(persistParent, 'state-iconconc-' + randomBytes(6).toString('hex')))
const readyTimeoutMs = Number.parseInt(process.env.ICONCONC_READY_TIMEOUT || '120', 10) * 1000
const reportPath = process.env.ICONCONC_OUTPUT || path.join(os.tmpdir(), 'ordinary-icon-concurrency-experiment.json')

const CHROME_EXE = (process.env.CHROME_EXE && process.env.CHROME_EXE.trim()) ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync) || ''
const CHROME_PROFILE_ROOT = os.tmpdir()

const ADMIN_USER = 'admin'
const ADMIN_PASS = `iconconc-${randomBytes(18).toString('base64url')}`
const SETUP_TOKEN = `iconconc-setup-${randomBytes(18).toString('base64url')}`

const TIER_NAME = 'home355'
const CONCURRENCIES = [4, 6, 8, 200]
const CANDIDATES = [4, 6, 8]
const CONTROL = 200
const ROUNDS = Math.max(3, Number.parseInt(process.env.ICONCONC_ROUNDS || '3', 10) || 3)
const PHASES = ['cold_home', 'full_scroll', 'back_to_top', 'home_search']
const FIRST_VIEW_TIE_MS = 75
const DEBUG_PORT_BASE = 9245

// One fixed, reproducible throttle applied identically to every N.
const THROTTLE = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
}

const DESKTOP = { name: 'desktop', width: 1366, height: 900, mobile: false, scale: 1 }
const NARROW = { name: 'narrow', width: 390, height: 844, mobile: true, scale: 3 }

// Set once the port is known; redaction + classification read it at call time.
let ORIGIN = ''
let TARGET_HOST = ''

// ---------------------------------------------------------------------------
// Redaction + classification + stats
// ---------------------------------------------------------------------------

function redact(text) {
  if (typeof text !== 'string' || !text) return text
  let out = text
  if (ADMIN_PASS.length >= 3) out = out.split(ADMIN_PASS).join('<redacted>')
  if (SETUP_TOKEN.length >= 3) out = out.split(SETUP_TOKEN).join('<redacted>')
  if (ORIGIN) out = out.split(ORIGIN).join('[LOCAL]')
  if (TARGET_HOST) out = out.split(TARGET_HOST).join('[LOCAL]')
  return out
}

function hashUrl(href) {
  return createHash('sha256').update(href).digest('hex').slice(0, 12)
}

function samePath(href) {
  try {
    const u = new URL(href, ORIGIN || 'http://127.0.0.1')
    if (u.origin === ORIGIN) return u.pathname
    return '[external]'
  } catch {
    return '[unparsable]'
  }
}

function classify(href, type) {
  try {
    const u = new URL(href, ORIGIN || 'http://127.0.0.1')
    if (u.origin === ORIGIN) {
      if (u.pathname.startsWith('/api/icon/')) return u.searchParams.has('key') ? 'ordinary_private' : 'ordinary_public'
      if (u.pathname.startsWith('/api/icon-local-copy')) return 'trusted_copy'
      if (u.pathname.startsWith('/api/iconify/')) return 'iconify'
      return 'other_same_origin'
    }
    return type === 'Image' ? 'external' : 'other_cross_origin'
  } catch {
    return 'unparsable'
  }
}

function isOrdinary(category) {
  return category === 'ordinary_public' || category === 'ordinary_private'
}

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index]
}

function summarize(values, keepValues = true) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return { p50: null, p95: null, max: null, min: null, n: 0, ...(keepValues ? { values: [] } : {}) }
  return {
    p50: percentile(nums, 0.5),
    p95: percentile(nums, 0.95),
    max: Math.max(...nums),
    min: Math.min(...nums),
    n: nums.length,
    ...(keepValues ? { values: nums } : {}),
  }
}

function clampList(arr, n = 40) {
  return arr.slice(0, n)
}

// ---------------------------------------------------------------------------
// Phase-tagged CDP network collector (one fresh collector per browser/N)
// ---------------------------------------------------------------------------

function createCollector(cdp) {
  const requests = new Map()
  const state = { phaseKey: 'boot' }
  cdp.on('Network.requestWillBeSent', (p) => {
    if (requests.has(p.requestId)) return
    requests.set(p.requestId, {
      requestId: p.requestId,
      url: p.request?.url ?? '',
      type: p.type ?? '',
      phaseKey: state.phaseKey,
      start: typeof p.timestamp === 'number' ? p.timestamp : null,
      respAt: null,
      end: null,
      status: null,
      finished: false,
      failed: false,
      errorText: null,
      canceled: false,
    })
  })
  cdp.on('Network.responseReceived', (p) => {
    const r = requests.get(p.requestId)
    if (!r) return
    r.status = p.response?.status ?? null
    r.respAt = typeof p.timestamp === 'number' ? p.timestamp : null
  })
  cdp.on('Network.loadingFinished', (p) => {
    const r = requests.get(p.requestId)
    if (!r) return
    r.end = typeof p.timestamp === 'number' ? p.timestamp : null
    r.finished = true
  })
  cdp.on('Network.loadingFailed', (p) => {
    const r = requests.get(p.requestId)
    if (!r) return
    r.end = typeof p.timestamp === 'number' ? p.timestamp : null
    r.failed = true
    r.errorText = p.errorText ?? ''
    r.canceled = Boolean(p.canceled)
  })
  return { requests, state }
}

function inFlightPeak(rows) {
  let maxEnd = 0
  for (const r of rows) {
    if (typeof r.start !== 'number') continue
    maxEnd = Math.max(maxEnd, r.start)
    if (typeof r.end === 'number') maxEnd = Math.max(maxEnd, r.end)
  }
  const points = []
  for (const r of rows) {
    if (typeof r.start !== 'number') continue
    const end = typeof r.end === 'number' ? r.end : maxEnd
    points.push([r.start, 1])
    points.push([end, -1])
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let current = 0
  let peak = 0
  for (const [, delta] of points) {
    current += delta
    if (current > peak) peak = current
  }
  return peak
}

function computePhaseMetrics(collector, phaseKey, extras) {
  const rows = [...collector.requests.values()].filter((r) => r.phaseKey === phaseKey && r.url)
  const categories = { ordinary_public: 0, ordinary_private: 0, other_same_origin: 0, other_cross_origin: 0 }
  for (const r of rows) {
    const c = classify(r.url, r.type)
    categories[c] = (categories[c] ?? 0) + 1
  }

  const ordinary = rows.filter((r) => isOrdinary(classify(r.url, r.type)))
  const started = ordinary.length
  const peak = inFlightPeak(ordinary)

  const byHref = new Map()
  for (const r of ordinary) byHref.set(r.url, (byHref.get(r.url) || 0) + 1)
  let duplicate = 0
  const repeated = []
  for (const [href, count] of byHref) {
    if (count > 1) {
      duplicate += count - 1
      repeated.push({ urlHash: hashUrl(href), count })
    }
  }

  const unexpected = rows
    .filter((r) => typeof r.status === 'number' && r.status >= 400)
    .map((r) => ({ category: classify(r.url, r.type), status: r.status, path: samePath(r.url) }))

  const failed = rows
    .filter((r) => r.failed && !(samePath(r.url) === '/' && (r.errorText || '').includes('ERR_FAILED')))
    .map((r) => ({ category: classify(r.url, r.type), path: samePath(r.url), errorText: redact(r.errorText || ''), canceled: r.canceled }))

  const monitor = extras.monitor || { longTasks: 0, longTaskMaxMs: 0, frameGaps: 0, frameGapMaxMs: 0 }

  return {
    ordinary_started: started,
    ordinary_in_flight_max: peak,
    exact_duplicate_url: duplicate,
    exact_duplicate_detail: clampList(repeated.sort((a, b) => b.count - a.count)),
    icon_pathname_count: categories.ordinary_public + categories.ordinary_private,
    source_classification: { ordinary_public: categories.ordinary_public, ordinary_private: categories.ordinary_private },
    first_view_ready_ms: extras.firstView ?? null,
    long_task_count: monitor.longTasks,
    long_task_max_ms: monitor.longTaskMaxMs,
    frame_gap_count: monitor.frameGaps,
    frame_gap_max_ms: monitor.frameGapMaxMs,
    broken_images: extras.brokenImages ?? 0,
    overflow_px: extras.overflowPx ?? 0,
    console_errors: extras.consoleErrors ?? 0,
    page_exceptions: extras.pageExceptions ?? 0,
    failed_requests: failed.length,
    failed_request_detail: clampList(failed),
    unexpected_http: unexpected.length,
    unexpected_http_detail: clampList(unexpected),
  }
}

// ---------------------------------------------------------------------------
// Injected page bootstrap: sets the concurrency global BEFORE any page script,
// then installs the perf monitor, first-view watcher and object-URL probe.
// ---------------------------------------------------------------------------

function buildBootstrapSource(concurrency) {
  const probeSource = pageInstallIconPerformanceProbe.toString()
  return `
window.__CF_NAVS_ICON_CONCURRENCY = ${JSON.stringify(concurrency)};
(() => {
  try {
    if (!window.__perfMonitor) {
      const longTasks = [];
      const frameGaps = [];
      try {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) longTasks.push({ at: e.startTime, dur: e.duration });
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (e) {}
      let last = performance.now();
      const tick = (now) => {
        const gap = now - last;
        if (gap > 50) frameGaps.push({ at: now, gap: Math.round(gap) });
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__perfMonitor = {
        now() { return performance.now(); },
        read(fromMs, toMs) {
          const lt = longTasks.filter((e) => e.at >= fromMs && e.at <= toMs);
          const fg = frameGaps.filter((e) => e.at >= fromMs && e.at <= toMs);
          return {
            longTasks: lt.length,
            longTaskMaxMs: lt.reduce((m, e) => Math.max(m, Math.round(e.dur)), 0),
            frameGaps: fg.length,
            frameGapMaxMs: fg.reduce((m, e) => Math.max(m, e.gap), 0),
          };
        },
      };
    }
    const inView = (img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
    };
    window.__measureViewportReady = (timeout) => new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        const imgs = Array.from(document.querySelectorAll('img')).filter(inView);
        if (imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)) {
          resolve({ ms: Math.round(performance.now() - start), count: imgs.length, timedOut: false });
          return;
        }
        if (performance.now() - start > timeout) {
          resolve({ ms: Math.round(performance.now() - start), count: imgs.length, timedOut: true });
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    if (!window.__firstViewStarted) {
      window.__firstViewStarted = true;
      window.__firstView = null;
      const start = performance.now();
      const check = () => {
        const imgs = Array.from(document.querySelectorAll('img')).filter(inView);
        if (imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)) {
          window.__firstView = { ms: Math.round(performance.now() - start), count: imgs.length, timedOut: false };
          return;
        }
        if (performance.now() - start > 15000) {
          window.__firstView = { ms: Math.round(performance.now() - start), count: imgs.length, timedOut: true };
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }
    if (!window.__iconPerformanceProbe) {
      (${probeSource})();
    }
  } catch (e) {}
})();
`
}

// ---------------------------------------------------------------------------
// Page interactions (real wheel + keyboard input; read-only, no visit clicks)
// ---------------------------------------------------------------------------

async function login(cdp) {
  return cdp.call(async function doLogin(baseOrigin, username, password) {
    const response = await fetch(`${baseOrigin}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = await response.json()
    if (!response.ok || body.code !== 0) return { ok: false, status: response.status }
    localStorage.setItem('cf-navs.auth', JSON.stringify(body.data))
    return { ok: true, username: body.data.username }
  }, ORIGIN, ADMIN_USER, ADMIN_PASS)
}

async function readInjectedConcurrency(cdp) {
  return cdp.call(function read() {
    return typeof window.__CF_NAVS_ICON_CONCURRENCY === 'number' ? window.__CF_NAVS_ICON_CONCURRENCY : null
  })
}

async function coldReset(cdp) {
  await cdp.send('Network.clearBrowserCache')
  await cdp.call(async function clearCaches() {
    try {
      if (typeof caches !== 'undefined') {
        for (const name of await caches.keys()) await caches.delete(name)
      }
    } catch (e) { /* opaque origin or unavailable */ }
    return true
  })
}

async function brokenImages(cdp) {
  return cdp.call(function count() {
    return Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).length
  })
}

async function overflowPx(cdp) {
  return cdp.call(function measure() {
    const doc = document.documentElement
    return Math.max(0, Math.max(doc.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth)
  })
}

async function readMonitor(cdp, fromMs, toMs) {
  return cdp.call(function read(from, to) {
    return window.__perfMonitor
      ? window.__perfMonitor.read(from, to)
      : { longTasks: 0, longTaskMaxMs: 0, frameGaps: 0, frameGapMaxMs: 0 }
  }, fromMs, toMs)
}

async function monitorNow(cdp) {
  return cdp.call(function now() {
    return window.__perfMonitor ? window.__perfMonitor.now() : performance.now()
  })
}

async function snapshotObserved(cdp) {
  return cdp.call(function snap() {
    return {
      mountedCards: document.querySelectorAll('.bookmark-card-shell').length,
      iconSlots: document.querySelectorAll('.bookmark-icon').length,
      imgElements: document.images.length,
    }
  })
}

async function readScroll(cdp) {
  return cdp.call(function read() {
    return {
      y: window.scrollY,
      max: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight,
    }
  })
}

async function wheelScrollToBottom(cdp, viewport) {
  const cx = Math.floor(viewport.width / 2)
  const cy = Math.floor(viewport.height / 2)
  let stalls = 0
  let last = -1
  for (let i = 0; i < 400; i += 1) {
    const pos = await readScroll(cdp)
    if (pos.y >= pos.max - 2) break
    if (pos.y === last) {
      stalls += 1
      if (stalls > 6) break
    } else {
      stalls = 0
      last = pos.y
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 600 })
    await sleep(70)
  }
  await sleep(250)
  return readScroll(cdp)
}

async function wheelScrollToTop(cdp, viewport) {
  const cx = Math.floor(viewport.width / 2)
  const cy = Math.floor(viewport.height / 2)
  for (let i = 0; i < 400; i += 1) {
    const pos = await readScroll(cdp)
    if (pos.y <= 0) break
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: -800 })
    await sleep(60)
  }
  await sleep(250)
  return readScroll(cdp)
}

async function typeChar(cdp, ch) {
  const code = `Key${ch.toUpperCase()}`
  const vk = ch.toUpperCase().charCodeAt(0)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk })
}

async function pressBackspace(cdp) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
}

async function realHomeSearch(cdp) {
  const rect = await cdp.call(function locate() {
    const input = document.querySelector('.search-card input')
    if (!input) return null
    const r = input.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  if (!rect) return { ran: false }
  await cdp.mouse(rect.x, rect.y)
  await sleep(120)
  for (const ch of 'npm') {
    await typeChar(cdp, ch)
    await sleep(110)
  }
  await sleep(300)
  const filteredCards = await cdp.call(function count() { return document.querySelectorAll('.bookmark-card-shell').length })
  for (let i = 0; i < 3; i += 1) {
    await pressBackspace(cdp)
    await sleep(80)
  }
  await sleep(200)
  await cdp.call(function blur() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur() })
  return { ran: true, filteredCards }
}

// ---------------------------------------------------------------------------
// Round orchestration
// ---------------------------------------------------------------------------

async function runRound(cdp, collector, viewport, roundIndex, homeUrl) {
  const roundTag = `${viewport.name}:r${roundIndex}`
  const phases = {}

  collector.state.phaseKey = `${roundTag}:cold_home`
  await coldReset(cdp)
  const consoleBase = cdp.consoleErrors.length
  const excBase = cdp.pageExceptions.length
  await cdp.navigate(homeUrl, { waitIdleMs: 1500, timeoutMs: 60000 })
  let firstView = null
  for (let i = 0; i < 170; i += 1) {
    firstView = await cdp.call(function read() { return window.__firstView })
    if (firstView) break
    await sleep(100)
  }
  await cdp.waitForNetworkIdle(1500, 60000)
  const coldEnd = await monitorNow(cdp)
  phases.cold_home = computePhaseMetrics(collector, collector.state.phaseKey, {
    firstView,
    monitor: await readMonitor(cdp, 0, coldEnd),
    consoleErrors: cdp.consoleErrors.length - consoleBase,
    pageExceptions: cdp.pageExceptions.length - excBase,
    brokenImages: await brokenImages(cdp),
    overflowPx: await overflowPx(cdp),
  })
  const observed = await snapshotObserved(cdp)

  const runPhase = async (name, action) => {
    collector.state.phaseKey = `${roundTag}:${name}`
    const t0 = await monitorNow(cdp)
    const cBase = cdp.consoleErrors.length
    const eBase = cdp.pageExceptions.length
    const actionResult = await action()
    await cdp.waitForNetworkIdle(1200, 30000)
    const genericReady = await cdp.call(function m(timeout) { return window.__measureViewportReady(timeout) }, 3000)
    const t1 = await monitorNow(cdp)
    phases[name] = computePhaseMetrics(collector, collector.state.phaseKey, {
      firstView: genericReady,
      monitor: await readMonitor(cdp, t0, t1),
      consoleErrors: cdp.consoleErrors.length - cBase,
      pageExceptions: cdp.pageExceptions.length - eBase,
      brokenImages: await brokenImages(cdp),
      overflowPx: await overflowPx(cdp),
    })
    phases[name].action = actionResult
  }

  await runPhase('full_scroll', () => wheelScrollToBottom(cdp, viewport))
  await runPhase('back_to_top', () => wheelScrollToTop(cdp, viewport))
  await runPhase('home_search', () => realHomeSearch(cdp))

  collector.state.phaseKey = `${roundTag}:idle`
  const iconPathnameCountTotal = PHASES.reduce((sum, p) => sum + (phases[p]?.icon_pathname_count ?? 0), 0)
  return { roundIndex, phases, observed, iconPathnameCountTotal }
}

function aggregateRounds(rounds) {
  const perPhase = {}
  const scalarKeys = [
    'ordinary_started', 'ordinary_in_flight_max', 'exact_duplicate_url', 'icon_pathname_count',
    'long_task_count', 'long_task_max_ms', 'frame_gap_count', 'frame_gap_max_ms',
    'broken_images', 'overflow_px', 'console_errors', 'page_exceptions', 'failed_requests', 'unexpected_http',
  ]
  for (const phase of PHASES) {
    const agg = {}
    for (const key of scalarKeys) {
      agg[key] = summarize(rounds.map((r) => r.phases[phase]?.[key]).filter((v) => typeof v === 'number'))
    }
    agg.first_view_ready_ms = summarize(
      rounds.map((r) => r.phases[phase]?.first_view_ready_ms?.ms).filter((v) => typeof v === 'number'),
    )
    agg.first_view_timed_out = rounds.filter((r) => r.phases[phase]?.first_view_ready_ms?.timedOut === true).length
    perPhase[phase] = agg
  }
  return { perPhase, iconPathnameCountTotal: summarize(rounds.map((r) => r.iconPathnameCountTotal)) }
}

// ---------------------------------------------------------------------------
// Per-N experiment: fresh isolated browser, N rounds, exact cleanup.
// ---------------------------------------------------------------------------

async function runConcurrency(baseUrl, N, viewport, portIndex, label) {
  const homeUrl = `${baseUrl}/`
  const runId = randomBytes(4).toString('hex')
  const profile = path.join(CHROME_PROFILE_ROOT, `cf-navs-chrome-profile-iconconc-${label}-${runId}`)
  const debugPort = DEBUG_PORT_BASE + portIndex
  const cdp = new CdpSession({
    chromeExe: CHROME_EXE,
    debugPort,
    userDataDir: profile,
    headless: true,
    noSandbox: process.env.CHROME_NO_SANDBOX === '1',
  })

  const result = {
    concurrency: N,
    label,
    viewport: { name: viewport.name, width: viewport.width, height: viewport.height, mobile: viewport.mobile },
    throttle: THROTTLE,
    chromeProfileName: path.basename(profile),
    debugPort,
    injectedConcurrencyConfirmed: null,
    observed: null,
    rounds: [],
    aggregate: null,
    cleanup: null,
  }

  let collector = null
  try {
    await cdp.start()
    await cdp.attach()
    await cdp.send('Network.setBypassServiceWorker', { bypass: true })
    await cdp.send('Network.emulateNetworkConditions', THROTTLE)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: buildBootstrapSource(N) })
    collector = createCollector(cdp)

    collector.state.phaseKey = 'boot'
    await cdp.navigate(homeUrl, { waitIdleMs: 1200, timeoutMs: 60000 })
    result.injectedConcurrencyConfirmed = await readInjectedConcurrency(cdp)
    const auth = await login(cdp)
    if (!auth || !auth.ok) throw new Error(`login failed for N=${N} (status=${auth?.status})`)

    await cdp.setViewport({ width: viewport.width, height: viewport.height, mobile: viewport.mobile, scale: viewport.scale })

    const rounds = []
    for (let r = 1; r <= ROUNDS; r += 1) {
      const round = await runRound(cdp, collector, viewport, r, homeUrl)
      if (r === 1) result.observed = round.observed
      rounds.push(round)
      console.log(`  [N=${N} ${viewport.name}] round ${r}/${ROUNDS}: cold first_view=${round.phases.cold_home?.first_view_ready_ms?.ms ?? 'n/a'}ms in_flight_peak=${round.phases.cold_home?.ordinary_in_flight_max} longtask=${round.phases.cold_home?.long_task_count} broken=${round.phases.cold_home?.broken_images}`)
    }
    result.rounds = rounds.map((round) => ({ roundIndex: round.roundIndex, iconPathnameCountTotal: round.iconPathnameCountTotal, phases: round.phases }))
    result.aggregate = aggregateRounds(rounds)
  } finally {
    result.cleanup = await cdp.cleanup()
    for (const warning of result.cleanup.warnings) console.error('cleanup warning:', redact(warning))
    if (result.cleanup.errors.length) console.error('cleanup errors:', result.cleanup.errors.map(redact).join('; '))
  }
  return result
}

// ---------------------------------------------------------------------------
// Verdict (plan 5.2)
// ---------------------------------------------------------------------------

function candidateRow(res) {
  const agg = res.aggregate
  const cold = agg.perPhase.cold_home
  const scroll = agg.perPhase.full_scroll
  const all = PHASES.map((p) => agg.perPhase[p])
  const maxOf = (sel) => Math.max(...all.map((p) => sel(p) ?? 0))
  const jankProxy = (cold.long_task_max_ms.max ?? 0) + (cold.frame_gap_max_ms.max ?? 0) + (scroll.frame_gap_max_ms.max ?? 0)
  return {
    N: res.concurrency,
    first_view_cold_p50: cold.first_view_ready_ms.p50,
    first_view_cold_p95: cold.first_view_ready_ms.p95,
    first_view_cold_max: cold.first_view_ready_ms.max,
    in_flight_peak_cold: cold.ordinary_in_flight_max.max,
    cold_long_task_count_p50: cold.long_task_count.p50,
    cold_long_task_max_ms: cold.long_task_max_ms.max,
    cold_frame_gap_max_ms: cold.frame_gap_max_ms.max,
    scroll_frame_gap_max_ms: scroll.frame_gap_max_ms.max,
    jank_proxy_ms: jankProxy,
    exact_duplicate_url_max: maxOf((p) => p.exact_duplicate_url.max),
    icon_pathname_count_round_total: agg.iconPathnameCountTotal.max,
    broken_images_max: maxOf((p) => p.broken_images.max),
    failed_requests_max: maxOf((p) => p.failed_requests.max),
    unexpected_http_max: maxOf((p) => p.unexpected_http.max),
    console_errors_max: maxOf((p) => p.console_errors.max),
    page_exceptions_max: maxOf((p) => p.page_exceptions.max),
    clean: maxOf((p) => p.failed_requests.max) === 0 && maxOf((p) => p.broken_images.max) === 0,
  }
}

function decideVerdict(results) {
  const rows = CANDIDATES.map((N) => candidateRow(results[N]))
  const control = candidateRow(results[CONTROL])
  const eligible = rows.filter((r) => r.clean)
  const pool = eligible.length ? eligible : rows

  const byFirstView = [...pool].sort(
    (a, b) => (a.first_view_cold_p50 - b.first_view_cold_p50) || (a.jank_proxy_ms - b.jank_proxy_ms) || (a.in_flight_peak_cold - b.in_flight_peak_cold),
  )
  let best = byFirstView[0]
  const tied = pool.filter((r) => Math.abs(r.first_view_cold_p50 - best.first_view_cold_p50) <= FIRST_VIEW_TIE_MS)
  let tieBroken = false
  if (tied.length > 1) {
    tied.sort((a, b) => (a.jank_proxy_ms - b.jank_proxy_ms) || (a.in_flight_peak_cold - b.in_flight_peak_cold) || (a.first_view_cold_p50 - b.first_view_cold_p50))
    tieBroken = tied[0].N !== best.N || tied.length > 1
    best = tied[0]
  }

  const rationaleParts = []
  rationaleParts.push(`Eligibility (failed_requests=0 AND broken_images=0): ${rows.map((r) => `N=${r.N}:${r.clean ? 'clean' : 'excluded'}`).join(', ')}.`)
  rationaleParts.push(`Cold first_view_ready p50/p95/max ms: ${rows.map((r) => `N=${r.N}:${r.first_view_cold_p50}/${r.first_view_cold_p95}/${r.first_view_cold_max}`).join(', ')}.`)
  rationaleParts.push(`Cold in-flight peak: ${rows.map((r) => `N=${r.N}:${r.in_flight_peak_cold}`).join(', ')}.`)
  rationaleParts.push(`Jank proxy (cold longtask-max + cold frame-gap-max + scroll frame-gap-max) ms: ${rows.map((r) => `N=${r.N}:${r.jank_proxy_ms}`).join(', ')}.`)
  if (tied.length > 1) {
    rationaleParts.push(`N in {${tied.map((r) => r.N).join(',')}} were within ${FIRST_VIEW_TIE_MS}ms on cold first_view p50; broke the tie on lower jank then lower in-flight peak -> N=${best.N}.`)
  } else {
    rationaleParts.push(`N=${best.N} minimized cold first_view p50 among eligible candidates.`)
  }
  rationaleParts.push(`Near-unbounded control N=${CONTROL}: cold first_view p50/p95=${control.first_view_cold_p50}/${control.first_view_cold_p95}ms, in-flight peak=${control.in_flight_peak_cold}, jank proxy=${control.jank_proxy_ms}ms, broken=${control.broken_images_max}, failed=${control.failed_requests_max}.`)

  return {
    recommended: best.N,
    tieBroken,
    tieToleranceMs: FIRST_VIEW_TIE_MS,
    rule: 'plan 5.2: minimize cold first_view (median+tail) and long_task/frame-gap with failed_requests=0 and broken_images=0; tie on first_view -> lower in-flight peak; never select on request total alone.',
    candidates: rows,
    control200: control,
    rationale: rationaleParts.join(' '),
  }
}

// ---------------------------------------------------------------------------
// Isolated wrangler dev server (kept running for the whole experiment)
// ---------------------------------------------------------------------------

function verifyOwnedPersistPath() {
  mkdirSync(persistParent, { recursive: true })
  if (lstatSync(persistParent).isSymbolicLink() || realpathSync(persistParent).toLowerCase() !== path.resolve(persistParent).toLowerCase() ||
      path.dirname(persistTo).toLowerCase() !== persistParent.toLowerCase() || !/^state-iconconc(?:-[a-z0-9]+)*$/i.test(path.basename(persistTo))) {
    throw new Error('iconconc state must be a dedicated state-iconconc-* child of the workspace .wrangler directory')
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function runWrangler(args, label) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args, '--config', configPath], {
    cwd: rootDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        const body = await response.json()
        if (body?.data?.status === 'ok') return
      }
    } catch {
      // not ready yet
    }
    await sleep(300)
  }
  throw new Error(`local worker was not ready within ${readyTimeoutMs / 1000}s`)
}

async function apiFetch(baseUrl, route, { method = 'GET', body, token, headers } = {}) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, ok: response.ok, json, text }
}

async function bootstrapAdmin(baseUrl) {
  // /api/install is broken for the trigger-bearing schema (pre-existing product bug),
  // so the schema is initialized via wrangler d1 execute and the admin is bootstrapped
  // through /api/login INIT_ADMIN, exactly as scripts/smoke-test.mjs does.
  const result = await apiFetch(baseUrl, '/api/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } })
  const token = result.json?.data?.token
  if (!result.ok || result.json?.code !== 0 || !token) {
    throw new Error(`admin bootstrap/login failed: status=${result.status} code=${result.json?.code} message=${redact(result.json?.message ?? result.text.slice(0, 120))}`)
  }
  return token
}

async function seedTier(baseUrl, token, tier) {
  const result = await apiFetch(baseUrl, '/api/import', {
    method: 'POST',
    token,
    body: { mode: 'replace', categories: tier.categories, bookmarks: tier.bookmarks, settings: { public_mode: true } },
  })
  if (!result.ok || result.json?.code !== 0) {
    throw new Error(`import failed for ${tier.name}: status=${result.status} code=${result.json?.code} message=${redact(result.json?.message ?? result.text.slice(0, 120))}`)
  }
  return result.json.data
}

async function verifyTier(baseUrl, token, tier) {
  const admin = await apiFetch(baseUrl, '/api/admin/data', { token })
  if (!admin.ok || admin.json?.code !== 0) throw new Error(`admin /api/admin/data failed: status=${admin.status} code=${admin.json?.code}`)
  const adminCategories = admin.json.data.categories ?? []
  const adminBookmarks = admin.json.data.bookmarks ?? []
  const pub = await apiFetch(baseUrl, '/api/public/data', {})
  if (!pub.ok || pub.json?.code !== 0) throw new Error(`anonymous /api/public/data failed: status=${pub.status} code=${pub.json?.code}`)
  const publicCategories = pub.json.data.categories ?? []
  const publicBookmarks = pub.json.data.bookmarks ?? []
  const objectIconMeasured = adminBookmarks.filter((b) => b.icon_cached === 1 || b.icon_cached === true).length
  const visibleIds = publicCategoryIdSet(adminCategories)
  const measured = {
    adminTotalBookmarks: adminBookmarks.length,
    adminTotalCategories: adminCategories.length,
    publicBookmarks: publicBookmarks.length,
    privateBookmarks: adminBookmarks.filter((b) => b.is_private === 1 || b.is_private === true).length,
    objectIconBookmarks: objectIconMeasured,
    coldHomeMountAdmin: computeColdHomeMount(adminCategories, adminBookmarks),
    coldHomeMountPublic: computeColdHomeMount(publicCategories, publicBookmarks),
  }
  const privateLeakInPublic = publicBookmarks.filter((b) => !visibleIds.has(b.category_id) || b.is_private === 1 || b.is_private === true).length
  const mismatches = []
  for (const key of Object.keys(tier.expected)) {
    if (key in measured && measured[key] !== tier.expected[key]) mismatches.push({ field: key, expected: tier.expected[key], measured: measured[key] })
  }
  if (privateLeakInPublic !== 0) mismatches.push({ field: 'privateLeakInPublic', expected: 0, measured: privateLeakInPublic })
  return { expected: tier.expected, measured, mismatches, passed: mismatches.length === 0 }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!CHROME_EXE || !existsSync(CHROME_EXE)) {
    throw new Error('Chrome executable not found; set CHROME_EXE to chrome.exe')
  }
  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    throw new Error('dist/index.html is missing; run "npm run build" first (the ASSETS binding serves ./dist)')
  }

  const report = {
    tool: 'ordinary-icon-concurrency-experiment',
    plan: 'IP-P2 ordinary object-icon scheduler concurrency selection (local isolated)',
    startedAt: new Date().toISOString(),
    config: path.basename(configPath),
    stateDir: path.relative(rootDir, persistTo),
    fixtureTier: TIER_NAME,
    throttle: THROTTLE,
    throttleNote: 'latency ms; downloadThroughput/uploadThroughput bytes/s; applied identically (CDP Network.emulateNetworkConditions) to every N.',
    httpCaveat: 'wrangler dev serves HTTP/1.1 so the browser caps raw TCP concurrency at ~6/origin regardless of N. The scheduler bound changes how many fetch() calls are issued at once (observed as the CDP in-flight peak) and the main-thread work pattern; production HTTP/2 raw concurrency is not reproduced locally. All N share identical fixture/throttle/viewport/build, so the comparison is fair.',
    rounds: ROUNDS,
    concurrencyMatrix: CONCURRENCIES,
    phases: PHASES,
    primaryViewport: DESKTOP,
    recheckViewport: NARROW,
    chrome: { headless: true, profilePattern: 'cf-navs-chrome-profile-iconconc-*' },
    port: null,
    fixture: null,
    results: {},
    verdict: null,
    narrowRecheck: null,
    serverCleanup: { wranglerKilled: false, stateRemoved: false, errors: [] },
    errors: [],
    passed: false,
  }

  verifyOwnedPersistPath()
  if (existsSync(persistTo)) throw new Error('Refusing to reuse a pre-existing iconconc state directory')
  runWrangler(['d1', 'execute', 'DB', '--local', '--file=./schema.sql', '--persist-to', persistTo], 'db:init')

  const port = process.env.ICONCONC_PORT || String(await findFreePort())
  const baseUrl = `http://127.0.0.1:${port}`
  ORIGIN = baseUrl
  TARGET_HOST = `127.0.0.1:${port}`
  report.port = Number(port)

  const child = spawn(
    process.execPath,
    [
      wranglerBin, 'dev',
      '--config', configPath,
      '--ip', '127.0.0.1',
      '--port', port,
      '--persist-to', persistTo,
      '--var', `INIT_ADMIN_USER:${ADMIN_USER}`,
      '--var', `INIT_ADMIN_PASSWORD:${ADMIN_PASS}`,
      '--var', `SETUP_TOKEN:${SETUP_TOKEN}`,
    ],
    { cwd: rootDir, stdio: ['ignore', 'ignore', 'inherit'], detached: process.platform !== 'win32' },
  )

  try {
    await waitForHealth(baseUrl, child)
    const token = await bootstrapAdmin(baseUrl)
    const tier = buildTier(TIER_NAME)
    const importResp = await seedTier(baseUrl, token, tier)
    const verification = await verifyTier(baseUrl, token, tier)
    report.fixture = {
      note: tier.note,
      importResp: { categories: importResp?.categories ?? null, bookmarks: importResp?.bookmarks ?? null },
      ...verification,
    }
    if (!verification.passed) throw new Error(`home355 fixture verification failed: ${JSON.stringify(verification.mismatches)}`)
    console.log(`fixture home355 seeded: adminBookmarks=${verification.measured.adminTotalBookmarks} objectIcons=${verification.measured.objectIconBookmarks} coldHomeMountAdmin=${verification.measured.coldHomeMountAdmin}`)

    let portIndex = 0
    for (const N of CONCURRENCIES) {
      console.log(`=== concurrency N=${N} (desktop ${DESKTOP.width}x${DESKTOP.height}) ===`)
      const res = await runConcurrency(baseUrl, N, DESKTOP, portIndex, `n${N}`)
      report.results[N] = res
      portIndex += 1
      await writeFile(reportPath, JSON.stringify(report, null, 2))
    }

    report.verdict = decideVerdict(report.results)
    console.log(`verdict: recommended N=${report.verdict.recommended}`)

    console.log(`=== 390px recheck for recommended N=${report.verdict.recommended} (${NARROW.width}x${NARROW.height}) ===`)
    const narrow = await runConcurrency(baseUrl, report.verdict.recommended, NARROW, portIndex, `n${report.verdict.recommended}-narrow`)
    const narrowAll = PHASES.map((p) => narrow.aggregate.perPhase[p])
    const narrowBrokenMax = Math.max(...narrowAll.map((p) => p.broken_images.max ?? 0))
    const narrowOverflowMax = Math.max(...narrowAll.map((p) => p.overflow_px.max ?? 0))
    const narrowFailedMax = Math.max(...narrowAll.map((p) => p.failed_requests.max ?? 0))
    const narrowConsoleMax = Math.max(...narrowAll.map((p) => p.console_errors.max ?? 0))
    report.narrowRecheck = {
      concurrency: report.verdict.recommended,
      brokenImagesMax: narrowBrokenMax,
      overflowPxMax: narrowOverflowMax,
      failedRequestsMax: narrowFailedMax,
      consoleErrorsMax: narrowConsoleMax,
      firstViewColdP50: narrow.aggregate.perPhase.cold_home.first_view_ready_ms.p50,
      passed: narrowBrokenMax === 0 && narrowOverflowMax <= 1 && narrowFailedMax === 0,
      result: narrow,
    }

    report.passed = report.verdict != null && report.results[CONTROL] != null &&
      Object.values(report.results).every((r) => r.cleanup && r.cleanup.errors.length === 0) &&
      report.narrowRecheck.passed && (report.narrowRecheck.result.cleanup?.errors?.length ?? 1) === 0
  } catch (error) {
    report.errors.push(redact(String(error?.stack ?? error)))
    report.passed = false
  } finally {
    killTree(child)
    for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) {
      await sleep(100)
    }
    report.serverCleanup.wranglerKilled = child.exitCode !== null || child.signalCode !== null
    if (!report.serverCleanup.wranglerKilled) report.serverCleanup.errors.push('wrangler child did not exit after kill signal')
    try {
      verifyOwnedPersistPath()
      rmSync(persistTo, { recursive: true, force: true })
      report.serverCleanup.stateRemoved = !existsSync(persistTo)
      if (!report.serverCleanup.stateRemoved) report.serverCleanup.errors.push('state directory still present after removal')
    } catch (error) {
      report.serverCleanup.errors.push(redact(String(error?.message ?? error)))
    }
  }

  report.finishedAt = new Date().toISOString()
  report.ok = report.passed && report.serverCleanup.wranglerKilled && report.serverCleanup.stateRemoved &&
    report.serverCleanup.errors.length === 0 && report.errors.length === 0
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ reportPath, ok: report.ok, recommended: report.verdict?.recommended ?? null, serverCleanup: report.serverCleanup }, null, 2))
  process.exit(report.ok ? 0 : 1)
}

main().catch(async (error) => {
  console.error('iconconc: unexpected failure', redact(String(error?.stack ?? error)))
  try {
    rmSync(persistTo, { recursive: true, force: true })
  } catch { /* best effort */ }
  process.exit(1)
})
