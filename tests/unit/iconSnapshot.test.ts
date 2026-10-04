import { describe, expect, it } from 'vitest'
import { projectBookmarkIconSnapshot } from '../../src/lib/iconSnapshot'
import { iconFixture } from '../helpers/iconFixture'

describe('single-body bookmark snapshot projection', () => {
  it('removes embedded body copies but preserves stable descriptors and non-image fields', () => {
    const blob = iconFixture().dataUri
    const source: any = { dataset_epoch: 'a'.repeat(32), icon_local_copy_protocol: 1, auth_receipt: { checked_at: 1 }, settings: {}, categories: [], bookmarks: [
      { id: 1, title: 'Inline', icon: blob, icon_blob: blob, icon_revision: 'sha256-' + 'b'.repeat(64), icon_write_epoch: 0 },
      { id: 2, title: 'Remote', icon: 'https://example.com/icon.svg', icon_blob: blob },
      { id: 3, title: 'Text', icon: '★', icon_blob: null },
    ] }
    const projected = projectBookmarkIconSnapshot(source)
    expect(projected.auth_receipt).toBeUndefined()
    expect(projected.bookmarks[0]).toMatchObject({ title: 'Inline', icon: null, icon_blob: null, icon_display: 'image', icon_revision: source.bookmarks[0].icon_revision })
    expect(projected.bookmarks[1].icon).toBe('https://example.com/icon.svg')
    expect(projected.bookmarks[2]).toBe(source.bookmarks[2])
    expect(JSON.stringify(projected)).not.toContain(blob)
    expect(source.bookmarks[0].icon_blob).toBe(blob)
    expect(projectBookmarkIconSnapshot(projected)).toBe(projected)
  })
})
