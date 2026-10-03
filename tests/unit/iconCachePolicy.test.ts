import { describe, expect, it } from 'vitest'
import { ICON_COPY_BODY_BUDGET, ICON_COPY_LOW_WATER, ICON_COPY_MAX_BYTES, ICON_COPY_OFFLINE_MS } from '../../shared/iconLocalCopy'
import { entryMetadataBytes, iconLeaseUntil, iconPermissionFailure, iconScopeKey, iconTotals, planIconEviction, validStoredIcon, type StoredIconEntry } from '../../src/lib/iconCachePolicy'

const scope = 'a'.repeat(64)
const dataset = 'b'.repeat(32)
const lease = { scope: dataset + ':' + scope, generation: 'fixture-generation' }
const receipt = { cache_scope: scope, checked_at: 1000, expires_at: 1000 + 2 * ICON_COPY_OFFLINE_MS }
const permission = { trusted: true, protocol: 1, cacheScope: scope, receipt, now: 2000, lastObservedAt: 1500 }
function entry(id: number, size = 1024): StoredIconEntry {
  const value: StoredIconEntry = { key: 'bookmark:' + id, generation: lease.generation, descriptor: { object_type: 'bookmark', object_id: id, dataset_epoch: dataset, write_epoch: 0, state: 'ready', content_revision: 'sha256-' + 'c'.repeat(64) }, mime: 'image/png', byte_length: size, saved_at: 1000, last_used: id, metadata_bytes: 0 }
  value.metadata_bytes = entryMetadataBytes(value)
  return value
}

describe('trusted icon permission policy', () => {
  it('binds use to a verified current session, not the trust preference alone', () => {
    expect(iconPermissionFailure(permission)).toBeNull()
    expect(iconPermissionFailure({ ...permission, trusted: false })).toBe('untrusted')
    expect(iconPermissionFailure({ ...permission, protocol: 2 })).toBe('unsupported')
    expect(iconPermissionFailure({ ...permission, receipt: null })).toBe('unauthenticated')
    expect(iconPermissionFailure({ ...permission, cacheScope: 'd'.repeat(64) })).toBe('scope-mismatch')
  })
  it('expires at the earlier of 24 hours and the session end, including the exact boundary', () => {
    expect(iconLeaseUntil(receipt)).toBe(1000 + ICON_COPY_OFFLINE_MS)
    expect(iconPermissionFailure({ ...permission, now: iconLeaseUntil(receipt) })).toBe('expired')
    const short = { ...receipt, expires_at: 3000 }
    expect(iconLeaseUntil(short)).toBe(3000)
    expect(iconPermissionFailure({ ...permission, receipt: short, now: 3000 })).toBe('expired')
    expect(iconPermissionFailure({ ...permission, receipt: short, now: 2999 })).toBeNull()
  })
  it('rejects rollback, future verification time and malformed clocks without renewing anything', () => {
    expect(iconPermissionFailure({ ...permission, now: 1499 })).toBe('clock')
    expect(iconPermissionFailure({ ...permission, receipt: { ...receipt, checked_at: 3000 } })).toBe('clock')
    expect(iconPermissionFailure({ ...permission, now: NaN })).toBe('clock')
    expect(iconPermissionFailure({ ...permission, receipt: { ...receipt, expires_at: Infinity } })).toBe('clock')
  })
  it('uses strong dataset and session identifiers', () => {
    expect(iconScopeKey(dataset, scope)).toBe(lease.scope)
    expect(iconScopeKey('1', scope)).toBeNull()
    expect(iconScopeKey(dataset, 'username')).toBeNull()
  })
})

describe('object icon storage contracts', () => {
  it('validates type, scope, revision and exact serialized metadata size', () => {
    const value = entry(1)
    expect(validStoredIcon(value, lease)).toBe(true)
    expect(validStoredIcon({ ...value, metadata_bytes: 1 }, lease)).toBe(false)
    expect(validStoredIcon({ ...value, byte_length: ICON_COPY_MAX_BYTES + 1 }, lease)).toBe(false)
    expect(validStoredIcon(value, { ...lease, generation: 'different' })).toBe(false)
    expect(validStoredIcon({ ...value, descriptor: { ...value.descriptor, object_type: 'category' } }, lease)).toBe(false)
  })
  it('does not evict for ordinary replacement within budget', () => {
    const entries = [entry(1), entry(2)]
    expect(planIconEviction(entries, entry(1, 2048))).toEqual([])
    expect(iconTotals(entries).bodyBytes).toBe(2048)
  })
  it('evicts least recently used entries to 80% when body capacity is reached', () => {
    const entries = Array.from({ length: 19 }, (_, i) => entry(i + 1, ICON_COPY_MAX_BYTES))
    const incoming = entry(20, ICON_COPY_MAX_BYTES)
    expect(iconTotals([...entries, incoming]).bodyBytes).toBe(ICON_COPY_BODY_BUDGET)
    const evicted = planIconEviction(entries, incoming)!
    expect(evicted).toEqual(['bookmark:1', 'bookmark:2', 'bookmark:3', 'bookmark:4'])
    expect(iconTotals([...entries.filter(item => !evicted.includes(item.key)), incoming]).bodyBytes).toBe(ICON_COPY_LOW_WATER)
  })
  it('keeps pinned/active images and refuses a save rather than exceeding the budget', () => {
    const entries = Array.from({ length: 19 }, (_, i) => entry(i + 1, ICON_COPY_MAX_BYTES))
    expect(planIconEviction(entries, entry(20, ICON_COPY_MAX_BYTES), new Set(entries.map(item => item.key)))).toBeNull()
  })
  it('shares one entry budget across object types', () => {
    const entries = Array.from({ length: 1000 }, (_, i) => entry(i + 1, 1))
    const next = entry(1, 1)
    next.key = 'category:1'; next.descriptor.object_type = 'category'; next.metadata_bytes = entryMetadataBytes(next)
    expect(planIconEviction(entries, next)).toEqual(['bookmark:1'])
  })
})
