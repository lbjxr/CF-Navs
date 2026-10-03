import {
  ICON_COPY_BODY_BUDGET, ICON_COPY_INDEX_BUDGET, ICON_COPY_LOW_WATER,
  ICON_COPY_MAX_BYTES, ICON_COPY_MAX_ENTRIES, ICON_COPY_OFFLINE_MS, ICON_COPY_PROTOCOL,
  isIconRevision, type IconAuthReceipt, type IconDescriptor, type IconObjectType,
} from '../../shared/iconLocalCopy'

export interface IconStorageLease { scope: string; generation: string }
export function validIconStorageLease(lease: IconStorageLease): boolean {
  return /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(lease.scope) && /^[a-zA-Z0-9-]{1,128}$/.test(lease.generation)
}
export interface IconPermissionInput {
  trusted: boolean
  protocol: number | undefined
  cacheScope: string | null
  receipt: IconAuthReceipt | null
  now: number
  lastObservedAt: number
}
export type IconPermissionFailure = 'untrusted' | 'unsupported' | 'unauthenticated' | 'scope-mismatch' | 'clock' | 'expired'

export function iconLeaseUntil(receipt: IconAuthReceipt): number {
  return Math.min(receipt.checked_at + ICON_COPY_OFFLINE_MS, receipt.expires_at)
}

export function iconPermissionFailure(input: IconPermissionInput): IconPermissionFailure | null {
  if (!input.trusted) return 'untrusted'
  if (input.protocol !== ICON_COPY_PROTOCOL) return 'unsupported'
  if (!input.receipt || !input.cacheScope || !/^[a-f0-9]{64}$/.test(input.cacheScope)) return 'unauthenticated'
  if (input.receipt.cache_scope !== input.cacheScope) return 'scope-mismatch'
  const { checked_at, expires_at } = input.receipt
  if (![input.now, input.lastObservedAt, checked_at, expires_at].every(Number.isSafeInteger) ||
    checked_at <= 0 || expires_at <= checked_at || input.now < checked_at || input.now < input.lastObservedAt) return 'clock'
  return input.now < iconLeaseUntil(input.receipt) ? null : 'expired'
}

export function iconScopeKey(dataset: string, cacheScope: string): string | null {
  return /^[a-f0-9]{32}$/.test(dataset) && /^[a-f0-9]{64}$/.test(cacheScope) ? dataset + ':' + cacheScope : null
}

export function iconObjectKey(type: IconObjectType, id: number): string {
  return type + ':' + id
}

export interface StoredIconEntry {
  key: string
  generation: string
  descriptor: IconDescriptor
  mime: string
  byte_length: number
  saved_at: number
  last_used: number
  metadata_bytes: number
}
export interface IconStorageTotals { bodyBytes: number; entries: number; indexBytes: number }
// Includes the small active-scope record; no image body is hidden in metadata accounting.
export const ICON_CONTROL_BUDGET = 4096

export function entryMetadataBytes(entry: StoredIconEntry): number {
  let bytes = 0
  for (let i = 0; i < 4; i++) {
    const next = new TextEncoder().encode(JSON.stringify({ ...entry, metadata_bytes: bytes })).byteLength
    if (next === bytes) return next
    bytes = next
  }
  return bytes
}

export function validStoredIcon(entry: StoredIconEntry, lease: IconStorageLease): boolean {
  const descriptor = entry?.descriptor
  return Boolean(validIconStorageLease(lease) && descriptor && (descriptor.object_type === 'bookmark' || descriptor.object_type === 'category') &&
    Number.isSafeInteger(descriptor.object_id) && descriptor.object_id > 0 &&
    Number.isSafeInteger(descriptor.write_epoch) && descriptor.write_epoch >= 0 &&
    descriptor.state === 'ready' && isIconRevision(descriptor.content_revision) &&
    entry.generation === lease.generation &&
    lease.scope.startsWith(descriptor.dataset_epoch + ':') && /^[a-f0-9]{32}$/.test(descriptor.dataset_epoch) &&
    entry.key === iconObjectKey(descriptor.object_type, descriptor.object_id) &&
    /^image\//.test(entry.mime) && Number.isSafeInteger(entry.byte_length) && entry.byte_length > 0 && entry.byte_length <= ICON_COPY_MAX_BYTES &&
    Number.isSafeInteger(entry.saved_at) && Number.isSafeInteger(entry.last_used) &&
    entry.metadata_bytes === entryMetadataBytes(entry))
}

export function iconTotals(entries: readonly StoredIconEntry[]): IconStorageTotals {
  return { bodyBytes: entries.reduce((sum, entry) => sum + entry.byte_length, 0), entries: entries.length,
    indexBytes: ICON_CONTROL_BUDGET + entries.reduce((sum, entry) => sum + entry.metadata_bytes, 0) }
}

export function withinIconBudget(totals: IconStorageTotals): boolean {
  return totals.bodyBytes <= ICON_COPY_BODY_BUDGET && totals.entries <= ICON_COPY_MAX_ENTRIES && totals.indexBytes <= ICON_COPY_INDEX_BUDGET
}

/** Called only under capacity pressure, never once per rendered image. */
export function planIconEviction(entries: readonly StoredIconEntry[], incoming: StoredIconEntry, pinned: ReadonlySet<string> = new Set()): string[] | null {
  const retained = entries.filter(entry => entry.key !== incoming.key)
  let totals = iconTotals([...retained, incoming])
  if (withinIconBudget(totals) && totals.bodyBytes < ICON_COPY_BODY_BUDGET) return []
  const targetBytes = totals.bodyBytes >= ICON_COPY_BODY_BUDGET ? ICON_COPY_LOW_WATER : ICON_COPY_BODY_BUDGET
  const evict: string[] = []
  for (const entry of [...retained].sort((a, b) => a.last_used - b.last_used || a.key.localeCompare(b.key))) {
    if (pinned.has(entry.key)) continue
    evict.push(entry.key)
    totals = { bodyBytes: totals.bodyBytes - entry.byte_length, entries: totals.entries - 1, indexBytes: totals.indexBytes - entry.metadata_bytes }
    if (withinIconBudget(totals) && totals.bodyBytes <= targetBytes) return evict
  }
  return null
}
