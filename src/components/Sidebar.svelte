<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import type { NavigationSetting } from '../../shared/types'
  import {
    getHorizontalNavigationMetrics,
    readLeftNavigationCollapsed,
    writeLeftNavigationCollapsed,
  } from '../lib/navigationLayout'

  export let items: Array<{ id: string | number; title: string; count?: number }> = []
  export let activeId: string | number | null = null
  export let navigation: NavigationSetting = { position: 'left', always_expanded: false }
  export let onNavigate: ((id: string | number) => void) | undefined = undefined
  export let onPersistentExpansionChange: ((expanded: boolean) => void) | undefined = undefined

  const MOBILE_WIDTH = 800
  const DRAG_THRESHOLD_PX = 6
  const RESIZE_DEBOUNCE_MS = 120

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
    if (isMobileView && !isTop) mobileSidebarOpen = false
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
    const activeItem = Array.from(topTrack.querySelectorAll<HTMLElement>('[data-navigation-id]'))
      .find((element) => element.dataset.navigationId === String(activeId))
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
    resizeObserver?.disconnect()
    if (resizeTimer) clearTimeout(resizeTimer)
    if (overflowFrame != null) cancelAnimationFrame(overflowFrame)
    if (clickSuppressionTimer) clearTimeout(clickSuppressionTimer)
  })
</script>

{#if isTop}
  <aside class="top-navigation" data-testid="top-navigation" aria-label="分类导航">
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
      on:scroll={updateOverflowState}
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={finishPointerDrag}
      on:pointercancel={finishPointerDrag}
    >
      {#each items as item (item.id)}
        <button
          type="button"
          class="top-item"
          class:active={activeId === item.id}
          data-navigation-id={item.id}
          aria-current={activeId === item.id ? 'location' : undefined}
          on:click={() => handleItemClick(item.id)}
        >
          <span>{item.title}</span>
          {#if item.count != null}<small>{item.count}</small>{/if}
        </button>
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
        <button
          type="button"
          class="toc-item"
          class:active={activeId === item.id}
          aria-current={activeId === item.id ? 'location' : undefined}
          on:click={() => handleItemClick(item.id)}
        >
          <span class="toc-slip"></span>
          <span class="toc-title">{item.title}</span>
        </button>
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

  .top-item {
    flex: 0 0 auto;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid transparent;
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
    border-color: var(--toc-item-border);
    background: var(--toc-item-bg);
    outline: none;
  }

  .top-item.active {
    border-color: color-mix(in srgb, var(--toc-accent) 32%, var(--toc-item-border));
    background: var(--toc-item-hover-bg);
    color: var(--toc-accent);
  }

  .top-item small {
    color: inherit;
    opacity: 0.62;
    font-size: 11px;
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
    width: 200px;
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
    width: 200px;
    max-height: calc(100dvh - 96px);
    display: grid;
    gap: 6px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .toc-item {
    width: 190px;
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
      width: 200px;
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
