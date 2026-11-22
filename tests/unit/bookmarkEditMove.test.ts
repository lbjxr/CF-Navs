import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkUpsertReq } from '../../shared/types'
import app from '../../worker/index'
import { cacheValidatedSession, clearAllCachedSessions } from '../../worker/middleware/auth'
import type { Env } from '../../worker/types'
import {
  getBookmarkForEdit,
  getBookmarkIconData,
  listBookmarks,
  setIconBlob,
  updateBookmark,
} from '../../worker/lib/db/bookmarks'
import { createMutationReceipt } from '../../worker/lib/db/mutation'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { iconFixture } from '../helpers/iconFixture'

vi.mock('../../schema.sql', () => ({ default: '' }))

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const instances: ReturnType<typeof createSqliteD1>[] = []
type Database = ReturnType<typeof createSqliteD1>

beforeEach(() => {
  vi.stubGlobal('caches', { default: { delete: vi.fn(async () => true) } })
})

afterEach(() => {
  for (const instance of instances.splice(0)) instance.close()
  clearAllCachedSessions()
  vi.unstubAllGlobals()
})

function database(targetSort: number[] = [5, 6]): Database {
  const instance = createSqliteD1(schema)
  instances.push(instance)
  for (const id of [1, 2, 3]) {
    instance.sqlite.prepare('INSERT INTO categories(id,title,sort,created_at) VALUES(?,?,?,1)')
      .run(id, `Fixture category ${id}`, id - 1)
  }
  const insert = instance.sqlite.prepare(
    'INSERT INTO bookmarks(id,category_id,title,url,sort,created_at) VALUES(?,?,?,?,?,1)',
  )
  for (const [id, sort] of [[1, 0], [10, 3], [11, 9]]) {
    insert.run(id, 1, `Fixture bookmark ${id}`, `https://example.com/${id}`, sort)
  }
  for (const [index, sort] of targetSort.entries()) {
    const id = 20 + index
    insert.run(id, 2, `Fixture bookmark ${id}`, `https://example.com/${id}`, sort)
  }
  instance.sqlite.exec(`INSERT OR REPLACE INTO settings(key,value) VALUES('data_version','"before-edit"')`)
  return instance
}

function payload(categoryId: number, overrides: Partial<BookmarkUpsertReq> = {}): BookmarkUpsertReq {
  return { category_id: categoryId, title: 'Edited fixture', url: 'https://example.com/10', ...overrides }
}

function categoryRows(instance: Database, categoryId: number) {
  return instance.sqlite.prepare('SELECT id, sort FROM bookmarks WHERE category_id = ? ORDER BY sort ASC, id ASC')
    .all(categoryId)
}

function rows(instance: Database) {
  return instance.sqlite.prepare('SELECT * FROM bookmarks ORDER BY id ASC').all()
}

function version(instance: Database): string {
  const row = instance.sqlite.prepare("SELECT value FROM settings WHERE key = 'data_version'")
    .get() as { value: string }
  return JSON.parse(row.value) as string
}

function putBookmark(instance: Database, id: number, body: BookmarkUpsertReq) {
  cacheValidatedSession('fixture-edit-session', { username: 'fixture', exp: Date.now() + 60_000 })
  return app.request(`https://navs.example.test/api/bookmarks/${id}`, {
    method: 'PUT',
    headers: { authorization: 'Bearer fixture-edit-session', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, { DB: instance.db } as Env)
}

describe('moving a bookmark by editing its category', () => {
  it.each([
    { targetSort: [5, 6], savedSort: 7, previousPosition: 'first' },
    { targetSort: [0, 2], savedSort: 3, previousPosition: 'last' },
    { targetSort: [0, 6], savedSort: 7, previousPosition: 'second' },
  ])('appends after target $targetSort even when the old sort would place it $previousPosition', async ({ targetSort, savedSort }) => {
    const instance = database(targetSort)
    const untouched = rows(instance).filter((row) => row.id !== 10)
    const receipt = createMutationReceipt()
    const before = version(instance)

    const saved = await updateBookmark(instance.db, 10, payload(2), receipt)

    expect(saved).toMatchObject({ id: 10, category_id: 2, sort: savedSort })
    expect((await listBookmarks(instance.db)).filter((bookmark) => bookmark.category_id === 2)
      .map((bookmark) => bookmark.id)).toEqual([20, 21, 10])
    expect(categoryRows(instance, 1)).toEqual([{ id: 1, sort: 0 }, { id: 11, sort: 9 }])
    expect(rows(instance).filter((row) => row.id !== 10)).toEqual(untouched)
    expect(receipt.data_version).toBe(version(instance))
    expect(version(instance)).not.toBe(before)
  })

  it('starts at zero when moving to an empty category', async () => {
    const instance = database()

    const saved = await updateBookmark(instance.db, 10, payload(3))

    expect(saved).toMatchObject({ category_id: 3, sort: 0 })
    expect(categoryRows(instance, 3)).toEqual([{ id: 10, sort: 0 }])
  })

  it('keeps its position and all other bookmarks when editing within the same category', async () => {
    const instance = database()
    const beforeOrder = categoryRows(instance, 1)
    const untouched = rows(instance).filter((row) => row.id !== 10)

    const saved = await updateBookmark(instance.db, 10, payload(1, {
      title: 'Renamed fixture', description: 'Updated description', open_method: 2,
    }))

    expect(saved).toMatchObject({ category_id: 1, sort: 3, title: 'Renamed fixture', description: 'Updated description', open_method: 2 })
    expect(categoryRows(instance, 1)).toEqual(beforeOrder)
    expect(rows(instance).filter((row) => row.id !== 10)).toEqual(untouched)
  })

  it('appends after sparse and tied target positions without renumbering the target', async () => {
    const instance = database([1, 40, 40])
    const untouched = rows(instance).filter((row) => row.id !== 10)

    const saved = await updateBookmark(instance.db, 10, payload(2))

    expect(saved).toMatchObject({ category_id: 2, sort: 41 })
    expect(categoryRows(instance, 2)).toEqual([
      { id: 20, sort: 1 }, { id: 21, sort: 40 }, { id: 22, sort: 40 }, { id: 10, sort: 41 },
    ])
    expect(rows(instance).filter((row) => row.id !== 10)).toEqual(untouched)
  })

  it('appends consecutive moves in save order instead of their previous sort order', async () => {
    const instance = database()

    const first = await updateBookmark(instance.db, 10, payload(2))
    const second = await updateBookmark(instance.db, 11, payload(2, { url: 'https://example.com/11' }))

    expect(first).toMatchObject({ id: 10, category_id: 2, sort: 7 })
    expect(second).toMatchObject({ id: 11, category_id: 2, sort: 8 })
    expect(categoryRows(instance, 2)).toEqual([
      { id: 20, sort: 5 }, { id: 21, sort: 6 }, { id: 10, sort: 7 }, { id: 11, sort: 8 },
    ])
    expect(categoryRows(instance, 1)).toEqual([{ id: 1, sort: 0 }])
  })

  it('uses the destination order again when the same bookmark moves between categories', async () => {
    const instance = database()

    expect(await updateBookmark(instance.db, 10, payload(2))).toMatchObject({ category_id: 2, sort: 7 })
    expect(await updateBookmark(instance.db, 10, payload(3))).toMatchObject({ category_id: 3, sort: 0 })
    expect(await updateBookmark(instance.db, 10, payload(2))).toMatchObject({ category_id: 2, sort: 7 })

    expect(categoryRows(instance, 2).map((row) => row.id)).toEqual([20, 21, 10])
    expect(categoryRows(instance, 3)).toEqual([])
  })

  it.each([
    { id: 10, categoryId: 999, code: 1003, reason: 'missing category' },
    { id: 10, categoryId: 0, code: 1002, reason: 'invalid category' },
    { id: 999, categoryId: 2, code: 1003, reason: 'missing bookmark' },
  ])('leaves all rows and the data version unchanged for a $reason', async ({ id, categoryId, code }) => {
    const instance = database()
    const beforeRows = rows(instance)
    const beforeVersion = version(instance)

    const response = await putBookmark(instance, id, payload(categoryId))
    const body = await response.json()

    expect(body).toMatchObject({ code, data: null })
    expect(body).not.toHaveProperty('data_version')
    expect(rows(instance)).toEqual(beforeRows)
    expect(version(instance)).toBe(beforeVersion)
  })

  it('saves through the authenticated PUT route, returns the committed order and preserves the original icon and cache', async () => {
    const instance = database()
    const sourceIcon = 'https://example.com/original.svg'
    instance.sqlite.prepare(`UPDATE bookmarks SET icon = ?, icon_source = 'custom',
      icon_background_color = '#123456', description = 'Original description',
      description_mode = 'hover', open_method = 3, is_private = 1 WHERE id = 10`).run(sourceIcon)
    const icon = iconFixture()
    expect(await setIconBlob(instance.db, 10, icon.dataUri, (await getBookmarkIconData(instance.db, 10))!)).toBe(true)
    const original = (await getBookmarkForEdit(instance.db, 10))!
    const originalIcon = (await getBookmarkIconData(instance.db, 10))!
    const body: BookmarkUpsertReq = { ...original, category_id: 2, is_private: true }
    const beforeRows = rows(instance)
    const beforeVersion = version(instance)
    const env = { DB: instance.db } as Env

    const denied = await app.request('https://navs.example.test/api/bookmarks/10', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, env)
    expect(denied.status).toBe(401)
    expect(rows(instance)).toEqual(beforeRows)
    expect(version(instance)).toBe(beforeVersion)

    const response = await putBookmark(instance, 10, body)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      code: 0,
      data_version: version(instance),
      data: { id: 10, category_id: 2, sort: 7, icon: sourceIcon, icon_source: 'custom', icon_blob: icon.dataUri },
    })
    expect(version(instance)).not.toBe(beforeVersion)
    expect(categoryRows(instance, 2).map((row) => row.id)).toEqual([20, 21, 10])

    const reread = await app.request('https://navs.example.test/api/bookmarks/10', {
      headers: { authorization: 'Bearer fixture-edit-session' },
    }, env)
    expect(await reread.json()).toMatchObject({ code: 0, data: { ...original, category_id: 2 } })
    expect(await getBookmarkIconData(instance.db, 10)).toMatchObject({
      icon: sourceIcon,
      icon_source: 'custom',
      icon_blob: icon.dataUri,
      icon_revision: originalIcon.icon_revision,
      icon_write_epoch: originalIcon.icon_write_epoch,
    })
    expect(rows(instance).filter((row) => row.id !== 10)).toEqual(beforeRows.filter((row) => row.id !== 10))
  })
})
