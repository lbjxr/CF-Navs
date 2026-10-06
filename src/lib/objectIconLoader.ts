import { createIconTouchFlush } from './iconTouchFlush'
import { decodeIconDataUri } from '../../shared/iconDataUri'
import { ICON_COPY_MAX_BYTES, ICON_COPY_PROTOCOL, iconBytesRevision, isIconDescriptor, type IconCopyResult, type IconDescriptor } from '../../shared/iconLocalCopy'
import { ApiError, fetchIconCopy } from './api'
import { iconDevice } from './iconDeviceState'
import { iconObjectKey } from './iconCachePolicy'
import { IconStorageError } from './iconCopyStorage'

export interface LoadedObjectIcon { blob: Blob | null; descriptor: IconDescriptor; status: 'ready' | 'empty' | 'retryable' | 'unavailable' | 'blocked'; source?: 'local' | 'inline' | 'network' }
export interface ObjectIconHandle { result: Promise<LoadedObjectIcon & { url: string | null }>; release: () => void }
type Capture = NonNullable<ReturnType<typeof iconDevice.capture>>
type LoaderDevice = Pick<typeof iconDevice, 'capture' | 'isCurrent' | 'snapshot' | 'subscribe' | 'storage' | 'refreshStats' | 'reportStorageError'>
interface Options {
  device: LoaderDevice
  fetchCopy?: typeof fetchIconCopy
  decode?: (blob: Blob) => Promise<void>
  createUrl?: (blob: Blob) => string
  revokeUrl?: (url: string) => void
}

export async function decodeIconBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  try { const image = new Image(); image.src = url; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image') }
  finally { URL.revokeObjectURL(url) }
}
export function inlineIconBlob(value: string): Blob | null {
  const decoded = decodeIconDataUri(value)
  return decoded ? new Blob([decoded.bytes], { type: decoded.mime }) : null
}
function sameObject(a: IconDescriptor, b: IconDescriptor): boolean { return a.object_type === b.object_type && a.object_id === b.object_id && a.dataset_epoch === b.dataset_epoch }
function cacheMatches(a: IconDescriptor, b: IconDescriptor): boolean {
  return sameObject(a, b) && (b.state === 'ready' ? a.content_revision === b.content_revision : b.state === 'unknown' && a.write_epoch === b.write_epoch)
}

export function createObjectIconLoader(options: Options) {
  const device = options.device
  const touchFlush = createIconTouchFlush(async () => {
    const captured = device.capture()
    if (!captured) return
    try { await device.storage.flushTouches() }
    catch (error) {
      if (device.isCurrent(captured) && !(error instanceof IconStorageError && error.reason === 'stale')) device.reportStorageError(error)
    }
  }, error => device.reportStorageError(error))
  const decode = options.decode ?? decodeIconBlob
  const fetchCopy = options.fetchCopy ?? fetchIconCopy
  // Bound only the copy transport (including its response body), not storage or
  // time spent waiting for a slot. The origin fetch budget is 5s; allow another
  // 5s for network/protocol work before using the existing retryable fallback.
  async function requestCopy(payload: Parameters<typeof fetchIconCopy>[0], signal: AbortSignal): Promise<IconCopyResult> {
    signal.throwIfAborted()
    const controller = new AbortController()
    let rejectAbort!: (reason: unknown) => void
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
    const cancel = (reason: unknown) => { rejectAbort(reason); controller.abort(reason) }
    const onAbort = () => cancel(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => cancel(new DOMException('Icon copy request timed out', 'TimeoutError')), 10_000)
    try {
      // Race as well as abort: a delayed/non-cooperating transport must never
      // retain a queue slot or let its late bytes reach descriptor/storage writes.
      return await Promise.race([
        Promise.resolve().then(() => { controller.signal.throwIfAborted(); return fetchCopy(payload, controller.signal) }),
        aborted,
      ])
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
  const createUrl = options.createUrl ?? (blob => URL.createObjectURL(blob))
  const revokeUrl = options.revokeUrl ?? (url => URL.revokeObjectURL(url))
  let onDescriptor: (next: IconDescriptor, previous: IconDescriptor) => void = () => undefined
  let protocolUnavailable = false
  let running = 0
  let epoch = device.snapshot().epoch
  const queue: Array<() => void> = []
  type Entry = { aliases: Set<string>; refs: number; abort: AbortController; promise: Promise<LoadedObjectIcon>; settled: boolean; result?: LoadedObjectIcon; cleanup?: ReturnType<typeof setTimeout> }
  const entries = new Map<string, Entry>()
  const handles = new Set<() => void>()
  const key = (capture: Capture, d: IconDescriptor) => [capture.lease.scope, capture.lease.generation, d.object_type, d.object_id, d.content_revision ?? 'unknown:' + d.write_epoch].join('/')
  async function limited<T>(operation: () => Promise<T>): Promise<T> {
    if (running >= 4) await new Promise<void>(resolve => queue.push(resolve)); else running++
    try { return await operation() } finally { const next = queue.shift(); if (next) next(); else running-- }
  }
  function deleteEntry(entry: Entry) { for (const alias of entry.aliases) if (entries.get(alias) === entry) entries.delete(alias) }
  const stop = device.subscribe(snapshot => {
    if (snapshot.epoch === epoch) return
    epoch = snapshot.epoch; protocolUnavailable = false
    for (const release of [...handles]) release()
    for (const entry of new Set(entries.values())) entry.abort.abort()
    entries.clear()
  })
  async function checkedBlob(blob: Blob, descriptor: IconDescriptor): Promise<boolean> {
    if (!blob.size || blob.size > ICON_COPY_MAX_BYTES || !/^image\//.test(blob.type)) return false
    if (await iconBytesRevision(new Uint8Array(await blob.arrayBuffer()), blob.type) !== descriptor.content_revision) return false
    await decode(blob)
    return true
  }

  async function load(capture: Capture, requested: IconDescriptor, inline: string | undefined, signal: AbortSignal): Promise<LoadedObjectIcon> {
    const valid = () => !signal.aborted && device.isCurrent(capture)
    const blocked = (): LoadedObjectIcon => ({ blob: null, descriptor: requested, status: 'blocked' })
    if (!valid()) return blocked()
    if (requested.state === 'empty' || requested.state === 'text') {
      await device.storage.remove(capture.lease, iconObjectKey(requested.object_type, requested.object_id), valid).catch(error => device.reportStorageError(error))
      return { blob: null, descriptor: requested, status: 'empty' }
    }
    let previous: Awaited<ReturnType<typeof device.storage.read>> = null
    try {
      previous = await device.storage.read(capture.lease, requested.object_type, requested.object_id, valid)
      if (previous) {
        try {
          if (!await checkedBlob(previous.blob, previous.entry.descriptor)) throw new Error('Invalid cached body')
          if (cacheMatches(previous.entry.descriptor, requested)) return valid() ? { blob: previous.blob, descriptor: previous.entry.descriptor, status: 'ready', source: 'local' } : blocked()
        } catch {
          await device.storage.remove(capture.lease, previous.entry.key, valid)
          previous = null
        }
      }
    } catch (error) { if (error instanceof IconStorageError && error.reason === 'stale') return blocked(); device.reportStorageError(error) }
    if (!valid()) return blocked()

    const fallback = (): LoadedObjectIcon => valid() && previous
      ? { blob: previous.blob, descriptor: previous.entry.descriptor, status: 'retryable', source: 'local' }
      : { blob: null, descriptor: requested, status: valid() ? 'retryable' : 'blocked' }
    return limited(async () => {
      if (!valid()) return blocked()
      let descriptor = requested
      let blob: Blob | null = null
      let source: LoadedObjectIcon['source'] = 'network'
      if (inline && requested.state === 'ready' && device.snapshot().inlineProtocol === 1) {
        const candidate = inlineIconBlob(inline)
        if (candidate && await checkedBlob(candidate, requested).catch(() => false)) { blob = candidate; source = 'inline' }
      }
      try {
        for (let attempt = 0; !blob && attempt < 2; attempt++) {
          if (protocolUnavailable) return { blob: null, descriptor, status: 'unavailable' }
          let response: IconCopyResult
          try {
            response = await requestCopy({ protocol: ICON_COPY_PROTOCOL, object_type: descriptor.object_type, object_id: descriptor.object_id,
              dataset_epoch: descriptor.dataset_epoch, expected_write_epoch: descriptor.write_epoch, expected_content_revision: descriptor.content_revision }, signal)
          } catch (error) {
            const data = error instanceof ApiError ? error.data as Partial<IconCopyResult> : null
            if (error instanceof ApiError && error.status === 409 && data?.protocol === 1 && 'descriptor' in data && isIconDescriptor(data.descriptor) && sameObject(data.descriptor, requested)) {
              descriptor = data.descriptor
              const hit = await device.storage.read(capture.lease, descriptor.object_type, descriptor.object_id, valid)
              if (hit && cacheMatches(hit.entry.descriptor, descriptor) && await checkedBlob(hit.blob, hit.entry.descriptor)) { return { blob: hit.blob, descriptor, status: 'ready', source: 'local' } }
              continue
            }
            if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404 && data?.protocol === 1 && 'reason' in data && data.reason === 'not-found')) {
              await device.storage.remove(capture.lease, iconObjectKey(requested.object_type, requested.object_id), valid).catch(() => undefined)
              return { blob: null, descriptor: requested, status: 'blocked' }
            }
            return fallback()
          }
          if (!valid()) return blocked()
          if (response?.protocol !== 1 || !('persistence' in response) || response.persistence !== 'session-scoped' || !isIconDescriptor(response.descriptor) || !sameObject(response.descriptor, requested)) {
            protocolUnavailable = true; return { blob: null, descriptor, status: 'unavailable' }
          }
          descriptor = response.descriptor
          if (descriptor.state === 'empty' || descriptor.state === 'text') {
            await device.storage.remove(capture.lease, iconObjectKey(descriptor.object_type, descriptor.object_id), valid)
            return { blob: null, descriptor, status: 'empty' }
          }
          const image = response.image
          if (descriptor.state !== 'ready' || !image || typeof image.base64 !== 'string' || image.base64.length > 699052 || !Number.isSafeInteger(image.byte_length) || image.byte_length > ICON_COPY_MAX_BYTES) return fallback()
          blob = inlineIconBlob('data:' + image.mime + ';base64,' + image.base64)
          if (!blob || blob.size !== image.byte_length || !await checkedBlob(blob, descriptor)) return fallback()
        }
        if (!blob || !valid()) return valid() ? fallback() : blocked()
        try { await device.storage.put(capture.lease, descriptor, blob, valid) }
        catch (error) { if (error instanceof IconStorageError && error.reason === 'stale') return blocked(); device.reportStorageError(error) }
        if (!valid()) return blocked()
        void device.refreshStats().catch(() => undefined)
        return { blob, descriptor, status: 'ready', source }
      } catch { return fallback() }
    })
  }

  function acquire(descriptor: IconDescriptor, inline?: string, retry = false): ObjectIconHandle {
    const capture = device.capture()
    if (!capture || !isIconDescriptor(descriptor) || descriptor.dataset_epoch !== capture.lease.scope.split(':')[0]) return { result: Promise.resolve({ blob: null, descriptor, url: null, status: 'blocked' }), release: () => undefined }
    const id = key(capture, descriptor)
    let entry = entries.get(id)
    if (entry?.abort.signal.aborted) { deleteEntry(entry); entry = undefined }
    if (entry?.settled && retry && entry.result?.status !== 'ready') { deleteEntry(entry); entry = undefined }
    if (!entry) {
      const abort = new AbortController()
      entry = { aliases: new Set([id]), refs: 0, abort, promise: null!, settled: false }
      const owned = entry
      entry.promise = load(capture, { ...descriptor }, inline, abort.signal).then(result => {
        owned.settled = true; owned.result = result
        // An abandoned operation may finish after its replacement. It no longer
        // owns any index aliases or descriptor publication rights.
        if (owned.abort.signal.aborted) return result
        if (result.source === 'local' && device.isCurrent(capture)) touchFlush.request()
        const alias = key(capture, result.descriptor)
        if (!entries.has(alias)) { entries.set(alias, owned); owned.aliases.add(alias) }
        if (device.isCurrent(capture) && (result.status === 'ready' || result.status === 'empty')) onDescriptor(result.descriptor, descriptor)
        return result
      })
      entries.set(id, entry)
    }
    if (entry.cleanup) clearTimeout(entry.cleanup)
    entry.refs++
    const owned = entry
    let released = false
    let url: string | null = null
    const release = () => {
      if (released) return
      released = true; handles.delete(release); if (url) revokeUrl(url)
      owned.refs--
      if (!owned.refs) {
        if (!owned.settled) {
          owned.abort.abort()
          // Reacquisition in this same task must start a live operation, not
          // inherit the cancelled promise before a cleanup timer runs.
          deleteEntry(owned)
        }
        owned.cleanup = setTimeout(() => { if (!owned.refs) deleteEntry(owned) }, 0)
      }
    }
    handles.add(release)
    const result = entry.promise.then(result => {
      if (released || !device.isCurrent(capture)) return { ...result, blob: null, url: null, status: 'blocked' as const }
      url = result.blob ? createUrl(result.blob) : null
      return { ...result, url }
    })
    return { result, release }
  }
  return { acquire, configure: (listener: typeof onDescriptor) => { onDescriptor = listener }, destroy: () => { touchFlush.dispose(); stop(); for (const release of [...handles]) release(); entries.clear() } }
}
export const objectIconLoader = createObjectIconLoader({ device: iconDevice })
