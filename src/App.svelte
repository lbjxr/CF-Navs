<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { fade } from 'svelte/transition'
  import {
    type AdminData,
    type Bookmark,
    type Category,
    type ChangePasswordReq,
    type ThemeMode,
  } from '../shared/types'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import Home from './views/Home.svelte'
  import { api, getErrorMessage, isUnauthorizedError } from './lib/api'
  import { clearCachedAdminData } from './lib/adminDataCache'
  import type { BookmarkFormValue, CategoryFormValue } from './lib/adminTypes'
  import { toBookmarkForm, toBookmarkPayload, toCategoryForm, toCategoryPayload } from './lib/adminFormAdapters'
  import {
    createBackupExportMessage,
    createBackupFileName,
    createBackupPayload,
    createImportSuccessMessage,
  } from './lib/appBackup'
  import {
    createConfirmDialogState,
    createDeleteBookmarkConfirmation,
    createDeleteCategoryConfirmation,
    createImportOverwriteConfirmation,
    type ConfirmDialogInput,
    type ConfirmDialogState,
  } from './lib/appConfirmDialog'
  import {
    buildHomeBackground,
    toAdminBookmarks,
    toAdminCategories,
    toSettingsForm,
    type SettingsFormValue,
  } from './lib/appData'
  import { buildOrderedBookmarkIdsForCategory } from './lib/appLocalData'
  import { createBookmarkDraft, createCategoryDraft, findBookmarkForEdit } from './lib/appModalState'
  import { isLatestSortRequest, normalizeSortIds, queueSortSave } from './lib/appSortQueue'
  import type { ImportSource } from './lib/importData'
  import { pruneBookmarkIconCacheStorageBackedByLocalStorage } from './lib/localBookmarkIconCache'
  import { adminStore, authStore, configStore, isAuthenticated, publicStore } from './lib/stores'
  import { readPreferredThemeMode, writePreferredThemeMode } from './lib/themePreference'
  import {
    applyConfigFromSettings,
    applyLocalBookmarkDelete,
    applyLocalBookmarkSort,
    applyLocalBookmarkUpsert,
    applyLocalCategoryDelete,
    applyLocalCategorySort,
    applyLocalCategoryUpsert,
    applyLocalSettings,
    applyLoggedInData,
    configureDataService,
    isLoggedIn,
    persistCurrentAdminData,
    refreshBookmarkIconCacheInBackground,
    refreshLoggedInData,
    refreshPublicData,
  } from './lib/dataService'

  type AppView = 'home' | 'admin' | 'login'

  type SettingsSubset = SettingsFormValue

  let booting = true
  let rootError = ''
  let currentView: AppView = 'home'
  let AdminComponent: typeof import('./views/Admin.svelte').default | null = null
  let LoginModalComponent: typeof import('./components/LoginModal.svelte').default | null = null
  let BookmarkEditModalComponent: typeof import('./components/BookmarkEditModal.svelte').default | null = null
  let adminComponentPromise: Promise<void> | null = null
  let loginModalPromise: Promise<void> | null = null
  let bookmarkEditModalPromise: Promise<void> | null = null
  let confirmDialog: ConfirmDialogState | null = null
  let confirmDialogResolver: ((confirmed: boolean) => void) | null = null

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
  let preferredThemeMode: ThemeMode | null = null
  let prefersReducedMotion = false
  let categorySortSavePromise: Promise<void> = Promise.resolve()
  let bookmarkSortSavePromise: Promise<void> = Promise.resolve()
  let categorySortRequestSeq = 0
  let bookmarkSortRequestSeq = 0

  configureDataService({
    onRootError: (message) => {
      rootError = message
    },
  })

  $: config = $configStore.data
  $: publicData = $publicStore.data
  $: adminData = $adminStore.data
  $: canSeeHome = Boolean(config?.public_mode || $isAuthenticated)
  $: homeTitle = publicData?.settings.site_title ?? config?.site_title ?? 'CF-Navs'

  $: adminCategories = toAdminCategories(adminData.categories, adminData.bookmarks)
  $: adminBookmarks = toAdminBookmarks(adminData.bookmarks)
  $: settingsValue = toSettingsForm(adminData.settings)

  $: if (!booting && currentView === 'home' && !canSeeHome) {
    void ensureLoginModalComponent()
    loginModalOpen = true
    currentView = 'login'
  }

  let systemPrefersDark = false
  let mediaQuery: MediaQueryList | null = null
  let handleSystemThemeChange: ((event: MediaQueryListEvent) => void) | null = null

  $: configuredThemeMode = publicData?.settings.theme ?? 'auto'
  $: themeMode = preferredThemeMode ?? configuredThemeMode
  $: activeTheme = themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode

  $: homeBackgroundStyle = buildHomeBackground(publicData?.settings ?? null, activeTheme)

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = activeTheme
  }

  function setPreferredThemeMode(mode: ThemeMode): void {
    preferredThemeMode = mode
    writePreferredThemeMode(mode)
  }

  function scheduleBookmarkIconCachePrune(): void {
    if (typeof window === 'undefined') return

    const prune = () => {
      void pruneBookmarkIconCacheStorageBackedByLocalStorage().catch(() => undefined)
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    }

    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(prune, { timeout: 5000 })
      return
    }

    window.setTimeout(prune, 1500)
  }

  function handleToggleTheme(): void {
    setPreferredThemeMode(activeTheme === 'dark' ? 'light' : 'dark')
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

  function ensureLoginModalComponent(): Promise<void> {
    if (LoginModalComponent) return Promise.resolve()
    if (!loginModalPromise) {
      loginModalPromise = import('./components/LoginModal.svelte').then((module) => {
        LoginModalComponent = module.default
      })
    }
    return loginModalPromise
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

  function requestConfirmation(options: ConfirmDialogInput): Promise<boolean> {
    confirmDialogResolver?.(false)

    return new Promise((resolve) => {
      confirmDialogResolver = resolve
      confirmDialog = createConfirmDialogState(options)
    })
  }

  function closeConfirmDialog(confirmed: boolean): void {
    const resolver = confirmDialogResolver
    confirmDialogResolver = null
    confirmDialog = null
    resolver?.(confirmed)
  }

  function handleConfirmDialogConfirm(): void {
    closeConfirmDialog(true)
  }

  function handleConfirmDialogCancel(): void {
    closeConfirmDialog(false)
  }

  async function ensureLoggedInDataLoaded(): Promise<boolean> {
    if (!isLoggedIn()) return false

    const current = get(adminStore)
    if (current.loaded && current.data.settings) {
      return true
    }

    try {
      await refreshLoggedInData()
      return true
    } catch (error) {
      if (isUnauthorizedError(error)) {
        authStore.setSession(null)
        adminStore.reset()
        await clearCachedAdminData()
        await refreshPublicData()
        await handleOpenLogin()
        return false
      }

      rootError = getErrorMessage(error)
      return false
    }
  }

  async function initializeApp(): Promise<void> {
    booting = true
    rootError = ''

    try {
      await authStore.initialize()
    } catch (error) {
      rootError = getErrorMessage(error)
    }

    adminStore.reset()
    if (isLoggedIn()) {
      try {
        await refreshLoggedInData()
      } catch (error) {
        if (isUnauthorizedError(error)) {
          authStore.setSession(null)
          adminStore.reset()
          await clearCachedAdminData()
        } else {
          rootError = getErrorMessage(error)
        }

        await refreshPublicData()
      }
    } else {
      await refreshPublicData()
    }

    const nextView: AppView = get(configStore).data?.public_mode === false && !isLoggedIn() ? 'login' : 'home'
    if (nextView === 'login') {
      await ensureLoginModalComponent()
      loginModalOpen = true
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

  async function handleOpenLogin(): Promise<void> {
    rootError = ''
    authStore.resetError()
    await ensureLoginModalComponent()
    loginModalOpen = true
    if (!canSeeHome) {
      currentView = 'login'
    }
  }

  async function handleCloseLogin(): Promise<void> {
    authStore.resetError()
    if (!canSeeHome) {
      loginModalOpen = true
      currentView = 'login'
      return
    }

    loginModalOpen = false
  }

  async function handleSwitchToAdmin(): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    if (!await ensureLoggedInDataLoaded()) {
      return
    }

    await ensureAdminComponent()
    currentView = 'admin'
  }

  async function handleLogin(payload: { username: string; password: string }): Promise<void> {
    try {
      await authStore.login(payload.username, payload.password)
      loginModalOpen = false
      rootError = ''
      await refreshLoggedInData(true)
      currentView = 'home'
    } catch {
      // authStore 已经记录错误
    }
  }

  async function handleLogout(): Promise<void> {
    rootError = ''
    const previousSettings = get(adminStore).data.settings

    try {
      await authStore.logout()
      resetCategoryState()
      resetSettingsState()
      resetBookmarkState()
      adminStore.reset()
      await clearCachedAdminData()
      if (previousSettings) {
        applyConfigFromSettings(previousSettings)
      }
      await refreshPublicData()
      const nextView: AppView = get(configStore).data?.public_mode === false ? 'login' : 'home'
      if (nextView === 'login') {
        await ensureLoginModalComponent()
        loginModalOpen = true
      }
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
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    await ensureAdminComponent()
    categoryModalMode = 'create'
    activeCategory = createCategoryDraft()
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
    const confirmed = await requestConfirmation(createDeleteCategoryConfirmation(category.title))
    if (!confirmed) return

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

    bookmarkError = ''
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    const fallbackCategoryId = categoryId ?? get(adminStore).data.categories[0]?.id
    await ensureBookmarkEditModalComponent()
    bookmarkModalMode = 'create'
    activeBookmark = createBookmarkDraft(fallbackCategoryId)
    bookmarkModalOpen = true
  }

  async function handleEditBookmark(bookmark: { id: string | number }): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    const current = findBookmarkForEdit(bookmark.id, adminData.bookmarks, publicData?.bookmarks ?? [])
    if (!current) return

    bookmarkError = ''
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    await ensureBookmarkEditModalComponent()
    bookmarkModalMode = 'edit'
    const refreshed = findBookmarkForEdit(
      bookmark.id,
      get(adminStore).data.bookmarks,
      get(publicStore).data?.bookmarks ?? [],
    ) ?? current
    activeBookmark = toBookmarkForm(refreshed)
    bookmarkModalOpen = true
    refreshBookmarkIconCacheInBackground(Number(bookmark.id))
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
      refreshBookmarkIconCacheInBackground(bookmark.id)
    } catch (error) {
      bookmarkError = getErrorMessage(error)
    } finally {
      savingBookmark = false
    }
  }

  async function handleDeleteBookmark(bookmark: { id: string | number; title: string }): Promise<void> {
    const confirmed = await requestConfirmation(createDeleteBookmarkConfirmation(bookmark.title))
    if (!confirmed) return

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
      await applyLocalSettings(settings)
    } catch (error) {
      settingsError = getErrorMessage(error)
    } finally {
      savingSettings = false
    }
  }

  async function handleChangePassword(payload: ChangePasswordReq): Promise<void> {
    rootError = ''

    await api.auth.changePassword(payload)
    authStore.setSession(null)
    resetCategoryState()
    resetSettingsState()
    resetBookmarkState()
    adminStore.reset()
    await clearCachedAdminData()
    rootError = '管理员密码已更新，请使用新密码重新登录。'
    await ensureLoginModalComponent()
    loginModalOpen = true
    currentView = 'login'
  }

  async function handleSortCategories(ids: Array<string | number>): Promise<void> {
    categoryError = ''

    const sortedIds = normalizeSortIds(ids)
    const requestSeq = ++categorySortRequestSeq
    await applyLocalCategorySort(sortedIds, false)

    const savePromise = queueSortSave(categorySortSavePromise, async () => {
      await api.categories.sort(sortedIds)
    })
    categorySortSavePromise = savePromise

    try {
      await savePromise
      if (isLatestSortRequest(requestSeq, categorySortRequestSeq)) {
        await persistCurrentAdminData()
      }
    } catch (error) {
      if (isLatestSortRequest(requestSeq, categorySortRequestSeq)) {
        categoryError = getErrorMessage(error)
        await refreshLoggedInData(true).catch(() => undefined)
      }
    }
  }

  async function handleSortBookmarks(ids: Array<string | number>): Promise<void> {
    bookmarkError = ''

    const sortedIds = normalizeSortIds(ids)
    const requestSeq = ++bookmarkSortRequestSeq
    await applyLocalBookmarkSort(sortedIds, false)

    const savePromise = queueSortSave(bookmarkSortSavePromise, async () => {
      await api.bookmarks.sort(sortedIds)
    })
    bookmarkSortSavePromise = savePromise

    try {
      await savePromise
      if (isLatestSortRequest(requestSeq, bookmarkSortRequestSeq)) {
        await persistCurrentAdminData()
      }
    } catch (error) {
      if (isLatestSortRequest(requestSeq, bookmarkSortRequestSeq)) {
        bookmarkError = getErrorMessage(error)
        await refreshLoggedInData(true).catch(() => undefined)
      }
    }
  }

  // 首页按分类内拖拽排序：只给出该分类内的新顺序，这里据此重建“全量有序 id 列表”，
  // 仅替换该分类占据的槽位，其它书签位置保持不变，从而保持全局 sort 与后台平铺表一致。
  async function handleSortBookmarksInCategory(
    categoryId: number,
    orderedIdsInCategory: number[],
  ): Promise<void> {
    const current = get(publicStore).data?.bookmarks ?? get(adminStore).data.bookmarks
    await handleSortBookmarks(buildOrderedBookmarkIdsForCategory(current, categoryId, orderedIdsInCategory))
  }

  function handleExportData(): void {
    backupError = ''
    backupMessage = ''

    try {
      const payload = createBackupPayload(adminData)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = createBackupFileName(new Date(payload.exported_at))
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
      backupMessage = createBackupExportMessage(payload)
    } catch (error) {
      backupError = getErrorMessage(error)
    }
  }

  async function handleImportData(file: File, source: ImportSource): Promise<void> {
    backupError = ''
    backupMessage = ''

    try {
      const text = await file.text()
      const { prepareImportText } = await import('./lib/importData')
      const prepared = prepareImportText(text, source)

      const confirmed = await requestConfirmation(createImportOverwriteConfirmation(prepared))
      if (!confirmed) {
        return
      }

      importing = true
      const result = await api.data.importAll(prepared.payload)
      applyLoggedInData(result.data)
      await persistCurrentAdminData()
      backupMessage = createImportSuccessMessage(result)
    } catch (error) {
      backupError = getErrorMessage(error)
    } finally {
      importing = false
    }
  }

  onMount(() => {
    preferredThemeMode = readPreferredThemeMode()

    if (typeof window !== 'undefined' && window.matchMedia) {
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      systemPrefersDark = mediaQuery.matches
      handleSystemThemeChange = (event: MediaQueryListEvent) => {
        systemPrefersDark = event.matches
      }
      mediaQuery.addEventListener('change', handleSystemThemeChange)
    }

    void initializeApp()
    scheduleBookmarkIconCachePrune()
  })

  onDestroy(() => {
    if (mediaQuery && handleSystemThemeChange) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  })
</script>

{#if booting}
  <div class="app-splash">
    <div class="app-splash-card app-splash-card--loading" role="status" aria-live="polite" aria-busy="true">
      <div class="app-splash-mark" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <p class="eyebrow">CF-Navs</p>
      <h1>正在加载项目数据...</h1>
      <p>前端状态与后端接口正在初始化，请稍候。</p>
      <div class="app-splash-progress" aria-hidden="true">
        <div class="app-splash-progress-meta">
          <span>初始化数据</span>
          <span>同步中</span>
        </div>
        <div class="app-splash-track">
          <span class="app-splash-bar"></span>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="app-shell" in:fade={{ duration: prefersReducedMotion ? 0 : 260, delay: prefersReducedMotion ? 0 : 60 }}>
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
          onSortBookmarksInCategory={handleSortBookmarksInCategory}
          onSwitchToAdmin={handleSwitchToAdmin}
          onLogout={handleLogout}
          onOpenLogin={handleOpenLogin}
          activeTheme={activeTheme}
          onToggleTheme={handleToggleTheme}
        />
      </div>
    {:else if currentView === 'login'}
      <div class="app-splash">
        <div class="app-splash-card">
          <p class="eyebrow">CF-Navs</p>
          <h1>请先登录管理员账号</h1>
          <p>当前站点未公开，登录后再加载后台管理界面。</p>
        </div>
      </div>
    {:else if AdminComponent}
      <svelte:component
        this={AdminComponent}
        isAuthenticated={$isAuthenticated}
        authLoading={$authStore.loading}
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
        categoryModalOpen={categoryModalOpen}
        categoryModalMode={categoryModalMode}
        activeCategory={activeCategory}
        canSeeHome={canSeeHome}
        onOpenLogin={handleOpenLogin}
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
        onChangePassword={handleChangePassword}
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
        <div class="app-splash-card app-splash-card--loading" role="status" aria-live="polite" aria-busy="true">
          <div class="app-splash-mark" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p class="eyebrow">CF-Navs</p>
          <h1>正在加载后台...</h1>
          <p>管理界面分包正在按需载入。</p>
          <div class="app-splash-progress" aria-hidden="true">
            <div class="app-splash-progress-meta">
              <span>载入模块</span>
              <span>请稍候</span>
            </div>
            <div class="app-splash-track">
              <span class="app-splash-bar"></span>
            </div>
          </div>
        </div>
      </div>
    {/if}

    {#if LoginModalComponent}
      <svelte:component
        this={LoginModalComponent}
        open={loginModalOpen}
        loading={$authStore.loading}
        error={$authStore.error ?? ''}
        onSubmit={handleLogin}
        onCancel={handleCloseLogin}
      />
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
        onDelete={handleDeleteBookmark}
        deleting={deletingBookmarkId === Number(activeBookmark?.id)}
        imageHostUrl={adminData.settings?.image_host_url ?? ''}
      />
    {/if}

    <ConfirmDialog
      open={Boolean(confirmDialog)}
      title={confirmDialog?.title ?? ''}
      message={confirmDialog?.message ?? ''}
      itemTitle={confirmDialog?.itemTitle ?? ''}
      confirmLabel={confirmDialog?.confirmLabel ?? '确认'}
      cancelLabel={confirmDialog?.cancelLabel ?? '取消'}
      variant={confirmDialog?.variant ?? 'default'}
      onConfirm={handleConfirmDialogConfirm}
      onCancel={handleConfirmDialogCancel}
    />
  </div>
{/if}
