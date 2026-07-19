<script lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../../lib/appData'
  import type { CategorySortHandler } from '../../lib/adminTypes'
  import {
    clampAdminListPage,
    createAdminListPage,
    createAdminSortDraft,
    getAdminCategoryBookmarkCount,
    getAdminListTotalPages,
    buildAdminCategoryGroups,
    filterAdminCategoryGroups,
    flattenAdminCategoryGroups,
    getAdminSortIds,
    reorderAdminSortDraft,
  } from '../../lib/adminListState'
  import { createIconVersion } from '../../lib/bookmarkIconDisplay'
  import { sortableList } from '../../lib/sortableList'
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
  export let onBatchDeleteCategories: ((ids: number[]) => AsyncVoid) | undefined = undefined
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onSortCategories: CategorySortHandler | undefined = undefined

  let sortMode = false
  let localCategories: AdminCategory[] = []
  let sortParentId: number | null = null
  let sortScopeTitle = '一级分类'
  let savingSort = false
  let page = 1
  let selectedIds = new Set<number>()
  let search = ''

  $: categoryGroups = buildAdminCategoryGroups(categories)
  $: filteredGroups = filterAdminCategoryGroups(categoryGroups, search)
  $: totalPages = getAdminListTotalPages(filteredGroups.length)
  $: page = clampAdminListPage(page, totalPages)
  $: categoryPage = createAdminListPage(filteredGroups, page)
  $: pagedGroups = categoryPage.items
  $: pagedCategories = flattenAdminCategoryGroups(pagedGroups)
  $: rootCategories = categoryGroups.map((group) => group.root)
  $: displayCategories = sortMode ? localCategories : []
  $: selectedIds = new Set([...selectedIds].filter((id) => categories.some((category) => Number(category.id) === id)))
  $: pageIds = pagedCategories.map((category) => Number(category.id))
  $: pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length

  function enterSort(parentId: number | null, scopeTitle: string) {
    const siblings = parentId == null
      ? rootCategories
      : categoryGroups.find((group) => Number(group.root.id) === parentId)?.children ?? []
    localCategories = createAdminSortDraft(siblings)
    sortParentId = parentId
    sortScopeTitle = scopeTitle
    search = ''
    page = 1
    sortMode = true
  }

  function togglePageSelection(event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked
    const next = new Set(selectedIds)
    pageIds.forEach((id) => checked ? next.add(id) : next.delete(id))
    selectedIds = next
  }

  function toggleCategorySelection(event: Event, id: number) {
    const next = new Set(selectedIds)
    if ((event.currentTarget as HTMLInputElement).checked) next.add(id)
    else next.delete(id)
    selectedIds = next
  }
  function handleSearchInput(event: Event) {
    search = (event.currentTarget as HTMLInputElement).value
    page = 1
  }
  function indeterminate(node: HTMLInputElement, value: boolean) { node.indeterminate = value; return { update(next: boolean) { node.indeterminate = next } } }

  function cancelSort() {
    sortMode = false
    localCategories = []
    sortParentId = null
    sortScopeTitle = '一级分类'
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
      await onSortCategories(sortParentId, getAdminSortIds(localCategories))
      cancelSort()
    } finally {
      savingSort = false
    }
  }

  function getCategoryIconUrl(category: AdminCategory): string {
    const icon = category.icon?.trim()
    if (!icon || (!/^https?:\/\//i.test(icon) && !icon.startsWith('data:image/'))) return ''

    return `/api/category-icon/${category.id}?v=${createIconVersion(`${category.id}:${icon}:${category.title}`)}`
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
        <div class="admin-title-row"><h2>分类列表</h2><div class="admin-bookmark-search-bar"><input type="text" data-testid="admin-category-search" placeholder="搜索分类…" value={search} on:input={handleSearchInput} /></div></div>
      </div>
      <div class="admin-header-actions-row">
        {#if !sortMode}
          <button
            type="button"
            class="admin-ghost-button"
            data-testid="admin-category-sort-button"
            on:click={() => enterSort(null, '一级分类')}
            disabled={!isAuthenticated || categoriesLoading || authLoading || rootCategories.length < 2 || selectedIds.size > 0}
          >
            排序
          </button>
          <button type="button" class="admin-primary-button" data-testid="admin-create-category-button" on:click={() => onOpenCreateCategory?.()} disabled={!isAuthenticated}>
            新增分类
          </button>
          <button type="button" class="admin-danger-button" on:click={() => onBatchDeleteCategories?.([...selectedIds])} disabled={!isAuthenticated || selectedIds.size === 0}>删除已选 ({selectedIds.size})</button>
          {#if selectedIds.size > 0}<button type="button" class="admin-ghost-button" on:click={() => selectedIds = new Set()}>清除选择</button>{/if}
        {/if}
      </div>
    </div>

    <div class="admin-panel-scroll-body">
      {#if categoriesLoading}
        <div class="admin-empty-state">
          <span class="admin-empty-state-icon">📁</span>
          <h3>正在加载分类…</h3>
        </div>
      {:else if categories.length === 0}
        <div class="admin-empty-state">
          <span class="admin-empty-state-icon">📁</span>
          <h3>暂无分类</h3>
          <p>点击右上角「新增分类」创建第一个分类，然后就可以往里添加书签了。</p>
          <div class="admin-empty-action">
            <button type="button" class="admin-primary-button" on:click={() => onOpenCreateCategory?.()} disabled={!isAuthenticated}>
              新增分类
            </button>
          </div>
        </div>
      {:else if filteredGroups.length === 0}
        <div class="admin-empty-state">
          <span class="admin-empty-state-icon">🔎</span>
          <h3>没有匹配的分类</h3>
          <p>请尝试其他搜索关键词。</p>
        </div>
      {:else}
        <label class="batch-select-all"><input type="checkbox" checked={pageSelectedCount === pageIds.length && pageIds.length > 0} use:indeterminate={pageSelectedCount > 0 && pageSelectedCount < pageIds.length} on:change={togglePageSelection} />全选当前页</label>
        <div
          class="admin-list-stack"
          class:is-sorting={sortMode}
          use:sortableList={{
            enabled: sortMode,
            onSort: handleReorder,
          }}
        >
          {#if sortMode}
            {#each displayCategories as category (category.id)}
              <article class="admin-compact-card sortable" data-sortable-item data-sort-id={category.id}>
                <span class="admin-drag-handle" aria-hidden="true">⋮⋮</span>
                <span class="admin-icon-badge">
                  {#if getCategoryIconUrl(category)}
                    <img src={getCategoryIconUrl(category)} alt="" loading="lazy" />
                  {:else}
                    {category.icon || '📁'}
                  {/if}
                </span>
                <div class="admin-compact-info">
                  <h3>{category.title}</h3>
                  <span class="admin-count-badge">{getAdminCategoryBookmarkCount(category, bookmarks)} 个直属书签</span>
                </div>
              </article>
            {/each}
          {:else}
            {#each pagedGroups as group (group.root.id)}
              <article class="admin-compact-card admin-root-category-card" data-category-id={group.root.id}>
                <input type="checkbox" aria-label={`选择分类 ${group.root.title}`} checked={selectedIds.has(Number(group.root.id))} on:change={(event) => toggleCategorySelection(event, Number(group.root.id))} />
                <span class="admin-icon-badge">
                  {#if getCategoryIconUrl(group.root)}
                    <img src={getCategoryIconUrl(group.root)} alt="" loading="lazy" />
                  {:else}
                    {group.root.icon || '📁'}
                  {/if}
                </span>
                <div class="admin-compact-info">
                  <h3>{group.root.title}</h3>
                  <span class="admin-count-badge">{getAdminCategoryBookmarkCount(group.root, bookmarks)} 个直属书签</span>
                  <span class="admin-count-badge">{group.children.length} 个子分类</span>
                </div>
                <div class="admin-inline-actions">
                  {#if group.children.length > 1}
                    <button type="button" class="admin-sm-button" on:click={() => enterSort(Number(group.root.id), group.root.title)} disabled={!isAuthenticated || selectedIds.size > 0}>
                      子分类排序
                    </button>
                  {/if}
                  <button type="button" class="admin-sm-button" on:click={() => onEditCategory?.(group.root)} disabled={!isAuthenticated}>编辑</button>
                  <button type="button" class="admin-sm-button" on:click={() => onOpenCreateBookmark?.(group.root.id)} disabled={!isAuthenticated}>加书签</button>
                  <button type="button" class="admin-sm-button danger" on:click={() => onDeleteCategory?.(group.root)} disabled={!isAuthenticated || deletingCategoryId === group.root.id}>
                    {#if deletingCategoryId === group.root.id}删除中...{:else}删除{/if}
                  </button>
                </div>
              </article>

              {#each group.children as category (category.id)}
                <article class="admin-compact-card admin-child-category-card" data-category-id={category.id}>
                  <input type="checkbox" aria-label={`选择分类 ${category.title}`} checked={selectedIds.has(Number(category.id))} on:change={(event) => toggleCategorySelection(event, Number(category.id))} />
                  <span class="admin-hierarchy-connector" aria-hidden="true">↳</span>
                  <span class="admin-icon-badge">
                    {#if getCategoryIconUrl(category)}
                      <img src={getCategoryIconUrl(category)} alt="" loading="lazy" />
                    {:else}
                      {category.icon || '📁'}
                    {/if}
                  </span>
                  <div class="admin-compact-info">
                    <h3>{category.title}</h3>
                    <span class="admin-parent-path">{group.root.title} / {category.title}</span>
                    <span class="admin-count-badge">{getAdminCategoryBookmarkCount(category, bookmarks)} 个直属书签</span>
                  </div>
                  <div class="admin-inline-actions">
                    <button type="button" class="admin-sm-button" on:click={() => onEditCategory?.(category)} disabled={!isAuthenticated}>编辑</button>
                    <button type="button" class="admin-sm-button" on:click={() => onOpenCreateBookmark?.(category.id)} disabled={!isAuthenticated}>加书签</button>
                    <button type="button" class="admin-sm-button danger" on:click={() => onDeleteCategory?.(category)} disabled={!isAuthenticated || deletingCategoryId === category.id}>
                      {#if deletingCategoryId === category.id}删除中...{:else}删除{/if}
                    </button>
                  </div>
                </article>
              {/each}
            {/each}
          {/if}
        </div>
      {/if}
    </div>

    {#if categories.length > 0}
      <div class="admin-panel-footer">
        {#if sortMode}
          <div class="admin-sort-hint">拖动卡片调整顺序，完成后点击「保存排序」。</div>
        {:else}
          <div class="admin-pagination">
            <span>第 {categoryPage.start}-{categoryPage.end} 个 / 共 {categoryPage.total} 个一级分类</span>
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
    <span class="admin-sort-hint-inline">正在排序「{sortScopeTitle}」中的同级分类，拖动调整顺序后保存。</span>
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

  .admin-title-row { display: flex; align-items: center; gap: 14px; }

  .admin-bookmark-search-bar {
    width: min(280px, 32vw);
  }

  .admin-bookmark-search-bar input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid var(--admin-input-border);
    border-radius: 9px;
    background: var(--admin-input-bg);
    color: var(--admin-text);
    font: inherit;
  }

  .admin-bookmark-search-bar input:focus {
    outline: 2px solid color-mix(in srgb, var(--admin-accent) 32%, transparent);
    outline-offset: 1px;
  }

  @media (max-width: 760px) {
    .admin-title-row { align-items: flex-start; flex-direction: column; gap: 8px; }
    .admin-bookmark-search-bar { width: min(100%, 360px); }
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

  .admin-root-category-card {
    border-left: 3px solid color-mix(in srgb, var(--admin-accent) 44%, var(--admin-card-border));
  }

  .admin-child-category-card {
    width: calc(100% - 32px);
    box-sizing: border-box;
    margin-left: 32px;
    background: color-mix(in srgb, var(--admin-card-bg) 92%, var(--admin-nav-hover-bg));
  }

  .admin-hierarchy-connector {
    flex: 0 0 auto;
    color: var(--admin-badge-text);
    font-size: 16px;
  }

  .admin-parent-path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--admin-badge-text);
    font-size: 11px;
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

  .admin-icon-badge img {
    width: 18px;
    height: 18px;
    object-fit: contain;
    display: block;
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

    .admin-child-category-card {
      width: calc(100% - 18px);
      margin-left: 18px;
    }
  }
</style>
