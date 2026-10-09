// Read-only measurements in the dedicated test document. Product operations
// remain driven by actual UI; no loader/store methods are called here.
export function pageInstallIconPerformanceProbe() {
  if (window.__iconPerformanceProbe) throw new Error('Performance probe already installed')
  const original = { decode: HTMLImageElement.prototype.decode, create: URL.createObjectURL, revoke: URL.revokeObjectURL }
  const live = new Set(), durations = []
  let created = 0, revoked = 0, peak = 0, rejected = 0, restored = false
  function create(value) {
    const url = original.create.call(URL, value)
    if (value instanceof Blob && value.type.startsWith('image/')) { live.add(url); created++; peak = Math.max(peak, live.size) }
    return url
  }
  function revoke(url) { if (live.delete(url)) revoked++; return original.revoke.call(URL, url) }
  function decode(...args) {
    const started = performance.now(), measured = !this.isConnected
    const result = original.decode.apply(this, args)
    if (!measured) return result // Exclude the connected pixel oracle's decode calls.
    return result.then(value => { durations.push(performance.now() - started); return value }, error => { rejected++; throw error })
  }
  URL.createObjectURL = create; URL.revokeObjectURL = revoke; HTMLImageElement.prototype.decode = decode
  window.__iconPerformanceProbe = {
    read() {
      const sorted = [...durations].sort((a, b) => a - b)
      const referenced = new Set([...document.images].map(image => image.currentSrc || image.src).filter(url => live.has(url)))
      for (const element of document.querySelectorAll('[style*="blob:"]')) for (const url of live) if (element.getAttribute('style').includes(url)) referenced.add(url)
      return { explicitDecodeCalls: durations.length, explicitDecodeMs: durations.reduce((a, b) => a + b, 0),
        explicitDecodeP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null,
        decodeRejected: rejected, imageUrlsCreated: created, imageUrlsRevoked: revoked, liveImageUrls: live.size, peakImageUrls: peak,
        referencedImageUrls: referenced.size, unreferencedImageUrls: live.size - referenced.size }
    },
    restore() {
      if (restored) return
      if (URL.createObjectURL !== create || URL.revokeObjectURL !== revoke || HTMLImageElement.prototype.decode !== decode) throw new Error('Performance probe ownership changed')
      URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; HTMLImageElement.prototype.decode = original.decode
      live.clear(); restored = true
    },
  }
}

export async function pageReadIconStorageAudit(sourcePrefixes = []) {
  const name = 'cf-navs-object-icons-v1'
  if (!(await indexedDB.databases()).some(db => db.name === name)) return { available: false }
  const opening = indexedDB.open(name)
  const db = await new Promise((resolve, reject) => {
    opening.onupgradeneeded = () => { opening.transaction.abort(); reject(new Error('Audit database disappeared')) }
    opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error)
  })
  let result
  try {
    const tx = db.transaction(['control', 'entries', 'bodies'], 'readonly')
    const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error) })
    const read = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const [[control, entries, bodyKeys, bodies]] = await Promise.all([Promise.all([
      read(tx.objectStore('control').get('active')), read(tx.objectStore('entries').getAll()),
      read(tx.objectStore('bodies').getAllKeys()), read(tx.objectStore('bodies').getAll()),
    ]), done])
    const bodyMap = new Map(bodyKeys.map((key, index) => [key, bodies[index]])), entryKeys = new Set(entries.map(entry => entry.key))
    let bodyBytes = 0, invalidBodies = 0, invalidEntries = 0, indexBytes = 4096
    for (const body of bodies) { if (body instanceof Blob) bodyBytes += body.size; else invalidBodies++ }
    for (const entry of entries) {
      const bytes = new TextEncoder().encode(JSON.stringify(entry)).byteLength, body = bodyMap.get(entry.key), d = entry.descriptor
      indexBytes += bytes
      if (!(body instanceof Blob) || body.size !== entry.byte_length || body.size > 512 * 1024 || body.type !== entry.mime || !entry.mime?.startsWith('image/') || bytes !== entry.metadata_bytes ||
          entry.generation !== control?.generation || !control?.scope?.startsWith(d?.dataset_epoch + ':') ||
          entry.key !== d?.object_type + ':' + d?.object_id || !['bookmark','category'].includes(d?.object_type) || d?.state !== 'ready' || !/^sha256-[a-f0-9]{64}$/.test(d?.content_revision ?? '')) invalidEntries++
    }
    result = { available: true, enabled: control?.enabled === true, entries: entries.length, bodies: bodies.length, bodyBytes, indexBytes,
      declaredEntries: control?.entries, declaredBodyBytes: control?.bodyBytes, declaredIndexBytes: control?.indexBytes,
      orphanBodies: bodyKeys.filter(key => !entryKeys.has(key)).length, invalidBodies, invalidEntries }
  } finally { db.close() }
  let localStorageBytes = 0, duplicateSourceCount = 0
  for (const key of Object.keys(localStorage)) {
    const value = localStorage.getItem(key) ?? ''
    localStorageBytes += new TextEncoder().encode(key + value).byteLength
    if (sourcePrefixes.some(prefix => value.includes(prefix))) duplicateSourceCount++
  }
  const names = await caches.keys()
  let knownCacheBytes = 0, opaqueEntries = 0, cacheEntries = 0
  for (const name of names) for (const response of await (await caches.open(name)).matchAll()) {
    cacheEntries++
    if (response.type === 'opaque') opaqueEntries++
    else knownCacheBytes += (await response.arrayBuffer()).byteLength
  }
  return { ...result, localStorageBytes, duplicateSourceCount,
    cacheStorage: { stores: names.length, entries: cacheEntries, knownBytes: knownCacheBytes, opaqueEntries, totalBytes: opaqueEntries ? null : knownCacheBytes } }
}

// Independent acceptance limits from the approved storage contract, not values
// imported from the implementation being checked.
export function assessIconStorageAudit(value) {
  const errors = []
  if (value?.available !== true || value.enabled !== true) errors.push('storage-unavailable')
  if (![value?.entries, value?.bodies, value?.bodyBytes, value?.indexBytes].every(n => Number.isSafeInteger(n) && n >= 0) || value?.indexBytes < 4096) errors.push('invalid-measurement')
  if (value?.entries !== value?.bodies || value?.entries !== value?.declaredEntries || value?.bodyBytes !== value?.declaredBodyBytes || value?.indexBytes !== value?.declaredIndexBytes) errors.push('totals-mismatch')
  if (value?.orphanBodies !== 0 || value?.invalidBodies !== 0 || value?.invalidEntries !== 0) errors.push('invalid-records')
  if (value?.bodyBytes > 10 * 1024 * 1024 || value?.entries > 1000 || value?.indexBytes > 512 * 1024) errors.push('budget-exceeded')
  if (value?.duplicateSourceCount !== 0) errors.push('duplicate-image-in-local-storage')
  return { passed: errors.length === 0, errors }
}

export function summarizeIconPerformanceRequests(rows) {
  const groups = {}
  for (const row of rows) {
    if (row.kind === 'local-image') continue
    const kind = row.resourceRole === 'site-background' ? 'background' : row.path === '/api/data/version' ? 'version' :
      ['/api/admin/data', '/api/public/data'].includes(row.path) ? 'aggregate' : row.path === '/api/icon-access' ? 'grant' : row.kind
    const group = groups[kind] ??= { requests: 0, completed: 0, redirects: 0, failed: 0, pending: 0, cached: 0, knownEncodedBytes: 0, unknownTransferRequests: 0 }
    group.requests++
    if (row.terminalKind === 'redirect') { group.redirects++; group.completed++ }
    else if (Number.isFinite(row.finishedTime)) group.completed++
    else if (row.error) group.failed++
    else group.pending++
    if (row.disk || row.sw) group.cached++
    if (Number.isFinite(row.encodedDataLength)) group.knownEncodedBytes += row.encodedDataLength
    else group.unknownTransferRequests++
  }
  return groups
}

export function pageInstallCapacityCommitProbe(keys) {
  const allowed = new Set(keys), transactions = new WeakMap(), committed = new Map()
  const original = IDBObjectStore.prototype.put
  function put(value, key) {
    const request = original.apply(this, arguments), tx = this.transaction
    const object = this.name === 'bodies' ? key : value?.key
    if (tx.db.name !== 'cf-navs-object-icons-v1' || !allowed.has(object)) return request
    let state = transactions.get(tx)
    if (!state) {
      state = { bodies: new Map(), entries: new Map() }; transactions.set(tx, state)
      tx.addEventListener('complete', () => {
        for (const [id, entry] of state.entries) if (state.bodies.get(id) === entry.bytes) committed.set(id, entry)
      }, { once: true })
    }
    if (this.name === 'bodies' && value instanceof Blob) state.bodies.set(object, value.size)
    if (this.name === 'entries') state.entries.set(object, { bytes: value.byte_length, revision: value.descriptor?.content_revision })
    return request
  }
  IDBObjectStore.prototype.put = put
  window.__capacityCommitProbe = {
    read: () => [...committed].map(([key, value]) => ({ key, ...value })),
    restore() { if (IDBObjectStore.prototype.put !== put) throw new Error('Capacity probe ownership changed'); IDBObjectStore.prototype.put = original },
  }
}
