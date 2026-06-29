import type { MiddlewareHandler } from 'hono'
import { ErrCode } from '../../shared/types'
import { fail } from '../lib/response'
import type { Env, HonoEnv, LoginRateLimitState } from '../types'

const LOGIN_RATE_LIMIT_PREFIX = 'rl:login:'
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5
const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 10 * 60
const LOGIN_RATE_LIMIT_WINDOW_MS = LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000

export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

function getRateLimitKey(ip: string): string {
  return `${LOGIN_RATE_LIMIT_PREFIX}${ip}`
}

async function readRateLimitState(env: Env, ip: string): Promise<LoginRateLimitState | null> {
  const raw = await env.SESSION.get(getRateLimitKey(ip))
  if (!raw) return null

  try {
    return JSON.parse(raw) as LoginRateLimitState
  } catch {
    await env.SESSION.delete(getRateLimitKey(ip))
    return null
  }
}

export async function recordLoginFailure(
  env: Env,
  ip: string,
  currentState?: LoginRateLimitState | null,
): Promise<void> {
  const now = Date.now()
  const current = currentState === undefined ? await readRateLimitState(env, ip) : currentState

  const nextState: LoginRateLimitState =
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS }

  const ttlSeconds = Math.max(1, Math.ceil((nextState.resetAt - now) / 1000))
  await env.SESSION.put(getRateLimitKey(ip), JSON.stringify(nextState), { expirationTtl: ttlSeconds })
}

export async function clearLoginFailures(env: Env, ip: string): Promise<void> {
  await env.SESSION.delete(getRateLimitKey(ip))
}

export const loginRateLimit: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const ip = getClientIp(c)
  const state = await readRateLimitState(c.env, ip)
  c.set('loginRateLimitState', state)

  if (state && state.resetAt > Date.now() && state.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    return c.json(fail(ErrCode.RATE_LIMITED, 'too many login attempts'))
  }

  await next()
}
