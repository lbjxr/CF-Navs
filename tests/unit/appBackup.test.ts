import { describe, expect, it } from 'vitest'
import type { AdminData, Bookmark, Category } from '../../shared/types'
import {
  BACKUP_VERSION,
  createBackupExportArtifact,
  createBackupExportMessage,
  createBackupFileName,
  createBackupPayload,
  createImportSuccessMessage,
} from '../../src/lib/appBackup'

const category: Category = {
  id: 1,
  parent_id: null,
  title: 'Tools',
  icon: null,
  sort: 0,
  created_at: 100,
}

const bookmark: Bookmark = {
  id: 10,
  category_id: 1,
  title: 'GitHub',
  url: 'https://github.com',
  icon: null,
  icon_source: null,
  icon_background_color: null,
  icon_blob: null,
  icon_cached: null,
  description: null,
  open_method: 1,
  sort: 0,
  created_at: 200,
}

describe('app backup helpers', () => {
  it('creates export payloads from current admin data', () => {
    const adminData: AdminData = {
      categories: [category],
      bookmarks: [bookmark],
      settings: null,
    }

    expect(createBackupPayload(adminData, 12345)).toEqual({
      version: BACKUP_VERSION,
      exported_at: 12345,
      categories: [category],
      bookmarks: [bookmark],
      settings: null,
    })
  })

  it('builds dated backup filenames', () => {
    expect(createBackupFileName(new Date('2026-07-07T08:00:00.000Z'))).toBe('cf-navs-backup-2026-07-07.json')
  })

  it('builds export and import success messages', () => {
    expect(createBackupExportMessage({ categories: [category], bookmarks: [bookmark, { ...bookmark, id: 11 }] }))
      .toBe('已导出 1 个分类、2 个书签。')

    expect(createImportSuccessMessage({ categories: 3, bookmarks: 9 })).toBe('导入成功：3 个分类、9 个书签。')
  })

  it('bundles export artifacts for direct download without extra assembly in the view', () => {
    const adminData: AdminData = {
      categories: [category],
      bookmarks: [bookmark],
      settings: null,
    }

    const artifact = createBackupExportArtifact(adminData, 12345)

    expect(artifact.payload.version).toBe(BACKUP_VERSION)
    expect(artifact.payload.exported_at).toBe(12345)
    expect(artifact.json).toBe(JSON.stringify(artifact.payload, null, 2))
    expect(artifact.fileName).toBe('cf-navs-backup-1970-01-01.json')
    expect(artifact.message).toBe('已导出 1 个分类、1 个书签。')
  })
})
