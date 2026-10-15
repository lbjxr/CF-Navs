// Read-only ordinary object-icon performance probe for CF-Navs (Issue #31).
//
// Measures ordinary same-origin /api/icon/ object-proxy request behaviour on the
// deployed production custom domain WITHOUT changing any product behaviour. It only
// browses: cold home load, full scroll, back to top, rapid round trip, home search,
// and opening Spotlight. It never clicks a bookmark/category create/edit/delete and
// never registers a click, so it performs no writes against production.
//
// It also records a redacted X-Icon-Fallback classification per same-origin /api/icon/
// response (a 200 carrying X-Icon-Fallback:1 is the server placeholder the client treats
// as retryable) plus a session-wide same-object repeated-fallback analysis (sha256 object
// id hash only; no raw id, key or query) for the IP-P3 "no cooldown" evidence gap. It never
// reads response bodies.
//
// Usage:
//   node scripts/ordinary-icon-perf-probe.mjs
//
// Target origin + browser defaults come from the git-ignored verify.local.json
// (see verify.local.example.json); admin credentials come from env or that file.
// Environment overrides:
//   PROBE_ROUNDS=3        rounds per viewport (>=2 yields p50/p95/max)
//   PROBE_HEADED=1        run a visible browser (default headless)
//   PROBE_OUTPUT=<path>   JSON report path (default os.tmpdir()/ordinary-icon-probe-baseline.json)
//   PROBE_LOCAL_REF=<ref> local checkout hint recorded in metadata
//   CHROME_EXE=<path>     Chrome executable
//   CHROME_NO_SANDBOX=1   pass --no-sandbox
//
// The report and all logs are redacted: the target origin is replaced with
// [TARGET], query strings (which carry the icon access key) are stripped, and
// credentials are scrubbed. External source URLs are never emitted (hash only).

import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { CdpSession, sleep } from './lib/cdpSession.mjs'
import { resolveBaseUrl, resolveChromeProfileRoot, resolveSetting } from './lib/verifyTarget.mjs'
import { requireAdminCredentials, redactCredentials } from './lib/verifyCredentials.mjs'
import { pageInstallIconPerformanceProbe } from './lib/iconPerformanceProbe.mjs'

const BASE_URL = resolveBaseUrl()
const ORIGIN = new URL(BASE_URL).origin
const TARGET_HOST = new URL(BASE_URL).host
const HOME_URL = `${ORIGIN}/`
const { username: ADMIN_USER, password: ADMIN_PASS } = requireAdminCredentials()

// Fixed debug port, deliberately avoiding 9228/9231 used by sibling tooling.
const DEBUG_PORT = 9240
const ROUNDS = Math.max(1, Number.parseInt(process.env.PROBE_ROUNDS ?? '3', 10) || 3)
const HEADED = process.env.PROBE_HEADED === '1'
const OUTPUT = process.env.PROBE_OUTPUT || path.join(os.tmpdir(), 'ordinary-icon-probe-baseline.json')
const CHROME_EXE = resolveSetting('CHROME_EXE', 'chromeExe', '') ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync) || ''

const PHASES = ['cold_home', 'full_scroll', 'back_to_top', 'rapid_round_trip', 'home_search', 'spotlight']
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 900, mobile: false, scale: 1 },
  { name: 'narrow', width: 390, height: 844, mobile: true, scale: 3 },
]

// Issue #31 verdict thresholds (documented here; never injected into product code).
const IN_FLIGHT_PRESSURE = 24 // simultaneous ordinary icon fetches that would signal "batch startup"
const FRAME_GAP_PRESSURE_MS = 100
const FIRST_VIEW_SLOW_MS = 3000

// ---------------------------------------------------------------------------
// Redaction + classification helpers
// ---------------------------------------------------------------------------

function redact(text) {
  if (typeof text !== 'string' || !text) return text
  let out = redactCredentials(text)
  out = out.split(ORIGIN).join('[TARGET]')
  out = out.split(TARGET_HOST).join('[TARGET]')
  return out
}

function hashUrl(href) {
  return createHash('sha256').update(href).digest('hex').slice(0, 12)
}

function objectIdHash(href) {
  // Hash only the /api/icon/<id> object-id segment; never emit the raw id, the
  // access key, or any query string.
  try {
    const u = new URL(href, ORIGIN)
    if (u.origin !== ORIGIN || !u.pathname.startsWith('/api/icon/')) return null
    const id = u.pathname.slice('/api/icon/'.length)
    return id ? createHash('sha256').update(id).digest('hex').slice(0, 12) : null
  } catch {
    return null
  }
}

function samePath(href) {
  // Same-origin pathname only (query stripped because it carries the access key);
  // anything cross-origin collapses to a placeholder so no external source URL leaks.
  try {
    const u = new URL(href, ORIGIN)
    if (u.origin === ORIGIN) return u.pathname
    return '[external]'
  } catch {
    return '[unparsable]'
  }
}

function classify(href, type) {
  try {
    const u = new URL(href, ORIGIN)
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

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

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

function clampList(arr, n = 50) {
  return arr.slice(0, n)
}

// ---------------------------------------------------------------------------
// CDP network timeline collector (phase-tagged)
// ---------------------------------------------------------------------------

const requestsById = new Map()
let currentPhaseKey = 'boot'

function installNetworkCollector(cdp) {
  cdp.on('Network.requestWillBeSent', (p) => {
    if (requestsById.has(p.requestId)) return // keep first entry across redirect chains
    requestsById.set(p.requestId, {
      requestId: p.requestId,
      url: p.request?.url ?? '',
      type: p.type ?? '',
      phaseKey: currentPhaseKey,
      start: typeof p.timestamp === 'number' ? p.timestamp : null,
      respAt: null,
      end: null,
      status: null,
      xIconFallback: false,
      finished: false,
      failed: false,
      errorText: null,
      canceled: false,
    })
  })
  cdp.on('Network.responseReceived', (p) => {
    const r = requestsById.get(p.requestId)
    if (!r) return
    r.status = p.response?.status ?? null
    r.respAt = typeof p.timestamp === 'number' ? p.timestamp : null
    const headers = p.response?.headers
    if (headers && typeof headers === 'object') {
      let fallbackHeader = null
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === 'x-icon-fallback') { fallbackHeader = headers[name]; break }
      }
      r.xIconFallback = fallbackHeader === '1'
    }
  })
  cdp.on('Network.loadingFinished', (p) => {
    const r = requestsById.get(p.requestId)
    if (!r) return
    r.end = typeof p.timestamp === 'number' ? p.timestamp : null
    r.finished = true
  })
  cdp.on('Network.loadingFailed', (p) => {
    const r = requestsById.get(p.requestId)
    if (!r) return
    r.end = typeof p.timestamp === 'number' ? p.timestamp : null
    r.failed = true
    r.errorText = p.errorText ?? ''
    r.canceled = Boolean(p.canceled)
  })
}

function retryClassOf(r) {
  if (r.status === 408) return '408'
  if (r.status === 429) return '429'
  if (typeof r.status === 'number' && r.status >= 500) return '5xx'
  if (r.failed) {
    const text = (r.errorText || '').toUpperCase()
    if (text.includes('TIMED OUT') || text.includes('TIMEDOUT')) return 'timeout'
    if (text.includes('RESET')) return 'conn_reset'
    return 'fallback'
  }
  return null
}

function inFlightPeak(rows) {
  // Sweep start/end events; open-ended requests (no recorded end) extend to the
  // latest observed timestamp so an unfinished fetch still counts toward concurrency.
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

function computePhaseMetrics(phaseKey, extras) {
  const rows = [...requestsById.values()].filter((r) => r.phaseKey === phaseKey && r.url)
  const categories = {
    ordinary_public: 0, ordinary_private: 0, trusted_copy: 0, iconify: 0,
    external: 0, other_same_origin: 0, other_cross_origin: 0, unparsable: 0,
  }
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

  const bodyMs = ordinary
    .filter((r) => typeof r.respAt === 'number' && typeof r.end === 'number' && r.finished)
    .map((r) => Math.round((r.end - r.respAt) * 1000))

  const retry = { '408': 0, '429': 0, '5xx': 0, timeout: 0, conn_reset: 0, fallback: 0, fallback_200: 0 }
  for (const r of ordinary) {
    const k = retryClassOf(r)
    if (k) retry[k] += 1
    // A 200 carrying X-Icon-Fallback:1 is a server placeholder the client treats as
    // 'retryable'. The network layer never fails, so retryClassOf cannot see it; count it
    // explicitly to close the "ordinary_retry_class.fallback:0 hides 200 fallbacks" gap.
    if (r.status === 200 && r.xIconFallback) retry.fallback_200 += 1
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
    // No ordinary-icon queue exists in the current build, so "element visible -> fetch
    // start" is not separable from the immediate fetch; reported as n/a per the contract.
    ordinary_queue_wait_ms: 'n/a',
    ordinary_body_ms: summarize(bodyMs, false),
    ordinary_duplicate_url: duplicate,
    ordinary_duplicate_url_detail: clampList(repeated.sort((a, b) => b.count - a.count)),
    ordinary_retry_class: retry,
    fallback_200_count: retry.fallback_200,
    first_view_ready_ms: extras.firstViewReadyMs ?? null,
    long_task_or_frame_gap: monitor.longTasks + monitor.frameGaps,
    long_task_detail: monitor,
    console_errors: extras.consoleErrors ?? 0,
    page_exceptions: extras.pageExceptions ?? 0,
    failed_requests: failed.length,
    failed_request_detail: clampList(failed),
    unexpected_http: clampList(unexpected),
    broken_images: extras.brokenImages ?? 0,
    icon_pathname_count: categories.ordinary_public + categories.ordinary_private,
    source_classification: {
      ordinary_public: categories.ordinary_public,
      ordinary_private: categories.ordinary_private,
      trusted_copy: categories.trusted_copy,
      iconify: categories.iconify,
      external: categories.external,
    },
    other_requests: {
      other_same_origin: categories.other_same_origin,
      other_cross_origin: categories.other_cross_origin,
    },
    object_url_probe: extras.objectUrlProbe ?? null,
  }
}

// ---------------------------------------------------------------------------
// Injected page bootstrap (runs on every new document before page scripts)
// ---------------------------------------------------------------------------

function buildBootstrapSource() {
  const probeSource = pageInstallIconPerformanceProbe.toString()
  return `
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
        if (performance.now() - start > 10000) {
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
// Page interactions (all read-only; no bookmark/category mutations, no clicks
// that register visits)
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

async function readBuildId(cdp) {
  return cdp.call(function read() {
    const meta = document.querySelector('meta[name="version"], meta[name="app-version"], meta[name="build"]')
    const candidates = [
      meta && meta.getAttribute('content'),
      typeof window.__APP_VERSION__ !== 'undefined' ? String(window.__APP_VERSION__) : null,
      document.documentElement.getAttribute('data-version'),
    ].filter(Boolean)
    return candidates[0] || null
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

async function readObjectUrlProbe(cdp) {
  return cdp.call(function read() {
    try {
      return window.__iconPerformanceProbe ? window.__iconPerformanceProbe.read() : null
    } catch (e) {
      return null
    }
  })
}

async function scrollToBottom(cdp) {
  return cdp.call(async function scrollDown() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const max = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    for (let y = 0; y <= max(); y += 600) {
      window.scrollTo(0, y)
      await delay(80)
    }
    window.scrollTo(0, max())
    await delay(250)
    return { scrollY: window.scrollY }
  })
}

async function scrollToTop(cdp) {
  return cdp.call(async function scrollUp() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    window.scrollTo(0, 0)
    await delay(250)
    return { scrollY: window.scrollY }
  })
}

async function rapidRoundTrip(cdp) {
  return cdp.call(async function roundTrip() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const max = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    for (let i = 0; i < 3; i += 1) {
      window.scrollTo(0, max())
      await delay(120)
      window.scrollTo(0, 0)
      await delay(120)
    }
    return { cycles: 3 }
  })
}

async function homeSearch(cdp) {
  return cdp.call(async function search() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const input = document.querySelector('.search-card input')
    if (!input) return { ran: false }
    for (const value of ['n', 'np', 'npm']) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await delay(80)
    }
    await delay(300)
    const filteredCards = document.querySelectorAll('.bookmark-card-shell').length
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await delay(250)
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    return { ran: true, filteredCards }
  })
}

async function openAndCloseSpotlight(cdp) {
  return cdp.call(async function spotlight() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
    // Global shortcut: "/" opens Spotlight on the home view (App.handleGlobalKeyDown).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    let panel = null
    for (let i = 0; i < 50; i += 1) {
      panel = document.querySelector('.spotlight-panel')
      if (panel) break
      await delay(100)
    }
    if (!panel) return { opened: false }
    const ready = await window.__measureViewportReady(2500)
    const spotlightIcons = document.querySelectorAll('.spotlight-option-icon img').length
    // Close via the backdrop button (read-only: never selects a result, which would
    // register a visit and therefore mutate production state).
    const backdrop = document.querySelector('.spotlight-backdrop')
    if (backdrop) backdrop.click()
    await delay(250)
    const closed = !document.querySelector('.spotlight-panel')
    return { opened: true, spotlightIcons, closed, ready }
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

// ---------------------------------------------------------------------------
// Round + viewport orchestration
// ---------------------------------------------------------------------------

async function runRound(cdp, viewport, roundIndex) {
  const roundTag = `${viewport.name}:r${roundIndex}`
  const phases = {}

  // cold_home: clear HTTP cache + CacheStorage (auth in localStorage survives), then
  // load the home page fresh and read the auto-measured first-view readiness.
  currentPhaseKey = `${roundTag}:cold_home`
  await coldReset(cdp)
  const consoleBase = cdp.consoleErrors.length
  const excBase = cdp.pageExceptions.length
  await cdp.navigate(HOME_URL, { waitIdleMs: 1500, timeoutMs: 60000 })
  let firstView = null
  for (let i = 0; i < 120; i += 1) {
    firstView = await cdp.call(function read() { return window.__firstView })
    if (firstView) break
    await sleep(100)
  }
  await cdp.waitForNetworkIdle(1500, 30000)
  const coldEnd = await monitorNow(cdp)
  phases.cold_home = computePhaseMetrics(currentPhaseKey, {
    firstViewReadyMs: firstView,
    monitor: await readMonitor(cdp, 0, coldEnd),
    consoleErrors: cdp.consoleErrors.length - consoleBase,
    pageExceptions: cdp.pageExceptions.length - excBase,
    brokenImages: await brokenImages(cdp),
    objectUrlProbe: await readObjectUrlProbe(cdp),
  })
  const observed = await snapshotObserved(cdp)

  const runPhase = async (name, action) => {
    currentPhaseKey = `${roundTag}:${name}`
    const t0 = await monitorNow(cdp)
    const cBase = cdp.consoleErrors.length
    const eBase = cdp.pageExceptions.length
    const actionResult = await action()
    await cdp.waitForNetworkIdle(1200, 20000)
    const genericReady = await cdp.call(function m(timeout) {
      return window.__measureViewportReady(timeout)
    }, 2500)
    const t1 = await monitorNow(cdp)
    phases[name] = computePhaseMetrics(currentPhaseKey, {
      firstViewReadyMs: actionResult && actionResult.ready ? actionResult.ready : genericReady,
      monitor: await readMonitor(cdp, t0, t1),
      consoleErrors: cdp.consoleErrors.length - cBase,
      pageExceptions: cdp.pageExceptions.length - eBase,
      brokenImages: await brokenImages(cdp),
      objectUrlProbe: await readObjectUrlProbe(cdp),
    })
    phases[name].action = actionResult
  }

  await runPhase('full_scroll', () => scrollToBottom(cdp))
  await runPhase('back_to_top', () => scrollToTop(cdp))
  await runPhase('rapid_round_trip', () => rapidRoundTrip(cdp))
  await runPhase('home_search', () => homeSearch(cdp))
  await runPhase('spotlight', () => openAndCloseSpotlight(cdp))

  currentPhaseKey = `${roundTag}:idle`
  const iconPathnameCountTotal = PHASES.reduce((sum, p) => sum + (phases[p]?.icon_pathname_count ?? 0), 0)
  return { roundIndex, cacheState: 'cold', phases, observed, iconPathnameCountTotal }
}

function aggregateViewport(rounds) {
  const perPhase = {}
  for (const phase of PHASES) {
    const countKeys = [
      'ordinary_started', 'ordinary_in_flight_max', 'ordinary_duplicate_url',
      'icon_pathname_count', 'broken_images', 'failed_requests', 'console_errors',
      'page_exceptions', 'long_task_or_frame_gap', 'fallback_200_count',
    ]
    const agg = {}
    for (const key of countKeys) {
      agg[key] = summarize(rounds.map((r) => r.phases[phase]?.[key]).filter((v) => typeof v === 'number'))
    }
    agg.first_view_ready_ms = summarize(
      rounds.map((r) => r.phases[phase]?.first_view_ready_ms?.ms).filter((v) => typeof v === 'number'),
    )
    agg.body_ms_p50 = summarize(rounds.map((r) => r.phases[phase]?.ordinary_body_ms?.p50).filter((v) => typeof v === 'number'))
    agg.body_ms_max = summarize(rounds.map((r) => r.phases[phase]?.ordinary_body_ms?.max).filter((v) => typeof v === 'number'))
    const retry = { '408': 0, '429': 0, '5xx': 0, timeout: 0, conn_reset: 0, fallback: 0, fallback_200: 0 }
    for (const r of rounds) {
      const rc = r.phases[phase]?.ordinary_retry_class
      if (rc) for (const k of Object.keys(retry)) retry[k] += rc[k] || 0
    }
    agg.ordinary_retry_class_total = retry
    perPhase[phase] = agg
  }
  return { perPhase, iconPathnameCountTotal: summarize(rounds.map((r) => r.iconPathnameCountTotal)) }
}

// ---------------------------------------------------------------------------
// Run-level evidence + conclusions
// ---------------------------------------------------------------------------

function collectRunEvidence(cdp) {
  const consoleErrors = cdp.consoleErrors.map((e) => ({ type: e.type, text: redact(e.text) }))
  const pageExceptions = cdp.pageExceptions.map((e) => ({ text: redact(e.text), path: samePath(e.url) }))
  const all = [...requestsById.values()]
  const failedRequests = all
    .filter((r) => r.failed && !(samePath(r.url) === '/' && (r.errorText || '').includes('ERR_FAILED')))
    .map((r) => ({ phase: r.phaseKey, category: classify(r.url, r.type), path: samePath(r.url), errorText: redact(r.errorText || ''), canceled: r.canceled }))
  const unexpectedHttp = all
    .filter((r) => typeof r.status === 'number' && r.status >= 400)
    .map((r) => ({ phase: r.phaseKey, category: classify(r.url, r.type), status: r.status, path: samePath(r.url) }))
  const teardownAborts = all
    .filter((r) => r.failed && samePath(r.url) === '/' && (r.errorText || '').includes('ERR_FAILED')).length
  return { consoleErrors, pageExceptions, failedRequests, unexpectedHttp, teardownAborts }
}

// Session-wide same-object repeated retryable-fallback analysis (IP-P3 evidence gap).
// A "fallback" here is a 200 response carrying X-Icon-Fallback:1 (the server placeholder
// SVG) which the client (responseToIconPayload) classifies as 'retryable'. Object identity
// is the sha256 of the /api/icon/<id> segment only -- raw ids, keys and query strings are
// never emitted. Empty-body 200 fallbacks are also client-retryable but are NOT observable
// from headers (reading bodies is out of scope and a privacy risk), so they are excluded.
function computeFallbackAnalysis() {
  const byObject = new Map()
  let total = 0
  for (const r of requestsById.values()) {
    if (!r.url || !isOrdinary(classify(r.url, r.type))) continue
    if (r.status !== 200 || !r.xIconFallback) continue
    const key = objectIdHash(r.url) || 'unparsable'
    const list = byObject.get(key) || []
    list.push({ at: typeof r.respAt === 'number' ? r.respAt : null, phase: r.phaseKey })
    byObject.set(key, list)
    total += 1
  }

  const distribution = {}
  const perObject = []
  const allIntervals = []
  let maxRepeat = 0
  let objectsWithRepeat = 0
  for (const [objectHash, hits] of byObject) {
    const count = hits.length
    distribution[count] = (distribution[count] || 0) + 1
    maxRepeat = Math.max(maxRepeat, count)
    if (count < 2) continue
    objectsWithRepeat += 1
    const sorted = hits.filter((h) => typeof h.at === 'number').sort((a, b) => a.at - b.at)
    const intervalsMs = []
    for (let i = 1; i < sorted.length; i += 1) intervalsMs.push(Math.round((sorted[i].at - sorted[i - 1].at) * 1000))
    for (const v of intervalsMs) allIntervals.push(v)
    perObject.push({
      objectHash,
      fallback_count: count,
      intervals_ms: intervalsMs,
      min_interval_ms: intervalsMs.length ? Math.min(...intervalsMs) : null,
      phases: [...new Set(hits.map((h) => h.phase))],
    })
  }
  perObject.sort((a, b) => b.fallback_count - a.fallback_count ||
    (a.min_interval_ms ?? Infinity) - (b.min_interval_ms ?? Infinity))

  return {
    definition: '200 + X-Icon-Fallback:1 (server placeholder SVG); client-retryable. Empty-body 200 fallbacks are not header-observable and are excluded.',
    total_fallback_200: total,
    distinct_objects_with_fallback: byObject.size,
    objects_with_repeated_fallback: objectsWithRepeat,
    repeat_count_distribution: distribution,
    max_repeat: maxRepeat,
    repeat_intervals_ms: summarize(allIntervals, false),
    shortest_repeat_interval_ms: allIntervals.length ? Math.min(...allIntervals) : null,
    same_object_repeated_fallback_present: objectsWithRepeat > 0,
    per_object_detail: clampList(perObject),
  }
}

function buildConclusions(report) {
  let inFlightPeak = 0
  let exactDuplicateMax = 0
  let longTaskTotal = 0
  let longTaskMax = 0
  let frameGapMax = 0
  let brokenMax = 0
  let iconTotalMax = 0
  const firstViewByViewport = {}

  for (const [vname, v] of Object.entries(report.viewports)) {
    firstViewByViewport[vname] = v.aggregate.perPhase.cold_home.first_view_ready_ms
    iconTotalMax = Math.max(iconTotalMax, v.aggregate.iconPathnameCountTotal.max ?? 0)
    for (const phase of PHASES) {
      const p = v.aggregate.perPhase[phase]
      inFlightPeak = Math.max(inFlightPeak, p.ordinary_in_flight_max.max ?? 0)
      exactDuplicateMax = Math.max(exactDuplicateMax, p.ordinary_duplicate_url.max ?? 0)
      brokenMax = Math.max(brokenMax, p.broken_images.max ?? 0)
    }
    for (const round of v.rounds) {
      for (const phase of PHASES) {
        const m = round.phases[phase]?.long_task_detail
        if (m) {
          longTaskTotal += m.longTasks
          longTaskMax = Math.max(longTaskMax, m.longTaskMaxMs)
          frameGapMax = Math.max(frameGapMax, m.frameGapMaxMs)
        }
      }
    }
  }

  const consoleErrorCount = report.evidence.consoleErrors.length
  const failedRequestCount = report.evidence.failedRequests.length
  const firstViewDesktop = firstViewByViewport.desktop?.p50 ?? null
  const firstViewNarrow = firstViewByViewport.narrow?.p50 ?? null
  const firstViewWorst = Math.max(firstViewDesktop ?? 0, firstViewNarrow ?? 0)

  const pressure = inFlightPeak >= IN_FLIGHT_PRESSURE
  const jank = longTaskTotal > 0 || frameGapMax >= FRAME_GAP_PRESSURE_MS
  const slow = firstViewWorst >= FIRST_VIEW_SLOW_MS

  let verdict
  let rationale
  if (pressure && (jank || slow)) {
    verdict = 'reproducible'
    rationale = `ordinary in-flight peak ${inFlightPeak} >= ${IN_FLIGHT_PRESSURE}` +
      ` with ${jank ? `jank (long tasks=${longTaskTotal}, max frame gap=${frameGapMax}ms)` : ''}` +
      `${jank && slow ? ' and ' : ''}${slow ? `slow first-view (${firstViewWorst}ms)` : ''}.`
  } else if (!pressure && !jank && !slow && brokenMax === 0 && failedRequestCount === 0) {
    verdict = 'not-reproducible'
    rationale = `ordinary in-flight peak ${inFlightPeak} < ${IN_FLIGHT_PRESSURE}; long tasks=${longTaskTotal},` +
      ` max frame gap=${frameGapMax}ms, worst cold first-view median=${firstViewWorst}ms,` +
      ` broken images=${brokenMax}, failed first-party requests=${failedRequestCount}.`
  } else {
    verdict = 'insufficient-evidence'
    rationale = `mixed signals: in-flight peak ${inFlightPeak} (threshold ${IN_FLIGHT_PRESSURE}),` +
      ` long tasks=${longTaskTotal}, max frame gap=${frameGapMax}ms,` +
      ` worst cold first-view median=${firstViewWorst}ms, broken images=${brokenMax}, failed=${failedRequestCount}.`
  }
  const fb = report.fallbackAnalysis || {}
  let ipP3Verdict
  if ((fb.total_fallback_200 ?? 0) === 0) {
    ipP3Verdict = 'no retryable fallback observed on the live build; IP-P3 cooldown has no measured trigger (do not add cooldown code without a trigger).'
  } else if (fb.same_object_repeated_fallback_present) {
    ipP3Verdict = `same-object repeated retryable fallback observed: ${fb.objects_with_repeated_fallback} object(s), max_repeat=${fb.max_repeat}, shortest interval=${fb.shortest_repeat_interval_ms}ms. IP-P3 cooldown has a measured trigger.`
  } else {
    ipP3Verdict = `retryable 200 fallbacks present (${fb.total_fallback_200}) but no single object fell back >=2x; short-window repeat not reproduced on this build.`
  }

  return {
    icon_pathname_count_max_round_total: iconTotalMax,
    c5_budget: 260,
    within_c5_budget: iconTotalMax <= 260,
    ordinary_in_flight_peak: inFlightPeak,
    ordinary_exact_duplicate_max: exactDuplicateMax,
    first_view_ready_median_ms: { desktop: firstViewDesktop, narrow: firstViewNarrow },
    long_task_total: longTaskTotal,
    long_task_max_ms: longTaskMax,
    frame_gap_max_ms: frameGapMax,
    broken_images_max: brokenMax,
    console_error_count: consoleErrorCount,
    failed_request_count: failedRequestCount,
    issue_31_verdict: verdict,
    rationale,
    fallback_200_total: report.fallbackAnalysis?.total_fallback_200 ?? 0,
    same_object_repeated_fallback: {
      present: report.fallbackAnalysis?.same_object_repeated_fallback_present ?? false,
      objects_with_repeat: report.fallbackAnalysis?.objects_with_repeated_fallback ?? 0,
      max_repeat: report.fallbackAnalysis?.max_repeat ?? 0,
      shortest_interval_ms: report.fallbackAnalysis?.shortest_repeat_interval_ms ?? null,
      repeat_count_distribution: report.fallbackAnalysis?.repeat_count_distribution ?? {},
    },
    ip_p3_cooldown_evidence: ipP3Verdict,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!CHROME_EXE || !existsSync(CHROME_EXE)) {
    console.error('Chrome executable not found. Set CHROME_EXE or chromeExe in verify.local.json.')
    process.exit(2)
  }

  const runId = randomBytes(4).toString('hex')
  const profile = path.join(resolveChromeProfileRoot(), `cf-navs-chrome-profile-ordinary-icon-${runId}`)
  const cdp = new CdpSession({
    chromeExe: CHROME_EXE,
    debugPort: DEBUG_PORT,
    userDataDir: profile,
    headless: !HEADED,
    noSandbox: process.env.CHROME_NO_SANDBOX === '1',
  })

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString().slice(0, 10),
    generatedAtFull: new Date().toISOString(),
    runMetadata: {
      target: '[TARGET]',
      deployedBuildId: null,
      localCheckout: process.env.PROBE_LOCAL_REF || null,
      loginState: 'authenticated-admin',
      cacheState: 'cold-per-round',
      rounds: ROUNDS,
      chrome: { debugPort: DEBUG_PORT, profileName: path.basename(profile), headless: !HEADED },
      viewports: VIEWPORTS.map((v) => ({ name: v.name, width: v.width, height: v.height, mobile: v.mobile })),
      contractSchema: 'ICON_REQUEST_PERFORMANCE IP-P1 shared redacted metrics',
      thresholds: { inFlightPressure: IN_FLIGHT_PRESSURE, frameGapPressureMs: FRAME_GAP_PRESSURE_MS, firstViewSlowMs: FIRST_VIEW_SLOW_MS },
    },
    viewports: {},
    evidence: null,
    fallbackAnalysis: null,
    conclusions: null,
    cleanup: null,
  }

  let cleanupOutcome = null
  try {
    await cdp.start()
    await cdp.attach()
    installNetworkCollector(cdp)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: buildBootstrapSource() })

    currentPhaseKey = 'boot'
    await cdp.navigate(HOME_URL, { waitIdleMs: 1200, timeoutMs: 60000 })
    const auth = await login(cdp)
    if (!auth || !auth.ok) throw new Error('login failed (check admin credentials / public_mode)')
    report.runMetadata.deployedBuildId = await readBuildId(cdp)

    for (const viewport of VIEWPORTS) {
      await cdp.setViewport({ width: viewport.width, height: viewport.height, mobile: viewport.mobile, scale: viewport.scale })
      const rounds = []
      let observed = null
      for (let r = 1; r <= ROUNDS; r += 1) {
        const round = await runRound(cdp, viewport, r)
        rounds.push({
          roundIndex: round.roundIndex,
          cacheState: round.cacheState,
          phases: round.phases,
          iconPathnameCountTotal: round.iconPathnameCountTotal,
        })
        if (r === 1) observed = round.observed
      }

      const r1Rows = [...requestsById.values()].filter((x) => x.phaseKey.startsWith(`${viewport.name}:r1:`) && x.url)
      const r1Ordinary = r1Rows.filter((x) => isOrdinary(classify(x.url, x.type)))
      const pub = new Set()
      const priv = new Set()
      for (const x of r1Ordinary) {
        (classify(x.url, x.type) === 'ordinary_private' ? priv : pub).add(x.url)
      }

      report.viewports[viewport.name] = {
        viewport: { width: viewport.width, height: viewport.height, mobile: viewport.mobile },
        observed: {
          ...observed,
          uniqueOrdinaryProxyUrls: new Set(r1Ordinary.map((x) => x.url)).size,
          ordinaryPublicUrls: pub.size,
          ordinaryPrivateUrls: priv.size,
        },
        rounds,
        aggregate: aggregateViewport(rounds),
      }
      currentPhaseKey = 'between-viewports'
    }

    currentPhaseKey = 'done'
    report.evidence = collectRunEvidence(cdp)
    report.fallbackAnalysis = computeFallbackAnalysis()
    report.conclusions = buildConclusions(report)
  } finally {
    cleanupOutcome = await cdp.cleanup()
    for (const warning of cleanupOutcome.warnings) console.error('cleanup warning:', redact(warning))
    if (cleanupOutcome.errors.length) console.error('cleanup errors:', cleanupOutcome.errors.map(redact).join('; '))
  }

  report.cleanup = cleanupOutcome
  await writeFile(OUTPUT, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ output: OUTPUT, conclusions: report.conclusions, fallbackAnalysis: report.fallbackAnalysis, cleanup: cleanupOutcome }, null, 2))
}

main().catch((error) => {
  console.error(redact(String(error && error.stack ? error.stack : error)))
  process.exit(1)
})
