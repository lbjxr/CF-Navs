// 私密对象图标预览的授权持有者（PROB-20b）。
//
// `<img>` 不发 Authorization 头，所以后台预览私密书签/私密分类的真实图标只能把凭据放进
// URL。服务端签出的 key 寿命很短（默认 30 分钟），这里负责：
//   - 登录态下按需取一次，多个并发调用共用同一个在途请求；
//   - 临近过期前提前续签，避免整页图标同时退化成兜底图；
//   - 登出/改密码后立刻丢弃，不把过期 key 继续挂在 URL 上。
//
// 只在后台使用：首页公开卡片不带 key；对象图标客户端响应统一 no-store，公开正文复用由 Worker edge cache 承担。

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
// 授权代次。clearIconAccessKey() 无法取消已发出的请求，但可以让它的回调作废：
// 登出/改密后旧 promise 若仍能 publish，过期 key 会被重新挂到图标 URL 上。
let generation = 0

/** 当前可用的 key；组件订阅它，key 到位后图标 URL 自动带上参数。 */
export const iconAccessKey = writable('')

function publish(state: GrantState | null, now = Date.now()): string {
 const usable = state && state.expiresAt > now ? state.key : ''
 iconAccessKey.set(usable)
 return usable
}

export function readIconAccessKey(now = Date.now()): string {
 return publish(get(grantStore), now)
}

export function clearIconAccessKey(): void {
 generation += 1
 grantStore.set(null)
 inflight = null
 iconAccessKey.set('')
}

/**
 * 临近到期时合并续签请求，但旧 key 到实际过期前仍可用。续签失败保留有效 key；
 * 已过期或已切换会话时返回空串，不延长服务端签名寿命。
 */
export async function ensureIconAccessKey(
 fetchGrant: () => Promise<IconAccessResp>,
 now = Date.now(),
): Promise<string> {
 const cached = readIconAccessKey(now)
 if (cached && get(grantStore)!.expiresAt - RENEW_BEFORE_MS > now) return cached
 if (inflight) return await inflight

 const requestGeneration = generation

 inflight = (async () => {
  try {
   const next = await Promise.resolve().then(fetchGrant)
   // 期间发生过 clear（登出/改密）：丢弃这次结果，不把旧 key 重新发布出去。
   if (requestGeneration !== generation) return ''
   if (typeof next?.key !== 'string' || !next.key || !Number.isSafeInteger(next.expires_at) || next.expires_at <= Date.now()) return readIconAccessKey()
   const state: GrantState = { key: next.key, expiresAt: next.expires_at }
   grantStore.set(state)
   return publish(state)
  } catch {
   return requestGeneration === generation ? readIconAccessKey() : ''
  } finally {
   // 只清理属于本次代次的 in-flight 标记，避免把后来者的请求标记抹掉。
   if (requestGeneration === generation) inflight = null
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
