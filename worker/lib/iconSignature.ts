// 私密对象图标预览的签名授权（PROB-20b）。
//
// 背景：PROB-20 方案 1 让 `/api/icon/:id` 与 `/api/category-icon/:id` 只对「匿名可见」的
// 对象返回真实图标，代价是后台预览私密书签/私密分类时也只拿到兜底图标。`<img>` 不会带
// Authorization 头，所以恢复预览必须有一条能放进 URL 的凭据。
//
// 密钥：直接复用 `settings.jwt_secret`，不引入第二个密钥。好处是改密码走的
// `rotateJwtSecret` 会顺带作废全部授权，不需要额外的失效通道。签名内容带域分隔前缀
// `icon-access:`，因此这里签出的串不可能被当成 JWT，反之亦然。
//
// 过期策略：**不与会话 exp 对齐**（会话默认 30 天）。授权是一条放在 URL 里的能力凭据，
// 会进浏览器历史、Referer 和访问日志；而它不查 KV 撤销名单（每张私密图标一次 KV 读会把
// 图标请求预算打穿），所以登出后无法立即失效。用 30 分钟的短寿命把「登出后仍可用」的
// 窗口从 30 天压到 ≤30 分钟，由前端在临近过期时续签。

import { secretsEqual } from './crypto'

export const ICON_ACCESS_TTL_MS = 30 * 60 * 1000

const GRANT_PREFIX = 'icon-access:'
// exp 是毫秒时间戳；15 位十进制远超需要，超长输入直接拒绝，不进 HMAC。
const GRANT_PATTERN = /^(\d{1,15})\.([A-Za-z0-9_-]{1,86})$/

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function sign(secret: string, expiresAt: number): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${GRANT_PREFIX}${expiresAt}`))
  return base64url(new Uint8Array(signature))
}

/** 签发一条 `<exp>.<base64url(HMAC)>` 形式的图标授权。 */
export async function createIconAccessGrant(
  secret: string,
  now = Date.now(),
  ttlMs = ICON_ACCESS_TTL_MS,
): Promise<{ grant: string; expires_at: number }> {
  const expiresAt = now + ttlMs
  return { grant: `${expiresAt}.${await sign(secret, expiresAt)}`, expires_at: expiresAt }
}

/**
 * 校验授权。先看形状与过期再算 HMAC：不做这一步的话，任意长度的 `key=` 都会换来一次
 * HMAC 运算，等于给匿名请求开了一条计算放大路径。
 */
export async function verifyIconAccessGrant(
  secret: string,
  grant: string | null | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!grant) return false

  const parsed = GRANT_PATTERN.exec(grant)
  if (!parsed) return false

  const expiresAt = Number(parsed[1])
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false

  return await secretsEqual(parsed[2], await sign(secret, expiresAt))
}
