import { Hono } from 'hono'
import type { InstallBinding, InstallReq, InstallStatusResp } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import { hashPassword, secretsEqual } from '../lib/crypto'
import { getSettingValues, setSettingValue } from '../lib/db'
import { initializeSchema } from '../lib/installSchema'
import { fail, ok } from '../lib/response'
import { createSession } from '../lib/session'
import { hasSessionBinding } from '../lib/sessionStore'
import { getClientIp } from '../middleware/rateLimit'
import type { Env, HonoEnv, LoginRateLimitState } from '../types'

const ADMIN_USERNAME_KEY = 'admin_username'
const ADMIN_PASSWORD_KEY = 'admin_password'
const BOOTSTRAP_USERNAME_KEY = 'admin_bootstrap_username'
const BOOTSTRAP_PASSWORD_KEY = 'admin_bootstrap_password'
const INSTALL_MARKER_KEY = 'installation_schema_version'
const INSTALL_SCHEMA_VERSION = 1
const KV_PROBE_KEY = '__cf_navs_install_probe__'
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_SECONDS = 10 * 60
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000
const INSTALL_CLAIM_TTL_MS = 10 * 60 * 1000
const INSTALL_CLAIM_PREFIX = '__cf_navs_install_claim__:'
const CREATE_RATE_LIMIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS install_rate_limits (
    client_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    reset_at INTEGER NOT NULL
  )
`
const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 256
const MAX_USERNAME_LENGTH = 64
const CONTROL_CHARACTERS = /\p{Cc}/u

interface InstallationState {
  installed: boolean
  incompleteCredentials: boolean
  schemaVersion: number | null
}

function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function isMissingTableError(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .includes('no such table')
}

function getMissingBindings(env: Partial<Env>): InstallBinding[] {
  const missing: InstallBinding[] = []
  if (!env.DB || typeof env.DB.prepare !== 'function') missing.push('DB')
  if (!hasSessionBinding(env)) missing.push('SESSION')
  return missing
}

async function databaseIsReachable(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT 1 AS ok').first()
    return true
  } catch {
    return false
  }
}

async function sessionStoreIsReachable(session: KVNamespace): Promise<boolean> {
  try {
    await session.get(KV_PROBE_KEY)
    return true
  } catch {
    return false
  }
}

async function authorizeSetup(env: Env, suppliedToken: string | undefined): Promise<boolean> {
  const configuredToken = env.SETUP_TOKEN?.trim()
  if (!configuredToken || !suppliedToken) return false
  return secretsEqual(suppliedToken, configuredToken)
}

function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false

  const suppliedOrigin = request.headers.get('Origin')
  if (!suppliedOrigin) return true

  try {
    return new URL(suppliedOrigin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

function getRateLimitKey(ip: string): string {
  return `install:${ip}`
}

async function ensureInstallRateLimitTable(db: D1Database): Promise<void> {
  await db.prepare(CREATE_RATE_LIMIT_TABLE_SQL).run()
}

async function readInstallFailures(db: D1Database, ip: string): Promise<LoginRateLimitState | null> {
  return db
    .prepare('SELECT count, reset_at AS resetAt FROM install_rate_limits WHERE client_key = ?')
    .bind(getRateLimitKey(ip))
    .first<LoginRateLimitState>()
}

async function consumeInstallAttempt(db: D1Database, ip: string): Promise<boolean> {
  const now = Date.now()
  const key = getRateLimitKey(ip)
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
    .bind(key, now + RATE_LIMIT_WINDOW_MS, now, now)
    .first<LoginRateLimitState>()
  if (!result) throw new Error('failed to record installation attempt')
  return result.resetAt > now && result.count > RATE_LIMIT_MAX_ATTEMPTS
}

async function clearInstallFailures(db: D1Database, ip: string): Promise<void> {
  await db
    .prepare('DELETE FROM install_rate_limits WHERE client_key = ?')
    .bind(getRateLimitKey(ip))
    .run()
}

function createInstallClaim(): string {
  return `${INSTALL_CLAIM_PREFIX}${Date.now()}:${crypto.randomUUID()}`
}

function isStaleInstallClaim(value: unknown, now = Date.now()): value is string {
  if (typeof value !== 'string' || !value.startsWith(INSTALL_CLAIM_PREFIX)) return false
  const claimedAt = Number.parseInt(value.slice(INSTALL_CLAIM_PREFIX.length).split(':', 1)[0], 10)
  return Number.isFinite(claimedAt) && claimedAt + INSTALL_CLAIM_TTL_MS <= now
}

async function recoverStaleInstallClaim(db: D1Database): Promise<void> {
  let values: Map<string, string | null>
  try {
    values = await getSettingValues<string>(db, [ADMIN_USERNAME_KEY, ADMIN_PASSWORD_KEY, INSTALL_MARKER_KEY])
  } catch (error) {
    if (isMissingTableError(error)) return
    throw error
  }
  const username = values.get(ADMIN_USERNAME_KEY)
  if (!isStaleInstallClaim(username) || values.has(ADMIN_PASSWORD_KEY) || values.has(INSTALL_MARKER_KEY)) return
  await db
    .prepare('DELETE FROM settings WHERE key = ? AND value = ?')
    .bind(ADMIN_USERNAME_KEY, JSON.stringify(username))
    .run()
}

async function getInstallationState(db: D1Database, backfillMarker = false): Promise<InstallationState> {
  let values: Map<string, string | number | null>
  try {
    values = await getSettingValues<string | number>(db, [
      ADMIN_USERNAME_KEY,
      ADMIN_PASSWORD_KEY,
      INSTALL_MARKER_KEY,
    ])
  } catch (error) {
    if (isMissingTableError(error)) {
      return { installed: false, incompleteCredentials: false, schemaVersion: null }
    }
    throw error
  }

  const username = values.get(ADMIN_USERNAME_KEY)
  const passwordHash = values.get(ADMIN_PASSWORD_KEY)
  const marker = values.get(INSTALL_MARKER_KEY)
  const hasUsername = typeof username === 'string' && username.trim().length > 0
  const hasPassword = typeof passwordHash === 'string' && passwordHash.length > 0
  const hasMarker = typeof marker === 'number' && Number.isInteger(marker) && marker > 0
  const hasCompleteCredentials = hasUsername && hasPassword
  const installed = hasMarker || hasCompleteCredentials
  let schemaVersion = hasMarker ? marker : null

  if (hasCompleteCredentials && backfillMarker && schemaVersion == null) {
    await setSettingValue(db, INSTALL_MARKER_KEY, INSTALL_SCHEMA_VERSION)
    schemaVersion = INSTALL_SCHEMA_VERSION
  }

  return {
    installed,
    incompleteCredentials: hasUsername !== hasPassword,
    schemaVersion,
  }
}

export const installRoutes = new Hono<HonoEnv>()

installRoutes.get('/install/status', async (c) => {
  const missing = getMissingBindings(c.env)
  if (missing.includes('DB')) {
    return noStore(c.json(ok({ state: 'bindings_missing', missing } satisfies InstallStatusResp)))
  }

  if (!(await databaseIsReachable(c.env.DB))) {
    return noStore(c.json(ok({ state: 'unavailable', reason: 'database_unreachable' } satisfies InstallStatusResp)))
  }

  let state: InstallationState
  try {
    state = await getInstallationState(c.env.DB, true)
  } catch {
    return noStore(c.json(ok({ state: 'unavailable', reason: 'database_unreachable' } satisfies InstallStatusResp)))
  }

  if (state.installed) {
    return noStore(c.json(ok({
      state: 'installed',
      schema_version: state.schemaVersion ?? INSTALL_SCHEMA_VERSION,
    } satisfies InstallStatusResp)))
  }

  const sessionMissing = !hasSessionBinding(c.env)
  if (sessionMissing) {
    return noStore(c.json(ok({ state: 'bindings_missing', missing: ['SESSION'] } satisfies InstallStatusResp)))
  }
  if (!(await sessionStoreIsReachable(c.env.SESSION))) {
    return noStore(c.json(ok({ state: 'unavailable', reason: 'session_store_unreachable' } satisfies InstallStatusResp)))
  }

  if (!c.env.SETUP_TOKEN?.trim()) {
    return noStore(c.json(ok({
      state: 'configuration_required',
      reason: 'setup_token_missing',
      schema_version: state.schemaVersion,
    } satisfies InstallStatusResp)))
  }

  return noStore(c.json(ok({
    state: 'needs_install',
    schema_version: state.schemaVersion,
    setup_token_configured: true,
  } satisfies InstallStatusResp)))
})

installRoutes.post('/install', async (c) => {
  if (!isSameOriginRequest(c.req.raw)) {
    return noStore(c.json(fail(ErrCode.FORBIDDEN, 'cross-origin installation is not allowed'), 403))
  }

  const databaseMissing = !c.env.DB || typeof c.env.DB.prepare !== 'function'
  if (databaseMissing || !(await databaseIsReachable(c.env.DB))) {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'required bindings are unavailable')))
  }

  try {
    await recoverStaleInstallClaim(c.env.DB)
    const existing = await getInstallationState(c.env.DB, true)
    if (existing.installed) {
      return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'already installed')))
    }
    if (existing.incompleteCredentials) {
      return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'existing administrator credentials are incomplete')))
    }
  } catch {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
  }

  const sessionMissing = !hasSessionBinding(c.env)
  if (sessionMissing || !(await sessionStoreIsReachable(c.env.SESSION))) {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'required bindings are unavailable')))
  }

  const ip = getClientIp(c)
  let rateLimitState: LoginRateLimitState | null
  try {
    await ensureInstallRateLimitTable(c.env.DB)
    rateLimitState = await readInstallFailures(c.env.DB, ip)
  } catch {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
  }
  if (rateLimitState && rateLimitState.resetAt > Date.now() && rateLimitState.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return noStore(c.json(fail(ErrCode.RATE_LIMITED, 'too many setup token attempts')))
  }

  if (!(await authorizeSetup(c.env, c.req.header('X-Setup-Token')))) {
    try {
      const limited = await consumeInstallAttempt(c.env.DB, ip)
      if (limited) {
        return noStore(c.json(fail(ErrCode.RATE_LIMITED, 'too many setup token attempts')))
      }
    } catch {
      return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
    }
    return noStore(c.json(fail(ErrCode.UNAUTHORIZED, 'unauthorized'), 401))
  }

  let body: InstallReq
  try {
    body = await c.req.json<InstallReq>()
  } catch {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'invalid request body')))
  }

  const username = body.username?.trim()
  const password = body.password
  if (!username || username.length > MAX_USERNAME_LENGTH || CONTROL_CHARACTERS.test(username)) {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, `username must be 1-${MAX_USERNAME_LENGTH} characters without control characters`)))
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, `password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`)))
  }

  let claimToken: string | null = null
  try {
    await initializeSchema(c.env.DB)

    const passwordHash = await hashPassword(password)
    claimToken = createInstallClaim()
    const claimResult = await c.env.DB
      .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
      .bind(ADMIN_USERNAME_KEY, JSON.stringify(claimToken))
      .run()
    if (!claimResult.meta?.changes) {
      return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'already installed')))
    }

    await c.env.DB.batch([
      c.env.DB
        .prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?')
        .bind(JSON.stringify(username), ADMIN_USERNAME_KEY, JSON.stringify(claimToken)),
      c.env.DB
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind(ADMIN_PASSWORD_KEY, JSON.stringify(passwordHash)),
      c.env.DB
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind(BOOTSTRAP_USERNAME_KEY, JSON.stringify(username)),
      c.env.DB
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind(BOOTSTRAP_PASSWORD_KEY, JSON.stringify(passwordHash)),
      c.env.DB
        .prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
        .bind(INSTALL_MARKER_KEY, JSON.stringify(INSTALL_SCHEMA_VERSION)),
    ])

    const installedValues = await getSettingValues<string | number>(c.env.DB, [
      ADMIN_USERNAME_KEY,
      ADMIN_PASSWORD_KEY,
      BOOTSTRAP_USERNAME_KEY,
      BOOTSTRAP_PASSWORD_KEY,
      INSTALL_MARKER_KEY,
    ])
    const ownsClaim =
      installedValues.get(ADMIN_USERNAME_KEY) === username &&
      installedValues.get(ADMIN_PASSWORD_KEY) === passwordHash &&
      installedValues.get(BOOTSTRAP_USERNAME_KEY) === username &&
      installedValues.get(BOOTSTRAP_PASSWORD_KEY) === passwordHash
    if (!ownsClaim) {
      return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'already installed')))
    }

    await clearInstallFailures(c.env.DB, ip)
    try {
      return noStore(c.json(ok(await createSession(c.env, username))))
    } catch {
      return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'installation completed but session creation failed')))
    }
  } catch {
    if (claimToken) {
      try {
        const committed = await getInstallationState(c.env.DB)
        if (committed.installed) {
          return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'installation completed but session creation failed')))
        }
      } catch {
        // Continue with conditional claim cleanup.
      }
      try {
        await c.env.DB
          .prepare('DELETE FROM settings WHERE key = ? AND value = ?')
          .bind(ADMIN_USERNAME_KEY, JSON.stringify(claimToken))
          .run()
      } catch {
        // Preserve the original installation failure response.
      }
    }
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'installation failed')))
  }
})

export default installRoutes
