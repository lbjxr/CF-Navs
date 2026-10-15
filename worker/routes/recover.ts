import { Hono } from 'hono'
import type { RecoverReq } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import {
  ADMIN_PASSWORD_KEY,
  ADMIN_USERNAME_KEY,
  INSTALL_MARKER_KEY,
} from '../lib/bootstrap'
import { hashPassword } from '../lib/crypto'
import { getSettingValues, setSettingValue } from '../lib/db'
import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH } from '../../shared/passwordPolicy'
import { fail, ok } from '../lib/response'
import { createSession } from '../lib/session'
import { hasSessionBinding } from '../lib/sessionStore'
import { authorizeSetup, isSameOriginRequest } from '../lib/setupToken'
import {
  RATE_LIMIT_MAX_ATTEMPTS,
  clearInstallFailures,
  consumeInstallAttempt,
  ensureInstallRateLimitTable,
  readInstallFailures,
} from '../lib/installRateLimit'
import { clearAllCachedSessions, clearAllSessions } from '../middleware/auth'
import { getClientIp } from '../middleware/rateLimit'
import type { HonoEnv } from '../types'

const CONTROL_CHARACTERS = /\p{Cc}/u

// 恢复端点密码策略：长度与 /install 统一为 12–256（见 shared 密码策略），
// 额外要求至少包含小写/大写/数字/符号四类中的两类。登录不再校验长度，
// 此策略不影响后续登录。
export function isValidRecoverPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < ADMIN_PASSWORD_MIN_LENGTH || value.length > ADMIN_PASSWORD_MAX_LENGTH) return false
  if (CONTROL_CHARACTERS.test(value)) return false
  let classes = 0
  if (/[a-z]/.test(value)) classes++
  if (/[A-Z]/.test(value)) classes++
  if (/[0-9]/.test(value)) classes++
  if (/[^a-zA-Z0-9]/.test(value)) classes++
  return classes >= 2
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

function getRateLimitKey(ip: string): string {
  return `recover:${ip}`
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
    await session.get('__cf_navs_recover_probe__')
    return true
  } catch {
    return false
  }
}

export const recoverRoutes = new Hono<HonoEnv>()

recoverRoutes.post('/recover', async (c) => {
  if (!isSameOriginRequest(c.req.raw)) {
    return noStore(c.json(fail(ErrCode.FORBIDDEN, 'cross-origin recovery is not allowed'), 403))
  }

  const databaseMissing = !c.env.DB || typeof c.env.DB.prepare !== 'function'
  if (databaseMissing || !(await databaseIsReachable(c.env.DB))) {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'required bindings are unavailable')))
  }
  if (!hasSessionBinding(c.env) || !(await sessionStoreIsReachable(c.env.SESSION))) {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'required bindings are unavailable')))
  }

  // 只在已安装实例上恢复：无凭据/无标记时不写凭据，交由 /install 完成初始化，
  // 避免绕过安装 claim 事务。
  let installed: Map<string, string | number | null>
  try {
    installed = await getSettingValues<string | number>(c.env.DB, [
      ADMIN_USERNAME_KEY,
      ADMIN_PASSWORD_KEY,
      INSTALL_MARKER_KEY,
    ])
  } catch (error) {
    // settings 表不存在 = 从未安装（schema 只在 /install 时创建），按 not installed 处理而非服务端错误。
    if (isMissingTableError(error)) {
      return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'not installed')))
    }
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
  }
  const adminUsername = installed.get(ADMIN_USERNAME_KEY)
  const hasUsername = typeof adminUsername === 'string' && adminUsername.length > 0
  const hasPassword = typeof installed.get(ADMIN_PASSWORD_KEY) === 'string'
  const marker = installed.get(INSTALL_MARKER_KEY)
  const hasMarker = typeof marker === 'number' && Number.isInteger(marker) && marker > 0
  if (!(hasMarker || (hasUsername && hasPassword))) {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'not installed')))
  }
  if (!hasUsername) {
    // 有标记但没有用户名（残缺态）：恢复无法确定登录名，交由部署侧 INIT_ADMIN_* 处理。
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'administrator username is unavailable')))
  }

  const ip = getClientIp(c)
  try {
    await ensureInstallRateLimitTable(c.env.DB)
    const rateLimitState = await readInstallFailures(c.env.DB, getRateLimitKey(ip))
    if (rateLimitState && rateLimitState.resetAt > Date.now() && rateLimitState.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      return noStore(c.json(fail(ErrCode.RATE_LIMITED, 'too many recovery attempts')))
    }
  } catch {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
  }

  if (!(await authorizeSetup(c.env, c.req.header('X-Setup-Token')))) {
    try {
      const limited = await consumeInstallAttempt(c.env.DB, getRateLimitKey(ip))
      if (limited) {
        return noStore(c.json(fail(ErrCode.RATE_LIMITED, 'too many recovery attempts')))
      }
    } catch {
      return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'database is unavailable')))
    }
    return noStore(c.json(fail(ErrCode.UNAUTHORIZED, 'unauthorized'), 401))
  }

  let body: RecoverReq
  try {
    body = await c.req.json<RecoverReq>()
  } catch {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'invalid request body')))
  }

  // 只重置密码：不接受、不校验、不写入用户名。
  if (!isValidRecoverPassword(body.password)) {
    return noStore(c.json(fail(ErrCode.BAD_REQUEST, 'password must be 12-256 characters with at least two character types')))
  }

  try {
    // 只写 admin_password，与 /api/password 改密一致。刻意不动 admin_bootstrap_password：
    // 它是「上次 INIT_ADMIN_* 应用值」的快照，ensureAdminBootstrap 用它对比 INIT 是否变化
    // （仅非 web-install 实例、!webInstalled 时）。若把它改成新哈希，会让它与未变的
    // INIT_ADMIN_PASSWORD 不再匹配，下次登录被判定为「INIT 变了」而回滚掉本次重置。
    await setSettingValue(c.env.DB, ADMIN_PASSWORD_KEY, await hashPassword(body.password))
  } catch {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'failed to reset password')))
  }

  await clearAllSessions(c.env)
  clearAllCachedSessions()
  await clearInstallFailures(c.env.DB, getRateLimitKey(ip))

  try {
    return noStore(c.json(ok(await createSession(c.env, adminUsername))))
  } catch {
    return noStore(c.json(fail(ErrCode.SERVER_ERROR, 'password reset but session creation failed')))
  }
})

export default recoverRoutes
