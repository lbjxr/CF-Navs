<script lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../../lib/appData'
  import {
    clampAdminListPage,
    createAdminListPage,
    createAdminSortDraft,
    getAdminCategoryBookmarkCount,
    getAdminListTotalPages,
    getAdminSortIds,
    reorderAdminSortDraft,
  } from '../../lib/adminListState'
  import { sortableList, type SortHandler } from '../../lib/sortableList'
  import './adminListPanels.css'

  type AsyncVoid<T = void> = T | Promise<T>
  type AdminCategory = AdminCategorySummary
  type AdminBookmark = AdminBookmarkSummary

  export let isAuthenticated = false
  export let authLoading = false
  export let categories: AdminCategory[] = []
  export let bookmarks: AdminBookmark[] = []
  export let categoriesLoading = false
  export let deletingCategoryId: string | number | null = null
  export let onOpenCreateCategory: (() => AsyncVoid) | undefined = undefined
  export let onEditCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onDeleteCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onSortCategories: SortHandler | undefined = undefined

  let sortMode = false
  let localCategories: AdminCategory[] = []
  let savingSort = false
  let page = 1

  $: totalPages = getAdminListTotalPages(categories.length)
  $: page = clampAdminListPage(page, totalPages)
  $: categoryPage = createAdminListPage(categories, page)
  $: pagedCategories = categoryPage.items
  $: displayCategories = sortMode ? localCategories : pagedCategories

  function enterSort() {
    localCategories = createAdminSortDraft(categories)
    page = 1
    sortMode = true
  }

  function cancelSort() {
    sortMode = false
    localCategories = []
  }

  function handleReorder(orderedIds: Array<string | number>) {
    localCategories = reorderAdminSortDraft(localCategories, orderedIds)
  }

  async function saveSort() {
    if (!onSortCategories) {
      cancelSort()
      return
    }

    savingSort = true
    try {
      await onSortCategories(getAdminSortIds(localCategories))
      cancelSort()
    } finally {
      savingSort = false
    }
  }
</script>

<div class="admin-list-view">
  <section class="admin-status-panel">
    <div class="admin-status-item">
      <span class="admin-status-label">登录状态</span>
      <strong>{isAuthenticated ? '已登录' : '未登录'}</strong>
    </div>
    <div class="admin-status-item">
      <span class="admin-status-label">分类数量</span>
      <strong>{categories.length}</strong>
    </div>
    <div class="admin-status-item">
      <span class="admin-status-label">书签数量</span>
      <strong>{bookmarks.length}</strong>
    </div>
  </section>

  <section class="admin-list-panel admin-category-list-panel">
    <div class="admin-list-panel-header">
      <div>
        <p class="admin-panel-eyebrow">分类</p>
        <h2>分类列表</h2>
      </div>
      <div class="admin-header-actions-row">
        {#if !sortMode}
          <button
            type="button"
            class="admin-ghost-button"
            data-testid="admin-category-sort-button"
            on:click={enterSort}
            disabled={!isAuthenticated || categoriesLoading || authLoading || categories.length < 2}
          >
            排序
          </button>
          <button type="button" class="admin-primary-button" data-testid="admin-create-category-button" on:click={() => onOpenCreateCategory?.()} disabled={!isAuthenticated}>
            新增分类
          </button>
        {/if}
      </div>
    </div>

    <div class="admin-panel-scroll-body">
      {#if categoriesLoading}
        <div class="admin-empty-state">`n        <span class="admin-empty-state-icon">📁</span>`n        <h3>正在加载分类…</h3>`n      </div>`n    {:else if categories.length === 0}`n      <div class="admin-empty-state">`n        <span class="admin-empty-state-icon">📁</span>`n        <h3>暂无分类</h3>`n        <p>点击右上角「新增分类」创建第一个分类，然后就可以往里添加书签了。</p>`n        <div class="admin-empty-action">`n          <button type="button" class="admin-primary-button" on:click={() => onOpenCreateCategory?.()} disabled={!isAuthenticated}>`n            新增分类`n          </button>`n        </div>`n      </div>`n    {:else}
        <div
          class="admin-list-stack"
          class:is-sorting={sortMode}
          use:sortableList={{
            enabled: sortMode,
            onSort: handleReorder,
          }}
        >
          {#each displayCategories as category (category.id)}
            <article class="admin-compact-card" class:sortable={sortMode} data-sortable-item data-sort-id={category.id}>
              {#if sortMode}
                <span class="admin-drag-handle" aria-hidden="true">⋮⋮</span>
              {/if}
              <span class="admin-icon-badge">{category.icon || '📁'}</span>
              <div class="admin-compact-info">
                <h3>{category.title}</h3>
                <span class="admin-count-badge">{getAdminCategoryBookmarkCount(category, bookmarks)} 个书签</span>
              </div>
              {#if !sortMode}
                <div class="admin-inline-actions">
                  <button type="button" class="admin-sm-button" on:click={() => onEditCategory?.(category)} disabled={!isAuthenticated}>
                    编辑
                  </button>
                  <button type="button" class="admin-sm-button" on:click={() => onOpenCreateBookmark?.(category.id)} disabled={!isAuthenticated}>
                    加书签
                  </button>
                  <button
                    type="button"
                    class="admin-sm-button danger"
                    on:click={() => onDeleteCategory?.(category)}
                    disabled={!isAuthenticated || deletingCategoryId === category.id}
                  >
                    {#if deletingCategoryId === category.id}删除中...{:else}删除{/if}
                  </button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>

    {#if categories.length > 0}
      <div class="admin-panel-footer">
        {#if sortMode}
          <div class="admin-sort-hint">拖动卡片调整顺序，完成后点击「保存排序」。</div>
        {:else}
          <div class="admin-pagination">
            <span>第 {categoryPage.start}-{categoryPage.end} 条 / 共 {categoryPage.total} 条</span>
            <div class="admin-pager-actions">
              <button type="button" class="admin-ghost-button compact" on:click={() => page -= 1} disabled={page <= 1}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button type="button" class="admin-ghost-button compact" on:click={() => page += 1} disabled={page >= totalPages}>下一页</button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>
</div>

{#if sortMode}
  <div class="admin-sort-bar" role="toolbar" aria-label="排序操作">
    <span class="admin-sort-hint-inline">正在排序分类，拖动调整顺序后保存。</span>
    <button type="button" class="admin-ghost-button" on:click={cancelSort} disabled={savingSort}>取消</button>
    <button type="button" class="admin-primary-button" on:click={saveSort} disabled={savingSort}>
      {#if savingSort}保存中...{:else}保存排序{/if}
    </button>
  </div>
{/if}

<style>
  .admin-category-list-panel {
    grid-template-rows: auto minmax(0, auto) auto;
  }

  .admin-list-stack {
    display: grid;
    gap: 8px;
  }

  .admin-compact-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--admin-card-border);
    border-radius: 12px;
    background: var(--admin-card-bg);
    transition: border-color 0.15s ease;
  }

  .admin-compact-card:hover {
    border-color: var(--admin-card-hover-border);
  }

  .admin-compact-card.sortable {
    cursor: grab;
    user-select: none;
    border-color: var(--admin-sort-highlight-border);
    background: var(--admin-sort-highlight-bg);
  }

  .admin-compact-card.sortable:active {
    cursor: grabbing;
  }

  .admin-list-stack.is-sorting .admin-compact-card {
    transition: none;
  }

  .admin-compact-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .admin-compact-info h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--admin-text);
  }

  .admin-count-badge {
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--admin-badge-bg);
    color: var(--admin-badge-text);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .admin-sm-button {
    border-radius: 8px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: 0.15s ease;
    border: 1px solid var(--admin-input-border);
    background: var(--admin-card-bg);
    color: var(--admin-text);
    white-space: nowrap;
  }

  .admin-sm-button:hover:not(:disabled) {
    border-color: var(--admin-input-hover-border);
    background: var(--admin-nav-hover-bg);
  }

  .admin-sm-button.danger {
    border-color: var(--admin-danger-border);
    background: var(--admin-danger-bg);
    color: var(--admin-danger);
  }

  .admin-sm-button.danger:hover:not(:disabled) {
    background: var(--admin-danger-hover-bg);
  }

  .admin-sm-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 960px) {
    .admin-compact-card {
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px;
    }

    .admin-compact-info {
      min-width: 0;
      flex: 1 1 auto;
    }
  }
</style>
