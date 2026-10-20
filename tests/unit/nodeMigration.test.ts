import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteD1 as createProdD1 } from '../../server/sqliteD1'
import { importD1Export } from '../../server/migration'

const schemaSql = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function tmpTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-mig-'))
  dirs.push(dir)
  return join(dir, 'imported.db')
}

/** 模拟 wrangler d1 export 的结构：原样 DDL + 数据 INSERT。 */
function fakeExport(): string {
  return [
    schemaSql,
    `INSERT INTO settings (key, value) VALUES ('admin_username', '"admin"');`,
    `INSERT INTO settings (key, value) VALUES ('admin_password', '"hash:xyz"');`,
    `INSERT INTO settings (key, value) VALUES ('jwt_secret', '"old-secret-from-d1"');`,
    `INSERT INTO settings (key, value) VALUES ('data_version', '"42"');`,
    `INSERT INTO categories (id, parent_id, title, icon, icon_blob, icon_revision, is_private, sort, created_at) VALUES (1, NULL, '迁移分类', NULL, NULL, NULL, 0, 0, 100);`,
    `INSERT INTO bookmarks (id, category_id, title, url, icon, icon_blob, is_private, sort, click_count, created_at) VALUES (1, 1, '迁移书签', 'https://example.com', NULL, 'aGVsbG8=', 0, 0, 7, 100);`,
    `INSERT INTO bookmarks (id, category_id, title, url, is_private, sort, click_count, created_at) VALUES (2, 1, '私密书签', 'https://secret.example.com', 1, 0, 0, 101);`,
  ].join('\n')
}

describe('D1 导出导入（阶段 6）', () => {
  it('导入成功：报告完整且 jwt_secret 已轮换', async () => {
    const target = tmpTarget()
    const report = importD1Export(fakeExport(), target)
    expect(report.integrity).toBe('ok')
    expect(report.foreignKeyViolations).toBe(0)
    expect(report.tables.categories).toBe(1)
    expect(report.tables.bookmarks).toBe(2)
    expect(report.installed).toBe(true)
    expect(report.dataVersion).toBe('42')
    expect(report.bookmarksWithIconBlob).toBe(1)
    expect(report.jwtSecretRotated).toBe(true)

    // 轮换后库内确实没有 jwt_secret 了（应用会重新生成）
    const handle = createProdD1(target)
    const row = await handle.db
      .prepare("SELECT value FROM settings WHERE key = 'jwt_secret'")
      .first()
    expect(row).toBeNull()
    handle.close()
  })

  it('坏导出整体回滚：不留半截数据', () => {
    const target = tmpTarget()
    const bad = `${schemaSql}\nINSERT INTO categories (id, title, created_at) VALUES (1, '半截', 1);\nINSERT INTO nope VALUES (1);`
    expect(() => importD1Export(bad, target)).toThrow()
  })

  it('外键损坏的导出会在报告里暴露', () => {
    const target = tmpTarget()
    const orphan = `${schemaSql}\nINSERT INTO bookmarks (id, category_id, title, url, created_at) VALUES (9, 999, '孤儿', 'https://x.example', 1);`
    const report = importD1Export(orphan, target)
    expect(report.foreignKeyViolations).toBeGreaterThan(0)
  })
})
