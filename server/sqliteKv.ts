// SQLite 持久化 KV（替代 Cloudflare KV 的 get/put/delete 子集）。
// 登录限流（rl:login:*）与会话撤销（revoked:*）都带 TTL：写入存绝对过期时间，
// 读取时过期即删，后台定时器周期清理，避免过期键无限堆积。

import { DatabaseSync } from 'node:sqlite'
import type { KvLike } from './runtime'

export interface SqliteKvHandle {
  kv: KvLike
  close: () => void
  /** 立即清理已过期键，返回删除条数；后台定时器也会周期执行。 */
  purgeExpired: () => number
}

interface KvRow {
  value: string
  expires_at: number | null
}

export function createSqliteKv(path: string, cleanupIntervalMs = 60_000): SqliteKvHandle {
  const sqlite = new DatabaseSync(path)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)',
  )
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON kv (expires_at)')

  const getStmt = sqlite.prepare('SELECT value, expires_at FROM kv WHERE key = ?')
  const putStmt = sqlite.prepare(
    'INSERT OR REPLACE INTO kv (key, value, expires_at) VALUES (?, ?, ?)',
  )
  const deleteStmt = sqlite.prepare('DELETE FROM kv WHERE key = ?')
  const purgeStmt = sqlite.prepare(
    'DELETE FROM kv WHERE expires_at IS NOT NULL AND expires_at <= ?',
  )

  const purgeExpired = (): number => Number(purgeStmt.run(Date.now()).changes)

  const timer = setInterval(() => {
    try {
      purgeExpired()
    } catch {
      // 清理失败不影响业务路径：读取时仍有过期判断兜底。
    }
  }, cleanupIntervalMs)
  timer.unref()

  const kv: KvLike = {
    async get(key: string): Promise<string | null> {
      const row = getStmt.get(key) as KvRow | undefined
      if (!row) return null
      if (row.expires_at !== null && row.expires_at <= Date.now()) {
        deleteStmt.run(key)
        return null
      }
      return row.value
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      const expiresAt = options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : null
      putStmt.run(key, value, expiresAt)
    },
    async delete(key: string): Promise<void> {
      deleteStmt.run(key)
    },
  }

  return {
    kv,
    close: () => {
      clearInterval(timer)
      sqlite.close()
    },
    purgeExpired,
  }
}
