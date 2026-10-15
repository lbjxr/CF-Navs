<script lang="ts">
  interface HomeEmptyPanelProps {
    hasSearchQuery?: boolean
  }

  let { hasSearchQuery = false }: HomeEmptyPanelProps = $props()
</script>

<section class="empty-panel">
  {#if hasSearchQuery}
    <h2>没有匹配的书签</h2>
    <p>换个关键词试试，或按 Enter 使用当前搜索引擎搜索。</p>
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
