<script lang="ts">
  export let hasSearchQuery = false
  export let visibleCategoriesCount = 0
  export let visibleBookmarkCount = 0
  export let totalCategories = 0
  export let totalBookmarks = 0
</script>

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

<style>
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
