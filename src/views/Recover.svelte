<script lang="ts">
  import { api, getErrorMessage } from '../lib/api'
  import { ApiError } from '../lib/api'
  import { ErrCode, type LoginResp } from '../../shared/types'
  import { ADMIN_PASSWORD_MAX_LENGTH, ADMIN_PASSWORD_MIN_LENGTH } from '../../shared/passwordPolicy'
  import { SETUP_TOKEN_ASCII_ERROR, isAsciiPrintableToken } from '../lib/setupTokenInput'

  interface RecoverProps {
    /** 重置成功回调，参数为新会话 */
    onRecovered: (session: LoginResp) => Promise<void> | void
    /** 跳转到安装页回调 */
    onGoInstall: () => void
    /** 返回登录回调 */
    onCancel: () => void
  }

  let { onRecovered, onGoInstall, onCancel }: RecoverProps = $props()

  let setupToken = $state('')
  let password = $state('')
  let passwordConfirmation = $state('')
  let submitting = $state(false)
  let localError = $state('')
  let serverError = $state('')
  let tokenHint = $state(false)

  function countCharClasses(value: string): number {
    let classes = 0
    if (/[a-z]/.test(value)) classes++
    if (/[A-Z]/.test(value)) classes++
    if (/[0-9]/.test(value)) classes++
    if (/[^a-zA-Z0-9]/.test(value)) classes++
    return classes
  }

  let formError = $derived(localError || serverError)

  async function handleSubmit(): Promise<void> {
    localError = ''
    serverError = ''
    tokenHint = false

    if (!setupToken.trim()) {
      localError = '请输入部署时配置的 SETUP_TOKEN。'
      return
    }
    if (!isAsciiPrintableToken(setupToken.trim())) {
      localError = SETUP_TOKEN_ASCII_ERROR
      return
    }
    if (password.length < ADMIN_PASSWORD_MIN_LENGTH || password.length > ADMIN_PASSWORD_MAX_LENGTH) {
      localError = `新密码需为 ${ADMIN_PASSWORD_MIN_LENGTH}–${ADMIN_PASSWORD_MAX_LENGTH} 位。`
      return
    }
    if (countCharClasses(password) < 2) {
      localError = '新密码需包含至少两类字符（小写、大写、数字、符号）。'
      return
    }
    if (password !== passwordConfirmation) {
      localError = '两次输入的新密码不一致。'
      return
    }

    submitting = true
    try {
      const session = await api.auth.recover({ password }, setupToken.trim())
      await onRecovered(session)
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === ErrCode.UNAUTHORIZED) {
          serverError = '令牌无效或未配置。'
          tokenHint = true
        } else if (error.code === ErrCode.RATE_LIMITED) {
          serverError = '尝试过于频繁，请稍后再试。'
        } else if (error.code === ErrCode.BAD_REQUEST && error.message === 'not installed') {
          serverError = '站点尚未安装，请先完成初始化。'
        } else {
          serverError = getErrorMessage(error)
        }
      } else {
        serverError = getErrorMessage(error)
      }
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>重置管理员密码 · CF-Navs</title>
</svelte:head>

<main class="recover-page" aria-labelledby="recover-title">
  <section class="recover-card">
    <div class="recover-intro">
      <div class="recover-mark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <p class="recover-kicker">CF-Navs · 密码恢复</p>
      <h1 id="recover-title">重置管理员密码</h1>
      <p class="recover-lead">使用部署时配置的 SETUP_TOKEN 验证身份，为导航站设置新的管理员密码。重置成功后所有现有登录会话将失效。</p>

      <ol class="recover-steps" aria-label="恢复步骤">
        <li class="is-active"><span>1</span><strong>输入部署令牌</strong></li>
        <li><span>2</span><strong>设置新密码</strong></li>
        <li><span>3</span><strong>重置并登录</strong></li>
      </ol>
    </div>

    <form class="recover-form" aria-busy={submitting} onsubmit={(event) => { event.preventDefault(); void handleSubmit() }}>
      <p class="configuration-label">身份验证</p>
      <h2>重置密码</h2>
      <p class="recover-note-text">用户名保持不变，本页面只重置密码。</p>

      <div class="field">
        <label for="recover-token">部署密钥</label>
        <input
          id="recover-token"
          name="setup-token"
          type="password"
          bind:value={setupToken}
          autocomplete="off"
          spellcheck="false"
          required
          disabled={submitting}
          aria-describedby="recover-token-hint"
        />
        <p id="recover-token-hint">输入 Worker 环境中配置的 SETUP_TOKEN。密钥只随本次请求发送，不会保存在浏览器中。</p>
      </div>

      <div class="password-grid">
        <div class="field">
          <label for="recover-password">新密码</label>
          <input
            id="recover-password"
            name="password"
            type="password"
            bind:value={password}
            autocomplete="new-password"
            minlength={ADMIN_PASSWORD_MIN_LENGTH}
            maxlength={ADMIN_PASSWORD_MAX_LENGTH}
            required
            disabled={submitting}
            aria-describedby="recover-password-hint"
          />
          <p id="recover-password-hint">12–256 位，至少包含两类字符。</p>
        </div>
        <div class="field">
          <label for="recover-password-confirmation">再次输入新密码</label>
          <input
            id="recover-password-confirmation"
            name="password-confirmation"
            type="password"
            bind:value={passwordConfirmation}
            autocomplete="new-password"
            minlength={ADMIN_PASSWORD_MIN_LENGTH}
            maxlength={ADMIN_PASSWORD_MAX_LENGTH}
            required
            disabled={submitting}
          />
        </div>
      </div>

      {#if formError}
        <div class="recover-error" role="alert">
          <strong>重置未完成</strong>
          <span>{formError}</span>
          {#if tokenHint}
            <span class="recover-error-hint">若忘记原令牌，可在 Cloudflare 后台「设置 → 变量和密钥 → 生产环境」新增或编辑类型为「密钥」的 SETUP_TOKEN，重新部署后再用新值重置。</span>
          {/if}
        </div>
      {/if}

      <button class="recover-submit" type="submit" disabled={submitting}>
        {submitting ? '正在重置…' : '重置并登录'}
      </button>
      <div class="recover-links">
        <button type="button" class="recover-link" onclick={onCancel} disabled={submitting}>返回登录</button>
        <button type="button" class="recover-link" onclick={onGoInstall} disabled={submitting}>站点未安装？前往初始化</button>
      </div>
    </form>
  </section>
</main>

<style>
  .recover-page {
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

  .recover-card {
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

  .recover-intro,
  .recover-form { padding: clamp(28px, 5vw, 52px); }

  .recover-intro {
    position: relative;
    border-right: 1px solid rgba(148, 163, 184, 0.18);
    background: linear-gradient(155deg, rgba(13, 148, 136, 0.16), rgba(30, 41, 59, 0.08));
  }

  .recover-mark { width: 82px; height: 48px; position: relative; margin-bottom: 34px; }
  .recover-mark::before { content: ""; position: absolute; left: 12px; right: 12px; top: 23px; height: 1px; background: linear-gradient(90deg, #2dd4bf, #60a5fa); }
  .recover-mark span { position: absolute; top: 17px; width: 13px; height: 13px; border-radius: 50%; background: #0f172a; border: 2px solid #5eead4; box-shadow: 0 0 20px rgba(45, 212, 191, 0.55); }
  .recover-mark span:nth-child(1) { left: 3px; }
  .recover-mark span:nth-child(2) { left: 34px; border-color: #7dd3fc; }
  .recover-mark span:nth-child(3) { right: 3px; border-color: #93c5fd; }

  .recover-kicker { margin: 0 0 12px; color: #5eead4; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; }
  h1 { margin: 0; max-width: 11ch; color: #f8fafc; font-size: clamp(2rem, 4.5vw, 3.4rem); line-height: 0.98; letter-spacing: -0.055em; }
  .recover-lead { margin: 22px 0 0; color: #a8b7cc; line-height: 1.75; }

  .recover-steps { list-style: none; display: grid; gap: 13px; margin: 42px 0 0; padding: 0; }
  .recover-steps li { display: flex; align-items: center; gap: 12px; color: #718096; font-size: 0.82rem; }
  .recover-steps span { display: grid; place-items: center; width: 25px; height: 25px; border: 1px solid #475569; border-radius: 50%; font: 700 0.68rem ui-monospace, monospace; }
  .recover-steps .is-active { color: #dbeafe; }
  .recover-steps .is-active span { color: #042f2e; border-color: #5eead4; background: #5eead4; }

  .recover-form { display: grid; align-content: center; gap: 22px; }
  .configuration-label { margin: 0; color: #5eead4; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  h2 { margin: 0; color: #f8fafc; font-size: clamp(1.45rem, 3vw, 2rem); }
  .recover-note-text { margin: 0; color: #a8b7cc; line-height: 1.7; }
  .field { display: grid; gap: 8px; }
  label { color: #dbeafe; font-size: 0.86rem; font-weight: 700; }
  input { width: 100%; min-height: 48px; padding: 0 14px; color: #f8fafc; border: 1px solid #334155; border-radius: 10px; outline: none; background: rgba(2, 8, 23, 0.44); transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
  input:focus { border-color: #2dd4bf; box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.14); }
  input:disabled { opacity: 0.62; cursor: wait; }
  .field p { margin: 0; color: #77869b; font-size: 0.74rem; line-height: 1.55; }
  .password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .recover-error { display: grid; gap: 5px; padding: 13px 15px; color: #fecaca; border: 1px solid rgba(248, 113, 113, 0.3); border-radius: 10px; background: rgba(127, 29, 29, 0.16); font-size: 0.8rem; line-height: 1.5; }
  .recover-error-hint { color: #fbcfe8; }

  .recover-submit { min-height: 50px; padding: 0 20px; color: #042f2e; border: 0; border-radius: 10px; background: linear-gradient(100deg, #5eead4, #7dd3fc); box-shadow: 0 14px 30px rgba(45, 212, 191, 0.16); font-weight: 850; cursor: pointer; transition: transform var(--transition-fast), box-shadow var(--transition-fast); }
  .recover-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 18px 36px rgba(45, 212, 191, 0.23); }
  .recover-submit:focus-visible { outline: 3px solid rgba(125, 211, 252, 0.42); outline-offset: 3px; }
  .recover-submit:disabled { opacity: 0.66; cursor: wait; }

  .recover-links { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .recover-link { padding: 4px 0; color: #7dd3fc; border: 0; background: transparent; text-decoration: underline; cursor: pointer; font-size: 0.8rem; }
  .recover-link:disabled { opacity: 0.6; cursor: not-allowed; }

  @media (max-width: 760px) {
    .recover-card { grid-template-columns: 1fr; }
    .recover-intro { border-right: 0; border-bottom: 1px solid rgba(148, 163, 184, 0.18); }
    h1 { max-width: none; }
    .recover-steps { display: none; }
    .password-grid { grid-template-columns: 1fr; }
  }

  @media (prefers-reduced-motion: reduce) {
    input, .recover-submit { transition: none; }
  }
</style>
