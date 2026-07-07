<script lang="ts">
  type AsyncVoid<T = void> = T | Promise<T>

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

<div class="admin-header-actions">
  {#if canSeeHome}
    <button
      type="button"
      class="icon-button"
      on:click={handleSwitchToHome}
      title="返回首页"
      aria-label="返回首页"
    >
      🏠
    </button>
  {/if}
  {#if isAuthenticated}
    <button
      type="button"
      class="icon-button"
      on:click={handleLogout}
      disabled={authLoading}
      title="退出登录"
      aria-label="退出登录"
    >
      🚪
    </button>
  {:else}
    <button
      type="button"
      class="icon-button"
      on:click={handleOpenLogin}
      disabled={authLoading}
      title="管理员登录"
      aria-label="管理员登录"
    >
      🔑
    </button>
  {/if}
</div>

<header class="page-header">
  <div>
    <p class="eyebrow">管理后台</p>
    <h1>导航内容管理</h1>
  </div>
</header>

<style>
  .admin-header-actions {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 50;
    display: flex;
    gap: 0.5rem;
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
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  }

  .icon-button:hover:not(:disabled) {
    background: var(--admin-control-hover-bg);
    border-color: color-mix(in srgb, var(--admin-accent) 52%, var(--admin-border));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .page-header {
    min-height: 64px;
    display: flex;
    align-items: center;
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
  }

  @media (max-width: 960px) {
    .admin-header-actions {
      top: 20px;
      right: 20px;
    }

    .icon-button {
      width: 2.2rem;
      height: 2.2rem;
      font-size: 1rem;
    }

    .page-header {
      display: grid;
    }
  }
</style>
