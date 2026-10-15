import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../helpers/d1Sqlite'
import { ErrCode } from '../../../shared/types'
import { casDataVersion, getDataVersion } from '../../../worker/lib/db/settings'
import { DATA_VERSION_KEY } from '../../../worker/lib/db/sql'
import { BookmarkReorganizeError, sortBookmarks } from '../../../worker/lib/db/bookmarks'
import settingsRoutes from '../../../worker/routes/settings'

const schema = readFileSync(new URL('../../../schema.sql', import.meta.url), 'utf8')
const open: ReturnType<typeof createSqliteD1>[] = []
afterEach(() => { for (const item of open.splice(0)) item.close() })

function database() {
  const instance = createSqliteD1(schema)
  open.push(instance)
  return instance
}

describe('casDataVersion', () => {
  it('bumps the version atomically when expected matches', async () => {
    const { db } = database()
    const before = await getDataVersion(db)

    const next = await casDataVersion(db, before)

    expect(next).not.toBeNull()
    expect(next).not.toBe(before)
    expect(await getDataVersion(db)).toBe(next)
  })

  it('returns null and leaves the stored version untouched on stale expected', async () => {
    const { db } = database()
    const before = await getDataVersion(db)
    const next = await casDataVersion(db, before)

    // 另一个写入者已经先提交：旧版本再 CAS 必须失败
    const stale = await casDataVersion(db, before)

    expect(stale).toBeNull()
    expect(await getDataVersion(db)).toBe(next)
  })

  it('inserts the version row when it is missing', async () => {
    const { db, sqlite } = database()
    sqlite.exec(`DELETE FROM settings WHERE key = '${DATA_VERSION_KEY}'`)

    const next = await casDataVersion(db, '0')

    expect(next).not.toBeNull()
    expect(await getDataVersion(db)).toBe(next)
  })
})

describe('PUT /api/settings CAS (route)', () => {
  beforeEach(() => {
    vi.stubGlobal('caches', { default: { delete: vi.fn(async () => true) } })
  })
  afterEach(() => vi.unstubAllGlobals())

  function putSettings(db: D1Database, body: unknown) {
    return settingsRoutes.request('https://example.test/', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, { DB: db })
  }

  it('returns 409 with a refresh hint when data_version is stale', async () => {
    const { db } = database()
    const version = await getDataVersion(db)
    // 另一个会话先提交了一次，版本已推进
    await casDataVersion(db, version)

    const response = await putSettings(db, { site_title: 'Stale', data_version: version })

    expect(response.status).toBe(409)
    const json = await response.json() as { code: number; msg: string }
    expect(json.code).toBe(ErrCode.CONFLICT)
    expect(json.msg).toContain('刷新')
  })

  it('applies the patch and never persists data_version as a setting', async () => {
    const { db, sqlite } = database()
    const version = await getDataVersion(db)

    const response = await putSettings(db, { site_title: 'New', data_version: version })

    expect(response.status).toBe(200)
    const title = sqlite.prepare("SELECT value FROM settings WHERE key = 'site_title'").get() as { value: string }
    expect(JSON.parse(title.value)).toBe('New')
    // data_version 仍是内部版本行（恰好一行），且已被原子推进
    const versionRows = sqlite.prepare(`SELECT value FROM settings WHERE key = '${DATA_VERSION_KEY}'`).all() as Array<{ value: string }>
    expect(versionRows).toHaveLength(1)
    expect(await getDataVersion(db)).not.toBe(version)
  })

  it('keeps legacy overwrite behavior when data_version is absent', async () => {
    const { db, sqlite } = database()

    const response = await putSettings(db, { site_title: 'Legacy' })

    expect(response.status).toBe(200)
    const title = sqlite.prepare("SELECT value FROM settings WHERE key = 'site_title'").get() as { value: string }
    expect(JSON.parse(title.value)).toBe('Legacy')
  })

  it('rejects a non-string data_version', async () => {
    const { db } = database()

    const response = await putSettings(db, { site_title: 'X', data_version: 123 })

    // badRequest 按项目约定回 HTTP 200 + BAD_REQUEST 码（见 routeHelpers.badRequest）
    expect(response.status).toBe(200)
    const json = await response.json() as { code: number; msg: string }
    expect(json.code).toBe(ErrCode.BAD_REQUEST)
    expect(json.msg).toContain('data_version')
  })
})

describe('sortBookmarks expected snapshot', () => {
  function seedBookmarks() {
    const { db, sqlite } = database()
    sqlite.exec("INSERT INTO categories(id,title,sort,created_at) VALUES(1,'C',0,1)")
    sqlite.exec(
      "INSERT INTO bookmarks(id,category_id,title,url,sort,created_at) VALUES" +
      "(10,1,'A','https://a.test',0,1),(11,1,'B','https://b.test',1,1)",
    )
    return { db, sqlite }
  }

  it('applies the new order when ids cover the complete bookmark set', async () => {
    const { db, sqlite } = seedBookmarks()

    await sortBookmarks(db, [11, 10])

    const rows = sqlite.prepare('SELECT id FROM bookmarks ORDER BY sort ASC').all() as Array<{ id: number }>
    expect(rows.map((row) => row.id)).toEqual([11, 10])
  })

  it('rejects a stale snapshot instead of silently dropping concurrent writes', async () => {
    const { db } = seedBookmarks()

    // 客户端快照缺了一个书签（并发新增）
    await expect(sortBookmarks(db, [10])).rejects.toBeInstanceOf(BookmarkReorganizeError)
    // 客户端快照里有多余的 id（并发删除）
    await expect(sortBookmarks(db, [10, 11, 999])).rejects.toBeInstanceOf(BookmarkReorganizeError)
    // 重复 id
    await expect(sortBookmarks(db, [10, 10])).rejects.toBeInstanceOf(BookmarkReorganizeError)
  })
})
