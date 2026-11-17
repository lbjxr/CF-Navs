// 分类与书签编辑共用的「编辑意图」计数器（App.svelte 拆分第 7 步，代码审查三轮第 14 / 15 项）。
//
// 打开 / 重置任一编辑框都会推进计数；异步读取原始编辑数据的用例先记下自己的意图号，
// 等待结束后与当前值比较，不一致说明期间用户已经开始了别的编辑（无论分类还是书签），
// 结果直接丢弃。因此两个控制器必须注入同一个计数器，不能各自持有。

export interface EditIntentCounter {
  /** 推进计数并返回新值（对应原先的 `++editIntent` / `editIntent += 1`）。 */
  next: () => number
  /** 当前值，用来判断异步结果是否仍属于最新的编辑意图。 */
  current: () => number
  /** Pending editors can close immediately when another editor takes ownership. */
  subscribe: (listener: (value: number) => void) => () => void
}

export function createEditIntentCounter(): EditIntentCounter {
  let value = 0
  const listeners = new Set<(value: number) => void>()
  return {
    next: () => {
      value += 1
      for (const listener of listeners) listener(value)
      return value
    },
    current: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
