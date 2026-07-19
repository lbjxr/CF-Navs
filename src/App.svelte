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
  import Toast from './components/Toast.svelte'
  import Home from './views/Home.svelte'
  import Install from './views/Install.svelte'
  import { api, getErrorMessage, isUnauthorizedError } from './lib/api'
  import { clearCachedAdminData } from './lib/adminDataCache'
  import { clearCachedPublicData } from './lib/publicDataCache'
  import { toastStore } from './lib/toast'
  import type { BookmarkFormValue, CategoryFormValue } from './lib/adminTypes'
  import { toBookmarkForm, toBookmarkPayload, toCategoryForm, toCategoryPayload } from './lib/adminFormAdapters'
  import {
    createImportExportState,
    exportDataToFile,
    importDataFromFile,
  } from './lib/appImportExport'
  import {
    createConfirmDialogState,
    createBatchDeleteConfirmation,
    createDeleteBookmarkConfirmation,
    createDeleteCategoryConfirmation,
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
  import { createLazyComponentLoader } from './lib/appLazyComponent'
  import {
    canUseInstalledFallback,
    getInstallViewState,
    hasInstalledHint,
    installationCommittedAfterFailure,
    isInstallPath,
    normalizeInstallError,
    replaceBrowserPath,
    setInstalledHint,
    toInstallScreenState,
    type InstallScreenState,
  } from './lib/appInstall'
  import { buildOrderedBookmarkIdsForCategory } from './lib/appLocalData'
  import { createBookmarkDraft, createCategoryDraft, findBookmarkForEdit } from './lib/appModalState'
  import {
    canSeeHomeView,
    createHomeGateState,
    shouldOpenLoginGate,
    shouldRevealHomeFromLocalSnapshot,
    type AppView,
  } from './lib/appNavigation'
  import { createOptimisticSortState, runOptimisticSort } from './lib/appSortQueue'
  import { getAdminBookmarkCategoryOptions } from './lib/adminListState'
  import { getNextThemePreference, resolveAppThemeState } from './lib/appThemeState'
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

  type SettingsSubset = SettingsFormValue

  let booting = true
  let installState: InstallScreenState = { type: 'checking' }
  let rootError = ''
  let currentView: AppView = 'home'

  function isAdminPath(): boolean {
    if (typeof window === 'undefined') return false
    return window.location.pathname === '/admin' || window.location.pathname === '/admin/'
  }
  let AdminComponent: typeof import('./views/Admin.svelte').default | null = null
  let LoginModalComponent: typeof import('./components/LoginModal.svelte').default | null = null
  let BookmarkEditModalComponent: typeof import('./components/BookmarkEditModal.svelte').default | null = null
  let confirmDialog: ConfirmDialogState | null = null
  let confirmDialogResolver: ((confirmed: boolean) => void) | null = null

  const ensureAdminComponent = createLazyComponentLoader({
    load: () => import('./views/Admin.svelte'),
    getCurrent: () => AdminComponent,
    setCurrent: (component) => {
      AdminComponent = component
    },
  })

  const ensureLoginModalComponent = createLazyComponentLoader({
    load: () => import('./components/LoginModal.svelte'),
    getCurrent: () => LoginModalComponent,
    setCurrent: (component) => {
      LoginModalComponent = component
    },
  })

  const ensureBookmarkEditModalComponent = createLazyComponentLoader({
    load: () => import('./components/BookmarkEditModal.svelte'),
    getCurrent: () => BookmarkEditModalComponent,
    setCurrent: (component) => {
      BookmarkEditModalComponent = component
    },
  })

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

  let importExportState = createImportExportState()
  let preferredThemeMode: ThemeMode | null = null
  let prefersReducedMotion = false
  const categorySortState = createOptimisticSortState()
  const bookmarkSortState = createOptimisticSortState()

  configureDataService({
    onRootError: (message) => {
      rootError = message
    },
    onLocalSnapshotRestored: () => {
      revealHomeFromCurrentData()
    },
    onNetworkFallback: (message) => {
      toastStore.addToast(message, 'info', { duration: 8000 })
    },
  })

  $: installView = getInstallViewState(installState)
  $: config = $configStore.data
  $: publicData = $publicStore.data
  $: adminData = $adminStore.data
  $: canSeeHome = canSeeHomeView({ publicMode: config?.public_mode, authenticated: $isAuthenticated })
  $: homeTitle = publicData?.settings.site_title ?? config?.site_title ?? 'CF-Navs'

  $: adminCategories = toAdminCategories(adminData.categories, adminData.bookmarks)
  $: adminBookmarks = toAdminBookmarks(adminData.bookmarks)
  $: settingsValue = toSettingsForm(adminData.settings)

  $: if (shouldOpenLoginGate({ booting, currentView, canSeeHome })) {
    void ensureLoginModalComponent()
    loginModalOpen = true
    currentView = 'login'
  }

  let systemPrefersDark = false
  let mediaQuery: MediaQueryList | null = null
  let handleSystemThemeChange: ((event: MediaQueryListEvent) => void) | null = null

  $: resolvedThemeState = resolveAppThemeState({
    preferredThemeMode,
    configuredThemeMode: publicData?.settings.theme,
    systemPrefersDark,
  })
  $: themeMode = resolvedThemeState.themeMode
  $: activeTheme = resolvedThemeState.activeTheme

  $: homeBackgroundStyle = buildHomeBackground(publicData?.settings ?? null, activeTheme)

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = activeTheme
    document.documentElement.dataset.backgroundPreset = publicData?.settings.background_preset_id ?? 'custom'
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
    setPreferredThemeMode(getNextThemePreference(themeMode))
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

  async function refreshAdminDataAfterMutation(): Promise<void> {
    try {
      await refreshLoggedInData(true)
    } catch (error) {
      // 写入已经成功；刷新失败时保留本地即时结果，并提示用户稍后重试。
      rootError = getErrorMessage(error)
    }
  }

  function getInstallHintStorage(): Storage | null {
    if (typeof window === 'undefined') return null

    try {
      return window.localStorage
    } catch {
      return null
    }
  }

  function rememberInstalled(installed: boolean): void {
    setInstalledHint(getInstallHintStorage(), installed)
  }

  async function enterInstalledApp(session: Awaited<ReturnType<typeof api.install.install>> | null): Promise<void> {
    await Promise.all([clearCachedAdminData(), clearCachedPublicData()])
    rememberInstalled(true)
    authStore.setSession(session, session ? { username: session.username } : null)
    replaceBrowserPath('/')
    installState = { type: 'checking' }
    await initializeApp(true)
  }

  async function checkInstallStatus(): Promise<boolean> {
    installState = { type: 'checking' }
    const installedHint = hasInstalledHint(getInstallHintStorage())

    try {
      const status = await api.install.status()
      if (status.state !== 'installed') {
        if (canUseInstalledFallback(status, installedHint)) {
          if (typeof window !== 'undefined' && isInstallPath(window.location.pathname)) {
            replaceBrowserPath('/')
          }
          return true
        }

        rememberInstalled(false)
        replaceBrowserPath('/install')
        installState = toInstallScreenState(status)
        booting = false
        return false
      }

      rememberInstalled(true)
      if (typeof window !== 'undefined' && isInstallPath(window.location.pathname)) {
        replaceBrowserPath('/')
      }
      return true
    } catch (error) {
      if (installedHint) {
        if (typeof window !== 'undefined' && isInstallPath(window.location.pathname)) {
          replaceBrowserPath('/')
        }
        return true
      }

      installState = { type: 'status_error', message: normalizeInstallError(error) }
      booting = false
      return false
    }
  }

  async function handleInstall(value: { setupToken: string; username: string; password: string }): Promise<void> {
    if (installState.type !== 'pending' || installState.status.state !== 'needs_install') return

    const pendingStatus = installState.status
    installState = { type: 'installing', status: pendingStatus }

    try {
      const session = await api.install.install(
        { username: value.username, password: value.password },
        value.setupToken,
      )
      await enterInstalledApp(session)
    } catch (error) {
      if (await installationCommittedAfterFailure(api.install.status)) {
        await enterInstalledApp(null)
        return
      }

      installState = {
        type: 'pending',
        status: pendingStatus,
        error: normalizeInstallError(error),
      }
    }
  }

  async function initializeApp(installStatusKnown = false): Promise<void> {
    booting = true
    rootError = ''

    if (!installStatusKnown && !await checkInstallStatus()) {
      return
    }

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
      await refreshPublicData(true)
    }

    const homeGate = createHomeGateState({
      publicMode: get(configStore).data?.public_mode,
      authenticated: isLoggedIn(),
    })
    if (homeGate.loginModalOpen) {
      await ensureLoginModalComponent()
    }
    loginModalOpen = homeGate.loginModalOpen
    if (isAdminPath() && isLoggedIn()) {
      await ensureAdminComponent()
      currentView = 'admin'
      loginModalOpen = false
    } else {
      currentView = homeGate.view
    }
    booting = false
  }

  function revealHomeFromCurrentData(): void {
    const homeGate = createHomeGateState({
      publicMode: get(configStore).data?.public_mode,
      authenticated: isLoggedIn(),
    })
    if (!shouldRevealHomeFromLocalSnapshot({
      booting,
      adminPath: isAdminPath(),
      homeView: homeGate.view,
    })) return

    loginModalOpen = false
    currentView = 'home'
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
    replaceBrowserPath('/admin')
    currentView = 'admin'
  }

  async function handleLogin(payload: { username: string; password: string }): Promise<void> {
    try {
      await authStore.login(payload.username, payload.password)
      loginModalOpen = false
      rootError = ''
      await refreshLoggedInData(true)
      if (isAdminPath()) {
        await ensureAdminComponent()
        currentView = 'admin'
      } else {
        currentView = 'home'
      }
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
      const homeGate = createHomeGateState({
        publicMode: get(configStore).data?.public_mode,
        authenticated: false,
      })
      if (homeGate.loginModalOpen) {
        await ensureLoginModalComponent()
      }
      loginModalOpen = homeGate.loginModalOpen
      currentView = homeGate.view
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
      await refreshAdminDataAfterMutation()
      toastStore.addToast(
        categoryModalMode === 'edit' ? `分类「${category.title}」已更新` : `分类「${category.title}」已创建`,
        'success',
      )
   } catch (error) {
     categoryError = getErrorMessage(error)
    } finally {
      savingCategory = false
    }
  }

  async function handleDeleteCategory(category: { id: string | number; title: string }): Promise<void> {
    const categoryId = Number(category.id)
    const directBookmarkCount = adminData.bookmarks.filter((bookmark) => bookmark.category_id === categoryId).length
    const childCategoryCount = adminData.categories.filter((item) => item.parent_id === categoryId).length
    const confirmed = await requestConfirmation(createDeleteCategoryConfirmation(
      category.title,
      directBookmarkCount,
      childCategoryCount,
    ))
    if (!confirmed) return

    deletingCategoryId = Number(category.id)
    categoryError = ''

    try {
     await api.categories.remove(categoryId)
     await applyLocalCategoryDelete(categoryId)
      await refreshAdminDataAfterMutation()
      toastStore.addToast(`分类「${category.title}」已删除`, 'success')
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
      await refreshAdminDataAfterMutation()
     refreshBookmarkIconCacheInBackground(bookmark.id)
      toastStore.addToast(
        bookmarkModalMode === 'edit' ? `书签「${bookmark.title}」已更新` : `书签「${bookmark.title}」已创建`,
        'success',
      )
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
     await refreshAdminDataAfterMutation()
      toastStore.addToast(`书签「${bookmark.title}」已删除`, 'success')
   } catch (error) {
     bookmarkError = getErrorMessage(error)
    } finally {
      deletingBookmarkId = null
    }
  }

  async function handleBatchDeleteBookmarks(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    if (!await requestConfirmation(createBatchDeleteConfirmation('bookmark', ids.length))) return
    try {
      const result = await api.bookmarks.batchDelete(ids)
      if (result.deleted > 0) await refreshAdminDataAfterMutation()
      toastStore.addToast(`已删除 ${result.deleted} 个书签`, 'success')
    } catch (error) {
      bookmarkError = getErrorMessage(error)
    }
  }

  async function handleBatchDeleteCategories(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    const bookmarkCount = adminData.bookmarks.filter((bookmark) => ids.includes(bookmark.category_id)).length
    const childCategoryCount = adminData.categories.filter((category) => (
      category.parent_id != null && ids.includes(category.parent_id)
    )).length
    if (!await requestConfirmation(createBatchDeleteConfirmation('category', ids.length, bookmarkCount, childCategoryCount))) return
    try {
      const result = await api.categories.batchDelete(ids)
      if (result.deleted > 0 || result.deleted_bookmarks > 0) await refreshAdminDataAfterMutation()
      toastStore.addToast(`已删除 ${result.deleted} 个分类及 ${result.deleted_bookmarks} 个书签`, 'success')
    } catch (error) {
      categoryError = getErrorMessage(error)
    }
  }

  async function handleSubmitSettings(payload: SettingsSubset): Promise<void> {
    savingSettings = true
    settingsError = ''

    try {
      const settings = await api.settings.update(payload)
     await applyLocalSettings(settings)
      toastStore.addToast('设置已保存', 'success')
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

  async function handleSortCategories(parentId: number | null, ids: Array<string | number>): Promise<void> {
    categoryError = ''

    await runOptimisticSort(categorySortState, ids, {
      applyLocalSort: (sortedIds) => applyLocalCategorySort(parentId, sortedIds, false),
      saveRemoteSort: (sortedIds) => api.categories.sort(parentId, sortedIds),
      persist: persistCurrentAdminData,
      onSuccess: refreshAdminDataAfterMutation,
      restoreOnError: () => refreshLoggedInData(true),
      onError: (error) => {
        categoryError = getErrorMessage(error)
      },
    })
  }

  async function handleSortBookmarks(ids: Array<string | number>): Promise<void> {
    bookmarkError = ''

    await runOptimisticSort(bookmarkSortState, ids, {
      applyLocalSort: (sortedIds) => applyLocalBookmarkSort(sortedIds, false),
      saveRemoteSort: (sortedIds) => api.bookmarks.sort(sortedIds),
      persist: persistCurrentAdminData,
      onSuccess: refreshAdminDataAfterMutation,
      restoreOnError: () => refreshLoggedInData(true),
      onError: (error) => {
        bookmarkError = getErrorMessage(error)
      },
    })
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
    exportDataToFile(importExportState, adminData, (next) => {
      importExportState = next
    })
  }

  async function handleImportData(file: File, source: ImportSource, mode: 'replace' | 'merge'): Promise<void> {
    await importDataFromFile(importExportState, file, source, mode, {
      adminData,
      requestConfirmation,
      applyLoggedInData: (data) => applyLoggedInData(data),
      persistCurrentAdminData,
      onStateChange: (next) => {
        importExportState = next
      },
    })
    if (!importExportState.backupError && importExportState.backupMessage) {
      await refreshAdminDataAfterMutation()
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

{#if installView}
  <Install
    mode={installView.mode}
    missingBindings={installView.missingBindings}
    schemaVersion={installView.schemaVersion}
    installing={installView.installing}
    error={installView.error}
    onInstall={handleInstall}
    onRetryStatus={initializeApp}
  />
{:else if booting}
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
    <Toast />
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
          activeThemeMode={themeMode}
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
      onSwitchToHome={() => { replaceBrowserPath('/'); currentView = 'home' }}
        onOpenCreateCategory={handleOpenCreateCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onBatchDeleteCategories={handleBatchDeleteCategories}
        onCloseCategoryModal={handleCloseCategoryModal}
        onSubmitCategory={handleSubmitCategory}
        onOpenCreateBookmark={handleOpenCreateBookmark}
        onEditBookmark={handleEditBookmark}
        onDeleteBookmark={handleDeleteBookmark}
        onBatchDeleteBookmarks={handleBatchDeleteBookmarks}
        onSubmitSettings={handleSubmitSettings}
        onChangePassword={handleChangePassword}
        onSortCategories={handleSortCategories}
        onSortBookmarks={handleSortBookmarks}
        importing={importExportState.importing}
        backupError={importExportState.backupError}
        backupMessage={importExportState.backupMessage}
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
        categories={getAdminBookmarkCategoryOptions(adminCategories)}
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
      confirmDisabled={confirmDialog?.confirmDisabled ?? false}
      onConfirm={handleConfirmDialogConfirm}
      onCancel={handleConfirmDialogCancel}
    />
  </div>
{/if}
