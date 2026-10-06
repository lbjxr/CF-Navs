import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IconDeviceSnapshot } from '../../src/lib/iconDeviceState'
import { bookmarkDescriptor, createTrustedIconView } from '../../src/lib/trustedIconView'

const harness = vi.hoisted(() => ({ state: {} as IconDeviceSnapshot, listeners: new Set<(state: IconDeviceSnapshot) => void>(), acquire: vi.fn() }))
vi.mock('../../src/lib/iconDeviceState', () => ({ iconDevice: {
  snapshot: () => harness.state,
  subscribe: (listener: (state: IconDeviceSnapshot) => void) => { harness.listeners.add(listener); listener(harness.state); return () => harness.listeners.delete(listener) },
} }))
vi.mock('../../src/lib/objectIconLoader', () => ({ objectIconLoader: { acquire: harness.acquire } }))
afterEach(() => { harness.listeners.clear(); vi.clearAllMocks(); vi.useRealTimers() })
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
  it.each([true, 1])('recognizes legacy server image metadata without inline bytes or a revision: %s', icon_cached => {
    const descriptor = bookmarkDescriptor({ id: 7, icon: null, icon_blob: null, icon_cached, visible: true }, 'c'.repeat(32))
    expect(descriptor).toMatchObject({ state: 'unknown', content_revision: null })
    expect(bookmarkDescriptor({ id: 7, icon_cached, icon_revision: 'sha256-' + 'a'.repeat(64), visible: true }, 'c'.repeat(32))).toMatchObject({ state: 'ready' })
    expect(bookmarkDescriptor({ id: 7, icon_cached, icon_display: 'empty', visible: true }, 'c'.repeat(32))).toMatchObject({ state: 'empty' })
  })
  it('passes a cache-flag-only bookmark into materialization instead of treating it as empty', async () => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status: 'ready', url: 'blob:legacy' }), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set({ id: 7, icon: null, icon_blob: null, icon_cached: 1, visible: true }); await Promise.resolve()
      expect(harness.acquire).toHaveBeenCalledWith(expect.objectContaining({ object_id: 7, state: 'unknown' }), undefined, false)
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: 'blob:legacy' })
    } finally { view.destroy() }
  })

  it.each(['bookmark', 'category'] as const)('falls back to the existing renderer on a transient %s copy failure', async object_type => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status: 'retryable', url: null }), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set({ ...image, object_type }); await Promise.resolve()
      expect(changed).toHaveBeenLastCalledWith({ active: false, pending: false, url: '' })
    } finally { view.destroy() }
  })
  it('does not hide the online fallback during a background retry', async () => {
    vi.useFakeTimers(); pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    let finish!: (value: any) => void
    harness.acquire.mockReturnValueOnce({ result: Promise.resolve({ status: 'retryable', url: null }), release: vi.fn() })
      .mockReturnValueOnce({ result: new Promise(resolve => { finish = resolve }), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); await Promise.resolve(); changed.mockClear()
      await vi.advanceTimersByTimeAsync(1200)
      expect(changed.mock.calls.some(([state]) => state.active && !state.url)).toBe(false)
      finish({ status: 'ready', url: 'blob:recovered' }); await Promise.resolve()
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: 'blob:recovered' })
    } finally { view.destroy() }
  })
  it.each(['blocked', 'empty'])('does not bypass an explicit %s result', async status => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status, url: null }), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); await Promise.resolve()
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '' })
    } finally { view.destroy() }
  })
  it('returns to the online renderer after a trusted image fails browser decoding', async () => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    const release = vi.fn()
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status: 'ready', url: 'blob:broken' }), release })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); await Promise.resolve(); view.failed()
      expect(release).toHaveBeenCalledOnce()
      expect(changed).toHaveBeenLastCalledWith({ active: false, pending: false, url: '' })
    } finally { view.destroy() }
  })
  it('does not request online images for invisible permission-pending views', () => {
    pendingState(); publish({ enabledForPage: true, phase: 'expired' })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set({ ...image, visible: false })
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '' })
      expect(harness.acquire).not.toHaveBeenCalled()
    } finally { view.destroy() }
  })
  it('recovers from a rejected copy promise without disabling the online renderer', async () => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    harness.acquire.mockReturnValue({ result: Promise.reject(new Error('read failed')), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); await Promise.resolve(); await Promise.resolve()
      expect(changed).toHaveBeenLastCalledWith({ active: false, pending: false, url: '' })
    } finally { view.destroy() }
  })
  it.each(['checking', 'waiting-auth', 'expired', 'cleanup-failed'] as const)('uses only a fresh same-origin online request while %s', async phase => {
    vi.useFakeTimers()
    pendingState(); publish({ enabledForPage: true, phase })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set({ ...image, icon_blob: 'data:image/png;base64,stale', online_url: '/api/icon/1?key=fixture' })
      if (phase === 'checking') await vi.advanceTimersByTimeAsync(1200)
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '/api/icon/1?key=fixture' })
      expect(harness.acquire).not.toHaveBeenCalled()
      view.failed()
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '' })
    } finally { view.destroy() }
  })
  it('never uses another object or external URL as a permission-pending fallback', () => {
    pendingState(); publish({ enabledForPage: true, phase: 'expired' })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { for (const online_url of ['https://example.com/private.png', '/api/icon/2?key=fixture', 'data:image/png;base64,stale']) {
      view.set({ ...image, object_type: 'category', online_url })
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '/api/category-icon/1?v=0' })
    } } finally { view.destroy() }
  })
  it('restores warm copies before the startup grace interval without an online request', async () => {
    vi.useFakeTimers(); pendingState(); publish({ enabledForPage: true, phase: 'checking' })
    harness.acquire.mockReturnValue({ result: Promise.resolve({ status: 'ready', url: 'blob:warm' }), release: vi.fn() })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); await vi.advanceTimersByTimeAsync(100); publish({ phase: 'ready' }); await Promise.resolve()
      await vi.advanceTimersByTimeAsync(1500)
      expect(changed.mock.calls.some(([value]) => value.url.startsWith('/api/'))).toBe(false)
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: 'blob:warm' })
    } finally { view.destroy() }
  })
  it('does not let a late copy response replace the expiry-safe online path', async () => {
    pendingState(); publish({ enabledForPage: true, phase: 'ready' })
    let finish!: (value: any) => void
    const release = vi.fn()
    harness.acquire.mockReturnValue({ result: new Promise(resolve => { finish = resolve }), release })
    const changed = vi.fn(); const view = createTrustedIconView(changed)
    try { view.set(image); publish({ epoch: 1, phase: 'expired' }); finish({ status: 'ready', url: 'blob:stale' }); await Promise.resolve()
      expect(release).toHaveBeenCalledOnce()
      expect(changed).toHaveBeenLastCalledWith({ active: true, pending: false, url: '/api/icon/1?v=0' })
    } finally { view.destroy() }
  })

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

describe('verified icon identity survives snapshot hydration',()=>{
  const revision='sha256-'+'a'.repeat(64)
  function setup(object_type: 'bookmark'|'category'='bookmark') {
    pendingState();publish({enabledForPage:true,phase:'ready'})
    const input={id:7,object_type,icon:null,icon_blob:null,icon_cached:true,icon_display:'image' as const,icon_revision:revision,icon_write_epoch:1,visible:true,online_url:'/api/icon/7?v=old'}
    const descriptor=bookmarkDescriptor(input,harness.state.dataset!)
    const release=vi.fn(),changed=vi.fn()
    harness.acquire.mockReturnValue({result:Promise.resolve({status:'ready',url:'blob:verified',descriptor}),release})
    return {input,release,changed,view:createTrustedIconView(changed)}
  }
  it.each(['bookmark','category'] as const)('keeps the %s handle when identical source fields are hydrated',async type=>{
    const f=setup(type)
    try {
      f.view.set(f.input);await Promise.resolve();f.changed.mockClear()
      f.view.set({...f.input,icon:'data:image/svg+xml;base64,PHN2Zy8+',icon_blob:'data:image/svg+xml;base64,PHN2Zy8+',icon_cached:false,online_url:'/api/icon/7?v=new'})
      expect(f.release).not.toHaveBeenCalled();expect(harness.acquire).toHaveBeenCalledOnce();expect(f.changed).not.toHaveBeenCalled()
    } finally {f.view.destroy()}
  })
  it('does not release a verified local image just to renew its online key',async()=>{
    const f=setup();try{f.view.set(f.input);await Promise.resolve();f.view.set({...f.input,online_url:'/api/icon/7?key=renewed'});expect(f.release).not.toHaveBeenCalled();expect(harness.acquire).toHaveBeenCalledOnce()}finally{f.view.destroy()}
  })
  it.each(['revision','dataset','permission','empty','hidden'])('still releases on %s changes',async kind=>{
    const f=setup();try{
      f.view.set(f.input);await Promise.resolve()
      if(kind==='dataset') publish({dataset:'d'.repeat(32)})
      else if(kind==='permission') publish({epoch:1,phase:'waiting-auth'})
      else if(kind==='empty') f.view.set({...f.input,icon_display:'empty'})
      else if(kind==='hidden') f.view.set({...f.input,visible:false})
      else f.view.set({...f.input,icon_revision:'sha256-'+'b'.repeat(64)})
      expect(f.release).toHaveBeenCalledOnce()
    } finally {f.view.destroy()}
  })
})
