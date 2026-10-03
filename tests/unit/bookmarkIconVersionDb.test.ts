import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { iconFixture } from '../helpers/iconFixture'
import { createBookmark, getBookmarkIconData, setIconBlob, updateBookmark } from '../../worker/lib/db/bookmarks'
import { ensureSchema } from '../../worker/lib/db/schema'
import { BOOKMARK_ICON_TRIGGERS, INITIALIZE_ICON_DATASET_SQL } from '../../worker/lib/db/iconSchema'
import { importData } from '../../worker/lib/db/import'

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const open: ReturnType<typeof createSqliteD1>[] = []
afterEach(() => { for (const item of open.splice(0)) item.close() })
function database(source = schema) {
  const instance = createSqliteD1(source)
  open.push(instance)
  return instance
}
async function seeded() {
  const instance = database()
  instance.sqlite.exec("INSERT INTO categories(id,title,sort,created_at) VALUES(1,'Test',0,1)")
  const bookmark = await createBookmark(instance.db, { category_id: 1, title: 'Fixture', url: 'https://example.com', icon: 'https://example.com/a.svg' })
  return { ...instance, id: bookmark!.id }
}
function version(sqlite: ReturnType<typeof createSqliteD1>['sqlite']) {
  return sqlite.prepare("SELECT value FROM settings WHERE key='data_version'").get()?.value
}

describe('bookmark image version database boundary', () => {
  it('stores image and revision together and preserves identity for equal bytes', async () => {
    const { db, sqlite, id } = await seeded()
    const expected = (await getBookmarkIconData(db, id))!
    expect(expected.dataset_epoch).toMatch(/^[a-f0-9]{32}$/)
    expect(await setIconBlob(db, id, iconFixture().dataUri, expected)).toBe(true)
    const ready = (await getBookmarkIconData(db, id))!
    expect(ready.icon_revision).toMatch(/^sha256-/)
    const oldVersion = version(sqlite)
    const percentEncoded = 'data:image/svg+xml,' + encodeURIComponent(new TextDecoder().decode(iconFixture().bytes))
    expect(await setIconBlob(db, id, percentEncoded, ready)).toBe(true)
    expect((await getBookmarkIconData(db, id))!.icon_revision).toBe(ready.icon_revision)
    expect(version(sqlite)).toBe(oldVersion)
    const beforeChange = (await getBookmarkIconData(db, id))!
    expect(await setIconBlob(db, id, iconFixture('blue').dataUri, beforeChange)).toBe(true)
    expect(version(sqlite)).not.toBe(oldVersion)
  })

  it('rejects delayed writes after source ABA or a newer explicit refresh', async () => {
    const { db, id } = await seeded()
    const old = (await getBookmarkIconData(db, id))!
    const update = { category_id: 1, title: 'Fixture', url: 'https://example.com', icon: 'https://example.com/b.svg' }
    await updateBookmark(db, id, update)
    await updateBookmark(db, id, { ...update, icon: old.icon })
    expect(await setIconBlob(db, id, iconFixture().dataUri, old)).toBe(false)
    const first = (await getBookmarkIconData(db, id, true))!
    const second = (await getBookmarkIconData(db, id, true))!
    expect(await setIconBlob(db, id, iconFixture().dataUri, first)).toBe(false)
    expect(await setIconBlob(db, id, iconFixture('blue').dataUri, second)).toBe(true)
  })

  it('invalidates revisions for a legacy writer and publishes the change', async () => {
    const { db, sqlite, id } = await seeded()
    await setIconBlob(db, id, iconFixture().dataUri, (await getBookmarkIconData(db, id))!)
    const ready = (await getBookmarkIconData(db, id))!
    const oldVersion = version(sqlite)
    sqlite.prepare('UPDATE bookmarks SET icon_blob=? WHERE id=?').run(iconFixture('blue').dataUri, id)
    const legacy = (await getBookmarkIconData(db, id))!
    expect(legacy.icon_revision).toBeNull()
    expect(legacy.icon_write_epoch).toBeGreaterThan(ready.icon_write_epoch)
    expect(version(sqlite)).not.toBe(oldVersion)
    expect(await setIconBlob(db, id, iconFixture().dataUri, ready)).toBe(false)
  })

  it('does not attach a legacy source change to the previous source body', async () => {
    const { db, sqlite, id } = await seeded()
    await setIconBlob(db, id, iconFixture().dataUri, (await getBookmarkIconData(db, id))!)
    const before = (await getBookmarkIconData(db, id))!
    sqlite.prepare('UPDATE bookmarks SET icon=? WHERE id=?').run('https://example.com/new.svg', id)
    const current = (await getBookmarkIconData(db, id))!
    expect(current.icon_blob).toBeNull()
    expect(current.icon_revision).toBeNull()
    expect(current.icon_write_epoch).toBeGreaterThan(before.icon_write_epoch)
    expect(await setIconBlob(db, id, iconFixture().dataUri, before)).toBe(false)
  })

  it('keeps non-image edits stable and clears identity on a source change', async () => {
    const { db, id } = await seeded()
    await setIconBlob(db, id, iconFixture().dataUri, (await getBookmarkIconData(db, id))!)
    const ready = (await getBookmarkIconData(db, id))!
    const update = { category_id: 1, title: 'Renamed', url: 'https://example.com', icon: ready.icon }
    const renamed = await updateBookmark(db, id, update)
    expect(renamed!.icon_revision).toBe(ready.icon_revision)
    expect(renamed!.icon_write_epoch).toBe(ready.icon_write_epoch)
    const changed = await updateBookmark(db, id, { ...update, icon: null })
    expect(changed!.icon_revision).toBeNull()
    expect(changed!.icon_blob).toBeNull()
    expect(changed!.icon_write_epoch).toBeGreaterThan(ready.icon_write_epoch)
  })

  it('does not replace valid data with invalid new images', async () => {
    const { db, id } = await seeded()
    const old = (await getBookmarkIconData(db, id))!
    expect(await setIconBlob(db, id, 'data:image/png;base64,' + btoa('bad'), old)).toBe(false)
    expect((await getBookmarkIconData(db, id))!.icon_blob).toBeNull()
  })

  it('rotates the dataset atomically when import reconstructs IDs and ignores supplied revisions', async () => {
    const { db, id } = await seeded()
    const old = (await getBookmarkIconData(db, id))!
    const data = { categories: [{ id: 1, parent_id: null, title: 'Replacement', icon: null, sort: 0, created_at: 1 }], bookmarks: [{ id, category_id: 1, title: 'New', url: 'https://example.com/new', icon: old.icon, icon_source: null, icon_background_color: null, icon_blob: iconFixture('blue').dataUri, icon_revision: 'untrusted', icon_write_epoch: 999, description: null, open_method: 1 as const, sort: 0, created_at: 1 }] }
    await importData(db, data)
    const current = (await getBookmarkIconData(db, id))!
    expect(current.dataset_epoch).not.toBe(old.dataset_epoch)
    expect(current.icon_revision).toBeNull()
    expect(current.icon_write_epoch).toBe(0)
    expect(await setIconBlob(db, id, iconFixture().dataUri, old)).toBe(false)
    const epoch = current.dataset_epoch
    await expect(importData(db, { ...data, bookmarks: [data.bookmarks[0], data.bookmarks[0]] })).rejects.toThrow()
    expect((await getBookmarkIconData(db, id))!.dataset_epoch).toBe(epoch)
  })

  it('migrates old schema idempotently without reading image bodies', async () => {
    const legacy = schema.split('-- Versioned bookmark images:')[0]
      .replace(/^  icon_revision.*\n/m, '').replace(/^  icon_write_epoch.*\n/m, '')
    const { db, sqlite, statements } = database(legacy)
    await ensureSchema(db)
    await ensureSchema(db, true)
    const columns = sqlite.prepare('PRAGMA table_info(bookmarks)').all().map(row => row.name)
    expect(columns).toContain('icon_revision')
    expect(columns).toContain('icon_write_epoch')
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'bookmark_icon_%'").all()).toHaveLength(3)
    expect(statements.some(sql => /^SELECT.*icon_blob/i.test(sql))).toBe(false)
    expect(schema).toContain(INITIALIZE_ICON_DATASET_SQL)
    for (const trigger of BOOKMARK_ICON_TRIGGERS) expect(schema).toContain(trigger)
  })
})
