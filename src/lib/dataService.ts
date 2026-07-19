// 前端数据编排层：公开/后台聚合数据的获取、版本确认、本地增量更新与浏览器快照持久化。
// 只操作 store、API、缓存与本地图标缓存，不持有任何视图状态；需要向界面反馈的错误
// 通过 configureDataService 注入的回调上报，视图切换/登录 UI 编排仍留在 App.svelte。

import { get } from 'svelte/store'
import {
  type AdminData,
  type Bookmark,
  type Category,
  type PublicData,
  type Settings,
} from '../../shared/types'
import { api, getErrorMessage, isUnauthorizedError } from './api'
import { clearCachedAdminData, readCachedAdminDataEntry, writeCachedAdminData } from './adminDataCache'
import {
  adminDataToPublicData,
  getDataVersion,
  mergeAdminData,
  mergePublicData,
  stripAdminDataVersion,
  stripPublicDataVersion,
  toPublicSettings,
} from './appData'
import {
  applySortOrder,
  applyCategorySiblingSort,
  buildPublicDataAfterCategoryDelete,
  removeById,
  removeBookmarksByCategory,
  updateBookmarkIconBlob,
  upsertBookmark,
  upsertCategory,
  upsertPublicBookmark,
  upsertPublicCategory,
} from './appLocalData'
import { clearCachedPublicData, readCachedPublicDataEntry, writeCachedPublicData } from './publicDataCache'
import { isPublicModeForbidden, siteConfigFromForbiddenError } from './publicMode'
import { createBookmarkIconCacheKey, writeBookmarkIconDataUri } from './localBookmarkIconCache'
import { adminStore, authStore, configStore, publicStore } from './stores'

type DataServiceHooks = {
  onRootError: (message: string) => void
  onLocalSnapshotRestored: () => void
  onNetworkFallback: (message: string) => void
}

let hooks: DataServiceHooks = {
  onRootError: () => undefined,
  onLocalSnapshotRestored: () => undefined,
  onNetworkFallback: () => undefined,
}

export function configureDataService(next: DataServiceHooks): void {
  hooks = next
}

// 当前已知的后端数据版本；由聚合获取与版本确认路径维护，仅本模块内部读写。
let currentDataVersion: string | null = null

export function getCurrentDataVersion(): string | null {
  return currentDataVersion
}

export function isLoggedIn(): boolean {
  return Boolean(get(authStore).session)
}

export function applyConfigFromSettings(settings: Pick<Settings, 'site_title' | 'public_mode'>): void {
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

export function applyPublicData(data: PublicData, version = getDataVersion(data), progressive = false): PublicData {
  const cleanData = stripPublicDataVersion(data)
  const currentState = get(publicStore)
  const merged = mergePublicData(currentState.data, cleanData)

  if (!currentState.loaded || merged !== currentState.data) {
    if (progressive) {
      publicStore.setDataProgressively(merged)
    } else {
      publicStore.setData(merged)
    }
  }

  applyConfigFromPublicData(merged)
  currentDataVersion = version
  return merged
}

export async function refreshPublicData(progressive = false): Promise<PublicData | null> {
  const config = get(configStore).data
  if (config?.public_mode === false && !isLoggedIn()) {
    publicStore.reset()
    return null
  }

  const cached = !isLoggedIn() ? await readCachedPublicDataEntry() : null
  if (cached?.data) {
    applyPublicData(cached.data, cached.version)
    hooks.onLocalSnapshotRestored()
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

    const data = applyPublicData(await api.public.getData(false), undefined, progressive)
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
          const data = applyPublicData(await api.public.getData(true), undefined, progressive)
          configStore.setData({
            site_title: data.settings.site_title || forbiddenConfig.site_title,
            public_mode: false,
          })
          return data
        } catch (authError) {
          if (isUnauthorizedError(authError)) {
            authStore.setSession(null)
            adminStore.reset()
            await clearCachedAdminData()
            publicStore.reset()
            configStore.setData(forbiddenConfig)
            return null
          }

          if (!isPublicModeForbidden(authError)) {
            hooks.onRootError(getErrorMessage(authError))
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
      hooks.onNetworkFallback('网络连接不稳定，当前显示的是本地缓存内容。你可以稍后刷新页面或检查网络连接。')
      return get(publicStore).data
    }

    hooks.onRootError(getErrorMessage(error))
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

async function applyLocalDataMutation(input: {
  updateAdmin: () => void
  updatePublic: (data: PublicData) => PublicData
  refreshMissing?: boolean
  persist?: boolean
}): Promise<void> {
  input.updateAdmin()

  const updated = updatePublicDataLocally(input.updatePublic)
  if (!updated && (input.refreshMissing ?? true)) await refreshListsWhenLocalDataMissing()
  if (input.persist ?? true) await persistCurrentAdminData()
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

export async function applyLocalCategoryUpsert(category: Category): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminCategoriesLocally((categories) => upsertCategory(categories, category))
    },
    updatePublic: (data) => ({ ...data, categories: upsertPublicCategory(data.categories, category) }),
  })
}

export async function applyLocalCategoryDelete(categoryId: number): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminCategoriesLocally((categories) => removeById(categories, categoryId))
      updateAdminBookmarksLocally((bookmarks) => removeBookmarksByCategory(bookmarks, categoryId))
    },
    updatePublic: (data) => ({
      ...data,
      ...buildPublicDataAfterCategoryDelete(data.categories, data.bookmarks, categoryId),
    }),
  })
}

export async function applyLocalBookmarkUpsert(bookmark: Bookmark): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminBookmarksLocally((bookmarks) => upsertBookmark(bookmarks, bookmark))
    },
    updatePublic: (data) => ({ ...data, bookmarks: upsertPublicBookmark(data.bookmarks, bookmark) }),
  })
}

export async function applyLocalBookmarkDelete(bookmarkId: number): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminBookmarksLocally((bookmarks) => removeById(bookmarks, bookmarkId))
    },
    updatePublic: (data) => ({
      ...data,
      bookmarks: removeById(data.bookmarks, bookmarkId),
    }),
  })
}

export async function applyLocalBookmarkIconBlob(bookmarkId: number, iconBlob: string | null): Promise<void> {
  updateAdminBookmarksLocally((bookmarks) => updateBookmarkIconBlob(bookmarks, bookmarkId, iconBlob))

  updatePublicDataLocally((data) => ({
    ...data,
    bookmarks: updateBookmarkIconBlob(data.bookmarks, bookmarkId, iconBlob),
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

export async function refreshBookmarkIconCache(bookmarkId: number): Promise<string | null> {
  const result = await api.bookmarks.refreshIconCache(bookmarkId)
  await applyLocalBookmarkIconBlob(bookmarkId, result.icon_blob)
  return result.icon_blob
}

export function refreshBookmarkIconCacheInBackground(bookmarkId: number): void {
  void refreshBookmarkIconCache(bookmarkId).catch(() => undefined)
}

export async function applyLocalCategorySort(
  parentId: number | null,
  ids: number[],
  refreshMissing = true,
): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminCategoriesLocally((categories) => applyCategorySiblingSort(categories, parentId, ids))
    },
    updatePublic: (data) => ({
      ...data,
      categories: applyCategorySiblingSort(data.categories, parentId, ids),
    }),
    refreshMissing,
    persist: refreshMissing,
  })
}

export async function applyLocalBookmarkSort(ids: number[], refreshMissing = true): Promise<void> {
  await applyLocalDataMutation({
    updateAdmin: () => {
      updateAdminBookmarksLocally((bookmarks) => applySortOrder(bookmarks, ids))
    },
    updatePublic: (data) => ({
      ...data,
      bookmarks: applySortOrder(data.bookmarks, ids),
    }),
    refreshMissing,
    persist: refreshMissing,
  })
}

export async function applyLocalSettings(settings: Settings): Promise<void> {
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

export function applyLoggedInData(data: AdminData, version = getDataVersion(data)): void {
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
  applyPublicData(adminDataToPublicData(mergedAdminData, settings), version)
}

export async function persistCurrentAdminData(): Promise<void> {
  const data = get(adminStore).data
  if (isLoggedIn() && data.settings) {
    await writeCachedAdminData(data, currentDataVersion)
  }
}

export async function refreshLoggedInData(forceRemote = false): Promise<void> {
  const cached = !forceRemote ? await readCachedAdminDataEntry() : null

  if (cached?.data.settings) {
    applyLoggedInData(cached.data, cached.version)
    hooks.onLocalSnapshotRestored()
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
      hooks.onNetworkFallback('网络连接不稳定，当前显示的是本地缓存内容。你可以稍后刷新页面或检查网络连接。')
      return
    }

    throw error
  }
}
