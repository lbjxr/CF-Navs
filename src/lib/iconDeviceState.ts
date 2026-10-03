import { ICON_COPY_PROTOCOL, iconSessionScope, type IconAuthReceipt, type IconCopyMetadata } from '../../shared/iconLocalCopy'
import { AUTH_STORAGE_KEY, getStoredAuthSession, notifyBrowserStorageChange, refreshStoredAuthSession, subscribeBrowserStorageChanges } from './api'
import { iconLeaseUntil, iconPermissionFailure, iconScopeKey, type IconStorageLease, type IconStorageTotals } from './iconCachePolicy'
import { createIconCopyStorage, IconStorageError, type IconCopyStorage } from './iconCopyStorage'

export const ICON_DEVICE_KEY = 'cf-navs.icon-device-v1'
export type IconDevicePhase = 'disabled' | 'waiting-auth' | 'ready' | 'checking' | 'expired' | 'unsupported' | 'unavailable' | 'cleanup-failed'
interface DeviceRecord { schema: 1; trusted: boolean; receipt: IconAuthReceipt | null; dataset: string | null; protocol?: number; observedAt: number; cleanupPending: boolean; revokedScope?: string | null }
export interface IconDeviceSnapshot {
  trusted: boolean; phase: IconDevicePhase; epoch: number; lease: IconStorageLease | null
  dataset: string | null; leaseUntil: number | null; checkedAt: number | null
  stats: IconStorageTotals; error: string | null
}
type Session = { token: string; expires_at: number } | null
interface DeviceOptions {
  storage: IconCopyStorage
  session: () => Session
  load: () => string | null
  save: (record: string) => void
  notify?: () => void
  now?: () => number
  scope?: (token: string) => Promise<string>
}
const blankRecord = (): DeviceRecord => ({ schema: 1, trusted: false, receipt: null, dataset: null, observedAt: 0, cleanupPending: false })
function readRecord(raw: string | null): DeviceRecord {
  if (!raw || raw.length > 4096) return blankRecord()
  try {
    const record = JSON.parse(raw) as DeviceRecord
    if (record.schema !== 1 || typeof record.trusted !== 'boolean' || !Number.isSafeInteger(record.observedAt) || typeof record.cleanupPending !== 'boolean') return blankRecord()
    if (record.receipt && (typeof record.receipt.cache_scope !== 'string' || !Number.isSafeInteger(record.receipt.checked_at) || !Number.isSafeInteger(record.receipt.expires_at))) return blankRecord()
    return record
  } catch { return blankRecord() }
}

/** Owns only device permission/lifetime. Authentication remains owned by authStore. */
export function createIconDeviceController(options: DeviceOptions) {
  const now = options.now ?? Date.now
  const scope = options.scope ?? iconSessionScope
  let record = blankRecord()
  let dataDataset: string | null = null
  let activeToken = options.session()?.token ?? null
  let currentScope: string | null = null
  let lastClock = 0
  let sequence = 0
  let writing = false
  let initialized = false
  let disposed = false
  let expiry: ReturnType<typeof setTimeout> | null = null
  let clearTask: Promise<void> = Promise.resolve()
  let state: IconDeviceSnapshot = { trusted: false, phase: 'disabled', epoch: 0, lease: null, dataset: null, leaseUntil: null, checkedAt: null, stats: { bodyBytes: 0, entries: 0, indexBytes: 0 }, error: null }
  const listeners = new Set<(snapshot: IconDeviceSnapshot) => void>()
  function update(patch: Partial<IconDeviceSnapshot>) { state = { ...state, ...patch }; for (const listener of listeners) listener(state) }
  function block(phase: IconDevicePhase, error: string | null = null) {
    sequence++
    if (expiry) clearTimeout(expiry)
    expiry = null
    update({ phase, error, lease: null, epoch: state.epoch + 1 })
  }
  function persist(): boolean {
    try { writing = true; options.save(JSON.stringify(record)); options.notify?.(); return true }
    catch { block('unavailable', '无法保存此设备设置；已停止使用图标副本，请检查浏览器存储权限。'); return false }
    finally { writing = false }
  }
  function permitted(): boolean {
    return !disposed && !record.cleanupPending && record.revokedScope !== currentScope && options.session()?.token === activeToken && activeToken !== null &&
      dataDataset === record.dataset && dataDataset !== null &&
      iconPermissionFailure({ trusted: record.trusted, protocol: record.protocol, cacheScope: currentScope,
        receipt: record.receipt, now: now(), lastObservedAt: Math.max(record.observedAt, lastClock) }) === null
  }
  function scheduleExpiry() {
    if (expiry) clearTimeout(expiry)
    if (!record.receipt) return
    expiry = setTimeout(() => { block('expired'); }, Math.max(0, Math.min(0x7fffffff, iconLeaseUntil(record.receipt) - now())))
  }
  function failure(error: unknown) {
    if (error instanceof IconStorageError && error.reason === 'stale') return
    if (error instanceof IconStorageError && (error.reason === 'quota' || error.reason === 'corrupt')) {
      update({ error: error.reason === 'quota' ? '本机空间不足；保留已有副本，本次图片仅在内存中使用。' : '个别图标副本损坏；其余有效副本仍可使用。' }); return
    }
    update({ error: '本地图标存储不可用，已停止持久化。可清理副本后重试。', phase: 'unavailable', lease: null })
  }

  async function synchronize(retry = true): Promise<void> {
    const own = ++sequence
    const token = options.session()?.token ?? null
    if (!record.trusted) { update({ trusted: false, phase: 'disabled', lease: null }); return }
    if (record.cleanupPending) { update({ phase: 'cleanup-failed', lease: null }); return }
    if (!token || !record.receipt) { update({ trusted: true, phase: 'waiting-auth', lease: null }); return }
    try {
      const digest = await scope(token)
      if (disposed || own !== sequence || token !== options.session()?.token) return
      currentScope = digest
      const denied = iconPermissionFailure({ trusted: true, protocol: record.protocol, cacheScope: digest, receipt: record.receipt, now: now(), lastObservedAt: record.observedAt })
      if (denied === 'scope-mismatch' || denied === 'unauthenticated') { record = { ...record, revokedScope: record.receipt?.cache_scope }; await revoke('waiting-auth'); return }
      if (denied) {
        block(denied === 'expired' || denied === 'clock' ? 'expired' : denied === 'unsupported' ? 'unsupported' : 'waiting-auth')
        return
      }
      if (dataDataset !== record.dataset) { update({ phase: 'checking', lease: null }); return }
      const key = iconScopeKey(record.dataset!, digest)
      if (!key) { block('unavailable'); return }
      const previous = await options.storage.state()
      if (own !== sequence || !permitted()) return
      if (previous?.revokedScope === digest) {
        record = { ...record, revokedScope: digest, receipt: null }; persist(); block('waiting-auth'); return
      }
      const lease = previous?.enabled && previous.scope === key
        ? { scope: key, generation: previous.generation }
        : { scope: key, generation: crypto.randomUUID() }
      const valid = () => own === sequence && permitted()
      await options.storage.activate(lease, valid, previous)
      if (!valid()) return
      const stats = await options.storage.state()
      if (!valid()) return
      update({ trusted: true, phase: 'ready', lease, dataset: record.dataset, leaseUntil: iconLeaseUntil(record.receipt!), checkedAt: record.receipt!.checked_at,
        stats: stats ? { bodyBytes: stats.bodyBytes, entries: stats.entries, indexBytes: stats.indexBytes } : state.stats, error: null })
      scheduleExpiry()
    } catch (error) {
      if (own === sequence && retry && error instanceof IconStorageError && error.reason === 'stale') await synchronize(false)
      else if (own === sequence) failure(error)
    }
  }

  function revoke(phase: IconDevicePhase = record.trusted ? 'waiting-auth' : 'disabled', forget = true, revokeSession = false, revokedToken: string | null = null): Promise<void> {
    const lease = state.lease
    const revokedScope = record.revokedScope
    block(phase)
    record = { ...record, ...(forget ? { receipt: null, dataset: null } : {}), cleanupPending: true }
    persist()
    const epoch = state.epoch
    clearTask = clearTask.catch(() => undefined).then(async () => {
      try {
        const expectedScope = revokedScope ?? (revokedToken ? await scope(revokedToken) : null)
        const previous = lease ?? await options.storage.state()
        if (state.epoch !== epoch || disposed) return
        if (previous && (!revokeSession || (expectedScope !== null && previous.scope.endsWith(':' + expectedScope)))) await options.storage.clear(previous, revokeSession)
        if (state.epoch !== epoch || disposed) return
        record = { ...record, cleanupPending: false }
        if (!persist()) return
        update({ phase, stats: { bodyBytes: 0, entries: 0, indexBytes: 0 }, error: null })
      } catch {
        if (state.epoch === epoch) update({ phase: 'cleanup-failed', error: '已停止使用图标副本，但磁盘清理未完成。请重试清理。', lease: null })
      }
    })
    return clearTask
  }

  async function initialize() {
    if (initialized) return
    initialized = true
    try { record = readRecord(options.load()) } catch { block('unavailable'); return }
    lastClock = record.observedAt
    update({ trusted: record.trusted, dataset: record.dataset, checkedAt: record.receipt?.checked_at ?? null })
    if (record.cleanupPending) { await revoke(); return }
    if (!activeToken && record.receipt) { await revoke(); return }
    await synchronize()
  }
  async function acceptMetadata(metadata: IconCopyMetadata, expectedToken: string | null, isCurrent: () => boolean): Promise<void> {
    await initialize()
    let pending: Promise<void>
    do { pending = clearTask; await pending } while (pending !== clearTask)
    if (!expectedToken || expectedToken !== options.session()?.token || !isCurrent()) return
    const receipt = metadata.auth_receipt
    if (metadata.icon_local_copy_protocol !== ICON_COPY_PROTOCOL || !receipt || !metadata.dataset_epoch) {
      if (record.trusted) await revoke('unsupported')
      return
    }
    const permissionEpoch = state.epoch
    const digest = await scope(expectedToken)
    if (permissionEpoch !== state.epoch || record.cleanupPending || !isCurrent() || expectedToken !== options.session()?.token || receipt.cache_scope !== digest || record.revokedScope === digest || !iconScopeKey(metadata.dataset_epoch, digest)) return
    // Only this verified network path replaces the receipt. Reading a snapshot never renews it.
    activeToken = expectedToken
    currentScope = digest
    if (record.dataset && record.dataset !== metadata.dataset_epoch) block('checking')
    record = { ...record, revokedScope: null, receipt: { ...receipt, expires_at: Math.min(receipt.expires_at, options.session()!.expires_at) }, dataset: metadata.dataset_epoch, protocol: metadata.icon_local_copy_protocol, observedAt: now() }
    if (!persist()) return
    update({ dataset: record.dataset, checkedAt: receipt.checked_at, leaseUntil: iconLeaseUntil(receipt) })
    await synchronize()
  }
  async function setTrusted(trusted: boolean) {
    await initialize()
    if (!trusted) { record = { ...record, trusted: false }; update({ trusted: false }); await revoke('disabled', false); return }
    record = { ...record, trusted: true }
    update({ trusted: true })
    if (persist()) await synchronize()
  }
  async function clearCopies() { await initialize(); await revoke(record.trusted ? 'checking' : 'disabled', false); if (!record.cleanupPending) await synchronize() }
  function setDataset(dataset: string | undefined) {
    const next = dataset ?? null
    if (dataDataset === next) return
    dataDataset = next
    if (state.lease && state.dataset !== next) block('checking')
    if (initialized) void synchronize()
  }
  function authChanged() {
    const token = options.session()?.token ?? null
    if (token === activeToken) return
    const previousToken = activeToken
    record = { ...record, revokedScope: currentScope ?? record.receipt?.cache_scope ?? record.revokedScope }
    activeToken = token
    currentScope = null
    dataDataset = null
    void revoke(record.trusted ? 'waiting-auth' : 'disabled', true, true, previousToken)
  }
  function storageChanged(key: string | null) {
    if (disposed || writing) return
    if (key === AUTH_STORAGE_KEY || key === null) authChanged()
    if (key === ICON_DEVICE_KEY || key === null) {
      try { record = readRecord(options.load()) } catch { block('unavailable'); return }
      update({ trusted: record.trusted })
      if (!record.trusted || record.cleanupPending) block(record.trusted ? 'cleanup-failed' : 'disabled')
      else void synchronize()
    }
  }
  async function resume() {
    if (!initialized || disposed) return
    authChanged()
    if (state.lease) block('checking')
    // A resume checks both the durable fence and the local expiry before reusing any image.
    await synchronize()
  }
  function capture() {
    if (!permitted() || state.phase !== 'ready' || !state.lease) return null
    lastClock = Math.max(lastClock, now())
    return { lease: { ...state.lease }, epoch: state.epoch }
  }
  function checkpoint() {
    if (record.trusted && record.receipt && !record.cleanupPending) { record = { ...record, observedAt: Math.max(record.observedAt, lastClock, now()) }; persist() }
  }
  function isCurrent(captured: { lease: IconStorageLease; epoch: number }): boolean {
    return permitted() && state.phase === 'ready' && state.epoch === captured.epoch && state.lease?.generation === captured.lease.generation && state.lease.scope === captured.lease.scope
  }
  async function refreshStats() {
    const captured = capture()
    if (!captured) return
    const stats = await options.storage.state()
    if (stats && isCurrent(captured)) update({ stats: { bodyBytes: stats.bodyBytes, entries: stats.entries, indexBytes: stats.indexBytes } })
  }
  function dispose() { disposed = true; sequence++; if (expiry) clearTimeout(expiry); listeners.clear(); void options.storage.close() }
  return { subscribe: (listener: (value: IconDeviceSnapshot) => void) => { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    snapshot: () => state, initialize, acceptMetadata, setTrusted, clearCopies, setDataset, authChanged, storageChanged, resume, capture, isCurrent, refreshStats,
    beginLogout: () => { record = { ...record, revokedScope: currentScope ?? record.receipt?.cache_scope }; return revoke(record.trusted ? 'waiting-auth' : 'disabled', true, true, options.session()?.token ?? null) }, reportStorageError: failure, checkpoint, dispose, storage: options.storage }
}

export const iconDevice = createIconDeviceController({ storage: createIconCopyStorage(), session: getStoredAuthSession,
  load: () => typeof localStorage === 'undefined' ? null : localStorage.getItem(ICON_DEVICE_KEY),
  save: value => { if (typeof localStorage === 'undefined') throw new Error('storage unavailable'); localStorage.setItem(ICON_DEVICE_KEY, value) },
  notify: () => notifyBrowserStorageChange(ICON_DEVICE_KEY),
})
export function startIconDevice(): () => void {
  const stop = subscribeBrowserStorageChanges(key => iconDevice.storageChanged(key))
  const resume = () => { if (document.visibilityState !== 'hidden') { refreshStoredAuthSession(); void iconDevice.resume() } else iconDevice.checkpoint() }
  const checkpoint = () => iconDevice.checkpoint()
  window.addEventListener('pagehide', checkpoint)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)
  document.addEventListener('visibilitychange', resume)
  void iconDevice.initialize()
  return () => { stop(); window.removeEventListener('pagehide', checkpoint); window.removeEventListener('pageshow', resume); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); iconDevice.dispose() }
}
