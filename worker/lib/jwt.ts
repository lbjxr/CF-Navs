import { getSettingValues, setSettingValue } from './db/settings'

const JWT_SECRET_KEY = 'jwt_secret'
// JWT 密钥的模块级缓存带 60 秒 TTL。
// 背景：改密码 / 凭据重置 / 登出全部会话都依赖 rotateJwtSecret 让旧 token
// "全局失效"，但 Workers 有多个 isolate，rotate 只刷新当前 isolate 的缓存。
// 没有 TTL 时其它 isolate 永远拿旧密钥验签，旧 token 有效直到 exp（30 天）。
// TTL 让其它 isolate 最多 60 秒就能从 D1 读到新密钥，旧 token 随之失效。
const JWT_SECRET_CACHE_TTL_MS = 60_000
let cachedJwtSecret: string | null = null
let cachedJwtSecretAt = 0

export function resetJwtSecretCache(): void {
  cachedJwtSecret = null
  cachedJwtSecretAt = 0
}

// Helper to encode Uint8Array to Base64URL
function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

// Helper to decode Base64URL string to Uint8Array
function decodeBase64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Retrieve or dynamically generate the JWT signing secret from D1 settings
export async function getJwtSecret(db: D1Database): Promise<string> {
  if (cachedJwtSecret !== null && Date.now() - cachedJwtSecretAt < JWT_SECRET_CACHE_TTL_MS) {
    return cachedJwtSecret
  }

  const values = await getSettingValues<string>(db, [JWT_SECRET_KEY])
  let secret = values.get(JWT_SECRET_KEY)

  if (!secret || typeof secret !== 'string') {
    const buffer = new Uint8Array(32)
    crypto.getRandomValues(buffer)
    secret = Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    await setSettingValue(db, JWT_SECRET_KEY, secret)
  }

  cachedJwtSecret = secret
  cachedJwtSecretAt = Date.now()
  return secret
}

// Rotate the JWT secret to invalidate all active JWT sessions globally
export async function rotateJwtSecret(db: D1Database): Promise<string> {
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)
  const secret = Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  await setSettingValue(db, JWT_SECRET_KEY, secret)
  cachedJwtSecret = secret
  cachedJwtSecretAt = Date.now()
  return secret
}

// Sign a JWT payload using HMAC SHA-256
export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const header = { alg: 'HS256', typ: 'JWT' }

  const headerPart = base64url(encoder.encode(JSON.stringify(header)))
  const payloadPart = base64url(encoder.encode(JSON.stringify(payload)))
  const message = `${headerPart}.${payloadPart}`

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret) as any,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message) as any
  )

  return `${message}.${base64url(new Uint8Array(signature))}`
}

// Verify a JWT token signature and return the decoded payload if valid
export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerPart, payloadPart, signaturePart] = parts
  const message = `${headerPart}.${payloadPart}`
  const encoder = new TextEncoder()

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret) as any,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signature = decodeBase64url(signaturePart)
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature as any,
      encoder.encode(message) as any
    )

    if (!isValid) return null

    const payloadBytes = decodeBase64url(payloadPart)
    const payloadStr = new TextDecoder().decode(payloadBytes)
    return JSON.parse(payloadStr) as Record<string, unknown>
  } catch {
    return null
  }
}
