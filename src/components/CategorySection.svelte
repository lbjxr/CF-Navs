<script lang="ts">
  import type { CardStyle, DescriptionDisplayMode, PublicBookmark, PublicCategory } from '../../shared/types'
  import type { CategoryTreeOption } from '../lib/categorySelect'
  import { resolveBookmarkDescriptionMode } from '../lib/descriptionMode'
  import BookmarkCard from './BookmarkCard.svelte'
  import CategoryIcon from './CategoryIcon.svelte'
  import { getInfoCardMobileTrackWidth, getInfoCardTrackWidth, getIconCardTrackWidth } from '../lib/bookmarkCardLayout'
  import { sortableList, type SortTransfer } from '../lib/sortableList'

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
  /** 传入后由页面统一控制排序会话，支持多个分类列表互相拖放。 */
  export let controlledSortMode: boolean | undefined = undefined
  export let sortGroup = ''
  export let sortCategoryId: number | null = null
  export let showSortActions = true
  export let cardWidth = 200 // 改为 200，Sun-Panel 标准
  export let cardHeight = 0
  export let cardStyle: CardStyle = 'info'
  export let cardIconSize = 70
  export let cardShowDescription = true
  export let cardDescriptionMode: DescriptionDisplayMode = cardShowDescription ? 'always' : 'hidden'
  export let cardIconShowTitle = true
  export let moveCategories: CategoryTreeOption[] = []
  export let onMoveBookmark: ((bookmark: PublicBookmark, categoryId: number) => AsyncVoid) | undefined = undefined
  export let onAddBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined
  export let onRequestSort: (() => AsyncVoid) | undefined = undefined
  export let onCancelSortSession: (() => AsyncVoid) | undefined = undefined
  export let onSaveSortSession: (() => AsyncVoid) | undefined = undefined
  export let onSortDraft: ((categoryId: number, orderedIds: number[]) => AsyncVoid) | undefined = undefined
  export let onSortTransfer: ((transfer: SortTransfer) => AsyncVoid) | undefined = undefined

  // 排序会话由页面统一控制：进入后拖拽只改页面草稿，保存/取消都由页面处理。
  let savingSort = false

  $: activeSortMode = controlledSortMode ?? false
  // 跨分类拖放时单个甚至零个书签也需要入口，把书签拖出或拖入本分类。
  $: canEnterSort = canSort && controlledSortMode !== undefined
  $: showActions = activeSortMode || canAddBookmark || canEnterSort

  function handleReorder(orderedIds: Array<string | number>) {
    void onSortDraft?.(category.id, orderedIds.map(Number))
  }

  function handleTransfer(transfer: SortTransfer) {
    void onSortTransfer?.(transfer)
  }

  async function saveSort() {
    savingSort = true
    try {
      await onSaveSortSession?.()
    } finally {
      savingSort = false
    }
  }

  $: sectionId = `category-${category.id}`
  $: heading = displayTitle || category.title
  $: iconGridTrackWidth = getIconCardTrackWidth(cardIconSize, cardIconShowTitle)
  $: infoCardTrackWidth = getInfoCardTrackWidth(cardWidth)
  $: gridMinWidth = cardStyle === 'info' ? infoCardTrackWidth : iconGridTrackWidth
  $: mobileGridMinWidth = cardStyle === 'info' ? getInfoCardMobileTrackWidth(cardWidth) : iconGridTrackWidth
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
            <CategoryIcon category={category} size={level === 2 ? 'var(--category-child-icon-size, 30px)' : 'var(--category-root-icon-size, 38px)'} className="section-icon" />
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
        <div class="section-actions" class:sorting={activeSortMode} role="group" aria-label={`${heading} 操作`}>
          {#if activeSortMode && showSortActions}
            <button
              type="button"
              class="add-link-button ghost"
              on:click={() => onCancelSortSession?.()}
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
          {:else if !activeSortMode}
            {#if canAddBookmark}
              <button
                type="button"
                class="add-link-button"
                on:click={handleAddBookmark}
                aria-label="新增书签"
                title="新增书签"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" class="action-symbol action-icon">
                  <path d="M6 4h8l4 4v3" />
                  <path d="M6 4a1 1 0 0 0-1 1v15l7-4 3 1.7" />
                  <path d="M17 15v6M14 18h6" />
                </svg>
                <span class="action-label">新增书签</span>
              </button>
            {/if}
            {#if canEnterSort}
              <button
                type="button"
                class="add-link-button ghost"
                on:click={() => onRequestSort?.()}
                aria-label="排序"
                title="排序"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" class="action-symbol action-icon">
                  <path d="M8 4v16M8 4 5 7M8 4l3 3" />
                  <path d="M16 20V4M16 20l-3-3M16 20l3-3" />
                </svg>
                <span class="action-label">排序</span>
              </button>
            {/if}
          {:else}
            <span class="sort-session-label">拖动书签到其他分类</span>
          {/if}
        </div>
      {/if}
    </header>
  {/if}

  {#if bookmarks.length > 0 || activeSortMode}
    <div
      class="bookmark-grid"
      class:is-sorting={activeSortMode}
      class:is-icon-grid={cardStyle !== 'info'}
      class:is-info-grid={cardStyle === 'info'}
      data-sort-category-id={sortCategoryId ?? category.id}
      style="--card-min-width: {gridMinWidth}px; --mobile-card-min-width: {mobileGridMinWidth}px; --bookmark-grid-gap: {gridGap}; --mobile-bookmark-grid-gap: {mobileGridGap};"
      use:sortableList={{
        enabled: activeSortMode,
        onSort: handleReorder,
        filter: '.bookmark-context-menu, .category-tree-menu, .bookmark-mobile-menu-trigger',
        preventOnFilter: false,
        group: sortGroup || undefined,
        onTransfer: handleTransfer,
      }}
    >
      {#each bookmarks as bookmark (bookmark.id)}
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
            sortMode={activeSortMode}
            moveCategories={moveCategories}
            onEdit={onEditBookmark}
            onMoveBookmark={onMoveBookmark}
          />
        </div>
      {/each}
      {#if activeSortMode && bookmarks.length === 0}
        <div class="empty-sort-drop-zone">拖到这里即可移动到此分类</div>
      {/if}
    </div>
    {#if activeSortMode}
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

  .category-section.child-category .section-heading-row h3,
  .category-section.has-display-title .section-heading-row h3 {
    font-size: var(--category-child-font-size, 0.92rem);
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
    font-size: var(--category-root-font-size, 1.02rem);
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


  .section-actions .action-icon {
    width: 1.05rem;
    height: 1.05rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .section-actions .action-label {
    white-space: nowrap;
  }

  .section-title-wrap :global(.section-icon) {
    width: var(--category-root-icon-size, 38px);
    height: var(--category-root-icon-size, 38px);
    min-width: var(--category-root-icon-size, 38px);
  }

  .category-section.child-category .section-title-wrap :global(.section-icon) {
    width: var(--category-child-icon-size, 30px);
    height: var(--category-child-icon-size, 30px);
    min-width: var(--category-child-icon-size, 30px);
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
      transform var(--transition-fast),
      border-color var(--transition-fast);
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

  .sort-session-label {
    color: var(--home-text-color, #64748b);
    font-size: 0.82rem;
    font-weight: 650;
    white-space: nowrap;
  }

  .empty-sort-drop-zone {
    min-height: 92px;
    display: grid;
    place-items: center;
    border: 1px dashed var(--home-stat-border, rgba(148, 163, 184, 0.55));
    border-radius: 1rem;
    color: var(--home-text-color, #64748b);
    opacity: 0.72;
    background: var(--home-stat-chip-bg, rgba(255, 255, 255, 0.24));
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
      grid-template-columns: repeat(auto-fill, minmax(min(var(--mobile-card-min-width, 150px), 100%), 1fr));
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

    /*
     * 首页主分类区（inlineActions）在移动端把「新增书签」「排序」交给
     * HomeCategoryScope 的「更多操作」菜单承载（PROB-11），这里隐藏重复入口。
     * 排序会话中的提示文案不隐藏，否则移动端拖拽时没有任何说明。
     */
    .section-header.inline-actions .section-actions:not(.sorting) {
      display: none;
    }
  }
</style>
