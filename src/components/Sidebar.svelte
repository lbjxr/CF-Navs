<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import type { NavigationSetting } from '../../shared/types'
  import {
    getAnchoredOverlayPosition,
    getHorizontalNavigationMetrics,
    readLeftNavigationCollapsed,
    writeLeftNavigationCollapsed,
  } from '../lib/navigationLayout'

  type NavigationItem = {
    id: string | number
    title: string
    count?: number
    children?: NavigationItem[]
  }

  export let items: NavigationItem[] = []
  export let activeId: string | number | null = null
  export let navigation: NavigationSetting = { position: 'left', always_expanded: false }
  export let onNavigate: ((id: string | number) => void) | undefined = undefined
  export let onPersistentExpansionChange: ((expanded: boolean) => void) | undefined = undefined

  const MOBILE_WIDTH = 800
  const DRAG_THRESHOLD_PX = 6
  const RESIZE_DEBOUNCE_MS = 120
  const TOP_SUBMENU_WIDTH = 220

  let isMobileView = false
  let mobileSidebarOpen = false
  let hoverExpanded = false
  let manuallyCollapsed = false
  let mounted = false
  let leftPreferenceLoaded = false
  let topTrack: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let overflowFrame: number | null = null
  let overflow = false
  let canScrollLeft = false
  let canScrollRight = false
  let dragging = false
  let suppressNextClick = false
  let clickSuppressionTimer: ReturnType<typeof setTimeout> | null = null
  let dragPointerId: number | null = null
  let dragStartX = 0
  let dragStartScrollLeft = 0
  let reportedPersistentExpansion: boolean | null = null
  let navigationRoot: HTMLElement | null = null
  let expandedParentIds = new Set<string>()
  let openTopMenuId = ''
  let topMenuStyle = ''
  let topMenuAnchor: HTMLElement | null = null
  let topMenuToggle: HTMLButtonElement | null = null
  let topMenuElement: HTMLElement | null = null

  $: isTop = navigation.position === 'top'
  $: isPersistentLeft = !isTop && !isMobileView && navigation.always_expanded
  $: isExpanded = isMobileView
    ? mobileSidebarOpen
    : isPersistentLeft
      ? !manuallyCollapsed
      : hoverExpanded

  $: {
    const nextPersistentExpansion = isPersistentLeft && isExpanded
    if (nextPersistentExpansion !== reportedPersistentExpansion) {
      reportedPersistentExpansion = nextPersistentExpansion
      onPersistentExpansionChange?.(nextPersistentExpansion)
    }
  }

  $: if (mounted && isPersistentLeft && !leftPreferenceLoaded) {
    manuallyCollapsed = readLeftNavigationCollapsed(window.localStorage)
    leftPreferenceLoaded = true
  }

  $: if (isTop && mobileSidebarOpen) {
    mobileSidebarOpen = false
  }

  $: if (isTop && topTrack) {
    void items.length
    void tick().then(() => {
      updateOverflowState()
      scrollActiveItemIntoView('auto')
    })
  }

  $: if (isTop && activeId != null && topTrack) {
    void activeId
    void tick().then(() => scrollActiveItemIntoView('smooth'))
  }

  $: activeParentId = items.find((item) => (
    item.children?.some((child) => String(child.id) === String(activeId))
  ))?.id

  function checkIsMobile(): void {
    isMobileView = window.innerWidth < MOBILE_WIDTH
  }

  function handleResize(): void {
    const wasMobile = isMobileView
    checkIsMobile()
    if (!isMobileView) {
      mobileSidebarOpen = false
    } else if (!wasMobile) {
      hoverExpanded = false
    }
    updateOverflowState()
    updateTopMenuPosition()
  }

  function scheduleResize(): void {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      handleResize()
    }, RESIZE_DEBOUNCE_MS)
  }

  function handleMobileBtnClick(): void {
    if (isMobileView && !isTop) {
      mobileSidebarOpen = !mobileSidebarOpen
    }
  }

  function closeMobileSidebar(event?: Event): void {
    event?.preventDefault()
    event?.stopPropagation()
    mobileSidebarOpen = false
  }

  function handleMouseEnter(): void {
    if (!isMobileView && !isPersistentLeft) hoverExpanded = true
  }

  function handleMouseLeave(): void {
    if (!isMobileView && !isPersistentLeft) hoverExpanded = false
  }

  function togglePersistentLeft(): void {
    if (!isPersistentLeft) return
    manuallyCollapsed = !manuallyCollapsed
    writeLeftNavigationCollapsed(window.localStorage, manuallyCollapsed)
  }

  function clearClickSuppression(): void {
    suppressNextClick = false
    if (clickSuppressionTimer) {
      clearTimeout(clickSuppressionTimer)
      clickSuppressionTimer = null
    }
  }

  function handleItemClick(id: string | number): void {
    if (suppressNextClick) {
      clearClickSuppression()
      return
    }

    onNavigate?.(id)
    closeTopMenu()
    if (isMobileView && !isTop) mobileSidebarOpen = false
  }

  function toggleParent(item: NavigationItem, event?: MouseEvent): void {
    const id = String(item.id)
    if (isTop) {
      if (openTopMenuId === id) {
        closeTopMenu()
        return
      }
      const button = event?.currentTarget as HTMLButtonElement | null
      topMenuAnchor = button?.closest<HTMLElement>('.top-item-group') ?? button
      topMenuToggle = button
      updateTopMenuPosition()
      openTopMenuId = id
      if (event?.detail === 0) {
        void tick().then(() => getTopMenuItems()[0]?.focus())
      }
      return
    }

    const next = new Set(expandedParentIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedParentIds = next
  }

  function closeTopMenu(restoreFocus = false): void {
    const toggle = topMenuToggle
    openTopMenuId = ''
    topMenuAnchor = null
    topMenuToggle = null
    topMenuElement = null
    topMenuStyle = ''
    if (restoreFocus) void tick().then(() => toggle?.focus())
  }

  function getTopMenuItems(): HTMLButtonElement[] {
    if (!topMenuElement) return []
    return Array.from(topMenuElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  }

  function handleTopMenuKeyDown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const menuItems = getTopMenuItems()
    if (menuItems.length === 0) return
    event.preventDefault()
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? menuItems.length - 1
        : event.key === 'ArrowUp'
          ? (currentIndex - 1 + menuItems.length) % menuItems.length
          : (currentIndex + 1) % menuItems.length
    menuItems[nextIndex]?.focus()
  }

  function updateTopMenuPosition(): void {
    if (!topMenuAnchor || !navigationRoot || !isTop) return
    const anchorRect = topMenuAnchor.getBoundingClientRect()
    const navigationRect = navigationRoot.getBoundingClientRect()
    const position = getAnchoredOverlayPosition({
      anchorLeft: anchorRect.left,
      anchorRight: anchorRect.right,
      anchorBottom: anchorRect.bottom,
      overlayWidth: TOP_SUBMENU_WIDTH,
      viewportWidth: window.innerWidth,
    })
    topMenuStyle = `top: ${position.top - navigationRect.top - navigationRoot.clientTop}px; left: ${position.left - navigationRect.left - navigationRoot.clientLeft}px;`
  }

  function handleTopTrackScroll(): void {
    updateOverflowState()
    updateTopMenuPosition()
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (openTopMenuId && navigationRoot && !navigationRoot.contains(event.target as Node)) {
      closeTopMenu()
    }
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (openTopMenuId) {
      closeTopMenu(true)
      return
    }
    if (mobileSidebarOpen) mobileSidebarOpen = false
  }

  function updateOverflowState(): void {
    if (!topTrack) {
      overflow = false
      canScrollLeft = false
      canScrollRight = false
      return
    }

    const metrics = getHorizontalNavigationMetrics(topTrack)
    overflow = metrics.overflow
    canScrollLeft = metrics.canScrollLeft
    canScrollRight = metrics.canScrollRight
  }

  function scheduleOverflowUpdate(): void {
    if (overflowFrame != null) cancelAnimationFrame(overflowFrame)
    overflowFrame = requestAnimationFrame(() => {
      overflowFrame = null
      updateOverflowState()
    })
  }

  function scrollTopTrack(direction: -1 | 1): void {
    if (!topTrack) return
    const metrics = getHorizontalNavigationMetrics(topTrack)
    topTrack.scrollBy({ left: direction * metrics.scrollStep, behavior: 'smooth' })
  }

  function scrollActiveItemIntoView(behavior: ScrollBehavior): void {
    if (!topTrack || activeId == null) return
    const navigationId = activeParentId ?? activeId
    const activeItem = Array.from(topTrack.querySelectorAll<HTMLElement>('[data-navigation-id]'))
      .find((element) => element.dataset.navigationId === String(navigationId))
    if (!activeItem) return

    const trackRect = topTrack.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    if (itemRect.left < trackRect.left || itemRect.right > trackRect.right) {
      activeItem.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!topTrack || event.pointerType !== 'mouse' || event.button !== 0) return
    clearClickSuppression()
    dragging = false
    dragPointerId = event.pointerId
    dragStartX = event.clientX
    dragStartScrollLeft = topTrack.scrollLeft
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!topTrack || dragPointerId !== event.pointerId) return
    // Mutate through a local DOM reference so Svelte does not invalidate the
    // bound element variable and rerun active-item auto-scrolling mid-drag.
    const track = topTrack
    const delta = event.clientX - dragStartX
    if (!dragging && Math.abs(delta) >= DRAG_THRESHOLD_PX) {
      dragging = true
      suppressNextClick = true
      // Capture only after a real drag starts so ordinary item clicks keep
      // their original button target and still produce a click event.
      if (!track.hasPointerCapture(event.pointerId)) {
        track.setPointerCapture(event.pointerId)
      }
      track.style.scrollBehavior = 'auto'
    }
    if (!dragging) return
    event.preventDefault()
    track.scrollLeft = dragStartScrollLeft - delta
  }

  function finishPointerDrag(event: PointerEvent): void {
    if (!topTrack || dragPointerId !== event.pointerId) return
    const track = topTrack
    const didDrag = dragging
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId)
    }
    dragPointerId = null
    dragging = false
    track.style.removeProperty('scroll-behavior')
    updateOverflowState()
    if (didDrag) {
      clickSuppressionTimer = setTimeout(() => {
        suppressNextClick = false
        clickSuppressionTimer = null
      }, 0)
    }
  }

  onMount(() => {
    checkIsMobile()
    mounted = true
    window.addEventListener('resize', scheduleResize)
    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleOverflowUpdate)
      if (topTrack) resizeObserver.observe(topTrack)
    }
    updateOverflowState()
  })

  $: if (resizeObserver && topTrack) {
    resizeObserver.disconnect()
    resizeObserver.observe(topTrack)
  }

  onDestroy(() => {
    mounted = false
    window.removeEventListener('resize', scheduleResize)
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeyDown)
    resizeObserver?.disconnect()
    if (resizeTimer) clearTimeout(resizeTimer)
    if (overflowFrame != null) cancelAnimationFrame(overflowFrame)
    if (clickSuppressionTimer) clearTimeout(clickSuppressionTimer)
  })
</script>

{#if isTop}
  <aside class="top-navigation" bind:this={navigationRoot} data-testid="top-navigation" aria-label="分类导航">
    <button
      type="button"
      class="scroll-arrow scroll-arrow-left"
      class:hidden={!overflow}
      disabled={!canScrollLeft}
      on:click={() => scrollTopTrack(-1)}
      aria-label="向左滚动分类"
      title="向左滚动分类"
    >
      ‹
    </button>

    <nav
      class="top-track"
      class:dragging
      bind:this={topTrack}
      on:scroll={handleTopTrackScroll}
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={finishPointerDrag}
      on:pointercancel={finishPointerDrag}
    >
      {#each items as item (item.id)}
        <div class="top-item-group" data-navigation-id={item.id}>
          <button
            type="button"
            class="top-item"
            title={item.title}
            class:active={String(activeId) === String(item.id) || String(activeParentId) === String(item.id)}
            aria-current={String(activeId) === String(item.id) ? 'location' : undefined}
            on:click={() => handleItemClick(item.id)}
          >
            <span>{item.title}</span>
            {#if item.count != null}<small>{item.count}</small>{/if}
          </button>
          {#if item.children?.length}
            <button
              type="button"
              class="top-submenu-toggle"
              aria-label={`${openTopMenuId === String(item.id) ? '收起' : '展开'} ${item.title} 的子分类`}
              aria-expanded={openTopMenuId === String(item.id)}
              on:click={(event) => toggleParent(item, event)}
            >
              ▾
            </button>
          {/if}
        </div>
      {/each}
    </nav>

    <button
      type="button"
      class="scroll-arrow scroll-arrow-right"
      class:hidden={!overflow}
      disabled={!canScrollRight}
      on:click={() => scrollTopTrack(1)}
      aria-label="向右滚动分类"
      title="向右滚动分类"
    >
      ›
    </button>

    {#if openTopMenuId}
      {@const parent = items.find((item) => String(item.id) === openTopMenuId)}
      {#if parent?.children?.length}
        <div
          class="top-submenu"
          style={topMenuStyle}
          role="menu"
          tabindex="-1"
          aria-label={`${parent.title} 子分类`}
          bind:this={topMenuElement}
          on:keydown={handleTopMenuKeyDown}
        >
          {#each parent.children as child (child.id)}
            <button
              type="button"
              role="menuitem"
              title={child.title}
              class:active={String(activeId) === String(child.id)}
              on:click={() => handleItemClick(child.id)}
            >
              <span>{child.title}</span>
              {#if child.count != null}<small>{child.count}</small>{/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </aside>
{:else}
  <button
    type="button"
    class="toc-mobile-btn"
    class:hidden={!isMobileView}
    on:click={handleMobileBtnClick}
    aria-label="目录导航"
    aria-expanded={mobileSidebarOpen}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 5.5h16v2H4zm0 5.5h16v2H4zm0 5.5h16v2H4z" />
    </svg>
  </button>

  {#if isMobileView && mobileSidebarOpen}
    <button type="button" class="sidebar-overlay" on:click={closeMobileSidebar} aria-label="关闭目录导航"></button>
  {/if}

  <aside
    class="toc-sidebar"
    class:expanded={isExpanded}
    class:persistent={isPersistentLeft}
    class:mobile-hidden={isMobileView && !mobileSidebarOpen}
    aria-label="分类导航"
    on:mouseenter={handleMouseEnter}
    on:mouseleave={handleMouseLeave}
    bind:this={navigationRoot}
  >
    {#if isMobileView}
      <button type="button" class="toc-close-btn" on:click={closeMobileSidebar} aria-label="收起目录">‹</button>
    {:else if isPersistentLeft}
      <button
        type="button"
        class="toc-collapse-btn"
        on:click={togglePersistentLeft}
        aria-label={isExpanded ? '收缩分类导航' : '展开分类导航'}
        aria-expanded={isExpanded}
        title={isExpanded ? '收缩分类导航' : '展开分类导航'}
      >
        {isExpanded ? '‹' : '›'}
      </button>
    {/if}

    <nav class="toc-nav">
      {#each items as item (item.id)}
        <div class="toc-group">
          <div class="toc-parent-row">
            <button
              type="button"
              class="toc-item"
              title={item.title}
              class:active={String(activeId) === String(item.id)}
              aria-current={String(activeId) === String(item.id) ? 'location' : undefined}
              on:click={() => handleItemClick(item.id)}
            >
              <span class="toc-slip"></span>
              <span class="toc-title">{item.title}</span>
              {#if item.count != null}<small>{item.count}</small>{/if}
            </button>
            {#if item.children?.length}
              <button
                type="button"
                class="toc-expand-button"
                aria-label={`${expandedParentIds.has(String(item.id)) ? '收起' : '展开'} ${item.title} 的子分类`}
                aria-expanded={expandedParentIds.has(String(item.id))}
                on:click={() => toggleParent(item)}
              >
                {expandedParentIds.has(String(item.id)) ? '▾' : '▸'}
              </button>
            {/if}
          </div>
          {#if item.children?.length && expandedParentIds.has(String(item.id)) && isExpanded}
            <div class="toc-children">
              {#each item.children as child (child.id)}
                <button
                  type="button"
                  class="toc-child-item"
                  title={child.title}
                  class:active={String(activeId) === String(child.id)}
                  aria-current={String(activeId) === String(child.id) ? 'location' : undefined}
                  on:click={() => handleItemClick(child.id)}
                >
                  <span>{child.title}</span>
                  {#if child.count != null}<small>{child.count}</small>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </nav>
  </aside>
{/if}

<style>
  .toc-mobile-btn,
  .toc-sidebar,
  .top-navigation {
    --toc-surface: rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.82));
    --toc-surface-strong: rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.94));
    --toc-item-bg: rgba(255, 255, 255, 0.58);
    --toc-item-hover-bg: rgba(239, 246, 255, 0.82);
    --toc-item-border: rgba(148, 163, 184, 0.24);
    --toc-border: rgba(255, 255, 255, 0.48);
    --toc-text: var(--home-text-color, #0f172a);
    --toc-accent: var(--home-accent-color, #2563eb);
    --toc-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
    --toc-slip: rgba(15, 23, 42, 0.72);
  }

  :global([data-theme='dark']) .toc-mobile-btn,
  :global([data-theme='dark']) .toc-sidebar,
  :global([data-theme='dark']) .top-navigation {
    --toc-surface: rgba(15, 23, 42, 0.82);
    --toc-surface-strong: rgba(15, 23, 42, 0.94);
    --toc-item-bg: rgba(30, 41, 59, 0.58);
    --toc-item-hover-bg: rgba(51, 65, 85, 0.78);
    --toc-item-border: rgba(148, 163, 184, 0.18);
    --toc-border: rgba(148, 163, 184, 0.2);
    --toc-text: var(--home-text-color, #e5eefb);
    --toc-accent: var(--home-accent-color, #7dd3fc);
    --toc-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    --toc-slip: rgba(226, 232, 240, 0.82);
  }

  :global(html[data-background-preset^='paper-']) :is(.toc-mobile-btn, .toc-sidebar, .top-navigation) {
    --toc-surface: rgb(var(--card-bg-rgb) / calc(var(--card-bg-opacity, 0.9) * 0.88));
    --toc-surface-strong: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    --toc-item-bg: color-mix(in srgb, var(--home-accent-color) 8%, rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9)));
    --toc-item-hover-bg: color-mix(in srgb, var(--home-accent-color) 14%, rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9)));
    --toc-item-border: color-mix(in srgb, var(--home-accent-color) 20%, transparent);
    --toc-border: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    --toc-accent: var(--home-accent-color);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :global(html[data-theme='dark'][data-background-preset^='paper-']) :is(.toc-mobile-btn, .toc-sidebar, .top-navigation) {
    --toc-surface: rgb(var(--card-bg-rgb) / calc(var(--card-bg-opacity, 0.9) * 0.88));
    --toc-surface-strong: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    --toc-item-bg: color-mix(in srgb, var(--home-accent-color) 8%, rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9)));
    --toc-item-hover-bg: color-mix(in srgb, var(--home-accent-color) 14%, rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9)));
    --toc-item-border: color-mix(in srgb, var(--home-accent-color) 18%, transparent);
    --toc-border: color-mix(in srgb, var(--home-accent-color) 22%, transparent);
    --toc-accent: var(--home-accent-color);
  }

  .top-navigation {
    position: fixed;
    top: 12px;
    left: 50%;
    z-index: 60;
    transform: translateX(-50%);
    box-sizing: border-box;
    width: calc(100% - 32px);
    max-width: var(--content-max-width, 1200px);
    height: 52px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--toc-border);
    border-radius: 12px;
    padding: 5px;
    background: var(--toc-surface);
    box-shadow: var(--toc-shadow);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .top-track {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    scroll-behavior: smooth;
    cursor: grab;
    touch-action: pan-x;
    user-select: none;
  }

  .top-track::-webkit-scrollbar {
    display: none;
  }

  .top-track.dragging {
    cursor: grabbing;
    scroll-behavior: auto;
  }

  .top-item-group {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    border: 1px solid transparent;
    border-radius: 8px;
  }

  .top-item-group:focus-within,
  .top-item-group:hover {
    border-color: var(--toc-item-border);
    background: var(--toc-item-bg);
  }

  .top-item {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 0;
    border-radius: 8px;
    padding: 0 12px;
    background: transparent;
    color: var(--toc-text);
    font: inherit;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
  }

  .top-item:hover,
  .top-item:focus-visible {
    background: transparent;
    outline: none;
  }

  .top-item.active {
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
  }

  .top-item small {
    color: inherit;
    opacity: 0.62;
    font-size: 11px;
  }

  .top-submenu-toggle {
    width: 30px;
    min-height: 32px;
    margin-right: 3px;
    border: 0;
    border-left: 1px solid var(--toc-item-border);
    border-radius: 0 6px 6px 0;
    background: transparent;
    color: var(--toc-text);
    cursor: pointer;
  }

  .top-submenu-toggle:hover,
  .top-submenu-toggle:focus-visible,
  .top-submenu-toggle[aria-expanded='true'] {
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
    outline: none;
  }

  .top-submenu {
    position: absolute;
    z-index: 80;
    box-sizing: border-box;
    width: 220px;
    max-height: min(360px, calc(100vh - 80px));
    display: grid;
    gap: 4px;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--toc-border);
    border-radius: 8px;
    background: var(--toc-surface-strong);
    box-shadow: var(--toc-shadow);
    backdrop-filter: blur(16px);
  }

  .top-submenu button {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0 10px;
    background: transparent;
    color: var(--toc-text);
    text-align: left;
    cursor: pointer;
  }

  .top-submenu button:hover,
  .top-submenu button:focus-visible,
  .top-submenu button.active {
    border-color: var(--toc-item-border);
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
    outline: none;
  }

  .top-submenu small {
    opacity: 0.64;
  }

  .top-submenu button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scroll-arrow {
    width: 36px;
    height: 36px;
    border: 1px solid var(--toc-item-border);
    border-radius: 8px;
    background: var(--toc-item-bg);
    color: var(--toc-text);
    font: inherit;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }

  .scroll-arrow:hover:not(:disabled),
  .scroll-arrow:focus-visible {
    border-color: var(--toc-accent);
    background: var(--toc-item-hover-bg);
    outline: none;
  }

  .scroll-arrow:disabled {
    opacity: 0.32;
    cursor: default;
  }

  .scroll-arrow.hidden {
    display: none;
  }

  .toc-mobile-btn {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 40;
    width: 46px;
    height: 46px;
    border: 1px solid var(--toc-border);
    border-radius: 12px;
    background: var(--toc-surface);
    color: var(--toc-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--toc-shadow);
  }

  .toc-mobile-btn svg {
    width: 21px;
    height: 21px;
  }

  .toc-mobile-btn.hidden {
    display: none;
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    border: 0;
    padding: 0;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }

  .toc-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 50;
    box-sizing: border-box;
    width: 40px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 10px 0;
    overflow: hidden;
    border: 1px solid transparent;
    border-left: 0;
    border-radius: 0 16px 16px 0;
    background: transparent;
    transition: width 0.24s ease, background 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
  }

  .toc-sidebar.expanded {
    width: var(--toc-expanded-width, 232px);
    border-color: var(--toc-border);
    background: var(--toc-surface);
    box-shadow: var(--toc-shadow);
    backdrop-filter: blur(16px);
  }

  .toc-sidebar.mobile-hidden {
    display: none;
  }

  .toc-close-btn,
  .toc-collapse-btn {
    position: absolute;
    top: 12px;
    right: 8px;
    width: 32px;
    height: 32px;
    border: 1px solid var(--toc-item-border);
    border-radius: 8px;
    background: var(--toc-item-bg);
    color: var(--toc-text);
    font: inherit;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .toc-sidebar.persistent:not(.expanded) .toc-collapse-btn {
    right: 4px;
  }

  .toc-nav {
    width: var(--toc-expanded-width, 232px);
    max-height: calc(100dvh - 96px);
    display: grid;
    gap: 6px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .toc-group {
    display: grid;
    gap: 3px;
  }

  .toc-parent-row {
    width: calc(var(--toc-expanded-width, 232px) - 10px);
    display: flex;
    align-items: center;
  }

  .toc-item {
    width: calc(var(--toc-expanded-width, 232px) - 42px);
    min-height: 34px;
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 8px 0 0;
    background: transparent;
    color: var(--toc-text);
    cursor: pointer;
  }

  .toc-item small {
    margin-left: auto;
    opacity: 0;
    font-size: 11px;
  }

  .toc-sidebar.expanded .toc-item small {
    opacity: 0.62;
  }

  .toc-expand-button {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--toc-text);
    opacity: 0;
    cursor: pointer;
  }

  .toc-sidebar.expanded .toc-expand-button {
    opacity: 0.78;
  }

  .toc-expand-button:hover,
  .toc-expand-button:focus-visible {
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
    outline: none;
  }

  .toc-children {
    display: grid;
    gap: 3px;
    margin-left: 40px;
    padding-left: 10px;
    border-left: 1px solid var(--toc-item-border);
  }

  .toc-child-item {
    width: calc(var(--toc-expanded-width, 232px) - 60px);
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0 8px;
    background: transparent;
    color: var(--toc-text);
    text-align: left;
    cursor: pointer;
  }

  .toc-child-item:hover,
  .toc-child-item:focus-visible,
  .toc-child-item.active {
    border-color: var(--toc-item-border);
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
    outline: none;
  }

  .toc-child-item span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toc-child-item small {
    opacity: 0.62;
  }

  .toc-sidebar.expanded .toc-item:hover,
  .toc-sidebar.expanded .toc-item:focus-visible,
  .toc-sidebar.expanded .toc-item.active {
    border-color: var(--toc-item-border);
    background: var(--toc-item-hover-bg);
    outline: none;
  }

  .toc-slip {
    width: 40px;
    height: 6px;
    flex: 0 0 40px;
    margin: 12px 0;
    border-radius: 4px;
    background: var(--toc-slip);
    transform: scaleX(0.5);
    transform-origin: left center;
    transition: transform 0.2s ease, background 0.18s ease;
  }

  .toc-item:hover .toc-slip,
  .toc-item:focus-visible .toc-slip {
    transform: scaleX(1);
  }

  .toc-item.active .toc-slip {
    background: var(--toc-accent);
  }

  .toc-title {
    min-width: 0;
    overflow: hidden;
    opacity: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    transition: opacity 0.2s ease;
  }

  .toc-sidebar.expanded .toc-title {
    opacity: 1;
  }

  .toc-item.active .toc-title {
    color: var(--toc-accent);
  }

  @media (max-width: 799px) {
    .top-navigation {
      top: 8px;
      width: calc(100% - 16px);
      height: 48px;
      grid-template-columns: minmax(0, 1fr);
      padding: 4px;
    }

    .top-track {
      gap: 4px;
      cursor: auto;
      scroll-snap-type: x proximity;
      -webkit-overflow-scrolling: touch;
    }

    .top-item {
      min-height: 38px;
      padding: 0 11px;
      scroll-snap-align: center;
    }

    .scroll-arrow {
      display: none;
    }

    .toc-sidebar {
      --toc-expanded-width: min(78vw, 280px);
      width: var(--toc-expanded-width);
      padding-top: 54px;
      border-color: var(--toc-border);
      background: var(--toc-surface);
      box-shadow: var(--toc-shadow);
    }

    .toc-nav {
      max-height: calc(100dvh - 72px);
    }

    .toc-title {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .top-track,
    .toc-sidebar,
    .toc-slip,
    .toc-title {
      scroll-behavior: auto;
      transition: none;
    }
  }
</style>
