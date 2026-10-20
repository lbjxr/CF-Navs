// Node 服务配置：环境变量解析与启动校验。密钥只能由部署环境注入。

export interface ServerConfig {
  host: string
  port: number
  sqlitePath: string
  kvPath: string
  distDir: string
  sessionTtl: number
  setupToken: string
  initAdminUser: string
  initAdminPassword: string
  trustProxy: boolean
  trustProxyCidrs: string[]
  cacheMaxEntries: number
  cacheMaxBytes: number
  dataDir: string
}

function str(name: string, fallback: string): string {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`环境变量 ${name} 必须是非负整数，当前值：${raw}`)
  }
  return n
}

export function loadConfig(): ServerConfig {
  const dataDir = str('DATA_DIR', './data')
  const config: ServerConfig = {
    host: str('HOST', '127.0.0.1'),
    port: int('PORT', 3000),
    sqlitePath: str('SQLITE_PATH', `${dataDir}/app.db`),
    kvPath: str('KV_PATH', `${dataDir}/kv.db`),
    distDir: str('DIST_DIR', './dist'),
    sessionTtl: int('SESSION_TTL', 60 * 60 * 24 * 7),
    setupToken: str('SETUP_TOKEN', ''),
    initAdminUser: str('INIT_ADMIN_USER', ''),
    initAdminPassword: str('INIT_ADMIN_PASSWORD', ''),
    trustProxy: str('TRUST_PROXY', 'false').toLowerCase() === 'true',
    trustProxyCidrs: str('TRUST_PROXY_CIDRS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cacheMaxEntries: int('CACHE_MAX_ENTRIES', 500),
    cacheMaxBytes: int('CACHE_MAX_BYTES', 32 * 1024 * 1024),
    dataDir,
  }

  if (config.port > 65535) throw new Error(`PORT 超出范围：${config.port}`)
  if (config.cacheMaxBytes < 1024 * 1024) {
    throw new Error('CACHE_MAX_BYTES 至少 1MB')
  }
  return config
}

/** 把服务变量映射为共享应用的 Env vars 部分（与 worker/types.ts 的 vars 字段对齐）。 */
export function configToEnvVars(config: ServerConfig): {
  INIT_ADMIN_USER: string
  INIT_ADMIN_PASSWORD: string
  SETUP_TOKEN?: string
  SESSION_TTL: string
} {
  return {
    INIT_ADMIN_USER: config.initAdminUser,
    INIT_ADMIN_PASSWORD: config.initAdminPassword,
    ...(config.setupToken ? { SETUP_TOKEN: config.setupToken } : {}),
    SESSION_TTL: String(config.sessionTtl),
  }
}
