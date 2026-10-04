// Local-only native IndexedDB integration checks. Never reads a production target or credentials.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { build } from 'vite'
import { CdpSession } from './lib/cdpSession.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const id = randomUUID().slice(0, 8)
const profile = path.join(os.tmpdir(), 'cf-navs-chrome-profile-is-' + id)
const output = path.join(os.tmpdir(), 'cf-navs-icon-storage-' + id + '.json')
const chromeExe = process.env.CHROME_EXE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync)
if (!chromeExe) throw new Error('Set CHROME_EXE to a Chrome executable')
if (existsSync(profile) || path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir())) throw new Error('Profile must be a new direct child of the temp directory')
const portProbe = net.createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const debugPort = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, emptyOutDir: false, minify: false,
  lib: { entry: path.join(root, 'src/lib/iconCopyStorage.ts'), name: 'CFNavsIconStorage', formats: ['iife'] } } })
const bundle = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk').code
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  if (request.url === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle) }
  else if (request.url === '/favicon.ico') { response.writeHead(204); response.end() }
  else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Isolated icon storage checks</title><script src="/bundle.js"></script>') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = 'http://127.0.0.1:' + server.address().port
const primary = new CdpSession({ chromeExe, debugPort, userDataDir: profile, headless: true })
const secondary = new CdpSession({ chromeExe, debugPort, userDataDir: profile, headless: true, allowExisting: true })
const report = { scenario: 'native IndexedDB icon storage', checks: [], ownership: { profile, debugPort, targets: [] }, cleanup: {}, errors: [] }
const check = (name, value) => { report.checks.push({ name, passed: Boolean(value) }); assert.ok(value, name); console.log('PASS ' + name) }
async function callLong(session, fn, timeoutMs, ...args) {
  const expression = `(${fn.toString()})(${args.map(arg => JSON.stringify(arg)).join(', ')})`
  const result = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs)
  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    throw new Error(details.exception?.description ?? details.text ?? 'page evaluation failed')
  }
  return result.result?.value
}
async function initialize(session) {
  await session.navigate(url)
  return session.call(async function () {
    globalThis.metrics = {}
    globalThis.store = CFNavsIconStorage.createIconCopyStorage()
    globalThis.lease = { scope: 'a'.repeat(32) + ':' + 'b'.repeat(64), generation: 'initial' }
    globalThis.allow = () => true
    globalThis.image = (size = 128) => new Blob(['<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(size - 46) + '</svg>'], { type: 'image/svg+xml' })
    globalThis.descriptor = id => ({ object_type: 'bookmark', object_id: id, dataset_epoch: lease.scope.split(':')[0], write_epoch: 0, state: 'ready', content_revision: 'sha256-' + 'c'.repeat(64) })
    globalThis.reset = async () => {
      const old = await store.state()
      if (old) await store.clear(old)
      lease = { ...lease, generation: crypto.randomUUID() }
      await store.activate(lease, allow, old)
    }
    return typeof indexedDB !== 'undefined'
  })
}
try {
  await primary.start()
  report.ownership.pid = primary.chromeProcess?.pid
  report.ownership.browserStartedByTest = primary.startedByTest
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  await primary.attach()
  report.ownership.targets.push(primary.targetId)
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  check('native IndexedDB is available', await initialize(primary))
  check('save, reload and close preserve one durable body', await primary.call(async function () {
    await reset(); await store.put(lease, descriptor(1), image(), allow)
    const saved = await store.state()
    await store.close(); store = CFNavsIconStorage.createIconCopyStorage()
    const hit = await store.read(lease, 'bookmark', 1, allow)
    return hit?.blob.size === 128 && saved.entries === 1 && saved.bodyBytes === 128
  }))
  const beforeReload = await primary.call(async function () { await store.close(); return lease })
  await initialize(primary)
  check('new document restores IndexedDB rather than page memory', await primary.call(async function (savedLease) {
    lease = savedLease
    return (await store.read(lease, 'bookmark', 1, allow))?.blob.size === 128
  }, beforeReload))
  await primary.setOffline(true)
  try {
    check('a new storage instance reads the trusted body while browser networking is offline', await primary.call(async function (savedLease) {
      lease = savedLease
      await store.close()
      store = CFNavsIconStorage.createIconCopyStorage()
      const hit = await store.read(lease, 'bookmark', 1, allow)
      return navigator.onLine === false && hit?.blob.size === 128
    }, beforeReload))
  } finally {
    await primary.setOffline(false)
  }
  check('a caller cannot change the stored descriptor during an asynchronous write', await primary.call(async function () {
    const value = descriptor(3)
    const pending = store.put(lease, value, image(), allow)
    value.object_id = 999
    await pending
    const hit = await store.read(lease, 'bookmark', 3, allow)
    await store.remove(lease, 'bookmark:3', allow)
    return hit?.entry.descriptor.object_id === 3
  }))
  check('normal hits do not scan all metadata or image bodies', await primary.call(async function () {
    const original = IDBObjectStore.prototype.getAll
    let scans = 0
    try {
      IDBObjectStore.prototype.getAll = function (...args) { scans++; return original.apply(this, args) }
      for (let i = 0; i < 10; i++) await store.read(lease, 'bookmark', 1, allow)
      await store.flushTouches()
      metrics.warmReads = { reads: 10, fullScans: scans }
      return scans === 0
    } finally { IDBObjectStore.prototype.getAll = original }
  }))
  check('storage refusal degrades with a typed error', await primary.call(async function () {
    const unavailable = CFNavsIconStorage.createIconCopyStorage({ factory: { open() { throw new DOMException('Injected denial', 'SecurityError') } } })
    try { await unavailable.state(); return false } catch (error) { return error.reason === 'unavailable' } finally { await unavailable.close() }
  }))
  check('failure after body write atomically restores the previous entry', await primary.call(async function () {
    const old = await store.state()
    const original = IDBObjectStore.prototype.put
    let rejected = false
    try {
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'entries') throw new DOMException('Injected quota', 'QuotaExceededError'); return original.apply(this, args) }
      await store.put(lease, descriptor(1), image(256), allow)
    } catch (error) { rejected = error.reason === 'quota' }
    finally { IDBObjectStore.prototype.put = original }
    const hit = await store.read(lease, 'bookmark', 1, allow)
    const current = await store.state()
    return rejected && hit?.blob.size === 128 && current.bodyBytes === old.bodyBytes && current.indexBytes === old.indexBytes
  }))
  check('revocation during a transaction aborts all its writes', await primary.call(async function () {
    const original = IDBObjectStore.prototype.put
    let live = true; let rejected = false
    try {
      IDBObjectStore.prototype.put = function (...args) { const request = original.apply(this, args); if (this.name === 'bodies') live = false; return request }
      await store.put(lease, descriptor(2), image(), () => live)
    } catch (error) { rejected = error.reason === 'stale' }
    finally { IDBObjectStore.prototype.put = original }
    return rejected && (await store.read(lease, 'bookmark', 2, allow)) === null && (await store.state()).entries === 1
  }))
  check('single missing body is repaired without deleting healthy icons', await primary.call(async function () {
    await store.put(lease, descriptor(2), image(), allow)
    const request = indexedDB.open(CFNavsIconStorage.ICON_COPY_DATABASE)
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction('bodies', 'readwrite'); tx.objectStore('bodies').delete('bookmark:1')
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject })
    } finally { db.close() }
    const missing = await store.read(lease, 'bookmark', 1, allow)
    const healthy = await store.read(lease, 'bookmark', 2, allow)
    return missing === null && healthy?.blob.size === 128 && (await store.state()).entries === 1
  }))
  check('10 MiB high water evicts to 8 MiB using LRU', await primary.call(async function () {
    await reset()
    for (let id = 1; id <= 20; id++) await store.put(lease, descriptor(id), image(512 * 1024), allow)
    const stats = await store.state()
    metrics.bodyHighWater = { bodyBytes: stats.bodyBytes, entries: stats.entries, indexBytes: stats.indexBytes }
    return stats.bodyBytes === 8 * 1024 * 1024 && stats.entries === 16 && (await store.read(lease, 'bookmark', 1, allow)) === null
  }))
  check('all-pinned quota failure retains existing successful images', await primary.call(async function () {
    await reset()
    for (let id = 1; id <= 19; id++) await store.put(lease, descriptor(id), image(512 * 1024), allow)
    let refused = false
    try { await store.put(lease, descriptor(20), image(512 * 1024), allow, new Set(Array.from({ length: 19 }, (_, i) => 'bookmark:' + (i + 1)))) } catch (error) { refused = error.reason === 'quota' }
    return refused && (await store.state()).entries === 19 && Boolean(await store.read(lease, 'bookmark', 1, allow))
  }))
  check('bookmark and category IDs share capacity, not identity', await primary.call(async function () {
    await reset()
    for (let id = 1; id <= 1000; id++) await store.put(lease, descriptor(id), image(), allow)
    const category = { ...descriptor(1), object_type: 'category' }
    await store.put(lease, category, image(256), allow)
    const stats = await store.state()
    metrics.jointBudget = { bodyBytes: stats.bodyBytes, entries: stats.entries, indexBytes: stats.indexBytes }
    return stats.entries === 1000 && stats.indexBytes <= 512 * 1024 && (await store.read(lease, 'category', 1, allow))?.blob.size === 256 && (await store.read(lease, 'bookmark', 2, allow))?.blob.size === 128
  }))
  const scaleAudit = []
  const scaleResponseStart = primary.responses.length
  const scaleFailureStart = primary.failedRequests.length
  for (const count of [100, 500, 1000]) {
    const result = await callLong(primary, async function (count) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="blue"/></svg>'
      const body = new Blob([svg], { type: 'image/svg+xml' })
      const percentile = (values, value) => [...values].sort((a, b) => a - b)[Math.ceil(value * values.length) - 1]
      await reset()
      const writeStarted = performance.now()
      for (let id = 1; id <= count; id++) {
        await store.put(lease, descriptor(id), body, allow)
      }
      await store.flushTouches()
      const fixtureWriteMs = performance.now() - writeStarted
      const fixture = await store.state()
      let fullScans = 0
      let peakObjectUrls = 0
      const originalGet = IDBObjectStore.prototype.get
      const originalGetAll = IDBObjectStore.prototype.getAll
      const originalGetAllKeys = IDBObjectStore.prototype.getAllKeys
      let getCount = 0
      let activeObjectUrls = 0
      let firstBatchSample
      let fullDatasetSweep

      try {
        IDBObjectStore.prototype.get = function (...args) {
          getCount += 1
          return originalGet.apply(this, args)
        }
        IDBObjectStore.prototype.getAll = function (...args) {
          fullScans += 1
          return originalGetAll.apply(this, args)
        }
        IDBObjectStore.prototype.getAllKeys = function (...args) {
          fullScans += 1
          return originalGetAllKeys.apply(this, args)
        }

        const measureReads = async sampleCount => {
          const durationsMs = []
          const readOperations = []
          const decodedPerRound = []
          for (let round = 0; round < 5; round++) {
            let cursor = 1
            let decoded = 0
            const getsBefore = getCount
            const started = performance.now()
            await Promise.all(Array.from({ length: Math.min(4, sampleCount) }, async () => {
              while (true) {
                const id = cursor++
                if (id > sampleCount) return
                const hit = await store.read(lease, 'bookmark', id, allow)
                if (!hit) throw new Error(`Missing warmed icon ${id}/${count}`)
                const objectUrl = URL.createObjectURL(hit.blob)
                activeObjectUrls += 1
                peakObjectUrls = Math.max(peakObjectUrls, activeObjectUrls)
                try {
                  const imageElement = new Image()
                  imageElement.src = objectUrl
                  await imageElement.decode()
                  decoded += 1
                } finally {
                  URL.revokeObjectURL(objectUrl)
                  activeObjectUrls -= 1
                }
              }
            }))
            durationsMs.push(performance.now() - started)
            readOperations.push(getCount - getsBefore)
            decodedPerRound.push(decoded)
            await store.flushTouches()
          }
          return {
            rounds: durationsMs.length,
            timesMs: {
              median: Number(percentile(durationsMs, 0.5).toFixed(2)),
              p95: Number(percentile(durationsMs, 0.95).toFixed(2)),
              max: Number(Math.max(...durationsMs).toFixed(2)),
              samples: durationsMs.map(value => Number(value.toFixed(2))),
            },
            idbGetOperationsPerRound: readOperations,
            decodedPerRound,
          }
        }
        firstBatchSample = await measureReads(Math.min(20, count))
        fullDatasetSweep = await measureReads(count)
      } finally {
        IDBObjectStore.prototype.get = originalGet
        IDBObjectStore.prototype.getAll = originalGetAll
        IDBObjectStore.prototype.getAllKeys = originalGetAllKeys
      }

      return {
        entries: count,
        fixtureWriteMs: Number(fixtureWriteMs.toFixed(2)),
        firstBatchSample,
        fullDatasetSweep,
        metadataFullScans: fullScans,
        peakObjectUrls,
        bodyBytes: fixture?.bodyBytes ?? null,
        indexBytes: fixture?.indexBytes ?? null,
        d1Queries: 'not measured by this storage-only harness',
      }
    }, 120000, count)
    scaleAudit.push(result)
    check(`${result.entries} entry fixture decodes its first batch across five rounds`, result.firstBatchSample.rounds === 5 && result.firstBatchSample.decodedPerRound.every(count => count === Math.min(20, result.entries)))
    check(`${result.entries} warmed icon bodies decode in full-set stress rounds`, result.fullDatasetSweep.rounds === 5 && result.fullDatasetSweep.decodedPerRound.every(count => count === result.entries))
    check(`${result.entries} scale reads avoid metadata scans and stay within joint budgets`, result.metadataFullScans === 0 && result.peakObjectUrls <= 4 && result.bodyBytes <= 10 * 1024 * 1024 && result.entries <= 1000 && result.indexBytes <= 512 * 1024)
  }
  const jointScale = await callLong(primary, async function () {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="purple"/></svg>'
    const body = new Blob([svg], { type: 'image/svg+xml' })
    const items = [
      ...Array.from({ length: 100 }, (_, index) => ({ object_type: 'bookmark', object_id: index + 1 })),
      ...Array.from({ length: 30 }, (_, index) => ({ object_type: 'category', object_id: index + 1 })),
    ]
    const originalGet = IDBObjectStore.prototype.get
    const originalGetAll = IDBObjectStore.prototype.getAll
    const originalGetAllKeys = IDBObjectStore.prototype.getAllKeys
    let getCount = 0
    let fullScans = 0
    let peakObjectUrls = 0
    let activeObjectUrls = 0
    await reset()
    for (const item of items) await store.put(lease, { ...descriptor(item.object_id), object_type: item.object_type }, body, allow)
    await store.flushTouches()
    try {
      IDBObjectStore.prototype.get = function (...args) { getCount += 1; return originalGet.apply(this, args) }
      IDBObjectStore.prototype.getAll = function (...args) { fullScans += 1; return originalGetAll.apply(this, args) }
      IDBObjectStore.prototype.getAllKeys = function (...args) { fullScans += 1; return originalGetAllKeys.apply(this, args) }
      const rounds = []
      for (let round = 0; round < 5; round += 1) {
        const getsBefore = getCount
        const started = performance.now()
        let cursor = 0
        await Promise.all(Array.from({ length: 4 }, async () => {
          while (true) {
            const item = items[cursor++]
            if (!item) return
            const hit = await store.read(lease, item.object_type, item.object_id, allow)
            if (!hit) throw new Error(`Missing joint icon ${item.object_type}:${item.object_id}`)
            const objectUrl = URL.createObjectURL(hit.blob)
            activeObjectUrls += 1
            peakObjectUrls = Math.max(peakObjectUrls, activeObjectUrls)
            try {
              const imageElement = new Image()
              imageElement.src = objectUrl
              await imageElement.decode()
            } finally {
              URL.revokeObjectURL(objectUrl)
              activeObjectUrls -= 1
            }
          }
        }))
        rounds.push({ durationMs: Number((performance.now() - started).toFixed(2)), idbGets: getCount - getsBefore })
        await store.flushTouches()
      }
      const state = await store.state()
      return { entries: state.entries, bodyBytes: state.bodyBytes, indexBytes: state.indexBytes, rounds, fullScans, peakObjectUrls }
    } finally {
      IDBObjectStore.prototype.get = originalGet
      IDBObjectStore.prototype.getAll = originalGetAll
      IDBObjectStore.prototype.getAllKeys = originalGetAllKeys
    }
  }, 120000)
  report.jointScale = jointScale
  check('100 bookmarks plus 30 categories share the joint storage budget', jointScale.entries === 130 && jointScale.bodyBytes <= 10 * 1024 * 1024 && jointScale.indexBytes <= 512 * 1024)
  check('joint bookmark/category reads decode five rounds without metadata scans', jointScale.rounds.length === 5 && jointScale.rounds.every(round => round.idbGets >= 130) && jointScale.fullScans === 0 && jointScale.peakObjectUrls <= 4)
  const scaleIconRequests = [
    ...primary.responses.slice(scaleResponseStart),
    ...primary.failedRequests.slice(scaleFailureStart),
  ].filter(item => {
    try {
      const pathname = new URL(item.url).pathname
      return pathname === '/api/icon-local-copy' || /^\/api\/icon\/\d+$/.test(pathname)
    } catch { return false }
  })
  for (const result of scaleAudit) result.iconBodyNetworkRequests = scaleIconRequests.length
  report.metrics = { ...(await primary.call(function () { return metrics })), scaleAudit }
  // Reuse only the browser created and recorded above, never an existing user browser.
  assert.equal(primary.startedByTest, true)
  assert.equal(primary.chromeProcess.exitCode, null)
  await primary.send('Browser.getVersion')
  await secondary.start(); await secondary.attach(); report.ownership.targets.push(secondary.targetId)
  await writeFile(output + '.ownership.json', JSON.stringify(report.ownership, null, 2))
  await initialize(secondary)
  const sharedLease = await primary.call(async function () { await reset(); return lease })
  await secondary.call(function (value) { lease = value }, sharedLease)
  const writes = primary.call(async function () { return Promise.allSettled(Array.from({ length: 40 }, (_, i) => store.put(lease, descriptor(i + 1), image(), allow))) })
  await secondary.call(async function () { await store.clear(lease) })
  await writes
  check('two tabs serialize cleanup with pending writes and reject resurrection', await primary.call(async function () {
    const state = await store.state()
    let rejected = false
    try { await store.put(lease, descriptor(99), image(), allow) } catch (error) { rejected = error.reason === 'stale' }
    let reopeningRejected = false
    try { await store.activate(lease, allow) } catch (error) { reopeningRejected = error.reason === 'stale' }
    return !state.enabled && state.entries === 0 && state.bodyBytes === 0 && rejected && reopeningRejected
  }))
  check('late activation cannot reopen a previous session over a new one', await primary.call(async function () {
    const previous = await store.state()
    const next = { scope: 'd'.repeat(32) + ':' + 'e'.repeat(64), generation: 'new-session' }
    await store.activate(next, allow, previous)
    let rejected = false
    try { await store.activate(lease, allow) } catch (error) { rejected = error.reason === 'stale' }
    return rejected && (await store.state()).scope === next.scope
  }))
  check('durable logout blocks the same session even if an old tab rewrites its preference', await primary.call(async function () {
    const control = await store.state()
    await store.clear(control, true)
    let rejected = false
    try { await store.activate({ scope: control.scope, generation: 'stale-tab-new-generation' }, allow, control) } catch (error) { rejected = error.reason === 'stale' }
    return rejected && !(await store.state()).enabled && (await store.state()).entries === 0
  }))
  check('no duplicate body in localStorage or Cache Storage', await primary.call(async function () { return localStorage.length === 0 && (await caches.keys()).length === 0 }))
} catch (error) {
  report.errors.push(error.stack || error.message)
  process.exitCode = 1
} finally {
  for (const session of [secondary, primary]) {
    if (session.ws) await session.call(async function () { await globalThis.store?.close() }).catch(() => undefined)
  }
  report.evidence = { consoleErrors: [...primary.consoleErrors, ...secondary.consoleErrors], pageExceptions: [...primary.pageExceptions, ...secondary.pageExceptions], failedRequests: [...primary.failedRequests, ...secondary.failedRequests], unexpectedHttp: [...primary.responses, ...secondary.responses].filter(item => item.status >= 400) }
  report.cleanup.secondary = await secondary.cleanup()
  report.cleanup.primary = await primary.cleanup()
  await new Promise(resolve => server.close(resolve))
  for (const result of Object.values(report.cleanup)) if (result.errors.length || result.warnings.length) process.exitCode = 1
  if (!report.cleanup.primary.profileRemoved || Object.values(report.evidence).some(items => items.length)) process.exitCode = 1
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ passed: report.checks.filter(item => item.passed).length, total: report.checks.length, errors: report.errors, evidence: report.evidence, cleanup: report.cleanup, output }, null, 2))
}
