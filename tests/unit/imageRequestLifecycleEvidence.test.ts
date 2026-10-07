import { describe, expect, it } from 'vitest'
import { verifiedSignedImageReplacements } from '../../scripts/lib/imageRequestLifecycleEvidence.mjs'

type RecordData = Record<string, any>
type Fixture = { rows: RecordData[]; snapshots: RecordData[] }
type Mutation = [string, (fixture: Fixture) => void]
const wall = 1_800_000_000_000
const timeOrigin = wall - 10_000

function fixture(): Fixture {
  return {
    rows: [
      { requestId: 'old-image', stage: 'signed-refresh', kind: 'icon-body', type: 'Image', object: 'category:10',
        time: 10, wallTime: wall / 1000, failureTime: 10.1, error: 'net::ERR_ABORTED', canceled: true,
        documentLoaderId: 'document-A', imageLifecycle: { timeOrigin, sourceId: 1 } },
      { requestId: 'new-image', stage: 'signed-refresh', kind: 'icon-body', type: 'Image', object: 'category:10',
        time: 20, wallTime: (wall + 80) / 1000, finishedTime: 20.3, status: 200,
        headers: { 'Content-Type': 'image/png', 'X-Icon-Fallback': '0' },
        documentLoaderId: 'document-A', imageLifecycle: { timeOrigin, sourceId: 2 } },
    ],
    snapshots: [{ loaderId: 'document-A', timeOrigin, stage: 'signed-refresh', dropped: 0, events: [
      { kind: 'observed', time: 9990, nodeId: 7, sourceId: 1, object: 'category:10' },
      { kind: 'src-changed', time: 10100, nodeId: 7, sourceId: 2, object: 'category:10',
        previousSourceId: 1, previousObject: 'category:10', changedQueryKeys: ['key'] },
      { kind: 'loaded', time: 10400, nodeId: 7, sourceId: 2, object: 'category:10',
        complete: true, naturalWidth: 32, naturalHeight: 24 },
    ] }],
  }
}
function assess(data: Fixture) { return verifiedSignedImageReplacements(data.rows, data.snapshots) }
function event(data: Fixture, index: number) { return data.snapshots[0].events[index] }
function addEvent(data: Fixture, additions: RecordData) {
  data.snapshots[0].events.push({ kind: 'removed', time: 10200, nodeId: 7, sourceId: 2, object: 'category:10', ...additions })
  data.snapshots[0].events.sort((a: RecordData, b: RecordData) => a.time - b.time)
}
function finishAt(data: Fixture, offset: number) {
  const row = data.rows[1]
  row.finishedTime = row.time + (offset - (row.wallTime * 1000 - wall)) / 1000
}

const oldFailures: Mutation[] = [
  ['non-icon body', d => { d.rows[0].kind = 'icon-copy' }],
  ['Fetch instead of native Image', d => { d.rows[0].type = 'Fetch' }],
  ['other error', d => { d.rows[0].error = 'net::ERR_CONNECTION_CLOSED' }],
  ['no abort error', d => { delete d.rows[0].error }],
  ['not canceled', d => { d.rows[0].canceled = false }],
  ['missing canceled', d => { delete d.rows[0].canceled }],
  ['non-boolean canceled', d => { d.rows[0].canceled = 'true' }],
  ['HTTP 400', d => { d.rows[0].status = 400 }],
  ['HTTP 401', d => { d.rows[0].status = 401 }],
  ['HTTP 500', d => { d.rows[0].status = 500 }],
  ['invalid status', d => { d.rows[0].status = NaN }],
  ['empty requestId', d => { d.rows[0].requestId = '' }],
  ['missing stage', d => { delete d.rows[0].stage }],
  ['missing start time', d => { delete d.rows[0].time }],
  ['nonfinite start time', d => { d.rows[0].time = Infinity }],
  ['missing wall time', d => { delete d.rows[0].wallTime }],
  ['NaN wall time', d => { d.rows[0].wallTime = NaN }],
  ['overflowed wall time', d => { d.rows[0].wallTime = Number.MAX_VALUE }],
  ['missing failure time', d => { delete d.rows[0].failureTime }],
  ['NaN failure time', d => { d.rows[0].failureTime = NaN }],
  ['failure before start', d => { d.rows[0].failureTime = 9.999 }],
  ['blank loader', d => { d.rows[0].documentLoaderId = ' ' }],
  ['missing lifecycle', d => { delete d.rows[0].imageLifecycle }],
  ['nonfinite origin', d => { d.rows[0].imageLifecycle.timeOrigin = Infinity }],
  ['null source', d => { d.rows[0].imageLifecycle.sourceId = null }],
  ['zero source', d => { d.rows[0].imageLifecycle.sourceId = 0 }],
  ['fractional source', d => { d.rows[0].imageLifecycle.sourceId = 1.5 }],
  ['unknown object', d => { d.rows[0].object = 'unknown' }],
]
const replacementFailures: Mutation[] = [
  ['same requestId', d => { d.rows[1].requestId = d.rows[0].requestId }],
  ['empty requestId', d => { d.rows[1].requestId = '' }],
  ['other stage', d => { d.rows[1].stage = 'different-operation' }],
  ['other loader', d => { d.rows[1].documentLoaderId = 'document-B' }],
  ['other timeOrigin', d => { d.rows[1].imageLifecycle.timeOrigin += 1 }],
  ['other object', d => { d.rows[1].object = 'category:11' }],
  ['other kind', d => { d.rows[1].kind = 'icon-copy' }],
  ['other type', d => { d.rows[1].type = 'Fetch' }],
  ['other source', d => { d.rows[1].imageLifecycle.sourceId = 3 }],
  ['missing lifecycle', d => { delete d.rows[1].imageLifecycle }],
  ['no response yet', d => { delete d.rows[1].status }],
  ['HTTP 204', d => { d.rows[1].status = 204 }],
  ['HTTP 304', d => { d.rows[1].status = 304 }],
  ['HTTP 404', d => { d.rows[1].status = 404 }],
  ['HTTP 500', d => { d.rows[1].status = 500 }],
  ['response error', d => { d.rows[1].error = 'net::ERR_FAILED' }],
  ['canceled response', d => { d.rows[1].canceled = true }],
  ['unfinished body', d => { delete d.rows[1].finishedTime }],
  ['nonfinite body finish', d => { d.rows[1].finishedTime = Infinity }],
  ['finish before start', d => { d.rows[1].finishedTime = 19.999 }],
  ['missing start time', d => { delete d.rows[1].time }],
  ['missing wall time', d => { delete d.rows[1].wallTime }],
  ['nonfinite wall time', d => { d.rows[1].wallTime = NaN }],
  ['overflowed wall time', d => { d.rows[1].wallTime = Number.MAX_VALUE }],
  ['missing headers', d => { delete d.rows[1].headers }],
  ['missing MIME', d => { delete d.rows[1].headers['Content-Type'] }],
  ['HTML MIME', d => { d.rows[1].headers['Content-Type'] = 'text/html' }],
  ['empty image subtype', d => { d.rows[1].headers['Content-Type'] = 'image/' }],
  ['fallback response', d => { d.rows[1].headers['X-Icon-Fallback'] = '1' }],
  ['numeric fallback response', d => { d.rows[1].headers['X-Icon-Fallback'] = 1 }],
  ['duplicate-case fallback response', d => { d.rows[1].headers['x-icon-fallback'] = '1' }],
]
const transitionFailures: Mutation[] = [
  ['missing transition', d => { d.snapshots[0].events.splice(1, 1) }],
  ['wrong previous source', d => { event(d, 1).previousSourceId = 3 }],
  ['null new source', d => { event(d, 1).sourceId = null }],
  ['unchanged source', d => { event(d, 1).sourceId = 1 }],
  ['other object', d => { event(d, 1).object = 'category:11' }],
  ['other previous object', d => { event(d, 1).previousObject = 'bookmark:10' }],
  ['null previous object', d => { event(d, 1).previousObject = null }],
  ['missing previous object', d => { delete event(d, 1).previousObject }],
  ['empty query change', d => { event(d, 1).changedQueryKeys = [] }],
  ['additional query parameter', d => { event(d, 1).changedQueryKeys = ['key', 'v'] }],
  ['token change instead of key', d => { event(d, 1).changedQueryKeys = ['token'] }],
  ['duplicate key entries', d => { event(d, 1).changedQueryKeys = ['key', 'key'] }],
  ['case-mismatched key', d => { event(d, 1).changedQueryKeys = ['Key'] }],
  ['missing changedQueryKeys', d => { delete event(d, 1).changedQueryKeys }],
  ['nonfinite transition time', d => { event(d, 1).time = NaN }],
  ['invalid node id', d => { event(d, 1).nodeId = 0 }],
]
const ownershipFailures: Mutation[] = [
  ['missing old ownership', d => { d.snapshots[0].events.shift() }],
  ['ownership from another node', d => { event(d, 0).nodeId = 8 }],
  ['ownership of another source', d => { event(d, 0).sourceId = 3 }],
  ['ownership of another object', d => { event(d, 0).object = 'bookmark:10' }],
  ['old error is not ownership proof', d => { event(d, 0).kind = 'error' }],
  ['ownership only after transition', d => {
    const owner = d.snapshots[0].events.shift(); owner.time = 10200; d.snapshots[0].events.splice(1, 0, owner)
  }],
]
const loadedFailures: Mutation[] = [
  ['missing load', d => { d.snapshots[0].events.pop() }],
  ['load from another node', d => { event(d, 2).nodeId = 8 }],
  ['load from another source', d => { event(d, 2).sourceId = 3 }],
  ['load from another object', d => { event(d, 2).object = 'category:11' }],
  ['error instead of load', d => { event(d, 2).kind = 'error' }],
  ['incomplete image', d => { event(d, 2).complete = false }],
  ['missing complete', d => { delete event(d, 2).complete }],
  ['zero width', d => { event(d, 2).naturalWidth = 0 }],
  ['zero height', d => { event(d, 2).naturalHeight = 0 }],
  ['nonfinite width', d => { event(d, 2).naturalWidth = Infinity }],
  ['nonfinite height', d => { event(d, 2).naturalHeight = NaN }],
  ['missing dimensions', d => { delete event(d, 2).naturalWidth }],
  ['nonfinite load time', d => { event(d, 2).time = Infinity }],
]

describe('verifiedSignedImageReplacements', () => {
  it('proves a 100ms native cancellation only after the real replacement body and same-node pixels', () => {
    expect(assess(fixture())).toEqual([{
      requestId: 'old-image', replacementRequestId: 'new-image', object: 'category:10', nodeId: 7, replacementNodeId: 7, timeOrigin,
      transitionWallTime: wall + 100, canceledWallTime: wall + 100, loadedWallTime: wall + 400,
      reason: 'signed-icon-key-refresh',
    }])
  })

  it.each(oldFailures)('rejects old request: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })
  it.each(replacementFailures)('rejects replacement: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })
  it.each(transitionFailures)('rejects transition: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })
  it.each(ownershipFailures)('rejects ownership: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })
  it.each(loadedFailures)('rejects loaded evidence: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })

  it('does not exempt the observed unfinished-replacement case even if DOM load claims success', () => {
    const data = fixture()
    delete data.rows[1].finishedTime
    expect(assess(data)).toEqual([])
    data.snapshots[0].events.pop()
    expect(assess(data)).toEqual([])
  })

  it('accepts old ownership established by a previous src-changed and a bookmark object', () => {
    const data = fixture()
    for (const row of data.rows) row.object = 'bookmark:11'
    for (const item of data.snapshots[0].events) {
      item.object = 'bookmark:11'
      if ('previousObject' in item) item.previousObject = 'bookmark:11'
    }
    Object.assign(event(data, 0), { kind: 'src-changed', previousSourceId: null, previousObject: null, changedQueryKeys: ['key'] })
    data.rows[0].status = 200
    data.rows[1].error = ''
    data.rows[1].canceled = false
    data.rows[1].headers = { 'cOnTeNt-TyPe': ' Image/SVG+XML; charset=utf-8 ' }
    expect(assess(data)[0]).toMatchObject({ object: 'bookmark:11', reason: 'signed-icon-key-refresh' })
  })

  it.each([
    ['at old request start', 10000, 1], ['before old request start', 9999, 0],
    ['at cancel plus 100ms', 10200, 1], ['after cancel plus 100ms', 10201, 0],
  ])('transition boundary: %s', (_name, time, count) => {
    const data = fixture(); event(data, 1).time = time
    // Keep the successor's independent start window valid for this test.
    data.rows[1].wallTime = (timeOrigin + Number(time)) / 1000
    finishAt(data, 380)
    expect(assess(data)).toHaveLength(Number(count))
  })

  it.each([[10.6, 1], [10.601, 0]])('absolute cancellation distance at failureTime %s', (failureTime, count) => {
    const data = fixture(); data.rows[0].failureTime = failureTime
    expect(assess(data)).toHaveLength(count)
  })

  it.each([[-100, 1], [-101, 0], [500, 1], [501, 0]])('replacement start offset %sms from transition', (offset, count) => {
    const data = fixture()
    data.rows[1].wallTime = (wall + 100 + offset) / 1000
    finishAt(data, 900)
    event(data, 2).time = 11000
    expect(assess(data)).toHaveLength(count)
  })

  it.each([[-100, 1], [-101, 0], [0, 1], [100, 1], [10000, 1]])('loaded offset %sms from finished body', (offset, count) => {
    const data = fixture(); event(data, 2).time = 10380 + offset
    expect(assess(data)).toHaveLength(count)
  })

  it.each([[10100, 1], [10099, 0]])('load cannot precede transition: %s', (time, count) => {
    const data = fixture(); finishAt(data, 180); event(data, 2).time = time
    data.snapshots[0].events.sort((a: RecordData, b: RecordData) => a.time - b.time)
    expect(assess(data)).toHaveLength(count)
  })

  it('allows a zero-duration terminated request but not a negative duration', () => {
    const data = fixture()
    data.rows[0].failureTime = data.rows[0].time
    data.rows[1].finishedTime = data.rows[1].time
    expect(assess(data)).toHaveLength(1)
  })

  it.each([10000, 10050, 10100, 10200, 10400])('rejects removal during old-to-loaded at %s', time => {
    const data = fixture(); addEvent(data, { time }); expect(assess(data)).toEqual([])
  })

  it.each([3, 1, null])('rejects a second source change to %s', sourceId => {
    const data = fixture()
    addEvent(data, { kind: 'src-changed', previousSourceId: 2, previousObject: 'category:10', sourceId, changedQueryKeys: ['key'] })
    expect(assess(data)).toEqual([])
  })

  it('does not restore proof after switching away and back before loaded', () => {
    const data = fixture()
    addEvent(data, { kind: 'src-changed', sourceId: 3, previousSourceId: 2, previousObject: 'category:10', changedQueryKeys: ['key'] })
    addEvent(data, { kind: 'src-changed', time: 10300, sourceId: 2, previousSourceId: 3,
      previousObject: 'category:10', changedQueryKeys: ['key'] })
    expect(assess(data)).toEqual([])
  })

  it('rejects a source interruption between old request start and its key transition', () => {
    const data = fixture()
    addEvent(data, { kind: 'src-changed', time: 10050, sourceId: 3, previousSourceId: 1,
      previousObject: 'category:10', changedQueryKeys: ['key'] })
    expect(assess(data)).toEqual([])
  })

  it('ignores removals of other nodes and removals outside the evidence interval', () => {
    const data = fixture()
    addEvent(data, { nodeId: 8 }); addEvent(data, { time: 9999 }); addEvent(data, { time: 10401 })
    expect(assess(data)).toHaveLength(1)
  })

  it('does not merge incomplete snapshots, including within one document', () => {
    const data = fixture(); const full = structuredClone(data.snapshots[0])
    data.snapshots = [{ ...full, events: full.events.slice(0, 2) }, { ...full, events: full.events.slice(2) }]
    expect(assess(data)).toEqual([])
    data.snapshots[1].loaderId = 'document-B'
    expect(assess(data)).toEqual([])
  })

  it('selects the most complete snapshot regardless of array order', () => {
    const data = fixture(); const short = { ...data.snapshots[0], events: data.snapshots[0].events.slice(0, 2) }
    data.snapshots.unshift(short)
    expect(assess(data)).toHaveLength(1)
    data.snapshots.reverse()
    expect(assess(data)).toHaveLength(1)
  })

  it('does not fall back to a shorter successful snapshot hiding a removal', () => {
    const data = fixture(); const earlier = structuredClone(data.snapshots[0])
    addEvent(data, { time: 10200 })
    data.snapshots.unshift(earlier)
    expect(assess(data)).toEqual([])
  })

  it.each(['loaderId', 'timeOrigin'])('never uses or merges another document with mismatched %s', field => {
    const data = fixture()
    data.snapshots[0][field] = field === 'loaderId' ? 'document-B' : timeOrigin + 1
    expect(assess(data)).toEqual([])
  })

  it.each(['first', 'last'])('rejects the whole document if a %s snapshot dropped events', position => {
    const data = fixture()
    const dropped = { ...data.snapshots[0], stage: 'different-capture-stage', dropped: 1, events: [] }
    if (position === 'first') data.snapshots.unshift(dropped); else data.snapshots.push(dropped)
    expect(assess(data)).toEqual([])
  })

  it('does not let a zero-dropped snapshot in another document poison or repair this document', () => {
    const data = fixture()
    data.snapshots.push({ ...data.snapshots[0], loaderId: 'document-B', dropped: 100 })
    data.snapshots.push({ ...data.snapshots[0], timeOrigin: timeOrigin + 1, dropped: 100 })
    expect(assess(data)).toHaveLength(1)
    data.snapshots[0].dropped = 1
    data.snapshots.push({ ...data.snapshots[0], loaderId: 'document-C', dropped: 0 })
    expect(assess(data)).toEqual([])
  })

  it('uses cumulative document evidence collected later without crossing request stages', () => {
    const data = fixture(); data.snapshots[0].stage = 'later-capture-stage'
    expect(assess(data)).toHaveLength(1)
    data.rows[1].stage = 'later-capture-stage'
    expect(assess(data)).toEqual([])
  })

  it.each([
    ['no snapshots', (d: Fixture) => { d.snapshots = [] }],
    ['missing dropped', (d: Fixture) => { delete d.snapshots[0].dropped }],
    ['non-numeric dropped', (d: Fixture) => { d.snapshots[0].dropped = '0' }],
    ['missing events', (d: Fixture) => { delete d.snapshots[0].events }],
    ['malformed event', (d: Fixture) => { d.snapshots[0].events.push(null) }],
    ['out-of-order events', (d: Fixture) => { d.snapshots[0].events.reverse() }],
  ] as Mutation[])('rejects incomplete snapshot: %s', (_name, change) => {
    const data = fixture(); change(data); expect(assess(data)).toEqual([])
  })

  it('keeps another unknown cancellation out of the evidence rather than waiving the stage/object', () => {
    const data = fixture()
    data.rows.push({ ...data.rows[0], requestId: 'unknown-cancellation', imageLifecycle: { timeOrigin, sourceId: 99 } })
    data.rows.push({ ...data.rows[0], requestId: 'other-failure', error: 'net::ERR_FAILED' })
    expect(assess(data).map((row: RecordData) => row.requestId)).toEqual(['old-image'])
  })

  it('rejects ambiguous cancellations sharing the same transition instead of guessing requestId', () => {
    const data = fixture()
    data.rows.push({ ...data.rows[0], requestId: 'indistinguishable-cancellation' })
    expect(assess(data)).toEqual([])
  })

  it('rejects ambiguous successful replacement requestIds', () => {
    const data = fixture()
    data.rows.push({ ...data.rows[1], requestId: 'indistinguishable-success' })
    expect(assess(data)).toEqual([])
  })

  it('can independently verify two categories without sharing request/node evidence', () => {
    const data = fixture(); const second = fixture()
    for (const row of second.rows) { row.requestId += '-11'; row.object = 'category:11'; row.imageLifecycle.sourceId += 2 }
    for (const item of second.snapshots[0].events) {
      item.object = 'category:11'; item.nodeId = 8; item.sourceId += 2
      if ('previousSourceId' in item) { item.previousSourceId += 2; item.previousObject = 'category:11' }
    }
    data.rows.push(...second.rows)
    data.snapshots[0].events.push(...second.snapshots[0].events)
    data.snapshots[0].events.sort((a: RecordData, b: RecordData) => a.time - b.time)
    expect(assess(data).map((row: RecordData) => row.object)).toEqual(['category:10', 'category:11'])
  })

  it('does not mutate inputs or expose extra fields, headers, URLs, or credential values', () => {
    const data = fixture()
    data.rows[0].url = 'https://fixture.example.test/api/category-icon/10?key=fake-secret'
    data.rows[1].headers['X-Fixture-Secret'] = 'fake-secret'
    const before = structuredClone(data)
    const freeze = (value: any): void => {
      if (!value || typeof value !== 'object') return
      for (const child of Object.values(value)) freeze(child)
      Object.freeze(value)
    }
    freeze(data)
    const result = assess(data)
    expect(result).toHaveLength(1)
    expect(Object.keys(result[0]).sort()).toEqual(['requestId', 'replacementRequestId', 'object', 'nodeId', 'replacementNodeId',
      'timeOrigin', 'transitionWallTime', 'canceledWallTime', 'loadedWallTime', 'reason'].sort())
    expect(JSON.stringify(result)).not.toMatch(/fake-secret|https:|headers|url|\?key=/)
    expect(data).toEqual(before)
    result[0].object = 'changed-by-caller'
    expect(assess(data)[0].object).toBe('category:10')
  })

  it('fails closed for missing or malformed top-level collections', () => {
    for (const [rows, snapshots] of [[null, []], [[], undefined], [{}, []], [[], {}], [[null], [null]], [[], []]]) {
      expect(verifiedSignedImageReplacements(rows, snapshots)).toEqual([])
    }
  })
})


function handoffFixture(): Fixture {
  const data = fixture()
  Object.assign(data.rows[0], { wallTime: (timeOrigin + 352.4) / 1000, failureTime: 10 + (450 - 352.4) / 1000,
    imageLifecycle: { timeOrigin, sourceId: 10 } })
  Object.assign(data.rows[1], { wallTime: (timeOrigin + 397.48) / 1000, finishedTime: 20 + (1808 - 397.48) / 1000,
    imageLifecycle: { timeOrigin, sourceId: 20 } })
  data.snapshots[0].events = [
    { kind: 'observed', time: 317.8, nodeId: 10, sourceId: 10, object: 'category:10' },
    { kind: 'src-changed', time: 397.1, nodeId: 10, sourceId: 20, object: 'category:10',
      previousSourceId: 10, previousObject: 'category:10', changedQueryKeys: ['key'] },
    { kind: 'removed', time: 425.4, nodeId: 10, sourceId: 20, object: 'category:10' },
    { kind: 'observed', time: 712.1, nodeId: 46, sourceId: 20, object: 'category:10' },
    { kind: 'loaded', time: 1815.5, nodeId: 46, sourceId: 20, object: 'category:10',
      complete: true, naturalWidth: 16, naturalHeight: 16 },
  ]
  return data
}
function handoffEvent(data: Fixture, addition: RecordData) {
  addEvent(data, { kind: 'observed', time: 320, nodeId: 28, sourceId: 10, object: 'category:10', ...addition })
}
function switchConsumer(data: Fixture, addition: RecordData = {}) {
  handoffEvent(data, { kind: 'src-changed', time: 398, nodeId: 28, sourceId: 20,
    previousSourceId: 10, previousObject: 'category:10', changedQueryKeys: ['key'], ...addition })
}
function observationDeadline(data: Fixture) {
  const old = data.rows[0]
  return old.wallTime * 1000 + (old.failureTime - old.time) * 1000 - timeOrigin + 100
}

describe('verified signed-image node handoff', () => {
  it('requires and proves the exact observed 10 -> 46 unload/remount chain', () => {
    const result = assess(handoffFixture())
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ requestId: 'old-image', replacementRequestId: 'new-image', object: 'category:10',
      nodeId: 10, replacementNodeId: 46, timeOrigin, transitionWallTime: timeOrigin + 397.1,
      loadedWallTime: timeOrigin + 1815.5, reason: 'signed-icon-key-refresh' })
    expect(result[0].canceledWallTime).toBeCloseTo(timeOrigin + 450, 2)
    expect(assess(fixture())[0]).toMatchObject({ nodeId: 7, replacementNodeId: 7 })
  })

  it.each(replacementFailures)('retains replacement gate for handoff: %s', (_name, change) => {
    const data = handoffFixture(); change(data); expect(assess(data)).toEqual([])
  })

  it('still rejects the unfinished default-protocol trace despite a complete DOM handoff', () => {
    const data = handoffFixture(); delete data.rows[1].finishedTime
    expect(assess(data)).toEqual([])
  })

  it.each([
    ['no original removal', (d: Fixture) => { d.snapshots[0].events.splice(2, 1) }],
    ['wrong removed source', (d: Fixture) => { event(d, 2).sourceId = 10 }],
    ['wrong removed object', (d: Fixture) => { event(d, 2).object = 'category:11' }],
    ['wrong removed node', (d: Fixture) => { event(d, 2).nodeId = 28 }],
    ['no replacement observed', (d: Fixture) => { d.snapshots[0].events.splice(3, 1) }],
    ['wrong observed source', (d: Fixture) => { event(d, 3).sourceId = 99 }],
    ['wrong observed object', (d: Fixture) => { event(d, 3).object = 'category:11' }],
    ['wrong observed node', (d: Fixture) => { event(d, 3).nodeId = 47 }],
    ['load has no mounted owner', (d: Fixture) => { event(d, 4).nodeId = 47 }],
    ['load too early for body', (d: Fixture) => { event(d, 4).time = 1707 }],
    ['incomplete decoded image', (d: Fixture) => { event(d, 4).complete = false }],
    ['zero decoded width', (d: Fixture) => { event(d, 4).naturalWidth = 0 }],
    ['zero decoded height', (d: Fixture) => { event(d, 4).naturalHeight = 0 }],
    ['nonfinite decoded dimension', (d: Fixture) => { event(d, 4).naturalWidth = Infinity }],
    ['dropped events', (d: Fixture) => { d.snapshots[0].dropped = 1 }],
  ] as Mutation[])('rejects incomplete handoff: %s', (_name, change) => {
    const data = handoffFixture(); change(data); expect(assess(data)).toEqual([])
  })

  it('rejects a replacement node observed before removal even if re-observed afterwards', () => {
    const data = handoffFixture()
    handoffEvent(data, { time: 420, nodeId: 46, sourceId: 20 })
    expect(assess(data)).toEqual([])
  })

  it('rejects incorrect event sequence and cannot use removal after the replacement mount', () => {
    const data = handoffFixture(); event(data, 2).time = 800
    data.snapshots[0].events.sort((a: RecordData, b: RecordData) => a.time - b.time)
    expect(assess(data)).toEqual([])
    const malformed = handoffFixture()
    ;[malformed.snapshots[0].events[2], malformed.snapshots[0].events[3]] =
      [malformed.snapshots[0].events[3], malformed.snapshots[0].events[2]]
    expect(assess(malformed)).toEqual([])
  })

  it('does not treat a new-node src-changed as an explicit new mount', () => {
    const data = handoffFixture()
    Object.assign(event(data, 3), { kind: 'src-changed', previousSourceId: null, previousObject: null, changedQueryKeys: ['key'] })
    expect(assess(data)).toEqual([])
  })

  it.each([20, 99, null])('rejects any old-node src-change before removal, even to %s', sourceId => {
    const data = handoffFixture()
    switchConsumer(data, { nodeId: 10, time: 410, previousSourceId: 20, sourceId })
    expect(assess(data)).toEqual([])
  })

  it('rejects removal of the original owner before its transition', () => {
    const data = handoffFixture()
    handoffEvent(data, { kind: 'removed', time: 380, nodeId: 10, sourceId: 10 })
    expect(assess(data)).toEqual([])
  })

  it.each([20, 99, null])('rejects any new-node src-change before loaded, even to %s', sourceId => {
    const data = handoffFixture()
    switchConsumer(data, { nodeId: 46, time: 900, previousSourceId: 20, sourceId })
    expect(assess(data)).toEqual([])
  })

  it('rejects a new-node source switch away and back or removal and remount', () => {
    const switched = handoffFixture()
    switchConsumer(switched, { nodeId: 46, time: 900, previousSourceId: 20, sourceId: 99 })
    switchConsumer(switched, { nodeId: 46, time: 1000, previousSourceId: 99, sourceId: 20 })
    expect(assess(switched)).toEqual([])
    const removed = handoffFixture()
    handoffEvent(removed, { kind: 'removed', time: 900, nodeId: 46, sourceId: 20 })
    handoffEvent(removed, { time: 1000, nodeId: 46, sourceId: 20 })
    expect(assess(removed)).toEqual([])
  })

  it('allows multiple old-node consumers of one Network request when all have retired', () => {
    const data = handoffFixture()
    handoffEvent(data, {})
    switchConsumer(data)
    handoffEvent(data, { kind: 'removed', time: 426, sourceId: 20 })
    const result = assess(data)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ requestId: 'old-image', replacementRequestId: 'new-image', nodeId: 10, replacementNodeId: 46 })
  })

  it.each([100, 320, 440])('rejects a still-live old-source consumer first observed at %sms', time => {
    const data = handoffFixture(); handoffEvent(data, { time }); expect(assess(data)).toEqual([])
  })

  it.each(['change', 'remove'])('accepts retired consumer via %s at the 100ms observation deadline only', mode => {
    for (const [extra, count] of [[0, 1], [1, 0]]) {
      const data = handoffFixture(); handoffEvent(data, {})
      const time = observationDeadline(data) + extra
      if (mode === 'change') switchConsumer(data, { time })
      else handoffEvent(data, { kind: 'removed', time })
      expect(assess(data)).toHaveLength(count)
    }
  })

  it('checks the last consumer state at cancellation, not a later snapshot state', () => {
    const data = handoffFixture(); handoffEvent(data, {})
    switchConsumer(data)
    switchConsumer(data, { time: 440, previousSourceId: 20, sourceId: 10 })
    handoffEvent(data, { kind: 'removed', time: 700 })
    expect(assess(data)).toEqual([])
  })

  it('does not recruit old-source nodes first observed after cancellation plus tolerance', () => {
    const data = handoffFixture()
    handoffEvent(data, { time: observationDeadline(data) + 1 })
    expect(assess(data)).toHaveLength(1)
    const atBoundary = handoffFixture()
    handoffEvent(atBoundary, { time: observationDeadline(atBoundary) })
    expect(assess(atBoundary)).toEqual([])
  })

  it('does not revive a removed consumer through a detached src change, but does through observed', () => {
    const data = handoffFixture()
    handoffEvent(data, {})
    handoffEvent(data, { kind: 'removed', time: 400 })
    switchConsumer(data, { time: 430, previousSourceId: 20, sourceId: 10 })
    expect(assess(data)).toHaveLength(1)
    handoffEvent(data, { time: 440 })
    expect(assess(data)).toEqual([])
  })

  it('applies the same live-consumer rejection to the original same-node branch', () => {
    const data = fixture()
    addEvent(data, { kind: 'observed', time: 9990, nodeId: 28, sourceId: 1 })
    expect(assess(data)).toEqual([])
    addEvent(data, { kind: 'removed', time: 10100, nodeId: 28, sourceId: 1 })
    expect(assess(data)[0]).toMatchObject({ nodeId: 7, replacementNodeId: 7 })
  })

  it('does not waive an unknown cancellation or multiple ambiguous Network IDs through a handoff', () => {
    const data = handoffFixture()
    data.rows.push({ ...data.rows[0], requestId: 'unknown', imageLifecycle: { timeOrigin, sourceId: 99 } })
    expect(assess(data).map((item: RecordData) => item.requestId)).toEqual(['old-image'])
    data.rows.push({ ...data.rows[0], requestId: 'ambiguous-old' })
    expect(assess(data)).toEqual([])
  })
})
