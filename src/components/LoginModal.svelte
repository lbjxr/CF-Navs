<script lang="ts">
  interface LoginModalProps {
    open?: boolean
    loading?: boolean
    error?: string
    onSubmit?:
      | ((payload: { username: string; password: string }) => void | Promise<void>)
      | undefined
    onCancel?: (() => void) | undefined
    onForgotPassword?: (() => void) | undefined
  }

  let {
    open = false,
    loading = false,
    error = '',
    onSubmit = undefined,
    onCancel = undefined,
    onForgotPassword = undefined,
  }: LoginModalProps = $props()

  let username = $state('')
  let password = $state('')
  let formKey = $state('')

  let nextKey = $derived(open ? 'open' : 'closed')
  $effect.pre(() => {
    if (nextKey !== formKey) {
      formKey = nextKey
      if (open) {
        username = ''
        password = ''
      }
    }
  })

  async function handleSubmit() {
    await onSubmit?.({
      username: username.trim(),
      password,
    })
  }

  function handleCancel() {
    if (loading) {
      return
    }

    onCancel?.()
  }
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <div class="modal-header">
        <div>
          <p class="modal-eyebrow">管理员登录</p>
          <h2 id="login-modal-title">请输入账号信息</h2>
        </div>
        <button type="button" class="ghost-button" onclick={handleCancel} disabled={loading}>取消</button>
      </div>

      <form class="modal-form" onsubmit={(event) => { event.preventDefault(); void handleSubmit() }}>
        <label>
          <span>用户名</span>
          <input bind:value={username} type="text" placeholder="请输入用户名" autocomplete="username" required />
        </label>

        <label>
          <span>密码</span>
          <input
            bind:value={password}
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            required
          />
        </label>

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        {#if onForgotPassword}
          <button type="button" class="forgot-link" onclick={onForgotPassword} disabled={loading}>忘记密码？</button>
        {/if}

        <div class="modal-actions">
          <button type="button" class="ghost-button" onclick={handleCancel} disabled={loading}>取消</button>
          <button type="submit" class="primary-button" disabled={loading || !username.trim() || !password}>
            {#if loading}登录中...{:else}登录{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.56);
  }

  .modal-backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
  }

  .modal-card {
    position: relative;
    width: min(100%, 420px);
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

  h2 {
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
