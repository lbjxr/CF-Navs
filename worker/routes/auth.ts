import { Hono } from 'hono'
import type { ChangePasswordReq, LoginReq, LoginResp } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import {
  authRequired,
  cacheValidatedSession,
  clearAllCachedSessions,
  clearAllSessions,
  clearCachedSession,
  extractBearerToken,
  getSessionKey,
} from '../middleware/auth'
import { clearLoginFailures, getClientIp, loginRateLimit, recordLoginFailure } from '../middleware/rateLimit'
import { ensureAdminBootstrap, type AdminCredentials } from '../lib/bootstrap'
import { generateToken, hashPassword, verifyPassword } from '../lib/crypto'
import { setSettingValue } from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv, SessionValue } from '../types'

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const ADMIN_PASSWORD_KEY = 'admin_password'
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 256

export function getSessionTtlSeconds(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_SECONDS
}

export function isValidNewPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH
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
  const loginRateLimitState = c.get('loginRateLimitState')

  if (credentials.resetApplied) {
    await clearAllSessions(c.env)
    clearAllCachedSessions()
  }

  const writes: Promise<unknown>[] = [
    c.env.SESSION.put(getSessionKey(token), JSON.stringify(session), { expirationTtl: ttlSeconds }),
  ]
  if (loginRateLimitState) {
    writes.push(clearLoginFailures(c.env, ip))
  }

  await Promise.all(writes)
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

authRoutes.post('/password', authRequired, async (c) => {
  let body: ChangePasswordReq
  try {
    body = await c.req.json<ChangePasswordReq>()
  } catch {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid request body'))
  }

  if (typeof body.current_password !== 'string' || !body.current_password) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'current password is required'))
  }

  if (!isValidNewPassword(body.new_password)) {
    return c.json(fail(ErrCode.BAD_REQUEST, `new password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`))
  }

  let credentials: AdminCredentials
  try {
    credentials = await ensureAdminBootstrap(c.env, { applyCredentialReset: false })
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'admin bootstrap failed'))
  }

  const currentPasswordOk = await verifyPassword(body.current_password, credentials.passwordHash)
  if (!currentPasswordOk) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'current password is incorrect'))
  }

  try {
    await setSettingValue(c.env.DB, ADMIN_PASSWORD_KEY, await hashPassword(body.new_password))
    await clearAllSessions(c.env)
    clearAllCachedSessions()
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to update password'))
  }
})

authRoutes.get('/me', authRequired, (c) => {
  return c.json(ok({ username: c.get('username') }))
})

export default authRoutes
