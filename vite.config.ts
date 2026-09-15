import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

function versionServiceWorkerCache(): Plugin {
  return {
    name: 'cf-navs-version-service-worker-cache',
    apply: 'build',
    closeBundle() {
      const outputDir = resolvePath('dist')
      const serviceWorkerPath = resolvePath(outputDir, 'sw.js')
      const source = readFileSync(serviceWorkerPath, 'utf8')
      const fingerprint = createHash('sha256')
        .update(readFileSync(resolvePath(outputDir, 'index.html')))
        .update(source)

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
  server: {
    // 本地开发时把 /api 代理到 wrangler dev（默认 8787）
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
}))
