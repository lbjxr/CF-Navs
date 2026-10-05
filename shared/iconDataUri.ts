import { ICON_COPY_MAX_BYTES } from './iconLocalCopy'

/** Decode the supported image data URI forms, not proof that the bytes are an image.
 * UTF-8 is the only supported charset; unknown parameters must not be misdecoded.
 * Image sniffing (Worker) and revision/decode checks (browser) stay with callers.
 */
export function decodeIconDataUri(value: string): { bytes: Uint8Array<ArrayBuffer>; mime: string } | null {
  if (value.length > ICON_COPY_MAX_BYTES * 4 + 256) return null
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=(?:utf-8|"utf-8"))?(;base64)?,([\s\S]*)$/i.exec(value)
  if (!match) return null
  try {
    const bytes = match[2]
      ? Uint8Array.from(atob(match[3]), char => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]))
    return bytes.byteLength && bytes.byteLength <= ICON_COPY_MAX_BYTES
      ? { bytes, mime: match[1].toLowerCase() }
      : null
  } catch {
    return null
  }
}
