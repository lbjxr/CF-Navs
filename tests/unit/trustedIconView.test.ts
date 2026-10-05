import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IconDeviceSnapshot } from '../../src/lib/iconDeviceState'
import { createTrustedIconView } from '../../src/lib/trustedIconView'

const harness = vi.hoisted(() => ({ state: {} as IconDeviceSnapshot, listeners: new Set<(state: IconDeviceSnapshot) => void>(), acquire: vi.fn() }))
vi.mock('../../src/lib/iconDeviceState', () => ({ iconDevice: {
  snapshot: () => harness.state,
  subscribe: (listener: (state: IconDeviceSnapshot) => void) => { harness.listeners.add(listener); listener(harness.state); return () => harness.listeners.delete(listener) },
} }))
vi.mock('../../src/lib/objectIconLoader', () => ({ objectIconLoader: { acquire: harness.acquire } }))
afterEach(() => { harness.listeners.clear(); vi.clearAllMocks() })
const image = { id: 1, icon: 'https://example.com/icon.svg', icon_display: 'image' as const, visible: true }
function publish(patch: Partial<IconDeviceSnapshot>) {
  harness.state = { ...harness.state, ...patch }
  for (const listener of harness.listeners) listener(harness.state)
}
function pendingState() {
  harness.state = { trusted: true, enabledForPage: false, phase: 'pending-reload', epoch: 0, lease: null,
    dataset: 'c'.repeat(32), leaseUntil: null, checkedAt: null, stats: { bodyBytes: 0, entries: 0, indexBytes: 0 }, error: null }
}
describe('trusted icon activation for the current document', () => {
  it('keeps existing and newly mounted views on the standard path until reload', () => {
    pendingState(); publish({ trusted: false, phase: 'disabled' })
    const changed = vi.fn()
    const existing = createTrustedIconView(changed)
    existing.set(image)
    publish({ trusted: true, phase: 'pending-reload' })
    const mounted = createTrustedIconView(changed)
    mounted.set({ ...image, id: 2, object_type: 'category' })
    // Even another lifecycle phase cannot bypass the document-level gate.
    publish({ phase: 'checking' }); publish({ phase: 'waiting-auth' }); publish({ phase: 'pending-reload' })
    expect(changed.mock.calls.every(([value]) => value.active === false)).toBe(true)
    expect(harness.acquire).not.toHaveBeenCalled()
    existing.destroy(); mounted.destroy()
  })
  it('loads trusted images only in a document whose startup enabled the mode', async () => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    const release = vi.fn()
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status: 'ready', url: 'blob:fixture' }), release })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    view.set(image)
    await Promise.resolve()
    expect(harness.acquire).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: 'blob:fixture' })
    publish({ trusted: false, enabledForPage: false, phase: 'disabled' })
    expect(release).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenLastCalledWith({ active: false, pending: false, url: '' })
    view.destroy()
  })
})
