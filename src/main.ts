import './app.css'
import { initErrorReporting } from './lib/errorMonitor'
import App from './App.svelte'

initErrorReporting()

const app = new App({
  target: document.getElementById('app')!,
})

// PWA：仅在生产构建中注册 Service Worker（开发模式下避免缓存干扰热更新）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 注册失败不影响应用主体功能
    })
  })
}

export default app
