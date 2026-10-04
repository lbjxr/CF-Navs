import { ICON_COPY_MAX_BYTES, ICON_COPY_PROTOCOL, isIconRevision, type IconCopyRequest, type IconCopyResult, type IconDescriptor } from '../../shared/iconLocalCopy'
import { getCategoryIconData, setCategoryIconBlob, type CategoryIconData } from './db/categories'
import { decodeVersionedIcon, iconContentRevision } from './iconRevision'
import { fetchIcon, iconBytesToDataUri } from './iconData'
import { invalidateRuntimeDataCache } from './runtimeCache'

export function categoryIconDescriptor(id: number, row: CategoryIconData): IconDescriptor {
  const image = Boolean(row.icon_blob || row.icon?.startsWith('data:image/') || /^https?:\/\//i.test(row.icon ?? '') || /^[a-z0-9-]+:[a-z0-9-]+$/i.test(row.icon ?? ''))
  const ready = image && isIconRevision(row.icon_revision)
  return { object_type: 'category', object_id: id, dataset_epoch: row.dataset_epoch, write_epoch: row.icon_write_epoch,
    state: ready ? 'ready' : image ? 'unknown' : row.icon ? 'text' : 'empty', content_revision: ready ? row.icon_revision : null }
}
type Outcome = { status: 200 | 404 | 409 | 503; data: IconCopyResult }
const unavailable = (): Outcome => ({ status: 503, data: { protocol: ICON_COPY_PROTOCOL, reason: 'unavailable' } })

export async function obtainCategoryIconCopy(db: D1Database, input: IconCopyRequest): Promise<Outcome> {
  let row = await getCategoryIconData(db, input.object_id)
  if (!row) return { status: 404, data: { protocol: ICON_COPY_PROTOCOL, reason: 'not-found' } }
  if (!/^[a-f0-9]{32}$/.test(row.dataset_epoch ?? '')) return unavailable()
  let descriptor = categoryIconDescriptor(input.object_id, row)
  const conflict = (): Outcome => ({ status: 409, data: { protocol: ICON_COPY_PROTOCOL, reason: 'conflict', descriptor } })
  if (row.dataset_epoch !== input.dataset_epoch || row.icon_write_epoch !== input.expected_write_epoch ||
      (input.expected_content_revision !== null && row.icon_revision !== input.expected_content_revision)) return conflict()
  if (descriptor.state === 'empty' || descriptor.state === 'text') return { status: 200, data: { protocol: ICON_COPY_PROTOCOL, persistence: 'session-scoped', descriptor, image: null } }

  let icon = row.icon_blob ? decodeVersionedIcon(row.icon_blob) : null
  if (!icon && row.icon?.startsWith('data:image/')) icon = decodeVersionedIcon(row.icon)
  let source = row.icon ?? ''
  const iconify = /^([a-z0-9-]+):([a-z0-9-]+)$/i.exec(source)
  if (iconify) source = `https://api.iconify.design/${iconify[1]}/${iconify[2]}.svg`
  if (!icon && /^https?:\/\//i.test(source)) {
    const fetched = await fetchIcon(source, 5000, ICON_COPY_MAX_BYTES)
    if (!fetched.ok) return unavailable()
    icon = decodeVersionedIcon(iconBytesToDataUri(fetched.icon))
  }
  if (!icon) return unavailable()
  const revision = await iconContentRevision(icon)
  if (row.icon_revision !== revision || !row.icon_blob && !row.icon?.startsWith('data:image/')) {
    const wrote = await setCategoryIconBlob(db, input.object_id, iconBytesToDataUri(icon), row)
    row = await getCategoryIconData(db, input.object_id)
    if (!row) return { status: 404, data: { protocol: ICON_COPY_PROTOCOL, reason: 'not-found' } }
    descriptor = categoryIconDescriptor(input.object_id, row)
    if (!wrote || row.dataset_epoch !== input.dataset_epoch || row.icon_revision !== revision) return conflict()
    invalidateRuntimeDataCache()
  }
  const dataUri = iconBytesToDataUri(icon)
  return { status: 200, data: { protocol: ICON_COPY_PROTOCOL, persistence: 'session-scoped', descriptor,
    image: { mime: icon.contentType, byte_length: icon.bytes.byteLength, base64: dataUri.slice(dataUri.indexOf(',') + 1) } } }
}
