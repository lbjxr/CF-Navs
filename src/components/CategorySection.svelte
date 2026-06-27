<script lang="ts">
  import type { Bookmark, Category, CardStyle } from '../../shared/types'
  import BookmarkCard from './BookmarkCard.svelte'

  type AsyncVoid<T = void> = T | Promise<T>

  export let category: Category
  export let bookmarks: Bookmark[] = []
  export let canAddBookmark = false
  export let cardWidth = 200 // 改为 200，Sun-Panel 标准
  export let cardHeight = 0
  export let cardStyle: CardStyle = 'info'
  export let cardIconSize = 70
  export let cardShowDescription = true
  export let onAddBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined

  $: sectionId = `category-${category.id}`
  $: gridMinWidth = cardStyle === 'info' ? 200 : cardIconSize // Sun-Panel 标准值

  async function handleAddBookmark() {
    await onAddBookmark?.(category.id)
  }
</script>

<section class="category-section" id={sectionId}>
  <header class="section-header">
    <div class="section-title-wrap">
      {#if category.icon}
        <img class="section-icon" src={category.icon} alt="" loading="lazy" />
      {/if}
      <div>
        <div class="section-heading-row">
          <h2>{category.title}</h2>
          {#if canAddBookmark}
            <button type="button" class="add-link-button" on:click={handleAddBookmark}>新增链接</button>
          {/if}
        </div>
        <p>共 {bookmarks.length} 个站点</p>
      </div>
    </div>
  </header>

  {#if bookmarks.length > 0}
    <div class="bookmark-grid" style="--card-min-width: {gridMinWidth}px;">
      {#each bookmarks as bookmark (bookmark.id)}
        <BookmarkCard
          {bookmark}
          style={cardStyle}
          iconSize={cardIconSize}
          showDescription={cardShowDescription}
          width={cardWidth}
          height={cardHeight}
        />
      {/each}
    </div>
  {:else}
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
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.85rem;
    object-fit: cover;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.18);
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
    border: 0;
    border-radius: 999px;
    padding: 0.45rem 0.8rem;
    background: rgba(37, 99, 235, 0.12);
    color: #1d4ed8;
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
  }

  .section-title-wrap p {
    margin-top: 0.25rem;
    color: rgba(100, 116, 139, 0.92);
    font-size: 0.9rem;
  }


  .bookmark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 200px), 1fr));
    gap: 18px;
    justify-content: start;
  }

  /* 移动端响应式 */
  @media (max-width: 500px) {
    .bookmark-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }
  }

  .empty-card {
    padding: 1rem 1.1rem;
    border-radius: 1rem;
    border: 1px dashed rgba(148, 163, 184, 0.4);
    color: rgba(100, 116, 139, 0.95);
    background: rgba(255, 255, 255, 0.45);
  }

  /* 暗色主题 */
  :global([data-theme='dark']) .section-icon {
    background: rgba(148, 163, 184, 0.16);
    border-color: rgba(148, 163, 184, 0.22);
  }

  :global([data-theme='dark']) .add-link-button {
    background: rgba(59, 130, 246, 0.22);
    color: #93c5fd;
  }

  :global([data-theme='dark']) .section-title-wrap p {
    color: rgba(148, 163, 184, 0.92);
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
