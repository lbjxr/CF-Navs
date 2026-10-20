// Node Env 组装：把各运行时适配器收口为共享应用的 Env（worker/types.ts）。
// 阶段 1 先放明确报错的占位实现，阶段 2–4 逐个替换为真实适配器。

import type { Env } from '../worker/types'
import { configToEnvVars, type ServerConfig } from './config'
import type { AssetsLike, D1Like, KvLike } from './runtime'

function notReady(name: string): never {
  throw new Error(`[node] ${name} 适配器尚未就绪`)
}

/** 阶段 1 占位 D1：任何实际查询都会明确失败，而不是静默返回空数据。 */
export function createPlaceholderD1(): D1Like {
  const stmt = (): never => notReady('D1')
  return {
    prepare: () => ({
      bind: () => ({ bind: stmt, first: stmt, all: stmt, run: stmt }),
      first: stmt,
      all: stmt,
      run: stmt,
    }),
    batch: () => notReady('D1'),
    exec: () => notReady('D1'),
  }
}

export function createPlaceholderKv(): KvLike {
  return {
    get: () => notReady('KV'),
    put: () => notReady('KV'),
    delete: () => notReady('KV'),
  }
}

/** 阶段 1 占位静态资源：一律 404；阶段 4 由 fileAssets 替代。 */
export function createPlaceholderAssets(): AssetsLike {
  return {
    fetch: async () => new Response('not found', { status: 404 }),
  }
}

export interface NodeEnvParts {
  db: D1Like
  kv: KvLike
  assets: AssetsLike
}

export function assembleEnv(config: ServerConfig, parts: NodeEnvParts): Env {
  return {
    DB: parts.db as unknown as D1Database,
    SESSION: parts.kv as unknown as KVNamespace,
    ASSETS: parts.assets as unknown as Fetcher,
    ...configToEnvVars(config),
  }
}

/** 全部占位实现（阶段 1 出口验证用；生产入口逐阶段换真实适配器）。 */
export function createPlaceholderEnv(config: ServerConfig): Env {
  return assembleEnv(config, {
    db: createPlaceholderD1(),
    kv: createPlaceholderKv(),
    assets: createPlaceholderAssets(),
  })
}
