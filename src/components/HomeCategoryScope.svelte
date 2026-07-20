<script lang="ts">
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
  export let onSelect: ((id: number) => AsyncVoid) | undefined = undefined

  let tabList: HTMLElement | null = null

  $: resolvedPanelId = panelId || `home-category-panel-${rootId}`
  $: rootTabId = `home-category-tab-${rootId}`
  $: rootActive = activeId == null || String(activeId) === String(rootId)
  function select(id: number): void {
    void onSelect?.(id)
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

<section class="category-scope" data-home-category-scope={rootId} aria-labelledby={`home-category-heading-${rootId}`}>
  <div class="scope-heading">
    <CategoryIcon category={{ id: rootId, title, icon }} size={40} className="scope-icon" />
    <div class="scope-accent" aria-hidden="true"></div>
    <div class="scope-copy">
      <div class="scope-title-row">
        <h2 id={`home-category-heading-${rootId}`} title={title}>{title}</h2>
        <div class="scope-meta">
          <span>{totalCount} 个站点</span>
          {#if children.length > 0}<span>{children.length} 个子分类</span>{/if}
        </div>
      </div>
    </div>
  </div>

  {#if children.length > 0}
    <div
      class="scope-tabs"
      role="tablist"
      aria-label={`${title} 分类范围`}
      tabindex="-1"
      bind:this={tabList}
      on:keydown={handleTabKeyDown}
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
          type="button"
          role="tab"
          aria-selected={childActive}
          aria-controls={resolvedPanelId}
          tabindex={childActive ? 0 : -1}
          class:active={childActive}
          title={child.title}
          on:click={() => select(child.id)}
        >
          {#if child.icon}
            <CategoryIcon category={{ id: child.id, title: child.title, icon: child.icon }} size={22} className="scope-tab-icon" />
          {/if}
          <span>{child.title}</span>
          <small>{child.count}</small>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .category-scope {
    display: flex;
    flex-direction: column;
    gap: 0.78rem;
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
    width: 40px;
    height: 40px;
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
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .scope-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .scope-copy h2 {
    margin: 0;
  }

  .scope-copy h2 {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--home-text-color);
    font-size: 1.22rem;
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scope-meta {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    margin-left: auto;
    max-width: 100%;
  }

  .scope-meta span {
    display: inline-flex;
    align-items: center;
    min-height: 1.25rem;
    padding: 0.12rem 0.42rem;
    border: 1px solid var(--home-stat-border);
    border-radius: 999px;
    background: var(--home-stat-chip-bg);
    color: var(--home-text-color);
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity);
    white-space: nowrap;
  }

  .scope-tabs {
    display: flex;
    align-items: center;
    gap: 0.28rem;
    max-width: 100%;
    overflow-x: auto;
    padding: 0.02rem 0 0.16rem;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
  }

  .scope-tabs::-webkit-scrollbar {
    display: none;
  }

  .scope-tabs button {
    position: relative;
    display: inline-flex;
    min-height: 32px;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.58rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--home-text-color);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    opacity: 0.74;
    transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
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
    opacity: 1;
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
    width: 18px;
    height: 18px;
    min-width: 18px;
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
      gap: 0.66rem;
      padding-bottom: 0.68rem;
    }

    .scope-heading :global(.scope-icon) {
      width: 36px;
      height: 36px;
    }

    .scope-copy h2 {
      font-size: 1.08rem;
    }

    .scope-tabs {
      margin-right: -1rem;
      padding-right: 1rem;
    }

    .scope-tabs button {
      min-height: 30px;
      padding: 0.24rem 0.52rem;
      font-size: 0.74rem;
    }

    .scope-meta span {
      padding: 0.1rem 0.34rem;
      font-size: 0.64rem;
    }
  }
</style>
