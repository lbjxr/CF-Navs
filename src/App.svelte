<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import type {
    Bookmark,
    BookmarkUpsertReq,
    Category,
    CategoryUpsertReq,
    IconSource,
    PublicData,
    PublicSettings,
    Settings,
  } from '../shared/types'
  import Home from './views/Home.svelte'
  import { api, getErrorMessage } from './lib/api'
  import { colorToRgbString } from './lib/color'
  import { prepareImportPayload, type ImportSource } from './lib/importData'
  import { adminStore, authStore, configStore, isAuthenticated, publicStore } from './lib/stores'

  type AppView = 'home' | 'admin'

  type CategoryFormValue = {
    id?: string | number
    title: string
    icon: string
  }

  type BookmarkFormValue = {
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

  let booting = true
  let rootError = ''
  let currentView: AppView = 'home'
  let AdminComponent: typeof import('./views/Admin.svelte').default | null = null
  let BookmarkEditModalComponent: typeof import('./components/BookmarkEditModal.svelte').default | null = null
  let adminComponentPromise: Promise<void> | null = null
  let bookmarkEditModalPromise: Promise<void> | null = null

  let loginModalOpen = false
  let categoryModalOpen = false
  let bookmarkModalOpen = false

  let categoryModalMode: 'create' | 'edit' = 'create'
  let bookmarkModalMode: 'create' | 'edit' = 'create'

  let activeCategory: Partial<CategoryFormValue> | null = null
  let activeBookmark: Partial<BookmarkFormValue> | null = null

  let savingCategory = false
  let savingBookmark = false
  let savingSettings = false
  let deletingCategoryId: number | null = null
  let deletingBookmarkId: number | null = null

  let categoryError = ''
  let bookmarkError = ''
  let settingsError = ''

  let importing = false
  let backupError = ''
  let backupMessage = ''

  $: config = $configStore.data
  $: publicData = $publicStore.data
  $: adminData = $adminStore.data
  $: canSeeHome = Boolean(config?.public_mode || $isAuthenticated)
  $: homeTitle = publicData?.settings.site_title ?? config?.site_title ?? 'CF-Navs'
  function toAdminCategories(categories: Category[], bookmarks: Bookmark[]): Array<{
    id: string | number
    title: string
    icon?: string
    bookmarkCount?: number
  }> {
    const bookmarkCountByCategory = new Map<number, number>()
    for (const bookmark of bookmarks) {
      bookmarkCountByCategory.set(
        bookmark.category_id,
        (bookmarkCountByCategory.get(bookmark.category_id) ?? 0) + 1,
      )
    }

    return categories.map((category) => ({
      id: category.id,
      title: category.title,
      icon: category.icon ?? '',
      bookmarkCount: bookmarkCountByCategory.get(category.id) ?? 0,
    }))
  }

  function toAdminBookmarks(bookmarks: Bookmark[]): Array<{
    id: string | number
    category_id: string | number
    title: string
    url: string
    icon?: string
    icon_source?: string
    icon_background_color?: string
    description?: string
    open_method?: 'same_tab' | 'new_tab' | 'modal'
  }> {
    return bookmarks.map((bookmark) => ({
      id: bookmark.id,
      category_id: bookmark.category_id,
      title: bookmark.title,
      url: bookmark.url,
      icon: bookmark.icon ?? '',
      icon_source: bookmark.icon_source ?? '',
      icon_background_color: bookmark.icon_background_color ?? '',
      description: bookmark.description ?? '',
      open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
    }))
  }

  type SettingsSubset = Pick<
    Settings,
    'site_title' | 'site_title_color' | 'site_title_font_size' | 'public_mode' | 'theme' | 'image_host_url' | 'background' | 'search_engine' | 'card_size' | 'card_style' | 'card_icon_size' | 'card_show_description' | 'card_background_color' | 'card_background_opacity' | 'card_icon_show_title' | 'card_text_color' | 'search_box_show' | 'search_engine_selector_show' | 'content_layout' | 'footer_html'
  >

  function toSettingsForm(settings: Settings | null): SettingsSubset | null {
    if (!settings) return null

    return {
      site_title: settings.site_title,
      site_title_color: settings.site_title_color,
      site_title_font_size: settings.site_title_font_size,
      public_mode: settings.public_mode,
      theme: settings.theme,
      image_host_url: settings.image_host_url,
      background: settings.background,
      search_engine: settings.search_engine,
      card_size: settings.card_size,
      card_style: settings.card_style,
      card_icon_size: settings.card_icon_size,
      card_show_description: settings.card_show_description,
      card_background_color: settings.card_background_color,
      card_background_opacity: settings.card_background_opacity,
      card_icon_show_title: settings.card_icon_show_title,
      card_text_color: settings.card_text_color,
      search_box_show: settings.search_box_show,
      search_engine_selector_show: settings.search_engine_selector_show,
      content_layout: settings.content_layout,
      footer_html: settings.footer_html,
    }
  }

  function toPublicSettings(settings: Settings): PublicSettings {
    return {
      site_title: settings.site_title,
      site_title_color: settings.site_title_color,
      site_title_font_size: settings.site_title_font_size,
      theme: settings.theme,
      background: settings.background,
      custom_css: settings.custom_css,
      custom_js: settings.custom_js,
      search_engine: settings.search_engine,
      image_host_url: settings.image_host_url,
      card_size: settings.card_size,
      card_style: settings.card_style,
      card_icon_size: settings.card_icon_size,
      card_show_description: settings.card_show_description,
      card_background_color: settings.card_background_color,
      card_background_opacity: settings.card_background_opacity,
      card_icon_show_title: settings.card_icon_show_title,
      card_text_color: settings.card_text_color,
      search_box_show: settings.search_box_show,
      search_engine_selector_show: settings.search_engine_selector_show,
      content_layout: settings.content_layout,
      footer_html: settings.footer_html,
    }
  }

  $: adminCategories = toAdminCategories(adminData.categories, adminData.bookmarks)
  $: adminBookmarks = toAdminBookmarks(adminData.bookmarks)
  $: settingsValue = toSettingsForm(adminData.settings)

  $: if (!booting && currentView === 'home' && !canSeeHome) {
    void ensureAdminComponent()
    currentView = 'admin'
  }

  function buildHomeBackground(settings: PublicSettings | null): string {
    if (!settings) return ''

    const background = settings.background
    const blur = Math.min(40, Math.max(0, Number(background.blur) || 0))
    const mask = Math.min(1, Math.max(0, Number(background.mask) ?? 0.3))
    const maskColor = background.maskColor?.trim() || '#000000'

    let layer = background.value
    if (background.type === 'image' && background.value) {
      layer = `url("${background.value}") center / cover no-repeat fixed`
    }

    // 卡片背景色转 RGB（用于 CSS rgb() 函数）
    const cardColor = settings.card_background_color?.trim() || '#ffffff'
    const cardOpacity = typeof settings.card_background_opacity === 'number'
      ? Math.min(1, Math.max(0, settings.card_background_opacity))
      : 0.9
    const cardRgb = colorToRgbString(cardColor)

    return [
      `--home-background: ${layer};`,
      `--home-background-blur: ${blur}px;`,
      `--home-background-mask: ${mask};`,
      `--home-background-mask-color: ${maskColor};`,
      `--card-bg-rgb: ${cardRgb};`,
      `--card-bg-opacity: ${cardOpacity};`,
    ].join(' ')
  }

  let systemPrefersDark = false
  let mediaQuery: MediaQueryList | null = null
  let handleSystemThemeChange: ((event: MediaQueryListEvent) => void) | null = null

  $: themeMode = publicData?.settings.theme ?? 'auto'
  $: activeTheme = themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode

  $: homeBackgroundStyle = buildHomeBackground(publicData?.settings ?? null)

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = activeTheme
  }

  function isLoggedIn(): boolean {
    return Boolean(get(authStore).session)
  }

  function ensureAdminComponent(): Promise<void> {
    if (AdminComponent) return Promise.resolve()
    if (!adminComponentPromise) {
      adminComponentPromise = import('./views/Admin.svelte').then((module) => {
        AdminComponent = module.default
      })
    }
    return adminComponentPromise
  }

  function ensureBookmarkEditModalComponent(): Promise<void> {
    if (BookmarkEditModalComponent) return Promise.resolve()
    if (!bookmarkEditModalPromise) {
      bookmarkEditModalPromise = import('./components/BookmarkEditModal.svelte').then((module) => {
        BookmarkEditModalComponent = module.default
      })
    }
    return bookmarkEditModalPromise
  }

  async function refreshPublicData(): Promise<PublicData | null> {
    if (get(configStore).data?.public_mode || isLoggedIn()) {
      try {
        return await publicStore.refresh()
      } catch (error) {
        rootError = getErrorMessage(error)
        return null
      }
    } else {
      publicStore.reset()
      return null
    }
  }

  function syncAdminListsFromPublic(data: PublicData | null): void {
    if (!data || !isLoggedIn()) return
    adminStore.setCategories(data.categories)
    adminStore.setBookmarks(data.bookmarks)
  }

  function updatePublicDataLocally(transform: (data: PublicData) => PublicData): boolean {
    const current = get(publicStore).data
    if (!current) return false

    const next = transform(current)
    publicStore.setData(next)
    syncAdminListsFromPublic(next)
    return true
  }

  async function refreshListsWhenLocalDataMissing(): Promise<void> {
    if (!get(publicStore).data) {
      syncAdminListsFromPublic(await refreshPublicData())
    }
  }

  async function applyLocalCategoryUpsert(category: Category): Promise<void> {
    const updated = updatePublicDataLocally((data) => {
      const exists = data.categories.some((item) => item.id === category.id)
      const categories = exists
        ? data.categories.map((item) => (item.id === category.id ? category : item))
        : [...data.categories, category]

      return { ...data, categories }
    })

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  async function applyLocalCategoryDelete(categoryId: number): Promise<void> {
    const updated = updatePublicDataLocally((data) => ({
      ...data,
      categories: data.categories.filter((item) => item.id !== categoryId),
      bookmarks: data.bookmarks.filter((item) => item.category_id !== categoryId),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  async function applyLocalBookmarkUpsert(bookmark: Bookmark): Promise<void> {
    const updated = updatePublicDataLocally((data) => {
      const exists = data.bookmarks.some((item) => item.id === bookmark.id)
      const bookmarks = exists
        ? data.bookmarks.map((item) => (item.id === bookmark.id ? bookmark : item))
        : [...data.bookmarks, bookmark]

      return { ...data, bookmarks }
    })

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  async function applyLocalBookmarkDelete(bookmarkId: number): Promise<void> {
    const updated = updatePublicDataLocally((data) => ({
      ...data,
      bookmarks: data.bookmarks.filter((item) => item.id !== bookmarkId),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  async function applyLocalCategorySort(ids: number[]): Promise<void> {
    const sortById = new Map(ids.map((id, index) => [id, index]))
    const updated = updatePublicDataLocally((data) => ({
      ...data,
      categories: data.categories
        .map((category) => (
          sortById.has(category.id)
            ? { ...category, sort: sortById.get(category.id) ?? category.sort }
            : category
        ))
        .sort((a, b) => a.sort - b.sort || a.id - b.id),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  async function applyLocalBookmarkSort(ids: number[]): Promise<void> {
    const sortById = new Map(ids.map((id, index) => [id, index]))
    const updated = updatePublicDataLocally((data) => ({
      ...data,
      bookmarks: data.bookmarks
        .map((bookmark) => (
          sortById.has(bookmark.id)
            ? { ...bookmark, sort: sortById.get(bookmark.id) ?? bookmark.sort }
            : bookmark
        ))
        .sort((a, b) => a.sort - b.sort || a.id - b.id),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
  }

  function applyLocalSettings(settings: Settings): void {
    adminStore.setSettings(settings)
    configStore.setData({
      site_title: settings.site_title,
      public_mode: settings.public_mode,
    })

    const current = get(publicStore).data
    if (current) {
      publicStore.setData({
        ...current,
        settings: toPublicSettings(settings),
      })
    }
  }

  async function refreshLoggedInData(): Promise<void> {
    const [publicResult, settingsResult] = await Promise.allSettled([
      publicStore.refresh(),
      api.settings.get(),
    ])

    if (publicResult.status === 'fulfilled' && settingsResult.status === 'fulfilled') {
      adminStore.replaceData({
        categories: publicResult.value.categories,
        bookmarks: publicResult.value.bookmarks,
        settings: settingsResult.value,
      })
      return
    }

    throw publicResult.status === 'rejected'
      ? publicResult.reason
      : settingsResult.status === 'rejected'
        ? settingsResult.reason
        : new Error('failed to load admin data')
  }

  async function initializeApp(): Promise<void> {
    booting = true
    rootError = ''

    const [configResult, authResult] = await Promise.allSettled([
      configStore.refresh(),
      authStore.initialize(),
    ])

    if (configResult.status === 'rejected') {
      rootError = getErrorMessage(configResult.reason)
      booting = false
      return
    }

    if (authResult.status === 'rejected') {
      rootError = getErrorMessage(authResult.reason)
    }

    if (isLoggedIn()) {
      try {
        await refreshLoggedInData()
      } catch (error) {
        rootError = getErrorMessage(error)
      }
    } else {
      adminStore.reset()
      await refreshPublicData()
    }

    const nextView: AppView = get(configStore).data?.public_mode === false && !isLoggedIn() ? 'admin' : 'home'
    if (nextView === 'admin') {
      await ensureAdminComponent()
    }
    currentView = nextView
    booting = false
  }

  function resetCategoryState(): void {
    categoryModalOpen = false
    categoryModalMode = 'create'
    activeCategory = null
    categoryError = ''
    savingCategory = false
  }

  function resetSettingsState(): void {
    settingsError = ''
    savingSettings = false
  }

  function resetBookmarkState(): void {
    bookmarkModalOpen = false
    bookmarkModalMode = 'create'
    activeBookmark = null
    bookmarkError = ''
    savingBookmark = false
  }

  function toCategoryPayload(form: CategoryFormValue): CategoryUpsertReq {
    return {
      title: form.title.trim(),
      icon: form.icon.trim() || null,
    }
  }

  function toBookmarkPayload(form: BookmarkFormValue): BookmarkUpsertReq {
    return {
      category_id: Number(form.category_id),
      title: form.title.trim(),
      url: form.url.trim(),
      icon: form.icon.trim() || null,
      icon_source: (form.icon_source as IconSource) || null,
      icon_background_color: form.icon_background_color.trim() || null,
      description: form.description.trim() || null,
      open_method: form.open_method === 'same_tab' ? 2 : form.open_method === 'modal' ? 3 : 1,
    }
  }

  function toCategoryForm(category: Category): CategoryFormValue {
    return {
      id: category.id,
      title: category.title,
      icon: category.icon ?? '',
    }
  }

  function toBookmarkForm(bookmark: Bookmark): BookmarkFormValue {
    return {
      id: bookmark.id,
      category_id: bookmark.category_id,
      title: bookmark.title,
      url: bookmark.url,
      icon: bookmark.icon ?? '',
      icon_source: bookmark.icon_source ?? '',
      icon_background_color: bookmark.icon_background_color ?? '',
      description: bookmark.description ?? '',
      open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
    }
  }

  async function handleOpenLogin(): Promise<void> {
    rootError = ''
    authStore.resetError()
    await ensureAdminComponent()
    loginModalOpen = true
    currentView = 'admin'
  }

  async function handleCloseLogin(): Promise<void> {
    loginModalOpen = false
    authStore.resetError()
  }

  async function handleSwitchToAdmin(): Promise<void> {
    await ensureAdminComponent()
    currentView = 'admin'
  }

  async function handleLogin(payload: { username: string; password: string }): Promise<void> {
    try {
      await authStore.login(payload.username, payload.password)
      loginModalOpen = false
      rootError = ''
      await configStore.refresh()
      await refreshLoggedInData()
      await ensureAdminComponent()
      currentView = 'admin'
    } catch {
      // authStore 已经记录错误
    }
  }

  async function handleLogout(): Promise<void> {
    rootError = ''

    try {
      await authStore.logout()
      resetCategoryState()
      resetSettingsState()
      resetBookmarkState()
      adminStore.reset()
      await configStore.refresh()
      await refreshPublicData()
      const nextView: AppView = get(configStore).data?.public_mode === false ? 'admin' : 'home'
      if (nextView === 'admin') await ensureAdminComponent()
      currentView = nextView
    } catch (error) {
      rootError = getErrorMessage(error)
    }
  }

  async function handleOpenCreateCategory(): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    categoryError = ''
    await ensureAdminComponent()
    categoryModalMode = 'create'
    activeCategory = { title: '', icon: '' }
    categoryModalOpen = true
    currentView = 'admin'
  }

  async function handleEditCategory(category: { id: string | number }): Promise<void> {
    const current = adminData.categories.find((item) => item.id === Number(category.id))
    if (!current) return

    categoryError = ''
    categoryModalMode = 'edit'
    activeCategory = toCategoryForm(current)
    categoryModalOpen = true
  }

  async function handleCloseCategoryModal(): Promise<void> {
    resetCategoryState()
  }

  async function handleSubmitCategory(form: CategoryFormValue): Promise<void> {
    savingCategory = true
    categoryError = ''

    try {
      let category: Category
      if (categoryModalMode === 'edit' && form.id != null) {
        category = await api.categories.update(Number(form.id), toCategoryPayload(form))
      } else {
        category = await api.categories.create(toCategoryPayload(form))
      }

      resetCategoryState()
      await applyLocalCategoryUpsert(category)
    } catch (error) {
      categoryError = getErrorMessage(error)
    } finally {
      savingCategory = false
    }
  }

  async function handleDeleteCategory(category: { id: string | number; title: string }): Promise<void> {
    if (!window.confirm(`确认删除分类「${category.title}」吗？该分类下书签会一并删除。`)) {
      return
    }

    deletingCategoryId = Number(category.id)
    categoryError = ''

    try {
      const categoryId = Number(category.id)
      await api.categories.remove(categoryId)
      await applyLocalCategoryDelete(categoryId)
    } catch (error) {
      categoryError = getErrorMessage(error)
    } finally {
      deletingCategoryId = null
    }
  }

  async function handleOpenCreateBookmark(categoryId?: string | number): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    const fallbackCategoryId = categoryId ?? adminData.categories[0]?.id
    bookmarkError = ''
    await ensureBookmarkEditModalComponent()
    bookmarkModalMode = 'create'
    activeBookmark = {
      category_id: fallbackCategoryId,
      title: '',
      url: '',
      icon: '',
      icon_background_color: '',
      description: '',
      open_method: 'new_tab',
    }
    bookmarkModalOpen = true
  }

  async function handleEditBookmark(bookmark: { id: string | number }): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    const current =
      adminData.bookmarks.find((item) => item.id === Number(bookmark.id)) ??
      publicData?.bookmarks.find((item) => item.id === Number(bookmark.id))
    if (!current) return

    bookmarkError = ''
    await ensureBookmarkEditModalComponent()
    bookmarkModalMode = 'edit'
    activeBookmark = toBookmarkForm(current)
    bookmarkModalOpen = true
  }

  async function handleCloseBookmarkModal(): Promise<void> {
    resetBookmarkState()
  }

  async function handleSubmitBookmark(form: BookmarkFormValue): Promise<void> {
    savingBookmark = true
    bookmarkError = ''

    try {
      let bookmark: Bookmark
      if (bookmarkModalMode === 'edit' && form.id != null) {
        bookmark = await api.bookmarks.update(Number(form.id), toBookmarkPayload(form))
      } else {
        bookmark = await api.bookmarks.create(toBookmarkPayload(form))
      }

      resetBookmarkState()
      await applyLocalBookmarkUpsert(bookmark)
    } catch (error) {
      bookmarkError = getErrorMessage(error)
    } finally {
      savingBookmark = false
    }
  }

  async function handleDeleteBookmark(bookmark: { id: string | number; title: string }): Promise<void> {
    if (!window.confirm(`确认删除书签「${bookmark.title}」吗？`)) {
      return
    }

    deletingBookmarkId = Number(bookmark.id)
    bookmarkError = ''

    try {
      const bookmarkId = Number(bookmark.id)
      await api.bookmarks.remove(bookmarkId)
      resetBookmarkState()
      await applyLocalBookmarkDelete(bookmarkId)
    } catch (error) {
      bookmarkError = getErrorMessage(error)
    } finally {
      deletingBookmarkId = null
    }
  }

  async function handleSubmitSettings(payload: SettingsSubset): Promise<void> {
    savingSettings = true
    settingsError = ''

    try {
      const settings = await api.settings.update(payload)
      applyLocalSettings(settings)
    } catch (error) {
      settingsError = getErrorMessage(error)
    } finally {
      savingSettings = false
    }
  }

  async function handleSortCategories(ids: Array<string | number>): Promise<void> {
    categoryError = ''

    try {
      const sortedIds = ids.map((id) => Number(id))
      await api.categories.sort(sortedIds)
      await applyLocalCategorySort(sortedIds)
    } catch (error) {
      categoryError = getErrorMessage(error)
    }
  }

  async function handleSortBookmarks(ids: Array<string | number>): Promise<void> {
    bookmarkError = ''

    try {
      const sortedIds = ids.map((id) => Number(id))
      await api.bookmarks.sort(sortedIds)
      await applyLocalBookmarkSort(sortedIds)
    } catch (error) {
      bookmarkError = getErrorMessage(error)
    }
  }

  async function handleFetchFavicon(url: string): Promise<string> {
    const result = await api.bookmarks.fetchFavicon(url)
    return result.icon
  }

  function handleExportData(): void {
    backupError = ''
    backupMessage = ''

    try {
      const payload = {
        version: 1,
        exported_at: Date.now(),
        categories: adminData.categories,
        bookmarks: adminData.bookmarks,
        settings: adminData.settings,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      anchor.href = href
      anchor.download = `cf-navs-backup-${stamp}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
      backupMessage = `已导出 ${adminData.categories.length} 个分类、${adminData.bookmarks.length} 个书签。`
    } catch (error) {
      backupError = getErrorMessage(error)
    }
  }

  async function handleImportData(file: File, source: ImportSource): Promise<void> {
    backupError = ''
    backupMessage = ''
    importing = true

    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('文件不是有效的 JSON')
      }

      const prepared = prepareImportPayload(parsed, source)

      const confirmed = window.confirm(
        `导入 ${prepared.sourceLabel} 将【覆盖】现有的全部分类与书签（${prepared.categories} 个分类，${prepared.bookmarks} 个书签），确定继续吗？`,
      )
      if (!confirmed) {
        importing = false
        return
      }

      const result = await api.data.importAll(prepared.payload)

      await configStore.refresh()
      await refreshLoggedInData()
      backupMessage = `导入成功：${result.categories} 个分类、${result.bookmarks} 个书签。`
    } catch (error) {
      backupError = getErrorMessage(error)
    } finally {
      importing = false
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      systemPrefersDark = mediaQuery.matches
      handleSystemThemeChange = (event: MediaQueryListEvent) => {
        systemPrefersDark = event.matches
      }
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    }

    void initializeApp()
  })

  onDestroy(() => {
    if (mediaQuery && handleSystemThemeChange) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  })
</script>

{#if booting}
  <div class="app-splash">
    <div class="app-splash-card">
      <p class="eyebrow">CF-Navs</p>
      <h1>正在加载项目数据...</h1>
      <p>前端状态与后端接口正在初始化，请稍候。</p>
    </div>
  </div>
{:else}
  <div class="app-shell">
    {#if rootError}
      <div class="app-alert">{rootError}</div>
    {/if}

    {#if currentView === 'home' && canSeeHome}
      <div style={homeBackgroundStyle}>
        <Home
          categories={publicData?.categories ?? []}
          bookmarks={publicData?.bookmarks ?? []}
          settings={publicData?.settings ?? null}
          title={homeTitle}
          isAuthenticated={$isAuthenticated}
          authLoading={$authStore.loading}
          onOpenCreateBookmark={handleOpenCreateBookmark}
          onEditBookmark={handleEditBookmark}
          onSwitchToAdmin={handleSwitchToAdmin}
          onLogout={handleLogout}
          onOpenLogin={handleOpenLogin}
        />
      </div>
    {:else if AdminComponent}
      <svelte:component
        this={AdminComponent}
        isAuthenticated={$isAuthenticated}
        authLoading={$authStore.loading}
        authError={$authStore.error ?? ''}
        categories={adminCategories}
        bookmarks={adminBookmarks}
        categoriesLoading={$adminStore.loading}
        bookmarksLoading={$adminStore.loading}
        savingCategory={savingCategory}
        deletingCategoryId={deletingCategoryId}
        deletingBookmarkId={deletingBookmarkId}
        categoryError={categoryError}
        settingsLoading={$adminStore.loading && !adminData.settings}
        settingsSaving={savingSettings}
        settingsError={settingsError}
        settingsValue={settingsValue}
        loginModalOpen={loginModalOpen}
        categoryModalOpen={categoryModalOpen}
        categoryModalMode={categoryModalMode}
        activeCategory={activeCategory}
        canSeeHome={canSeeHome}
        onOpenLogin={handleOpenLogin}
        onCloseLogin={handleCloseLogin}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onSwitchToHome={() => { currentView = 'home' }}
        onOpenCreateCategory={handleOpenCreateCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onCloseCategoryModal={handleCloseCategoryModal}
        onSubmitCategory={handleSubmitCategory}
        onOpenCreateBookmark={handleOpenCreateBookmark}
        onEditBookmark={handleEditBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onSubmitSettings={handleSubmitSettings}
        onSortCategories={handleSortCategories}
        onSortBookmarks={handleSortBookmarks}
        importing={importing}
        backupError={backupError}
        backupMessage={backupMessage}
        onExportData={handleExportData}
        onImportData={handleImportData}
      />
    {:else}
      <div class="app-splash">
        <div class="app-splash-card">
          <p class="eyebrow">CF-Navs</p>
          <h1>正在加载后台...</h1>
        </div>
      </div>
    {/if}

    {#if BookmarkEditModalComponent}
      <svelte:component
        this={BookmarkEditModalComponent}
        open={bookmarkModalOpen}
        loading={savingBookmark}
        error={bookmarkError}
        mode={bookmarkModalMode}
        value={activeBookmark}
        categories={adminCategories.map((category) => ({ id: category.id, title: category.title }))}
        onSubmit={handleSubmitBookmark}
        onCancel={handleCloseBookmarkModal}
        onFetchFavicon={handleFetchFavicon}
        onDelete={handleDeleteBookmark}
        deleting={deletingBookmarkId === Number(activeBookmark?.id)}
        imageHostUrl={adminData.settings?.image_host_url ?? ''}
      />
    {/if}
  </div>
{/if}
