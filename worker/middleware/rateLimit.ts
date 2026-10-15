import type { MiddlewareHandler } from 'hono'
import { ErrCode } from '../../shared/types'
import {
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  clearLoginAttempts,
  consumeLoginAttempt,
  readLoginAttempts,
} from '../lib/loginRateLimit'
import { fail } from '../lib/response'
import { hasSessionBinding } from '../lib/sessionStore'
import type { Env, HonoEnv, LoginRateLimitState } from '../types'

export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

// 记录一次登录失败。计数走 D1 原子 UPSERT（见 lib/loginRateLimit.ts），
// 不再信任调用方传进来的 state——并发下它一定是旧的。
export async function recordLoginFailure(
  env: Env,
  ip: string,
  _currentState?: LoginRateLimitState | null,
): Promise<void> {
  await consumeLoginAttempt(env.DB, ip)
}

export async function clearLoginFailures(env: Env, ip: string): Promise<void> {
  await clearLoginAttempts(env.DB, ip)
}

export const loginRateLimit: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // 缺 `SESSION` 绑定时给出可定位的错误，而不是让后续建会话时抛 TypeError 由
  // 全局 onError 兜成 `code=1500 internal server error`（PROB-31）。登录流程本身
  // 需要 SESSION 建会话，没有它不能假装登录成功——口径与 `/install` 的
  // `bindings_missing` 一致。限流计数本身已迁到 D1（原子 UPSERT），见
  // lib/loginRateLimit.ts。
  if (!hasSessionBinding(c.env)) {
    return c.json(fail(ErrCode.SERVER_ERROR, 'required SESSION binding is unavailable'))
  }

  const ip = getClientIp(c)
  const state = await readLoginAttempts(c.env.DB, ip)
  c.set('loginRateLimitState', state)

  if (state && state.resetAt > Date.now() && state.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return c.json(fail(ErrCode.RATE_LIMITED, 'too many login attempts'))
  }

  await next()
}
