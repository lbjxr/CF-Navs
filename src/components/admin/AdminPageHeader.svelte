<script lang="ts">

  import type { AsyncVoid } from '../../../shared/types'
  export let isAuthenticated = false
  export let authLoading = false
  export let canSeeHome = false
  export let onOpenLogin: (() => AsyncVoid) | undefined = undefined
  export let onLogout: (() => AsyncVoid) | undefined = undefined
  export let onSwitchToHome: (() => AsyncVoid) | undefined = undefined

  function handleOpenLogin(): void {
    void onOpenLogin?.()
  }

  function handleLogout(): void {
    void onLogout?.()
  }

  function handleSwitchToHome(): void {
    void onSwitchToHome?.()
  }
</script>

<header class="page-header">
  <div class="page-header-copy">
    <p class="eyebrow">管理后台</p>
    <h1>导航内容管理</h1>
  </div>
  <div class="admin-header-actions">
    {#if canSeeHome}
      <button
        type="button"
        class="icon-button"
        data-testid="admin-home-button"
        on:click={handleSwitchToHome}
        title="返回首页"
        aria-label="返回首页"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>
    {/if}
    {#if isAuthenticated}
      <button
        type="button"
        class="icon-button"
        data-testid="admin-logout-button"
        on:click={handleLogout}
        disabled={authLoading}
        title="退出登录"
        aria-label="退出登录"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" x2="9" y1="12" y2="12"/>
        </svg>
      </button>
    {:else}
      <button
        type="button"
        class="icon-button"
        data-testid="admin-login-button"
        on:click={handleOpenLogin}
        disabled={authLoading}
        title="管理员登录"
        aria-label="管理员登录"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.2em" height="1.2em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </button>
    {/if}
  </div>
</header>

<style>
  .admin-header-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-self: end;
  }

  .icon-button {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--admin-border);
    border-radius: 0.75rem;
    background: var(--admin-control-bg);
    color: var(--admin-text);
    font-size: 1.1rem;
    cursor: pointer;
    transition:
      border-color var(--transition-base),
      background var(--transition-base),
      color var(--transition-base),
      box-shadow var(--transition-base),
      transform var(--transition-base);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  }

  .icon-button:hover:not(:disabled) {
    background: var(--admin-control-hover-bg);
    border-color: color-mix(in srgb, var(--admin-accent) 52%, var(--admin-border));
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .page-header {
    min-height: 64px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    border: 1px solid var(--admin-border);
    border-radius: 18px;
    background: var(--admin-surface);
    box-shadow: var(--admin-shadow);
  }

  .eyebrow {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--admin-subtle);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }

  @media (max-width: 960px) {
    .icon-button {
      width: 2.2rem;
      height: 2.2rem;
      font-size: 1rem;
    }

    .page-header {
      gap: 12px;
    }
  }

  @media (max-width: 700px) {
    .page-header {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
    }

    .admin-header-actions {
      justify-content: flex-end;
      gap: 6px;
    }

    .icon-button {
      width: 2rem;
      height: 2rem;
    }

    h1 {
      font-size: 22px;
    }
  }
</style>
