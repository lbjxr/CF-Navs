// Controls only the native persistence boundary in an owned test document.
// The UI supplies the data; no application store or successful result is faked.
export function pageInstallSnapshotInterruption({ storage, boundary, bookmarkId, title, privateId }) {
  if (!['local', 'cache'].includes(storage) || !['before', 'after'].includes(boundary) || !Number.isInteger(bookmarkId) || !Number.isInteger(privateId) || !/^(Browser edited [a-f0-9]{8}|Edited [a-f0-9]{8} 0)$/.test(title)) throw new Error('Invalid snapshot fixture')
  if (window.__snapshotInterruption) throw new Error('Snapshot probe already installed')
  const original = { set: Storage.prototype.setItem, put: Cache.prototype.put, remove: Storage.prototype.removeItem }
  const state = { storage, boundary, hits: 0, held: false, written: false, finished: false, restored: false, freezes: 0, samples: 0, privateFrames: 0, protectedRemovals: 0 }
  let used = false, resume, frame, scope = null, protectedScope = null
  const matches = value => {
    try { const rows = JSON.parse(value).data?.bookmarks; return rows?.some(row => row.id === bookmarkId && row.title === title) && rows.some(row => row.id === privateId) } catch { return false }
  }
  const sample = () => {
    state.samples++
    if (!localStorage.getItem('cf-navs.auth') && document.querySelector(`[data-sort-id="${privateId}"]`)) state.privateFrames++
    frame = requestAnimationFrame(sample)
  }
  frame = requestAnimationFrame(sample)
  const freeze = () => { state.freezes++ }
  document.addEventListener('freeze', freeze)
  function snapshotSet(key, value) {
    if (!key.startsWith('cf-navs.admin-data.')) return original.set.call(this, key, value)
    if (storage === 'cache') throw new DOMException('Owned snapshot fallback probe', 'QuotaExceededError')
    if (used || !matches(value)) return original.set.call(this, key, value)
    used = true; scope = key.slice('cf-navs.admin-data.'.length); state.hits++; state.held = true
    if (boundary === 'before') { debugger }
    original.set.call(this, key, value); state.written = true
    if (boundary === 'after') { debugger }
    state.finished = true
  }
  async function snapshotPut(request, response) {
    const url = new URL(typeof request === 'string' ? request : request.url)
    if (storage !== 'cache' || used || url.origin !== 'https://cf-navs.local' || !url.pathname.startsWith('/admin-data/')) return original.put.call(this, request, response)
    const body = await response.clone().text()
    if (used || !matches(body)) return original.put.call(this, request, response)
    used = true; scope = decodeURIComponent(url.pathname.slice('/admin-data/'.length)); state.hits++
    if (boundary === 'after') { await original.put.call(this, request, response); state.written = true }
    state.held = true
    await new Promise(resolve => { resume = resolve })
    if (boundary === 'before') { await original.put.call(this, request, response); state.written = true }
    state.finished = true
  }
  function snapshotRemove(key) {
    if (protectedScope && key === 'cf-navs.admin-data.' + protectedScope && this.getItem(key) !== null) state.protectedRemovals++
    return original.remove.call(this, key)
  }
  Storage.prototype.setItem = snapshotSet; Cache.prototype.put = snapshotPut; Storage.prototype.removeItem = snapshotRemove
  window.__snapshotInterruption = {
    state,
    scope: () => scope,
    protect(scope) { protectedScope = scope },
    release() { resume?.(); resume = null },
    restore() {
      this.release()
      if (!state.restored) {
        if (Storage.prototype.setItem !== snapshotSet || Cache.prototype.put !== snapshotPut || Storage.prototype.removeItem !== snapshotRemove) throw new Error('Snapshot probe ownership changed')
        Storage.prototype.setItem = original.set; Cache.prototype.put = original.put; Storage.prototype.removeItem = original.remove
        document.removeEventListener('freeze', freeze); cancelAnimationFrame(frame); state.restored = true
      }
      return { ...state }
    },
  }
}

// Read only IDs, scope and versions. Never export snapshot contents or credentials.
export async function pageReadSnapshotScopes(bookmarkId, title, privateId) {
  const rows = []
  const inspect = (storage, scope, raw) => {
    try { const value = JSON.parse(raw), items = value.data?.bookmarks; rows.push({ storage, scope, titleMatches: items?.some(row => row.id === bookmarkId && row.title === title) === true, privatePresent: items?.some(row => row.id === privateId) === true }) } catch { rows.push({ storage, scope, invalid: true }) }
  }
  for (const key of Object.keys(localStorage)) if (key.startsWith('cf-navs.admin-data.')) inspect('local', key.slice('cf-navs.admin-data.'.length), localStorage.getItem(key))
  if ((await caches.keys()).includes('cf-navs-admin-data-v1')) {
    const cache = await caches.open('cf-navs-admin-data-v1')
    for (const request of await cache.keys()) { const url = new URL(request.url); if (url.pathname.startsWith('/admin-data/')) inspect('cache', decodeURIComponent(url.pathname.slice('/admin-data/'.length)), await (await cache.match(request)).text()) }
  }
  return rows
}
