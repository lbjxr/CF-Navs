<svelte:options runes />

<script lang="ts">
  import { untrack } from 'svelte'

  interface Props {
    hasSearchQuery?: boolean
    visibleCategoriesCount?: number
    visibleBookmarkCount?: number
    totalCategories?: number
    totalBookmarks?: number
    /** Read-only query identity and filter readiness supplied by Home. */
    query?: string
    settled?: boolean
    active?: boolean
    showVisual?: boolean
  }

  let {
    hasSearchQuery = false,
    visibleCategoriesCount = 0,
    visibleBookmarkCount = 0,
    totalCategories = 0,
    totalBookmarks = 0,
    query = '',
    settled = true,
    active = true,
    showVisual = true,
  }: Props = $props()

  let announcement = $state('')
  let hasSearched = false
  let lastKey = ''
  let wasActive = true
  let rebasePending = false
  let rebaseQuery = ''

  // Only the speech snapshot is local; filtering and its single 120ms timer stay in Home.
  $effect(() => {
    const snapshot = { query, settled, active, hasSearchQuery, visibleBookmarkCount, totalBookmarks }
    untrack(() => {
      if (!snapshot.active) {
        wasActive = false
        announcement = ''
        return
      }
      if (!wasActive) {
        wasActive = true
        rebasePending = true
        rebaseQuery = snapshot.query
      }
      if (!snapshot.settled) {
        announcement = ''
        return
      }
      const key = JSON.stringify([snapshot.query, snapshot.hasSearchQuery, snapshot.visibleBookmarkCount, snapshot.totalBookmarks])
      // Current native dialogs all use showModal(); consume results while their page is inert.
      if (document.querySelector('dialog[open]')) {
        lastKey = key
        hasSearched ||= snapshot.hasSearchQuery
        rebasePending = false
        announcement = ''
        return
      }
      if (rebasePending) {
        rebasePending = false
        if (snapshot.query === rebaseQuery) {
          lastKey = key
          hasSearched ||= snapshot.hasSearchQuery
          return
        }
      }
      if (!snapshot.hasSearchQuery && !hasSearched) return
      hasSearched ||= snapshot.hasSearchQuery
      if (key === lastKey) return
      lastKey = key
      announcement = snapshot.hasSearchQuery
        ? snapshot.visibleBookmarkCount === 0 ? '没有匹配的收藏。' : `找到 ${snapshot.visibleBookmarkCount} 个收藏。`
        : `已显示全部 ${snapshot.totalBookmarks} 个收藏。`
    })
  })
</script>

<!-- Always accessible, including when the visual summary is absent. -->
<p class="search-announcement" data-testid="home-search-status" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
{#if showVisual}
<div class="content-summary">
  <div>
    <p class="summary-label">当前内容</p>
    <h2>
      {#if hasSearchQuery}
        匹配 {visibleCategoriesCount} 个分类，{visibleBookmarkCount} 个站点
      {:else}
        共 {totalCategories} 个分类，{totalBookmarks} 个站点
      {/if}
    </h2>
  </div>
</div>
{/if}

<style>
  .search-announcement {
    position: absolute;
    clip-path: inset(50%);
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    white-space: nowrap;
    border: 0;
  }
  .content-summary {
    position: relative;
    overflow: hidden;
    align-self: flex-start;
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 0.36rem;
    padding: 0.28rem 0.5rem;
    border: 1px solid var(--home-stat-border);
    border-radius: 0.72rem;
    background: var(--home-stat-bg);
    box-shadow: var(--home-stat-shadow);
  }

  .content-summary::before {
    content: '';
    flex: 0 0 auto;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--home-accent-color);
    opacity: 0.86;
  }

  .content-summary > div {
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 0.36rem;
  }

  .summary-label,
  .content-summary h2 {
    margin: 0;
  }

  .summary-label {
    flex: 0 0 auto;
    font-size: 0.64rem;
    letter-spacing: 0.03em;
    color: var(--home-text-color);
    font-weight: 700;
    opacity: var(--home-muted-opacity);
  }

  .content-summary h2 {
    color: var(--home-text-color);
    font-size: 0.78rem;
    font-weight: 600;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .content-summary {
      width: 100%;
      justify-content: flex-start;
      padding: 0.28rem 0.48rem;
    }

    .summary-label {
      display: none;
    }
  }
</style>
