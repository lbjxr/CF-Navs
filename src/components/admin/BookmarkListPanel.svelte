<script lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../../lib/appData'
  import {
    clampAdminListPage,
    createAdminListPage,
    createAdminSortDraft,
    filterAdminBookmarks,
    getAdminCategoryTitle,
    getAdminListTotalPages,
    getAdminSortIds,
    cycleAdminBookmarkSort,
    sortAdminBookmarks,
    type AdminBookmarkSortField,
    type AdminBookmarkSortState,
    reorderAdminSortDraft,
  } from '../../lib/adminListState'
  import { getBookmarkFallbackIcon, getBookmarkIconUrl, hasBookmarkImageIcon } from '../../lib/bookmarkIconDisplay'
  import { sortableList, type SortHandler } from '../../lib/sortableList'
  import CachedBookmarkIcon from '../CachedBookmarkIcon.svelte'
  import './adminListPanels.css'

  type AsyncVoid<T = void> = T | Promise<T>
  type AdminCategory = AdminCategorySummary
  type AdminBookmark = AdminBookmarkSummary

  export let isAuthenticated = false
  export let authLoading = false
  export let categories: AdminCategory[] = []
  export let bookmarks: AdminBookmark[] = []
  export let bookmarksLoading = false
  export let deletingBookmarkId: string | number | null = null
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onDeleteBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onBatchDeleteBookmarks: ((ids: number[]) => AsyncVoid) | undefined = undefined
  export let onSortBookmarks: SortHandler | undefined = undefined

  let sortMode = false
  let localBookmarks: AdminBookmark[] = []
  let savingSort = false
  let page = 1
  let search = ''
  let selectedIds = new Set<number>()
  let sortField: AdminBookmarkSortField | null = null
  let sortDirection: AdminBookmarkSortState['direction'] = null
  const sortColumns: Array<{ field: AdminBookmarkSortField; label: string }> = [
    { field: 'title', label: '标题' }, { field: 'url', label: '链接' }, { field: 'category', label: '分类' }, { field: 'open_method', label: '打开方式' },
  ]

  $: filteredBookmarks = sortAdminBookmarks(filterAdminBookmarks(bookmarks, categories, search), { field: sortField, direction: sortDirection }, categories)
  $: totalPages = getAdminListTotalPages(filteredBookmarks.length)
  $: page = clampAdminListPage(page, totalPages)
  $: bookmarkPage = createAdminListPage(filteredBookmarks, page)
  $: pagedBookmarks = bookmarkPage.items
  $: displayBookmarks = sortMode ? localBookmarks : pagedBookmarks
  $: selectedIds = new Set([...selectedIds].filter((id) => bookmarks.some((bookmark) => Number(bookmark.id) === id)))
  $: pageIds = pagedBookmarks.map((bookmark) => Number(bookmark.id))
  $: pageSelectedCount = pageIds.filter((id) => selectedIds.has(id)).length

  const getCategoryTitle = (categoryId: string | number) =>
    getAdminCategoryTitle(categories, categoryId)

  function enterSort() {
    sortField = null
    sortDirection = null
    search = ''
    page = 1
    localBookmarks = createAdminSortDraft(bookmarks)
    sortMode = true
  }

  function toggleField(field: AdminBookmarkSortField) {
    const next = cycleAdminBookmarkSort({ field: sortField, direction: sortDirection }, field)
    sortField = next.field
    sortDirection = next.direction
    page = 1
  }

  function sortButtonLabel(field: AdminBookmarkSortField, label: string): string {
    if (sortField !== field || sortDirection === null) return `${label}，当前未排序，点击按正序排列`
    return sortDirection === 'asc' ? `${label}，当前正序，点击按倒序排列` : `${label}，当前倒序，点击取消排序`
  }

  function togglePageSelection(event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked
    const next = new Set(selectedIds)
    pageIds.forEach((id) => checked ? next.add(id) : next.delete(id))
    selectedIds = next
  }

  function toggleBookmarkSelection(event: Event, id: number) {
    const next = new Set(selectedIds)
    if ((event.currentTarget as HTMLInputElement).checked) next.add(id)
    else next.delete(id)
    selectedIds = next
  }
  function indeterminate(node: HTMLInputElement, value: boolean) { node.indeterminate = value; return { update(next: boolean) { node.indeterminate = next } } }

  function cancelSort() {
    sortMode = false
    localBookmarks = []
  }

  function handleReorder(orderedIds: Array<string | number>) {
    localBookmarks = reorderAdminSortDraft(localBookmarks, orderedIds)
  }

  async function saveSort() {
    if (!onSortBookmarks) {
      cancelSort()
      return
    }

    savingSort = true
    try {
      await onSortBookmarks(getAdminSortIds(localBookmarks))
      cancelSort()
    } finally {
      savingSort = false
    }
  }

  function handleSearchInput(event: Event) {
    search = (event.currentTarget as HTMLInputElement).value
    page = 1
  }
</script>

<div class="admin-list-view">
  <section class="admin-list-panel admin-bookmark-list-panel">
    <div class="admin-list-panel-header">
      <div>
        <p class="admin-panel-eyebrow">书签</p>
        <div class="admin-title-row"><h2>书签列表</h2><div class="admin-bookmark-search-bar"><input type="text" data-testid="admin-bookmark-search" placeholder="搜索标题、链接或分类…" value={search} on:input={handleSearchInput} /></div></div>
      </div>
      <div class="admin-header-actions-row">
        <button
          type="button"
          class="admin-ghost-button"
          on:click={enterSort}
          disabled={sortMode || !isAuthenticated || bookmarksLoading || authLoading || bookmarks.length < 2 || selectedIds.size > 0}
        >
          排序
        </button>
        <button type="button" class="admin-danger-button" on:click={() => onBatchDeleteBookmarks?.([...selectedIds])} disabled={!isAuthenticated || selectedIds.size === 0}>删除已选 ({selectedIds.size})</button>
        {#if selectedIds.size > 0}<button type="button" class="admin-ghost-button" on:click={() => selectedIds = new Set()}>清除选择</button>{/if}
        <button
          type="button"
          class="admin-primary-button"
          on:click={() => onOpenCreateBookmark?.()}
          disabled={sortMode || !isAuthenticated || categories.length === 0}
        >
          新增书签
        </button>
      </div>
    </div>

    <div class="admin-panel-scroll-body admin-table-scroll-body">
      {#if bookmarksLoading}
        <div class="admin-empty-state">
          <span class="admin-empty-state-icon">📑</span>
          <h3>正在加载书签…</h3>
        </div>
      {:else if bookmarks.length === 0}
        <div class="admin-empty-state">
          <span class="admin-empty-state-icon">📑</span>
          <h3>暂无书签</h3>
          {#if categories.length === 0}
            <p>请先在分类面板中创建至少一个分类，再添加书签。</p>
          {:else}
            <p>点击右上角「新增书签」开始添加第一个书签。</p>
            <div class="admin-empty-action">
              <button type="button" class="admin-primary-button" on:click={() => onOpenCreateBookmark?.()} disabled={!isAuthenticated}>
                新增书签
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="admin-table-wrap">
          <table class="admin-bookmark-table" class:is-sorting={sortMode}>
            <colgroup>
              <col style="width: 44px;" />
              <col style="width: 30%;" />
              <col style="width: 53%;" />
              <col style="width: 5%;" />
              <col style="width: 12%;" />
              {#if !sortMode}<col style="width: 122px;" />{/if}
            </colgroup>
            <thead>
              <tr>
                {#if !sortMode}<th style="width: 44px;"><input type="checkbox" aria-label="全选当前页" checked={pageSelectedCount === pageIds.length && pageIds.length > 0} use:indeterminate={pageSelectedCount > 0 && pageSelectedCount < pageIds.length} on:change={togglePageSelection} /></th>{/if}
                {#if sortMode}<th style="width: 44px;">排序</th>{/if}
                {#each sortColumns as column}
                  <th aria-sort={sortField === column.field ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : 'none'}><button type="button" class="sort-header-button" aria-label={sortButtonLabel(column.field, column.label)} on:click={() => toggleField(column.field)} disabled={sortMode}>{column.label}<svg viewBox="0 0 16 16" aria-hidden="true"><path d={sortField === column.field && sortDirection === 'asc' ? 'M8 3 4 7h3v6h2V7h3L8 3Z' : sortField === column.field && sortDirection === 'desc' ? 'm8 13 4-4H9V3H7v6H4l4 4Z' : 'm5 2-3 3h2v6h2V5h2L5 2Zm6 12 3-3h-2V5h-2v6H8l3 3Z'} /></svg></button></th>
                {/each}
                {#if !sortMode}<th style="width: 122px;">操作</th>{/if}
              </tr>
            </thead>
            <tbody
              use:sortableList={{
                enabled: sortMode,
                onSort: handleReorder,
                handle: '[data-drag-handle]',
              }}
            >
              {#each displayBookmarks as bookmark (bookmark.id)}
                <tr data-sortable-item data-sort-id={bookmark.id} class:is-sorting={sortMode}>
                  {#if !sortMode}<td><input type="checkbox" aria-label={`选择书签 ${bookmark.title}`} checked={selectedIds.has(Number(bookmark.id))} on:change={(event) => toggleBookmarkSelection(event, Number(bookmark.id))} /></td>{/if}
                  {#if sortMode}
                    <td>
                      <button
                        type="button"
                        class="admin-drag-handle"
                        data-drag-handle
                        aria-label={`拖动排序书签 ${bookmark.title}`}
                      >
                        ⋮⋮
                      </button>
                    </td>
                  {/if}
                  <td>
                    <div class="admin-bookmark-cell">
                      <span class="admin-icon-badge small" style={bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}>
                        {#if hasBookmarkImageIcon(bookmark)}
                          <CachedBookmarkIcon
                            id={bookmark.id}
                            icon={bookmark.icon ?? ''}
                            iconSource={bookmark.icon_source}
                            iconBlob={bookmark.icon_blob ?? ''}
                            src={getBookmarkIconUrl(bookmark)}
                            alt=""
                            fallback={getBookmarkFallbackIcon(bookmark)}
                            style="width: 100%; height: 100%; object-fit: contain;"
                          />
                        {:else}
                          {getBookmarkFallbackIcon(bookmark)}
                        {/if}
                      </span>
                      <div>
                        <strong>{bookmark.title}</strong>
                        {#if bookmark.description}
                          <p>{bookmark.description}</p>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="admin-url-cell">
                    <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.url}</a>
                  </td>
                  <td class="admin-cat-cell">{getCategoryTitle(bookmark.category_id)}</td>
                  <td class="admin-method-cell">
                    {bookmark.open_method === 'same_tab' ? '当前标签页' : bookmark.open_method === 'modal' ? '当前页弹层' : '新标签页'}
                  </td>
                  {#if !sortMode}
                    <td>
                      <div class="admin-inline-actions compact">
                        <button type="button" class="admin-ghost-button compact" on:click={() => onEditBookmark?.(bookmark)} disabled={!isAuthenticated}>
                          编辑
                        </button>
                        <button
                          type="button"
                          class="admin-danger-button compact"
                          on:click={() => onDeleteBookmark?.(bookmark)}
                          disabled={!isAuthenticated || deletingBookmarkId === bookmark.id}
                        >
                          {#if deletingBookmarkId === bookmark.id}删除中...{:else}删除{/if}
                        </button>
                      </div>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
          {#if !sortMode && filteredBookmarks.length === 0}
            <div class="admin-empty-state" style="min-height: 120px;">
              <span class="admin-empty-state-icon">🔍</span>
              <h3>未找到匹配的书签</h3>
              <p>换个关键词试试，或检查分类、链接是否匹配。</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if bookmarks.length > 0}
      <div class="admin-panel-footer">
        {#if sortMode}
          <div class="admin-sort-hint">拖动行调整顺序，完成后点击「保存排序」。</div>
        {:else}
          <div class="admin-pagination">
            <span>第 {bookmarkPage.start}-{bookmarkPage.end} 条 / 共 {bookmarkPage.total} 条</span>
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
    <span class="admin-sort-hint-inline">正在排序书签，拖动调整顺序后保存。</span>
    <button type="button" class="admin-ghost-button" on:click={cancelSort} disabled={savingSort}>取消</button>
    <button type="button" class="admin-primary-button" on:click={saveSort} disabled={savingSort}>
      {#if savingSort}保存中...{:else}保存排序{/if}
    </button>
  </div>
{/if}

<style>
  .admin-bookmark-list-panel {
    height: min(760px, calc(100vh - 220px));
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
  }

  .admin-title-row { display: flex; align-items: center; gap: 14px; }

  .admin-table-scroll-body {
    padding: 0;
    overflow: auto;
  }

  .admin-inline-actions.compact {
    justify-content: flex-end;
  }

  .admin-table-wrap {
    min-height: 0;
    overflow: visible;
  }

  .admin-bookmark-search-bar {
    margin: 0;
    width: min(360px, 32vw);
  }

  @media (max-width: 760px) {
    .admin-title-row { align-items: flex-start; flex-direction: column; gap: 8px; }
    .admin-bookmark-search-bar { width: min(100%, 360px); }
  }

  .admin-bookmark-search-bar input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--admin-input-border);
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13px;
    color: var(--admin-text);
    background: var(--admin-input-bg);
    font-family: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .admin-bookmark-search-bar input:focus {
    outline: none;
    border-color: var(--admin-accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .admin-bookmark-search-bar input::placeholder {
    color: var(--admin-input-placeholder);
  }

  .admin-bookmark-table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .admin-bookmark-table th,
  .admin-bookmark-table td {
    padding: 10px 10px;
    text-align: left;
    border-bottom: 1px solid var(--admin-divider);
    vertical-align: middle;
    font-size: 13px;
  }

  .admin-bookmark-table th {
    position: sticky;
    top: 0;
    z-index: 8;
    background: var(--admin-th-bg);
    font-size: 12px;
    color: var(--admin-subtle);
    font-weight: 600;
  }

  .sort-header-button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
  }

  .sort-header-button svg { width: 14px; height: 14px; fill: currentColor; }

  .sort-header-button:disabled {
    cursor: not-allowed;
  }

  .admin-bookmark-table tr.is-sorting {
    background: var(--admin-sort-highlight-bg);
  }

  .admin-bookmark-table td a {
    color: var(--admin-link);
    text-decoration: none;
    word-break: break-all;
  }

  .admin-bookmark-cell {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    justify-content: flex-start;
    text-align: left;
  }

  .admin-bookmark-cell p {
    color: var(--admin-subtle);
    line-height: 1.5;
  }

  .admin-cat-cell,
  .admin-method-cell {
    white-space: nowrap;
    color: var(--admin-muted);
  }

  .admin-cat-cell {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .admin-url-cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-url-cell a {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 960px) {
    .admin-table-scroll-body {
      padding: 0;
    }

    .admin-inline-actions.compact {
      justify-content: flex-start;
    }
  }
</style>
