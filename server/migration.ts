// D1 导出 → SQLite 导入（阶段 6）。
//
// 输入是 `wrangler d1 export` 产生的 SQL 文本（含 DDL 与 INSERT）。
// 导入到一个全新的 SQLite 文件：单事务执行整份导出，失败整体回滚不留半截库；
// 成功后做完整性校验并生成报告；最后删除 jwt_secret 设置行——应用下次读取时
// 会生成新密钥（worker/lib/jwt.ts 的 loadJwtSecret），旧 JWT 与旧图标授权
// 随之全部失效，与方案「迁移即轮换密钥」一致。KV 不迁移（限流/撤销记录重新积累）。

import { DatabaseSync } from 'node:sqlite'

export interface ImportReport {
  integrity: string
  foreignKeyViolations: number
  tables: Record<string, number>
  schemaVersion: string | null
  dataVersion: string | null
  installed: boolean
  bookmarksWithIconBlob: number
  jwtSecretRotated: boolean
}

const EXPECTED_TABLES = ['categories', 'bookmarks', 'settings', 'error_report_rate_limits', 'click_rate_limits']

export function importD1Export(exportSql: string, targetPath: string): ImportReport {
  const sqlite = new DatabaseSync(targetPath)
  try {
    sqlite.exec('PRAGMA foreign_keys = OFF') // 导出文件自带顺序，导入期先关约束，事后用 foreign_key_check 校验
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      sqlite.exec(exportSql)
      sqlite.exec('COMMIT')
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec('PRAGMA journal_mode = WAL')

    const integrity = Object.values(
      sqlite.prepare('PRAGMA integrity_check').get() as Record<string, unknown>,
    )[0] as string
    const fkViolations = sqlite.prepare('PRAGMA foreign_key_check').all().length

    const tables: Record<string, number> = {}
    for (const table of EXPECTED_TABLES) {
      const exists = sqlite
        .prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name = ?")
        .get(table) as { c: number }
      tables[table] =
        Number(exists.c) > 0
          ? Number((sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c)
          : -1 // 表缺失以 -1 标记，报告里一眼可见
    }

    const setting = (key: string): string | null => {
      if (tables.settings < 0) return null
      const row = sqlite
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(key) as { value: string } | undefined
      if (!row) return null
      try {
        const parsed: unknown = JSON.parse(row.value)
        return typeof parsed === 'string' ? parsed : row.value
      } catch {
        return row.value
      }
    }

    let bookmarksWithIconBlob = 0
    if (tables.bookmarks >= 0) {
      bookmarksWithIconBlob = Number(
        (sqlite
          .prepare('SELECT count(*) AS c FROM bookmarks WHERE icon_blob IS NOT NULL')
          .get() as { c: number }).c,
      )
    }

    // 密钥轮换：删除旧 jwt_secret，应用首次使用时自动生成新值
    let jwtSecretRotated = false
    if (tables.settings >= 0) {
      const removed = sqlite.prepare("DELETE FROM settings WHERE key = 'jwt_secret'").run()
      jwtSecretRotated = Number(removed.changes) > 0
    }

    return {
      integrity,
      foreignKeyViolations: fkViolations,
      tables,
      schemaVersion: setting('schema_version'),
      dataVersion: setting('data_version'),
      installed: setting('admin_username') !== null,
      bookmarksWithIconBlob,
      jwtSecretRotated,
    }
  } finally {
    sqlite.close()
  }
}
