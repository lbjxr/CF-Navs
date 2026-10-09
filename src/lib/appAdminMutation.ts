import { getErrorMessage } from './api'
import { toastStore } from './toast'

export interface AdminMutationOptions<T> {
  // The initiating session owns completion effects, even after persistence waits.
  isCurrent?: () => boolean
  // 实际写入操作：网络请求或抛错的本地应用。
  run: () => Promise<T>
  // 写入成功后的本地收尾（重置表单、乐观更新、后台刷新等）；抛错会走 onError。
  onSuccess?: (result: T) => Promise<void> | void
  // 成功后的 toast 文案；返回空串则不弹。
  successMessage?: (result: T) => string
  // 失败时把消息交给组件的错误状态。
  onError: (message: string) => void
  // 无论成功失败都执行，用来清 busy 标记。
  onSettled?: () => void
  // 调用方需要感知失败（如乐观排序需回滚）时重新抛出原始错误。
  rethrow?: boolean
}

// 收敛后台增删改的编排：run → onSuccess → 成功 toast，异常统一落到 onError，
// busy 标记在 onSettled 里清理。把散落在各 handler 里的 try/catch/finally 归并成一处契约。
export async function runAdminMutation<T>(options: AdminMutationOptions<T>): Promise<T | undefined> {
  const isCurrent = options.isCurrent ?? (() => true)
  try {
    const result = await options.run()
    if (!isCurrent()) return undefined
    await options.onSuccess?.(result)
    if (!isCurrent()) return undefined
    const message = options.successMessage?.(result)
    if (message) {
      toastStore.addToast(message, 'success')
    }
    return result
  } catch (error) {
    if (isCurrent()) options.onError(getErrorMessage(error))
    if (options.rethrow) throw error
    return undefined
  } finally {
    if (isCurrent()) options.onSettled?.()
  }
}
