import { ICON_COPY_PROTOCOL, iconSessionScope, type IconAuthReceipt, type IconCopyMetadata } from '../../shared/iconLocalCopy'
import { AUTH_STORAGE_KEY, getStoredAuthSession, notifyBrowserStorageChange, refreshStoredAuthSession, subscribeBrowserStorageChanges } from './api'
import { iconLeaseUntil, iconPermissionFailure, iconScopeKey, type IconStorageLease, type IconStorageTotals } from './iconCachePolicy'
import { createIconCopyStorage, IconStorageError, type IconCopyStorage } from './iconCopyStorage'
import { LEGACY_ICON_LOCAL_STORAGE_PREFIX, migrateLegacyIconCopies } from './legacyIconCopyMigration'

export const ICON_DEVICE_KEY = 'cf-navs.icon-device-v1'
export const ICON_LOCAL_COPY_ENABLED = import.meta.env.MODE !== 'icon-compat'
export type IconDevicePhase = 'disabled' | 'pending-reload' | 'waiting-auth' | 'ready' | 'checking' | 'expired' | 'unsupported' | 'unavailable' | 'cleanup-failed'
interface DeviceRecord { schema: 1; trusted: boolean; receipt: IconAuthReceipt | null; dataset: string | null; protocol?: number; inlineProtocol?: number; observedAt: number; cleanupPending: boolean; revokedScope?: string | null }
export interface IconDeviceSnapshot {
  // Saved preference and document-scoped activation are deliberately separate.
  trusted: boolean; enabledForPage: boolean; phase: IconDevicePhase; epoch: number; lease: IconStorageLease | null
  inlineProtocol?: number
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
  prepareLegacyCopies?: (force?: boolean) => Promise<boolean>
  enabled?: boolean
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
  const enabled = options.enabled !== false
  let record = blankRecord()
  let dataDataset: string | null = null
  let activeToken = options.session()?.token ?? null
  let currentScope: string | null = null
  let lastClock = 0
  let sequence = 0
  let writing = false
  let initialized = false
  let recordLoaded = false
  let initialization: Promise<void> | null = null
  let disposed = false
  let expiry: ReturnType<typeof setTimeout> | null = null
  let clockRetry: ReturnType<typeof setTimeout> | null = null
  let receiptRenewal: ReturnType<typeof setTimeout> | null = null
  let clearTask: Promise<void> = Promise.resolve()
  let state: IconDeviceSnapshot = { trusted: false, enabledForPage: false, phase: 'disabled', epoch: 0, lease: null, dataset: null, leaseUntil: null, checkedAt: null, stats: { bodyBytes: 0, entries: 0, indexBytes: 0 }, error: null }
  const listeners = new Set<(snapshot: IconDeviceSnapshot) => void>()
  function update(patch: Partial<IconDeviceSnapshot>) { state = { ...state, ...patch }; for (const listener of listeners) listener(state) }
  function cancelReceiptRenewal() {
    if (receiptRenewal) clearTimeout(receiptRenewal)
    receiptRenewal = null
  }
  function block(phase: IconDevicePhase, error: string | null = null) {
    if (phase === 'expired' && record.receipt && now() < iconLeaseUntil(record.receipt)) {
      scheduleExpiry()
      return
    }
    sequence++
    cancelReceiptRenewal()
    if (clockRetry) clearTimeout(clockRetry)
    clockRetry = null
    if (expiry) clearTimeout(expiry)
    expiry = null
    update({ phase, error, lease: null, epoch: state.epoch + 1 })
  }
  function persist(): boolean {
    try { writing = true; options.save(JSON.stringify(record)); options.notify?.(); return true }
    catch { block('unavailable', '无法保存此设备设置；已停止使用图标副本，请检查浏览器存储权限。'); return false }
    finally { writing = false }
  }
  async function prepareLegacyCopies(force = false): Promise<boolean> {
    try {
      if (await (options.prepareLegacyCopies?.(force) ?? Promise.resolve(true))) {
        if (state.phase === 'cleanup-failed') update({ error: null })
        return true
      }
    } catch {
      // A failed migration must keep the trusted-copy path closed.
    }
    block('cleanup-failed', '旧版图标副本清理未完成；可信设备副本暂不可用，请重试或检查浏览器存储权限。')
    return false
  }
  function permitted(): boolean {
    return enabled && state.enabledForPage && !disposed && !record.cleanupPending && record.revokedScope !== currentScope && options.session()?.token === activeToken && activeToken !== null &&
      dataDataset === record.dataset && dataDataset !== null &&
      iconPermissionFailure({ trusted: record.trusted, protocol: record.protocol, cacheScope: currentScope,
        receipt: record.receipt, now: now(), lastObservedAt: Math.max(record.observedAt, lastClock) }) === null
  }
  function scheduleExpiry() {
    if (expiry) clearTimeout(expiry)
    if (!record.receipt) return
    const scheduledReceipt = { ...record.receipt }
    expiry = setTimeout(() => {
      expiry = null
      const currentReceipt = record.receipt
      // A callback that was already queued can run after a renewed receipt replaced
      // the timer. It must not expire the newer lease.
      if (!currentReceipt || currentReceipt.cache_scope !== scheduledReceipt.cache_scope ||
        currentReceipt.checked_at !== scheduledReceipt.checked_at || currentReceipt.expires_at !== scheduledReceipt.expires_at) return
      if (now() < iconLeaseUntil(currentReceipt)) {
        scheduleExpiry()
        return
      }
      block('expired')
    }, Math.max(0, Math.min(0x7fffffff, iconLeaseUntil(scheduledReceipt) - now())))
  }
  function failure(error: unknown) {
    if (error instanceof IconStorageError && error.reason === 'stale') return
    if (error instanceof IconStorageError && (error.reason === 'quota' || error.reason === 'corrupt')) {
      update({ error: error.reason === 'quota' ? '本机空间不足；保留已有副本，本次图片仅在内存中使用。' : '个别图标副本损坏；其余有效副本仍可使用。' }); return
    }
    update({ error: '本地图标存储不可用，已停止持久化。可清理副本后重试。', phase: 'unavailable', lease: null })
  }

  async function synchronize(retry = true, retryClock = true): Promise<void> {
    if (clockRetry) clearTimeout(clockRetry)
    clockRetry = null
    if (!enabled) {
      if (record.trusted || state.phase !== 'unsupported') await closeForCompatibility()
      return
    }
    const own = ++sequence
    const token = options.session()?.token ?? null
    if (!record.trusted) { update({ trusted: false, enabledForPage: false, phase: 'disabled', lease: null, error: null }); return }
    if (record.cleanupPending) { update({ phase: 'cleanup-failed', lease: null }); return }
    if (!state.enabledForPage) { update({ trusted: true, phase: 'pending-reload', lease: null }); return }
    if (!token || !record.receipt) { update({ trusted: true, phase: 'waiting-auth', lease: null }); return }
    try {
      const digest = await scope(token)
      if (disposed || own !== sequence || token !== options.session()?.token) return
      currentScope = digest
      const currentNow = now()
      const deniedByReceipt = iconPermissionFailure({ trusted: true, protocol: record.protocol, cacheScope: digest, receipt: record.receipt, now: currentNow, lastObservedAt: record.observedAt })
      // A stale expiry decision can race a renewed receipt during startup. Recheck the
      // current receipt before blocking; only its own lease boundary may expire it.
      const denied = deniedByReceipt === 'expired' && record.receipt && currentNow < iconLeaseUntil(record.receipt)
        ? null
        : deniedByReceipt
      if (denied === 'scope-mismatch' || denied === 'unauthenticated') { record = { ...record, revokedScope: record.receipt?.cache_scope }; await revoke('waiting-auth'); return }
      if (denied === 'clock') {
        // A fresh server receipt can arrive slightly ahead of this device's clock.
        // Do not relax permission checks or rewrite its timestamp: wait once until
        // local time catches up. Actual rollback or large skew requires rechecking.
        const ahead = (record.receipt?.checked_at ?? 0) - currentNow
        const transientSkew = retryClock && ahead > 0 && ahead <= 5000 && currentNow >= record.observedAt && currentNow >= lastClock
        block('checking', transientSkew ? null : '本机时钟异常，请同步系统时间并联网校验。')
        if (transientSkew) clockRetry = setTimeout(() => { clockRetry = null; void synchronize(true, false) }, ahead + 10)
        return
      }
      if (denied) {
        block(denied === 'expired' ? 'expired' : denied === 'unsupported' ? 'unsupported' : 'waiting-auth')
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
      // Rechecking a live lease (for example on focus) is not an invalidation.
      // Only a changed durable fence must discard in-memory image handles.
      if (state.lease && (!previous?.enabled || previous.scope !== state.lease.scope || previous.generation !== state.lease.generation)) {
        block('checking')
        await synchronize(retry, retryClock)
        return
      }
      const lease = previous?.enabled && previous.scope === key
        ? { scope: key, generation: previous.generation }
        : { scope: key, generation: crypto.randomUUID() }
      const valid = () => own === sequence && permitted()
      await options.storage.activate(lease, valid, previous)
      if (!valid()) return
      const stats = await options.storage.state()
      if (!valid()) return
      update({ trusted: true, phase: 'ready', lease, inlineProtocol: record.inlineProtocol, dataset: record.dataset, leaseUntil: iconLeaseUntil(record.receipt!), checkedAt: record.receipt!.checked_at,
        stats: stats ? { bodyBytes: stats.bodyBytes, entries: stats.entries, indexBytes: stats.indexBytes } : state.stats, error: null })
      scheduleExpiry()
    } catch (error) {
      if (own !== sequence) return
      // A failed fence check cannot leave the previously displayed lease usable.
      if (state.lease) block('checking')
      if (retry && error instanceof IconStorageError && error.reason === 'stale') await synchronize(false)
      else failure(error)
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

  async function closeForCompatibility(): Promise<void> {
    record = { ...record, trusted: false }
    update({ trusted: false, enabledForPage: false })
    await revoke('unsupported', true)
    try {
      await options.storage.clear()
    } catch {
      block('cleanup-failed', '兼容回滚清理未完成；图标副本能力保持关闭，请重试清理。')
    }
  }

  async function initialize(forceLegacyCheck = false) {
    if (initialized || disposed) return
    if (initialization) return initialization
    const task = (async () => {
      if (!recordLoaded) {
        try { record = readRecord(options.load()) } catch { block('unavailable'); return }
        recordLoaded = true
        lastClock = record.observedAt
        update({ trusted: record.trusted, enabledForPage: enabled && record.trusted, dataset: record.dataset, checkedAt: record.receipt?.checked_at ?? null })
      }
      if (!await prepareLegacyCopies(forceLegacyCheck)) return
      initialized = true
      if (!enabled) { await closeForCompatibility(); return }
      if (record.cleanupPending) { await revoke(); return }
      if (!activeToken && record.receipt) { await revoke(); return }
      await synchronize()
    })()
    initialization = task
    try { await task } finally { if (initialization === task) initialization = null }
  }
  async function acceptMetadata(metadata: IconCopyMetadata, expectedToken: string | null, isCurrent: () => boolean): Promise<void> {
    await initialize()
    if (!initialized || !enabled) return
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
    cancelReceiptRenewal()
    const currentNow = now()
    const ahead = receipt.checked_at - currentNow
    // A refresh must not evict every displayed icon just because its new receipt
    // is slightly ahead of the local clock. Keep the independently valid old
    // lease until the unmodified new receipt becomes usable. Cold starts and
    // expired/revoked leases still follow the fail-closed synchronization path.
    if (state.phase === 'ready' && permitted() && record.dataset === metadata.dataset_epoch &&
      ahead > 0 && ahead <= 5000 && record.receipt && iconLeaseUntil(record.receipt) > receipt.checked_at + 10) {
      const pending = { ...metadata, auth_receipt: { ...receipt } }
      receiptRenewal = setTimeout(() => {
        receiptRenewal = null
        // One attempt only: a stopped/rolled-back clock cannot create a poll loop.
        if (disposed || state.epoch !== permissionEpoch || now() < receipt.checked_at ||
          !isCurrent() || expectedToken !== options.session()?.token) return
        void acceptMetadata(pending, expectedToken, isCurrent)
      }, ahead + 10)
      return
    }
    // Only this verified network path replaces the receipt. Reading a snapshot never renews it.
    activeToken = expectedToken
    currentScope = digest
    if (record.dataset && record.dataset !== metadata.dataset_epoch) block('checking')
    record = { ...record, revokedScope: null, receipt: { ...receipt, expires_at: Math.min(receipt.expires_at, options.session()!.expires_at) }, dataset: metadata.dataset_epoch, protocol: metadata.icon_local_copy_protocol, inlineProtocol: metadata.icon_inline_copy_protocol, observedAt: now() }
    if (!persist()) return
    update({ dataset: record.dataset, checkedAt: receipt.checked_at, leaseUntil: iconLeaseUntil(receipt) })
    await synchronize()
  }
  async function setTrusted(trusted: boolean) {
    await initialize()
    if (!trusted) {
      record = { ...record, trusted: false }; update({ trusted: false, enabledForPage: false }); await revoke('disabled', false)
      if (!await prepareLegacyCopies()) return
      if (!initialized) await initialize()
      return
    }
    if (!initialized || !enabled) return
    if (record.trusted) return
    // Persist intent only. This document keeps its existing image path; only a
    // new controller's first record load may enable trusted copies for the page.
    record = { ...record, trusted: true }
    if (persist()) update({ trusted: true, phase: record.cleanupPending ? 'cleanup-failed' : 'pending-reload', error: record.cleanupPending ? state.error : null })
    else record = { ...record, trusted: false }
  }
  async function clearCopies() {
    const wasInitialized = initialized
    await initialize()
    await revoke(record.trusted ? 'checking' : 'disabled', false)
    if (record.cleanupPending) return
    if (!wasInitialized) await initialize()
    else await synchronize()
  }
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
      update({ trusted: record.trusted, enabledForPage: state.enabledForPage && record.trusted })
      if (!record.trusted || record.cleanupPending) block(record.trusted ? 'cleanup-failed' : 'disabled')
      else void synchronize()
    }
  }
  async function resume(forceLegacyCheck = false) {
    if (disposed) return
    if (recordLoaded && !await prepareLegacyCopies(forceLegacyCheck)) return
    await initialize(forceLegacyCheck)
    if (!initialized || disposed) return
    authChanged()
    // Validate expiry and the durable fence without discarding an unchanged lease.
    // synchronize invalidates images if permission or the durable generation changed.
    await synchronize()
  }
  function capture() {
    if (!permitted() || state.phase !== 'ready' || !state.lease) return null
    lastClock = Math.max(lastClock, now())
    return { lease: { ...state.lease }, epoch: state.epoch }
  }
  function checkpoint() {
    const captured = capture()
    if (captured) void options.storage.flushTouches().catch(error => {
      if (isCurrent(captured) && !(error instanceof IconStorageError && error.reason === 'stale')) failure(error)
    })
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
  function dispose() { disposed = true; sequence++; cancelReceiptRenewal(); if (clockRetry) clearTimeout(clockRetry); if (expiry) clearTimeout(expiry); listeners.clear(); void options.storage.close() }
  return { subscribe: (listener: (value: IconDeviceSnapshot) => void) => { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    snapshot: () => state, initialize, acceptMetadata, setTrusted, clearCopies, setDataset, authChanged, storageChanged, resume, capture, isCurrent, refreshStats,
    beginLogout: () => { record = { ...record, revokedScope: currentScope ?? record.receipt?.cache_scope }; return revoke(record.trusted ? 'waiting-auth' : 'disabled', true, true, options.session()?.token ?? null) }, reportStorageError: failure, checkpoint, dispose, storage: options.storage }
}

export const iconDevice = createIconDeviceController({ storage: createIconCopyStorage(), session: getStoredAuthSession,
  load: () => typeof localStorage === 'undefined' ? null : localStorage.getItem(ICON_DEVICE_KEY),
  save: value => { if (typeof localStorage === 'undefined') throw new Error('storage unavailable'); localStorage.setItem(ICON_DEVICE_KEY, value) },
  prepareLegacyCopies: async force => (await migrateLegacyIconCopies(force)).complete,
  enabled: ICON_LOCAL_COPY_ENABLED,
  notify: () => notifyBrowserStorageChange(ICON_DEVICE_KEY),
})
export function startIconDevice(): () => void {
  const stop = subscribeBrowserStorageChanges(key => iconDevice.storageChanged(key))
  const resume = () => { if (document.visibilityState !== 'hidden') { refreshStoredAuthSession(); void iconDevice.resume(true) } else iconDevice.checkpoint() }
  const checkpoint = () => iconDevice.checkpoint()
  const legacyStorageWrite = (event: StorageEvent) => {
    if (event.newValue !== null && event.key?.startsWith(LEGACY_ICON_LOCAL_STORAGE_PREFIX)) void iconDevice.resume(true)
  }
  window.addEventListener('pagehide', checkpoint)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)
  window.addEventListener('storage', legacyStorageWrite)
  document.addEventListener('visibilitychange', resume)
  void iconDevice.initialize(true)
  return () => { stop(); window.removeEventListener('pagehide', checkpoint); window.removeEventListener('pageshow', resume); window.removeEventListener('focus', resume); window.removeEventListener('storage', legacyStorageWrite); document.removeEventListener('visibilitychange', resume); iconDevice.dispose() }
}
