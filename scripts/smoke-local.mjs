// L1 一键闸门：起一个隔离的本地 Worker 实例，跑完 scripts/smoke-test.mjs 再拆掉。
//
// 用法：npm run smoke
//
// 为什么要这个脚本：smoke-test.mjs 假设数据库是空的（第一条断言就是「初始分类列表为空」），
// 而它自己不管服务和数据库。手工跑 L1 需要「清 D1 → db:init → 起服务 → 跑测试 → 收拾」
// 五步，漏掉清库会得到 5 条与代码无关的失败。CI 也因此一直只跑 L0。
//
// 隔离策略：
//   - 每次用**独立的** persist 目录（默认 .wrangler/state-smoke），不碰开发者日常的
//     .wrangler/state，跑 L1 不会清掉本地开发数据。
//   - 每次运行前删掉该目录，保证数据库是干净的。
//   - 端口由系统分配，不与正在运行的 npm run dev 抢 8787。
//   - 管理员密码每次随机生成，只在进程内传递，不落盘、不打印。
//
// 环境变量（都可不设）：
//   SMOKE_PORT           固定端口，默认自动选一个空闲端口
//   SMOKE_PERSIST_TO     wrangler 本地状态目录，默认 .wrangler/state-smoke
//   SMOKE_READY_TIMEOUT  等待服务就绪的秒数，默认 90
//   SMOKE_WRANGLER_CONFIG 指定 wrangler 配置，默认沿用 scripts/wrangler-config.mjs 的选择

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const localConfig = path.join(rootDir, 'wrangler.local.toml')
const publicConfig = path.join(rootDir, 'wrangler.toml')
const configPath =
  process.env.SMOKE_WRANGLER_CONFIG || (existsSync(localConfig) ? localConfig : publicConfig)
const persistTo = process.env.SMOKE_PERSIST_TO || path.join(rootDir, '.wrangler', 'state-smoke')
const readyTimeoutMs = Number.parseInt(process.env.SMOKE_READY_TIMEOUT || '90', 10) * 1000

// 管理员用户名必须与 wrangler 配置里的 INIT_ADMIN_USER 一致，密码则由本次运行现造。
const ADMIN_USER = 'admin'
const ADMIN_PASS = `smoke-${randomBytes(18).toString('base64url')}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  console.error(`smoke: ${message}`)
  process.exit(2)
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function runWrangler(args, label) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args, '--config', configPath], {
    cwd: rootDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status}`)
}

// 结束整棵进程树：wrangler 会派生 workerd，只杀父进程会留下占端口的孤儿。
// 按精确 PID 结束，不按进程名批量清理。
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`wrangler dev exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        const body = await response.json()
        if (body?.data?.status === 'ok') return
      }
    } catch {
      // 服务还没起来
    }
    await sleep(300)
  }
  fail(`local worker was not ready within ${readyTimeoutMs / 1000}s`)
}

async function main() {
  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    fail('dist/index.html is missing; run "npm run build" first (the ASSETS binding serves ./dist)')
  }

  // 干净数据库是 smoke-test.mjs 的前提，它的第一条断言就是「初始分类列表为空」。
  rmSync(persistTo, { recursive: true, force: true })
  runWrangler(['d1', 'execute', 'DB', '--local', '--file=./schema.sql', '--persist-to', persistTo], 'db:init')

  const port = process.env.SMOKE_PORT || String(await findFreePort())
  const baseUrl = `http://127.0.0.1:${port}`

  const child = spawn(
    process.execPath,
    [
      wranglerBin, 'dev',
      '--config', configPath,
      '--ip', '127.0.0.1',
      '--port', port,
      '--persist-to', persistTo,
      // 本地 bootstrap 用的一次性凭据，不写入任何文件
      '--var', `INIT_ADMIN_USER:${ADMIN_USER}`,
      '--var', `INIT_ADMIN_PASSWORD:${ADMIN_PASS}`,
    ],
    { cwd: rootDir, stdio: ['ignore', 'ignore', 'inherit'], detached: process.platform !== 'win32' },
  )

  let exitCode = 1
  try {
    await waitForHealth(baseUrl, child)
    console.log(`smoke: local worker ready at ${baseUrl}`)
    const smoke = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'smoke-test.mjs')], {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: baseUrl, ADMIN_USER, ADMIN_PASS },
    })
    exitCode = smoke.status ?? 1
  } finally {
    killTree(child)
    rmSync(persistTo, { recursive: true, force: true })
  }

  process.exit(exitCode)
}

main().catch((error) => {
  console.error('smoke: unexpected failure', error)
  process.exit(2)
})
