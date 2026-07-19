<script lang="ts">
  import type { CardStyle, DescriptionDisplayMode, PublicBookmark, PublicCategory } from '../../shared/types'
  import { resolveBookmarkDescriptionMode } from '../lib/descriptionMode'
  import BookmarkCard from './BookmarkCard.svelte'
  import { getIconCardTrackWidth } from '../lib/bookmarkCardLayout'
  import { createIconVersion } from '../lib/bookmarkIconDisplay'
  import { reorderByIds } from '../lib/reorder'
  import { sortableList } from '../lib/sortableList'

  type AsyncVoid<T = void> = T | Promise<T>

  export let category: PublicCategory
  export let bookmarks: PublicBookmark[] = []
  export let level: 1 | 2 = 1
  export let showEmpty = true
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

  let categoryIconFailed = false
  let categoryIconStateKey = ''

  // 排序模式：先点“排序”进入，拖拽只改本地快照，点“保存”才回写。
  let sortMode = false
  let localBookmarks: PublicBookmark[] = []
  let savingSort = false

  $: displayBookmarks = sortMode ? localBookmarks : bookmarks

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
  $: categoryIconKey = `${category.id}:${category.icon ?? ''}:${category.title}`
  $: categoryIconUrl = getCategoryIconUrl(category)
  $: hasCategoryImageIcon = Boolean(categoryIconUrl) && !categoryIconFailed
  $: iconGridTrackWidth = getIconCardTrackWidth(cardIconSize, cardIconShowTitle)
  $: gridMinWidth = cardStyle === 'info' ? 200 : iconGridTrackWidth // Sun-Panel 标准值
  $: mobileGridMinWidth = cardStyle === 'info' ? 150 : iconGridTrackWidth
  $: gridGap = cardStyle === 'info' ? '18px' : '22px 24px'
  $: mobileGridGap = cardStyle === 'info' ? '1rem' : '14px 16px'
  $: if (categoryIconKey !== categoryIconStateKey) {
    categoryIconStateKey = categoryIconKey
    categoryIconFailed = false
  }

  function getCategoryIconUrl(value: PublicCategory): string {
    const icon = value.icon ?? ''
    if (/^data:image\//i.test(icon)) return icon
    if (/^https?:\/\//i.test(icon)) {
      return `/api/category-icon/${value.id}?v=${createIconVersion(`${value.id}:${icon}:${value.title}`)}`
    }
    return ''
  }

  function handleCategoryIconError() {
    categoryIconFailed = true
  }

  async function handleAddBookmark() {
    await onAddBookmark?.(category.id)
  }
</script>

<section class="category-section" class:child-category={level === 2} id={sectionId}>
  <header class="section-header">
    <div class="section-title-wrap">
      {#if hasCategoryImageIcon}
        <img
          class="section-icon"
          src={categoryIconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          on:error={handleCategoryIconError}
        />
      {:else if category.icon}
        <span class="section-icon section-icon-text">{category.icon}</span>
      {/if}
      <div>
        <div class="section-heading-row">
          <h2>{category.title}</h2>
          {#if sortMode}
            <button type="button" class="add-link-button ghost" on:click={cancelSort} disabled={savingSort}>取消</button>
            <button type="button" class="add-link-button" on:click={saveSort} disabled={savingSort}>
              {#if savingSort}保存中...{:else}保存排序{/if}
            </button>
          {:else}
            {#if canAddBookmark}
              <button type="button" class="add-link-button" on:click={handleAddBookmark}>新增链接</button>
            {/if}
            {#if canSort && bookmarks.length > 1}
              <button type="button" class="add-link-button ghost" on:click={enterSort}>排序</button>
            {/if}
          {/if}
        </div>
        <p>{level === 1 ? '直属' : '共'} {bookmarks.length} 个站点</p>
      </div>
    </div>
  </header>

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
    gap: 1rem;
    scroll-margin-top: 1.5rem;
  }

  .category-section.child-category {
    gap: 0.85rem;
  }

  .category-section.child-category .section-title-wrap h2 {
    font-size: 1.08rem;
  }

  .category-section.child-category .section-icon {
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.65rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .section-icon {
    flex: 0 0 auto;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.85rem;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.18);
  }

  .section-icon-text {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #0f172a;
    font-size: 1.5rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-title-wrap h2,
  .section-title-wrap p {
    margin: 0;
  }

  .section-heading-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .section-title-wrap h2 {
    font-size: 1.28rem;
  }

  .add-link-button {
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    padding: 0.45rem 0.8rem;
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.72)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.3))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.42));
    color: var(--card-text-color, currentColor);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 2px 8px rgba(15, 23, 42, 0.07);
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }

  .add-link-button.ghost {
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.48)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.18))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.3));
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

  .section-title-wrap p {
    margin-top: 0.25rem;
    display: inline-flex;
    width: fit-content;
    align-items: center;
    min-height: 1.55rem;
    padding: 0.16rem 0.46rem;
    border: 1px solid var(--home-stat-border, rgba(148, 163, 184, 0.24));
    border-radius: 0.55rem;
    background: var(--home-stat-chip-bg, rgba(255, 255, 255, 0.34));
    color: var(--home-text-color, currentColor);
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity, 0.72);
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
  :global([data-theme='dark']) .section-icon {
    background: rgba(148, 163, 184, 0.16);
    border-color: rgba(148, 163, 184, 0.22);
  }

  :global([data-theme='dark']) .section-icon-text {
    color: #e5eefb;
  }

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

  :global([data-theme='dark']) .section-title-wrap p {
    color: var(--home-text-color, #e5eefb);
  }


  :global([data-theme='dark']) .empty-card {
    border-color: rgba(148, 163, 184, 0.32);
    color: rgba(148, 163, 184, 0.9);
    background: rgba(30, 41, 59, 0.5);
  }

  @media (max-width: 640px) {
    .section-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .section-heading-row {
      align-items: flex-start;
    }
  }
</style>
