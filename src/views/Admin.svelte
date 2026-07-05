<script context="module" lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../lib/appData'
  import type {
    BookmarkFormValue as BookmarkFormValueType,
    CategoryFormValue as CategoryFormValueType,
  } from '../lib/adminTypes'

  export type AdminCategory = AdminCategorySummary
  export type AdminBookmark = AdminBookmarkSummary
  export type CategoryFormValue = CategoryFormValueType
  export type BookmarkFormValue = BookmarkFormValueType
</script>

<script lang="ts">
  import type { ChangePasswordReq } from '../../shared/types'
  import AdminSidebar from '../components/AdminSidebar.svelte'
  import BackupPanel from '../components/BackupPanel.svelte'
  import type { ImportSource } from '../lib/importData'
  import type { SettingsFormValue } from '../lib/appData'
  import type { AdminTab } from '../lib/adminTypes'
  import { iconifyProxyIcon, isIconifyIconUrl } from '../lib/icons'
  import { sortableList, type SortHandler } from '../lib/sortableList'
  import CachedBookmarkIcon from '../components/CachedBookmarkIcon.svelte'

  type BookmarkCategoryOption = {
    id: string | number
    title: string
  }

  type AsyncVoid<T = void> = T | Promise<T>
  const PAGE_SIZE = 10

  export let isAuthenticated = false
  export let authLoading = false
  export let categories: AdminCategory[] = []
  export let bookmarks: AdminBookmark[] = []
  export let categoriesLoading = false
  export let bookmarksLoading = false
  export let savingCategory = false
  export let deletingCategoryId: string | number | null = null
  export let deletingBookmarkId: string | number | null = null
  export let categoryError = ''
  export let categoryModalOpen = false
  export let settingsLoading = false
  export let settingsSaving = false
  export let settingsError = ''
  export let settingsValue: Partial<SettingsFormValue> | null = null
  export let categoryModalMode: 'create' | 'edit' = 'create'
  export let activeCategory: Partial<CategoryFormValue> | null = null
  export let canSeeHome = false

  let activeTab: AdminTab = 'categories'

  $: imageHostUrl = settingsValue?.image_host_url ?? ''
  let CategoryEditModalComponent: typeof import('../components/CategoryEditModal.svelte').default | null = null
  let SettingsPanelComponent: typeof import('../components/SettingsPanel.svelte').default | null = null
  let categoryEditModalPromise: Promise<void> | null = null
  let settingsPanelPromise: Promise<void> | null = null
  $: if (categoryModalOpen) {
    void ensureCategoryEditModal()
  }
  $: if (activeTab === 'settings') {
    void ensureSettingsPanel()
  }

  function ensureCategoryEditModal(): Promise<void> {
    if (!categoryEditModalPromise) {
      categoryEditModalPromise = import('../components/CategoryEditModal.svelte').then((module) => {
        CategoryEditModalComponent = module.default
      })
    }
    return categoryEditModalPromise
  }

  function ensureSettingsPanel(): Promise<void> {
    if (!settingsPanelPromise) {
      settingsPanelPromise = import('../components/SettingsPanel.svelte').then((module) => {
        SettingsPanelComponent = module.default
      })
    }
    return settingsPanelPromise
  }

  export let onOpenLogin: (() => AsyncVoid) | undefined = undefined
  export let onLogout: (() => AsyncVoid) | undefined = undefined
  export let onSwitchToHome: (() => AsyncVoid) | undefined = undefined

  export let onOpenCreateCategory: (() => AsyncVoid) | undefined = undefined
  export let onEditCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onDeleteCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onCloseCategoryModal: (() => AsyncVoid) | undefined = undefined
  export let onSubmitCategory: ((payload: CategoryFormValue) => AsyncVoid) | undefined = undefined

  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onDeleteBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onSubmitSettings: ((payload: SettingsFormValue) => AsyncVoid) | undefined = undefined
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined
  export let onSortCategories: SortHandler | undefined = undefined
  export let onSortBookmarks: SortHandler | undefined = undefined

  export let importing = false
  export let backupError = ''
  export let backupMessage = ''
  export let onExportData: (() => AsyncVoid) | undefined = undefined
  export let onImportData: ((file: File, source: ImportSource) => AsyncVoid) | undefined = undefined

  let importSource: ImportSource = 'cf-navs'

  function handleSelectTab(tab: AdminTab): void {
    activeTab = tab
  }

  const bookmarkCategoryOptions = (): BookmarkCategoryOption[] =>
    categories.map((category) => ({
      id: category.id,
      title: category.title,
    }))

  // ========== 排序模式（先点“排序”进入，拖拽后点“保存”回写） ==========
  let categorySortMode = false
  let bookmarkSortMode = false
  // 进入排序模式时对当前列表做本地快照，拖拽只改动快照，取消即丢弃。
  let localCategories: AdminCategory[] = []
  let localBookmarks: AdminBookmark[] = []
  let savingSort = false
  let categoryPage = 1
  let bookmarkPage = 1

  $: categoryTotalPages = pageCount(categories.length)
  $: bookmarkTotalPages = pageCount(filteredBookmarks.length)
  $: categoryPage = clampPage(categoryPage, categoryTotalPages)
  $: bookmarkPage = clampPage(bookmarkPage, bookmarkTotalPages)
  $: pagedCategories = slicePage(categories, categoryPage)
  $: pagedBookmarks = slicePage(filteredBookmarks, bookmarkPage)
  $: categoryTitleById = new Map(categories.map((category) => [category.id, category.title]))
  // 排序模式下渲染本地快照全量列表，避免跨页排序造成全局顺序不完整。
  $: displayCategories = categorySortMode ? localCategories : pagedCategories
  $: displayBookmarks = bookmarkSortMode ? localBookmarks : pagedBookmarks

  function enterCategorySort() {
    localCategories = [...categories]
    categoryPage = 1
    categorySortMode = true
  }

  function cancelCategorySort() {
    categorySortMode = false
    localCategories = []
  }

  function handleReorderCategories(orderedIds: Array<string | number>) {
    const byId = new Map(localCategories.map((item) => [String(item.id), item]))
    localCategories = orderedIds
      .map((id) => byId.get(String(id)))
      .filter((item): item is AdminCategory => Boolean(item))
  }

  async function saveCategorySort() {
    if (!onSortCategories) {
      cancelCategorySort()
      return
    }
    savingSort = true
    try {
      await onSortCategories(localCategories.map((item) => item.id))
      categorySortMode = false
      localCategories = []
    } finally {
      savingSort = false
    }
  }

  function enterBookmarkSort() {
    // 排序基于完整列表，进入排序模式前清空搜索，避免只对过滤子集排序。
    bookmarkSearch = ''
    bookmarkPage = 1
    localBookmarks = [...bookmarks]
    bookmarkSortMode = true
  }

  function cancelBookmarkSort() {
    bookmarkSortMode = false
    localBookmarks = []
  }

  function handleReorderBookmarks(orderedIds: Array<string | number>) {
    const byId = new Map(localBookmarks.map((item) => [String(item.id), item]))
    localBookmarks = orderedIds
      .map((id) => byId.get(String(id)))
      .filter((item): item is AdminBookmark => Boolean(item))
  }

  async function saveBookmarkSort() {
    if (!onSortBookmarks) {
      cancelBookmarkSort()
      return
    }
    savingSort = true
    try {
      await onSortBookmarks(localBookmarks.map((item) => item.id))
      bookmarkSortMode = false
      localBookmarks = []
    } finally {
      savingSort = false
    }
  }

  const getCategoryTitle = (categoryId: string | number) =>
    categories.find((category) => category.id === categoryId)?.title ?? '未分类'

  const getBookmarksByCategory = (categoryId: string | number) =>
    bookmarks.filter((bookmark) => bookmark.category_id === categoryId)

  function createIconVersion(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
      hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
    }
    return Math.abs(hash).toString(36)
  }

  function getBookmarkIconUrl(bookmark: AdminBookmark): string {
    const icon = bookmark.icon ?? ''
    const cachedIcon = bookmark.icon_blob ?? ''
    if (/^data:image\//i.test(cachedIcon)) return cachedIcon
    const iconifyUrl =
      bookmark.icon_source === 'iconify' || isIconifyIconUrl(icon)
        ? iconifyProxyIcon(icon)
        : ''
    if (iconifyUrl) return iconifyUrl
    if (/^data:image\//i.test(icon)) return icon
    if (/^https?:\/\//i.test(icon)) {
      return `/api/icon/${bookmark.id}?v=${createIconVersion(`${bookmark.id}:${icon}:${bookmark.title}:${bookmark.url}`)}`
    }
    if (bookmark.icon_cached) {
      return `/api/icon/${bookmark.id}?v=${createIconVersion(`${bookmark.id}:${bookmark.title}:${bookmark.url}:cached`)}`
    }
    return icon
  }

  function hasBookmarkImageIcon(bookmark: AdminBookmark): boolean {
    const icon = bookmark.icon ?? ''
    const cachedIcon = bookmark.icon_blob ?? ''
    return Boolean(
      getBookmarkIconUrl(bookmark) &&
      (
        /^data:image\//i.test(cachedIcon) ||
        /^data:image\//i.test(icon) ||
        /^https?:\/\//i.test(icon) ||
        Boolean(bookmark.icon_cached) ||
        bookmark.icon_source === 'iconify' ||
        isIconifyIconUrl(icon)
      ),
    )
  }

  function getBookmarkFallbackIcon(bookmark: AdminBookmark): string {
    const icon = bookmark.icon ?? ''
    if (/^https?:\/\//i.test(icon) || /^data:image\//i.test(icon) || isIconifyIconUrl(icon)) {
      return '🔖'
    }
    return icon || '🔖'
  }

  let bookmarkSearch = ''

  function pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / PAGE_SIZE))
  }

  function clampPage(page: number, totalPages: number): number {
    if (!Number.isFinite(page)) return 1
    return Math.min(Math.max(1, Math.trunc(page)), totalPages)
  }

  function slicePage<T>(items: T[], page: number): T[] {
    const start = (clampPage(page, pageCount(items.length)) - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }

  function pageStart(page: number, total: number): number {
    if (total === 0) return 0
    return (clampPage(page, pageCount(total)) - 1) * PAGE_SIZE + 1
  }

  function pageEnd(page: number, total: number): number {
    if (total === 0) return 0
    return Math.min(clampPage(page, pageCount(total)) * PAGE_SIZE, total)
  }

  function handleBookmarkSearchInput(event: Event) {
    bookmarkSearch = (event.currentTarget as HTMLInputElement).value
    bookmarkPage = 1
  }

  $: normalizedBookmarkSearch = bookmarkSearch.trim().toLowerCase()
  $: filteredBookmarks = normalizedBookmarkSearch
    ? bookmarks.filter((b) => {
        const catTitle = (categoryTitleById.get(b.category_id) ?? '').toLowerCase()
        return (
          b.title.toLowerCase().includes(normalizedBookmarkSearch) ||
          b.url.toLowerCase().includes(normalizedBookmarkSearch) ||
          catTitle.includes(normalizedBookmarkSearch)
        )
      })
    : bookmarks

  async function handleOpenLogin() {
    await onOpenLogin?.()
  }

  async function handleLogout() {
    await onLogout?.()
  }

  async function handleCreateCategory() {
    await onOpenCreateCategory?.()
  }

  async function handleCreateBookmark(categoryId?: string | number) {
    await onOpenCreateBookmark?.(categoryId)
  }
</script>

<svelte:head>
  <title>管理后台</title>
  <meta name="description" content="CF-Navs 管理后台 MVP" />
</svelte:head>

<div class="admin-page">
  <div class="admin-header-actions">
    {#if canSeeHome}
      <button
        type="button"
        class="icon-button"
        on:click={() => onSwitchToHome?.()}
        title="返回首页"
        aria-label="返回首页"
      >
        🏠
      </button>
    {/if}
    {#if isAuthenticated}
      <button
        type="button"
        class="icon-button"
        on:click={handleLogout}
        disabled={authLoading}
        title="退出登录"
        aria-label="退出登录"
      >
        🚪
      </button>
    {:else}
      <button
        type="button"
        class="icon-button"
        on:click={handleOpenLogin}
        disabled={authLoading}
        title="管理员登录"
        aria-label="管理员登录"
      >
        🔑
      </button>
    {/if}
  </div>

  <header class="page-header">
    <div>
      <p class="eyebrow">管理后台</p>
      <h1>导航内容管理</h1>
    </div>
  </header>

  <!-- 左侧菜单 + 右侧内容布局 -->
  <div class="admin-layout">
    <AdminSidebar
      {activeTab}
      categoriesCount={categories.length}
      bookmarksCount={bookmarks.length}
      onSelect={handleSelectTab}
    />

    <!-- 右侧内容区 -->
    <div class="admin-content">
      {#if activeTab === 'categories'}
        <div class="list-view">
        <!-- 分类管理 -->
        <section class="status-panel">
          <div class="status-item">
            <span class="status-label">登录状态</span>
            <strong>{isAuthenticated ? '已登录' : '未登录'}</strong>
          </div>
          <div class="status-item">
            <span class="status-label">分类数量</span>
            <strong>{categories.length}</strong>
          </div>
          <div class="status-item">
            <span class="status-label">书签数量</span>
            <strong>{bookmarks.length}</strong>
          </div>
        </section>

  <section class="panel list-panel category-list-panel">
      <div class="panel-header list-panel-header">
        <div>
          <p class="panel-eyebrow">分类</p>
          <h2>分类列表</h2>
        </div>
        <div class="header-actions">
          {#if !categorySortMode}
            <button
              type="button"
              class="ghost-button"
              on:click={enterCategorySort}
              disabled={!isAuthenticated || categoriesLoading || authLoading || categories.length < 2}
            >
              排序
            </button>
            <button type="button" class="primary-button" on:click={handleCreateCategory} disabled={!isAuthenticated}>
              新增分类
            </button>
          {/if}
        </div>
      </div>

      <div class="panel-scroll-body">
        {#if categoriesLoading}
          <p class="empty-text">分类加载中...</p>
        {:else if categories.length === 0}
          <p class="empty-text">暂无分类数据</p>
        {:else}
          <div
            class="list-stack"
            class:is-sorting={categorySortMode}
            use:sortableList={{
              enabled: categorySortMode,
              onSort: handleReorderCategories,
            }}
          >
            {#each displayCategories as category (category.id)}
              <article class="compact-card" class:sortable={categorySortMode} data-sortable-item data-sort-id={category.id}>
                {#if categorySortMode}
                  <span class="drag-handle" aria-hidden="true">⋮⋮</span>
                {/if}
                <span class="icon-badge">{category.icon || '📁'}</span>
                <div class="compact-info">
                  <h3>{category.title}</h3>
                  <span class="count-badge">{category.bookmarkCount ?? getBookmarksByCategory(category.id).length} 个书签</span>
                </div>
                {#if !categorySortMode}
                  <div class="inline-actions">
                    <button type="button" class="sm-button" on:click={() => onEditCategory?.(category)} disabled={!isAuthenticated}>
                      编辑
                    </button>
                    <button type="button" class="sm-button" on:click={() => handleCreateBookmark(category.id)} disabled={!isAuthenticated}>
                      加书签
                    </button>
                    <button
                      type="button"
                      class="sm-button danger"
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
        <div class="panel-footer">
          {#if categorySortMode}
            <div class="sort-hint">拖动卡片调整顺序，完成后点击「保存排序」。</div>
          {:else}
            <div class="pagination">
              <span>第 {pageStart(categoryPage, categories.length)}-{pageEnd(categoryPage, categories.length)} 条 / 共 {categories.length} 条</span>
              <div class="pager-actions">
                <button type="button" class="ghost-button compact" on:click={() => categoryPage -= 1} disabled={categoryPage <= 1}>上一页</button>
                <span>{categoryPage} / {categoryTotalPages}</span>
                <button type="button" class="ghost-button compact" on:click={() => categoryPage += 1} disabled={categoryPage >= categoryTotalPages}>下一页</button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>
        </div>
      {:else if activeTab === 'bookmarks'}
        <div class="list-view">
        <!-- 书签管理 -->
    <section class="panel wide-panel list-panel bookmark-list-panel">
      <div class="panel-header list-panel-header">
        <div>
          <p class="panel-eyebrow">书签</p>
          <h2>书签列表</h2>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="ghost-button"
            on:click={enterBookmarkSort}
            disabled={bookmarkSortMode || !isAuthenticated || bookmarksLoading || authLoading || bookmarks.length < 2}
          >
            排序
          </button>
          <button
            type="button"
            class="primary-button"
            on:click={() => handleCreateBookmark()}
            disabled={bookmarkSortMode || !isAuthenticated || categories.length === 0}
          >
            新增书签
          </button>
        </div>
      </div>

      <div class="list-toolbar">
        {#if !bookmarkSortMode}
          <div class="bookmark-search-bar">
            <input
              type="text"
              placeholder="搜索标题、链接或分类…"
              value={bookmarkSearch}
              on:input={handleBookmarkSearchInput}
            />
          </div>
        {/if}
      </div>

      <div class="panel-scroll-body table-scroll-body">
        {#if bookmarksLoading}
          <p class="empty-text">书签加载中...</p>
        {:else if bookmarks.length === 0}
          <p class="empty-text">暂无书签数据</p>
        {:else}
          <div class="table-wrap">
            <table class:is-sorting={bookmarkSortMode}>
            <colgroup>
              {#if bookmarkSortMode}<col style="width: 44px;" />{/if}
              <col />
              <col style="width: 88px;" />
              <col />
              <col style="width: 114px;" />
              {#if !bookmarkSortMode}<col style="width: 122px;" />{/if}
            </colgroup>
            <thead>
              <tr>
                {#if bookmarkSortMode}<th style="width: 44px;">排序</th>{/if}
                <th>标题</th>
                <th style="width: 88px;">分类</th>
                <th>链接</th>
                <th style="width: 114px;">打开方式</th>
                {#if !bookmarkSortMode}<th style="width: 122px;">操作</th>{/if}
              </tr>
            </thead>
            <tbody
              use:sortableList={{
                enabled: bookmarkSortMode,
                onSort: handleReorderBookmarks,
                handle: '[data-drag-handle]',
              }}
            >
              {#each displayBookmarks as bookmark (bookmark.id)}
                <tr data-sortable-item data-sort-id={bookmark.id} class:is-sorting={bookmarkSortMode}>
                  {#if bookmarkSortMode}
                    <td>
                      <button
                        type="button"
                        class="drag-handle"
                        data-drag-handle
                        aria-label={`拖动排序书签 ${bookmark.title}`}
                      >
                        ⋮⋮
                      </button>
                    </td>
                  {/if}
                  <td>
                    <div class="bookmark-cell">
                      <span class="icon-badge small" style={bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}>
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
                  <td class="cat-cell">{getCategoryTitle(bookmark.category_id)}</td>
                  <td class="url-cell">
                    <a href={bookmark.url} target="_blank" rel="noreferrer">{bookmark.url}</a>
                  </td>
                  <td class="method-cell">
                    {bookmark.open_method === 'same_tab' ? '当前标签页' : bookmark.open_method === 'modal' ? '当前页弹层' : '新标签页'}
                  </td>
                  {#if !bookmarkSortMode}
                    <td>
                      <div class="inline-actions compact">
                        <button type="button" class="ghost-button compact" on:click={() => onEditBookmark?.(bookmark)} disabled={!isAuthenticated}>
                          编辑
                        </button>
                        <button
                          type="button"
                          class="danger-button compact"
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
            {#if !bookmarkSortMode && filteredBookmarks.length === 0}
              <p class="empty-text" style="padding: 24px 0; text-align: center;">未找到匹配的书签。</p>
            {/if}
          </div>
        {/if}
      </div>
      {#if bookmarks.length > 0}
        <div class="panel-footer">
          {#if bookmarkSortMode}
            <div class="sort-hint">拖动行调整顺序，完成后点击「保存排序」。</div>
          {:else}
            <div class="pagination">
              <span>第 {pageStart(bookmarkPage, filteredBookmarks.length)}-{pageEnd(bookmarkPage, filteredBookmarks.length)} 条 / 共 {filteredBookmarks.length} 条</span>
              <div class="pager-actions">
                <button type="button" class="ghost-button compact" on:click={() => bookmarkPage -= 1} disabled={bookmarkPage <= 1}>上一页</button>
                <span>{bookmarkPage} / {bookmarkTotalPages}</span>
                <button type="button" class="ghost-button compact" on:click={() => bookmarkPage += 1} disabled={bookmarkPage >= bookmarkTotalPages}>下一页</button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>
        </div>
      {:else if activeTab === 'settings'}
        <!-- 站点设置 -->
  <section class="settings-panel-wrap">
    {#if SettingsPanelComponent}
      <svelte:component
        this={SettingsPanelComponent}
        value={settingsValue}
        loading={settingsLoading}
        saving={settingsSaving}
        error={settingsError}
        onSubmit={onSubmitSettings}
        onChangePassword={onChangePassword}
      />
    {:else}
      <section class="panel">
        <p class="empty-text" style="padding: 24px 0; text-align: center;">Loading settings...</p>
      </section>
    {/if}
  </section>
      {:else if activeTab === 'backup'}
        <BackupPanel
          {isAuthenticated}
          {importing}
          {backupError}
          {backupMessage}
          bind:importSource
          onExportData={onExportData}
          onImportData={onImportData}
        />
      {/if}
    </div>
  </div>

  {#if categorySortMode || bookmarkSortMode}
    <div class="floating-sort-bar" role="toolbar" aria-label="排序操作">
      <span class="floating-sort-hint">
        {categorySortMode ? '正在排序分类' : '正在排序书签'}，拖动调整顺序后保存。
      </span>
      <button
        type="button"
        class="ghost-button"
        on:click={categorySortMode ? cancelCategorySort : cancelBookmarkSort}
        disabled={savingSort}
      >
        取消
      </button>
      <button
        type="button"
        class="primary-button"
        on:click={categorySortMode ? saveCategorySort : saveBookmarkSort}
        disabled={savingSort}
      >
        {#if savingSort}保存中...{:else}保存排序{/if}
      </button>
    </div>
  {/if}
</div>

{#if CategoryEditModalComponent}
  <svelte:component
    this={CategoryEditModalComponent}
    open={categoryModalOpen}
    loading={savingCategory}
    error={categoryError}
    mode={categoryModalMode}
    value={activeCategory}
    onSubmit={onSubmitCategory}
    onCancel={onCloseCategoryModal}
    imageHostUrl={imageHostUrl}
  />
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }

  :global(html[data-theme='dark'] body) {
    background: #08111f;
    color: #e5eefb;
  }

  .admin-page {
    --admin-page-bg: #f8fafc;
    --admin-page-ambient: rgba(59, 130, 246, 0.12);
    --admin-text: #0f172a;
    --admin-muted: #475569;
    --admin-subtle: #64748b;
    --admin-surface: rgba(255, 255, 255, 0.92);
    --admin-surface-strong: rgba(255, 255, 255, 1);
    --admin-border: rgba(148, 163, 184, 0.22);
    --admin-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
    --admin-control-bg: rgba(255, 255, 255, 0.92);
    --admin-control-hover-bg: rgba(255, 255, 255, 1);
    --admin-sidebar-bg: rgba(255, 255, 255, 0.58);
    --admin-sidebar-border: rgba(148, 163, 184, 0.24);
    --admin-sidebar-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
    --admin-nav-bg: rgba(255, 255, 255, 0.74);
    --admin-nav-hover-bg: rgba(255, 255, 255, 0.96);
    --admin-nav-active-bg: rgba(37, 99, 235, 0.11);
    --admin-nav-badge-bg: rgba(148, 163, 184, 0.12);
    --admin-nav-active-badge-bg: rgba(59, 130, 246, 0.15);
    --admin-accent: #2563eb;
    --admin-accent-strong: #1e40af;
    --admin-divider: #e2e8f0;
    --admin-sticky-bg: rgba(255, 255, 255, 0.98);
    --admin-card-bg: #ffffff;
    --admin-card-border: #e2e8f0;
    --admin-card-hover-border: #cbd5e1;
    --admin-badge-bg: #f1f5f9;
    --admin-badge-text: #64748b;
    --admin-icon-badge-bg: #eff6ff;
    --admin-input-bg: #ffffff;
    --admin-input-border: #cbd5e1;
    --admin-input-hover-border: #94a3b8;
    --admin-input-placeholder: #94a3b8;
    --admin-th-bg: #ffffff;
    --admin-sort-highlight-bg: #f8fbff;
    --admin-sort-highlight-border: #bfdbfe;
    --admin-link: #2563eb;
    --admin-danger: #dc2626;
    --admin-danger-bg: #fef2f2;
    --admin-danger-border: #fecaca;
    --admin-danger-hover-bg: #fee2e2;
    --admin-ok: #15803d;
    --admin-ok-bg: #f0fdf4;
    --admin-ok-border: #bbf7d0;
    position: relative;
    min-height: 100dvh;
    height: 100dvh;
    box-sizing: border-box;
    padding: 24px;
    display: grid;
    grid-template-rows: auto 1fr; /* header自动高度，内容占满剩余空间 */
    gap: 16px;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, var(--admin-page-ambient), transparent 28%),
      var(--admin-page-bg);
    color: var(--admin-text);
  }

  :global([data-theme='dark']) .admin-page {
    --admin-page-bg: #08111f;
    --admin-page-ambient: rgba(125, 211, 252, 0.14);
    --admin-text: #e5eefb;
    --admin-muted: #cbd5e1;
    --admin-subtle: #94a3b8;
    --admin-surface: rgba(15, 23, 42, 0.78);
    --admin-surface-strong: rgba(15, 23, 42, 0.92);
    --admin-border: rgba(148, 163, 184, 0.22);
    --admin-shadow: 0 22px 48px rgba(0, 0, 0, 0.26);
    --admin-control-bg: rgba(15, 23, 42, 0.72);
    --admin-control-hover-bg: rgba(30, 41, 59, 0.86);
    --admin-sidebar-bg: rgba(15, 23, 42, 0.58);
    --admin-sidebar-border: rgba(148, 163, 184, 0.22);
    --admin-sidebar-shadow: 0 22px 50px rgba(0, 0, 0, 0.3);
    --admin-nav-bg: rgba(15, 23, 42, 0.5);
    --admin-nav-hover-bg: rgba(30, 41, 59, 0.72);
    --admin-nav-active-bg: rgba(125, 211, 252, 0.13);
    --admin-nav-badge-bg: rgba(148, 163, 184, 0.16);
    --admin-nav-active-badge-bg: rgba(125, 211, 252, 0.18);
    --admin-accent: #7dd3fc;
    --admin-accent-strong: #bae6fd;
    --admin-divider: rgba(148, 163, 184, 0.2);
    --admin-sticky-bg: rgba(15, 23, 42, 0.92);
    --admin-card-bg: rgba(15, 23, 42, 0.6);
    --admin-card-border: rgba(148, 163, 184, 0.2);
    --admin-card-hover-border: rgba(148, 163, 184, 0.38);
    --admin-badge-bg: rgba(148, 163, 184, 0.16);
    --admin-badge-text: #94a3b8;
    --admin-icon-badge-bg: rgba(125, 211, 252, 0.14);
    --admin-input-bg: rgba(15, 23, 42, 0.72);
    --admin-input-border: rgba(148, 163, 184, 0.32);
    --admin-input-hover-border: rgba(148, 163, 184, 0.5);
    --admin-input-placeholder: #64748b;
    --admin-th-bg: #0f1c30;
    --admin-sort-highlight-bg: rgba(125, 211, 252, 0.08);
    --admin-sort-highlight-border: rgba(125, 211, 252, 0.32);
    --admin-link: #7dd3fc;
    --admin-danger: #f87171;
    --admin-danger-bg: rgba(248, 113, 113, 0.12);
    --admin-danger-border: rgba(248, 113, 113, 0.32);
    --admin-danger-hover-bg: rgba(248, 113, 113, 0.2);
    --admin-ok: #4ade80;
    --admin-ok-bg: rgba(74, 222, 128, 0.12);
    --admin-ok-border: rgba(74, 222, 128, 0.32);
  }

  .admin-header-actions {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 50;
    display: flex;
    gap: 0.5rem;
  }

  .icon-button {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid var(--admin-border);
    border-radius: 0.75rem;
    background: var(--admin-control-bg);
    color: var(--admin-text);
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  }

  .icon-button:hover:not(:disabled) {
    background: var(--admin-control-hover-bg);
    border-color: color-mix(in srgb, var(--admin-accent) 52%, var(--admin-border));
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .page-header,
  .panel,
  .status-panel {
    border: 1px solid var(--admin-border);
    border-radius: 18px;
    background: var(--admin-surface);
    box-shadow: var(--admin-shadow);
  }

  .page-header {
    min-height: 64px;
    display: flex;
    align-items: center;
    padding: 14px 18px;
  }

  .page-header .eyebrow {
    margin-bottom: 4px;
    font-size: 11px;
  }

  /* 左侧菜单 + 右侧内容布局 */
  .admin-layout {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    min-height: 0;
    overflow: hidden;
  }

  .admin-content {
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-right: 4px;
  }

  .list-view {
    display: grid;
    grid-template-rows: auto auto;
    gap: 16px;
    min-height: 0;
    height: auto;
    align-content: start;
  }

  .list-view > .list-panel:only-child {
    grid-row: auto;
  }

  .eyebrow,
  .panel-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--admin-subtle);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: 24px;
    line-height: 1.18;
    margin-bottom: 0;
  }

  h2 {
    font-size: 22px;
  }

  h3 {
    font-size: 18px;
    margin-bottom: 6px;
  }



  .status-panel {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding: 16px 18px;
  }

  .status-item {
    display: grid;
    gap: 8px;
  }

  .status-label {
    color: var(--admin-subtle);
    font-size: 13px;
  }

  .panel {
    padding: 18px;
  }

  .list-panel {
    display: grid;
    min-height: 0;
    height: auto;
    align-self: start;
    padding: 0;
    overflow: hidden;
  }

  .category-list-panel {
    grid-template-rows: auto minmax(0, auto) auto;
  }

  .bookmark-list-panel {
    grid-template-rows: auto auto minmax(0, auto) auto;
  }

  .wide-panel {
    min-width: 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
  }

  .list-panel-header {
    position: sticky;
    top: 0;
    z-index: 12;
    margin: 0;
    padding: 16px 18px 12px;
    border-bottom: 1px solid var(--admin-divider);
    background: var(--admin-sticky-bg);
  }

  .list-toolbar {
    position: sticky;
    top: 0;
    z-index: 11;
    padding: 10px 18px;
    border-bottom: 1px solid var(--admin-divider);
    background: var(--admin-sticky-bg);
  }

  .panel-scroll-body {
    min-height: 0;
    overflow: auto;
    padding: 12px 18px;
  }

  .table-scroll-body {
    padding: 0;
    overflow: auto;
  }

  .panel-footer {
    border-top: 1px solid var(--admin-divider);
    background: var(--admin-sticky-bg);
    padding: 10px 18px;
  }

  .list-stack {
    display: grid;
    gap: 8px;
  }

  /* 紧凑分类卡片 — 单行布局 */
  .compact-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--admin-card-border);
    border-radius: 12px;
    background: var(--admin-card-bg);
    transition: border-color 0.15s ease;
  }

  .compact-card:hover {
    border-color: var(--admin-card-hover-border);
  }

  .compact-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .compact-info h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--admin-text);
  }

  .count-badge {
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--admin-badge-bg);
    color: var(--admin-badge-text);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .bookmark-cell {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .drag-handle {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border: 1px solid var(--admin-card-border);
    border-radius: 8px;
    background: var(--admin-card-bg);
    color: var(--admin-subtle);
    cursor: grab;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-size: 11px;
    line-height: 1;
    user-select: none;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .drag-handle:disabled {
    cursor: not-allowed;
  }

  [data-sortable-item] {
    touch-action: manipulation;
  }

  /* 排序模式：面板头部按钮组 */
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  /* 悬浮排序操作栏：固定在视口底部，长列表滚动时也能直接点保存 */
  .floating-sort-bar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 32px);
    padding: 10px 14px;
    border: 1px solid var(--admin-border);
    border-radius: 16px;
    background: var(--admin-sticky-bg);
    box-shadow: var(--admin-shadow);
  }

  .floating-sort-hint {
    color: var(--admin-muted);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sort-hint {
    color: var(--admin-subtle);
    font-size: 12px;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--admin-subtle);
    font-size: 13px;
  }

  .pager-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  /* 排序模式下的分类卡片：整卡可拖，禁用文本选中 */
  .compact-card.sortable {
    cursor: grab;
    user-select: none;
    border-color: var(--admin-sort-highlight-border);
    background: var(--admin-sort-highlight-bg);
  }

  .compact-card.sortable:active {
    cursor: grabbing;
  }

  .list-stack.is-sorting .compact-card {
    transition: none;
  }

  tr.is-sorting {
    background: var(--admin-sort-highlight-bg);
  }

  /* SortableJS 拖拽态：稳定占位、抑制抖动 */
  :global(.sortable-ghost) {
    opacity: 0.35;
  }

  :global(.sortable-chosen) {
    cursor: grabbing;
  }

  :global(.sortable-drag) {
    opacity: 1 !important;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
  }

  .bookmark-cell p,
  .empty-text {
    color: var(--admin-subtle);
    line-height: 1.5;
  }

  .icon-badge {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--admin-icon-badge-bg);
    font-size: 14px;
  }

  .icon-badge.small {
    width: 34px;
    height: 34px;
    font-size: 16px;
  }

  .inline-actions {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .inline-actions.compact {
    justify-content: flex-end;
  }

  /* 紧凑型按钮 — 分类列表行内使用 */
  .sm-button {
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

  .sm-button:hover:not(:disabled) {
    border-color: var(--admin-input-hover-border);
    background: var(--admin-nav-hover-bg);
  }

  .sm-button.danger {
    border-color: var(--admin-danger-border);
    background: var(--admin-danger-bg);
    color: var(--admin-danger);
  }

  .sm-button.danger:hover:not(:disabled) {
    background: var(--admin-danger-hover-bg);
  }

  .sm-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .table-wrap {
    min-height: 0;
    overflow: visible;
  }

  .bookmark-search-bar {
    margin: 0;
  }

  .bookmark-search-bar input {
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

  .bookmark-search-bar input:focus {
    outline: none;
    border-color: var(--admin-accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .bookmark-search-bar input::placeholder {
    color: var(--admin-input-placeholder);
  }

  table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 10px 10px;
    text-align: left;
    border-bottom: 1px solid var(--admin-divider);
    vertical-align: middle;
    font-size: 13px;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 8;
    background: var(--admin-th-bg);
    font-size: 12px;
    color: var(--admin-subtle);
    font-weight: 600;
  }

  td a {
    color: var(--admin-link);
    text-decoration: none;
    word-break: break-all;
  }

  .cat-cell {
    white-space: nowrap;
    color: var(--admin-muted);
  }

  .url-cell {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .url-cell a {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .method-cell {
    white-space: nowrap;
    color: var(--admin-muted);
  }

  .settings-panel-wrap {
    min-width: 0;
    width: min(100%, 1320px);
    margin: 0 auto 24px;
  }

  .primary-button,
  .ghost-button,
  .danger-button {
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: 0.18s ease;
  }

  .primary-button {
    border: none;
    background: #2563eb;
    color: #ffffff;
  }

  .ghost-button {
    border: 1px solid var(--admin-input-border);
    background: var(--admin-control-bg);
    color: var(--admin-text);
  }

  .ghost-button:hover:not(:disabled) {
    border-color: var(--admin-input-hover-border);
    background: var(--admin-control-hover-bg);
  }

  .ghost-button.compact {
    padding: 5px 10px;
    font-size: 12px;
    border-radius: 8px;
  }

  .danger-button {
    border: 1px solid var(--admin-danger-border);
    background: var(--admin-danger-bg);
    color: var(--admin-danger);
  }

  .danger-button.compact {
    padding: 5px 10px;
    font-size: 12px;
    border-radius: 8px;
  }

  .primary-button:disabled,
  .ghost-button:disabled,
  .danger-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 960px) {
    .admin-page {
      padding: 20px;
    }

    .admin-layout {
      gap: 16px;
    }

    .admin-content {
      gap: 16px;
    }

    .list-view {
      gap: 16px;
    }

    .admin-header-actions {
      top: 20px;
      right: 20px;
    }

    .icon-button {
      width: 2.2rem;
      height: 2.2rem;
      font-size: 1rem;
    }

    .page-header,
    .panel-header {
      grid-template-columns: 1fr;
    }

    .page-header,
    .panel-header,
    .status-panel {
      display: grid;
    }

    .status-panel {
      grid-template-columns: 1fr;
    }

    .list-panel-header,
    .list-toolbar,
    .panel-footer {
      padding-left: 16px;
      padding-right: 16px;
    }

    .panel-scroll-body {
      padding-left: 16px;
      padding-right: 16px;
    }

    .table-scroll-body {
      padding: 0;
    }

    .pagination {
      align-items: flex-start;
      flex-direction: column;
    }

    .floating-sort-bar {
      bottom: 16px;
    }

    .inline-actions.compact {
      justify-content: flex-start;
    }

    /* 小屏时按钮文字缩略 */
    .compact-card {
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px 10px;
    }

    .compact-info {
      min-width: 0;
      flex: 1 1 auto;
    }

    .inline-actions {
      width: auto;
    }
  }
</style>
