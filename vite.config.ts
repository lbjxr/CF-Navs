import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// 前端构建到 ./dist，供 wrangler 作为静态资源托管
export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
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
