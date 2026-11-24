<svelte:options runes />

<script lang="ts">
  import BookmarkQuickAddButton from './BookmarkQuickAddButton.svelte'

  interface Props {
    hasSearchQuery?: boolean
    canSearchWeb?: boolean
    onCreateBookmark?: () => void | Promise<void>
  }

  let { hasSearchQuery = false, canSearchWeb = false, onCreateBookmark }: Props = $props()
</script>

<section class="empty-panel">
  {#if hasSearchQuery}
    <div class="empty-heading">
      <h2>没有匹配的书签</h2>
      {#if onCreateBookmark}
        <BookmarkQuickAddButton onCreate={onCreateBookmark} />
      {/if}
    </div>
    <p>{canSearchWeb ? '在搜索框按 Enter 或点「网页搜索」查找网页，也可以换个关键词筛选收藏。' : '换个关键词试试，或清空输入查看全部收藏。'}</p>
  {:else}
    <h2>暂无公开内容</h2>
    <p>当前还没有可展示的分类或书签，请稍后再来查看。</p>
  {/if}
</section>

<style>
  .empty-panel {
    padding: 2rem;
    border-radius: 1.5rem;
    border: none;
    background: transparent;
    backdrop-filter: none;
  }

  .empty-panel h2,
  .empty-panel p {
    margin: 0;
  }

  .empty-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
  }

  .empty-panel p {
    margin-top: 0.75rem;
    color: rgba(71, 85, 105, 0.92);
  }

  :global([data-theme='dark']) .empty-panel {
    border-color: transparent;
    background: transparent;
  }

  :global([data-theme='dark']) .empty-panel p {
    color: rgba(203, 213, 225, 0.92);
  }
</style>
