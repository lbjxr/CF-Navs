import type { MiddlewareHandler } from 'hono'
import { ErrCode } from '../../shared/types'
import { fail } from '../lib/response'
import type { Env, HonoEnv, SessionValue } from '../types'
import { getJwtSecret, verifyJwt, rotateJwtSecret } from '../lib/jwt'
import { isSessionRevoked } from '../lib/sessionRevocation'
import { hasSessionBinding } from '../lib/sessionStore'

const SESSION_MEMORY_CACHE_TTL_MS = 15_000
const SESSION_MEMORY_CACHE_MAX = 256

type CachedSession = {
  session: SessionValue
  expiresAt: number
}

const sessionMemoryCache = new Map<string, CachedSession>()

export function extractBearerToken(authorization: string | undefined | null): string | null {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  const token = match?.[1]?.trim()
  return token ? token : null
}

function pruneSessionMemoryCache(now = Date.now()): void {
  for (const [token, cached] of sessionMemoryCache) {
    if (cached.expiresAt <= now || cached.session.exp <= now) {
      sessionMemoryCache.delete(token)
    }
  }

  while (sessionMemoryCache.size > SESSION_MEMORY_CACHE_MAX) {
    const oldest = sessionMemoryCache.keys().next().value as string | undefined
    if (!oldest) break
    sessionMemoryCache.delete(oldest)
  }
}

export function cacheValidatedSession(token: string, session: SessionValue): void {
  const now = Date.now()
  if (!session.username || typeof session.exp !== 'number' || session.exp <= now) {
    sessionMemoryCache.delete(token)
    return
  }

  sessionMemoryCache.set(token, {
    session,
    expiresAt: Math.min(session.exp, now + SESSION_MEMORY_CACHE_TTL_MS),
  })
  pruneSessionMemoryCache(now)
}

export function clearCachedSession(token: string): void {
  sessionMemoryCache.delete(token)
}

export function clearAllCachedSessions(): void {
  sessionMemoryCache.clear()
}

export async function clearAllSessions(env: Env): Promise<void> {
  await rotateJwtSecret(env.DB)
}

export async function validateSession(env: Env, token: string): Promise<SessionValue | null> {
  const now = Date.now()
  const cached = sessionMemoryCache.get(token)
  if (cached && cached.expiresAt > now && cached.session.exp > now) {
    return cached.session
  }
  if (cached) {
    sessionMemoryCache.delete(token)
  }

  const secret = await getJwtSecret(env.DB)
  const payload = await verifyJwt(token, secret)
  if (!payload) {
    sessionMemoryCache.delete(token)
    return null
  }

  const session: SessionValue = {
    username: payload.username as string,
    exp: payload.exp as number,
  }

  if (!session.username || typeof session.exp !== 'number' || session.exp <= Date.now()) {
    sessionMemoryCache.delete(token)
    return null
  }

  // 撤销检查只在内存缓存未命中时走 KV，成本模型与既有的 session 缓存一致：
  // 每个 isolate 每个 token 最多 15 秒一次读。代价是别的 isolate 上的 logout
  // 最多 15 秒后才生效，这个窗口是刻意换来的，不要为了「立刻生效」去掉缓存。
  //
  // 缺 `SESSION` 绑定时**拒绝会话**，不再静默跳过（PROB-31）。跳过等于「撤销名单不存在」
  // 而调用方无从得知——logout 会显得成功，token 却一直有效到 exp。绑定缺失是确定性的
  // 配置错误（`/install` 本来就以 `bindings_missing` 拒绝安装），只能 fail-closed。
  if (!hasSessionBinding(env) || await isSessionRevoked(env.SESSION, token)) {
    sessionMemoryCache.delete(token)
    return null
  }

  cacheValidatedSession(token, session)
  return session
}

export const authRequired: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (!token) {
    return c.json(fail(ErrCode.UNAUTHORIZED, 'unauthorized'), 401)
  }

  const session = await validateSession(c.env, token)
  if (!session) {
    return c.json(fail(ErrCode.UNAUTHORIZED, 'unauthorized'), 401)
  }

  c.set('username', session.username)
  c.set('sessionExpiresAt', session.exp)
  await next()
}
