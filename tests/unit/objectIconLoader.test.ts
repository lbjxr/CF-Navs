import { logoSurfIcon } from '../../src/lib/icons'
import { decodeVersionedIcon, iconContentRevision } from '../../worker/lib/iconRevision'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createObjectIconLoader } from '../../src/lib/objectIconLoader'
import { iconBytesRevision, type IconDescriptor } from '../../shared/iconLocalCopy'
import { ApiError } from '../../src/lib/api'
import { iconFixture } from '../helpers/iconFixture'

const loaders: ReturnType<typeof createObjectIconLoader>[] = []
afterEach(() => { loaders.splice(0).forEach(loader => loader.destroy()) })
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
