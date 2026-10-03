// Versioned object-image data. These values are independent of app build fingerprints.
export const ICON_COPY_PROTOCOL = 1 as const
export const ICON_COPY_MAX_BYTES = 512 * 1024
export const ICON_COPY_BODY_BUDGET = 10 * 1024 * 1024
export const ICON_COPY_LOW_WATER = 8 * 1024 * 1024
export const ICON_COPY_MAX_ENTRIES = 1000
export const ICON_COPY_INDEX_BUDGET = 512 * 1024
export const ICON_COPY_OFFLINE_MS = 24 * 60 * 60 * 1000

export type IconObjectType = 'bookmark' | 'category'
export interface IconDescriptor {
  object_type: IconObjectType
  object_id: number
  dataset_epoch: string
  write_epoch: number
  state: 'ready' | 'unknown' | 'empty' | 'text'
  content_revision: string | null
}

export function isIconRevision(value: unknown): value is string {
  return typeof value === 'string' && /^sha256-[a-f0-9]{64}$/.test(value)
}

export interface IconAuthReceipt {
  cache_scope: string
  checked_at: number
  expires_at: number
}

export interface IconCopyMetadata {
  dataset_epoch?: string
  icon_local_copy_protocol?: typeof ICON_COPY_PROTOCOL
  auth_receipt?: IconAuthReceipt
}

export interface IconCopyRequest {
  protocol: typeof ICON_COPY_PROTOCOL
  object_type: IconObjectType
  object_id: number
  dataset_epoch: string
  expected_write_epoch: number
  expected_content_revision: string | null
}

export type IconCopyResult =
  | { protocol: typeof ICON_COPY_PROTOCOL; persistence: 'session-scoped'; descriptor: IconDescriptor; image: { mime: string; byte_length: number; base64: string } | null }
  | { protocol: typeof ICON_COPY_PROTOCOL; reason: 'conflict'; descriptor: IconDescriptor }
  | { protocol: typeof ICON_COPY_PROTOCOL; reason: 'unavailable' | 'unsupported' | 'invalid' | 'not-found' }

// A non-credential identifier. Computing it locally never authenticates or renews a lease.
export async function iconSessionScope(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cf-navs-icon-session-v1\n' + token)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseIconCopyRequest(value: unknown): IconCopyRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<IconCopyRequest>
  if (input.protocol !== ICON_COPY_PROTOCOL || !['bookmark', 'category'].includes(input.object_type ?? '') ||
    !Number.isSafeInteger(input.object_id) || (input.object_id ?? 0) <= 0 ||
    typeof input.dataset_epoch !== 'string' || !/^[a-f0-9]{32}$/.test(input.dataset_epoch) ||
    !Number.isSafeInteger(input.expected_write_epoch) || (input.expected_write_epoch ?? -1) < 0 ||
    (input.expected_content_revision !== null && !isIconRevision(input.expected_content_revision))) return null
  return input as IconCopyRequest
}
