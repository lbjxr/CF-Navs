import { describe, expect, it } from 'vitest'
import { verifiedNativeCategoryRetries } from '../../scripts/lib/imageRequestLifecycleEvidence.mjs'

type Data = Record<string, any>
type Fixture = { rows: Data[]; snapshots: Data[] }
type Mutation = [string, (data: Fixture) => void]
const wall = 1_800_000_000_000
const timeOrigin = wall - 1000
function fixture(): Fixture {
  return {
    rows: [
      { requestId: 'old', stage: 'native-retry', kind: 'icon-body', type: 'Image', object: 'category:10',
        time: 20, wallTime: wall / 1000, failureTime: 30, error: 'net::ERR_ABORTED', canceled: true,
        nativeRetryAttempt: 0, documentLoaderId: 'doc-A', imageLifecycle: { timeOrigin, sourceId: 1, baseSourceId: 7 } },
      { requestId: 'new', stage: 'native-retry', kind: 'icon-body', type: 'Image', object: 'category:10',
        time: 40, wallTime: (wall + 10010) / 1000, finishedTime: 40.43, status: 200,
        headers: { 'Content-Type': 'image/png', 'X-Icon-Fallback': '0' }, nativeRetryAttempt: 1,
        documentLoaderId: 'doc-A', imageLifecycle: { timeOrigin, sourceId: 2, baseSourceId: 7 } },
    ],
    snapshots: [{ loaderId: 'doc-A', timeOrigin, dropped: 0, events: [
      { kind: 'observed', time: 1000, nodeId: 1, object: 'category:10', sourceId: 1 },
      { kind: 'removed', time: 11000, nodeId: 1, object: 'category:10', sourceId: 1 },
      { kind: 'observed', time: 11010, nodeId: 2, object: 'category:10', sourceId: 2 },
      { kind: 'loaded', time: 11440, nodeId: 2, object: 'category:10', sourceId: 2,
        complete: true, naturalWidth: 24, naturalHeight: 24 },
    ] }],
  }
}
const events = (d: Fixture): Data[] => d.snapshots[0].events
const assess = (d: Fixture) => verifiedNativeCategoryRetries(d.rows, d.snapshots)
const expected = { requestId: 'old', replacementRequestId: 'new', object: 'category:10',
  nodeId: 1, replacementNodeId: 2, timeOrigin, retryAttempt: 1, reason: 'completed-native-category-retry' }

const failures: Mutation[] = [
  ['no original terminal error', d => { delete d.rows[0].error }],
  ['original error is not abort', d => { d.rows[0].error = 'net::ERR_FAILED' }],
  ['original not canceled', d => { d.rows[0].canceled = false }],
  ['missing cancellation flag', d => { delete d.rows[0].canceled }],
  ['missing original terminal time', d => { delete d.rows[0].failureTime }],
  ['invalid terminal time', d => { d.rows[0].failureTime = NaN }],
  ['short original wait', d => { d.rows[0].time = 21.001; d.rows[0].wallTime = (wall + 1001) / 1000 }],
  ['terminal before start', d => { d.rows[0].failureTime = 19 }],
  ['missing wall clock', d => { delete d.rows[0].wallTime }],
  ['overflow wall clock', d => { d.rows[0].wallTime = Number.MAX_VALUE }],
  ['old HTTP 302', d => { d.rows[0].status = 302 }],
  ['old HTTP 404', d => { d.rows[0].status = 404 }],
  ['old HTTP 500', d => { d.rows[0].status = 500 }],
  ['old invalid status', d => { d.rows[0].status = '200' }],
  ['bookmark not category', d => {
    for (const row of d.rows) row.object = 'bookmark:10'
    for (const event of events(d)) event.object = 'bookmark:10'
  }],
  ['old Fetch', d => { d.rows[0].type = 'Fetch' }],
  ['old wrong kind', d => { d.rows[0].kind = 'icon-copy' }],
  ['old missing source', d => { delete d.rows[0].imageLifecycle.sourceId }],
  ['old missing base identity', d => { delete d.rows[0].imageLifecycle.baseSourceId }],
  ['invalid base identity', d => { d.rows[0].imageLifecycle.baseSourceId = 0 }],
  ['missing old attempt', d => { delete d.rows[0].nativeRetryAttempt }],
  ['negative old attempt', d => { d.rows[0].nativeRetryAttempt = -1 }],
  ['fractional old attempt', d => { d.rows[0].nativeRetryAttempt = 0.5 }],
  ['key parameter changed', d => { d.rows[1].imageLifecycle.baseSourceId = 8 }],
  ['v parameter changed', d => { d.rows[1].imageLifecycle.baseSourceId = 9 }],
  ['new missing base identity', d => { delete d.rows[1].imageLifecycle.baseSourceId }],
  ['other document', d => { d.rows[1].documentLoaderId = 'doc-B' }],
  ['other stage', d => { d.rows[1].stage = 'later' }],
  ['other time origin', d => { d.rows[1].imageLifecycle.timeOrigin++ }],
  ['other object', d => { d.rows[1].object = 'category:11' }],
  ['other source', d => { d.rows[1].imageLifecycle.sourceId = 3 }],
  ['same source', d => {
    d.rows[1].imageLifecycle.sourceId = 1
    events(d)[2].sourceId = events(d)[3].sourceId = 1
  }],
  ['same request id', d => { d.rows[1].requestId = 'old' }],
  ['new Fetch', d => { d.rows[1].type = 'Fetch' }],
  ['new wrong kind', d => { d.rows[1].kind = 'icon-copy' }],
  ['new missing attempt', d => { delete d.rows[1].nativeRetryAttempt }],
  ['skipped attempt', d => { d.rows[1].nativeRetryAttempt = 2 }],
  ['same attempt', d => { d.rows[1].nativeRetryAttempt = 0 }],
  ['fractional attempt', d => { d.rows[1].nativeRetryAttempt = 1.5 }],
  ['request too early', d => { d.rows[1].wallTime = (wall + 9899) / 1000 }],
  ['request too late', d => { d.rows[1].wallTime = (wall + 22001) / 1000 }],
  ['new request only', d => { events(d).splice(2) }],
  ['new response only without load', d => { events(d).pop() }],
  ['new unfinished request', d => { delete d.rows[1].finishedTime }],
  ['new invalid finish', d => { d.rows[1].finishedTime = Infinity }],
  ['new finish before start', d => { d.rows[1].finishedTime = 39 }],
  ['new HTTP failure', d => { d.rows[1].status = 500 }],
  ['new missing status', d => { delete d.rows[1].status }],
  ['new HTTP 304', d => { d.rows[1].status = 304 }],
  ['new canceled', d => { d.rows[1].canceled = true }],
  ['new error', d => { d.rows[1].error = 'net::ERR_ABORTED' }],
  ['non-image response', d => { d.rows[1].headers['Content-Type'] = 'text/html' }],
  ['missing MIME', d => { d.rows[1].headers = {} }],
  ['fallback response', d => { d.rows[1].headers['x-icon-fallback'] = '1' }],
  ['missing snapshot', d => { d.snapshots = [] }],
  ['wrong snapshot document', d => { d.snapshots[0].loaderId = 'doc-B' }],
  ['wrong snapshot origin', d => { d.snapshots[0].timeOrigin++ }],
  ['dropped evidence', d => { d.snapshots[0].dropped = 1 }],
  ['earlier dropped snapshot', d => { d.snapshots.push({ ...d.snapshots[0], dropped: 1, events: [] }) }],
  ['missing dropped count', d => { delete d.snapshots[0].dropped }],
  ['unsorted events', d => { events(d).reverse() }],
  ['malformed event', d => { events(d)[0].time = Infinity }],
  ['missing old observed', d => { events(d).shift() }],
  ['old observed other object', d => { events(d)[0].object = 'category:11' }],
  ['old observed other source', d => { events(d)[0].sourceId = 3 }],
  ['old observed other node', d => { events(d)[0].nodeId = 3 }],
  ['old error is not observation', d => { events(d)[0].kind = 'error' }],
  ['missing removed', d => { events(d).splice(1, 1) }],
  ['removed too early', d => { events(d)[1].time = 10899 }],
  ['removed too late', d => { events(d)[1].time = 11101; events(d)[2].time = 11102 }],
  ['removed wrong source', d => { events(d)[1].sourceId = 3 }],
  ['removed wrong object', d => { events(d)[1].object = 'category:11' }],
  ['another old consumer still live', d => { events(d).splice(1, 0, { ...events(d)[0], nodeId: 3 }) }],
  ['old node reattached', d => { events(d).splice(2, 0, { ...events(d)[0], time: 11000 }) }],
  ['missing new observed', d => { events(d).splice(2, 1) }],
  ['new observed before removal', d => { events(d)[2].time = 10999; events(d).sort((a, b) => a.time - b.time) }],
  ['same node reused', d => { events(d)[2].nodeId = events(d)[3].nodeId = 1 }],
  ['new node has old history', d => { events(d).unshift({ ...events(d)[0], nodeId: 2, time: 0 }) }],
  ['new observed wrong source', d => { events(d)[2].sourceId = 3 }],
  ['new observed wrong object', d => { events(d)[2].object = 'category:11' }],
  ['loaded wrong node', d => { events(d)[3].nodeId = 3 }],
  ['loaded wrong source', d => { events(d)[3].sourceId = 3 }],
  ['loaded wrong object', d => { events(d)[3].object = 'category:11' }],
  ['native error', d => { events(d)[3].kind = 'error' }],
  ['incomplete pixels', d => { events(d)[3].complete = false }],
  ['zero width', d => { events(d)[3].naturalWidth = 0 }],
  ['zero height', d => { events(d)[3].naturalHeight = 0 }],
  ['nonfinite dimensions', d => { events(d)[3].naturalWidth = Infinity }],
  ['load before body finish allowance', d => { events(d)[3].time = 11339 }],
  ['removed before load', d => { events(d).splice(3, 0, { ...events(d)[2], kind: 'removed', time: 11200 }) }],
  ['error before load', d => { events(d).splice(3, 0, { ...events(d)[2], kind: 'error', time: 11200 }) }],
  ['src changed before load even to same source', d => {
    events(d).splice(3, 0, { ...events(d)[2], kind: 'src-changed', time: 11200,
      previousSourceId: 2, previousObject: 'category:10', changedQueryKeys: ['retry'] })
  }],
  ['multiple replacement request matches', d => { d.rows.push({ ...d.rows[1], requestId: 'ambiguous-new' }) }],
  ['multiple old request matches', d => { d.rows.push({ ...d.rows[0], requestId: 'ambiguous-old' }) }],
]

describe('verifiedNativeCategoryRetries', () => {
  it('proves only the exact canceled ID after a completed native retry', () => {
    expect(assess(fixture())).toEqual([expected])
  })
  it.each(failures)('rejects %s', (_name, mutate) => {
    const data = fixture()
    mutate(data)
    expect(assess(data)).toEqual([])
  })
  it('accepts Blob-to-native ownership established by src-changed without native observed', () => {
    const d = fixture()
    events(d)[0] = { ...events(d)[0], kind: 'src-changed', previousSourceId: null,
      previousObject: null, changedQueryKeys: [] }
    expect(assess(d)).toEqual([expected])
  })
  it.each(['sourceId', 'object'])('rejects Blob-to-native ownership with wrong %s', field => {
    const d = fixture()
    events(d)[0] = { ...events(d)[0], kind: 'src-changed', previousSourceId: null,
      previousObject: null, changedQueryKeys: [], [field]: field === 'sourceId' ? 3 : 'category:11' }
    expect(assess(d)).toEqual([])
  })
  it.each(['src-changed', 'removed'])('rejects %s after Blob-to-native ownership and before removal', kind => {
    const d = fixture()
    events(d)[0] = { ...events(d)[0], kind: 'src-changed', previousSourceId: null,
      previousObject: null, changedQueryKeys: [] }
    events(d).splice(1, 0, { ...events(d)[0], kind, time: 2000,
      previousSourceId: 1, previousObject: 'category:10' })
    expect(assess(d)).toEqual([])
  })
  it('accepts an original 200 response aborted while its body was hanging', () => {
    const d = fixture()
    d.rows[0].status = 200
    expect(assess(d)).toEqual([expected])
  })
  it('accepts precisely nine seconds, without certifying watchdog ten-second accuracy', () => {
    const d = fixture()
    d.rows[0].time = 21
    d.rows[0].wallTime = (wall + 1000) / 1000
    expect(assess(d)).toEqual([expected])
  })
  it('accepts the next positive attempt, not only retry one', () => {
    const d = fixture()
    d.rows[0].nativeRetryAttempt = 2
    d.rows[1].nativeRetryAttempt = 3
    expect(assess(d)).toEqual([{ ...expected, retryAttempt: 3 }])
  })
  it.each([-100, 100])('accepts removal at the %ims boundary', offset => {
    const d = fixture()
    events(d)[1].time = 11000 + offset
    events(d)[2].time = Math.max(11010, events(d)[1].time)
    expect(assess(d)).toEqual([expected])
  })
  it.each([-100, 12000])('accepts replacement start at the %ims boundary', offset => {
    const d = fixture()
    d.rows[1].wallTime = (wall + 10000 + offset) / 1000
    events(d)[3].time = 11000 + offset + 430
    expect(assess(d)).toEqual([expected])
  })
  it('accepts loaded at the body finish minus 100ms boundary', () => {
    const d = fixture()
    events(d)[3].time = 11340
    expect(assess(d)).toEqual([expected])
  })
  it('accepts shared old consumers only once when all have retired', () => {
    const d = fixture()
    events(d).splice(1, 0, { ...events(d)[0], nodeId: 3 })
    events(d).splice(3, 0, { ...events(d)[2], nodeId: 3 })
    expect(assess(d)).toEqual([expected])
  })
  it('ignores unrelated document gaps and preserves input values and time fields', () => {
    const d = fixture()
    d.snapshots.push({ loaderId: 'doc-B', timeOrigin, dropped: 5, events: [] })
    const before = structuredClone(d)
    function freeze(value: any) {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
    }
    freeze(d)
    expect(assess(d)).toEqual([expected])
    expect(d).toEqual(before)
  })
  it('does not invent abort evidence for an unterminated old request', () => {
    const d = fixture()
    delete d.rows[0].error
    delete d.rows[0].canceled
    delete d.rows[0].failureTime
    const before = structuredClone(d)
    expect(assess(d)).toEqual([])
    expect(d).toEqual(before)
  })
  it('handles absent journals conservatively', () => {
    expect(verifiedNativeCategoryRetries(null, [])).toEqual([])
    expect(verifiedNativeCategoryRetries([], null)).toEqual([])
    expect(verifiedNativeCategoryRetries([], [])).toEqual([])
  })
})
