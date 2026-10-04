import { ICON_COPY_MAX_BYTES, ICON_COPY_PROTOCOL, isIconRevision, type IconCopyRequest, type IconCopyResult, type IconDescriptor } from '../../shared/iconLocalCopy'
import { getBookmarkIconData, setIconBlob, type BookmarkIconData } from './db/bookmarks'
import { decodeVersionedIcon, iconContentRevision } from './iconRevision'
import { fetchIcon, iconBytesToDataUri } from './iconData'
import { invalidateRuntimeDataCache } from './runtimeCache'

export function bookmarkIconDescriptor(id: number, row: BookmarkIconData): IconDescriptor {
  const hasImage = Boolean(row.icon_blob || row.icon?.startsWith('data:image/') || /^https?:/i.test(row.icon ?? ''))
  return {
    object_type: 'bookmark', object_id: id, dataset_epoch: row.dataset_epoch,
    write_epoch: row.icon_write_epoch,
    state: (row.icon_blob || row.icon?.startsWith('data:image/')) && isIconRevision(row.icon_revision) ? 'ready' : hasImage ? 'unknown' : row.icon ? 'text' : 'empty',
    content_revision: (row.icon_blob || row.icon?.startsWith('data:image/')) && isIconRevision(row.icon_revision) ? row.icon_revision : null,
  }
}

type CopyOutcome = { status: 200 | 404 | 409 | 503; data: IconCopyResult }
const unavailable = (): CopyOutcome => ({ status: 503, data: { protocol: ICON_COPY_PROTOCOL, reason: 'unavailable' } })

/** Caller must authenticate. This path never uses an edge/ordinary-proxy response. */
export async function obtainBookmarkIconCopy(db: D1Database, input: IconCopyRequest): Promise<CopyOutcome> {
  let row = await getBookmarkIconData(db, input.object_id)
  if (!row) return { status: 404, data: { protocol: ICON_COPY_PROTOCOL, reason: 'not-found' } }
  if (!/^[a-f0-9]{32}$/.test(row.dataset_epoch ?? '')) return unavailable()
  let descriptor = bookmarkIconDescriptor(input.object_id, row)
  const conflict = (): CopyOutcome => ({ status: 409, data: { protocol: ICON_COPY_PROTOCOL, reason: 'conflict', descriptor } })
  if (row.dataset_epoch !== input.dataset_epoch || row.icon_write_epoch !== input.expected_write_epoch ||
    (input.expected_content_revision !== null && row.icon_revision !== input.expected_content_revision)) return conflict()
  if (descriptor.state === 'empty' || descriptor.state === 'text') {
    return { status: 200, data: { protocol: ICON_COPY_PROTOCOL, persistence: 'session-scoped', descriptor, image: null } }
  }

  let icon = row.icon_blob ? decodeVersionedIcon(row.icon_blob) : null
  if (!icon && row.icon?.startsWith('data:image/')) icon = decodeVersionedIcon(row.icon)
  if (!icon && /^https?:\/\//i.test(row.icon ?? '')) {
    const outcome = await fetchIcon(row.icon!, 5000, ICON_COPY_MAX_BYTES)
    if (!outcome.ok) return unavailable()
    // fetchIcon allows historical formats for online display; materialization only certifies known bytes.
    icon = decodeVersionedIcon(iconBytesToDataUri(outcome.icon))
  }
  if (!icon) return unavailable()
  const revision = await iconContentRevision(icon)
  if (row.icon_revision !== revision || !row.icon_blob && !row.icon?.startsWith('data:image/')) {
    const wrote = await setIconBlob(db, input.object_id, iconBytesToDataUri(icon), row)
    row = await getBookmarkIconData(db, input.object_id)
    if (!row) return { status: 404, data: { protocol: ICON_COPY_PROTOCOL, reason: 'not-found' } }
    descriptor = bookmarkIconDescriptor(input.object_id, row)
    if (!wrote || row.dataset_epoch !== input.dataset_epoch || row.icon_revision !== revision) return conflict()
    invalidateRuntimeDataCache()
  }
  return { status: 200, data: {
    protocol: ICON_COPY_PROTOCOL, persistence: 'session-scoped', descriptor,
    image: { mime: icon.contentType, byte_length: icon.bytes.byteLength, base64: iconBytesToDataUri(icon).split(',')[1] },
  } }
}
