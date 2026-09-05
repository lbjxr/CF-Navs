import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// 前端构建到 ./dist，供 wrangler 作为静态资源托管
export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  resolve: {
    // Svelte 4 的 package.json 把 `.` 的 browser 条件指向 src/runtime/index.js，
    // default 指向 src/runtime/ssr.js。Vitest 默认不带 browser 条件，于是解析到 ssr.js——
    // 那里的 onMount 是空实现，组件在 onMount 里注册的 window/document 监听器全部不生效，
    // 键盘关闭、外部点击关闭、滚动显隐这类行为在测试里永远观察不到。
    // 只在测试模式补上 browser 条件；生产构建走 vite build，本来就命中 browser。
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
