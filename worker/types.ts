// Worker 运行时环境绑定 + Hono Variables

export interface Env {
  // Cloudflare 绑定
  DB: D1Database
  SESSION: KVNamespace
  ASSETS: Fetcher
  // vars / secrets
  INIT_ADMIN_USER: string
  INIT_ADMIN_PASSWORD: string
  RESET_ADMIN_CREDENTIALS?: string
  SETUP_TOKEN?: string
  SESSION_TTL: string
}

// Hono context.set/get 的类型
export interface Variables {
  /**
   * 运行时入口注入的可信客户端 IP（Node 入口经 server/requestContext 解析
   * socket 与可信代理后设置；Worker 路径不设置，走转发头逻辑）。
   */
  clientIp?: string
  username: string
  // 认证中间件校验通过的会话过期时间。退出登录用它算撤销名单的 TTL，
  // 省掉一次重复的 JWT 校验和 KV 读取。
  sessionExpiresAt: number
  loginRateLimitState: LoginRateLimitState | null
  // authRequired 在本请求内已校验通过。受保护子应用统一挂了 authRequired，个别路由模块
  // 仍保留逐路由的 authRequired 作为纵深防御（模块被单独挂载或单测时仍受保护），
  // 有了这个标记第二次调用直接放行，不重复校验。
  authenticated: boolean
}

// Hono 泛型环境别名
export interface HonoEnv {
  Bindings: Env
  Variables: Variables
}

// 解码后的 JWT 会话值，仅在 Hono context 与 isolate 内存缓存中使用，不直接写入 KV
export interface SessionValue {
  username: string
  exp: number // 毫秒时间戳
}

export interface LoginRateLimitState {
  count: number
  resetAt: number
}
