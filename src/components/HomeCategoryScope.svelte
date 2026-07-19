<script lang="ts">
  type HomeCategoryScopeItem = {
    id: string | number
    title: string
    count: number
  }

  type AsyncVoid<T = void> = T | Promise<T>

  export let rootId: string | number
  export let title = ''
  export let totalCount = 0
  export let children: HomeCategoryScopeItem[] = []
  export let activeId: string | number | null = null
  export let panelId = 'home-category-panel'
  export let onSelect: ((id: string | number) => AsyncVoid) | undefined = undefined

  let tabList: HTMLElement | null = null

  $: rootTabId = `home-category-tab-${rootId}`
  $: rootActive = activeId == null || String(activeId) === String(rootId)

  function select(id: string | number): void {
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

<section class="category-scope" aria-labelledby={`home-category-heading-${rootId}`}>
  <div class="scope-heading">
    <span class="scope-accent" aria-hidden="true"></span>
    <div class="scope-copy">
      <h2 id={`home-category-heading-${rootId}`}>{title}</h2>
      <p>
        <span>{totalCount} 个站点</span>
        {#if children.length > 0}<span>{children.length} 个子分类</span>{/if}
      </p>
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
        aria-controls={panelId}
        tabindex={rootActive ? 0 : -1}
        class:active={rootActive}
        on:click={() => select(rootId)}
      >
        <span>全部</span>
        <small>{totalCount}</small>
      </button>

      {#each children as child (child.id)}
        <button
          id={`home-category-tab-${child.id}`}
          type="button"
          role="tab"
          aria-selected={String(activeId) === String(child.id)}
          aria-controls={panelId}
          tabindex={String(activeId) === String(child.id) ? 0 : -1}
          class:active={String(activeId) === String(child.id)}
          on:click={() => select(child.id)}
        >
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
    gap: 1rem;
    padding: 0.25rem 0 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--home-text-color) 14%, transparent);
  }

  .scope-heading {
    display: flex;
    align-items: stretch;
    gap: 0.8rem;
    min-width: 0;
  }

  .scope-accent {
    width: 4px;
    flex: 0 0 auto;
    border-radius: 2px;
    background: var(--home-accent-color);
  }

  .scope-copy {
    min-width: 0;
  }

  .scope-copy h2,
  .scope-copy p {
    margin: 0;
  }

  .scope-copy h2 {
    color: var(--home-text-color);
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  .scope-copy p {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.35rem;
    color: var(--home-text-color);
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity);
  }

  .scope-tabs {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    overflow-x: auto;
    padding: 0.1rem 0 0.2rem;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
  }

  .scope-tabs::-webkit-scrollbar {
    display: none;
  }

  .scope-tabs button {
    position: relative;
    display: inline-flex;
    min-height: 36px;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--home-text-color);
    font: inherit;
    font-size: 0.86rem;
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
    bottom: -3px;
    left: 0.65rem;
    height: 2px;
    border-radius: 1px;
    background: var(--home-accent-color);
  }

  .scope-tabs small {
    min-width: 1.2rem;
    color: inherit;
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    opacity: 0.68;
  }

  @media (max-width: 720px) {
    .category-scope {
      gap: 0.85rem;
      padding-bottom: 0.85rem;
    }

    .scope-copy h2 {
      font-size: 1.28rem;
    }

    .scope-tabs {
      margin-right: -1rem;
      padding-right: 1rem;
    }

    .scope-tabs button {
      min-height: 40px;
    }
  }
</style>
