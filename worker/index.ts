import { createApp } from './app'

export { protectedApi, publicApi } from './app'

// Cloudflare Worker 入口：与 Node 入口共用 createApp() 工厂，差异只在注入的 Env。
export default createApp()
