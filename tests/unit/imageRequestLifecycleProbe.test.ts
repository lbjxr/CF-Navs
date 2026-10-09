import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { webcrypto, createHash } from 'node:crypto'
import { pageInstallImageLifecycleProbe } from '../../scripts/lib/imageRequestLifecycleProbe.mjs'

type LifecycleEvent = {
  kind: 'observed' | 'src-changed' | 'removed' | 'loaded' | 'error'
  time: number
  nodeId: number
  sourceId: number | null
  object: string
  previousSourceId?: number | null
  previousObject?: string | null
  changedQueryKeys?: string[]
  complete?: boolean
  naturalWidth?: number
  naturalHeight?: number
}
type Probe = {
  registerBlob(url: string, blob: Blob): void
  unregisterBlob(url: string): void
  readAdoptions(): Promise<Array<Record<string, unknown>>>
  read(): { events: LifecycleEvent[]; timeOrigin: number; dropped: number }
  sourceId(url: string | null): number | null
  stop(): void
}

const origin = 'https://probe.example.test'
const installSource = '(' + pageInstallImageLifecycleProbe.toString() + ')()'
let dom: JSDOM
let page: JSDOM['window'] & { __issueImageLifecycle?: Probe }
let document: Document

function install(): Probe {
  expect(page.eval(installSource)).toEqual({ installed: true })
  return page.__issueImageLifecycle!
}
function image(src: string, parent: Element = document.body): HTMLImageElement {
  const element = document.createElement('img')
  element.setAttribute('src', src)
  parent.appendChild(element)
  return element
}
function ofKind(probe: Probe, kind: LifecycleEvent['kind']) {
  return probe.read().events.filter(event => event.kind === kind)
}

beforeEach(() => {
  // No browser, resource loader, live configuration, or outside network is used.
  // An isolated realm also catches accidental closure/import dependencies in the
  // exact function string that Runtime.evaluate / addScriptOnNewDocument receives.
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: origin + '/app/', runScripts: 'outside-only',
  })
  page = dom.window
  document = page.document
})
afterEach(() => {
  page.__issueImageLifecycle?.stop()
  vi.restoreAllMocks()
  dom.window.close()
})

describe('pageInstallImageLifecycleProbe', () => {
  it('records a loaded replacement only in the same native-image container and verifies actual Blob bytes', async () => {
    Object.defineProperty(page.crypto, 'subtle', { value: webcrypto.subtle })
    Object.defineProperty(page, 'TextEncoder', { value: TextEncoder })
    const slot = document.createElement('span'); document.body.appendChild(slot)
    const old = image('/api/category-icon/7?key=fake-secret', slot), probe = install()
    const blob = new Blob(['fixture-image-bytes'], { type: 'image/svg+xml' })
    const url = 'blob:' + origin + '/fake-blob'
    probe.registerBlob(url, blob)
    old.remove(); probe.read()
    const loaded = image(url, slot)
    Object.defineProperties(loaded, { complete: { value: true }, naturalWidth: { value: 16 }, naturalHeight: { value: 16 } })
    loaded.dispatchEvent(new page.Event('load'))
    const revision = 'sha256-' + createHash('sha256').update('cf-navs-icon-v1\nimage/svg+xml\nfixture-image-bytes').digest('hex')
    expect(await probe.readAdoptions()).toEqual([expect.objectContaining({ object: 'category:7', byteLength: blob.size, revision, naturalWidth: 16 })])
    const unrelated = image(url)
    Object.defineProperties(unrelated, { complete: { value: true }, naturalWidth: { value: 16 }, naturalHeight: { value: 16 } })
    unrelated.dispatchEvent(new page.Event('load'))
    expect(await probe.readAdoptions()).toHaveLength(1)
    const serialized = JSON.stringify(await probe.readAdoptions())
    expect(serialized).not.toContain('fake-')
    expect(serialized).not.toContain('fixture-image-bytes')
    probe.unregisterBlob(url)
  })

  it('serializes independently, installs before documentElement, and stays idempotent', async () => {
    document.documentElement.remove()
    const probe = install()
    const html = document.createElement('html')
    const body = document.createElement('body')
    html.appendChild(body)
    document.appendChild(html)
    const takeRecords = vi.spyOn(page.MutationObserver.prototype, 'takeRecords')
    image('/api/icon/1')
    await Promise.resolve()
    expect(probe.read().events).toHaveLength(1)
    // Delivery happened asynchronously, rather than being rescued by read().
    expect(takeRecords.mock.results.at(-1)?.value).toHaveLength(0)
    expect(probe.read().events[0]).toMatchObject({ kind: 'observed', object: 'bookmark:1' })
    expect(page.eval(installSource)).toEqual({ installed: false })
    expect(page.__issueImageLifecycle).toBe(probe)
    expect(probe.read().timeOrigin).toBe(page.performance.timeOrigin)
  })

  it('links replacements to MutationRecord.oldValue, including batched intermediate URLs', () => {
    const first = '/api/icon/7?key=fake-old&same=unchanged&tag=a&tag=b'
    const second = '/api/icon/7?key=fake-next&same=unchanged&tag=a&tag=c&v=2'
    const third = '/api/icon/7?token=fake-token&same=unchanged&tag=a&tag=c'
    const element = image(first)
    const probe = install()
    const initial = probe.read().events[0]
    element.setAttribute('src', second)
    element.setAttribute('src', third)
    const changes = ofKind(probe, 'src-changed')
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ nodeId: initial.nodeId, object: 'bookmark:7',
      previousSourceId: probe.sourceId(first), sourceId: probe.sourceId(second),
      previousObject: 'bookmark:7', changedQueryKeys: ['key', 'tag', 'v'] })
    expect(changes[1]).toMatchObject({ nodeId: initial.nodeId, object: 'bookmark:7',
      previousSourceId: probe.sourceId(second), sourceId: probe.sourceId(third),
      changedQueryKeys: ['key', 'token', 'v'] })
    expect(new Set([initial.sourceId, changes[0].sourceId, changes[1].sourceId]).size).toBe(3)
    expect(probe.sourceId(first)).toBe(probe.sourceId(origin + first))
  })

  it('preserves a same-batch round trip instead of comparing every record to final src', () => {
    const element = image('/api/icon/7?v=first')
    const probe = install()
    const first = probe.sourceId(element.src)
    element.src = '/api/icon/7?v=middle'
    element.src = '/api/icon/7?v=first'
    const middle = probe.sourceId('/api/icon/7?v=middle')
    expect(ofKind(probe, 'src-changed').map(({ previousSourceId, sourceId }) => [previousSourceId, sourceId]))
      .toEqual([[first, middle], [middle, first]])
  })

  it('captures an unobserved previous URL instead of inventing a last-seen source', () => {
    const probe = install()
    const first = '/api/category-icon/12?v=old'
    const second = '/api/category-icon/12?v=new'
    const element = image(first)
    element.src = second
    const events = probe.read().events
    expect(events.map(event => event.kind)).toEqual(['observed', 'src-changed'])
    expect(events[0].sourceId).toBe(probe.sourceId(first))
    expect(events[1]).toMatchObject({ previousSourceId: probe.sourceId(first),
      sourceId: probe.sourceId(second), object: 'category:12', changedQueryKeys: ['v'] })
  })

  it('ignores identical resolved URLs and keeps distinct nodes for an identical source', () => {
    const one = image('/api/icon/9?key=fake-key')
    const two = image('/api/icon/9?key=fake-key')
    const probe = install()
    const observations = ofKind(probe, 'observed')
    expect(observations[0].nodeId).not.toBe(observations[1].nodeId)
    expect(observations[0].sourceId).toBe(observations[1].sourceId)
    one.src = origin + '/api/icon/9?key=fake-key'
    two.setAttribute('src', two.getAttribute('src')!)
    expect(ofKind(probe, 'src-changed')).toEqual([])
    one.src = '/api/icon/9?key=fake-other'
    expect(ofKind(probe, 'src-changed')[0].nodeId).toBe(observations[0].nodeId)
  })

  it('records src removal and resets without using img.src as the previous value', () => {
    const element = image('/api/icon/3?key=fake-secret')
    const probe = install()
    const previous = probe.sourceId(element.src)
    element.removeAttribute('src')
    element.src = '/api/icon/3?key=fake-restored'
    element.src = ''
    const changes = ofKind(probe, 'src-changed')
    expect(changes).toHaveLength(3)
    expect(changes[0]).toMatchObject({ previousSourceId: previous,
      sourceId: null, object: 'bookmark:3', changedQueryKeys: ['key'] })
    expect(changes[1]).toMatchObject({ previousSourceId: null, previousObject: null,
      sourceId: probe.sourceId('/api/icon/3?key=fake-restored') })
    expect(changes[2]).toMatchObject({ sourceId: null, changedQueryKeys: ['key'] })
    expect(probe.sourceId(null)).toBeNull()
    expect(probe.sourceId('')).toBeNull()
    expect(probe.sourceId('http://[')).toBeNull()
  })

  it('identifies cross-owner transitions and departures to non-icon sources', () => {
    const element = image('/api/icon/4')
    const probe = install()
    element.src = '/api/category-icon/5'
    element.src = 'blob:' + origin + '/fake-blob'
    element.src = 'https://other.example.test/api/icon/4'
    const changes = ofKind(probe, 'src-changed')
    expect(changes).toHaveLength(2)
    expect(changes[0]).toMatchObject({ object: 'category:5', previousObject: 'bookmark:4' })
    expect(changes[1]).toMatchObject({ object: 'category:5', previousObject: 'category:5',
      sourceId: probe.sourceId('blob:' + origin + '/fake-blob') })
  })

  it('records subtree removal but not connected reparenting, reorder, or same-batch reinsertion', () => {
    const left = document.createElement('section')
    const right = document.createElement('section')
    document.body.append(left, right)
    const one = image('/api/icon/1', left)
    const two = image('/api/category-icon/2', right)
    const probe = install()
    const initial = ofKind(probe, 'observed')
    right.appendChild(one)
    right.insertBefore(one, two)
    two.remove()
    right.appendChild(two)
    expect(ofKind(probe, 'removed')).toEqual([])
    right.remove()
    expect(ofKind(probe, 'removed').map(event => ({ nodeId: event.nodeId, sourceId: event.sourceId })))
      .toEqual(initial.map(event => ({ nodeId: event.nodeId, sourceId: event.sourceId })))
    expect(one.isConnected).toBe(false)
    expect(two.isConnected).toBe(false)
  })

  it('does not count intermediate reparenting as an extra removal before a final detach', () => {
    const element = image('/api/icon/1')
    const container = document.createElement('section')
    document.body.appendChild(container)
    const probe = install()
    container.appendChild(element)
    element.remove()
    expect(ofKind(probe, 'removed')).toHaveLength(1)
  })

  it('uses the source at removal rather than the installation-time source', () => {
    const element = image('/api/icon/8?key=fake-before')
    const probe = install()
    element.src = '/api/icon/8?key=fake-final'
    element.remove()
    const removed = ofKind(probe, 'removed')
    expect(removed).toHaveLength(1)
    expect(removed[0].sourceId).toBe(probe.sourceId('/api/icon/8?key=fake-final'))
  })

  it('captures non-bubbling load/error, drains pending src changes first, and reports dimensions', () => {
    const element = image('/api/category-icon/6?v=first')
    const probe = install()
    element.src = '/api/category-icon/6?v=second'
    Object.defineProperties(element, {
      complete: { value: true }, naturalWidth: { value: 32 }, naturalHeight: { value: 24 },
    })
    element.dispatchEvent(new page.Event('load', { bubbles: false }))
    element.dispatchEvent(new page.Event('error', { bubbles: false }))
    document.body.dispatchEvent(new page.Event('error'))
    const events = probe.read().events
    expect(events.map(event => event.kind)).toEqual(['observed', 'src-changed', 'loaded', 'error'])
    expect(events[2]).toMatchObject({ sourceId: probe.sourceId(element.src), object: 'category:6',
      complete: true, naturalWidth: 32, naturalHeight: 24 })
    expect(events[3]).toMatchObject({ nodeId: events[2].nodeId, sourceId: events[2].sourceId })
    expect(events[3]).not.toHaveProperty('complete')
    expect(events.every(event => Number.isFinite(event.time) && event.time >= 0)).toBe(true)
    expect(events.map(event => event.time)).toEqual(events.map(event => event.time).sort((a, b) => a - b))
  })

  it('filters cross-origin, non-icon, malformed IDs, srcset-only, and non-img activity', () => {
    const ignored = [
      'https://other.example.test/api/icon/1', '/api/icon/1/extra', '/api/category-icon/secret',
      '/api/icon/0', '/api/icon/-1', '/api/icon/1.5', '/api/icon/1e2', '/asset.png', 'data:image/png;base64,AA==',
    ].map(src => image(src))
    const probe = install()
    for (const element of ignored) {
      element.dispatchEvent(new page.Event('load'))
      element.src += '?v=changed'
      element.remove()
    }
    const img = document.createElement('img')
    document.body.appendChild(img)
    img.setAttribute('srcset', '/api/icon/1 1x')
    const div = document.createElement('div')
    document.body.appendChild(div)
    div.setAttribute('src', '/api/icon/1')
    expect(probe.read().events).toEqual([])
    image('/api/icon/10')
    image('/api/category-icon/11')
    expect(probe.read().events.map(event => event.object)).toEqual(['bookmark:10', 'category:11'])
  })

  it('exposes only safe fields and query names, never URLs, query values or DOM text', () => {
    const element = image('/api/icon/42?key=fake-original-secret&token=fake-token&v=fake-revision')
    element.alt = 'fake-private-alt'
    element.id = 'fake-private-id'
    element.setAttribute('data-token', 'fake-dom-token')
    document.body.appendChild(document.createTextNode('fake-private-text'))
    const probe = install()
    element.src = '/api/icon/42?key=fake-next-secret&token=fake-next-token&v=fake-next-revision'
    element.dispatchEvent(new page.Event('load'))
    element.dispatchEvent(new page.Event('error'))
    element.remove()
    const snapshot = probe.read()
    const allowed = new Set(['kind', 'time', 'nodeId', 'sourceId', 'object', 'previousSourceId',
      'previousObject', 'changedQueryKeys', 'complete', 'naturalWidth', 'naturalHeight'])
    expect(Object.keys(snapshot).sort()).toEqual(['dropped', 'events', 'timeOrigin'])
    expect(snapshot.events.every(event => Object.keys(event).every(key => allowed.has(key)))).toBe(true)
    expect(ofKind(probe, 'src-changed')[0].changedQueryKeys).toEqual(['key', 'token', 'v'])
    const serialized = JSON.stringify(snapshot)
    for (const forbidden of [origin, '/api/', 'fake-', 'https:', '?', 'key=', 'token=']) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(Object.keys(probe).sort()).toEqual(['read', 'readAdoptions', 'registerBlob', 'sourceId', 'stop', 'unregisterBlob'])
    expect(probe.sourceId(element.src)).toBeTypeOf('number')
  })

  it('retains the latest 2000 events with an exact dropped count and defensive snapshots', () => {
    const element = image('/api/icon/2?v=0')
    const probe = install()
    for (let i = 1; i <= 4010; i++) element.src = '/api/icon/2?v=' + i
    const snapshot = probe.read()
    expect(snapshot.events).toHaveLength(2000)
    expect(snapshot.dropped).toBe(2011)
    expect(snapshot.events[0].sourceId).toBe(probe.sourceId('/api/icon/2?v=2011'))
    expect(snapshot.events.at(-1)?.sourceId).toBe(probe.sourceId('/api/icon/2?v=4010'))
    snapshot.events[0].changedQueryKeys!.push('corrupted')
    snapshot.events[0].object = 'corrupted'
    snapshot.events.pop()
    const next = probe.read()
    expect(next.events).toHaveLength(2000)
    expect(next.events[0].changedQueryKeys).toEqual(['v'])
    expect(next.events[0].object).toBe('bookmark:2')
    expect(next.dropped).toBe(2011)
  })

  it('stops the observer and both capture listeners, retaining the final snapshot', async () => {
    const disconnect = vi.spyOn(page.MutationObserver.prototype, 'disconnect')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const element = image('/api/icon/3')
    const probe = install()
    element.src = '/api/icon/3?v=before-stop'
    probe.stop()
    const snapshot = probe.read()
    expect(snapshot.events).toHaveLength(2)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith('load', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('error', expect.any(Function), true)
    element.src = '/api/icon/3?v=after-stop'
    element.dispatchEvent(new page.Event('load'))
    element.dispatchEvent(new page.Event('error'))
    element.remove()
    image('/api/icon/4')
    await Promise.resolve()
    expect(probe.read()).toEqual(snapshot)
    probe.stop()
    expect(probe.read()).toEqual(snapshot)
  })

  it('does not write image attributes, change loading, or start network calls', async () => {
    const element = image('/api/icon/13')
    element.setAttribute('loading', 'lazy')
    const original = element.outerHTML
    const attributeWrites = vi.spyOn(page.Element.prototype, 'setAttribute')
    const srcWrites = vi.spyOn(page.HTMLImageElement.prototype, 'src', 'set')
    const fetch = vi.fn(() => { throw new Error('Unexpected fetch') })
    Object.defineProperty(page, 'fetch', { value: fetch })
    const xhr = vi.spyOn(page.XMLHttpRequest.prototype, 'open')
    const probe = install()
    element.dispatchEvent(new page.Event('load'))
    element.dispatchEvent(new page.Event('error'))
    probe.read()
    probe.sourceId('/api/icon/13?key=fake-join-only')
    await Promise.resolve()
    probe.stop()
    expect(element.outerHTML).toBe(original)
    expect(attributeWrites).not.toHaveBeenCalled()
    expect(srcWrites).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
  })
})
