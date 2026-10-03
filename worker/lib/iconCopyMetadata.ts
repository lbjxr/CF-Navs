import { ICON_COPY_PROTOCOL, iconSessionScope, type IconAuthReceipt, type IconCopyMetadata } from '../../shared/iconLocalCopy'

export function iconMetadataFromRows(rows: Array<{ key: string; value: string | null }>): IconCopyMetadata {
  const raw = rows.find(row => row.key === 'icon_dataset_epoch')?.value
  if (!raw) return {}
  try {
    const epoch: unknown = JSON.parse(raw)
    return typeof epoch === 'string' && /^[a-f0-9]{32}$/.test(epoch)
      ? { dataset_epoch: epoch, icon_local_copy_protocol: ICON_COPY_PROTOCOL }
      : {}
  } catch {
    return {}
  }
}

export async function iconAuthReceipt(token: string, expiresAt: number): Promise<IconAuthReceipt> {
  return { cache_scope: await iconSessionScope(token), checked_at: Date.now(), expires_at: expiresAt }
}
