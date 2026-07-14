<script lang="ts">
  import type { ThemeMode } from '../../shared/types'

  type AsyncVoid<T = void> = T | Promise<T>

  export let isAuthenticated = false
  export let authLoading = false
  export let activeTheme: 'light' | 'dark' = 'light'
  export let activeThemeMode: ThemeMode = 'auto'
  export let onToggleTheme: (() => AsyncVoid) | undefined = undefined
  export let onSwitchToAdmin: (() => AsyncVoid) | undefined = undefined
  export let onLogout: (() => AsyncVoid) | undefined = undefined
  export let onOpenLogin: (() => AsyncVoid) | undefined = undefined
  export let topNavigation = false

  $: currentThemeLabel = activeThemeMode === 'auto'
    ? `跟随系统，当前${activeTheme === 'dark' ? '暗色' : '浅色'}`
    : activeThemeMode === 'dark' ? '暗色模式' : '浅色模式'
  $: nextThemeLabel = activeThemeMode === 'light'
    ? '暗色模式'
    : activeThemeMode === 'dark' ? '跟随系统' : '浅色模式'
  $: themeToggleLabel = `当前${currentThemeLabel}，点击切换到${nextThemeLabel}`
  $: themeToggleIcon = activeThemeMode === 'auto' ? 'A' : activeTheme === 'dark' ? '☾' : '☀'

  function handleToggleTheme() {
    void onToggleTheme?.()
  }

  function handleSwitchToAdmin() {
    void onSwitchToAdmin?.()
  }

  function handleLogout() {
    void onLogout?.()
  }

  function handleOpenLogin() {
    void onOpenLogin?.()
  }
</script>

<div class="floating-actions" class:below-top-navigation={topNavigation}>
  <button
    type="button"
    class="icon-button theme-toggle-button"
    data-testid="home-theme-toggle"
    class:is-dark={activeTheme === 'dark'}
    class:is-auto={activeThemeMode === 'auto'}
    on:click={handleToggleTheme}
    title={themeToggleLabel}
    aria-label={themeToggleLabel}
  >
    {themeToggleIcon}
  </button>
  {#if isAuthenticated}
    <button
      type="button"
      class="icon-button"
      data-testid="home-admin-button"
      on:click={handleSwitchToAdmin}
      title="管理后台"
      aria-label="管理后台"
    >
      &#9881;
    </button>
    <button
      type="button"
      class="icon-button"
      data-testid="home-logout-button"
      on:click={handleLogout}
      disabled={authLoading}
      title="退出登录"
      aria-label="退出登录"
    >
      &#8618;
    </button>
  {:else}
    <button
      type="button"
      class="icon-button"
      data-testid="home-login-button"
      on:click={handleOpenLogin}
      title="管理员登录"
      aria-label="管理员登录"
    >
      &#9881;
    </button>
  {/if}
</div>

<style>
  .floating-actions {
    position: fixed;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 50;
    display: flex;
    gap: 0.5rem;
  }

  .floating-actions.below-top-navigation {
    top: 4.75rem;
  }

  .icon-button {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.82);
    font-size: 1.15rem;
    line-height: 1;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .icon-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(37, 99, 235, 0.45);
    transform: translateY(-1px);
  }

  .theme-toggle-button {
    color: #0f172a;
    font-weight: 700;
  }

  .theme-toggle-button.is-dark {
    background: rgba(15, 23, 42, 0.82);
    color: #e5eefb;
  }

  .theme-toggle-button.is-auto {
    background: rgba(14, 165, 233, 0.16);
    border-color: rgba(14, 165, 233, 0.42);
    color: #075985;
    font-size: 0.95rem;
    letter-spacing: 0;
  }

  :global([data-theme='dark']) .theme-toggle-button.is-auto {
    background: rgba(14, 165, 233, 0.22);
    border-color: rgba(125, 211, 252, 0.46);
    color: #bae6fd;
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  :global([data-theme='dark']) .icon-button {
    background: rgba(15, 23, 42, 0.7);
    border-color: rgba(148, 163, 184, 0.32);
    color: #e5eefb;
  }

  :global([data-theme='dark']) .icon-button:hover:not(:disabled) {
    background: rgba(15, 23, 42, 0.85);
  }

  @media (max-width: 720px) {
    .floating-actions {
      top: 1rem;
      right: 1rem;
    }

    .floating-actions.below-top-navigation {
      top: 4rem;
    }

    .icon-button {
      width: 2.2rem;
      height: 2.2rem;
      font-size: 1rem;
    }
  }
</style>
