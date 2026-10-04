import { ICON_COPY_MAX_BYTES, iconBytesRevision } from '../../shared/iconLocalCopy'
import { sniffImageContentType, type FetchedIcon } from './iconData'

// A persisted revision certifies recognized image bytes, not a URL or HTTP success.
// The browser also decodes the image before creating a local durable copy.
export function decodeVersionedIcon(dataUri: string): FetchedIcon | null {
  if (dataUri.length > ICON_COPY_MAX_BYTES * 4 + 256) return null
  const match = /^data:(image\/[a-z0-9.+-]+)(;base64)?,([\s\S]*)$/i.exec(dataUri)
  if (!match) return null
  try {
    const bytes = match[2]
      ? Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]))
    if (!bytes.length || bytes.byteLength > ICON_COPY_MAX_BYTES) return null
    const contentType = sniffImageContentType(bytes, null)
    if (!contentType) return null
    return { bytes, contentType }
  } catch {
    return null
  }
}

export async function iconContentRevision(icon: FetchedIcon): Promise<string> {
  return iconBytesRevision(icon.bytes, icon.contentType)
}
