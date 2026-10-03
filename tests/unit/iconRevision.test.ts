import { describe, expect, it } from 'vitest'
import { decodeVersionedIcon, iconContentRevision } from '../../worker/lib/iconRevision'
import { isIconRevision, ICON_COPY_MAX_BYTES } from '../../shared/iconLocalCopy'
import { iconFixture } from '../helpers/iconFixture'

describe('image content identity', () => {
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
