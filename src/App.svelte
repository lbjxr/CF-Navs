<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { fade } from 'svelte/transition'
  import {
    ErrCode,
    type AdminData,
    type Bookmark,
    type BookmarkUpsertReq,
    type Category,
    type CategoryUpsertReq,
    type IconSource,
    type PublicBookmark,
    type PublicData,
    type PublicSettings,
    type Settings,
    type SiteConfig,
    type ThemeMode,
  } from '../shared/types'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import Home from './views/Home.svelte'
  import { api, getErrorMessage, isApiError, isUnauthorizedError } from './lib/api'
  import { clearCachedAdminData, readCachedAdminDataEntry, writeCachedAdminData } from './lib/adminDataCache'
  import { colorToRgbString } from './lib/color'
  import { prepareImportPayload, type ImportSource } from './lib/importData'
  import { createBookmarkIconCacheKey, writeBookmarkIconDataUri } from './lib/localBookmarkIconCache'
  import { clearCachedPublicData, readCachedPublicDataEntry, writeCachedPublicData } from './lib/publicDataCache'
  import { adminStore, authStore, configStore, isAuthenticated, publicStore } from './lib/stores'

  type AppView = 'home' | 'admin' | 'login'

  const THEME_STORAGE_KEY = 'cf-navs.theme-mode'
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

  type ConfirmDialogState = {
    title: string
    message: string
    itemTitle: string
    confirmLabel: string
    cancelLabel: string
    variant: 'default' | 'danger'
  }

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
  let currentDataVersion: string | null = null

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
    icon_blob?: string
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
      icon_blob: bookmark.icon_blob ?? '',
      description: bookmark.description ?? '',
      open_method: bookmark.open_method === 2 ? 'same_tab' : bookmark.open_method === 3 ? 'modal' : 'new_tab',
    }))
  }

  type SettingsSubset = Pick<
    Settings,
    'site_title' | 'site_title_color' | 'site_title_font_size' | 'public_mode' | 'theme' | 'background_preset_id' | 'custom_css' | 'custom_js' | 'image_host_url' | 'background' | 'backgrounds' | 'search_engine' | 'card_size' | 'card_style' | 'card_icon_size' | 'card_show_description' | 'card_background_color' | 'card_background_opacity' | 'card_icon_show_title' | 'card_text_color' | 'search_box_show' | 'search_engine_selector_show' | 'content_layout' | 'footer_html'
  >

  function toSettingsForm(settings: Settings | null): SettingsSubset | null {
    if (!settings) return null

    return {
      site_title: settings.site_title,
      site_title_color: settings.site_title_color,
      site_title_font_size: settings.site_title_font_size,
      public_mode: settings.public_mode,
      theme: settings.theme,
      background_preset_id: settings.background_preset_id,
      custom_css: settings.custom_css,
      custom_js: settings.custom_js,
      image_host_url: settings.image_host_url,
      background: settings.background,
      backgrounds: settings.backgrounds,
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
      background_preset_id: settings.background_preset_id,
      background: settings.background,
      backgrounds: settings.backgrounds,
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

  function applyConfigFromSettings(settings: Pick<Settings, 'site_title' | 'public_mode'>): void {
    configStore.setData({
      site_title: settings.site_title,
      public_mode: settings.public_mode,
    })
  }

  function applyConfigFromPublicData(data: PublicData): void {
    configStore.setData({
      site_title: data.settings.site_title,
      public_mode: true,
    })
  }

  function isPublicModeForbidden(error: unknown): boolean {
    return isApiError(error) && error.code === ErrCode.FORBIDDEN
  }

  function siteConfigFromForbiddenError(error: unknown): SiteConfig | null {
    if (!isApiError(error) || !error.data || typeof error.data !== 'object') {
      return null
    }

    const data = error.data as Partial<SiteConfig>
    if (typeof data.site_title === 'string' && data.public_mode === false) {
      return {
        site_title: data.site_title,
        public_mode: false,
      }
    }

    return null
  }

  $: adminCategories = toAdminCategories(adminData.categories, adminData.bookmarks)
  $: adminBookmarks = toAdminBookmarks(adminData.bookmarks)
  $: settingsValue = toSettingsForm(adminData.settings)

  $: if (!booting && currentView === 'home' && !canSeeHome) {
    void ensureLoginModalComponent()
    loginModalOpen = true
    currentView = 'login'
  }

  function buildHomeBackground(settings: PublicSettings | null, theme: 'light' | 'dark'): string {
    if (!settings) return ''

    const background = settings.backgrounds?.[theme] ?? settings.background
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

  $: configuredThemeMode = publicData?.settings.theme ?? 'auto'
  $: themeMode = preferredThemeMode ?? configuredThemeMode
  $: activeTheme = themeMode === 'auto' ? (systemPrefersDark ? 'dark' : 'light') : themeMode

  $: homeBackgroundStyle = buildHomeBackground(publicData?.settings ?? null, activeTheme)

  $: if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = activeTheme
  }

  function isLoggedIn(): boolean {
    return Boolean(get(authStore).session)
  }

  function readPreferredThemeMode(): ThemeMode | null {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : null
  }

  function writePreferredThemeMode(mode: ThemeMode): void {
    preferredThemeMode = mode
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    }
  }

  function handleToggleTheme(): void {
    writePreferredThemeMode(activeTheme === 'dark' ? 'light' : 'dark')
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

  function requestConfirmation(options: {
    title: string
    message: string
    itemTitle?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'danger'
  }): Promise<boolean> {
    confirmDialogResolver?.(false)

    return new Promise((resolve) => {
      confirmDialogResolver = resolve
      confirmDialog = {
        title: options.title,
        message: options.message,
        itemTitle: options.itemTitle ?? '',
        confirmLabel: options.confirmLabel ?? '确认',
        cancelLabel: options.cancelLabel ?? '取消',
        variant: options.variant ?? 'default',
      }
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

  function getDataVersion(data: { version?: string } | null | undefined): string | null {
    return typeof data?.version === 'string' && data.version ? data.version : null
  }

  function stripPublicDataVersion(data: PublicData): PublicData {
    const { version: _version, ...rest } = data
    return rest as PublicData
  }

  function stripAdminDataVersion(data: AdminData): AdminData {
    const { version: _version, ...rest } = data
    return rest as AdminData
  }

  function recordsEqual(a: object, b: object): boolean {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false

    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false
      if (!Object.is(left[key], right[key])) return false
    }

    return true
  }

  function jsonEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true

    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }

  function mergeRowsById<T extends { id: number }>(current: T[], next: T[]): T[] {
    if (current.length === 0) return next

    const currentById = new Map(current.map((item) => [item.id, item]))
    let changed = current.length !== next.length

    const merged = next.map((item, index) => {
      const existing = currentById.get(item.id)
      const value = existing && recordsEqual(existing, item) ? existing : item
      if (current[index] !== value) changed = true
      return value
    })

    return changed ? merged : current
  }

  function mergePublicData(current: PublicData | null, next: PublicData): PublicData {
    if (!current) return next

    const categories = mergeRowsById(current.categories, next.categories)
    const bookmarks = mergeRowsById(current.bookmarks, next.bookmarks)
    const settings = jsonEqual(current.settings, next.settings) ? current.settings : next.settings

    if (categories === current.categories && bookmarks === current.bookmarks && settings === current.settings) {
      return current
    }

    return { categories, bookmarks, settings }
  }

  function mergeAdminData(current: AdminData, next: AdminData): AdminData {
    const categories = mergeRowsById(current.categories, next.categories)
    const bookmarks = mergeRowsById(current.bookmarks, next.bookmarks)
    const settings = jsonEqual(current.settings, next.settings) ? current.settings : next.settings

    if (categories === current.categories && bookmarks === current.bookmarks && settings === current.settings) {
      return current
    }

    return { categories, bookmarks, settings }
  }

  function applyPublicData(data: PublicData, version = getDataVersion(data)): PublicData {
    const cleanData = stripPublicDataVersion(data)
    const currentState = get(publicStore)
    const merged = mergePublicData(currentState.data, cleanData)

    if (!currentState.loaded || merged !== currentState.data) {
      publicStore.setData(merged)
    }

    applyConfigFromPublicData(merged)
    currentDataVersion = version
    return merged
  }

  async function refreshPublicData(): Promise<PublicData | null> {
    const config = get(configStore).data
    if (config?.public_mode === false && !isLoggedIn()) {
      publicStore.reset()
      return null
    }

    const cached = !isLoggedIn() ? await readCachedPublicDataEntry() : null
    if (cached?.data) {
      applyPublicData(cached.data, cached.version)
    }

    try {
      if (cached?.version) {
        const remoteVersion = await api.data.version(false)
        configStore.setData({
          site_title: remoteVersion.site_title,
          public_mode: remoteVersion.public_mode,
        })
        currentDataVersion = remoteVersion.version

        if (remoteVersion.version === cached.version) {
          return get(publicStore).data
        }
      }

      const data = applyPublicData(await api.public.getData(false))
      if (!isLoggedIn()) {
        await writeCachedPublicData(data, currentDataVersion)
      }
      return data
    } catch (error) {
      if (isPublicModeForbidden(error)) {
        const forbiddenConfig = siteConfigFromForbiddenError(error) ?? {
          site_title: config?.site_title ?? 'CF-Navs',
          public_mode: false,
        }

        if (isLoggedIn()) {
          try {
            const data = applyPublicData(await api.public.getData(true))
            configStore.setData({
              site_title: data.settings.site_title || forbiddenConfig.site_title,
              public_mode: false,
            })
            return data
          } catch (authError) {
            if (isUnauthorizedError(authError)) {
              authStore.setSession(null)
              adminStore.reset()
              publicStore.reset()
              configStore.setData(forbiddenConfig)
              return null
            }

            if (!isPublicModeForbidden(authError)) {
              rootError = getErrorMessage(authError)
              return null
            }
          }
        }

        await clearCachedPublicData()
        publicStore.reset()
        configStore.setData(forbiddenConfig)
        return null
      }

      if (cached?.data) {
        return get(publicStore).data
      }

      rootError = getErrorMessage(error)
      return null
    }
  }

  function updatePublicDataLocally(transform: (data: PublicData) => PublicData): boolean {
    const current = get(publicStore).data
    if (!current) return false

    const next = transform(current)
    publicStore.setData(next)
    return true
  }

  function updateAdminCategoriesLocally(transform: (categories: Category[]) => Category[]): void {
    if (!isLoggedIn()) return
    adminStore.setCategories(transform(get(adminStore).data.categories))
  }

  function updateAdminBookmarksLocally(transform: (bookmarks: Bookmark[]) => Bookmark[]): void {
    if (!isLoggedIn()) return
    adminStore.setBookmarks(transform(get(adminStore).data.bookmarks))
  }

  async function refreshListsWhenLocalDataMissing(): Promise<void> {
    if (!get(publicStore).data) {
      if (isLoggedIn()) {
        await refreshLoggedInData()
      } else {
        await refreshPublicData()
      }
    }
  }

  async function applyLocalCategoryUpsert(category: Category): Promise<void> {
    updateAdminCategoriesLocally((categories) => {
      const exists = categories.some((item) => item.id === category.id)
      return exists
        ? categories.map((item) => (item.id === category.id ? category : item))
        : [...categories, category]
    })

    const updated = updatePublicDataLocally((data) => {
      const exists = data.categories.some((item) => item.id === category.id)
      const categories = exists
        ? data.categories.map((item) => (item.id === category.id ? category : item))
        : [...data.categories, category]

      return { ...data, categories }
    })

    if (!updated) await refreshListsWhenLocalDataMissing()
    await persistCurrentAdminData()
  }

  async function applyLocalCategoryDelete(categoryId: number): Promise<void> {
    updateAdminCategoriesLocally((categories) => categories.filter((item) => item.id !== categoryId))
    updateAdminBookmarksLocally((bookmarks) => bookmarks.filter((item) => item.category_id !== categoryId))

    const updated = updatePublicDataLocally((data) => ({
      ...data,
      categories: data.categories.filter((item) => item.id !== categoryId),
      bookmarks: data.bookmarks.filter((item) => item.category_id !== categoryId),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
    await persistCurrentAdminData()
  }

  async function applyLocalBookmarkUpsert(bookmark: Bookmark): Promise<void> {
    updateAdminBookmarksLocally((bookmarks) => {
      const exists = bookmarks.some((item) => item.id === bookmark.id)
      return exists
        ? bookmarks.map((item) => (item.id === bookmark.id ? bookmark : item))
        : [...bookmarks, bookmark]
    })

    const updated = updatePublicDataLocally((data) => {
      const exists = data.bookmarks.some((item) => item.id === bookmark.id)
      const bookmarks = exists
        ? data.bookmarks.map((item) => (item.id === bookmark.id ? bookmark : item))
        : [...data.bookmarks, bookmark]

      return { ...data, bookmarks }
    })

    if (!updated) await refreshListsWhenLocalDataMissing()
    await persistCurrentAdminData()
  }

  async function applyLocalBookmarkDelete(bookmarkId: number): Promise<void> {
    updateAdminBookmarksLocally((bookmarks) => bookmarks.filter((item) => item.id !== bookmarkId))

    const updated = updatePublicDataLocally((data) => ({
      ...data,
      bookmarks: data.bookmarks.filter((item) => item.id !== bookmarkId),
    }))

    if (!updated) await refreshListsWhenLocalDataMissing()
    await persistCurrentAdminData()
  }

  async function applyLocalBookmarkIconBlob(bookmarkId: number, iconBlob: string | null): Promise<void> {
    updateAdminBookmarksLocally((bookmarks) => bookmarks.map((bookmark) => (
      bookmark.id === bookmarkId ? { ...bookmark, icon_blob: iconBlob } : bookmark
    )))

    updatePublicDataLocally((data) => ({
      ...data,
      bookmarks: data.bookmarks.map((bookmark) => (
        bookmark.id === bookmarkId ? { ...bookmark, icon_blob: iconBlob } : bookmark
      )),
    }))

    if (iconBlob?.startsWith('data:image/')) {
      const current =
        get(adminStore).data.bookmarks.find((bookmark) => bookmark.id === bookmarkId) ??
        get(publicStore).data?.bookmarks.find((bookmark) => bookmark.id === bookmarkId)
      if (current) {
        await writeBookmarkIconDataUri(
          createBookmarkIconCacheKey({
            id: current.id,
            icon: current.icon ?? '',
            iconSource: current.icon_source,
          }),
          iconBlob,
        )
      }
    }

    await persistCurrentAdminData()
  }

  async function refreshBookmarkIconCache(bookmarkId: number): Promise<string | null> {
    const result = await api.bookmarks.refreshIconCache(bookmarkId)
    await applyLocalBookmarkIconBlob(bookmarkId, result.icon_blob)
    return result.icon_blob
  }

  function refreshBookmarkIconCacheInBackground(bookmarkId: number): void {
    void refreshBookmarkIconCache(bookmarkId).catch(() => undefined)
  }

  async function applyLocalCategorySort(ids: number[], refreshMissing = true): Promise<void> {
    const sortById = new Map(ids.map((id, index) => [id, index]))
    updateAdminCategoriesLocally((categories) => categories
      .map((category) => (
        sortById.has(category.id)
          ? { ...category, sort: sortById.get(category.id) ?? category.sort }
          : category
      ))
      .sort((a, b) => a.sort - b.sort || a.id - b.id))

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

    if (!updated && refreshMissing) await refreshListsWhenLocalDataMissing()
    if (refreshMissing) await persistCurrentAdminData()
  }

  async function applyLocalBookmarkSort(ids: number[], refreshMissing = true): Promise<void> {
    const sortById = new Map(ids.map((id, index) => [id, index]))
    updateAdminBookmarksLocally((bookmarks) => bookmarks
      .map((bookmark) => (
        sortById.has(bookmark.id)
          ? { ...bookmark, sort: sortById.get(bookmark.id) ?? bookmark.sort }
          : bookmark
      ))
      .sort((a, b) => a.sort - b.sort || a.id - b.id))

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

    if (!updated && refreshMissing) await refreshListsWhenLocalDataMissing()
    if (refreshMissing) await persistCurrentAdminData()
  }

  async function applyLocalSettings(settings: Settings): Promise<void> {
    adminStore.setSettings(settings)
    applyConfigFromSettings(settings)

    const current = get(publicStore).data
    if (current) {
      publicStore.setData({
        ...current,
        settings: toPublicSettings(settings),
      })
    }

    await persistCurrentAdminData()
  }

  function applyLoggedInData(data: AdminData, version = getDataVersion(data)): void {
    const cleanData = stripAdminDataVersion(data)
    if (!cleanData.settings) {
      throw new Error('failed to load admin settings')
    }

    const currentAdminState = get(adminStore)
    const mergedAdminData = mergeAdminData(currentAdminState.data, cleanData)
    if (!currentAdminState.loaded || mergedAdminData !== currentAdminState.data) {
      adminStore.replaceData(mergedAdminData)
    }

    const settings = mergedAdminData.settings
    if (!settings) {
      throw new Error('failed to load admin settings')
    }

    applyConfigFromSettings(settings)
    applyPublicData({
      categories: mergedAdminData.categories,
      bookmarks: mergedAdminData.bookmarks,
      settings: toPublicSettings(settings),
    }, version)
  }

  async function persistCurrentAdminData(): Promise<void> {
    const data = get(adminStore).data
    if (isLoggedIn() && data.settings) {
      await writeCachedAdminData(data, currentDataVersion)
    }
  }

  async function refreshLoggedInData(forceRemote = false): Promise<void> {
    const cached = !forceRemote ? await readCachedAdminDataEntry() : null

    if (cached?.data.settings) {
      applyLoggedInData(cached.data, cached.version)
    }

    try {
      if (cached?.version) {
        const remoteVersion = await api.data.version(true)
        currentDataVersion = remoteVersion.version
        if (remoteVersion.version === cached.version) {
          return
        }
      }

      applyLoggedInData(await api.admin.getData())
      await persistCurrentAdminData()
    } catch (error) {
      if (cached?.data.settings && !isUnauthorizedError(error)) {
        return
      }

      throw error
    }
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

  function toBookmarkForm(bookmark: PublicBookmark): BookmarkFormValue {
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

    bookmarkError = ''
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    const fallbackCategoryId = categoryId ?? get(adminStore).data.categories[0]?.id
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
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    await ensureBookmarkEditModalComponent()
    bookmarkModalMode = 'edit'
    const refreshed =
      get(adminStore).data.bookmarks.find((item) => item.id === Number(bookmark.id)) ??
      get(publicStore).data?.bookmarks.find((item) => item.id === Number(bookmark.id)) ??
      current
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
    const confirmed = await requestConfirmation({
      title: '删除书签',
      message: '删除后该书签会从首页和后台列表中移除，此操作不可撤销。',
      itemTitle: bookmark.title,
      confirmLabel: '确认删除',
      variant: 'danger',
    })
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

  async function handleSortCategories(ids: Array<string | number>): Promise<void> {
    categoryError = ''

    const sortedIds = ids.map((id) => Number(id))
    const requestSeq = ++categorySortRequestSeq
    await applyLocalCategorySort(sortedIds, false)

    const savePromise = categorySortSavePromise
      .catch(() => undefined)
      .then(async () => {
        await api.categories.sort(sortedIds)
      })
    categorySortSavePromise = savePromise

    try {
      await savePromise
      if (requestSeq === categorySortRequestSeq) {
        await persistCurrentAdminData()
      }
    } catch (error) {
      if (requestSeq === categorySortRequestSeq) {
        categoryError = getErrorMessage(error)
        await refreshLoggedInData(true).catch(() => undefined)
      }
    }
  }

  async function handleSortBookmarks(ids: Array<string | number>): Promise<void> {
    bookmarkError = ''

    const sortedIds = ids.map((id) => Number(id))
    const requestSeq = ++bookmarkSortRequestSeq
    await applyLocalBookmarkSort(sortedIds, false)

    const savePromise = bookmarkSortSavePromise
      .catch(() => undefined)
      .then(async () => {
        await api.bookmarks.sort(sortedIds)
      })
    bookmarkSortSavePromise = savePromise

    try {
      await savePromise
      if (requestSeq === bookmarkSortRequestSeq) {
        await persistCurrentAdminData()
      }
    } catch (error) {
      if (requestSeq === bookmarkSortRequestSeq) {
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
    const flatOrdered = [...current].sort((a, b) => a.sort - b.sort || a.id - b.id)

    const newOrderQueue = orderedIdsInCategory.map((id) => Number(id))
    let queueIndex = 0
    const fullOrderedIds = flatOrdered.map((bookmark) => {
      if (bookmark.category_id === categoryId) {
        const replacement = newOrderQueue[queueIndex] ?? bookmark.id
        queueIndex += 1
        return replacement
      }
      return bookmark.id
    })

    await handleSortBookmarks(fullOrderedIds)
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
      applyLoggedInData(result.data)
      await persistCurrentAdminData()
      backupMessage = `导入成功：${result.categories} 个分类、${result.bookmarks} 个书签。`
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
  })

  onDestroy(() => {
    if (mediaQuery && handleSystemThemeChange) {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  })
</script>

{#if booting}
  <div class="app-splash" out:fade={{ duration: prefersReducedMotion ? 0 : 220 }}>
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
