<svelte:options runes />

<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import { get } from 'svelte/store'
  import { fade } from 'svelte/transition'
  import {
    type LoginResp,
    type PublicBookmark,
    type ThemeMode,
  } from '../shared/types'
  import AppSplash from './components/AppSplash.svelte'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import Toast from './components/Toast.svelte'
  import Home from './views/Home.svelte'
  import BookmarkLinkModal from './components/BookmarkLinkModal.svelte'
  import { api } from './lib/api'
  import { clearCachedAdminData } from './lib/adminDataCache'
  import { clearCachedPublicData } from './lib/publicDataCache'
  import { toastStore } from './lib/toast'
  import { createAuthController, createAuthViewIntent } from './lib/appAuthController'
  import {
    createConfirmController,
    type ConfirmDialogInput,
    type ConfirmDialogState,
  } from './lib/appConfirmDialog'
  import {
    buildHomeBackground,
    toAdminBookmarks,
    toAdminCategories,
    toSettingsForm,
  } from './lib/appData'
  import { createLazyComponentRegistry } from './lib/appLazyComponent'
  import {
    createBrowserCustomScriptHost,
    createCustomScriptController,
    type CustomScriptController,
  } from './lib/customScript'
  import { getInstallViewState, replaceBrowserPath } from './lib/appInstall'
  import { createAppBootController, getBrowserInstallHintStorage } from './lib/appBootController'
  import { readReducedMotion, subscribeSystemDark } from './lib/appMediaPreferences'
  import { createEditIntentCounter } from './lib/appEditIntent'
  import { createCategoryController } from './lib/appCategoryController'
  import { createBookmarkController } from './lib/appBookmarkController'
  import { createSettingsController } from './lib/appSettingsController'
  import {
    canSeeHomeView,
    shouldOpenLoginGate,
    type AppView,
  } from './lib/appNavigation'
  import { resolveGlobalShortcut } from './lib/appShortcuts'
  import { getAdminBookmarkCategoryOptions } from './lib/adminListState'
  import { getNextThemePreference, resolveAppThemeState } from './lib/appThemeState'
  import { installPublicDataFocusRefresh } from './lib/publicDataFocusRefresh'
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
    readAdminDataForEdit,
    confirmLoggedInDataAfterLocalMutation,
    refreshLoggedInData,
    refreshPublicData,
    refreshVisibleData,
  } from './lib/dataService'
  import { createRootStyleWriter } from './lib/rootStyleWriter'

  const rootStyleWriter = typeof document !== 'undefined' ? createRootStyleWriter(document) : null

  // 代码审查三轮第 19 项（APP_SPLIT_PLAN 第 8b 步）：App 改为 runes 模式，子组件仍为 legacy。
  // 控制器经 onChange 写入的对象值一律用 $state.raw：不做深层代理（子组件拿到的仍是控制器的原对象，
  // 身份比较照旧成立），同引用赋值也不会触发更新，与原先的身份守卫语义一致。
  let rootError = $state('')
  let currentView: AppView = $state('home')

  function isAdminPath(): boolean {
    if (typeof window === 'undefined') return false
    return window.location.pathname === '/admin' || window.location.pathname === '/admin/'
  }
  // 7 个按需加载的视图 / 模态。保持 `import()` 字面量，Vite 才会按原样分包（firstScreenChunks 测试兜底）。
  // 安装 / 找回密码视图只在首次部署或忘记密码时出现，不进首屏 chunk（代码审查二轮第 4 项）。
  const lazyComponents = createLazyComponentRegistry({
    Admin: () => import('./views/Admin.svelte'),
    LoginModal: () => import('./components/LoginModal.svelte'),
    BookmarkEditModal: () => import('./components/BookmarkEditModal.svelte'),
    CategoryEditModal: () => import('./components/CategoryEditModal.svelte'),
    SearchSpotlight: () => import('./components/SearchSpotlight.svelte'),
    Install: () => import('./views/Install.svelte'),
    Recover: () => import('./views/Recover.svelte'),
  })
  const {
    Admin: AdminComponent,
    LoginModal: LoginModalComponent,
    BookmarkEditModal: BookmarkEditModalComponent,
    CategoryEditModal: CategoryEditModalComponent,
    SearchSpotlight: SearchSpotlightComponent,
    Install: InstallComponent,
    Recover: RecoverComponent,
  } = lazyComponents.components
  // 分类与书签共用一个编辑意图计数器（见 lib/appEditIntent），两个控制器注入同一个实例。
  const editIntent = createEditIntentCounter()
  const authViewIntent = createAuthViewIntent()
  // 各用例控制器共用的同名依赖只在这里写一次，再展开进每个控制器：依赖对象的属性名不会被压缩，
  // 逐个控制器重复书写会让首屏 index 每步多出约 1.7 kB。每个控制器只取自己声明的那几项；
  // 编辑框重置经箭头函数转发给稍后创建的控制器（只在用户操作时调用）。
  const appDeps = {
    api,
    editIntent,
    authViewIntent,
    isLoggedIn,
    isAdminPath,
    getPublicMode: () => get(configStore).data?.public_mode,
    getAdminData: () => adminData,
    setSession: (session: LoginResp | null) => authStore.setSession(session),
    resetAdminData: () => adminStore.reset(),
    clearCachedAdminData,
    refreshLoggedInData,
    confirmLoggedInDataAfterLocalMutation,
    refreshPublicData,
    readAdminDataForEdit,
    persistCurrentAdminData,
    requestConfirmation,
    ensureLazyComponent: lazyComponents.ensure,
    replacePath: replaceBrowserPath,
    // 认证控制器最后创建（登出要重置其它控制器）；这三项转发给它，返回同一个 promise。
    openLogin: () => authController.openLogin(),
    ensureLoggedInDataLoaded: () => authController.ensureLoggedInDataLoaded(),
    refreshAdminDataAfterMutation: () => authController.refreshAdminDataAfterMutation(),
    confirmAdminDataAfterLocalMutation: () => authController.confirmAdminDataAfterLocalMutation(),
    resetCategories: () => categoryController.reset(),
    resetBookmarks: () => bookmarkController.reset(),
    setRootError: (message: string) => {
      rootError = message
    },
    setLoginModalOpen: (open: boolean) => {
      loginModalOpen = open
    },
    setCurrentView: (view: AppView) => {
      currentView = view
    },
  }
  // 启动 / 安装 / 找回流程见 lib/appBootController：控制器持有 booting / installState / recoverActive，
  // rootError / currentView / loginModalOpen 仍归 App，经下列回调在原先的时机读写。
  const boot = createAppBootController({
    ...appDeps,
    onChange: (next) => {
      booting = next.booting
      recoverActive = next.recoverActive
      // 只在控制器真正换了对象时赋值：legacy 模式下对象的同引用赋值也会触发依赖，否则 booting 变化会连带
      // 重跑 installView 与 Install 分包加载。runes 下 $state.raw 的同引用赋值本就是空操作，守卫保留为显式意图。
      if (installState !== next.installState) installState = next.installState
    },
    installApi: api.install,
    getInstallHintStorage: getBrowserInstallHintStorage,
    getPathname: () => typeof window === 'undefined' ? null : window.location.pathname,
    clearCachedPublicData,
    initializeAuth: () => authStore.initialize(),
    getRootError: () => rootError,
  })
  const initialBootState = boot.getState()
  let booting = $state(initialBootState.booting)
  let installState = $state.raw(initialBootState.installState)
  let recoverActive = $state(initialBootState.recoverActive)
  let lazyViewError = $state('')
  let confirmDialog: ConfirmDialogState | null = $state.raw(null)
  const confirmController = createConfirmController((next) => {
    confirmDialog = next
  })

  function loadLazyView(name: 'Install' | 'Recover'): void {
    lazyViewError = ''
    void lazyComponents.ensure(name).catch((error) => {
      console.warn('[CF-Navs] failed to load view chunk', error)
      lazyViewError = '页面资源加载失败，请检查网络后刷新重试。'
    })
  }
  let loginModalOpen = $state(false)
  let homeFocusCategoryId: number | null = $state(null)
  let spotlightOpen = $state(false)
  let viewBookmark: PublicBookmark | null = $state.raw(null)

  function anyBlockingModalOpen(): boolean {
    return loginModalOpen || categoryModalOpen || bookmarkModalOpen || Boolean(confirmDialog) || Boolean(viewBookmark)
  }

  async function openSpotlight(): Promise<void> {
    if (spotlightOpen || anyBlockingModalOpen()) return
    if (currentView !== 'home' || !canSeeHome) return
    await lazyComponents.ensure('SearchSpotlight')
    // 懒加载是异步的：其间可能开了模态或切了视图/登出。加载完成后重新校验，
    // 否则会与刚打开的模态并发出现，破坏 D-e 模态互斥与单槽滚动锁。
    if (spotlightOpen || anyBlockingModalOpen()) return
    if (currentView !== 'home' || !canSeeHome) return
    spotlightOpen = true
  }

  function closeSpotlight(): void {
    spotlightOpen = false
  }

  function openBookmarkView(bookmark: PublicBookmark): void {
    viewBookmark = bookmark
  }

  function closeBookmarkView(): void {
    viewBookmark = null
  }

  // 全局快捷键集中在 App：决策逻辑见 lib/appShortcuts（Ctrl+K / Cmd+K / 「/」 唤起 Spotlight，Esc 关闭）；
  // 模态互斥由 openSpotlight 内部把关。
  function handleGlobalKeyDown(event: KeyboardEvent): void {
    const action = resolveGlobalShortcut(event, { homeActive: currentView === 'home' && canSeeHome, spotlightOpen })
    if (!action) return
    event.preventDefault()
    if (action === 'close-spotlight') closeSpotlight()
    else void openSpotlight()
  }

  let preferredThemeMode: ThemeMode | null = $state(null)
  let prefersReducedMotion = $state(false)
  // 只在浏览器里创建：SSR/测试环境没有 document 和 URL.createObjectURL。
  let customScriptController: CustomScriptController | null = $state.raw(null)

  configureDataService({
    onRootError: (message, error) => {
      rootError = message
      boot.recordDataError(error)
    },
    onLocalSnapshotRestored: () => {
      boot.revealHomeFromCurrentData()
    },
    onNetworkFallback: (message) => {
      toastStore.addToast(message, 'info', { duration: 8000 })
    },
  })

  const installView = $derived(getInstallViewState(installState))
  const config = $derived($configStore.data)
  const publicData = $derived($publicStore.data)
  const adminData = $derived($adminStore.data)
  const canSeeHome = $derived(canSeeHomeView({ publicMode: config?.public_mode, authenticated: $isAuthenticated }))
  const homeTitle = $derived(publicData?.settings.site_title ?? config?.site_title ?? 'CF-Navs')

  const adminCategories = $derived(toAdminCategories(adminData.categories, adminData.bookmarks))
  const adminBookmarks = $derived(toAdminBookmarks(adminData.bookmarks))
  const settingsValue = $derived(toSettingsForm(adminData.settings))

  // 懒加载组件的当前值（未加载时为 null），模板里作为动态组件渲染。
  const RecoverPage = $derived($RecoverComponent)
  const InstallPage = $derived($InstallComponent)
  const AdminPage = $derived($AdminComponent)
  const LoginModal = $derived($LoginModalComponent)
  const BookmarkEditModal = $derived($BookmarkEditModalComponent)
  const CategoryEditModal = $derived($CategoryEditModalComponent)
  const SearchSpotlight = $derived($SearchSpotlightComponent)

  // 加载期间沿用启动 splash；失败时在 splash 上给出可读提示而不是一直转圈。
  // 以下副作用用 $effect.pre：与原先的 `$:` 一样在同一次刷新里先于 DOM 更新执行（登录闸门尤其依赖这一点，
  // 否则会先渲染一帧后台 splash 再切到登录视图）。声明顺序即执行顺序，与原先 `$:` 排序后的顺序一致。
  $effect.pre(() => {
    if (recoverActive && !RecoverPage) loadLazyView('Recover')
  })
  $effect.pre(() => {
    if (!recoverActive && installView && !InstallPage) loadLazyView('Install')
  })

  $effect.pre(() => {
    if (shouldOpenLoginGate({ booting, currentView, canSeeHome })) {
      void lazyComponents.ensure('LoginModal')
      loginModalOpen = true
      currentView = 'login'
    }
  })

  let systemPrefersDark = $state(false)
  let stopSystemDark: (() => void) | null = null
  let stopPublicDataFocusRefresh: (() => void) | null = null

  const resolvedThemeState = $derived(resolveAppThemeState({
    preferredThemeMode,
    configuredThemeMode: publicData?.settings.theme,
    systemPrefersDark,
  }))
  const themeMode = $derived(resolvedThemeState.themeMode)
  const activeTheme = $derived(resolvedThemeState.activeTheme)

  const homeBackgroundStyle = $derived(buildHomeBackground(publicData?.settings ?? null, activeTheme))

  // 主题 / 背景变量与自定义 CSS 分成两个副作用，只依赖各自的原始值（字符串相等即不重跑），
  // 写入口内部再按内容去重：书签、点击计数、图标状态变化不再重写全局样式。
  const rootBackgroundPresetId = $derived(publicData?.settings.background_preset_id ?? 'custom')
  const customCss = $derived(publicData?.settings?.custom_css ?? '')
  $effect.pre(() => {
    rootStyleWriter?.applyTheme({ theme: activeTheme, backgroundPresetId: rootBackgroundPresetId, backgroundStyle: homeBackgroundStyle })
  })
  $effect.pre(() => {
    rootStyleWriter?.applyCustomCss(customCss)
  })

  // 自定义 JS 单独一个副作用：上面那个还依赖 activeTheme 和
  // homeBackgroundStyle，写在里面的话切个主题就会把用户脚本重跑一遍。
  // controller 内部还做了幂等，即使这里被多余触发也不会重复执行。
  $effect.pre(() => {
    customScriptController?.apply(publicData?.settings?.custom_js)
  })

  function setPreferredThemeMode(mode: ThemeMode): void {
    preferredThemeMode = mode
    writePreferredThemeMode(mode)
  }

  function handleToggleTheme(): void {
    setPreferredThemeMode(getNextThemePreference(themeMode))
  }

  function requestConfirmation(options: ConfirmDialogInput): Promise<boolean> {
    return confirmController.request(options)
  }

  function handleConfirmDialogConfirm(): void {
    confirmController.close(true)
  }

  function handleConfirmDialogCancel(): void {
    confirmController.close(false)
  }

  // 分类的打开 / 编辑 / 提交 / 删除 / 批量删除 / 排序见 lib/appCategoryController：控制器持有分类编辑框状态，
  // rootError / currentView / homeFocusCategoryId 仍归 App，经下列回调在原先的时机写入。
  const categoryController = createCategoryController({
    ...appDeps,
    onChange: (next) => {
      categoryModalOpen = next.modalOpen
      categoryModalMode = next.modalMode
      // 同引用不赋值（legacy 下同引用赋值会把同一份 value 再推给编辑框；runes 下 $state.raw 本就不触发）。
      if (activeCategory !== next.active) activeCategory = next.active
      savingCategory = next.saving
      deletingCategoryId = next.deletingId
      categoryError = next.error
      categoryCreateReturnToHome = next.createReturnToHome
    },
    applyLocalCategoryUpsert,
    applyLocalCategoryDelete,
    applyLocalCategorySort,
    setHomeFocusCategoryId: (id) => {
      homeFocusCategoryId = id
    },
    tick,
  })
  const initialCategoryState = categoryController.getState()
  let categoryModalOpen = $state(initialCategoryState.modalOpen)
  let categoryModalMode = $state(initialCategoryState.modalMode)
  let activeCategory = $state.raw(initialCategoryState.active)
  let savingCategory = $state(initialCategoryState.saving)
  let deletingCategoryId = $state(initialCategoryState.deletingId)
  let categoryError = $state(initialCategoryState.error)
  let categoryCreateReturnToHome = $state(initialCategoryState.createReturnToHome)

  // 书签的新建 / 编辑 / 提交 / 删除 / 批量删除 / 批量移动 / 排序 / 跨分类整理见 lib/appBookmarkController，
  // 与分类控制器共用同一个 editIntent。
  const bookmarkController = createBookmarkController({
    ...appDeps,
    onChange: (next) => {
      bookmarkModalOpen = next.modalOpen
      bookmarkModalMode = next.modalMode
      if (activeBookmark !== next.active) activeBookmark = next.active
      savingBookmark = next.saving
      deletingBookmarkId = next.deletingId
      bookmarkError = next.error
    },
    getSession: () => get(authStore).session,
    readAdminData: () => get(adminStore).data,
    applyLocalBookmarkUpsert,
    applyLocalBookmarkDelete,
    applyLocalBookmarkSort,
    refreshBookmarkIconCacheInBackground,
  })
  const initialBookmarkState = bookmarkController.getState()
  let bookmarkModalOpen = $state(initialBookmarkState.modalOpen)
  let bookmarkModalMode = $state(initialBookmarkState.modalMode)
  let activeBookmark = $state.raw(initialBookmarkState.active)
  let savingBookmark = $state(initialBookmarkState.saving)
  let deletingBookmarkId = $state(initialBookmarkState.deletingId)
  let bookmarkError = $state(initialBookmarkState.error)

  // 设置保存 / 改密 / 导入导出见 lib/appSettingsController：控制器持有保存中 / 错误与导入导出状态。
  const settingsController = createSettingsController({
    ...appDeps,
    onChange: (next) => {
      savingSettings = next.saving
      settingsError = next.error
      if (importExportState !== next.importExport) importExportState = next.importExport
    },
    applyLocalSettings,
    applyLoggedInData,
  })
  const initialSettingsState = settingsController.getState()
  let savingSettings = $state(initialSettingsState.saving)
  let settingsError = $state(initialSettingsState.error)
  let importExportState = $state.raw(initialSettingsState.importExport)

  // 登录 / 登出 / 进入后台 / 忘记密码与登录态数据加载、变更后刷新见 lib/appAuthController：
  // 不持有状态，loginModalOpen / currentView / rootError 仍归 App；登出经注入的函数按原顺序重置三个编辑状态。
  const authController = createAuthController({
    ...appDeps,
    authStore,
    getCanSeeHome: () => canSeeHome,
    readAdminState: () => get(adminStore),
    applyConfigFromSettings,
    enterRecover: boot.enterRecover,
    resetSettings: settingsController.reset,
  })

  onMount(() => {
    preferredThemeMode = readPreferredThemeMode()
    customScriptController = createCustomScriptController(createBrowserCustomScriptHost())

    prefersReducedMotion = readReducedMotion()
    stopSystemDark = subscribeSystemDark((prefersDark) => {
      systemPrefersDark = prefersDark
    })

    // 直达 /recover 时只进入找回流程，不继续启动，也不安装焦点刷新。
    if (!boot.start()) return
    // 切回已打开的标签页时按会话状态刷新（Issue #25 跨标签页设置同步 / Issue #29
    // 登录态保留私密视图）：登录态走登录态聚合刷新，未登录走公开刷新。
    stopPublicDataFocusRefresh = installPublicDataFocusRefresh(() => refreshVisibleData())
  })

  onDestroy(() => {
    stopSystemDark?.()
    // 不 revoke 的话每次重建都会漏一个 blob URL。
    customScriptController?.destroy()
    stopPublicDataFocusRefresh?.()
  })
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

{#if recoverActive && RecoverPage}
  <RecoverPage
    onRecovered={boot.recovered}
    onGoInstall={boot.goInstall}
    onCancel={boot.cancelRecover}
  />
{:else if !recoverActive && installView && InstallPage}
  <InstallPage
    mode={installView.mode}
    missingBindings={installView.missingBindings}
    schemaVersion={installView.schemaVersion}
    installing={installView.installing}
    error={installView.error}
    onInstall={boot.install}
    onRetryStatus={boot.retryInstallStatus}
  />
{:else if booting || recoverActive || installView}
  <AppSplash
    gradientId="splash-spinner-grad-boot"
    loading
    title={lazyViewError ? '页面加载失败' : '正在加载项目数据...'}
    message={lazyViewError ? lazyViewError : '前端状态与后端接口正在初始化，请稍候。'}
    progress={{ label: '初始化数据', status: '同步中' }}
  />
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
          onOpenCreateCategory={categoryController.openCreate}
          focusCategoryId={homeFocusCategoryId}
          onOpenCreateBookmark={bookmarkController.openCreate}
          onEditBookmark={bookmarkController.openEdit}
          onReorganizeBookmarks={bookmarkController.reorganize}
          onSwitchToAdmin={authController.switchToAdmin}
          onLogout={authController.logout}
          onOpenLogin={authController.openLogin}
          activeTheme={activeTheme}
          activeThemeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          onOpenSearch={openSpotlight}
        />
      </div>
    {:else if currentView === 'login'}
      <AppSplash
        gradientId="splash-spinner-grad-login"
        title="请先登录管理员账号"
        message="当前站点未公开，登录后再加载后台管理界面。"
      />
    {:else if AdminPage}
      <AdminPage
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
        onOpenLogin={authController.openLogin}
        onLogout={authController.logout}
      onSwitchToHome={() => { replaceBrowserPath('/'); currentView = 'home' }}
        onOpenCreateCategory={categoryController.openCreate}
        onEditCategory={categoryController.openEdit}
        onDeleteCategory={categoryController.remove}
        onBatchDeleteCategories={categoryController.batchRemove}
        onCloseCategoryModal={categoryController.close}
        onSubmitCategory={categoryController.submit}
        onOpenCreateBookmark={bookmarkController.openCreate}
        onEditBookmark={bookmarkController.openEdit}
        onDeleteBookmark={bookmarkController.remove}
        onBatchDeleteBookmarks={bookmarkController.batchRemove}
        onBatchMoveBookmarks={bookmarkController.batchMove}
        onSubmitSettings={settingsController.submit}
        onChangePassword={settingsController.changePassword}
        onSortCategories={categoryController.sort}
        onSortBookmarks={bookmarkController.sort}
        onSelectTab={authController.selectAdminTab}
        importing={importExportState.importing}
        exporting={importExportState.exporting}
        backupError={importExportState.backupError}
        backupMessage={importExportState.backupMessage}
        onExportData={settingsController.exportData}
        onImportData={settingsController.importData}
      />
    {:else}
      <AppSplash
        gradientId="splash-spinner-grad-admin"
        loading
        title="正在加载后台..."
        message="管理界面分包正在按需载入。"
        progress={{ label: '载入模块', status: '请稍候' }}
      />
    {/if}

    {#if LoginModal}
      <LoginModal
        open={loginModalOpen}
        loading={$authStore.loading}
        error={$authStore.error ?? ''}
        onSubmit={authController.login}
        onCancel={authController.closeLogin}
        onForgotPassword={authController.forgotPassword}
      />
    {/if}

    {#if BookmarkEditModal}
      <BookmarkEditModal
        open={bookmarkModalOpen}
        loading={savingBookmark}
        error={bookmarkError}
        mode={bookmarkModalMode}
        value={activeBookmark}
        categories={getAdminBookmarkCategoryOptions(adminCategories)}
        onSubmit={bookmarkController.submit}
        onCancel={bookmarkController.close}
        onDelete={bookmarkController.remove}
        deleting={deletingBookmarkId === Number(activeBookmark?.id)}
        imageHostUrl={adminData.settings?.image_host_url ?? ''}
      />
    {/if}
    {#if CategoryEditModal && categoryCreateReturnToHome}
      <CategoryEditModal
        open={categoryModalOpen}
        loading={savingCategory}
        error={categoryError}
        mode={categoryModalMode}
        value={activeCategory}
        categories={adminCategories}
        onSubmit={categoryController.submit}
        onCancel={categoryController.close}
        imageHostUrl={adminData.settings?.image_host_url ?? ''}
      />
    {/if}
    {#if SearchSpotlight}
      <SearchSpotlight
        open={spotlightOpen}
        bookmarks={publicData?.bookmarks ?? []}
        categories={publicData?.categories ?? []}
        onClose={closeSpotlight}
        onViewBookmark={openBookmarkView}
      />
    {/if}

    {#if viewBookmark}
      <BookmarkLinkModal title={viewBookmark.title} url={viewBookmark.url} onClose={closeBookmarkView} />
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
