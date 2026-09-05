// `SESSION` KV 绑定的存在性判定（PROB-31）。
//
// 为什么需要它：`worker/types.ts` 把 `Env.SESSION` 声明为必填，但类型只约束「部署应该配
// 什么」，不保证运行时真的有——绑定可以在令牌签发之后被移除。此前五个读取点各写一套判定：
// `loginRateLimit` 无条件读（缺绑定直接 TypeError → code=1500 这种查不出原因的错），
// `validateSession` 当可选并**静默跳过撤销名单检查**，logout 与点击计数各有一套 `if`。
//
// 现在只有一处判定口径：缺绑定 = 确定性的配置错误（`/install` 本来就以 `bindings_missing`
// 拒绝安装），凡是正确性依赖它的路径一律 fail-closed；只有「best-effort 计数」这类不影响
// 正确性的路径才允许降级继续。

import type { Env } from '../types'

// 只检查真正会被调用的三个方法。`get` 单独存在不够：撤销名单要写（`put`），限流要删
// （`delete`），少任何一个都会在半路抛错，而不是在入口被挡住。
export function hasSessionBinding(env: Partial<Env>): boolean {
  const session = env.SESSION
  return Boolean(
    session &&
    typeof session.get === 'function' &&
    typeof session.put === 'function' &&
    typeof session.delete === 'function',
  )
}
