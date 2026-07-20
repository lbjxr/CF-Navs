<script lang="ts">
  import type { CardStyle, DescriptionDisplayMode, PublicBookmark, PublicCategory } from '../../shared/types'
  import { resolveBookmarkDescriptionMode } from '../lib/descriptionMode'
  import BookmarkCard from './BookmarkCard.svelte'
  import CategoryIcon from './CategoryIcon.svelte'
  import { getIconCardTrackWidth } from '../lib/bookmarkCardLayout'
  import { reorderByIds } from '../lib/reorder'
  import { sortableList } from '../lib/sortableList'

  type AsyncVoid<T = void> = T | Promise<T>

  export let category: PublicCategory
  export let bookmarks: PublicBookmark[] = []
  export let level: 1 | 2 = 1
  export let showEmpty = true
  export let displayTitle = ''
  export let showHeading = true
  export let inlineActions = false
  export let showCategoryIcon = true
  export let canAddBookmark = false
  export let canSort = false
  export let cardWidth = 200 // 改为 200，Sun-Panel 标准
  export let cardHeight = 0
  export let cardStyle: CardStyle = 'info'
  export let cardIconSize = 70
  export let cardShowDescription = true
  export let cardDescriptionMode: DescriptionDisplayMode = cardShowDescription ? 'always' : 'hidden'
  export let cardIconShowTitle = true
  export let onAddBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined
  export let onSortBookmarks: ((categoryId: number, orderedIds: number[]) => AsyncVoid) | undefined = undefined

  // 排序模式：先点“排序”进入，拖拽只改本地快照，点“保存”才回写。
  let sortMode = false
  let localBookmarks: PublicBookmark[] = []
  let savingSort = false

  $: displayBookmarks = sortMode ? localBookmarks : bookmarks
  $: showActions = sortMode || canAddBookmark || (canSort && bookmarks.length > 1)

  function enterSort() {
    localBookmarks = [...bookmarks]
    sortMode = true
  }

  function cancelSort() {
    sortMode = false
    localBookmarks = []
  }

  function handleReorder(orderedIds: Array<string | number>) {
    localBookmarks = reorderByIds(localBookmarks, orderedIds)
  }

  async function saveSort() {
    if (!onSortBookmarks) {
      cancelSort()
      return
    }
    savingSort = true
    try {
      await onSortBookmarks(category.id, localBookmarks.map((item) => item.id))
      sortMode = false
      localBookmarks = []
    } finally {
      savingSort = false
    }
  }

  $: sectionId = `category-${category.id}`
  $: heading = displayTitle || category.title
  $: iconGridTrackWidth = getIconCardTrackWidth(cardIconSize, cardIconShowTitle)
  $: gridMinWidth = cardStyle === 'info' ? 200 : iconGridTrackWidth // Sun-Panel 标准值
  $: mobileGridMinWidth = cardStyle === 'info' ? 150 : iconGridTrackWidth
  $: gridGap = cardStyle === 'info' ? '18px' : '22px 24px'
  $: mobileGridGap = cardStyle === 'info' ? '1rem' : '14px 16px'
  async function handleAddBookmark() {
    await onAddBookmark?.(category.id)
  }
</script>

<section class="category-section" class:child-category={level === 2} class:has-display-title={Boolean(displayTitle)} id={sectionId}>
  {#if showHeading || showActions}
    <header class="section-header" class:no-heading={!showHeading} class:inline-actions={inlineActions && !showHeading}>
      {#if showHeading}
        <div class="section-title-wrap">
          {#if showCategoryIcon && category.icon}
            <CategoryIcon category={category} size={level === 2 ? 30 : 38} className="section-icon" />
          {/if}
          <div class="section-copy">
            <div class="section-heading-row">
              <h3 title={heading}>{heading}</h3>
              <span class="section-count">共 {bookmarks.length} 个站点</span>
            </div>
          </div>
        </div>
      {/if}
      {#if showActions}
        <div class="section-actions" role="group" aria-label={`${heading} 操作`}>
          {#if sortMode}
            <button
              type="button"
              class="add-link-button ghost"
              on:click={cancelSort}
              disabled={savingSort}
              aria-label="取消排序"
              title="取消排序"
            >
              <span aria-hidden="true" class="action-symbol">×</span>
              <span class="action-label">取消排序</span>
            </button>
            <button
              type="button"
              class="add-link-button"
              on:click={saveSort}
              disabled={savingSort}
              aria-label="保存排序"
              title="保存排序"
            >
              <span aria-hidden="true" class="action-symbol">{savingSort ? '…' : '✓'}</span>
              <span class="action-label">{savingSort ? '保存中' : '保存排序'}</span>
            </button>
          {:else}
            {#if canAddBookmark}
              <button
                type="button"
                class="add-link-button"
                on:click={handleAddBookmark}
                aria-label="新增书签"
                title="新增书签"
              >
                <span aria-hidden="true" class="action-symbol">＋</span>
                <span class="action-label">新增书签</span>
              </button>
            {/if}
            {#if canSort && bookmarks.length > 1}
              <button
                type="button"
                class="add-link-button ghost"
                on:click={enterSort}
                aria-label="排序"
                title="排序"
              >
                <span aria-hidden="true" class="action-symbol">↕</span>
                <span class="action-label">排序</span>
              </button>
            {/if}
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  {#if bookmarks.length > 0}
    <div
      class="bookmark-grid"
      class:is-sorting={sortMode}
      class:is-icon-grid={cardStyle !== 'info'}
      style="--card-min-width: {gridMinWidth}px; --mobile-card-min-width: {mobileGridMinWidth}px; --bookmark-grid-gap: {gridGap}; --mobile-bookmark-grid-gap: {mobileGridGap};"
      use:sortableList={{
        enabled: sortMode,
        onSort: handleReorder,
      }}
    >
      {#each displayBookmarks as bookmark (bookmark.id)}
        <div class="bookmark-grid-item" data-sortable-item data-sort-id={bookmark.id}>
          <BookmarkCard
            {bookmark}
            style={cardStyle}
            iconSize={cardIconSize}
            showDescription={resolveBookmarkDescriptionMode(bookmark, cardDescriptionMode) !== 'hidden'}
            descriptionMode={resolveBookmarkDescriptionMode(bookmark, cardDescriptionMode)}
            showIconTitle={cardIconShowTitle}
            width={cardWidth}
            height={cardHeight}
            canEdit={Boolean(onEditBookmark)}
            sortMode={sortMode}
            onEdit={onEditBookmark}
          />
        </div>
      {/each}
    </div>
    {#if sortMode}
      <p class="sort-hint">拖动卡片调整顺序，完成后点击「保存排序」。</p>
    {/if}
  {:else if showEmpty}
    <div class="empty-card">这个分类下暂时还没有可展示的书签。</div>
  {/if}
</section>

<style>
  .category-section {
    display: flex;
    flex-direction: column;
    gap: 0.82rem;
    scroll-margin-top: 1.5rem;
  }

  .category-section.child-category {
    gap: 0.68rem;
  }

  .category-section.has-display-title .section-heading-row h3 {
    font-size: 0.92rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .section-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem 0.75rem;
  }

  .section-header.no-heading {
    display: flex;
    justify-content: flex-end;
  }

  .section-header.no-heading.inline-actions {
    position: absolute;
    top: 0.12rem;
    right: 0;
    z-index: 2;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 0.68rem;
    min-width: 0;
  }

  .section-copy {
    min-width: 0;
  }

  .section-title-wrap h3 {
    margin: 0;
  }

  .section-heading-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .section-heading-row h3 {
    min-width: 0;
    flex: 1 1 auto;
    color: var(--home-text-color, currentColor);
    font-size: 1.02rem;
    font-weight: 650;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section-count {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 1.2rem;
    padding: 0.12rem 0.42rem;
    border: 1px solid var(--home-stat-border, rgba(148, 163, 184, 0.24));
    border-radius: 999px;
    background: var(--home-stat-chip-bg, rgba(255, 255, 255, 0.34));
    color: var(--home-text-color, currentColor);
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity, 0.72);
    white-space: nowrap;
  }

  .section-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    flex: 0 0 auto;
  }

  .section-actions .action-symbol {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1;
  }

  .section-actions .action-label {
    white-space: nowrap;
  }

  .section-title-wrap :global(.section-icon) {
    width: 38px;
    height: 38px;
    min-width: 38px;
    border-radius: 10px;
  }

  .category-section.child-category .section-title-wrap :global(.section-icon) {
    width: 30px;
    height: 30px;
    min-width: 30px;
    border-radius: 8px;
  }

  .section-title-wrap h3 {
    margin: 0;
  }

  .add-link-button {
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 0.65rem;
    min-height: 2.1rem;
    padding: 0.36rem 0.68rem;
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.72)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.34))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.44));
    color: var(--card-text-color, currentColor);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 2px 8px rgba(15, 23, 42, 0.07);
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.34rem;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }

  .add-link-button.ghost {
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.48)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.2))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.32));
    color: var(--card-text-color, currentColor);
  }

  .add-link-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.62);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.54),
      0 5px 14px rgba(15, 23, 42, 0.09);
    transform: translateY(-1px);
  }

  .add-link-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .sort-hint {
    margin: 0;
    color: var(--home-text-color, #64748b);
    opacity: 0.78;
    font-size: 0.85rem;
  }

  .bookmark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 200px), 1fr));
    gap: var(--bookmark-grid-gap, 18px);
    justify-content: start;
    align-items: start;
  }

  .bookmark-grid.is-icon-grid {
    grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 72px), var(--card-min-width, 72px)));
  }

  .bookmark-grid.is-icon-grid .bookmark-grid-item {
    justify-content: center;
    align-items: flex-start;
  }

  .bookmark-grid-item {
    min-width: 0;
    display: flex;
  }

  /* 排序模式下让卡片显示可拖拽光标，并抑制点击跳转态 */
  .bookmark-grid.is-sorting .bookmark-grid-item {
    cursor: move;
  }

  /* 拖拽占位与镜像样式，稳定占位、抑制抖动 */
  .bookmark-grid :global(.sortable-ghost) {
    opacity: 0.35;
  }

  .bookmark-grid :global(.sortable-chosen) {
    cursor: move;
  }

  .bookmark-grid :global(.sortable-drag) {
    opacity: 0.9;
  }

  /* 移动端响应式 */
  @media (max-width: 500px) {
    .bookmark-grid {
      grid-template-columns: repeat(auto-fill, minmax(var(--mobile-card-min-width, 150px), 1fr));
      gap: var(--mobile-bookmark-grid-gap, 1rem);
    }

    .bookmark-grid.is-icon-grid {
      grid-template-columns: repeat(auto-fill, minmax(var(--mobile-card-min-width, 72px), var(--mobile-card-min-width, 72px)));
    }
  }

  .empty-card {
    padding: 1rem 1.1rem;
    border-radius: 1rem;
    border: 1px dashed var(--home-stat-border, rgba(148, 163, 184, 0.4));
    color: var(--home-text-color, #64748b);
    opacity: 0.85;
    background: var(--home-stat-chip-bg, rgba(255, 255, 255, 0.45));
  }

  /* 暗色主题 */
  :global([data-theme='dark']) .add-link-button {
    border-color: rgba(148, 163, 184, 0.26);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.16)), rgb(2 6 23 / calc(var(--card-bg-opacity, 0.9) * 0.4))),
      rgb(15 23 42 / calc(var(--card-bg-opacity, 0.9) * 0.55));
    color: var(--card-text-color, currentColor);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 3px 10px rgba(0, 0, 0, 0.24);
  }

  :global([data-theme='dark']) .add-link-button.ghost {
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.1)), rgb(2 6 23 / calc(var(--card-bg-opacity, 0.9) * 0.3))),
      rgb(15 23 42 / calc(var(--card-bg-opacity, 0.9) * 0.4));
  }

  :global([data-theme='dark']) .add-link-button:hover:not(:disabled) {
    border-color: rgba(125, 211, 252, 0.36);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 6px 16px rgba(0, 0, 0, 0.28);
  }

  :global([data-theme='dark']) .section-count {
    color: var(--home-text-color, #e5eefb);
  }

  :global([data-theme='dark']) .empty-card {
    border-color: rgba(148, 163, 184, 0.32);
    color: rgba(148, 163, 184, 0.9);
    background: rgba(30, 41, 59, 0.5);
  }

  @media (max-width: 720px) {
    .section-header {
      gap: 0.5rem 0.65rem;
    }

    .section-title-wrap {
      gap: 0.56rem;
    }

    .section-heading-row {
      gap: 0.38rem;
    }

    .section-heading-row h3 {
      font-size: 0.96rem;
    }

    .section-count {
      padding: 0.1rem 0.34rem;
      font-size: 0.64rem;
    }

    .add-link-button {
      width: 1.9rem;
      height: 1.9rem;
      min-height: 1.9rem;
      padding: 0;
      border-radius: 0.58rem;
    }

    .section-actions .action-label {
      display: none;
    }

    .section-actions {
      gap: 0.28rem;
    }
  }
</style>
