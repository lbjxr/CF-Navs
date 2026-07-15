<script lang="ts">
  import type { ChangePasswordReq } from '../../shared/types'

  type AsyncVoid<T = void> = T | Promise<T>

  export let saving = false
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined

  let currentPassword = ''
  let newPassword = ''
  let confirmPassword = ''
  let changingPassword = false
  let passwordError = ''
  let passwordMessage = ''

  $: passwordMismatch = Boolean(confirmPassword) && newPassword !== confirmPassword
  $: canSave =
    Boolean(onChangePassword) &&
    !saving &&
    !changingPassword &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword.length <= 256 &&
    newPassword === confirmPassword

  async function handleChangePassword() {
    if (!canSave || !onChangePassword) {
      return
    }

    changingPassword = true
    passwordError = ''
    passwordMessage = ''

    try {
      await onChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      currentPassword = ''
      newPassword = ''
      confirmPassword = ''
      passwordMessage = '密码已更新，请使用新密码重新登录。'
    } catch (error) {
      passwordError = error instanceof Error ? error.message : '密码更新失败'
    } finally {
      changingPassword = false
    }
  }

  function handlePasswordKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void handleChangePassword()
  }
</script>

<fieldset id="settings-section-account" class="group group-wide" disabled={saving || changingPassword}>
  <legend>账号安全</legend>
  <p class="group-desc">修改管理员登录密码。此操作独立生效，无需点击底部「保存设置」。</p>
  <div class="form-grid password-grid">
    <label class="field">
      <span>当前密码</span>
      <input
        bind:value={currentPassword}
        type="password"
        autocomplete="current-password"
        placeholder="输入当前管理员密码"
        on:keydown={handlePasswordKeydown}
      />
    </label>

    <label class="field">
      <span>新密码</span>
      <input
        bind:value={newPassword}
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="256"
        placeholder="至少 8 个字符"
        on:keydown={handlePasswordKeydown}
      />
    </label>

    <label class="field">
      <span>确认新密码</span>
      <input
        bind:value={confirmPassword}
        type="password"
        autocomplete="new-password"
        minlength="8"
        maxlength="256"
        placeholder="再次输入新密码"
        on:keydown={handlePasswordKeydown}
      />
    </label>
  </div>

  {#if passwordError}
    <p class="password-message error" role="alert">{passwordError}</p>
  {:else if passwordMessage}
    <p class="password-message ok">{passwordMessage}</p>
  {:else if passwordMismatch}
    <small class="warn">两次输入的新密码不一致。</small>
  {:else}
    <small>修改成功后，现有登录会话会失效，需要重新登录。</small>
  {/if}

  <button type="button" class="ghost-button password-save-button" on:click={handleChangePassword} disabled={!canSave}>
    {#if changingPassword}
      更新中...
    {:else}
      更新密码
    {/if}
  </button>
</fieldset>

<style>
  .group {
    position: relative;
    grid-column: 1 / -1;
    align-content: start;
    border: 1px solid var(--sp-group-border);
    border-radius: 14px;
    padding: 14px 16px 16px 18px;
    display: grid;
    gap: 12px;
    margin: 0;
    min-width: 0;
    scroll-margin-top: 96px;
    background: var(--sp-group-bg);
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
  }

  .group-desc {
    margin: 0;
    color: var(--sp-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .group::before {
    content: '';
    position: absolute;
    left: 0;
    top: 18px;
    bottom: 18px;
    width: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sp-accent) 52%, transparent);
  }

  .group legend {
    padding: 0 7px;
    margin-left: -4px;
    font-size: 13px;
    font-weight: 700;
    color: var(--sp-strong);
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 16px 18px;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
  }

  small {
    color: var(--sp-muted);
    line-height: 1.55;
  }

  small.warn {
    color: var(--sp-warn);
  }

  .password-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .password-message {
    border-radius: 10px;
    padding: 9px 11px;
    font-size: 13px;
    line-height: 1.45;
  }

  .password-message.error {
    border: 1px solid var(--sp-danger-border);
    background: var(--sp-danger-bg);
    color: var(--sp-danger);
  }

  .password-message.ok {
    border: 1px solid var(--sp-status-border);
    background: var(--sp-status-bg);
    color: var(--sp-heading);
  }

  .password-save-button {
    justify-self: start;
  }

  .ghost-button {
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    background: var(--sp-input-bg);
    color: var(--sp-text);
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    white-space: nowrap;
  }

  .ghost-button:hover:not(:disabled) {
    border-color: var(--sp-input-hover-border);
    background: var(--sp-toggle-hover-bg);
  }

  .ghost-button:active:not(:disabled) {
    transform: translateY(1px);
  }

  input:not([type='radio']):not([type='checkbox']) {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    padding: 9px 11px;
    font-size: 14px;
    color: var(--sp-input-text);
    background: var(--sp-input-bg);
    font-family: inherit;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }

  input:focus {
    outline: none;
    border-color: var(--sp-accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .ghost-button:disabled,
  input:disabled,
  fieldset:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  fieldset:disabled {
    opacity: 1;
  }

  @media (max-width: 960px) {
    .password-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .form-grid,
    .password-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
