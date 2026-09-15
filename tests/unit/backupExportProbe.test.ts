import { describe, expect, it } from 'vitest'
import { pickExportSample, verifyExportDownload } from '../../scripts/lib/backupExportProbe.mjs'

const source = {
  categories: [
    { id: 1, parent_id: null, title: 'Empty first root', sort: 0 },
    { id: 2, parent_id: null, title: 'Parent', sort: 1 },
    { id: 3, parent_id: 2, title: 'Selected child', sort: 2 },
    { id: 4, parent_id: 2, title: 'Sibling', sort: 1 },
    { id: 5, parent_id: null, title: 'Other root', sort: 2 },
  ],
  bookmarks: [
    { id: 20, category_id: 2, title: 'Parent link', url: 'https://example.com/parent' },
    { id: 30, category_id: 3, title: 'Child link', url: 'https://example.com/child' },
    { id: 40, category_id: 4, title: 'Sibling link', url: 'https://example.com/sibling' },
    { id: 50, category_id: 5, title: 'Other link', url: 'https://example.com/other' },
  ],
  settings: { site_title: 'Export verification', navigation: { position: 'top' } },
}

function childPayload() {
  return {
    version: 2,
    exported_at: 1789250000000,
    categories: [source.categories[1], source.categories[2]],
    bookmarks: [source.bookmarks[1]],
    settings: null,
  }
}

function download(payload: unknown) {
  return {
    fileName: 'cf-navs-backup-2026-09-13.json',
    mime: 'application/json',
    bytes: JSON.stringify(payload).length,
    payload,
  }
}

describe('real backup export verification', () => {
  it('skips an empty first root and locates a nonempty child in UI sort order', () => {
    const sample = pickExportSample(source)
    expect(sample).toEqual({ rootId: 2, childId: 3, childIndex: 1, rootCategoryIds: [2, 4, 3] })
  })

  it('refuses a weak sample with no excluded bookmarks', () => {
    expect(pickExportSample({ ...source, bookmarks: [source.bookmarks[1]] })).toBeNull()
  })

  it('rejects a full backup masquerading as a partial download', () => {
    expect(verifyExportDownload(source, download(childPayload()), [3], false).passed).toBe(true)
    const full = download({ ...childPayload(), categories: source.categories, bookmarks: source.bookmarks })
    const result = verifyExportDownload(source, full, [3], false)
    expect(result.passed).toBe(false)
    expect(result.categoriesMatch).toBe(false)
    expect(result.bookmarksMatch).toBe(false)
  })

  it('rejects missing ancestors and duplicate category rows', () => {
    const missing = download({ ...childPayload(), categories: [source.categories[2]] })
    const duplicate = download({ ...childPayload(), categories: [source.categories[2], source.categories[2]] })
    expect(verifyExportDownload(source, missing, [3], false).categoriesMatch).toBe(false)
    expect(verifyExportDownload(source, duplicate, [3], false).categoriesMatch).toBe(false)
  })

  it('checks record contents even when the IDs and counts match', () => {
    const changed = download({
      ...childPayload(),
      bookmarks: [{ ...source.bookmarks[1], category_id: 2 }],
    })
    expect(verifyExportDownload(source, changed, [3], false).bookmarksMatch).toBe(false)
  })

  it('rejects leaked settings when disabled and missing settings when enabled', () => {
    const included = download({ ...childPayload(), settings: source.settings })
    const omitted = download(childPayload())
    expect(verifyExportDownload(source, included, [3], false).settingsMatch).toBe(false)
    expect(verifyExportDownload(source, omitted, [3], true).settingsMatch).toBe(false)
    expect(verifyExportDownload(source, included, [3], true).passed).toBe(true)
  })
})
