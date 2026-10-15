import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { ensureSchema } from '../../worker/lib/db/schema'

// schema DDL 三处重复（schema.sql 安装文本、iconSchema.ts 触发器常量、
// schema.ts 迁移逻辑）曾靠注释维持同步。本测试断言：
//   旧库 --ensureSchema--> 与 schema.sql 全新安装的表结构等价
// （列名/类型/非空/默认值/主键、索引、触发器），改一处忘一处会被拦下。

const SCHEMA_SQL = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')

// 模拟"远古"旧库：只有最早期的核心列（定义与 schema.sql 一致），
// 无新增列、无新索引、无触发器。迁移后应收敛到与全新安装一致。
const OLD_SCHEMA_FIXTURE = `
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  open_method INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE error_report_rate_limits (client_key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sort ON bookmarks(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort);
`

type TableInfo = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }

function tableInfo(sqlite: { prepare: (sql: string) => { all: (...args: never[]) => TableInfo[] } }, table: string): TableInfo[] {
  // 按列名排序：迁移用 ALTER TABLE ADD COLUMN 追加列，列顺序与全新安装必然不同，
  // 语义上无关（SQLite 按名访问）。
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map((col) => ({
    name: col.name,
    type: col.type,
    notnull: col.notnull,
    dflt_value: col.dflt_value,
    pk: col.pk,
  })).sort((a, b) => a.name.localeCompare(b.name))
}

function schemaObjects(sqlite: {
  prepare: (sql: string) => { all: (...args: never[]) => { name: string; tbl_name: string; sql: string | null }[] }
}, type: 'index' | 'trigger'): { name: string; tbl_name: string; sql: string }[] {
  return sqlite
    .prepare(`SELECT name, tbl_name, sql FROM sqlite_master WHERE type = '${type}' AND sql IS NOT NULL ORDER BY name`)
    .all()
    .map((row) => ({ name: row.name, tbl_name: row.tbl_name, sql: (row.sql ?? '').replace(/\s+/g, ' ').trim() }))
}

describe('schema 一致性：旧库迁移收敛到 schema.sql', () => {
  it('列定义一致', async () => {
    const fresh = createSqliteD1(SCHEMA_SQL)
    const migrated = createSqliteD1(OLD_SCHEMA_FIXTURE)
    await ensureSchema(migrated.db)

    for (const table of ['categories', 'bookmarks', 'settings', 'error_report_rate_limits']) {
      expect(
        tableInfo(migrated.sqlite, table),
        `表 ${table} 的列与 schema.sql 不一致`,
      ).toEqual(tableInfo(fresh.sqlite, table))
    }

    fresh.close()
    migrated.close()
  })

  it('索引一致', async () => {
    const fresh = createSqliteD1(SCHEMA_SQL)
    const migrated = createSqliteD1(OLD_SCHEMA_FIXTURE)
    await ensureSchema(migrated.db)

    expect(schemaObjects(migrated.sqlite, 'index')).toEqual(schemaObjects(fresh.sqlite, 'index'))

    fresh.close()
    migrated.close()
  })

  it('触发器一致（iconSchema.ts）', async () => {
    const fresh = createSqliteD1(SCHEMA_SQL)
    const migrated = createSqliteD1(OLD_SCHEMA_FIXTURE)
    await ensureSchema(migrated.db)

    const freshTriggers = schemaObjects(fresh.sqlite, 'trigger')
    const migratedTriggers = schemaObjects(migrated.sqlite, 'trigger')
    expect(migratedTriggers.map((t) => t.name).sort()).toEqual(freshTriggers.map((t) => t.name).sort())
    expect(migratedTriggers).toEqual(freshTriggers)

    fresh.close()
    migrated.close()
  })

  it('迁移幂等：重复执行不报错且结构不变', async () => {
    const migrated = createSqliteD1(OLD_SCHEMA_FIXTURE)
    await ensureSchema(migrated.db)
    const before = tableInfo(migrated.sqlite, 'bookmarks')
    await ensureSchema(migrated.db, true)
    expect(tableInfo(migrated.sqlite, 'bookmarks')).toEqual(before)
    migrated.close()
  })
})
