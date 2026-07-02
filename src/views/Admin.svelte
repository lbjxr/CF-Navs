<script context="module" lang="ts">
  export type AdminCategory = {
    id: string | number
    title: string
    icon?: string
    bookmarkCount?: number
  }

  export type AdminBookmark = {
    id: string | number
    category_id: string | number
    title: string
    url: string
    icon?: string
    icon_source?: string
    icon_background_color?: string
    icon_blob?: string
    description?: string
    open_method?: 'same_tab' | 'new_tab' | 'modal'
  }

  export type CategoryFormValue = {
    id?: string | number
    title: string
    icon: string
  }

  export type BookmarkFormValue = {
    id?: string | number
    category_id?: string | number
    title: string
    url: string
    icon: string
    icon_source: string
    icon_background_color: string
    description: string
    open_method: 'same_tab' | 'new_tab' | 'modal'
  }
</script>

<script lang="ts">
  import type { Settings } from '../../shared/types'
  import type { ImportSource } from '../lib/importData'
  import { iconifyProxyIcon, isIconifyIconUrl } from '../lib/icons'
  import { sortableList, type SortHandler } from '../lib/sortableList'
  import CachedBookmarkIcon from '../components/CachedBookmarkIcon.svelte'
  import CategoryEditModal from '../components/CategoryEditModal.svelte'
  import SettingsPanel from '../components/SettingsPanel.svelte'

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
  export let settingsValue: Partial<
    Pick<
      Settings,
      | 'site_title'
      | 'site_title_color'
      | 'site_title_font_size'
      | 'public_mode'
      | 'theme'
      | 'background_preset_id'
      | 'custom_css'
      | 'custom_js'
      | 'image_host_url'
      | 'background'
      | 'backgrounds'
      | 'search_engine'
      | 'card_size'
      | 'card_style'
      | 'card_icon_size'
      | 'card_show_description'
      | 'card_background_color'
      | 'card_background_opacity'
      | 'card_icon_show_title'
      | 'card_text_color'
      | 'search_box_show'
      | 'search_engine_selector_show'
      | 'content_layout'
      | 'footer_html'
    >
  > | null = null
  export let categoryModalMode: 'create' | 'edit' = 'create'
  export let activeCategory: Partial<CategoryFormValue> | null = null
  export let canSeeHome = false

  // 左侧菜单导航状态
  let activeTab: 'categories' | 'bookmarks' | 'settings' | 'backup' = 'categories'

  $: imageHostUrl = settingsValue?.image_host_url ?? ''

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
  export let onSubmitSettings:
    | ((
        payload: Pick<
          Settings,
          | 'site_title'
          | 'site_title_color'
          | 'site_title_font_size'
          | 'public_mode'
          | 'theme'
          | 'background_preset_id'
          | 'custom_css'
          | 'custom_js'
          | 'image_host_url'
          | 'background'
          | 'backgrounds'
          | 'search_engine'
          | 'card_size'
          | 'card_style'
          | 'card_icon_size'
          | 'card_show_description'
          | 'card_background_color'
          | 'card_background_opacity'
          | 'card_icon_show_title'
          | 'card_text_color'
          | 'search_box_show'
          | 'search_engine_selector_show'
          | 'content_layout'
          | 'footer_html'
        >,
      ) => AsyncVoid)
    | undefined = undefined
  export let onSortCategories: SortHandler | undefined = undefined
  export let onSortBookmarks: SortHandler | undefined = undefined

  export let importing = false
  export let backupError = ''
  export let backupMessage = ''
  export let onExportData: (() => AsyncVoid) | undefined = undefined
  export let onImportData: ((file: File, source: ImportSource) => AsyncVoid) | undefined = undefined

  let importInput: HTMLInputElement | null = null
  let importSource: ImportSource = 'cf-navs'

  function triggerImport() {
    importInput?.click()
  }

  async function handleImportChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file && onImportData) {
      await onImportData(file, importSource)
    }
    input.value = ''
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

  $: filteredBookmarks = bookmarkSearch.trim()
    ? bookmarks.filter((b) => {
        const q = bookmarkSearch.trim().toLowerCase()
        const catTitle = getCategoryTitle(b.category_id).toLowerCase()
        return (
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          catTitle.includes(q)
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
    <!-- 左侧菜单 -->
    <nav class="admin-sidebar">
      <button
        type="button"
        class="nav-item"
        class:active={activeTab === 'categories'}
        on:click={() => activeTab = 'categories'}
      >
        <span class="nav-icon">📁</span>
        <span class="nav-label">分类管理</span>
        <span class="nav-badge">{categories.length}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        class:active={activeTab === 'bookmarks'}
        on:click={() => activeTab = 'bookmarks'}
      >
        <span class="nav-icon">🔖</span>
        <span class="nav-label">书签管理</span>
        <span class="nav-badge">{bookmarks.length}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        class:active={activeTab === 'settings'}
        on:click={() => activeTab = 'settings'}
      >
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">站点设置</span>
      </button>

      <button
        type="button"
        class="nav-item"
        class:active={activeTab === 'backup'}
        on:click={() => activeTab = 'backup'}
      >
        <span class="nav-icon">💾</span>
        <span class="nav-label">数据备份</span>
      </button>
    </nav>

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
    <SettingsPanel
      value={settingsValue}
      loading={settingsLoading}
      saving={settingsSaving}
      error={settingsError}
      onSubmit={onSubmitSettings}
    />
  </section>
      {:else if activeTab === 'backup'}
        <!-- 数据备份 -->
  <section class="panel backup-panel">
    <div class="panel-header">
      <div>
        <p class="panel-eyebrow">数据备份</p>
        <h2>导入 / 导出</h2>
      </div>
    </div>
    <p class="backup-desc">
      导出会把当前全部分类、书签与站点设置保存为一个 JSON 文件；导入会用所选文件
      <strong>覆盖</strong>现有的分类与书签（管理员账号不受影响）。
    </p>

    {#if backupError}
      <p class="backup-alert error">{backupError}</p>
    {:else if backupMessage}
      <p class="backup-alert ok">{backupMessage}</p>
    {/if}

    <div class="backup-actions">
      <label class="import-source-field" for="import-source">
        <span>导入来源</span>
        <select id="import-source" bind:value={importSource} disabled={!isAuthenticated || importing}>
          <option value="cf-navs">CF-Navs 备份</option>
          <option value="sunpanel">SunPanel 导出</option>
        </select>
      </label>
      <button type="button" class="primary-button" on:click={() => onExportData?.()} disabled={!isAuthenticated}>
        导出备份
      </button>
      <button type="button" class="ghost-button" on:click={triggerImport} disabled={!isAuthenticated || importing}>
        {#if importing}导入中...{:else}导入备份{/if}
      </button>
      <input
        bind:this={importInput}
        class="import-input"
        type="file"
        accept="application/json,.json,.sun-panel.json,.sunpanel.json"
        on:change={handleImportChange}
      />
    </div>
  </section>
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

<CategoryEditModal
  open={categoryModalOpen}
  loading={savingCategory}
  error={categoryError}
  mode={categoryModalMode}
  value={activeCategory}
  onSubmit={onSubmitCategory}
  onCancel={onCloseCategoryModal}
  imageHostUrl={imageHostUrl}
/>

<style>
  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }

  .admin-page {
    position: relative;
    min-height: 100dvh;
    height: 100dvh;
    box-sizing: border-box;
    padding: 32px;
    display: grid;
    grid-template-rows: auto 1fr; /* header自动高度，内容占满剩余空间 */
    gap: 24px;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 28%),
      #f8fafc;
  }

  .admin-header-actions {
    position: fixed;
    top: 32px;
    right: 32px;
    z-index: 50;
    display: flex;
    gap: 0.5rem;
  }

  .icon-button {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.92);
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
    background: rgba(255, 255, 255, 1);
    border-color: rgba(37, 99, 235, 0.45);
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
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
  }

  .page-header {
    padding: 28px;
  }

  /* 左侧菜单 + 右侧内容布局 */
  .admin-layout {
    display: flex;
    gap: 24px;
    align-items: flex-start;
    min-height: 0;
    overflow: hidden;
  }

  .admin-sidebar {
    flex-shrink: 0;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: sticky;
    top: 32px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.92);
    color: #475569;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 1);
    border-color: rgba(59, 130, 246, 0.35);
    color: #1e293b;
  }

  .nav-item.active {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.45);
    color: #1e40af;
  }

  .nav-icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .nav-label {
    flex: 1;
  }

  .nav-badge {
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(148, 163, 184, 0.12);
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
  }

  .nav-item.active .nav-badge {
    background: rgba(59, 130, 246, 0.15);
    color: #1e40af;
  }

  .admin-content {
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding-right: 4px;
  }

  .list-view {
    display: grid;
    grid-template-rows: auto auto;
    gap: 24px;
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
    color: #64748b;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-size: 32px;
    margin-bottom: 10px;
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
    gap: 16px;
    padding: 22px 24px;
  }

  .status-item {
    display: grid;
    gap: 8px;
  }

  .status-label {
    color: #64748b;
    font-size: 13px;
  }

  .panel {
    padding: 24px;
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
    gap: 16px;
    margin-bottom: 18px;
  }

  .list-panel-header {
    position: sticky;
    top: 0;
    z-index: 12;
    margin: 0;
    padding: 20px 24px 14px;
    border-bottom: 1px solid #e2e8f0;
    background: rgba(255, 255, 255, 0.98);
  }

  .list-toolbar {
    position: sticky;
    top: 0;
    z-index: 11;
    padding: 12px 24px;
    border-bottom: 1px solid #e2e8f0;
    background: rgba(255, 255, 255, 0.98);
  }

  .panel-scroll-body {
    min-height: 0;
    overflow: auto;
    padding: 14px 24px;
  }

  .table-scroll-body {
    padding: 0;
    overflow: auto;
  }

  .panel-footer {
    border-top: 1px solid #e2e8f0;
    background: rgba(255, 255, 255, 0.98);
    padding: 12px 24px;
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
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
    transition: border-color 0.15s ease;
  }

  .compact-card:hover {
    border-color: #cbd5e1;
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
    color: #0f172a;
  }

  .count-badge {
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 10px;
    background: #f1f5f9;
    color: #64748b;
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
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    color: #94a3b8;
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
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 18px 46px rgba(15, 23, 42, 0.22);
  }

  .floating-sort-hint {
    color: #475569;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sort-hint {
    color: #64748b;
    font-size: 12px;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #64748b;
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
    border-color: #bfdbfe;
    background: #f8fbff;
  }

  .compact-card.sortable:active {
    cursor: grabbing;
  }

  .list-stack.is-sorting .compact-card {
    transition: none;
  }

  tr.is-sorting {
    background: #f8fbff;
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
    color: #64748b;
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
    background: #eff6ff;
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
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    white-space: nowrap;
  }

  .sm-button:hover:not(:disabled) {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .sm-button.danger {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .sm-button.danger:hover:not(:disabled) {
    background: #fee2e2;
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
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .bookmark-search-bar input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .bookmark-search-bar input::placeholder {
    color: #94a3b8;
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
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
    font-size: 13px;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 8;
    background: #ffffff;
    font-size: 12px;
    color: #64748b;
    font-weight: 600;
  }

  td a {
    color: #2563eb;
    text-decoration: none;
    word-break: break-all;
  }

  .cat-cell {
    white-space: nowrap;
    color: #475569;
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
    color: #475569;
  }

  .settings-panel-wrap {
    min-width: 0;
    width: min(100%, 1320px);
    margin: 0 auto 24px;
  }

  .backup-desc {
    color: #475569;
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }


  .import-source-field {
    display: inline-grid;
    gap: 6px;
    min-width: 180px;
  }

  .import-source-field span {
    color: #475569;
    font-size: 13px;
    font-weight: 600;
  }

  .import-source-field select {
    min-height: 39px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    background: #ffffff;
    color: #0f172a;
    font: inherit;
    padding: 8px 12px;
  }
  .import-input {
    display: none;
  }

  .backup-alert {
    margin: 0 0 14px;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
  }

  .backup-alert.error {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #b91c1c;
  }

  .backup-alert.ok {
    border: 1px solid #bbf7d0;
    background: #f0fdf4;
    color: #15803d;
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
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .ghost-button.compact {
    padding: 5px 10px;
    font-size: 12px;
    border-radius: 8px;
  }

  .danger-button {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
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

    .admin-sidebar {
      width: 164px;
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
