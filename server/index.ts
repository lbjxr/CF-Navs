// Node 入口：组装 Env → createApp() → @hono/node-server 承载。
// 优雅关闭：停收新请求 → 等待 waitUntil 后台任务排空 → 关闭资源（阶段 2 起含 SQLite）。

import { serve } from '@hono/node-server'
import { createApp } from '../worker/app'
import { loadConfig } from './config'
import { createStage1Env } from './nodeEnv'
import { createExecutionContext } from './runtime'

const config = loadConfig()
const env = createStage1Env(config)
const { ctx, drain } = createExecutionContext()
const app = createApp()

const server = serve(
  {
    fetch: (request: Request) => app.fetch(request, env, ctx as unknown as ExecutionContext),
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`[node] CF-Navs listening on http://${info.address}:${info.port}`)
  },
)

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[node] received ${signal}, shutting down…`)
  server.close()
  await drain()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
