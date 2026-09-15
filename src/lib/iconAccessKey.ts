// 私密对象图标预览的授权持有者（PROB-20b）。
//
// `<img>` 不发 Authorization 头，所以后台预览私密书签/私密分类的真实图标只能把凭据放进
// URL。服务端签出的 key 寿命很短（默认 30 分钟），这里负责：
//   - 登录态下按需取一次，多个并发调用共用同一个在途请求；
//   - 临近过期前提前续签，避免整页图标同时退化成兜底图；
//   - 登出/改密码后立刻丢弃，不把过期 key 继续挂在 URL 上。
//
// 只在后台使用：首页公开卡片不带 key，否则公开图标响应会变成 `private, no-store`，
// 白丢 edge cache 与 Service Worker 缓存。

import { get, writable } from 'svelte/store'
import type { IconAccessResp } from '../../shared/types'

// 提前多久续签。取 2 分钟：比一次页面停留期间的图标加载间隔宽，又远小于 30 分钟寿命。
const RENEW_BEFORE_MS = 2 * 60 * 1000

type GrantState = {
 key: string
 expiresAt: number
}

const grantStore = writable<GrantState | null>(null)
let inflight: Promise<string> | null = null

/** 当前可用的 key；组件订阅它，key 到位后图标 URL 自动带上参数。 */
export const iconAccessKey = writable('')

function publish(state: GrantState | null, now = Date.now()): string {
 const usable = state && state.expiresAt - RENEW_BEFORE_MS > now ? state.key : ''
 iconAccessKey.set(usable)
 return usable
}

export function readIconAccessKey(now = Date.now()): string {
 return publish(get(grantStore), now)
}

export function clearIconAccessKey(): void {
 grantStore.set(null)
 inflight = null
 iconAccessKey.set('')
}

/**
 * 保证有一个可用的 key，返回它。请求失败时返回空串——预览退回兜底图标是可接受的降级，
 * 不该让调用方的整个流程失败。
 */
export async function ensureIconAccessKey(
 fetchGrant: () => Promise<IconAccessResp>,
 now = Date.now(),
): Promise<string> {
 const cached = readIconAccessKey(now)
 if (cached) return cached
 if (inflight) return await inflight

 inflight = (async () => {
  try {
   const next = await fetchGrant()
   if (typeof next?.key !== 'string' || !next.key || typeof next.expires_at !== 'number') return ''
   const state: GrantState = { key: next.key, expiresAt: next.expires_at }
   grantStore.set(state)
   return publish(state)
  } catch {
   return ''
  } finally {
   inflight = null
  }
 })()

 return await inflight
}

/** 把 key 追加到图标代理 URL 上；没有 key 或不是图标代理路径时原样返回。 */
export function withIconAccessKey(url: string, key: string): string {
 if (!key || !url) return url
 if (!url.startsWith('/api/icon/') && !url.startsWith('/api/category-icon/')) return url
 return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`
}
