<script lang="ts">
  import { onMount } from 'svelte'
  import type { ThemeMode } from '../../shared/types'

  type AsyncVoid<T = void> = T | Promise<T>
  const BACK_TO_TOP_VISIBILITY_OFFSET = 320

  export let isAuthenticated = false
  export let authLoading = false
  export let activeTheme: 'light' | 'dark' = 'light'
  export let activeThemeMode: ThemeMode = 'auto'
  export let onToggleTheme: (() => AsyncVoid) | undefined = undefined
  export let onSwitchToAdmin: (() => AsyncVoid) | undefined = undefined
  export let onLogout: (() => AsyncVoid) | undefined = undefined
  export let onOpenLogin: (() => AsyncVoid) | undefined = undefined
  export let onOpenCreateRootCategory: (() => AsyncVoid) | undefined = undefined
  export let topNavigation = false
  export let sortActive = false

  let showBackToTop = false

  // 移动端把整组操作收进一个「更多」触发器，点开后向下弹出；桌面端仍平铺（纯 CSS @media 切换）。
  // 触发器与操作组始终在 DOM，由 @media 决定形态——jsdom 不解析 @media，所以操作按钮在单元测试里
  // 始终可查，不会因折叠而丢失可访问入口。
  let menuTrigger: HTMLButtonElement | null = null
  let menuGroup: HTMLElement | null = null
  let menuOpen = false
  const menuId = 'home-actions-menu'

  $: currentThemeLabel = activeThemeMode === 'auto'
    ? `跟随系统，当前${activeTheme === 'dark' ? '暗色' : '浅色'}`
    : activeThemeMode === 'dark' ? '暗色模式' : '浅色模式'
  $: nextThemeLabel = activeThemeMode === 'light'
    ? '暗色模式'
    : activeThemeMode === 'dark' ? '跟随系统' : '浅色模式'
  $: themeToggleLabel = `当前${currentThemeLabel}，点击切换到${nextThemeLabel}`
  $: themeToggleIcon = activeThemeMode === 'auto' ? 'A' : activeTheme === 'dark' ? '☾' : '☀'

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function closeMenu(focusTrigger = false) {
    menuOpen = false
    if (focusTrigger) menuTrigger?.focus()
  }

  function handleToggleTheme() {
    closeMenu()
    void onToggleTheme?.()
  }

  function handleSwitchToAdmin() {
    closeMenu()
    void onSwitchToAdmin?.()
  }

  function handleLogout() {
    closeMenu()
    void onLogout?.()
  }

  function handleOpenCreateRootCategory() {
    closeMenu()
    void onOpenCreateRootCategory?.()
  }

  function handleOpenLogin() {
    closeMenu()
    void onOpenLogin?.()
  }

  function updateBackToTopVisibility() {
    showBackToTop = window.scrollY > BACK_TO_TOP_VISIBILITY_OFFSET
  }

  function handleBackToTop() {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    window.scrollTo({ top: 0, behavior })
  }

  // 弹层外点击与 Escape 关闭：仅在移动端 menuOpen 为真时生效；桌面 menuOpen 恒为 false，处理器直接返回。
  function handleWindowPointerDown(event: PointerEvent) {
    if (!menuOpen) return
    const target = event.target as Node | null
    if (target && (menuTrigger?.contains(target) || menuGroup?.contains(target))) return
    closeMenu()
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (!menuOpen || event.key !== 'Escape') return
    event.preventDefault()
    closeMenu(true)
  }

  onMount(() => {
    updateBackToTopVisibility()
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })

    return () => window.removeEventListener('scroll', updateBackToTopVisibility)
  })
</script>

<svelte:window on:pointerdown={handleWindowPointerDown} on:keydown={handleWindowKeyDown} />

<div class="floating-actions" class:below-top-navigation={topNavigation} class:menu-open={menuOpen}>
  <!-- 折叠触发器：竖三点「更多」，与 Sidebar 目录的横三线汉堡区分；仅移动端可见（@media 控制）。 -->
  <button
    type="button"
    class="icon-button actions-menu-trigger"
    data-testid="home-actions-menu-trigger"
    aria-haspopup="true"
    aria-expanded={menuOpen}
    aria-controls={menuId}
    on:click={toggleMenu}
    bind:this={menuTrigger}
    title="更多操作"
    aria-label="更多操作"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6h.01M12 12h.01M12 18h.01" />
    </svg>
  </button>
  <div class="actions-group" id={menuId} bind:this={menuGroup}>
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
      <!-- 图标语义：裸加号不说明加的是什么，改为「文件夹 + 加号」明确是新增分类 -->
      <button
        type="button"
        class="icon-button create-category-button"
        data-testid="home-create-root-category"
        on:click={handleOpenCreateRootCategory}
        title="新增主分类"
        aria-label="新增主分类"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 8a2 2 0 0 1 2-2h3.6l1.7 2H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          <path d="M12 11.5v5M9.5 14h5" />
        </svg>
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
</div>

{#if showBackToTop}
  <button
    type="button"
    class="icon-button back-to-top-button"
    class:above-sort-bar={sortActive}
    data-testid="home-back-to-top"
    on:click={handleBackToTop}
    title="回到顶部"
    aria-label="回到顶部"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 14.5 12 9l5.5 5.5" />
    </svg>
  </button>
{/if}

<style>
  .floating-actions {
    position: fixed;
    top: 1.25rem;
    right: 1.25rem;
    z-index: 70;
    display: flex;
    gap: 0.5rem;
  }

  /* 顶部导航模式：与固定导航栏（top:12px、高 52px）首行垂直居中对齐。
     悬浮在导航栏之上（z-index 70 > 导航栏 60），宽视口右缘重叠时不被遮挡（OQ-C2）。 */
  .floating-actions.below-top-navigation {
    top: 1.125rem;
  }

  .actions-group {
    display: flex;
    gap: 0.5rem;
  }

  /* 折叠触发器只在移动端出现，桌面保持整组平铺 */
  .floating-actions .actions-menu-trigger {
    display: none;
  }

  .actions-menu-trigger svg {
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .back-to-top-button {
    position: fixed;
    right: max(1.25rem, env(safe-area-inset-right));
    bottom: max(1.25rem, env(safe-area-inset-bottom));
    z-index: 50;
    color: #2563eb;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  }

  .back-to-top-button.above-sort-bar {
    bottom: calc(max(1.25rem, env(safe-area-inset-bottom)) + 3.6rem);
  }

  .back-to-top-button svg {
    width: 1.35rem;
    height: 1.35rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .create-category-button svg {
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    transition: background var(--transition-base), border-color var(--transition-base), transform var(--transition-base);
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

  :global([data-theme='dark']) .back-to-top-button {
    color: #7dd3fc;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }

  @media (max-width: 799px) {
    .floating-actions {
      top: 1rem;
      right: 1rem;
    }

    .floating-actions.below-top-navigation {
      /* 顶部导航栏移动端占据 y≈8..56px 全宽；把折叠触发器下移到导航栏下方，与其错开不重叠 */
      top: 4rem;
    }

    .floating-actions .actions-menu-trigger {
      display: flex;
    }

    /* 移动端整组收进触发器下方的弹层，向下展开 */
    .actions-group {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 80;
      display: none;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.4rem;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
    }

    .floating-actions.menu-open .actions-group {
      display: flex;
    }

    :global([data-theme='dark']) .actions-group {
      background: rgba(15, 23, 42, 0.92);
      border-color: rgba(148, 163, 184, 0.32);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
    }

    .icon-button {
      width: 2.2rem;
      height: 2.2rem;
      font-size: 1rem;
    }

    .create-category-button {
      min-width: 36px;
      min-height: 36px;
    }

    .back-to-top-button {
      right: max(1rem, env(safe-area-inset-right));
      bottom: max(1rem, env(safe-area-inset-bottom));
    }

    .back-to-top-button.above-sort-bar {
      bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 4.4rem);
    }
  }

  /* 平板到中屏（800–1650px）的顶部导航模式：居中导航栏（max-width 1200px）右缘距视口仅约 16px，
     与右上角平铺按钮组（约占右侧 204px）必然重叠——按钮会盖住导航栏右滚动箭头与末端标签。
     判据：(vw − content-max-width) / 2 ≥ 204 → 约 vw ≥ 1608px 才不重叠，取 1650px 留冗余。
     故此区间也折叠为「更多」菜单并下移到导航栏下方；>1650px 恢复平铺，侧栏模式不受影响。 */
  @media (min-width: 800px) and (max-width: 1650px) {
    .floating-actions.below-top-navigation {
      top: 4.5rem;
    }

    .floating-actions.below-top-navigation .actions-menu-trigger {
      display: flex;
    }

    .floating-actions.below-top-navigation .actions-group {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 80;
      display: none;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.4rem;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
    }

    .floating-actions.below-top-navigation.menu-open .actions-group {
      display: flex;
    }

    :global([data-theme='dark']) .floating-actions.below-top-navigation .actions-group {
      background: rgba(15, 23, 42, 0.92);
      border-color: rgba(148, 163, 184, 0.32);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
    }
  }
</style>
