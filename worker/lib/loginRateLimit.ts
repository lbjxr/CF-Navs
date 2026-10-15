import type { LoginRateLimitState } from '../types'
import { ensureInstallRateLimitTable } from './installRateLimit'

// 登录失败限流（D1 原子计数）。
//
// 背景：此前计数器放在 KV（SESSION），read-modify-write 两步之间并发失败会丢计数，
// 攻击者用并发可绕过"5 次/10 分钟"限制。KV 没有原子递增/CAS 原语，无法在 KV 内修复。
// 改用 install_rate_limits 表（key 前缀 `login:` 与 install:/recover: 隔离），复用
// installRateLimit.ts 的原子 UPSERT 模式：INSERT ... ON CONFLICT DO UPDATE
// count=count+1，单语句内完成读-改-写，并发安全。
//
// 注意：middleware/rateLimit.ts 仍保留"缺 SESSION 绑定时 fail-closed"的 PROB-31
// 行为——登录流程本身需要 SESSION 建会话，限流存储换 D1 不改变这一点。

const LOGIN_RATE_LIMIT_PREFIX = 'login:'
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

function getLoginRateLimitKey(ip: string): string {
  return `${LOGIN_RATE_LIMIT_PREFIX}${ip}`
}

export async function readLoginAttempts(db: D1Database, ip: string): Promise<LoginRateLimitState | null> {
  await ensureInstallRateLimitTable(db)
  return db
    .prepare('SELECT count, reset_at AS resetAt FROM install_rate_limits WHERE client_key = ?')
    .bind(getLoginRateLimitKey(ip))
    .first<LoginRateLimitState>()
}

// 原子记录一次失败并返回是否已超限。窗口过期则重置计数。
export async function consumeLoginAttempt(db: D1Database, ip: string): Promise<boolean> {
  await ensureInstallRateLimitTable(db)
  const now = Date.now()
  const result = await db
    .prepare(
      `INSERT INTO install_rate_limits (client_key, count, reset_at)
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
       RETURNING count, reset_at AS resetAt`,
    )
    .bind(getLoginRateLimitKey(ip), now + LOGIN_RATE_LIMIT_WINDOW_MS, now, now)
    .first<LoginRateLimitState>()
  if (!result) throw new Error('failed to record login attempt')
  return result.resetAt > now && result.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS
}

export async function clearLoginAttempts(db: D1Database, ip: string): Promise<void> {
  await ensureInstallRateLimitTable(db)
  await db
    .prepare('DELETE FROM install_rate_limits WHERE client_key = ?')
    .bind(getLoginRateLimitKey(ip))
    .run()
}
