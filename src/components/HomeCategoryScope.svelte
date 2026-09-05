<script lang="ts">
  import { tick } from 'svelte'
  import { getAnchoredOverlayPosition } from '../lib/navigationLayout'
  import CategoryIcon from './CategoryIcon.svelte'

  type HomeCategoryScopeItem = {
    id: number
    title: string
    icon: string | null
    count: number
  }

  type AsyncVoid<T = void> = T | Promise<T>

  export let rootId: number
  export let title = ''
  export let icon: string | null = null
  export let directCount = 0
  export let totalCount = 0
  export let children: HomeCategoryScopeItem[] = []
  export let activeId: number | null = null
  export let panelId = ''
  export let reserveActions = false
  export let onSelect: ((id: number) => AsyncVoid) | undefined = undefined
  export let onCreateSubcategory: (() => AsyncVoid) | undefined = undefined
  /** 移动端把这两个操作也收进「更多操作」菜单；桌面端它们仍由 CategorySection 的操作行提供。 */
  export let onAddBookmark: (() => AsyncVoid) | undefined = undefined
  export let onRequestSort: (() => AsyncVoid) | undefined = undefined
  export let highlightedId: number | null = null

  let tabList: HTMLElement | null = null

  $: resolvedPanelId = panelId || `home-category-panel-${rootId}`
  $: rootTabId = `home-category-tab-${rootId}`
  $: rootActive = activeId == null || String(activeId) === String(rootId)
  function select(id: number): void {
    void onSelect?.(id)
  }

  // 移动端把分类操作、新增书签、排序三个入口统一收进「更多操作」菜单（计划 T6 / PROB-11）。
  // 桌面端「新建子分类」仍是直显按钮，另两个仍在 CategorySection 的操作行里；两处都渲染，
  // 由 720px 断点的 CSS 决定谁可见——`display: none` 会同时移出无障碍树，不会出现重复操作。
  let moreTrigger: HTMLButtonElement | null = null
  let moreMenu: HTMLElement | null = null
  let moreOpen = false
  let moreMenuStyle = ''

  $: moreMenuId = `home-category-more-${rootId}`
  $: hasMoreActions = Boolean(onAddBookmark || onCreateSubcategory || onRequestSort)
  // 菜单收起时若可用操作被撤掉（例如进入排序会话），避免留下指向已消失菜单的展开态
  $: if (!hasMoreActions && moreOpen) moreOpen = false

  // 这个触发器紧跟标题，不靠右对齐：移动端 `.scope-title-row` 会换行，标题短的分类里它离
  // 视口左边只有 100 px 出头。菜单原先固定 `right: 0`，160 px 的最小宽度直接把左边缘顶到
  // 负坐标（实测「AI服务」在 390 px 视口下 left = -12）。改为按锚点算位置再夹进视口，
  // 与顶部导航子菜单共用 `getAnchoredOverlayPosition`。
  async function toggleMore(): Promise<void> {
    if (moreOpen) {
      closeMore()
      return
    }
    moreOpen = true
    // 菜单宽度由内容决定（`min-width` 到 `max-width` 之间），只能等它进 DOM 再量
    await tick()
    positionMoreMenu()
  }

  function positionMoreMenu(): void {
    if (!moreOpen || !moreTrigger || !moreMenu) return

    const host = moreTrigger.parentElement
    if (!host) return

    const anchor = moreTrigger.getBoundingClientRect()
    const { left } = getAnchoredOverlayPosition({
      anchorLeft: anchor.left,
      anchorRight: anchor.right,
      anchorBottom: anchor.bottom,
      overlayWidth: moreMenu.offsetWidth,
      viewportWidth: window.innerWidth,
    })

    // 菜单是 `.scope-more`（position: relative）内的绝对定位元素，换算成相对偏移后
    // 它仍跟随页面滚动，不需要额外的滚动监听。
    moreMenuStyle = `left: ${Math.round(left - host.getBoundingClientRect().left)}px; right: auto;`
  }

  function handleWindowResize(): void {
    if (moreOpen) positionMoreMenu()
  }

  function closeMore(focusTrigger = false): void {
    moreOpen = false
    if (focusTrigger) moreTrigger?.focus()
  }

  function runCreateSubcategory(): void {
    closeMore()
    void onCreateSubcategory?.()
  }

  function runAddBookmark(): void {
    closeMore()
    void onAddBookmark?.()
  }

  function runRequestSort(): void {
    closeMore()
    void onRequestSort?.()
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    if (!moreOpen) return
    const target = event.target as Node | null
    if (target && (moreTrigger?.contains(target) || moreMenu?.contains(target))) return
    closeMore()
  }

  function handleWindowKeyDown(event: KeyboardEvent): void {
    if (!moreOpen || event.key !== 'Escape') return
    event.preventDefault()
    closeMore(true)
  }

  function handleTabWheel(event: WheelEvent): void {
    const element = event.currentTarget as HTMLElement
    if (element.scrollWidth <= element.clientWidth) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    const maxScrollLeft = element.scrollWidth - element.clientWidth
    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, element.scrollLeft + delta))
    if (nextScrollLeft === element.scrollLeft) return
    event.preventDefault()
    element.scrollLeft = nextScrollLeft
  }
  function handleTabKeyDown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

    const tabs = Array.from(tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    if (tabs.length === 0) return

    event.preventDefault()
    const currentIndex = Math.max(0, tabs.indexOf(document.activeElement as HTMLButtonElement))
    let nextIndex = currentIndex

    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else nextIndex = (currentIndex + 1) % tabs.length

    tabs[nextIndex]?.focus()
    tabs[nextIndex]?.click()
  }
</script>

<svelte:window on:pointerdown={handleWindowPointerDown} on:keydown={handleWindowKeyDown} on:resize={handleWindowResize} />
<section class="category-scope" class:has-children={children.length > 0} class:has-actions={reserveActions} class:highlighted={highlightedId === rootId} data-home-category-scope={rootId} aria-labelledby={`home-category-heading-${rootId}`}>
  <div class="scope-heading">
    <CategoryIcon category={{ id: rootId, title, icon }} size="var(--category-root-icon-size, 40px)" className="scope-icon" />
    <div class="scope-accent" aria-hidden="true"></div>
    <div class="scope-copy">
      <div class="scope-title-row">
        <h2 id={`home-category-heading-${rootId}`} title={title}>
          {title}<span class="scope-total-count">（{totalCount}）</span>
        </h2>
        {#if reserveActions && onCreateSubcategory}
          <!-- 桌面直显按钮：只有「新建子分类」；新增书签与排序在 CategorySection 的操作行里 -->
          <button
            type="button"
            class="scope-action scope-action-direct"
            aria-label="新建子分类"
            title="新建子分类"
            on:click={() => void onCreateSubcategory?.()}
          >
            <span class="scope-action-label">新建子分类</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" class="scope-action-icon">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3" />
              <path d="M3 7v10a2 2 0 0 0 2 2h6" />
              <path d="M16 15h6M19 12v6" />
            </svg>
          </button>
        {/if}
        {#if reserveActions && hasMoreActions}
          <div class="scope-more">
            <button
              type="button"
              class="scope-action scope-more-trigger"
              bind:this={moreTrigger}
              aria-label={`${title || '分类'} 更多操作`}
              title="更多操作"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-controls={moreMenuId}
              on:click={() => void toggleMore()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="scope-action-icon">
                <path d="M6 12h.01M12 12h.01M18 12h.01" />
              </svg>
            </button>
            {#if moreOpen}
              <div
                class="scope-more-menu"
                id={moreMenuId}
                role="menu"
                aria-label={`${title || '分类'} 更多操作`}
                style={moreMenuStyle}
                bind:this={moreMenu}
              >
                {#if onAddBookmark}
                  <button type="button" class="scope-more-item" role="menuitem" on:click={runAddBookmark}>
                    新增书签
                  </button>
                {/if}
                {#if onCreateSubcategory}
                  <button type="button" class="scope-more-item" role="menuitem" on:click={runCreateSubcategory}>
                    新建子分类
                  </button>
                {/if}
                {#if onRequestSort}
                  <button type="button" class="scope-more-item" role="menuitem" on:click={runRequestSort}>
                    排序
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
        {#if children.length > 0}
          <div
            class="scope-tabs"
            role="tablist"
            aria-label={`${title} 分类范围`}
            tabindex="-1"
            bind:this={tabList}
            on:keydown={handleTabKeyDown}
            on:wheel={handleTabWheel}
          >
            <button
              id={rootTabId}
              type="button"
              role="tab"
              aria-selected={rootActive}
              aria-controls={resolvedPanelId}
              tabindex={rootActive ? 0 : -1}
              class:active={rootActive}
              on:click={() => select(rootId)}
            >
              <span>本分类</span>
              <small>{directCount}</small>
            </button>

            {#each children as child (child.id)}
              {@const childActive = String(activeId) === String(child.id)}
              <button
                id={`home-category-tab-${child.id}`}
                role="tab"
                aria-selected={childActive}
                aria-controls={resolvedPanelId}
                tabindex={childActive ? 0 : -1}
                class:active={childActive}
                title={child.title}
                on:click={() => select(child.id)}
              >
                {#if child.icon}
                  <CategoryIcon category={{ id: child.id, title: child.title, icon: child.icon }} size="var(--category-child-icon-size, 22px)" className="scope-tab-icon" />
                {/if}
                <span>{child.title}</span>
                <small>{child.count}</small>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .category-scope {
    display: flex;
    flex-direction: column;
    padding: 0.15rem 0 0.78rem;
    border-bottom: 1px solid color-mix(in srgb, var(--home-text-color) 14%, transparent);
    scroll-margin-top: 6rem;
  }

  .scope-heading {
    display: flex;
    align-items: center;
    gap: 0.68rem;
    min-width: 0;
  }

  .scope-heading :global(.scope-icon) {
    width: var(--category-root-icon-size, 40px);
    height: var(--category-root-icon-size, 40px);
    border-radius: 11px;
  }

  .scope-accent {
    width: 3px;
    align-self: stretch;
    flex: 0 0 auto;
    border-radius: 2px;
    background: var(--home-accent-color);
  }

  .scope-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  .scope-title-row {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .scope-copy h2 {
    margin: 0;
  }

  .category-scope.highlighted {
    outline: 2px solid color-mix(in srgb, var(--home-accent-color) 68%, transparent);
    outline-offset: 7px;
    box-shadow: 0 0 0 7px color-mix(in srgb, var(--home-accent-color) 12%, transparent);
  }
  .scope-copy h2 {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    color: var(--home-text-color);
    font-size: var(--category-root-font-size, 1.35rem);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-scope.has-children .scope-copy h2 {
    flex-shrink: 0;
    max-width: min(52%, 24rem);
  }

  .scope-total-count {
    margin-left: 0.16rem;
    font-size: 0.72em;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity);
  }
  .scope-action {
    display: inline-flex;
    flex: 0 0 auto;
    min-height: 34px;
    align-items: center;
    gap: 4px;
    padding: 0.34rem 0.62rem;
    border: 1px solid var(--home-stat-border);
    border-radius: 7px;
    background: var(--home-stat-bg);
    color: var(--home-text-color);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .scope-action-icon {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .scope-more {
    position: relative;
    display: none;
    flex: 0 0 auto;
  }

  .scope-more-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 10rem;
    max-width: min(16rem, calc(100vw - 2rem));
    padding: 4px;
    border: 1px solid var(--home-stat-border);
    border-radius: 10px;
    background: var(--home-stat-bg);
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  }

  .scope-more-item {
    display: block;
    width: 100%;
    min-height: 40px;
    padding: 0.42rem 0.62rem;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--home-text-color);
    font: inherit;
    font-size: 0.84rem;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .scope-more-item:hover,
  .scope-more-item:focus-visible {
    outline: none;
    background: var(--home-stat-border);
  }

  .scope-action:hover,
  .scope-action:focus-visible {
    outline: none;
    border-color: var(--home-accent-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--home-accent-color) 20%, transparent);
  }

  .scope-tabs {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    gap: 0.28rem;
    overflow-x: auto;
    padding: 0.02rem 0 0.16rem;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--home-text-color) 34%, transparent) transparent;
    overscroll-behavior-inline: contain;
  }

  .scope-tabs::-webkit-scrollbar {
    height: 6px;
  }

  .scope-tabs::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in srgb, var(--home-text-color) 34%, transparent);
  }

  .scope-tabs::-webkit-scrollbar-track {
    background: transparent;
  }


  .scope-tabs button {
    position: relative;
    display: inline-flex;
    min-height: 34px;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
    padding: 0.34rem 0.62rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--home-text-color, currentColor);
    font: inherit;
    font-size: var(--category-child-font-size, 0.82rem);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    opacity: 0.74;
    transition: background var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  }

  .scope-tabs button:hover {
    border-color: var(--home-stat-border);
    background: var(--home-stat-chip-bg);
    opacity: 1;
  }

  .scope-tabs button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--home-accent-color) 58%, transparent);
    outline-offset: 2px;
  }
  .scope-tabs button.active {
    border-color: color-mix(in srgb, var(--home-accent-color) 34%, var(--home-stat-border));
    background: var(--home-stat-bg);
  }

  .scope-tabs button.active::after {
    content: '';
    position: absolute;
    right: 0.65rem;
    bottom: -2px;
    left: 0.65rem;
    height: 2px;
    border-radius: 1px;
    background: var(--home-accent-color);
  }

  .scope-tabs :global(.scope-tab-icon) {
    width: var(--category-child-icon-size, 18px);
    height: var(--category-child-icon-size, 18px);
    min-width: var(--category-child-icon-size, 18px);
    border-radius: 5px;
  }

  .scope-tabs small {
    min-width: 1.2rem;
    color: inherit;
    font-size: 0.66rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    opacity: 0.68;
  }

  @media (max-width: 720px) {
    .category-scope {
      padding-bottom: 0.68rem;
    }

    .scope-heading :global(.scope-icon) {
      width: var(--category-root-icon-size, 36px);
      height: var(--category-root-icon-size, 36px);
    }

    .scope-copy h2 {
      max-width: calc(100% - 5.5rem);
      font-size: var(--category-root-font-size, 1.16rem);
    }

    .category-scope.has-children .scope-copy h2 {
      max-width: 100%;
    }

    .category-scope.has-actions .scope-copy h2 {
      max-width: calc(100% - 4.6rem);
    }

    .scope-title-row {
      flex-wrap: wrap;
      gap: 0.46rem 0.58rem;
    }

    .category-scope.has-actions .scope-title-row {
      padding-right: 0;
      row-gap: 0.75rem;
    }

    .scope-tabs {
      order: 3;
      flex-basis: 100%;
      margin-right: -1rem;
      padding-right: 1rem;
      scrollbar-width: none;
    }

    .scope-tabs::-webkit-scrollbar {
      display: none;
    }

    .scope-tabs button {
      min-height: 32px;
      padding: 0.28rem 0.56rem;
      font-size: var(--category-child-font-size, 0.78rem);
    }

    .scope-action {
      width: 36px;
      min-height: 36px;
      justify-content: center;
      padding: 0;
      font-size: 0;
    }

    /* 移动端只保留「更多操作」入口，直显按钮移出无障碍树 */
    .scope-action-direct {
      display: none;
    }

    .scope-more {
      display: inline-flex;
    }

    .scope-action-label {
      display: none;
    }
  }
</style>
