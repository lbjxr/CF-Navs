<script lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../../lib/appData'
  import { buildBookmarkBatchMoveRequest } from '../../lib/batchMove'
  import type { BookmarkBatchMovePosition, BookmarkBatchMoveReq } from '../../../shared/types'
  import {
    clampAdminListPage,
    createAdminListPage,
    createAdminSortDraft,
    filterAdminBookmarks,
    getAdminCategoryTitle,
    getAdminBookmarkCategoryOptions,
    getAdminListTotalPages,
    getAdminSortIds,
    cycleAdminBookmarkSort,
    sortAdminBookmarks,
    type AdminBookmarkSortField,
    type AdminBookmarkSortState,
    reorderAdminSortDraft,
  } from '../../lib/adminListState'
  import { getBookmarkFallbackIcon, getBookmarkIconUrl, hasBookmarkImageIcon } from '../../lib/bookmarkIconDisplay'
  import CategoryTreeSelect from '../CategoryTreeSelect.svelte'
  import { truncateUnicodeText } from '../../lib/truncateUnicodeText'
  import { sortableList, type SortHandler } from '../../lib/sortableList'
  import CachedBookmarkIcon from '../CachedBookmarkIcon.svelte'
  import './adminListPanels.css'
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination'

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
  export let onBatchMoveBookmarks: ((payload: BookmarkBatchMoveReq) => AsyncVoid) | undefined = undefined
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
  $: moveCategoryOptions = getAdminBookmarkCategoryOptions(categories)
  $: selectedBookmarks = bookmarks.filter((bookmark) => selectedIds.has(Number(bookmark.id)))
  $: moveTargetTitle = moveTargetId == null ? '未选择分类' : getCategoryTitle(moveTargetId)
  $: selectedPageCount = new Set(
    selectedBookmarks
      .map((bookmark) => {
        const index = filteredBookmarks.findIndex((item) => Number(item.id) === Number(bookmark.id))
        return index >= 0 ? Math.floor(index / DEFAULT_PAGE_SIZE) + 1 : null
      })
      .filter((pageNumber): pageNumber is number => pageNumber !== null),
  ).size
  $: selectionPageSummary = selectedPageCount > 0 ? `（跨 ${selectedPageCount} 页）` : '（当前筛选外仍保留）'

  let moveModalOpen = false
  let moveTargetId: number | null = null
  let movePosition: BookmarkBatchMovePosition = 'end'
  let moveError = ''
  let moving = false

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
  function openMoveModal(): void {
    if (selectedIds.size === 0 || moveCategoryOptions.length === 0) return
    moveError = ''
    movePosition = 'end'
    moveTargetId = selectedBookmarks[0] ? Number(selectedBookmarks[0].category_id) : Number(categories[0].id)
    moveModalOpen = true
  }

  function closeMoveModal(): void {
    if (moving) return
    moveModalOpen = false
    moveError = ''
  }

  async function submitBatchMove(): Promise<void> {
    if (moving || !onBatchMoveBookmarks || selectedBookmarks.length === 0 || moveTargetId == null) return

    const payload = buildBookmarkBatchMoveRequest(selectedBookmarks, moveTargetId, movePosition)
    if (!payload) {
      moveError = '书签排序状态不可用，请刷新后台数据后重试。'
      return
    }

    moving = true
    moveError = ''
    try {
      await onBatchMoveBookmarks(payload)
      selectedIds = new Set()
      moveModalOpen = false
    } catch (error) {
      moveError = getErrorMessage(error)
    } finally {
      moving = false
    }
  }

  function handleSearchInput(event: Event) {
    search = (event.currentTarget as HTMLInputElement).value
    page = 1
  }

  import { api, getErrorMessage } from '../../lib/api'

  let checkingHealth = false
  let healthProgress = 0
  let healthTotal = 0
  let healthResults = new Map<number, { status: number | string; ok: boolean }>()

  async function checkBookmarksHealth() {
    if (checkingHealth || bookmarks.length === 0) return
    checkingHealth = true
    healthProgress = 0
    healthTotal = bookmarks.length
    healthResults = new Map()

    const bookmarkIds = bookmarks.map((b) => Number(b.id))
    const BATCH_SIZE = 10

    try {
      for (let offset = 0; offset < bookmarkIds.length; offset += BATCH_SIZE) {
        const batchIds = bookmarkIds.slice(offset, offset + BATCH_SIZE)
        const res = await api.bookmarks.checkHealth(batchIds)
        if (res) {
          for (const item of res) {
            healthResults.set(item.id, { status: item.status, ok: item.ok })
          }
          healthProgress = Math.min(offset + BATCH_SIZE, healthTotal)
          healthResults = healthResults
        }
      }
    } catch (err) {
      console.error('Failed to run health check:', err)
    } finally {
      checkingHealth = false
    }
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
        {#if checkingHealth}
          <div class="admin-health-progress">
            正在检测 ({healthProgress}/{healthTotal})
          </div>
        {:else}
          <button
            type="button"
            class="admin-ghost-button"
            on:click={checkBookmarksHealth}
            disabled={sortMode || !isAuthenticated || bookmarksLoading || authLoading || bookmarks.length === 0}
          >
            检测链接健康
          </button>
        {/if}
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
    <div class="admin-bookmark-list-content" class:has-batch-selection={selectedIds.size > 0}>
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
              <col class="col-selection" style="width: 44px;" />
              <col class="col-title" style="width: 30%;" />
              <col class="col-url" style="width: 50%;" />
              <col class="col-category" style="width: 12%;" />
              <col class="col-open-method" style="width: 8%;" />
              {#if !sortMode}<col class="col-actions" style="width: 122px;" />{/if}
            </colgroup>
            <thead>
              <tr>
                {#if !sortMode}<th style="width: 44px;"><input type="checkbox" aria-label="全选当前页" checked={pageSelectedCount === pageIds.length && pageIds.length > 0} use:indeterminate={pageSelectedCount > 0 && pageSelectedCount < pageIds.length} on:change={togglePageSelection} /></th>{/if}
                {#if sortMode}<th style="width: 44px;">排序</th>{/if}
                {#each sortColumns as column}
                  <th class="col-{column.field}" aria-sort={sortField === column.field ? (sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : 'none') : 'none'}><button type="button" class="sort-header-button" aria-label={sortButtonLabel(column.field, column.label)} on:click={() => toggleField(column.field)} disabled={sortMode}>{column.label}<svg viewBox="0 0 16 16" aria-hidden="true"><path d={sortField === column.field && sortDirection === 'asc' ? 'M8 3 4 7h3v6h2V7h3L8 3Z' : sortField === column.field && sortDirection === 'desc' ? 'm8 13 4-4H9V3H7v6H4l4 4Z' : 'm5 2-3 3h2v6h2V5h2L5 2Zm6 12 3-3h-2V5h-2v6H8l3 3Z'} /></svg></button></th>
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
                      <div class="admin-bookmark-info">
                        <strong title={bookmark.title} aria-label={bookmark.title}>
                          <span class="admin-bookmark-title-full">{bookmark.title}</span>
                          <span class="admin-bookmark-title-mobile" aria-hidden="true">{truncateUnicodeText(bookmark.title, 12)}</span>
                        </strong>
                        {#if bookmark.is_private}
                          <span class="private-bookmark-badge" title="仅登录后可见">🔒 私密</span>
                        {/if}
                        <div class="admin-bookmark-meta">
                          <span class="admin-bookmark-category">{getCategoryTitle(bookmark.category_id)}</span>
                          <span class="admin-bookmark-method">{bookmark.open_method === 'same_tab' ? '当前标签页' : bookmark.open_method === 'modal' ? '当前页弹层' : '新标签页'}</span>
                          {#if bookmark.is_private}<span>🔒 私密</span>{/if}
                        </div>
                        <a href={bookmark.url} target="_blank" rel="noreferrer" class="admin-bookmark-mobile-url" title={bookmark.url} aria-label={`打开 ${bookmark.url}`}>
                          {truncateUnicodeText(bookmark.url, 20)}
                        </a>
                        {#if healthResults.has(Number(bookmark.id))}
                          {@const mobileResult = healthResults.get(Number(bookmark.id))}
                          {#if mobileResult && mobileResult.ok}
                            <span class="health-badge ok admin-bookmark-mobile-health">200 OK</span>
                          {:else if mobileResult}
                            <span class="health-badge error admin-bookmark-mobile-health" title={`连接错误: ${mobileResult.status}`}>{mobileResult.status}</span>
                          {/if}
                        {/if}
                        {#if bookmark.description}
                          <p>{bookmark.description}</p>
                        {/if}
                      </div>
                    </div>
                  </td>
                  <td class="admin-url-cell col-url">
                    <div class="admin-url-badge-wrap">
                      <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.url}</a>
                      {#if healthResults.has(Number(bookmark.id))}
                        {@const result = healthResults.get(Number(bookmark.id))}
                        {#if result && result.ok}
                          <span class="health-badge ok">200 OK</span>
                        {:else if result}
                          <span class="health-badge error" title={`连接错误: ${result.status}`}>{result.status}</span>
                        {/if}
                      {/if}
                    </div>
                  </td>
                  <td class="admin-cat-cell col-category">{getCategoryTitle(bookmark.category_id)}</td>
                  <td class="admin-method-cell col-open-method">
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


{#if selectedIds.size > 0 && !sortMode}
  <div class="batch-selection-toolbar" role="toolbar" aria-label="批量书签操作">
    <span>已选 {selectedIds.size} 项{selectionPageSummary}</span>
    <button type="button" class="admin-primary-button" on:click={openMoveModal} disabled={!isAuthenticated || moveCategoryOptions.length === 0}>移动到分类</button>
    <button type="button" class="admin-danger-button" on:click={() => onBatchDeleteBookmarks?.([...selectedIds])} disabled={!isAuthenticated}>删除已选 ({selectedIds.size})</button>
    <button type="button" class="admin-ghost-button" on:click={() => selectedIds = new Set()}>清除选择</button>
  </div>
{/if}
{#if sortMode}
  <div class="admin-sort-bar" role="toolbar" aria-label="排序操作">
    <span class="admin-sort-hint-inline">正在排序书签，拖动调整顺序后保存。</span>
    <button type="button" class="admin-ghost-button" on:click={cancelSort} disabled={savingSort}>取消</button>
    <button type="button" class="admin-primary-button" on:click={saveSort} disabled={savingSort}>
      {#if savingSort}保存中...{:else}保存排序{/if}
    </button>
  </div>
{/if}

{#if moveModalOpen}
  <div class="batch-move-backdrop">
    <section class="batch-move-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-move-title">
      <div class="batch-move-header">
        <div>
          <p class="admin-panel-eyebrow">批量操作</p>
          <h2 id="batch-move-title">移动到分类</h2>
        </div>
        <button type="button" class="admin-icon-button" aria-label="关闭批量移动" on:click={closeMoveModal} disabled={moving}>×</button>
      </div>
      {#if moveError}
        <p class="batch-move-error" role="alert">{moveError}</p>
      {/if}
      <p class="batch-move-summary">将移动 <strong>{selectedIds.size}</strong> 个书签到「{moveTargetTitle}」</p>
      <div class="batch-move-field">
        <span id="batch-move-category-label">目标分类</span>
        <CategoryTreeSelect
          bind:value={moveTargetId}
          items={moveCategoryOptions}
          ariaLabel="选择目标分类"
          testId="batch-move-category-select"
        />
      </div>
      <fieldset class="batch-move-position">
        <legend>目标分类内位置</legend>
        <label><input type="radio" bind:group={movePosition} value="end" disabled={moving} /> 追加到末尾</label>
        <label><input type="radio" bind:group={movePosition} value="start" disabled={moving} /> 插入到顶部</label>
      </fieldset>
      <div class="batch-move-actions">
        <button type="button" class="admin-ghost-button" on:click={closeMoveModal} disabled={moving}>取消</button>
        <button type="button" class="admin-primary-button" on:click={submitBatchMove} disabled={moving || moveTargetId == null}>
          {moving ? '移动中…' : '确认移动'}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .admin-bookmark-list-panel {
    height: min(760px, calc(100vh - 220px));
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
  }
  .admin-bookmark-list-content {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .admin-title-row { display: flex; align-items: center; gap: 14px; }

  .admin-table-scroll-body {
    padding: 0;
    overflow: auto;
  }

  .admin-inline-actions.compact {
    justify-content: flex-end;
  }
  .batch-selection-toolbar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    max-width: calc(100vw - 32px);
    min-width: 0;
    padding: 10px 14px;
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    background: var(--admin-sticky-bg);
    color: var(--admin-text);
    box-shadow: var(--admin-shadow);
  }

  .batch-selection-toolbar > span {
    margin-right: auto;
    color: var(--admin-muted);
    font-size: 13px;
    font-weight: 700;
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
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
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

  .admin-bookmark-info {
    min-width: 0;
  }

  .admin-bookmark-info > strong {
    display: block;
  }

  .private-bookmark-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 6px;
    border-radius: 999px;
    color: #92400e;
    background: #fef3c7;
    font-size: 11px;
    line-height: 1.2;
  }

  .admin-bookmark-title-mobile {
    display: none;
  }

  .admin-bookmark-meta,
  .admin-bookmark-mobile-url,
  .admin-bookmark-mobile-health {
    display: none;
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

  @media (max-width: 700px) {
    .admin-table-scroll-body {
      overflow-x: hidden;
    }

    .admin-table-wrap {
      width: 100%;
      overflow: hidden;
    }
    .admin-bookmark-list-content.has-batch-selection {
      padding-bottom: 112px;
    }

    .batch-selection-toolbar {
      position: fixed;
      z-index: 1001;
      right: 12px;
      bottom: calc(60px + max(12px, env(safe-area-inset-bottom)));
      left: 12px;
      max-width: none;
      transform: none;
      justify-content: flex-end;
      padding: 10px;
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
    }

    .batch-selection-toolbar > span {
      width: 100%;
      margin-right: 0;
    }

    .admin-bookmark-table {
      width: 100%;
      min-width: 0;
    }

    .admin-bookmark-table col.col-selection {
      width: 38px !important;
    }

    .admin-bookmark-table col.col-title {
      width: auto !important;
    }

    .admin-bookmark-table col.col-actions {
      width: 144px !important;
    }

    .admin-bookmark-table .col-url,
    .admin-bookmark-table .col-category,
    .admin-bookmark-table .col-open-method,
    .admin-bookmark-table .col-open_method {
      display: none !important;
    }

    .admin-bookmark-table th,
    .admin-bookmark-table td {
      padding: 9px 6px;
    }

    .admin-bookmark-table th:first-child,
    .admin-bookmark-table td:first-child {
      text-align: center;
    }

    .admin-bookmark-table td:last-child {
      padding-left: 4px;
      padding-right: 4px;
    }

    .admin-bookmark-cell {
      min-width: 0;
      gap: 8px;
    }

    .admin-bookmark-cell .admin-icon-badge.small {
      width: 30px;
      height: 30px;
      font-size: 14px;
    }

    .admin-bookmark-info {
      flex: 1;
      overflow: hidden;
    }

    .admin-bookmark-info > strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .admin-bookmark-title-full {
      display: none;
    }

    .admin-bookmark-title-mobile {
      display: inline;
    }

    .admin-bookmark-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      margin-top: 3px;
      color: var(--admin-subtle);
      font-size: 11px;
      line-height: 1.3;
    }

    .private-bookmark-badge {
      display: none;
    }

    .admin-bookmark-category,
    .admin-bookmark-method {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .admin-bookmark-category {
      max-width: 58%;
    }

    .admin-bookmark-method {
      flex: 0 1 auto;
    }

    .admin-bookmark-mobile-url {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--admin-link);
      font-size: 11px;
      line-height: 1.3;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .admin-bookmark-mobile-url:hover {
      text-decoration: underline;
    }

    .admin-bookmark-mobile-health {
      display: inline-flex;
      margin-top: 3px;
    }

    .admin-bookmark-cell p {
      display: none;
    }

    .admin-inline-actions.compact {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      width: 100%;
    }

    .admin-inline-actions.compact .admin-ghost-button,
    .admin-inline-actions.compact .admin-danger-button {
      min-width: 0;
      padding-left: 3px;
      padding-right: 3px;
      font-size: 11px;
      white-space: nowrap;
    }
  }
  .batch-move-backdrop {
    position: fixed;
    z-index: 200;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
  }

  .batch-move-dialog {
    width: min(100%, 480px);
    max-height: min(720px, calc(100dvh - 40px));
    overflow: auto;
    box-sizing: border-box;
    padding: 22px;
    border: 1px solid var(--admin-border);
    border-radius: 18px;
    background: var(--admin-surface-strong);
    color: var(--admin-text);
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3);
  }

  .batch-move-header,
  .batch-move-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .batch-move-header h2 {
    margin: 0;
    font-size: 20px;
  }

  .batch-move-summary {
    margin: 18px 0;
    color: var(--admin-muted);
  }

  .batch-move-field,
  .batch-move-position {
    display: grid;
    gap: 8px;
    margin: 0 0 16px;
  }

  .batch-move-field > span,
  .batch-move-position legend {
    color: var(--admin-muted);
    font-size: 13px;
    font-weight: 700;
  }

  .batch-move-position {
    padding: 0;
    border: 0;
  }

  .batch-move-position label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    color: var(--admin-text);
    font-size: 14px;
  }

  .batch-move-error {
    margin: 14px 0 0;
    padding: 10px 12px;
    border: 1px solid var(--admin-danger-border);
    border-radius: 10px;
    background: var(--admin-danger-bg);
    color: var(--admin-danger);
    font-size: 13px;
    line-height: 1.45;
  }

  .batch-move-actions {
    justify-content: flex-end;
    margin-top: 20px;
  }

  @media (max-width: 700px) {
    .batch-move-backdrop {
      align-items: end;
      padding: 12px;
    }

    .batch-move-dialog {
      max-height: calc(100dvh - 24px);
      padding: 18px;
      border-radius: 18px 18px 12px 12px;
    }
  }
</style>
