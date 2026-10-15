import type { Env } from '../types'

const MAX_REQUESTS = 12
// `cf-connecting-ip` 缺失时所有请求共用 'unknown' 桶：阈值更严，避免互相误伤的同时
// 也不让匿名流量轻易打满正常桶。
const MAX_REQUESTS_UNKNOWN_IP = 3
const WINDOW_MS = 60_000
const BLOCKED_MEMORY_MAX = 512
const blockedUntil = new Map<string, number>()

function clientKeyFor(ip: string): string {
  return ip || 'unknown'
}

function maxRequestsFor(clientKey: string): number {
  return clientKey === 'unknown' ? MAX_REQUESTS_UNKNOWN_IP : MAX_REQUESTS
}

function pruneBlocked(now: number): void {
  for (const [ip, expiresAt] of blockedUntil) {
    if (expiresAt <= now) blockedUntil.delete(ip)
  }
  while (blockedUntil.size > BLOCKED_MEMORY_MAX) {
    const oldest = blockedUntil.keys().next().value as string | undefined
    if (!oldest) break
    blockedUntil.delete(oldest)
  }
}

export function clearErrorReportRateLimitMemory(): void {
  blockedUntil.clear()
}

export async function consumeErrorReportQuota(env: Env, ip: string, now = Date.now()): Promise<boolean> {
  const clientKey = clientKeyFor(ip)
  pruneBlocked(now)
  if ((blockedUntil.get(clientKey) ?? 0) > now) return false

  const resetAt = now + WINDOW_MS
  const row = await env.DB.prepare(`
    INSERT INTO error_report_rate_limits (client_key, count, reset_at)
    VALUES (?, 1, ?)
    ON CONFLICT(client_key) DO UPDATE SET
      count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
    RETURNING count, reset_at
  `).bind(clientKey, resetAt, now, now).first<{ count: number; reset_at: number }>()

  if (!row || row.count > maxRequestsFor(clientKey)) {
    blockedUntil.set(clientKey, row?.reset_at ?? resetAt)
    return false
  }
  return true
}

// 只读配额检查（不消费）：给公开匿名端点在读 body 之前用，避免用大 body /
// 无效 JSON 打 CPU。解析失败不计次，解析成功后再调 consumeErrorReportQuota。
export async function hasErrorReportQuota(env: Env, ip: string, now = Date.now()): Promise<boolean> {
  const clientKey = clientKeyFor(ip)
  pruneBlocked(now)
  if ((blockedUntil.get(clientKey) ?? 0) > now) return false

  const row = await env.DB.prepare(
    'SELECT count, reset_at FROM error_report_rate_limits WHERE client_key = ?',
  ).bind(clientKey).first<{ count: number; reset_at: number }>()
  if (!row) return true
  if (row.reset_at <= now) return true
  return row.count < maxRequestsFor(clientKey)
}
