import { decodeIconDataUri } from '../../shared/iconDataUri'
import { iconBytesRevision } from '../../shared/iconLocalCopy'
import { sniffImageContentType, type FetchedIcon } from './iconData'

// A persisted revision certifies recognized image bytes, not a URL or HTTP success.
// The browser also decodes the image before creating a local durable copy.
export function decodeVersionedIcon(dataUri: string): FetchedIcon | null {
  const decoded = decodeIconDataUri(dataUri)
  if (!decoded) return null
  const contentType = sniffImageContentType(decoded.bytes, null)
  return contentType ? { bytes: decoded.bytes, contentType } : null
}

export async function iconContentRevision(icon: FetchedIcon): Promise<string> {
  return iconBytesRevision(icon.bytes, icon.contentType)
}
