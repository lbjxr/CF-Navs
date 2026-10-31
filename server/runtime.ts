// Node 运行时契约：共享应用实际使用的 Cloudflare 能力子集。
//
// worker/types.ts 的 Env 以完整的 D1Database / KVNamespace / Fetcher 类型声明，
// Node 适配器只实现应用真正用到的子集，组装时在 server/nodeEnv.ts 收口为 Env。
// 这里的类型就是阶段 2–4 各适配器的实现目标。

/** D1 子集：prepare/bind/first/all/run/batch/exec（与 tests/helpers、DAO 的实际用法对齐）。 */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>
  run(): Promise<D1ResultLike<Record<string, never>>>
}

export interface D1ResultLike<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: {
    changes: number
    last_row_id: number
    [key: string]: unknown
  }
}

export interface D1Like {
  prepare(sql: string): D1PreparedStatementLike
  batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]>
  exec(sql: string): Promise<{ count: number; duration: number }>
}

/** KV 子集：应用实际只用 get / put({ expirationTtl }) / delete（见评审核实）。 */
export interface KvLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

/** 静态资源 Fetcher 子集：与 ASSETS.fetch() 的调用形状一致。 */
export interface AssetsLike {
  fetch(request: Request): Promise<Response>
}

/**
 * Node 版 ExecutionContext：waitUntil 的语义是「登记后台任务」。
 * 任务失败只记日志、不产生未处理拒绝；优雅关闭时 drain() 等待全部排空。
 */
export interface NodeExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

export function createExecutionContext(): {
  ctx: NodeExecutionContext
  drain: () => Promise<void>
  pendingCount: () => number
} {
  const pending = new Set<Promise<unknown>>()
  const ctx: NodeExecutionContext = {
    waitUntil(promise: Promise<unknown>): void {
      const tracked = Promise.resolve(promise).catch((err: unknown) => {
        console.error('[node] waitUntil background task failed:', err)
      })
      pending.add(tracked)
      void tracked.finally(() => pending.delete(tracked))
    },
    passThroughOnException(): void {
      // Node 进程内没有 isolate 异常透传语义；保持空实现以满足结构契约。
    },
  }
  return {
    ctx,
    drain: async () => {
      while (pending.size > 0) {
        await Promise.allSettled([...pending])
      }
    },
    pendingCount: () => pending.size,
  }
}
