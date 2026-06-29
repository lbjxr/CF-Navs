import { Hono } from 'hono'
import type { LoginReq, LoginResp } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import { authRequired, cacheValidatedSession, clearCachedSession, extractBearerToken, getSessionKey } from '../middleware/auth'
import { clearLoginFailures, getClientIp, loginRateLimit, recordLoginFailure } from '../middleware/rateLimit'
import { ensureAdminBootstrap, type AdminCredentials } from '../lib/bootstrap'
import { generateToken, verifyPassword } from '../lib/crypto'
import { fail, ok } from '../lib/response'
import type { HonoEnv, SessionValue } from '../types'

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

function getSessionTtlSeconds(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_SECONDS
}

export const authRoutes = new Hono<HonoEnv>()

authRoutes.post('/login', loginRateLimit, async (c) => {
  let credentials: AdminCredentials
  try {
    credentials = await ensureAdminBootstrap(c.env)
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'admin bootstrap failed'))
  }

  let body: LoginReq
  try {
    body = await c.req.json<LoginReq>()
  } catch {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid request body'))
  }

  const username = body.username?.trim()
  const password = body.password
  if (!username || !password) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'username and password are required'))
  }

  const ip = getClientIp(c)
  const passwordOk = username === credentials.username && (await verifyPassword(password, credentials.passwordHash))
  if (!passwordOk) {
    await recordLoginFailure(c.env, ip, c.get('loginRateLimitState'))
    return c.json(fail(ErrCode.UNAUTHORIZED, 'invalid credentials'))
  }

  const ttlSeconds = getSessionTtlSeconds(c.env.SESSION_TTL)
  const expires_at = Date.now() + ttlSeconds * 1000
  const token = generateToken()
  const session: SessionValue = { username: credentials.username, exp: expires_at }

  await Promise.all([
    c.env.SESSION.put(getSessionKey(token), JSON.stringify(session), { expirationTtl: ttlSeconds }),
    clearLoginFailures(c.env, ip),
  ])
  cacheValidatedSession(token, session)

  const data: LoginResp = { token, expires_at, username: credentials.username }
  return c.json(ok(data))
})

authRoutes.post('/logout', authRequired, async (c) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (token) {
    clearCachedSession(token)
    await c.env.SESSION.delete(getSessionKey(token))
  }
  return c.json(ok(null))
})

authRoutes.get('/me', authRequired, (c) => {
  return c.json(ok({ username: c.get('username') }))
})

export default authRoutes
