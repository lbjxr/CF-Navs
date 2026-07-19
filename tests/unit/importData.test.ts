import { describe, expect, it } from 'vitest'
import type { BackupData } from '../../shared/types'
import { parseImportJsonText, prepareImportPayload, prepareImportText } from '../../src/lib/importData'

describe('prepareImportPayload', () => {
  it('passes through CF-Navs backups with counts and optional settings', () => {
    const backup: BackupData = {
      version: 1,
      exported_at: 123,
      categories: [
        { id: 1, title: 'Tools', icon: null, sort: 0, created_at: 100 },
      ],
      bookmarks: [
        {
          id: 1,
          category_id: 1,
          title: 'GitHub',
          url: 'https://github.com',
          icon: null,
          icon_source: null,
          icon_background_color: null,
          icon_blob: null,
          description: null,
          open_method: 1,
          sort: 0,
          created_at: 100,
        },
      ],
      settings: { site_title: 'Imported' } as BackupData['settings'],
    }

    const prepared = prepareImportPayload(backup, 'cf-navs')

    expect(prepared.sourceLabel).toBe('CF-Navs backup')
    expect(prepared.categories).toBe(1)
    expect(prepared.bookmarks).toBe(1)
    expect(prepared.payload.categories).toEqual([{ ...backup.categories[0], parent_id: null }])
    expect(prepared.payload.bookmarks).toBe(backup.bookmarks)
    expect(prepared.payload.settings).toEqual({ site_title: 'Imported' })
  })

  it('converts SunPanel categories, iconify icons, descriptions, and open methods', () => {
    const prepared = prepareImportPayload({
      icons: [
        {
          title: 'Apps',
          sort: 3,
          children: [
            {
              title: 'Docs',
              url: 'https://docs.example.com',
              icon: { icon: 'mdi/book-open', backgroundColor: '#112233' },
              description: 'Reference',
              openMethod: 1,
              sort: 7,
            },
            {
              title: 'Plain',
              url: 'https://plain.example.com',
              openMethod: 3,
            },
          ],
        },
      ],
    }, 'sunpanel')

    expect(prepared.sourceLabel).toBe('SunPanel export')
    expect(prepared.categories).toBe(1)
    expect(prepared.bookmarks).toBe(2)
    expect(prepared.payload.categories[0]).toMatchObject({
      id: 1,
      title: 'Apps',
      icon: null,
      sort: 3,
    })
    expect(prepared.payload.bookmarks[0]).toMatchObject({
      id: 1,
      category_id: 1,
      title: 'Docs',
      url: 'https://docs.example.com',
      icon: 'https://api.iconify.design/mdi/book-open.svg',
      icon_source: 'iconify',
      icon_background_color: '#112233',
      description: 'Reference',
      open_method: 2,
      sort: 7,
    })
    expect(prepared.payload.bookmarks[1]).toMatchObject({
      id: 2,
      category_id: 1,
      icon: 'https://favicon.im/plain.example.com?larger=true',
      open_method: 3,
    })
  })

  it('rejects malformed import sources with clear errors', () => {
    expect(() => prepareImportPayload({}, 'cf-navs')).toThrow('Backup file is missing categories / bookmarks')
    expect(() => prepareImportPayload({}, 'sunpanel')).toThrow('SunPanel file is missing icons')
    expect(() => prepareImportPayload({ icons: [] }, 'sunpanel')).toThrow('SunPanel file does not contain importable categories')
  })

  it('parses JSON text before preparing import payloads', () => {
    const prepared = prepareImportText(JSON.stringify({
      version: 1,
      categories: [{ id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0, created_at: 100 }],
      bookmarks: [],
    }), 'cf-navs')

    expect(prepared.categories).toBe(1)
    expect(prepared.bookmarks).toBe(0)
    expect(prepared.sourceLabel).toBe('CF-Navs backup')
  })

  it('rejects invalid JSON text with the UI-facing error message', () => {
    expect(() => parseImportJsonText('{bad json')).toThrow('文件不是有效的 JSON')
    expect(() => prepareImportText('{bad json', 'cf-navs')).toThrow('文件不是有效的 JSON')
  })
})
