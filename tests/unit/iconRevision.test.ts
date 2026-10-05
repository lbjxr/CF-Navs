import { logoSurfIcon } from '../../src/lib/icons'
import { decodeIconDataUri } from '../../shared/iconDataUri'
import { describe, expect, it } from 'vitest'
import { decodeVersionedIcon, iconContentRevision } from '../../worker/lib/iconRevision'
import { isIconRevision, ICON_COPY_MAX_BYTES } from '../../shared/iconLocalCopy'
import { iconFixture } from '../helpers/iconFixture'

describe('image content identity', () => {
  it('certifies the actual UTF-8 logo generator output without changing content identity', async () => {
    const source = logoSurfIcon('图标 Audit', 'https://example.com')
    expect(source).toContain(';charset=utf-8,')
    const decoded = decodeVersionedIcon(source)
    expect(decoded).not.toBeNull()
    expect(await iconContentRevision(decoded!)).toBe(await iconContentRevision(decodeVersionedIcon(source.replace(';charset=utf-8', ''))!))
  })
  it.each(['utf-8', 'UTF-8', '"utf-8"'])('accepts UTF-8 charset %s with base64', (charset) => {
    const icon = iconFixture()
    expect(decodeVersionedIcon(icon.dataUri.replace(';base64', ';charset=' + charset + ';base64'))).toEqual(decodeVersionedIcon(icon.dataUri))
  })
  it.each([
    'data:image/svg+xml;charset=iso-8859-1,<svg/>',
    'data:image/svg+xml;unknown=1,<svg/>',
    'data:image/svg+xml;charset=utf-8;charset=utf-8,<svg/>',
    'data:image/svg+xml;base64;charset=utf-8,PHN2Zy8+',
    'data:image/svg+xml;charset=utf-8,%GG',
    'data:image/svg+xml;charset=utf-8;base64,%%%',
    'data:text/html;charset=utf-8,<svg/>',
    'data:image/svg+xml;charset=utf-8,' + '<svg>' + ' '.repeat(ICON_COPY_MAX_BYTES) + '</svg>',
  ])('rejects unsupported parameters or unsafe bodies %# in the shared parser', value => {
    expect(decodeIconDataUri(value)).toBeNull()
    expect(decodeVersionedIcon(value)).toBeNull()
  })
  it('is stable for the same decoded bytes, independent of data URI encoding', async () => {
    const fixture = iconFixture()
    const encoded = 'data:image/svg+xml,' + encodeURIComponent(new TextDecoder().decode(fixture.bytes))
    const revision = await iconContentRevision(decodeVersionedIcon(fixture.dataUri)!)
    expect(isIconRevision(revision)).toBe(true)
    expect(await iconContentRevision(decodeVersionedIcon(encoded)!)).toBe(revision)
    expect(await iconContentRevision(iconFixture('blue'))).not.toBe(revision)
  })

  it.each([
    '', 'data:image/png;base64,', 'data:image/png;base64,%%%',
    'data:image/png;base64,' + btoa('<html>not an image</html>'),
    'data:image/png;base64,' + btoa('arbitrary bytes'),
    'https://example.com/icon.png', 'data:text/html;base64,' + btoa('<svg/>'),
    'data:image/svg+xml;base64,' + btoa('<svg>' + ' '.repeat(ICON_COPY_MAX_BYTES) + '</svg>'),
  ])('does not certify invalid or oversized input %#', (value) => {
    expect(decodeVersionedIcon(value)).toBeNull()
  })
})
