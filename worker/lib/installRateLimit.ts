import type { LoginRateLimitState } from '../types'

// 安装与恢复共用的 D1 失败限流。表 install_rate_limits 以 client_key 为主键，
// 调用方传入含命名空间前缀的完整 key（install:<ip> / recover:<ip>），两条流程计数隔离。
export const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

const CREATE_RATE_LIMIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS install_rate_limits (
    client_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
  )
`

const initializedRateLimitTables = new WeakSet<D1Database>()
const pendingRateLimitTableInits = new WeakMap<D1Database, Promise<void>>()

export async function ensureInstallRateLimitTable(db: D1Database): Promise<void> {
  // isolate 级懒初始化：每个 D1Database 实例只建一次表，避免每次请求都多一次 DDL 往返。
  // 与 db/schema.ts 的 checkedSchemas 同模式；CREATE TABLE IF NOT EXISTS 本身幂等，
  // 这里只是省掉重复的 round-trip。
  if (initializedRateLimitTables.has(db)) return
  const pending = pendingRateLimitTableInits.get(db)
  if (pending) return pending
  const operation = db.prepare(CREATE_RATE_LIMIT_TABLE_SQL).run().then(() => {
    initializedRateLimitTables.add(db)
  })
  pendingRateLimitTableInits.set(db, operation)
  try {
    await operation
  } finally {
    pendingRateLimitTableInits.delete(db)
  }
}

export async function readInstallFailures(db: D1Database, clientKey: string): Promise<LoginRateLimitState | null> {
  return db
    .prepare('SELECT count, reset_at AS resetAt FROM install_rate_limits WHERE client_key = ?')
    .bind(clientKey)
    .first<LoginRateLimitState>()
}

// 记录一次失败尝试并返回是否已超限。窗口过期则重置计数。
export async function consumeInstallAttempt(db: D1Database, clientKey: string): Promise<boolean> {
  const now = Date.now()
  const result = await db
    .prepare(`
      INSERT INTO install_rate_limits (client_key, count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(client_key) DO UPDATE SET
        count = CASE
          WHEN install_rate_limits.reset_at <= ? THEN 1
          ELSE install_rate_limits.count + 1
        END,
        reset_at = CASE
          WHEN install_rate_limits.reset_at <= ? THEN excluded.reset_at
          ELSE install_rate_limits.reset_at
        END
      RETURNING count, reset_at
    `)
    .bind(clientKey, now + RATE_LIMIT_WINDOW_MS, now, now)
    .first<LoginRateLimitState>()
  if (!result) throw new Error('failed to record rate limit attempt')
  return result.resetAt > now && result.count > RATE_LIMIT_MAX_ATTEMPTS
}

export async function clearInstallFailures(db: D1Database, clientKey: string): Promise<void> {
  await db
    .prepare('DELETE FROM install_rate_limits WHERE client_key = ?')
    .bind(clientKey)
    .run()
}
