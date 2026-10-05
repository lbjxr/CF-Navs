import { ICON_COPY_BODY_BUDGET, type IconDescriptor, type IconObjectType } from '../../shared/iconLocalCopy'
import {
  ICON_CONTROL_BUDGET, entryMetadataBytes, iconObjectKey, iconTotals, planIconEviction, validIconStorageLease, validStoredIcon, withinIconBudget,
  type IconStorageLease, type IconStorageTotals, type StoredIconEntry,
} from './iconCachePolicy'

export const ICON_COPY_DATABASE = 'cf-navs-object-icons-v1'
const STORES = ['control', 'entries', 'bodies'] as const
const ACTIVE_KEY = 'active'
interface Control extends IconStorageTotals, IconStorageLease { key: typeof ACTIVE_KEY; schema: 1; enabled: boolean; revokedScope?: string | null }
export type IconStorageFailure = 'unavailable' | 'quota' | 'stale' | 'corrupt' | 'cleanup-failed'
export class IconStorageError extends Error {
  constructor(readonly reason: IconStorageFailure, cause?: unknown) { super('Icon storage: ' + reason, { cause }); this.name = 'IconStorageError' }
}
const emptyTotals = (): IconStorageTotals => ({ bodyBytes: 0, entries: 0, indexBytes: ICON_CONTROL_BUDGET })
const validTotals = (control: IconStorageTotals) => [control.bodyBytes, control.entries, control.indexBytes].every(Number.isSafeInteger) && control.bodyBytes >= 0 && control.entries >= 0 && control.indexBytes >= ICON_CONTROL_BUDGET && withinIconBudget(control)
const current = (control: Control | undefined, lease: IconStorageLease) => Boolean(control?.enabled && control.schema === 1 && control.scope === lease.scope && control.generation === lease.generation)
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
}
function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new IconStorageError('stale'))
    transaction.onerror = () => reject(transaction.error ?? new IconStorageError('unavailable'))
  })
}
function storageError(error: unknown): IconStorageError {
  if (error instanceof IconStorageError) return error
  return new IconStorageError(error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'unavailable', error)
}

/** One native transactional backend. No HTTP cache, Web Locks, localStorage body, or mirror. */
export function createIconCopyStorage(options: { factory?: IDBFactory; name?: string; now?: () => number } = {}) {
  const name = options.name ?? ICON_COPY_DATABASE
  const now = options.now ?? Date.now
  let connection: Promise<IDBDatabase> | null = null
  let closed = false
  type Touch = { lease: IconStorageLease; at: number; allowed: () => boolean }
  const touches = new Map<string, Touch>()
  function acknowledge(batch: Array<[string, Touch]>): void {
    // A read arriving while the transaction commits belongs to the next batch.
    for (const [key, touch] of batch) if (touches.get(key) === touch) touches.delete(key)
  }
  async function applyTouches(tx: IDBTransaction, control: Control, batch: Array<[string, Touch]>): Promise<Touch[]> {
    const store = tx.objectStore('entries')
    const written: Touch[] = []
    for (const [key, touch] of batch) {
      if (!current(control, touch.lease) || !touch.allowed()) continue
      const entry: StoredIconEntry | undefined = await result(store.get(key))
      if (!entry || !validStoredIcon(entry, touch.lease) || touch.at <= entry.last_used) continue
      if (!touch.allowed() || closed) throw new IconStorageError('stale')
      const updated = { ...entry, last_used: touch.at }
      updated.metadata_bytes = entryMetadataBytes(updated)
      control.indexBytes += updated.metadata_bytes - entry.metadata_bytes
      if (!withinIconBudget(control)) throw new IconStorageError('quota')
      await result(store.put(updated))
      written.push(touch)
    }
    if (closed || written.some(touch => !touch.allowed())) throw new IconStorageError('stale')
    return written
  }

  async function open(): Promise<IDBDatabase> {
    if (closed) throw new IconStorageError('unavailable')
    if (!connection) {
      connection = new Promise<IDBDatabase>((resolve, reject) => {
        const factory = options.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : null)
        if (!factory) { reject(new IconStorageError('unavailable')); return }
        let abandoned = false
        let request: IDBOpenDBRequest
        try { request = factory.open(name, 1) } catch (error) { reject(storageError(error)); return }
        request.onupgradeneeded = () => {
          const db = request.result
          db.createObjectStore('control', { keyPath: 'key' })
          const entries = db.createObjectStore('entries', { keyPath: 'key' })
          entries.createIndex('last_used', 'last_used')
          db.createObjectStore('bodies')
        }
        request.onsuccess = () => {
          const db = request.result
          db.onversionchange = () => { db.close(); connection = null }
          if (closed || abandoned) { db.close(); reject(new IconStorageError('unavailable')); return }
          resolve(db)
        }
        request.onerror = () => reject(storageError(request.error))
        request.onblocked = () => { abandoned = true; reject(new IconStorageError('unavailable')) }
      })
      connection.catch(() => { connection = null })
    }
    return connection
  }

  async function run<T>(mode: IDBTransactionMode, operation: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await open()
    let tx: IDBTransaction
    try { tx = db.transaction([...STORES], mode) } catch (error) { throw storageError(error) }
    const done = finished(tx)
    // A request can fail before the awaited operation returns; keep rejection observed.
    void done.catch(() => undefined)
    try {
      const value = await operation(tx)
      await done
      return value
    } catch (error) {
      try { tx.abort() } catch { /* already committed/aborted */ }
      await done.catch(() => undefined)
      throw storageError(error)
    }
  }
  const controlFor = (tx: IDBTransaction) => result<Control | undefined>(tx.objectStore('control').get(ACTIVE_KEY))
  async function requireLease(tx: IDBTransaction, lease: IconStorageLease, allowed: () => boolean, allowRepair = false): Promise<Control> {
    const control = await controlFor(tx)
    if (!allowed() || !validIconStorageLease(lease) || !current(control, lease)) throw new IconStorageError('stale')
    if (!allowRepair && !validTotals(control!)) throw new IconStorageError('corrupt')
    return control!
  }
  async function removeEntry(tx: IDBTransaction, control: Control, key: string): Promise<void> {
    const store = tx.objectStore('entries')
    const entry: StoredIconEntry | undefined = await result(store.get(key))
    if (entry) {
      if (!validStoredIcon(entry, control) || control.bodyBytes < entry.byte_length || control.entries < 1 || control.indexBytes < ICON_CONTROL_BUDGET + entry.metadata_bytes) throw new IconStorageError('corrupt')
      control.bodyBytes -= entry.byte_length
      control.entries -= 1
      control.indexBytes -= entry.metadata_bytes
    }
    await result(store.delete(key))
    await result(tx.objectStore('bodies').delete(key))
  }

  async function activate(lease: IconStorageLease, allowed: () => boolean, previous: IconStorageLease | null = null): Promise<void> {
    if (!validIconStorageLease(lease)) throw new IconStorageError('corrupt')
    await run('readwrite', async tx => {
      const control = await controlFor(tx)
      if (!allowed()) throw new IconStorageError('stale')
      if (control?.revokedScope === lease.scope.split(':')[1]) throw new IconStorageError('stale')
      if (current(control, lease)) { if (!validTotals(control!)) throw new IconStorageError('corrupt'); return }
      if (control && (!previous || previous.scope !== control.scope || previous.generation !== control.generation)) throw new IconStorageError('stale')
      // Revoked generations may never be reopened by a delayed initialization.
      if (control && !control.enabled && control.scope === lease.scope && control.generation === lease.generation) throw new IconStorageError('stale')
      await result(tx.objectStore('entries').clear())
      await result(tx.objectStore('bodies').clear())
      await result(tx.objectStore('control').put({ key: ACTIVE_KEY, schema: 1, enabled: true, ...lease, ...emptyTotals() } satisfies Control))
      if (!allowed()) throw new IconStorageError('stale')
    })
    // Same-generation activation (focus/receipt renewal) must retain pending hits.
    for (const [key, touch] of touches) {
      if (touch.lease.scope !== lease.scope || touch.lease.generation !== lease.generation) touches.delete(key)
    }
  }

  async function read(lease: IconStorageLease, type: IconObjectType, id: number, allowed: () => boolean): Promise<{ entry: StoredIconEntry; blob: Blob } | null> {
    const key = iconObjectKey(type, id)
    const hit = await run('readonly', async tx => {
      await requireLease(tx, lease, allowed)
      const entry: StoredIconEntry | undefined = await result(tx.objectStore('entries').get(key))
      if (!entry) return null
      const blob: unknown = await result(tx.objectStore('bodies').get(key))
      if (!validStoredIcon(entry, lease) || !(blob instanceof Blob) || blob.size !== entry.byte_length || blob.type !== entry.mime) return { damaged: true } as const
      if (!allowed()) throw new IconStorageError('stale')
      return { entry, blob }
    })
    if (hit && 'damaged' in hit) { await repair(lease, allowed); return null }
    if (hit && allowed() && !closed) {
      const previous = touches.get(key)
      const at = Math.max(now(), hit.entry.last_used, previous?.lease.scope === lease.scope && previous.lease.generation === lease.generation ? previous.at : 0)
      touches.set(key, { lease: { ...lease }, at, allowed })
      if (touches.size > 1000) touches.delete(touches.keys().next().value!)
    }
    return hit
  }

  async function put(lease: IconStorageLease, descriptor: IconDescriptor, blob: Blob, allowed: () => boolean, pinned: ReadonlySet<string> = new Set()): Promise<void> {
    const entry: StoredIconEntry = { key: iconObjectKey(descriptor.object_type, descriptor.object_id), generation: lease.generation,
      descriptor: { ...descriptor }, mime: blob.type, byte_length: blob.size, saved_at: now(), last_used: now(), metadata_bytes: 0 }
    entry.metadata_bytes = entryMetadataBytes(entry)
    if (!validStoredIcon(entry, lease)) throw new IconStorageError('corrupt')
    let applied: Array<[string, Touch]> = []
    let writtenTouches: Touch[] = []
    await run('readwrite', async tx => {
      const control = await requireLease(tx, lease, allowed)
      const store = tx.objectStore('entries')
      let previous: StoredIconEntry | undefined = await result(store.get(entry.key))
      if (previous && !validStoredIcon(previous, lease)) throw new IconStorageError('corrupt')
      if (previous && previous.descriptor.write_epoch > descriptor.write_epoch) throw new IconStorageError('stale')
      let totals: IconStorageTotals = {
        bodyBytes: control.bodyBytes - (previous?.byte_length ?? 0) + entry.byte_length,
        entries: control.entries + (previous ? 0 : 1),
        indexBytes: control.indexBytes - (previous?.metadata_bytes ?? 0) + entry.metadata_bytes,
      }
      if (!withinIconBudget(totals) || totals.bodyBytes >= ICON_COPY_BODY_BUDGET) {
        // Fold this tab's latest hits into the same transaction as eviction. Other
        // tabs' committed touches are already serialized by IndexedDB.
        applied = [...touches]
        writtenTouches = await applyTouches(tx, control, applied)
        previous = await result(store.get(entry.key))
        // Metadata only; image bodies are never scanned on a hit or eviction decision.
        const entries: StoredIconEntry[] = await result(store.getAll())
        if (entries.some(item => !validStoredIcon(item, lease))) throw new IconStorageError('corrupt')
        const evict = planIconEviction(entries, entry, pinned)
        if (!evict) throw new IconStorageError('quota')
        for (const key of evict) await removeEntry(tx, control, key)
        totals = { bodyBytes: control.bodyBytes - (previous?.byte_length ?? 0) + entry.byte_length,
          entries: control.entries + (previous ? 0 : 1), indexBytes: control.indexBytes - (previous?.metadata_bytes ?? 0) + entry.metadata_bytes }
      }
      await result(tx.objectStore('bodies').put(blob, entry.key))
      await result(store.put(entry))
      await result(tx.objectStore('control').put({ ...control, ...totals }))
      if (writtenTouches.some(touch => !touch.allowed())) throw new IconStorageError('stale')
      if (!allowed()) throw new IconStorageError('stale')
    })
    acknowledge(applied)
    const pending = touches.get(entry.key)
    if (pending?.lease.scope === lease.scope && pending.lease.generation === lease.generation && pending.at <= entry.last_used) touches.delete(entry.key)
  }

  async function remove(lease: IconStorageLease, key: string, allowed: () => boolean): Promise<void> {
    await run('readwrite', async tx => {
      const control = await requireLease(tx, lease, allowed)
      await removeEntry(tx, control, key)
      await result(tx.objectStore('control').put(control))
    })
    touches.delete(key)
  }

  async function clear(lease?: IconStorageLease, revokeSession = false): Promise<void> {
    try {
      await run('readwrite', async tx => {
        const control = await controlFor(tx)
        if (lease && control && (lease.scope !== control.scope || lease.generation !== control.generation)) return
        await result(tx.objectStore('entries').clear())
        await result(tx.objectStore('bodies').clear())
        if (control) await result(tx.objectStore('control').put({ ...control, enabled: false, revokedScope: revokeSession ? control.scope.split(':')[1] : control.revokedScope, ...emptyTotals() }))
      })
      touches.clear()
    } catch (error) { throw new IconStorageError('cleanup-failed', error) }
  }

  async function flushTouches(): Promise<void> {
    const batch = [...touches]
    if (!batch.length || closed) return
    // Retain the batch until commit. Failure retries on the next demand/lifecycle
    // event, not a periodic timer; concurrent newer touches are never discarded.
    await run('readwrite', async tx => {
      const control = await controlFor(tx)
      if (!control) return
      const written = await applyTouches(tx, control, batch)
      await result(tx.objectStore('control').put(control))
      if (closed || written.some(touch => !touch.allowed())) throw new IconStorageError('stale')
    })
    acknowledge(batch)
  }

  /** Explicit startup/fault recovery. Does not run for every image read. */
  async function repair(lease: IconStorageLease, allowed: () => boolean): Promise<void> {
    await run('readwrite', async tx => {
      const control = await requireLease(tx, lease, allowed, true)
      const store = tx.objectStore('entries')
      const bodies = tx.objectStore('bodies')
      const entries: StoredIconEntry[] = await result(store.getAll())
      const valid: StoredIconEntry[] = []
      for (const entry of entries) {
        const blob: unknown = await result(bodies.get(entry.key))
        if (validStoredIcon(entry, lease) && blob instanceof Blob && blob.size === entry.byte_length && blob.type === entry.mime) valid.push(entry)
        else { await result(store.delete(entry.key)); await result(bodies.delete(entry.key)) }
      }
      const validKeys = new Set(valid.map(entry => entry.key))
      for (const key of await result(bodies.getAllKeys())) if (!validKeys.has(String(key))) await result(bodies.delete(key))
      let totals = iconTotals(valid)
      for (const entry of valid.sort((a, b) => a.last_used - b.last_used)) {
        if (withinIconBudget(totals)) break
        await result(store.delete(entry.key)); await result(bodies.delete(entry.key))
        totals = { bodyBytes: totals.bodyBytes - entry.byte_length, entries: totals.entries - 1, indexBytes: totals.indexBytes - entry.metadata_bytes }
      }
      await result(tx.objectStore('control').put({ ...control, ...totals }))
      if (!allowed()) throw new IconStorageError('stale')
    })
  }

  async function state(): Promise<Control | null> { return run('readonly', async tx => (await controlFor(tx)) ?? null) }
  async function close(): Promise<void> {
    closed = true
    touches.clear()
    const db = await connection?.catch(() => null)
    db?.close()
    connection = null
  }
  return { activate, read, put, remove, clear, flushTouches, repair, state, close }
}

export type IconCopyStorage = ReturnType<typeof createIconCopyStorage>
