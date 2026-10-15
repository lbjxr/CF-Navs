import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { importData } from '../../worker/lib/db/import'
import { mergeImportData } from '../../worker/lib/db/importMerge'
import { listBookmarks } from '../../worker/lib/db/bookmarks'
import { listCategories } from '../../worker/lib/db/categories'
import { getSettings } from '../../worker/lib/db'

const SCHEMA_SQL = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')

// merge 模式增量写入：只 INSERT 新行，不 DELETE 全清；
// 现有行的 click_count 等运行时状态必须保留。

function category(id: number, title: string, parentId: number | null = null) {
  return { id, parent_id: parentId, title, icon: null, sort: 0, created_at: 1 }
}

function bookmark(id: number, categoryId: number, title: string, url: string) {
  return {
    id, category_id: categoryId, title, url, icon: null, description: null,
    open_method: 1 as const, sort: 0, created_at: 1,
  }
}

describe('merge 模式增量导入', () => {
  it('只插入新行，保留现有行及其 click_count', async () => {
    const { db, sqlite, close } = createSqliteD1(SCHEMA_SQL)

    // 现有数据：1 个分类 + 1 个书签（已有 42 次点击）
    await importData(db, {
      categories: [category(1, 'Tech')],
      bookmarks: [{ ...bookmark(1, 1, 'Old', 'https://old.example/'), click_count: 42 }],
    })
    const beforeVersion = sqlite.prepare("SELECT value FROM settings WHERE key = 'data_version'").get()?.value

    const current = {
      categories: await listCategories(db),
      bookmarks: await listBookmarks(db),
      settings: await getSettings(db),
    }
    const incoming = {
      categories: [category(101, 'Tech'), category(102, 'NewCat')],
      bookmarks: [bookmark(201, 101, 'New', 'https://new.example/')],
      settings: { site_title: 'Merged' },
    }
    const merged = mergeImportData(current, incoming)
    expect(merged.newCategories).toHaveLength(1)
    expect(merged.newBookmarks).toHaveLength(1)

    const result = await importData(
      db,
      { categories: merged.newCategories, bookmarks: merged.newBookmarks, settings: merged.payload.settings },
      { incremental: true },
    )
    expect(result.categories).toBe(1)
    expect(result.bookmarks).toBe(1)

    // 现有行原样保留（含 click_count），新行追加
    const categories = await listCategories(db)
    const bookmarks = await listBookmarks(db)
    expect(categories).toHaveLength(2)
    expect(bookmarks).toHaveLength(2)
    expect(bookmarks.find((b) => b.title === 'Old')).toMatchObject({ click_count: 42 })
    expect(bookmarks.find((b) => b.title === 'New')).toMatchObject({ url: 'https://new.example/' })
    // settings 照常 patch，data_version 被 touch
    expect((await getSettings(db)).site_title).toBe('Merged')
    expect(sqlite.prepare("SELECT value FROM settings WHERE key = 'data_version'").get()?.value).not.toBe(beforeVersion)

    close()
    expect(sqlite).toBeDefined()
  })

  it('无新行时只做 settings patch，不报错', async () => {
    const { db, close } = createSqliteD1(SCHEMA_SQL)
    await importData(db, {
      categories: [category(1, 'Tech')],
      bookmarks: [bookmark(1, 1, 'Old', 'https://old.example/')],
    })

    const current = {
      categories: await listCategories(db),
      bookmarks: await listBookmarks(db),
      settings: getSettings(db),
    }
    // 全部复用现有分类、无新书签
    const merged = mergeImportData(current, {
      categories: [category(101, 'Tech')],
      bookmarks: [],
      settings: { site_title: 'Patched' },
    })
    expect(merged.newCategories).toHaveLength(0)
    expect(merged.newBookmarks).toHaveLength(0)

    await importData(
      db,
      { categories: [], bookmarks: [], settings: merged.payload.settings },
      { incremental: true },
    )
    expect(await listCategories(db)).toHaveLength(1)
    expect(await listBookmarks(db)).toHaveLength(1)
    expect((await getSettings(db)).site_title).toBe('Patched')
    close()
  })
})
