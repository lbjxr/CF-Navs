import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIconDeviceController, ICON_DEVICE_KEY } from '../../src/lib/iconDeviceState'
import { IconStorageError, type IconCopyStorage } from '../../src/lib/iconCopyStorage'

const dataset = 'c'.repeat(32)
const firstScope = 'a'.repeat(64)
const secondScope = 'b'.repeat(64)
const controllers: ReturnType<typeof createIconDeviceController>[] = []
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()); vi.useRealTimers() })
function setup(prepareLegacyCopies?: (force?: boolean) => Promise<boolean>, enabled = true, initialRecord: string | null = null) {
  let session: { token: string; expires_at: number } | null = { token: 'fixture-one', expires_at: 100000 }
  let record: string | null = initialRecord
  let control: any = null
  let clock = 2000
  let denyClear = false
  let denySave = false
  const storage = {
    flushTouches: vi.fn(async () => undefined),
    state: vi.fn(async () => control ? { ...control } : null),
    activate: vi.fn(async (lease: any, allowed: () => boolean, previous: any) => {
      if (!allowed() || (control && (control.scope !== lease.scope || control.generation !== lease.generation) && previous?.generation !== control.generation)) throw new IconStorageError('stale')
      control = { ...lease, enabled: true, bodyBytes: 0, entries: 0, indexBytes: 4096 }
    }),
    clear: vi.fn(async (lease?: any) => { if (denyClear) throw new Error('disk failure'); if (!lease || control?.generation === lease.generation) { if (control) control = { ...control, enabled: false, bodyBytes: 0, entries: 0 } } }),
    close: vi.fn(async () => undefined),
  } as unknown as IconCopyStorage
  const make = () => {
    const device = createIconDeviceController({ storage, session: () => session, load: () => record,
      save: value => { if (denySave) throw new Error('storage disabled'); record = value }, now: () => clock,
      scope: async token => token === 'fixture-one' ? firstScope : secondScope, prepareLegacyCopies, enabled })
    controllers.push(device)
    return device
  }
  const device = make()
  const metadata = (scope = firstScope) => ({ dataset_epoch: dataset, icon_local_copy_protocol: 1 as const, auth_receipt: { cache_scope: scope, checked_at: 1000, expires_at: 100000 } })
  const ready = async () => { await device.initialize(); device.setDataset(dataset); await device.acceptMetadata(metadata(), session!.token, () => true); await device.setTrusted(true) }
  return { device, storage, make, ready, metadata, setSession: (value: typeof session) => { session = value }, setClock: (value: number) => { clock = value }, denyClear: (value: boolean) => { denyClear = value }, denySave: (value: boolean) => { denySave = value }, record: () => JSON.parse(record ?? '{}') }
}

describe('device-scoped icon permission lifecycle', () => {
  it('flushes pending touches on a valid lifecycle checkpoint, not after logout', async () => {
    const f = setup(); await f.ready()
    f.device.checkpoint()
    expect(f.storage.flushTouches).toHaveBeenCalledOnce()
    await f.device.beginLogout()
    f.device.checkpoint()
    expect(f.storage.flushTouches).toHaveBeenCalledOnce()
  })
  it('observes checkpoint flush errors and preserves quota-limited usable state', async () => {
    const f = setup(); await f.ready()
    vi.mocked(f.storage.flushTouches).mockRejectedValue(new IconStorageError('quota'))
    f.device.checkpoint()
    await Promise.resolve(); await Promise.resolve()
    expect(f.device.snapshot().error).toContain('空间不足')
    expect(f.device.capture()).not.toBeNull()
  })
  it('defaults off and requires both verified metadata and a matching applied dataset', async () => {
    const f = setup(); await f.device.initialize()
    expect(f.device.snapshot().trusted).toBe(false)
    await f.device.setTrusted(true)
    expect(f.device.capture()).toBeNull()
    await f.device.acceptMetadata(f.metadata(), 'fixture-one', () => true)
    expect(f.device.capture()).toBeNull()
    f.device.setDataset(dataset); await f.device.resume()
    expect(f.device.capture()).not.toBeNull()
    expect(JSON.stringify(f.record())).not.toContain('fixture-one')
  })
  it('blocks synchronously on logout and cannot be renewed by a late successful request', async () => {
    const f = setup(); await f.ready()
    const old = f.device.capture()!
    const clearing = f.device.beginLogout()
    expect(f.device.capture()).toBeNull()
    expect(f.device.isCurrent(old)).toBe(false)
    await clearing
    await f.device.acceptMetadata(f.metadata(), 'fixture-one', () => true)
    expect(f.device.capture()).toBeNull()
    expect(f.record().revokedScope).toBe(firstScope)
  })
  it('does not reuse an old scope after an identity change or accept an old response', async () => {
    const f = setup(); await f.ready()
    const old = f.device.capture()!
    f.setSession({ token: 'fixture-two', expires_at: 100000 }); f.device.authChanged()
    await f.device.acceptMetadata(f.metadata(), 'fixture-one', () => true)
    expect(f.device.isCurrent(old)).toBe(false)
    f.device.setDataset(dataset)
    await f.device.acceptMetadata(f.metadata(secondScope), 'fixture-two', () => true)
    expect(f.device.capture()!.lease.scope.endsWith(secondScope)).toBe(true)
    expect(f.device.capture()!.lease.generation).not.toBe(old.lease.generation)
  })
  it('restores the same generation in another document without renewing its lease', async () => {
    const f = setup(); await f.ready()
    const original = f.device.capture()!
    f.setClock(3000)
    const another = f.make(); another.setDataset(dataset); await another.initialize()
    expect(another.capture()!.lease).toEqual(original.lease)
    expect(f.record().receipt.checked_at).toBe(1000)
  })
  it('pauses on expiry or rollback and only a new network receipt can restore it', async () => {
    const f = setup(); await f.ready()
    f.setClock(100000); await f.device.resume()
    expect(f.device.snapshot().phase).toBe('expired')
    expect(f.device.capture()).toBeNull()
    f.setClock(2500)
    await f.device.acceptMetadata({ ...f.metadata(), auth_receipt: { ...f.metadata().auth_receipt, checked_at: 2200 } }, 'fixture-one', () => true)
    expect(f.device.capture()).not.toBeNull()
    f.setClock(2400)
    expect(f.device.capture()).toBeNull()
  })
  it('uses the local session expiry as an additional hard boundary', async () => {
    const f = setup(); f.setSession({ token: 'fixture-one', expires_at: 5000 }); await f.ready()
    expect(f.device.snapshot().leaseUntil).toBe(5000)
    f.setClock(5000); expect(f.device.capture()).toBeNull()
  })
  it('leaves failed disk cleanup blocked and retryable across documents', async () => {
    const f = setup(); await f.ready(); f.denyClear(true)
    await f.device.clearCopies()
    expect(f.device.snapshot().phase).toBe('cleanup-failed')
    expect(f.record().cleanupPending).toBe(true)
    expect(f.device.capture()).toBeNull()
    f.denyClear(false); await f.device.clearCopies()
    expect(f.device.capture()).not.toBeNull()
  })
  it('receives another tab disabling the preference before any new image read', async () => {
    const f = setup(); await f.ready()
    const another = f.make(); another.setDataset(dataset); await another.initialize()
    await f.device.setTrusted(false)
    another.storageChanged(ICON_DEVICE_KEY)
    expect(another.capture()).toBeNull()
    expect(another.snapshot().trusted).toBe(false)
  })
  it('can enable again after disabling without reusing the cleared generation', async () => {
    const f = setup(); await f.ready()
    const first = f.device.capture()!
    await f.device.setTrusted(false)
    expect(f.device.capture()).toBeNull()
    await f.device.setTrusted(true)
    expect(f.device.capture()!.lease.generation).not.toBe(first.lease.generation)
  })
  it('keeps authorized existing copies usable after a quota-only failure', async () => {
    const f = setup(); await f.ready()
    const first = f.device.capture()!
    f.device.reportStorageError(new IconStorageError('quota'))
    expect(f.device.isCurrent(first)).toBe(true)
    expect(f.device.snapshot().error).toContain('空间不足')
  })
  it('never enables persistent copies if saving the device preference fails', async () => {
    const f = setup(); await f.device.initialize(); f.denySave(true)
    await f.device.setTrusted(true)
    expect(f.device.snapshot().phase).toBe('unavailable')
    expect(f.device.capture()).toBeNull()
  })
  it('blocks trust until legacy cleanup succeeds and permits a later retry', async () => {
    let migrationComplete = false
    const f = setup(async () => migrationComplete)
    await f.device.initialize()
    f.device.setDataset(dataset)
    await f.device.setTrusted(true)
    expect(f.device.snapshot().phase).toBe('cleanup-failed')
    expect(f.device.snapshot().trusted).toBe(false)
    expect(f.device.capture()).toBeNull()

    migrationComplete = true
    await f.device.resume(true)
    await f.device.acceptMetadata(f.metadata(), 'fixture-one', () => true)
    await f.device.setTrusted(true)
    expect(f.device.capture()).not.toBeNull()
  })
  it('keeps trusted copies blocked after legacy cleanup fails, but still allows closing and clearing', async () => {
    let migrationComplete = true
    const f = setup(async () => migrationComplete)
    await f.ready()
    migrationComplete = false

    await f.device.resume(true)
    expect(f.device.snapshot().phase).toBe('cleanup-failed')
    expect(f.device.capture()).toBeNull()

    await f.device.setTrusted(false)
    expect(f.record().trusted).toBe(false)
    expect(f.device.capture()).toBeNull()
    expect(f.device.snapshot().phase).toBe('cleanup-failed')

    migrationComplete = true
    await f.device.resume(true)
    expect(f.device.snapshot().phase).toBe('disabled')
    expect(f.device.snapshot().trusted).toBe(false)
    expect(f.storage.clear).toHaveBeenCalled()
  })
  it('does not enable local copies when an older server omits the protocol', async () => {
    const f = setup()
    await f.device.initialize()
    f.device.setDataset(dataset)
    await f.device.acceptMetadata({ ...f.metadata(), icon_local_copy_protocol: undefined }, 'fixture-one', () => true)
    await f.device.setTrusted(true)

    expect(f.device.snapshot().trusted).toBe(true)
    expect(f.device.capture()).toBeNull()
    expect(f.storage.activate).not.toHaveBeenCalled()
  })
  it('builds a compatibility rollback that revokes trust, clears the new namespace, and cannot be re-enabled', async () => {
    const priorRecord = JSON.stringify({ schema: 1, trusted: true,
      receipt: { cache_scope: firstScope, checked_at: 1000, expires_at: 100000 }, dataset, protocol: 1,
      observedAt: 2000, cleanupPending: false })
    const f = setup(undefined, false, priorRecord)
    await f.device.initialize()

    expect(f.device.snapshot().phase).toBe('unsupported')
    expect(f.device.snapshot().trusted).toBe(false)
    expect(f.record().trusted).toBe(false)
    expect(f.record().receipt).toBeNull()
    expect(f.storage.clear).toHaveBeenCalled()

    await f.device.acceptMetadata(f.metadata(), 'fixture-one', () => true)
    await f.device.setTrusted(true)
    expect(f.device.capture()).toBeNull()
    expect(f.storage.activate).not.toHaveBeenCalled()
  })
})
