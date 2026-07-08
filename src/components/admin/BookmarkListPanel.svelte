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
  export let onSortBookmarks: SortHandler | undefined = undefined

  let sortMode = false
  let localBookmarks: AdminBookmark[] = []
  let savingSort = false
  let page = 1
  let search = ''

  $: filteredBookmarks = filterAdminBookmarks(bookmarks, categories, search)
  $: totalPages = getAdminListTotalPages(filteredBookmarks.length)
  $: page = clampAdminListPage(page, totalPages)
  $: bookmarkPage = createAdminListPage(filteredBookmarks, page)
  $: pagedBookmarks = bookmarkPage.items
  $: displayBookmarks = sortMode ? localBookmarks : pagedBookmarks

  const getCategoryTitle = (categoryId: string | number) =>
    getAdminCategoryTitle(categories, categoryId)

  function enterSort() {
    search = ''
    page = 1
    localBookmarks = createAdminSortDraft(bookmarks)
    sortMode = true
  }

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
        <h2>书签列表</h2>
      </div>
      <div class="admin-header-actions-row">
        <button
          type="button"
          class="admin-ghost-button"
          on:click={enterSort}
          disabled={sortMode || !isAuthenticated || bookmarksLoading || authLoading || bookmarks.length < 2}
        >
          排序
        </button>
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

    <div class="admin-list-toolbar">
      {#if !sortMode}
        <div class="admin-bookmark-search-bar">
          <input
            type="text"
            data-testid="admin-bookmark-search"
            placeholder="搜索标题、链接或分类…"
            value={search}
            on:input={handleSearchInput}
          />
        </div>
      {/if}
    </div>

    <div class="admin-panel-scroll-body admin-table-scroll-body">
      {#if bookmarksLoading}
        <div class="admin-empty-state">`n        <span class="admin-empty-state-icon">📑</span>`n        <h3>正在加载书签…</h3>`n      </div>
      {:else if bookmarks.length === 0}
        <div class="admin-empty-state">`n        <span class="admin-empty-state-icon">📑</span>`n        <h3>暂无书签</h3>`n        {#if categories.length === 0}`n          <p>请先在分类面板中创建至少一个分类，再添加书签。</p>`n        {:else}`n          <p>点击右上角「新增书签」开始添加第一个书签。</p>`n          <div class="admin-empty-action">`n            <button type="button" class="admin-primary-button" on:click={() => onOpenCreateBookmark?.()} disabled={!isAuthenticated}>`n              新增书签`n            </button>`n          </div>`n        {/if}`n      </div>
      {:else}
        <div class="admin-table-wrap">
          <table class="admin-bookmark-table" class:is-sorting={sortMode}>
            <colgroup>
              {#if sortMode}<col style="width: 44px;" />{/if}
              <col />
              <col style="width: 88px;" />
              <col />
              <col style="width: 114px;" />
              {#if !sortMode}<col style="width: 122px;" />{/if}
            </colgroup>
            <thead>
              <tr>
                {#if sortMode}<th style="width: 44px;">排序</th>{/if}
                <th>标题</th>
                <th style="width: 88px;">分类</th>
                <th>链接</th>
                <th style="width: 114px;">打开方式</th>
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
                  <td class="admin-cat-cell">{getCategoryTitle(bookmark.category_id)}</td>
                  <td class="admin-url-cell">
                    <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.url}</a>
                  </td>
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
            <div class="admin-empty-state" style="min-height: 120px;">`n          <span class="admin-empty-state-icon">🔍</span>`n          <h3>未找到匹配的书签</h3>`n          <p>换个关键词试试，或检查分类、链接是否匹配。</p>`n        </div>
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
    grid-template-rows: auto auto minmax(0, auto) auto;
    min-width: 0;
  }

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

  .admin-url-cell {
    max-width: 260px;
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
