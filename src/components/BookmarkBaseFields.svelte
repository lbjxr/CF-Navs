<script lang="ts">
  import type { BookmarkFormValue } from '../lib/adminTypes'

  type BookmarkCategoryOption = {
    id: string | number
    title: string
  }

  export let categoryId: string | number | undefined = undefined
  export let title = ''
  export let url = ''
  export let openMethod: BookmarkFormValue['open_method'] = 'new_tab'
  export let description = ''
  export let descriptionMode: BookmarkFormValue['description_mode'] = 'inherit'
  export let categories: BookmarkCategoryOption[] = []
  export let loading = false
</script>

<label class="field-compact">
  <span>所属分类</span>
  <select bind:value={categoryId} disabled={loading || categories.length === 0} required>
    {#if categories.length === 0}
      <option value="">暂无分类可选</option>
    {:else}
      {#each categories as category}
        <option value={category.id}>{category.title}</option>
      {/each}
    {/if}
  </select>
</label>

<label class="field-compact">
  <span>书签标题</span>
  <input bind:value={title} type="text" placeholder="例如：Svelte 官方网站" required />
</label>

<label class="field-compact">
  <span>链接地址</span>
  <input bind:value={url} type="url" placeholder="https://example.com" required />
</label>

<label class="field-compact">
  <span>打开方式</span>
  <select bind:value={openMethod}>
    <option value="new_tab">新标签页</option>
    <option value="same_tab">当前标签页</option>
    <option value="modal">当前页弹层</option>
  </select>
</label>

<label class="field-wide">
  <span>描述</span>
  <textarea bind:value={description} rows="3" placeholder="补充说明，可选"></textarea>
</label>

<label class="field-compact">
  <span>描述显示</span>
  <select bind:value={descriptionMode}>
    <option value="inherit">跟随全局</option>
    <option value="always">始终显示</option>
    <option value="hover">悬停显示</option>
    <option value="hidden">隐藏</option>
  </select>
</label>

<style>
  label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .field-wide {
    grid-column: 1 / -1;
  }

  .field-compact {
    grid-column: span 1;
  }

  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 48px;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  select:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 500px) {
    .field-compact,
    .field-wide {
      grid-column: 1 / -1;
    }
  }
</style>
