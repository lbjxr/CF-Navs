import { buildStaticHtmlHeaderRules } from './worker/lib/assetHeaders'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { resolve as resolvePath } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

function versionServiceWorkerCache(): Plugin {
  return {
    name: 'cf-navs-version-service-worker-cache',
    apply: 'build',
    closeBundle() {
      const outputDir = resolvePath('dist')
      // One policy source for Worker routes and directly served HTML assets.
      const headersPath = resolvePath(outputDir, '_headers')
      writeFileSync(headersPath, readFileSync(resolvePath('public', '_headers'), 'utf8').trimEnd() + '\n\n' + buildStaticHtmlHeaderRules() + '\n')
      const serviceWorkerPath = resolvePath(outputDir, 'sw.js')
      const source = readFileSync(serviceWorkerPath, 'utf8')
      const fingerprint = createHash('sha256')
        .update(readFileSync(resolvePath(outputDir, 'index.html')))
        .update(source)
        .update(readFileSync(headersPath))

      for (const file of readdirSync(resolvePath(outputDir, 'assets')).sort()) {
        fingerprint.update(file).update(readFileSync(resolvePath(outputDir, 'assets', file)))
      }

      const buildId = fingerprint.digest('hex').slice(0, 12)
      const versioned = source.replace(
        /const CACHE = 'cf-navs-v[^']+'/,
        `const CACHE = 'cf-navs-v${buildId}'`,
      )
      if (versioned === source) throw new Error('service worker cache marker is missing')
      writeFileSync(serviceWorkerPath, versioned)
    },
  }
}

// 测试按文件首行的 `// @vitest-environment jsdom` 约定分成两个 Vitest project（约定见 CONTRIBUTING 第 4 节）。
// jsdom 组件测试走 vmForks：每个文件仍在全新的 VM 上下文里求值（模块与 DOM 全局按文件隔离），
// 但同一 worker 复用已加载的 jsdom，省掉逐文件重建 jsdom 环境的约 1.5 秒。纯逻辑测试留在默认
// forks：它们用到 node:sqlite、Uint8Array 等跨 realm 对象，vm 上下文会让 instanceof 失真。
const JSDOM_DOCBLOCK = /^\/\/ @vitest-environment jsdom\b/
function listTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return listTestFiles(path)
    return entry.name.endsWith('.test.ts') ? [path] : []
  })
}
function splitTestFiles(): { jsdom: string[]; node: string[] } {
  const jsdom: string[] = []
  const node: string[] = []
  for (const file of listTestFiles('tests')) (JSDOM_DOCBLOCK.test(readFileSync(file, 'utf8')) ? jsdom : node).push(file)
  return { jsdom, node }
}

// 前端构建到 ./dist，供 wrangler 作为静态资源托管
export default defineConfig(({ mode }) => ({
  plugins: [svelte(), versionServiceWorkerCache()],
  resolve: {
    // Svelte 的 browser 条件提供客户端运行时，default 则落到 SSR 入口。
    // 只在测试模式补上 browser，确保 onMount 的键盘、外部点击和滚动监听实际注册。
    // 生产构建原本就使用 browser 条件。
    conditions: mode === 'test' ? ['browser'] : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: mode === 'test' ? (() => {
    const files = splitTestFiles()
    return {
      // Bound cold-transform/jsdom contention on many-core hosts without relaxing test timeouts.
      // Keep the two-worker floor; VITEST_MAX_WORKERS can override both inherited projects.
      maxWorkers: Math.min(4, Math.max(2, availableParallelism() - 1)),
      projects: [
        { extends: true, test: { name: 'node', include: files.node, environment: 'node' } },
        { extends: true, test: { name: 'jsdom', include: files.jsdom, environment: 'jsdom', pool: 'vmForks' } },
      ],
    }
  })() : undefined,
  server: {
    // 本地开发时把 /api 代理到 wrangler dev（默认 8787）
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
}))
