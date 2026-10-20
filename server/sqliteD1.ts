// SQLite D1 兼容适配器（生产实现）。
//
// 以 tests/helpers/d1Sqlite.ts 已验证的语义为起点产品化：同一套 DAO 行为测试会
// 参数化地跑在两个适配器上（见 tests/unit/sqliteD1.test.ts），任何语义漂移都会被 CI 抓住。
//
// 与测试适配器的差异（生产缺口）：
// - 文件数据库 + WAL / 外键 / busy_timeout / synchronous=NORMAL
// - meta.changes 对 RETURNING 语句也精确：all() 执行后读 SELECT changes()
//   （已实测 INSERT/UPDATE/DELETE ... RETURNING 的计数与 run() 一致）
// - 提供 exec()；close() 负责连接生命周期

import { DatabaseSync } from 'node:sqlite'
import type { D1Like, D1PreparedStatementLike, D1ResultLike } from './runtime'

const QUERY_LIKE = /^\s*(SELECT|PRAGMA|WITH)\b/i
const HAS_RETURNING = /\bRETURNING\b/i

export interface SqliteD1Handle {
  db: D1Like
  /** 优雅关闭时调用：checkpoint WAL 并关闭连接。 */
  close: () => void
  /** 在线一致性备份（VACUUM INTO）；目标文件必须不存在。 */
  backup: (targetPath: string) => void
}

type StatementExecutor = (sql: string, bindings: unknown[]) => D1ResultLike

class SqlitePrepared implements D1PreparedStatementLike {
  constructor(
    private readonly execute: StatementExecutor,
    private readonly sql: string,
    private readonly bindings: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new SqlitePrepared(this.execute, this.sql, values)
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = this.execute(this.sql, this.bindings)
    return (result.results[0] as T | undefined) ?? null
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.execute(this.sql, this.bindings) as D1ResultLike<T>
  }

  async run(): Promise<D1ResultLike<Record<string, never>>> {
    const result = this.execute(this.sql, this.bindings)
    return { ...result, results: [] }
  }

  /** batch 的事务执行路径专用：本模块内部使用。 */
  executeInBatch(): D1ResultLike {
    return this.execute(this.sql, this.bindings)
  }
}

export function createSqliteD1(path: string): SqliteD1Handle {
  const sqlite = new DatabaseSync(path)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec('PRAGMA synchronous = NORMAL')

  const execute: StatementExecutor = (sql, bindings) => {
    const stmt = sqlite.prepare(sql)
    const args = bindings as never[]
    if (QUERY_LIKE.test(sql) && !HAS_RETURNING.test(sql)) {
      const results = stmt.all(...args) as Record<string, unknown>[]
      return { results, success: true, meta: { changes: 0, last_row_id: 0 } }
    }
    if (HAS_RETURNING.test(sql)) {
      const results = stmt.all(...args) as Record<string, unknown>[]
      const meta = sqlite
        .prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id')
        .get() as { changes: number | bigint; last_row_id: number | bigint }
      return {
        results,
        success: true,
        meta: { changes: Number(meta.changes), last_row_id: Number(meta.last_row_id) },
      }
    }
    const r = stmt.run(...args)
    return {
      results: [],
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    }
  }

  const db: D1Like = {
    prepare: (sql: string) => new SqlitePrepared(execute, sql),
    async batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]> {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        const results: D1ResultLike[] = []
        for (const statement of statements) {
          // 生产路径的语句恒由本模块的 prepare() 产生；走 SqlitePrepared 的内部执行入口，
          // 使 batch 事务内每条语句的语义与单独执行时一致（查询/RETURNING/变更分流）。
          results.push((statement as SqlitePrepared).executeInBatch())
        }
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    async exec(sql: string): Promise<{ count: number; duration: number }> {
      const start = Date.now()
      sqlite.exec(sql)
      return { count: 1, duration: Date.now() - start }
    },
  }

  return {
    db,
    close: () => {
      try {
        sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {
        // 只读或已关闭时 checkpoint 失败不阻碍关闭流程。
      }
      sqlite.close()
    },
    backup: (targetPath: string) => {
      const escaped = targetPath.replace(/'/g, "''")
      sqlite.exec(`VACUUM INTO '${escaped}'`)
    },
  }
}
