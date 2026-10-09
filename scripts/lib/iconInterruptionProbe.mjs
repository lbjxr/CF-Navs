// Runs only in a dedicated test document. Hold an actual decoded fixture before
// its consumer resumes, or abort a real IDB transaction after its body write.
// Never call product stores/loaders or manufacture a successful native result.
export function pageInstallIconInterruption({ mode, key, body }) {
  if (!['decode', 'abort-write', 'pause-write'].includes(mode) || !/^bookmark:[1-9]\d*$/.test(key) || typeof body !== 'string' || !body.includes('<!-- interruption-fixture-')) throw new Error('Invalid interruption fixture')
  if (window.__iconInterruption) throw new Error('Interruption probe already installed')
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, decode: HTMLImageElement.prototype.decode, put: IDBObjectStore.prototype.put }
  const blobs = new Map()
  const state = { mode, key, held: false, holds: 0, released: false, finished: false, nativeWidth: 0, nativeHeight: 0, bodyRequested: false, bodyWritten: false, aborted: false, committed: false, freezes: 0, restored: false, frames: 0, privateFrames: 0, lostNewSessionFrames: 0 }
  let release = null, used = false
  let expectedToken = null, frameId = null
  const readToken = () => { try { return JSON.parse(localStorage.getItem('cf-navs.auth') || 'null')?.token || null } catch { return null } }
  const sample = () => {
    state.frames++
    const token = readToken(), authenticated = Boolean(token)
    if (!authenticated && document.querySelector(`[data-sort-id="${key.split(':')[1]}"]`)) state.privateFrames++
    if (expectedToken && token !== expectedToken) state.lostNewSessionFrames++
    frameId = requestAnimationFrame(sample)
  }
  frameId = requestAnimationFrame(sample)
  const freeze = () => { state.freezes++ }
  document.addEventListener('freeze', freeze)
  function create(blob) { const url = original.create.call(URL, blob); blobs.set(url, blob); return url }
  function revoke(url) { blobs.delete(url); return original.revoke.call(URL, url) }
  function decode(...args) {
    const result = original.decode.apply(this, args)
    const blob = blobs.get(this.src)
    // Connected image.decode() calls belong to the read-only pixel observer,
    // not the loader's detached native decoder.
    if (mode !== 'decode' || used || this.isConnected || !(blob instanceof Blob)) return result
    return result.then(async value => {
      const matches = await blob.text() === body
      // Claim after the asynchronous comparison, so concurrent completions
      // cannot both hold and overwrite the single release continuation.
      if (used || !matches) return value
      used = true
      state.holds++
      state.nativeWidth = this.naturalWidth; state.nativeHeight = this.naturalHeight
      state.held = true
      await new Promise(resolve => { release = resolve })
      state.finished = true
      return value
    })
  }
  function put(...args) {
    const request = original.put.apply(this, args)
    if (['abort-write', 'pause-write'].includes(mode) && !used && this.transaction.db.name === 'cf-navs-object-icons-v1' && this.name === 'bodies' && args[1] === key) {
      used = true
      state.bodyRequested = true
      const tx = this.transaction
      tx.addEventListener('abort', () => { state.aborted = true }, { once: true })
      tx.addEventListener('complete', () => { state.committed = true }, { once: true })
      request.addEventListener('success', () => { state.bodyWritten = true; if (mode === 'abort-write') tx.abort() }, { once: true })
      // The owning test explicitly enables CDP Debugger and resumes in finally.
      // The native request is already issued; no request/event result is faked.
      if (mode === 'pause-write') { debugger }
    }
    return request
  }
  URL.createObjectURL = create; URL.revokeObjectURL = revoke
  HTMLImageElement.prototype.decode = decode; IDBObjectStore.prototype.put = put
  window.__iconInterruption = {
    state,
    requireNewSession() { expectedToken = readToken(); if (!expectedToken) throw new Error('New session guard requires authentication') },
    release() { state.released = true; release?.(); release = null },
    restore() {
      if (state.restored) return { ...state }
      this.release()
      if (URL.createObjectURL !== create || URL.revokeObjectURL !== revoke || HTMLImageElement.prototype.decode !== decode || IDBObjectStore.prototype.put !== put) throw new Error('Native probe ownership changed')
      URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke
      HTMLImageElement.prototype.decode = original.decode; IDBObjectStore.prototype.put = original.put
      blobs.clear(); expectedToken = null; document.removeEventListener('freeze', freeze); cancelAnimationFrame(frameId)
      state.restored = true
      return { ...state }
    },
  }
}
