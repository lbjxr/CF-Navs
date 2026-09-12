import './app.css'
import { mount } from 'svelte'
import { initErrorReporting } from './lib/errorMonitor'
import {
  collectPrecacheAssetUrls,
  listenForShellUpdate,
  registerServiceWorker,
} from './lib/serviceWorkerClient'
import { toastStore } from './lib/toast'
import App from './App.svelte'

initErrorReporting()

const app = mount(App, {
  target: document.getElementById('app')!,
})

// PWA：仅在生产构建中注册 Service Worker（开发模式下避免缓存干扰热更新）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // shell-updated 消息在后台重校验完成时发出，可能早于 window load。
  // 监听同步挂上，别等到 load 里，否则会漏掉这条消息、提示不弹。
  // 导航请求改成缓存优先后，部署新版本时用户这一次看到的仍是旧版；
  // 主动提示把滞后窗口从「下次打开」缩短到「现在刷新一下」。
  listenForShellUpdate(navigator.serviceWorker, () => {
    toastStore.addToast('已检测到新版本，刷新页面即可使用。', 'info', { duration: 10000 })
  })

  window.addEventListener('load', () => {
    void registerServiceWorker(navigator.serviceWorker, () => collectPrecacheAssetUrls(performance))
  })
}

export default app
