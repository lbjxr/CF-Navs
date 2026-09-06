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
  export let totalCount = 0
  export let children: HomeCategoryScopeItem[] = []
  export let activeId: number | null = null
  export let panelId = ''
  export let reserveActions = false
  export let onSelect: ((id: number) => AsyncVoid) | undefined = undefined
  export let onCreateSubcategory: (() => AsyncVoid) | undefined = undefined
  /** 移动端把分类操作统一收进「更多操作」菜单；桌面端由 CategorySection 操作行提供。 */
  export let onAddBookmark: (() => AsyncVoid) | undefined = undefined
  export let onRequestSort: (() => AsyncVoid) | undefined = undefined
  export let highlightedId: number | null = null

  let tabList: HTMLElement | null = null

  $: resolvedPanelId = panelId || `home-category-panel-${rootId}`
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

    const tabs = Array.from(tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"], [role="button"]') ?? [])
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
<section class="category-scope" class:has-children={children.length > 0} class:has-actions={reserveActions} class:selected={rootActive} class:highlighted={highlightedId === rootId} data-home-category-scope={rootId} aria-labelledby={`home-category-heading-${rootId}`}>
  <div class="scope-heading">
    <CategoryIcon category={{ id: rootId, title, icon }} size="var(--category-root-icon-size, 40px)" className="scope-icon" />
    <div class="scope-accent" aria-hidden="true"></div>
    <div class="scope-copy">
      <div class="scope-title-row">
        <h2 id={`home-category-heading-${rootId}`} title={title}>
          <button
            type="button"
            class="scope-root-trigger"
            class:active={rootActive}
            aria-pressed={rootActive}
            aria-controls={resolvedPanelId}
            on:click={() => select(rootId)}
          >
            <span class="scope-root-title">{title}</span>
            <span class="scope-total-count">（{totalCount}）</span>
          </button>
        </h2>
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
            role={rootActive ? 'group' : 'tablist'}
            aria-label={`${title} 分类范围`}
            tabindex="-1"
            bind:this={tabList}
            on:keydown={handleTabKeyDown}
            on:wheel={handleTabWheel}
          >

            {#each children as child (child.id)}
              {@const childActive = String(activeId) === String(child.id)}
              <button
                id={`home-category-tab-${child.id}`}
                role={rootActive ? 'button' : 'tab'}
                aria-selected={!rootActive ? childActive : undefined}
                aria-controls={!rootActive ? resolvedPanelId : undefined}
                tabindex={rootActive ? 0 : childActive ? 0 : -1}
                class:active={!rootActive && childActive}
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

  .scope-root-trigger {
    position: relative;
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    align-items: baseline;
    gap: 0.12rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    appearance: none;
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .scope-root-trigger.active,
  .scope-tabs button.active {
    border-color: color-mix(in srgb, var(--home-accent-color) 34%, var(--home-stat-border));
    background: var(--home-stat-bg);
  }

  .scope-root-trigger:hover {
    border-color: var(--home-stat-border);
    background: var(--home-stat-chip-bg);
  }

  .scope-root-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--home-accent-color) 58%, transparent);
    outline-offset: 2px;
  }

  .scope-root-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: inherit;
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

  /*
   * 桌面端 CategorySection 的绝对操作行包含「新建子分类 / 新增书签 / 排序」三项，
   * 不占分类标题与子分类标签的布局空间。标签行需要预留操作行宽度，避免横向滚动
   * 到末端时最后一个子分类标签被操作按钮遮挡。
   *
   * `scroll-padding-inline-end` 同步预留区，保证键盘与程序化滚动也能停在操作行左侧。
   * 300px 按三按钮实际文案、图标、间距与安全余量收敛；修改任一按钮文案或内边距时要重新量。
   * `tests/unit/homeResponsiveLayout.test.ts` 锁住「有操作行就必须有预留」。
   */
  .category-scope.has-actions {
    --scope-actions-reserve: 300px;
  }

  .category-scope.has-actions .scope-tabs {
    padding-right: var(--scope-actions-reserve);
    scroll-padding-inline-end: var(--scope-actions-reserve);
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

  .scope-root-trigger.active::after,
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

    /* 移动端操作行整体隐藏、标签换到第二行，桌面那份预留在这里反而会留一大块空白 */
    .category-scope.has-actions .scope-tabs {
      padding-right: 1rem;
      scroll-padding-inline-end: 0;
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

    .scope-more {
      display: inline-flex;
    }
  }
</style>
