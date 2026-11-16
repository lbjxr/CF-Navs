<svelte:options runes />

<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { ThemeMode } from '../../shared/types'

  type AsyncVoid<T = void> = T | Promise<T>
  const BACK_TO_TOP_VISIBILITY_OFFSET = 320
  const MENU_CLOSE_DELAY_MS = 3000

  interface Props {
    isAuthenticated?: boolean
    authLoading?: boolean
    activeTheme?: 'light' | 'dark'
    activeThemeMode?: ThemeMode
    onToggleTheme?: () => AsyncVoid
    onSwitchToAdmin?: () => AsyncVoid
    onLogout?: () => AsyncVoid
    onOpenLogin?: () => AsyncVoid
    onOpenCreateBookmark?: () => AsyncVoid
    topNavigation?: boolean
    sortActive?: boolean
    searchBoxVisible?: boolean
    searchBoxShow?: boolean
    onOpenSearch?: () => AsyncVoid
    onOpenGuide?: () => AsyncVoid
  }

  let {
    isAuthenticated = false,
    authLoading = false,
    activeTheme = 'light',
    activeThemeMode = 'auto',
    onToggleTheme,
    onSwitchToAdmin,
    onLogout,
    onOpenLogin,
    onOpenCreateBookmark,
    topNavigation = false,
    sortActive = false,
    searchBoxVisible = false,
    searchBoxShow = true,
    onOpenSearch,
    onOpenGuide,
  }: Props = $props()

  let showBackToTop = $state(false)
  let isMac = $state(false)
  // 搜索框离屏时显示；`search_box_show=false` 时恒显，保证仍有搜索入口（REQ-01 / FR-1.2）。
  const showSearchButton = $derived(!searchBoxVisible || !searchBoxShow)
  const searchShortcutHint = $derived(isMac ? '⌘K' : 'Ctrl+K')

  function handleOpenSearch() {
    closeMenu()
    void onOpenSearch?.()
  }

  function handleOpenGuide() {
    closeMenu()
    void onOpenGuide?.()
  }

  // 菜单自己持有悬停状态和收起计时器；触发器与操作组之间移动时取消收起。
  let menuTrigger: HTMLButtonElement | null = null
  let menuGroup: HTMLElement | null = null
  let menuOpen = $state(false)
  let pointerInsideMenu = false
  let menuCloseTimer: ReturnType<typeof setTimeout> | null = null
  const menuId = 'home-actions-menu'

  const currentThemeLabel = $derived(activeThemeMode === 'auto'
    ? `跟随系统，当前${activeTheme === 'dark' ? '暗色' : '浅色'}`
    : activeThemeMode === 'dark' ? '暗色模式' : '浅色模式')
  const nextThemeLabel = $derived(activeThemeMode === 'light'
    ? '暗色模式'
    : activeThemeMode === 'dark' ? '跟随系统' : '浅色模式')
  const themeToggleLabel = $derived(`当前${currentThemeLabel}，点击切换到${nextThemeLabel}`)
  const themeToggleIcon = $derived(activeThemeMode === 'auto' ? 'A' : activeTheme === 'dark' ? '☾' : '☀')

  function toggleMenu() {
    cancelMenuClose()
    menuOpen = !menuOpen
  }

  function closeMenu(focusTrigger = false) {
    cancelMenuClose()
    menuOpen = false
    if (focusTrigger) menuTrigger?.focus()
  }

  function cancelMenuClose() {
    if (menuCloseTimer !== null) clearTimeout(menuCloseTimer)
    menuCloseTimer = null
  }

  function scheduleMenuClose() {
    cancelMenuClose()
    if (!menuOpen || pointerInsideMenu || menuGroup?.contains(document.activeElement)) return
    menuCloseTimer = setTimeout(() => closeMenu(), MENU_CLOSE_DELAY_MS)
  }

  function handleMenuPointerEnter(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    pointerInsideMenu = true
    cancelMenuClose()
    menuOpen = true
  }

  function handleMenuPointerLeave(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    pointerInsideMenu = false
    scheduleMenuClose()
  }

  function handleMenuFocusOut(event: FocusEvent) {
    const target = event.relatedTarget as Node | null
    if (target && (menuTrigger?.contains(target) || menuGroup?.contains(target))) return
    scheduleMenuClose()
  }

  onDestroy(cancelMenuClose)

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

  function handleOpenCreateBookmark() {
    closeMenu()
    void onOpenCreateBookmark?.()
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

  // 弹层外点击与 Escape 关闭。
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

    if (typeof window !== 'undefined') {
      const platform =
        (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        ''
      isMac = /mac/i.test(platform)
    }

    return () => window.removeEventListener('scroll', updateBackToTopVisibility)
  })
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeyDown} />

<div class="floating-actions" class:below-top-navigation={topNavigation} class:menu-open={menuOpen} class:search-visible={showSearchButton}>
  <button
    type="button"
    class="icon-button search-fab"
    class:is-visible={showSearchButton}
    data-testid="home-search-button"
    onclick={handleOpenSearch}
    title={`搜索书签 (${searchShortcutHint})`}
    aria-label="搜索书签"
    aria-hidden={!showSearchButton}
    tabindex={showSearchButton ? undefined : -1}
    aria-keyshortcuts="Control+K Meta+K"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  </button>
  <div
    class="actions-group"
    id={menuId}
    bind:this={menuGroup}
    role="group"
    aria-label="设置操作"
    onpointerenter={handleMenuPointerEnter}
    onpointerleave={handleMenuPointerLeave}
    onfocusin={cancelMenuClose}
    onfocusout={handleMenuFocusOut}
  >
    <button
      type="button"
      class="icon-button guide-button"
      data-testid="home-guide-button"
      onclick={handleOpenGuide}
      title="使用指南"
      aria-label="使用指南"
    >
      ?
    </button>
    <button
      type="button"
      class="icon-button theme-toggle-button"
      data-testid="home-theme-toggle"
      class:is-dark={activeTheme === 'dark'}
      class:is-auto={activeThemeMode === 'auto'}
      onclick={handleToggleTheme}
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
        onclick={handleSwitchToAdmin}
        title="管理后台"
        aria-label="管理后台"
      >
        &#9881;
      </button>
      <button
        type="button"
        class="icon-button create-bookmark-button"
        data-testid="home-create-bookmark"
        onclick={handleOpenCreateBookmark}
        title="新增书签"
        aria-label="新增书签"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
          <path d="M12 7v6M9 10h6" />
        </svg>
      </button>
      <button
        type="button"
        class="icon-button"
        data-testid="home-logout-button"
        onclick={handleLogout}
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
        onclick={handleOpenLogin}
        title="管理员登录"
        aria-label="管理员登录"
      >
        &#9881;
      </button>
    {/if}
  </div>
  <button
    type="button"
    class="icon-button actions-menu-trigger"
    data-testid="home-actions-menu-trigger"
    aria-haspopup="true"
    aria-expanded={menuOpen}
    aria-controls={menuId}
    onclick={toggleMenu}
    onpointerenter={handleMenuPointerEnter}
    onpointerleave={handleMenuPointerLeave}
    onfocusin={cancelMenuClose}
    onfocusout={handleMenuFocusOut}
    bind:this={menuTrigger}
    title="设置菜单"
    aria-label="设置菜单"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 3-.5 2-1.7 1-2-.6-2.5 4.2 1.5 1.4v2l-1.5 1.4 2.5 4.2 2-.6 1.7 1 .5 2h5l.5-2 1.7-1 2 .6 2.5-4.2-1.5-1.4v-2l1.5-1.4-2.5-4.2-2 .6-1.7-1-.5-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>
</div>

{#if showBackToTop}
  <button
    type="button"
    class="icon-button back-to-top-button"
    class:above-sort-bar={sortActive}
    data-testid="home-back-to-top"
    onclick={handleBackToTop}
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
    display: none;
    gap: 0.5rem;
  }

  .floating-actions.menu-open .actions-group {
    display: flex;
  }

  .floating-actions .actions-menu-trigger {
    display: flex;
  }

  .actions-menu-trigger svg {
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
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

  .create-bookmark-button svg {
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

  .search-fab {
    color: #2563eb;
    border-color: rgba(37, 99, 235, 0.5);
    background: rgba(219, 234, 254, 0.92);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity var(--transition-base), visibility var(--transition-base);
  }

  .search-fab.is-visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  /* 隐藏态移出 flex 流，避免在按钮组里留永久空槽/间隙（搜索框在视口内时的首页常态）。
     绝对定位锚到 .floating-actions 角落，
     因不可见（opacity/visibility/pointer-events）在各模式下均无视觉与交互影响。 */
  .search-fab:not(.is-visible) {
    position: absolute;
    top: 0;
    right: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .search-fab {
      transition: none;
    }
  }

  .search-fab:hover:not(:disabled) {
    background: rgba(191, 219, 254, 0.95);
    border-color: rgba(37, 99, 235, 0.6);
  }

  .search-fab svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global([data-theme='dark']) .search-fab {
    color: #bfdbfe;
    background: rgba(30, 58, 138, 0.55);
    border-color: rgba(96, 165, 250, 0.5);
  }

  .guide-button {
    font-weight: 800;
    font-size: 1.05rem;
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

    /* 窄屏将操作组横向展开到触发器左侧，不挡住首页标题与搜索框。 */
    .actions-group {
      position: absolute;
      top: 0;
      right: calc(100% + 6px);
      z-index: 80;
      display: none;
      flex-direction: row;
      gap: 0.4rem;
      padding: 0.4rem;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 0.85rem;
      background: rgba(255, 255, 255, 0.96);
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
    }

    .floating-actions.search-visible .actions-group {
      top: calc(100% + 6px);
      right: 0;
      flex-direction: column;
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

    .create-bookmark-button {
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

  /* 顶部导航模式的中屏布局会占用右上角空间，把操作组放到触发器下方。 */
  @media (min-width: 800px) and (max-width: 1650px) {
    .floating-actions.below-top-navigation {
      top: 4.5rem;
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
