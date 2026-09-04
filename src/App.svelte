<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { get } from 'svelte/store'
  import { fade } from 'svelte/transition'
  import {
    type Bookmark,
    type BookmarkBatchMoveReq,
    type BookmarkReorganizeReq,
    type Category,
    type ChangePasswordReq,
    type ThemeMode,
  } from '../shared/types'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import Toast from './components/Toast.svelte'
  import Home from './views/Home.svelte'
  import Install from './views/Install.svelte'
  import { api, getErrorMessage, isUnauthorizedError } from './lib/api'
  import type { BackupSelection as BackupSelectionInput } from './lib/appBackup'
  import { clearCachedAdminData } from './lib/adminDataCache'
  import { clearCachedPublicData } from './lib/publicDataCache'
  import { toastStore } from './lib/toast'
  import type { AdminTab, BookmarkFormValue, CategoryFormValue } from './lib/adminTypes'
  import { toBookmarkForm, toBookmarkPayload, toCategoryForm, toCategoryPayload } from './lib/adminFormAdapters'
  import { logoutRevocationWarning } from './lib/appAuthController'
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
    createBrowserCustomScriptHost,
    createCustomScriptController,
    type CustomScriptController,
  } from './lib/customScript'
  import {
    canUseInstalledFallback,
    getInstallViewState,
    hasInstalledHint,
    installationCommittedAfterFailure,
    isInstallPath,
    normalizeInstallError,
    replaceBrowserPath,
    setInstalledHint,
    shouldProbeInstallStatus,
    shouldRecheckInstallAfterDataError,
    toInstallScreenState,
    type InstallScreenState,
  } from './lib/appInstall'
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
  const ROOT_HOME_BACKGROUND_PROPERTIES = [
    '--home-background',
    '--home-background-mask',
    '--home-background-mask-color',
  ]

  let booting = true
  let installState: InstallScreenState = { type: 'checking' }
  let rootError = ''
  // 数据加载失败时的原始异常，用来判断是否需要回头复核安装状态。
  let lastDataError: unknown = null
  let currentView: AppView = 'home'

  function isAdminPath(): boolean {
    if (typeof window === 'undefined') return false
    return window.location.pathname === '/admin' || window.location.pathname === '/admin/'
  }
  let AdminComponent: typeof import('./views/Admin.svelte').default | null = null
  let LoginModalComponent: typeof import('./components/LoginModal.svelte').default | null = null
  let BookmarkEditModalComponent: typeof import('./components/BookmarkEditModal.svelte').default | null = null
  let CategoryEditModalComponent: typeof import('./components/CategoryEditModal.svelte').default | null = null
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
  const ensureCategoryEditModalComponent = createLazyComponentLoader({
    load: () => import('./components/CategoryEditModal.svelte'),
    getCurrent: () => CategoryEditModalComponent,
    setCurrent: (component) => {
      CategoryEditModalComponent = component
    },
  })

  let loginModalOpen = false
  let categoryModalOpen = false
  let bookmarkModalOpen = false
  let categoryCreateReturnToHome = false
  let homeFocusCategoryId: number | null = null

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
  // 只在浏览器里创建：SSR/测试环境没有 document 和 URL.createObjectURL。
  let customScriptController: CustomScriptController | null = null
  const categorySortState = createOptimisticSortState()
  const bookmarkSortState = createOptimisticSortState()

  configureDataService({
    onRootError: (message, error) => {
      rootError = message
      lastDataError = error
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

    // Mobile overscroll exposes the root canvas outside the fixed homepage layers.
    const parsedHomeBackground = document.createElement('div').style
    parsedHomeBackground.cssText = homeBackgroundStyle
    for (const property of ROOT_HOME_BACKGROUND_PROPERTIES) {
      document.documentElement.style.setProperty(property, parsedHomeBackground.getPropertyValue(property))
    }

    // OD-01: Custom CSS injection
    let styleTag = document.getElementById('custom-css-inject');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'custom-css-inject';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = publicData?.settings?.custom_css ?? '';
  }

  // 自定义 JS 单独走一条响应式语句：上面那个块还依赖 activeTheme 和
  // homeBackgroundStyle，写在里面的话切个主题就会把用户脚本重跑一遍。
  // controller 内部还做了幂等，即使这条语句被多余触发也不会重复执行。
  $: customScriptController?.apply(publicData?.settings?.custom_js)

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

  async function handleAdminTabChange(tab: AdminTab): Promise<void> {
    if (tab !== 'analytics') return

    try {
      await refreshLoggedInData(true)
    } catch (error) {
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
    authStore.setSession(session)
    replaceBrowserPath('/')
    installState = { type: 'checking' }
    await initializeApp(true)
  }

  async function checkInstallStatus(forceProbe = false): Promise<boolean> {
    const installedHint = hasInstalledHint(getInstallHintStorage())
    const pathname = typeof window === 'undefined' ? '/' : window.location.pathname

    // 浏览器已经记住装过时直接放行：这个探测过去无条件串行阻塞在数据加载之前，
    // 每次打开页面白白多一个网络往返。标记过期的情况由 recheckInstallAfterDataError 兜底。
    if (!shouldProbeInstallStatus({ installedHint, pathname, forceProbe })) {
      return true
    }

    installState = { type: 'checking' }

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

  // 跳过启动探测的代价：数据库被重置或重新绑定后，本地的「装过」标记会过期。
  // 数据加载因服务端错误失败时回头复核一次，把用户带回安装页。
  async function recheckInstallAfterDataError(error: unknown): Promise<boolean> {
    if (!shouldRecheckInstallAfterDataError(error)) return false
    return !await checkInstallStatus(true)
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
    lastDataError = null

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
          if (await recheckInstallAfterDataError(error)) return
          rootError = getErrorMessage(error)
        }

        await refreshPublicData()
      }
    } else {
      await refreshPublicData(true)
      if (rootError && await recheckInstallAfterDataError(lastDataError)) return
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
    categoryCreateReturnToHome = false
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
      const revocationWarning = logoutRevocationWarning(await authStore.logout())
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
      // 放在视图切换之后：Toast 是全局层，不受这次视图切换影响，而先切视图能让
      // 「已退出」这件事先于警告可见。
      if (revocationWarning) {
        toastStore.addToast(revocationWarning, 'error', { duration: 12000 })
      }
    } catch (error) {
      rootError = getErrorMessage(error)
    }
  }

  async function handleOpenCreateCategory(parentId: string | number | null = null, returnToHomeOverride: boolean | undefined = undefined): Promise<void> {
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    categoryError = ''
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    const returnToHome = returnToHomeOverride ?? parentId != null
    if (returnToHome) await ensureCategoryEditModalComponent()
    else await ensureAdminComponent()
    categoryCreateReturnToHome = returnToHome
    categoryModalMode = 'create'
    activeCategory = createCategoryDraft(parentId)
    categoryModalOpen = true
    if (!returnToHome) currentView = 'admin'
  }
  async function handleOpenCreateRootCategory(): Promise<void> {
    await handleOpenCreateCategory(null, true)
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
    const returnToHome = categoryCreateReturnToHome
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
      if (returnToHome) {
        currentView = 'home'
        homeFocusCategoryId = null
        await tick()
        homeFocusCategoryId = category.id
        await tick()
        document.getElementById(`home-category-tab-${category.id}`)?.click()
      }
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
  async function handleBatchMoveBookmarks(payload: BookmarkBatchMoveReq): Promise<void> {
    bookmarkError = ''
    try {
      const result = await api.bookmarks.batchMove(payload)
      await refreshAdminDataAfterMutation()
      toastStore.addToast(`已移动 ${result.moved} 个书签`, 'success')
    } catch (error) {
      bookmarkError = getErrorMessage(error)
      throw error
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

  // 跨分类整理是全量提交：失败时草稿与服务端状态已不一致，
  // 先按兄弟排序处理器的约定回滚到服务端数据，再把原始错误交给首页展示。
  async function handleReorganizeBookmarks(
    categoryOrders: BookmarkReorganizeReq['category_orders'],
  ): Promise<void> {
    try {
      await api.bookmarks.reorganize(categoryOrders)
    } catch (error) {
      await refreshLoggedInData(true)
      throw error
    }
    await refreshAdminDataAfterMutation()
  }

  async function handleExportData(selection: BackupSelectionInput): Promise<void> {
    await exportDataToFile(importExportState, selection, (next) => {
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
    customScriptController = createCustomScriptController(createBrowserCustomScriptHost())

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
    // 不 revoke 的话每次重建都会漏一个 blob URL。
    customScriptController?.destroy()
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
        <svg class="app-splash-spinner" viewBox="0 0 50 50">
          <circle class="ring" cx="25" cy="25" r="20" fill="none" stroke="url(#splash-spinner-grad-boot)" stroke-width="3.5"></circle>
          <circle class="dot" cx="25" cy="25" r="4.5" fill="#2dd4bf"></circle>
          <defs>
            <linearGradient id="splash-spinner-grad-boot" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"></stop>
              <stop offset="60%" stop-color="#2dd4bf"></stop>
              <stop offset="100%" stop-color="#bef264"></stop>
            </linearGradient>
          </defs>
        </svg>
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
          onOpenCreateCategory={handleOpenCreateCategory}
          onOpenCreateRootCategory={handleOpenCreateRootCategory}
          focusCategoryId={homeFocusCategoryId}
          onOpenCreateBookmark={handleOpenCreateBookmark}
          onEditBookmark={handleEditBookmark}
          onReorganizeBookmarks={handleReorganizeBookmarks}
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
          <div class="app-splash-mark" aria-hidden="true">
            <svg class="app-splash-spinner" viewBox="0 0 50 50">
              <circle class="ring" cx="25" cy="25" r="20" fill="none" stroke="url(#splash-spinner-grad-login)" stroke-width="3.5"></circle>
              <circle class="dot" cx="25" cy="25" r="4.5" fill="#2dd4bf"></circle>
              <defs>
                <linearGradient id="splash-spinner-grad-login" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#38bdf8"></stop>
                  <stop offset="60%" stop-color="#2dd4bf"></stop>
                  <stop offset="100%" stop-color="#bef264"></stop>
                </linearGradient>
              </defs>
            </svg>
          </div>
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
        onBatchMoveBookmarks={handleBatchMoveBookmarks}
        onSubmitSettings={handleSubmitSettings}
        onChangePassword={handleChangePassword}
        onSortCategories={handleSortCategories}
        onSortBookmarks={handleSortBookmarks}
        onSelectTab={handleAdminTabChange}
        importing={importExportState.importing}
        exporting={importExportState.exporting}
        backupError={importExportState.backupError}
        backupMessage={importExportState.backupMessage}
        onExportData={handleExportData}
        onImportData={handleImportData}
      />
    {:else}
      <div class="app-splash">
        <div class="app-splash-card app-splash-card--loading" role="status" aria-live="polite" aria-busy="true">
          <div class="app-splash-mark" aria-hidden="true">
            <svg class="app-splash-spinner" viewBox="0 0 50 50">
              <circle class="ring" cx="25" cy="25" r="20" fill="none" stroke="url(#splash-spinner-grad-admin)" stroke-width="3.5"></circle>
              <circle class="dot" cx="25" cy="25" r="4.5" fill="#2dd4bf"></circle>
              <defs>
                <linearGradient id="splash-spinner-grad-admin" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#38bdf8"></stop>
                  <stop offset="60%" stop-color="#2dd4bf"></stop>
                  <stop offset="100%" stop-color="#bef264"></stop>
                </linearGradient>
              </defs>
            </svg>
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
    {#if CategoryEditModalComponent && categoryCreateReturnToHome}
      <svelte:component
        this={CategoryEditModalComponent}
        open={categoryModalOpen}
        loading={savingCategory}
        error={categoryError}
        mode={categoryModalMode}
        value={activeCategory}
        categories={adminCategories}
        onSubmit={handleSubmitCategory}
        onCancel={handleCloseCategoryModal}
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
