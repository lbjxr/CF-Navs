<svelte:options runes />

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'

  interface Props {
    open?: boolean
    loading?: boolean
    error?: string
    canCancel?: boolean
    onSubmit?: (payload: { username: string; password: string }) => void | Promise<void>
    onCancel?: () => void
    onForgotPassword?: () => void
  }

  let { open = false, loading = false, error = '', canCancel = true, onSubmit, onCancel, onForgotPassword }: Props = $props()

  let username = $state('')
  let password = $state('')
  let dialog: HTMLDialogElement | null = $state(null)
  // 只记录上一次的开合状态，不进模板，保持普通变量。
  let formKey = ''
  // close 事件晚于 close() 排队；父状态导致的关闭不能再次触发取消或关闭刚重开的会话。
  let parentCloseEvents = 0
  const cancelAllowed = $derived(canCancel && !loading)
  const cancelReason = $derived(loading
    ? '正在验证账号，请稍候，完成后可继续操作。'
    : !canCancel ? '当前站点需要登录后才能访问，请完成登录。' : '')

  // 每次打开时清空表单；与原 `$:` 一样在 DOM 更新前执行，只依赖 open。
  $effect.pre(() => {
    const nextKey = open ? 'open' : 'closed'
    if (nextKey !== formKey) {
      formKey = nextKey
      if (open) {
        username = ''
        password = ''
      }
    }
  })

  function closeFromParent(element: HTMLDialogElement): void {
    if (!element.open) return
    parentCloseEvents += 1
    element.close()
  }

  // 保留原生关闭节点，先执行 close() 再由浏览器归还焦点；不绑定 HTML 的 open 属性。
  $effect(() => {
    const shouldOpen = open
    const element = dialog
    if (!element) return
    untrack(() => {
      if (shouldOpen) {
        if (!element.open) element.showModal()
      } else {
        closeFromParent(element)
      }
    })
  })

  onDestroy(() => {
    if (dialog) closeFromParent(dialog)
  })

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    await onSubmit?.({
      username: username.trim(),
      password,
    })
  }

  function handleCancel() {
    if (!open || !cancelAllowed) return
    onCancel?.()
  }

  function handleNativeCancel(event: Event): void {
    // 父级拥有登录门禁与 open；旧浏览器忽略 closedby 时也必须经过这条规则。
    event.preventDefault()
    handleCancel()
  }

  function handleNativeClose(event: Event): void {
    const element = event.currentTarget as HTMLDialogElement
    element.returnValue = ''
    if (parentCloseEvents > 0) {
      parentCloseEvents -= 1
      return
    }
    if (!open || element.open) return
    // 平台关闭若未经过 cancel，仍需交给父级；私有门禁和加载中不能被 close 绕过。
    handleCancel()
    void tick().then(() => {
      if (open && element.isConnected && !element.open) element.showModal()
    })
  }
</script>

<dialog
  bind:this={dialog}
  class="modal-card"
  aria-labelledby="login-modal-title"
  aria-describedby={cancelReason ? 'login-modal-cancel-reason' : undefined}
  closedby={cancelAllowed ? 'closerequest' : 'none'}
  oncancel={handleNativeCancel}
  onclose={handleNativeClose}
>
      <div class="modal-header">
        <div>
          <p class="modal-eyebrow">管理员登录</p>
          <h1 id="login-modal-title">请输入账号信息</h1>
        </div>
        <button type="button" class="ghost-button" onclick={handleCancel} disabled={!cancelAllowed}>取消</button>
      </div>

      <form class="modal-form" aria-busy={loading} onsubmit={handleSubmit}>
        <label>
          <span>用户名</span>
          <!-- svelte-ignore a11y_autofocus (原生模态的初始焦点放在用户名，背景由 showModal 隔离) -->
          <input bind:value={username} name="username" type="text" placeholder="请输入用户名" autocomplete="username" spellcheck={false} aria-describedby={cancelReason ? 'login-modal-cancel-reason' : undefined} autofocus required />
        </label>

        <label>
          <span>密码</span>
          <input
            bind:value={password}
            name="password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            aria-describedby={cancelReason ? 'login-modal-cancel-reason' : undefined}
            required
          />
        </label>

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        {#if onForgotPassword}
          <button type="button" class="forgot-link" onclick={onForgotPassword} disabled={loading}>忘记密码？</button>
        {/if}

        <p id="login-modal-cancel-reason" class="cancel-reason" class:unavailable={!cancelReason} role="status">{cancelReason || '可取消登录并返回站点。'}</p>

        <div class="modal-actions">
          <button type="button" class="ghost-button" onclick={handleCancel} disabled={!cancelAllowed}>取消</button>
          <button type="submit" class="primary-button" disabled={loading || !username.trim() || !password}>
            {#if loading}登录中...{:else}登录{/if}
          </button>
        </div>
      </form>
</dialog>

<style>
  .modal-card::backdrop {
    background: rgba(15, 23, 42, 0.56);
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .modal-card:modal {
    overscroll-behavior: contain;
  }

  .modal-card {
    width: min(calc(100vw - 40px), 420px);
    max-width: none;
    max-height: calc(100dvh - 40px);
    overflow-y: auto;
    border: 0;
    border-radius: var(--radius-xl);
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    padding: 20px;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .modal-eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    color: #64748b;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    color: #0f172a;
  }

  .modal-form {
    display: grid;
    gap: 14px;
  }

  label {
    display: grid;
    gap: 8px;
    color: #334155;
    font-size: 14px;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: var(--radius-lg);
    padding: var(--control-padding-input);
    font-size: var(--font-size-base);
    color: #0f172a;
    background: #ffffff;
  }

  input:focus-visible {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .error-text {
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .cancel-reason {
    min-height: 2.8em;
    margin: 0;
    color: #475569;
    font-size: var(--font-size-md);
    line-height: 1.4;
  }

  .cancel-reason.unavailable {
    visibility: hidden;
  }

  .forgot-link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: transparent;
    color: #2563eb;
    font-size: 13px;
    text-decoration: underline;
    cursor: pointer;
  }

  .forgot-link:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
  }

  .primary-button,
  .ghost-button {
    border-radius: var(--radius-lg);
    padding: var(--control-padding-md);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: var(--transition-base);
  }

  .primary-button {
    border: none;
    background: #2563eb;
    color: #ffffff;
  }

  .ghost-button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .primary-button:disabled,
  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
