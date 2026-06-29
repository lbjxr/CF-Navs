// Worker 运行时环境绑定 + Hono Variables

export interface Env {
  // Cloudflare 绑定
  DB: D1Database
  SESSION: KVNamespace
  ASSETS: Fetcher
  // vars / secrets
  INIT_ADMIN_USER: string
  INIT_ADMIN_PASSWORD: string
  SESSION_TTL: string
}

// Hono context.set/get 的类型
export interface Variables {
  username: string
  loginRateLimitState: LoginRateLimitState | null
}

// Hono 泛型环境别名
export interface HonoEnv {
  Bindings: Env
  Variables: Variables
}

// KV 中会话值的形状
export interface SessionValue {
  username: string
  exp: number // 毫秒时间戳
}

export interface LoginRateLimitState {
  count: number
  resetAt: number
}
