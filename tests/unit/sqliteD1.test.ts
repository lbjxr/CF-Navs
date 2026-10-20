import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteD1 as createTestD1 } from '../helpers/d1Sqlite'
import { createSqliteD1 as createProductionD1 } from '../../server/sqliteD1'
import { ensureSchema, LATEST_SCHEMA_VERSION, readSchemaVersion } from '../../worker/lib/db/schema'

const schemaSql = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')

interface AdapterHandle {
  db: D1Database
  close: () => void
}

const closers: Array<() => void> = []
afterEach(() => {
  while (closers.length) closers.pop()!()
})

function makeTestAdapter(): AdapterHandle {
  const handle = createTestD1(schemaSql)
  closers.push(handle.close)
  return { db: handle.db, close: handle.close }
}

function makeProductionAdapter(): AdapterHandle {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-prod-d1-'))
  const handle = createProductionD1(join(dir, 'app.db'))
  closers.push(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })
  return {
    db: handle.db as unknown as D1Database,
    close: handle.close,
  }
}

/**
 * 同一套语义电池跑在测试适配器与生产适配器上：任何一方的行为漂移都会让这里变红。
 * 只断言两个适配器都承诺的契约面（run/batch 的 meta.changes、rows、回滚、触发器）。
 */
async function semanticBattery(db: D1Database): Promise<void> {
  // run()：changes 与 last_row_id
  const insert = await db
    .prepare('INSERT INTO categories (title, created_at) VALUES (?, ?)')
    .bind('差分分类', 1)
    .run()
  expect(insert.success).toBe(true)
  expect(insert.meta.changes).toBe(1)
  const catId = insert.meta.last_row_id
  expect(catId).toBeGreaterThan(0)

  // first()：RETURNING 行
  const bm = await db
    .prepare('INSERT INTO bookmarks (category_id, title, url, created_at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(catId, '差分书签', 'https://example.com', 1)
    .first<{ id: number }>()
  expect(bm?.id).toBeGreaterThan(0)

  // 触发器副作用：分类与书签的 epoch 触发器共用 settings.icon_epoch，
  // 上面已插入 1 分类 + 1 书签，计数 0 → 2
  const epoch1 = await db
    .prepare("SELECT value FROM settings WHERE key = 'icon_epoch'")
    .first<{ value: string }>()
  expect(epoch1?.value).toBe('2')

  // UPDATE 未命中：changes = 0（guarded bump 的判断依据）
  const noHit = await db
    .prepare('UPDATE categories SET title = title WHERE id = ?')
    .bind(999999)
    .run()
  expect(noHit.meta.changes).toBe(0)

  // batch：业务写入 + settings 写入同事务提交
  const batched = await db.batch([
    db.prepare('INSERT INTO categories (title, created_at) VALUES (?, ?)').bind('批分类', 2),
    db.prepare("INSERT INTO settings (key, value) VALUES ('dv_probe', '7')"),
  ])
  expect(batched.every((r) => r.success)).toBe(true)
  expect(batched[0].meta.changes).toBe(1)
  const dv = await db.prepare("SELECT value FROM settings WHERE key = 'dv_probe'").first<{ value: string }>()
  expect(dv?.value).toBe('7')

  // batch 中途失败整体回滚：第一条的分类也不得残留
  await expect(
    db.batch([
      db.prepare('INSERT INTO categories (title, created_at) VALUES (?, ?)').bind('回滚分类', 3),
      db
        .prepare('INSERT INTO bookmarks (category_id, title, url, created_at) VALUES (?, ?, ?, ?)')
        .bind(424242, 'bad', 'https://bad.example', 3),
    ]),
  ).rejects.toThrow()
  const leftover = await db
    .prepare('SELECT count(*) AS c FROM categories WHERE title = ?')
    .bind('回滚分类')
    .first<{ c: number }>()
  expect(Number(leftover?.c)).toBe(0)

  // DELETE 触发器：epoch 再 +1（此前 batch 又插入 1 个分类，计数已达 3 → 删除后 4）
  await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(bm!.id).run()
  const epoch2 = await db
    .prepare("SELECT value FROM settings WHERE key = 'icon_epoch'")
    .first<{ value: string }>()
  expect(epoch2?.value).toBe('4')
}

describe('sqliteD1 双适配器差分', () => {
  it('测试适配器通过语义电池', async () => {
    const { db } = makeTestAdapter()
    await semanticBattery(db)
  })

  it('生产适配器通过同一语义电池', async () => {
    const handle = makeProductionAdapter()
    await handle.db.exec(schemaSql)
    await semanticBattery(handle.db)
  })

  it('生产适配器：ensureSchema 迁移链可跑到最新版本', async () => {
    const handle = makeProductionAdapter()
    await handle.db.exec(schemaSql)
    await ensureSchema(handle.db as unknown as D1Database)
    expect(await readSchemaVersion(handle.db as unknown as D1Database)).toBe(LATEST_SCHEMA_VERSION)
  })

  it('生产适配器：VACUUM INTO 备份可读回', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-navs-prod-bak-'))
    closers.push(() => rmSync(dir, { recursive: true, force: true }))
    const handle = createProductionD1(join(dir, 'app.db'))
    closers.push(handle.close)
    await handle.db.exec(schemaSql)
    await handle.db
      .prepare('INSERT INTO categories (title, created_at) VALUES (?, ?)')
      .bind('备份分类', 1)
      .run()
    const target = join(dir, 'backup.db')
    handle.backup(target)

    const restored = createProductionD1(target)
    closers.push(restored.close)
    const row = await restored.db
      .prepare('SELECT title FROM categories WHERE title = ?')
      .bind('备份分类')
      .first<{ title: string }>()
    expect(row?.title).toBe('备份分类')
  })
})
