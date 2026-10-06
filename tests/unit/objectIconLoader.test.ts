import { logoSurfIcon } from '../../src/lib/icons'
import { decodeVersionedIcon, iconContentRevision } from '../../worker/lib/iconRevision'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createObjectIconLoader } from '../../src/lib/objectIconLoader'
import { iconBytesRevision, type IconDescriptor } from '../../shared/iconLocalCopy'
import { ApiError } from '../../src/lib/api'
import { IconStorageError } from '../../src/lib/iconCopyStorage'
import { iconFixture } from '../helpers/iconFixture'

const loaders: ReturnType<typeof createObjectIconLoader>[] = []
afterEach(() => { loaders.splice(0).forEach(loader => loader.destroy()); vi.useRealTimers() })
async function fixture() {
  const icon = iconFixture()
  const revision = await iconBytesRevision(icon.bytes, icon.contentType)
  const ready: IconDescriptor = { object_type: 'bookmark', object_id: 1, dataset_epoch: 'a'.repeat(32), write_epoch: 0, state: 'ready', content_revision: revision }
  const unknown: IconDescriptor = { ...ready, state: 'unknown', content_revision: null }
  let epoch = 0
  let enabled = true
  const lease = { scope: 'a'.repeat(32) + ':' + 'b'.repeat(64), generation: 'fixture' }
  const data = new Map<string, any>()
  const subscribers = new Set<(state: any) => void>()
  const storage = {
    flushTouches: vi.fn(async () => undefined),
    read: vi.fn(async (_lease, type, id) => data.get(type + ':' + id) ?? null),
    put: vi.fn(async (_lease, descriptor, blob, valid) => { if (!valid()) throw new Error('stale'); data.set(descriptor.object_type + ':' + descriptor.object_id, { entry: { key: descriptor.object_type + ':' + descriptor.object_id, descriptor }, blob }) }),
    remove: vi.fn(async (_lease, key) => { data.delete(key) }),
  }
  const device = {
    capture: () => enabled ? { lease, epoch } : null, isCurrent: (capture: any) => enabled && capture.epoch === epoch,
    snapshot: () => ({ epoch, inlineProtocol: 1 }),
    subscribe: (listener: (value: any) => void) => { subscribers.add(listener); listener({ epoch }); return () => subscribers.delete(listener) },
    storage, refreshStats: vi.fn(async () => undefined), reportStorageError: vi.fn(),
  }
  const response = (descriptor = ready) => ({ protocol: 1 as const, persistence: 'session-scoped' as const, descriptor, image: { mime: icon.contentType, byte_length: icon.bytes.length, base64: icon.dataUri.split(',')[1] } })
  const fetchCopy = vi.fn(async () => response())
  let serial = 0
  const revoke = vi.fn()
  const decode = vi.fn(async () => undefined)
  const loader = createObjectIconLoader({ device: device as any, fetchCopy, decode, createUrl: () => 'blob:fixture-' + ++serial, revokeUrl: revoke })
  loaders.push(loader)
  return { loader, ready, unknown, icon, data, storage, device, fetchCopy, response, revoke, decode,
    invalidate: () => { enabled = false; epoch++; for (const listener of subscribers) listener({ epoch }) } }
}

describe('versioned object icon orchestration', () => {
  it('batches real loader hits into one demand-driven flush and stops when idle', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    for (const id of [1, 2]) {
      f.data.set('bookmark:' + id, { entry: { key: 'bookmark:' + id, descriptor: { ...f.ready, object_id: id } }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    }
    const a = f.loader.acquire(f.ready), b = f.loader.acquire({ ...f.ready, object_id: 2 })
    await Promise.all([a.result, b.result])
    expect(f.storage.flushTouches).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.storage.flushTouches).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.flushTouches).toHaveBeenCalledOnce()
    a.release(); b.release()
  })
  it('does not report an old flush failure against a changed session', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    let reject!: (error: unknown) => void
    f.storage.flushTouches.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    await f.loader.acquire(f.ready).result
    await vi.advanceTimersByTimeAsync(1000)
    f.invalidate()
    reject(new IconStorageError('unavailable'))
    await Promise.resolve(); await Promise.resolve()
    expect(f.device.reportStorageError).not.toHaveBeenCalled()
  })
  it('observes flush failure without creating an automatic retry loop', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    f.storage.flushTouches.mockRejectedValue(new IconStorageError('quota'))
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    await f.loader.acquire(f.ready).result
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.device.reportStorageError).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10000)
    expect(f.storage.flushTouches).toHaveBeenCalledOnce()
  })
  it('persists the real generated UTF-8 logo through the inline loader path', async () => {
    const f = await fixture()
    const source = logoSurfIcon('图标 Audit', 'https://example.com')
    const descriptor = { ...f.ready, content_revision: await iconContentRevision(decodeVersionedIcon(source)!) }
    const handle = f.loader.acquire(descriptor, source)
    const loaded = await handle.result
    expect(loaded.status).toBe('ready')
    expect(loaded.source).toBe('inline')
    expect(f.fetchCopy).not.toHaveBeenCalled()
    expect(f.decode).toHaveBeenCalledOnce()
    expect(f.storage.put).toHaveBeenCalledOnce()
    expect(f.data.get('bookmark:1').blob.size).toBeGreaterThan(0)
    handle.release()
  })
  it('restores a qualified local image without a body request, including first-fill unknown metadata', async () => {
    const f = await fixture()
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    const handle = f.loader.acquire(f.unknown)
    expect((await handle.result).source).toBe('local')
    expect(f.fetchCopy).not.toHaveBeenCalled()
    handle.release()
  })
  it('shares one in-flight body but gives consumers independent releasable URLs', async () => {
    const f = await fixture()
    const a = f.loader.acquire(f.unknown), b = f.loader.acquire(f.unknown)
    const [left, right] = await Promise.all([a.result, b.result])
    expect(f.fetchCopy).toHaveBeenCalledOnce()
    expect(f.storage.put).toHaveBeenCalledOnce()
    expect(left.url).not.toBe(right.url)
    a.release(); expect(f.revoke).toHaveBeenCalledWith(left.url); expect(f.revoke).not.toHaveBeenCalledWith(right.url)
    b.release(); expect(f.revoke).toHaveBeenCalledWith(right.url)
  })
  it('retries once with the current descriptor after a stale-write conflict', async () => {
    const f = await fixture()
    const current = { ...f.ready, write_epoch: 1 }
    f.fetchCopy.mockRejectedValueOnce(new ApiError('stale descriptor', { status: 409,
      data: { protocol: 1, reason: 'conflict', descriptor: current } }))
    f.fetchCopy.mockResolvedValueOnce(f.response(current))

    const handle = f.loader.acquire(f.ready)
    const result = await handle.result

    expect(result.status).toBe('ready')
    expect(result.descriptor).toEqual(current)
    expect(f.fetchCopy).toHaveBeenCalledTimes(2)
    expect(f.fetchCopy.mock.calls.map(([request]) => request.expected_write_epoch)).toEqual([0, 1])
    expect(f.storage.put).toHaveBeenCalledOnce()
    handle.release()
  })
  it('materializes a known inline image without fetching it again', async () => {
    const f = await fixture()
    const handle = f.loader.acquire(f.ready, f.icon.dataUri)
    expect((await handle.result).source).toBe('inline')
    expect(f.fetchCopy).not.toHaveBeenCalled()
    expect(f.storage.put).toHaveBeenCalledOnce()
    handle.release()
  })
  it('removes a stored image after the object is explicitly cleared', async () => {
    const f = await fixture()
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    const handle = f.loader.acquire({ ...f.ready, write_epoch: 1, state: 'empty', content_revision: null })
    expect((await handle.result).status).toBe('empty')
    expect(f.data.has('bookmark:1')).toBe(false)
    expect(f.fetchCopy).not.toHaveBeenCalled()
    handle.release()
  })
  it('never stores a malformed or undecodable successful response', async () => {
    const f = await fixture()
    f.decode.mockRejectedValue(new Error('bad image'))
    const handle = f.loader.acquire(f.unknown)
    expect((await handle.result).status).toBe('retryable')
    expect(f.storage.put).not.toHaveBeenCalled()
    handle.release()
  })
  it('preserves an older authorized success when replacement temporarily fails', async () => {
    const f = await fixture()
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    f.fetchCopy.mockRejectedValue(new ApiError('busy', { status: 503 }))
    const handle = f.loader.acquire({ ...f.ready, write_epoch: 1, content_revision: 'sha256-' + 'd'.repeat(64) })
    const result = await handle.result
    expect(result.status).toBe('retryable'); expect(result.blob).not.toBeNull()
    expect(f.data.has('bookmark:1')).toBe(true); expect(f.storage.put).not.toHaveBeenCalled()
    handle.release()
  })
  it('does not use the successful fallback for a known authorization failure', async () => {
    const f = await fixture()
    f.data.set('bookmark:1', { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) })
    f.fetchCopy.mockRejectedValue(new ApiError('forbidden', { status: 403 }))
    const handle = f.loader.acquire({ ...f.ready, write_epoch: 1, content_revision: 'sha256-' + 'd'.repeat(64) })
    expect((await handle.result).status).toBe('blocked'); expect(f.data.has('bookmark:1')).toBe(false)
    handle.release()
  })
  it('drops a late network success after the device generation was revoked', async () => {
    const f = await fixture()
    let finish!: (value: any) => void
    f.fetchCopy.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const handle = f.loader.acquire(f.unknown)
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledOnce())
    f.invalidate(); finish(f.response())
    expect((await handle.result).url).toBeNull(); expect(f.storage.put).not.toHaveBeenCalled()
  })
  it('does not materialize an object from another dataset', async () => {
    const f = await fixture()
    const handle = f.loader.acquire({ ...f.ready, dataset_epoch: 'c'.repeat(32) })
    expect((await handle.result).status).toBe('blocked'); expect(f.fetchCopy).not.toHaveBeenCalled()
  })
  it('limits active fetches without duplicating work across views', async () => {
    const f = await fixture()
    let active = 0, maximum = 0
    let proceed!: () => void
    const gate = new Promise<void>(resolve => { proceed = resolve })
    f.fetchCopy.mockImplementation(async (...args: any[]) => { active++; maximum = Math.max(maximum, active); await gate; active--; return f.response({ ...f.ready, object_id: args[0].object_id }) })
    const handles = Array.from({ length: 10 }, (_, i) => f.loader.acquire({ ...f.unknown, object_id: i + 1 }))
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledTimes(4))
    proceed(); await Promise.all(handles.map(handle => handle.result))
    expect(maximum).toBe(4); handles.forEach(handle => handle.release())
  })
})

describe('cancelled loader ownership',()=>{
  it('reacquires a fresh operation rather than reusing an aborted promise',async()=>{
    const f=await fixture()
    const old=f.loader.acquire(f.ready);old.release()
    const current=f.loader.acquire(f.ready)
    expect((await current.result).status).toBe('ready')
    expect((await old.result).status).toBe('blocked')
    current.release()
  })
  it('does not let a late aborted read recreate an index alias',async()=>{
    vi.useFakeTimers()
    const f=await fixture()
    let resolve!: (value:null)=>void
    f.storage.read.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
    const old=f.loader.acquire(f.ready);old.release()
    const current=f.loader.acquire(f.ready)
    expect((await current.result).status).toBe('ready')
    current.release();await vi.advanceTimersByTimeAsync(1)
    resolve(null);await old.result
    const next=f.loader.acquire(f.ready)
    expect((await next.result).status).toBe('ready')
    next.release()
  })
  it('keeps an in-flight operation while another owner still needs it',async()=>{
    const f=await fixture()
    const one=f.loader.acquire(f.ready),two=f.loader.acquire(f.ready)
    one.release()
    expect((await two.result).status).toBe('ready')
    expect(f.fetchCopy).toHaveBeenCalledOnce()
    two.release()
  })
})


describe('bounded icon copy requests', () => {
  it('releases all occupied slots after a deadline so a queued object can load', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const signals: AbortSignal[] = []
    f.fetchCopy.mockImplementation((...args: any[]) => {
      signals.push(args[1])
      return args[0].object_id <= 4 ? new Promise(() => {}) : Promise.resolve(f.response({ ...f.ready, object_id: args[0].object_id }))
    })
    const handles = Array.from({ length: 5 }, (_, i) => f.loader.acquire({ ...f.unknown, object_id: i + 1 }))
    const settled: string[] = []
    handles.forEach(handle => { void handle.result.then(result => settled.push(result.status)) })
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledTimes(4))
    await vi.advanceTimersByTimeAsync(10_001)
    expect(settled.filter(status => status === 'retryable')).toHaveLength(4)
    expect(f.fetchCopy).toHaveBeenCalledTimes(5)
    // The queued response hashes real bytes; crypto completion is not driven by fake timers.
    expect((await handles[4].result).status).toBe('ready')
    expect(settled).toHaveLength(5)
    expect(signals.slice(0, 4).every(signal => signal.aborted)).toBe(true)
    expect(f.storage.put).toHaveBeenCalledOnce()
    handles.forEach(handle => handle.release())
  })

  it('retains the authorized old image on timeout, ignores late bytes and permits retry', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const old = { entry: { key: 'bookmark:1', descriptor: f.ready }, blob: new Blob([f.icon.bytes], { type: f.icon.contentType }) }
    f.data.set('bookmark:1', old)
    let finish!: (value: any) => void
    f.fetchCopy.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const changed = { ...f.ready, write_epoch: 1, content_revision: 'sha256-' + 'd'.repeat(64) }
    const handle = f.loader.acquire(changed)
    let result: Awaited<typeof handle.result> | undefined
    void handle.result.then(value => { result = value })
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(10_001)
    expect(result?.status).toBe('retryable')
    expect(result?.blob).toBe(old.blob)
    expect(f.data.get('bookmark:1')).toBe(old)
    expect(f.storage.put).not.toHaveBeenCalled()
    finish(f.response()); await vi.advanceTimersByTimeAsync(0)
    expect(f.storage.put).not.toHaveBeenCalled()
    const retry = f.loader.acquire(changed, undefined, true)
    expect((await retry.result).status).toBe('ready')
    expect(f.fetchCopy).toHaveBeenCalledTimes(2)
    handle.release(); retry.release()
  })

  it('cancels an abandoned request immediately without waiting for its deadline', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    let signal!: AbortSignal
    f.fetchCopy.mockImplementationOnce((...args: any[]) => { signal = args[1]; return new Promise(() => {}) })
    const old = f.loader.acquire(f.unknown)
    let status: string | undefined
    void old.result.then(result => { status = result.status })
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledOnce())
    old.release(); await vi.advanceTimersByTimeAsync(0)
    expect(signal.aborted).toBe(true)
    expect(status).toBe('blocked')
    const current = f.loader.acquire(f.unknown)
    expect((await current.result).status).toBe('ready')
    current.release()
  })

  it('starts the deadline only when a queued request acquires its slot', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const releaseFirst: Array<() => void> = []
    const signals: AbortSignal[] = []
    f.fetchCopy.mockImplementation((...args: any[]) => {
      signals.push(args[1])
      return new Promise(resolve => { if (args[0].object_id <= 4) releaseFirst.push(() => resolve(f.response({ ...f.ready, object_id: args[0].object_id }))) })
    })
    const handles = Array.from({ length: 5 }, (_, i) => f.loader.acquire({ ...f.unknown, object_id: i + 1 }))
    let fifth: string | undefined
    void handles[4].result.then(value => { fifth = value.status })
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledTimes(4))
    await vi.advanceTimersByTimeAsync(8_000)
    releaseFirst.forEach(resolve => resolve())
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledTimes(5))
    await vi.advanceTimersByTimeAsync(2_100)
    expect(fifth).toBeUndefined()
    expect(signals.every(signal => !signal.aborted)).toBe(true)
    await vi.advanceTimersByTimeAsync(8_000)
    expect(fifth).toBe('retryable')
    expect(signals.slice(0, 4).every(signal => !signal.aborted)).toBe(true)
    handles.forEach(handle => handle.release())
  })

  it('does not retain a deadline or abort listener after a successful request', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const signals: AbortSignal[] = []
    f.fetchCopy.mockImplementation((...args: any[]) => { signals.push(args[1]); return Promise.resolve(f.response()) })
    const handle = f.loader.acquire(f.unknown)
    expect((await handle.result).status).toBe('ready')
    expect(vi.getTimerCount()).toBe(0)
    f.invalidate()
    await vi.advanceTimersByTimeAsync(10_001)
    expect(signals[0].aborted).toBe(false)
  })

  it('revokes a hanging request and never publishes its late success', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    let finish!: (value: any) => void
    let signal!: AbortSignal
    f.fetchCopy.mockImplementationOnce((...args: any[]) => { signal = args[1]; return new Promise(resolve => { finish = resolve }) })
    const publish = vi.fn()
    f.loader.configure(publish)
    const handle = f.loader.acquire(f.unknown)
    let result: string | undefined
    void handle.result.then(value => { result = value.status })
    await vi.waitFor(() => expect(f.fetchCopy).toHaveBeenCalledOnce())
    f.invalidate(); await vi.advanceTimersByTimeAsync(0)
    expect(result).toBe('blocked')
    expect(signal.aborted).toBe(true)
    finish(f.response()); await vi.advanceTimersByTimeAsync(0)
    expect(f.storage.put).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
