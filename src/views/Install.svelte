<script lang="ts">
  import { SETUP_TOKEN_ASCII_ERROR, isAsciiPrintableToken } from '../lib/setupTokenInput'
  import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH } from '../../shared/passwordPolicy'

  type InstallViewMode =
    | 'needs_install'
    | 'setup_token_missing'
    | 'bindings_missing'
    | 'database_unreachable'
    | 'session_store_unreachable'
    | 'status_error'

  export let mode: InstallViewMode = 'needs_install'
  export let missingBindings: Array<'DB' | 'SESSION'> = []
  export let schemaVersion: number | null = null
  export let installing = false
  export let error = ''
  export let onInstall: (value: {
    setupToken: string
    username: string
    password: string
  }) => Promise<void> | void
  export let onRetryStatus: () => Promise<void> | void

  let setupToken = ''
  let username = 'admin'
  let password = ''
  let passwordConfirmation = ''
  let localError = ''

  function configurationCopy(): { title: string; message: string; action: string } {
    if (mode === 'setup_token_missing') {
      return {
        title: '还缺少部署密钥',
        message: '请在 Cloudflare Worker 中添加加密密钥 SETUP_TOKEN，重新部署后再检查。',
        action: '重新检查配置',
      }
    }
    if (mode === 'bindings_missing') {
      return {
        title: '还缺少存储绑定',
        message: `请在 Cloudflare 中配置 ${missingBindings.join('、') || 'DB / SESSION'} 绑定，重新部署后再检查。`,
        action: '重新检查绑定',
      }
    }
    if (mode === 'database_unreachable') {
      return {
        title: '数据库暂时不可用',
        message: 'DB 绑定已经存在，但当前无法访问 D1。请检查 Cloudflare 服务和绑定配置。',
        action: '重试数据库检查',
      }
    }
    if (mode === 'status_error') {
      return {
        title: '无法检查安装状态',
        message: '安装状态接口暂时无法访问。普通应用数据尚未加载，可以安全地重新检查。',
        action: '重新检查安装状态',
      }
    }
    return {
      title: '会话存储暂时不可用',
      message: 'SESSION 绑定已经存在，但当前无法访问 KV。请检查 Cloudflare 服务和绑定配置。',
      action: '重试会话存储检查',
    }
  }

  $: formError = localError || error
  $: configuration = mode === 'needs_install' ? null : configurationCopy()

  async function handleSubmit(): Promise<void> {
    localError = ''

    if (!setupToken.trim()) {
      localError = '请输入部署时配置的 SETUP_TOKEN。'
      return
    }
    if (!isAsciiPrintableToken(setupToken.trim())) {
      localError = SETUP_TOKEN_ASCII_ERROR
      return
    }
    if (!username.trim()) {
      localError = '请输入管理员用户名。'
      return
    }
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password.length > ADMIN_PASSWORD_MAX_LENGTH) {
      localError = `管理员密码需为 ${ADMIN_PASSWORD_MIN_LENGTH}–${ADMIN_PASSWORD_MAX_LENGTH} 位。`
      return
    }
    if (password !== passwordConfirmation) {
      localError = '两次输入的管理员密码不一致。'
      return
    }

    await onInstall({
      setupToken: setupToken.trim(),
      username: username.trim(),
      password,
    })
  }
</script>

<svelte:head>
  <title>安装 CF-Navs</title>
</svelte:head>

<main class="install-page" aria-labelledby="install-title">
  <section class="install-card">
    <div class="install-intro">
      <div class="install-mark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <p class="install-kicker">CF-Navs · 首次运行</p>
      <h1 id="install-title">建立你的导航站</h1>
      <p class="install-lead">创建第一个管理员账号。安装完成后，当前浏览器会直接进入已登录状态。</p>

      <ol class="install-steps" aria-label="安装步骤">
        <li class="is-active"><span>1</span><strong>验证部署密钥</strong></li>
        <li><span>2</span><strong>创建管理员</strong></li>
        <li><span>3</span><strong>进入导航站</strong></li>
      </ol>
    </div>

    {#if configuration}
      <div class="install-form configuration-panel" aria-live="polite">
        <p class="configuration-label">需要完成 Cloudflare 配置</p>
        <h2>{configuration.title}</h2>
        <p>{configuration.message}</p>
        {#if schemaVersion !== null}
          <p class="schema-note">已检测到数据库结构版本 {schemaVersion}，现有数据不会被覆盖。</p>
        {/if}
        {#if error}
          <div class="install-error" role="alert">
            <strong>检查未完成</strong>
            <span>{error}</span>
          </div>
        {/if}
        <button class="install-submit" type="button" on:click={onRetryStatus}>{configuration.action}</button>
      </div>
    {:else}
      <form class="install-form" aria-busy={installing} on:submit|preventDefault={handleSubmit}>
        <div class="field">
        <label for="setup-token">部署密钥</label>
        <input
          id="setup-token"
          name="setup-token"
          type="password"
          bind:value={setupToken}
          autocomplete="off"
          spellcheck="false"
          required
          disabled={installing}
          aria-describedby="setup-token-hint"
        />
        <p id="setup-token-hint">输入 Worker 环境中配置的 SETUP_TOKEN。密钥只随本次请求发送，不会保存在浏览器中。</p>
      </div>

      <div class="field">
        <label for="install-username">管理员用户名</label>
        <input
          id="install-username"
          name="username"
          bind:value={username}
          autocomplete="username"
          maxlength="64"
          required
          disabled={installing}
        />
      </div>

      <div class="password-grid">
        <div class="field">
          <label for="install-password">管理员密码</label>
          <input
            id="install-password"
            name="password"
            type="password"
            bind:value={password}
            autocomplete="new-password"
            minlength="12"
            maxlength="256"
            required
            disabled={installing}
          />
        </div>
        <div class="field">
          <label for="install-password-confirmation">再次输入密码</label>
          <input
            id="install-password-confirmation"
            name="password-confirmation"
            type="password"
            bind:value={passwordConfirmation}
            autocomplete="new-password"
            minlength="12"
            maxlength="256"
            required
            disabled={installing}
          />
        </div>
      </div>

      {#if formError}
        <div class="install-error" role="alert">
          <strong>安装未完成</strong>
          <span>{formError}</span>
          <button type="button" on:click={onRetryStatus} disabled={installing}>重新检查安装状态</button>
        </div>
      {/if}

        <button class="install-submit" type="submit" disabled={installing}>
          {installing ? '正在创建管理员…' : '完成安装并登录'}
        </button>
      </form>
    {/if}
  </section>
</main>

<style>
  .install-page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: clamp(18px, 4vw, 52px);
    color: #e5eefb;
    background:
      radial-gradient(circle at 14% 18%, rgba(45, 212, 191, 0.2), transparent 30rem),
      radial-gradient(circle at 88% 74%, rgba(96, 165, 250, 0.18), transparent 34rem),
      linear-gradient(145deg, #09111f 0%, #0f172a 52%, #111827 100%);
  }

  .install-card {
    width: min(100%, 980px);
    display: grid;
    grid-template-columns: minmax(260px, 0.82fr) minmax(360px, 1.18fr);
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 22px;
    background: rgba(15, 23, 42, 0.76);
    box-shadow: 0 34px 90px rgba(2, 8, 23, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .install-intro,
  .install-form { padding: clamp(28px, 5vw, 52px); }

  .install-intro {
    position: relative;
    border-right: 1px solid rgba(148, 163, 184, 0.18);
    background: linear-gradient(155deg, rgba(13, 148, 136, 0.16), rgba(30, 41, 59, 0.08));
  }

  .install-mark { width: 82px; height: 48px; position: relative; margin-bottom: 34px; }
  .install-mark::before { content: ""; position: absolute; left: 12px; right: 12px; top: 23px; height: 1px; background: linear-gradient(90deg, #2dd4bf, #60a5fa); }
  .install-mark span { position: absolute; top: 17px; width: 13px; height: 13px; border-radius: 50%; background: #0f172a; border: 2px solid #5eead4; box-shadow: 0 0 20px rgba(45, 212, 191, 0.55); }
  .install-mark span:nth-child(1) { left: 3px; }
  .install-mark span:nth-child(2) { left: 34px; border-color: #7dd3fc; }
  .install-mark span:nth-child(3) { right: 3px; border-color: #93c5fd; }

  .install-kicker { margin: 0 0 12px; color: #5eead4; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
  h1 { margin: 0; max-width: 10ch; color: #f8fafc; font-size: clamp(2rem, 4.5vw, 3.7rem); line-height: 0.98; letter-spacing: -0.055em; }
  .install-lead { margin: 22px 0 0; color: #a8b7cc; line-height: 1.75; }

  .install-steps { list-style: none; display: grid; gap: 13px; margin: 42px 0 0; padding: 0; }
  .install-steps li { display: flex; align-items: center; gap: 12px; color: #718096; font-size: 0.82rem; }
  .install-steps span { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #475569; border-radius: 50%; font: 700 0.68rem ui-monospace, monospace; }
  .install-steps .is-active { color: #dbeafe; }
  .install-steps .is-active span { color: #042f2e; border-color: #5eead4; background: #5eead4; }

  .install-form { display: grid; align-content: center; gap: 22px; }
  .configuration-panel h2 { margin: 0; color: #f8fafc; font-size: clamp(1.45rem, 3vw, 2rem); }
  .configuration-panel > p { margin: 0; color: #a8b7cc; line-height: 1.7; }
  .configuration-panel .configuration-label { color: #5eead4; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .configuration-panel .schema-note { color: #7dd3fc; font-size: 0.8rem; }
  .field { display: grid; gap: 8px; }
  label { color: #dbeafe; font-size: 0.86rem; font-weight: 700; }
  input { width: 100%; min-height: 48px; padding: 0 14px; color: #f8fafc; border: 1px solid #334155; border-radius: 10px; outline: none; background: rgba(2, 8, 23, 0.44); transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
  input:focus { border-color: #2dd4bf; box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.14); }
  input:disabled { opacity: 0.62; cursor: wait; }
  .field p { margin: 0; color: #77869b; font-size: 0.74rem; line-height: 1.55; }
  .password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .install-error { display: grid; gap: 5px; padding: 13px 15px; color: #fecaca; border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 10px; background: rgba(127, 29, 29, 0.16); font-size: 0.8rem; line-height: 1.5; }
  .install-error button { justify-self: start; padding: 4px 0; color: #fda4af; border: 0; background: transparent; text-decoration: underline; cursor: pointer; }

  .install-submit { min-height: 50px; padding: 0 20px; color: #042f2e; border: 0; border-radius: 10px; background: linear-gradient(100deg, #5eead4, #7dd3fc); box-shadow: 0 14px 30px rgba(45, 212, 191, 0.16); font-weight: 850; cursor: pointer; transition: transform var(--transition-fast), box-shadow var(--transition-fast); }
  .install-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 18px 36px rgba(45, 212, 191, 0.23); }
  .install-submit:focus-visible { outline: 3px solid rgba(125, 211, 252, 0.42); outline-offset: 3px; }
  .install-submit:disabled { opacity: 0.66; cursor: wait; }

  @media (max-width: 760px) {
    .install-card { grid-template-columns: 1fr; }
    .install-intro { border-right: 0; border-bottom: 1px solid rgba(148, 163, 184, 0.18); }
    h1 { max-width: none; }
    .install-steps { display: none; }
    .password-grid { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    input, .install-submit { transition: none; }
  }
</style>
