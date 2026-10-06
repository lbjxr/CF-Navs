import { objectIconLoader } from './objectIconLoader'
import type { IconDescriptor } from '../../shared/iconLocalCopy'
import { iconDevice } from './iconDeviceState'
import { getAuthToken } from './api'
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
import { ensureIconAccessKey } from './iconAccessKey'
import { adminStore, authStore, configStore, publicStore } from './stores'

type DataServiceHooks = {
  // error 透传原始异常：调用方需要按 code/status 分辨「服务端挂了」和
  // 「未登录 / 公开模式关闭」这类正常业务分支，只有消息字符串不够用。
  onRootError: (message: string, error?: unknown) => void
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

// authStore owns identity; this module owns all visible-data refreshes. A session change
// invalidates pending work synchronously, including anonymous -> login -> logout (ABA).
let activeSession = get(authStore).session
let sessionEpoch = 0
let refreshEpoch = 0
authStore.subscribe(({ session }) => {
  if (session === activeSession) return
  activeSession = session
  iconDevice.authChanged()
  sessionEpoch += 1
  refreshEpoch += 1
  currentDataVersion = null
  adminStore.reset()
  publicStore.reset()
})

type IsCurrent = () => boolean

function captureSession(): IsCurrent {
  const epoch = sessionEpoch
  return () => epoch === sessionEpoch
}

function beginRefresh(): IsCurrent {
  const sessionIsCurrent = captureSession()
  const epoch = ++refreshEpoch
  return () => sessionIsCurrent() && epoch === refreshEpoch
}

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
  iconDevice.setDataset(data.dataset_epoch)
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

export function refreshPublicData(progressive = false): Promise<PublicData | null> {
  return loadPublicData(progressive, beginRefresh())
}

async function loadPublicData(progressive: boolean, isCurrent: IsCurrent): Promise<PublicData | null> {
  const config = get(configStore).data
  if (config?.public_mode === false && !isLoggedIn()) {
    publicStore.reset()
    return null
  }

  const cached = !isLoggedIn() ? await readCachedPublicDataEntry() : null
  if (!isCurrent()) return null
  if (cached?.data) {
    applyPublicData(cached.data, cached.version)
    hooks.onLocalSnapshotRestored()
  }

  try {
    if (cached?.version) {
      const remoteVersion = await api.data.version(false)
      if (!isCurrent()) return null
      configStore.setData({
        site_title: remoteVersion.site_title,
        public_mode: remoteVersion.public_mode,
      })
      currentDataVersion = remoteVersion.version

      if (remoteVersion.version === cached.version) {
        return get(publicStore).data
      }
    }

    const response = await api.public.getData(false)
    if (!isCurrent()) return null
    const data = applyPublicData(response, undefined, progressive)
    if (!isLoggedIn()) {
      await writeCachedPublicData(data, currentDataVersion)
    }
    return data
  } catch (error) {
    if (!isCurrent()) return null
    if (isPublicModeForbidden(error)) {
      const forbiddenConfig = siteConfigFromForbiddenError(error) ?? {
        site_title: config?.site_title ?? 'CF-Navs',
        public_mode: false,
      }

      if (isLoggedIn()) {
        try {
          const response = await api.public.getData(true)
          if (!isCurrent()) return null
          const data = applyPublicData(response, undefined, progressive)
          configStore.setData({
            site_title: data.settings.site_title || forbiddenConfig.site_title,
            public_mode: false,
          })
          return data
        } catch (authError) {
          if (!isCurrent()) return null
          if (isUnauthorizedError(authError)) {
            authStore.setSession(null)
            configStore.setData(forbiddenConfig)
            await clearCachedAdminData()
            return null
          }

          if (!isPublicModeForbidden(authError)) {
            hooks.onRootError(getErrorMessage(authError), authError)
            return null
          }
        }
      }

      await clearCachedPublicData()
      if (!isCurrent()) return null
      publicStore.reset()
      configStore.setData(forbiddenConfig)
      return null
    }

    if (cached?.data) {
      hooks.onNetworkFallback('网络连接不稳定，当前显示的是本地缓存内容。你可以稍后刷新页面或检查网络连接。')
      return get(publicStore).data
    }

    hooks.onRootError(getErrorMessage(error), error)
    return null
  }
}

// Focus refresh shares the same ownership guard with its loader and error fallback.
export async function refreshVisibleData(): Promise<void> {
  const isCurrent = beginRefresh()
  if (!isLoggedIn()) {
    await loadPublicData(false, isCurrent)
    return
  }

  try {
    await loadLoggedInData(false, isCurrent)
  } catch (error) {
    if (!isCurrent()) return
    if (isUnauthorizedError(error)) {
      authStore.setSession(null)
      const fallbackIsCurrent = beginRefresh()
      await clearCachedAdminData()
      if (fallbackIsCurrent()) await loadPublicData(false, fallbackIsCurrent)
      return
    }
    hooks.onRootError(getErrorMessage(error), error)
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

  await persistCurrentAdminData()
}

export async function refreshBookmarkIconCache(bookmarkId: number): Promise<string | null> {
  const isCurrent = captureSession()
  const result = await api.bookmarks.refreshIconCache(bookmarkId)
  if (!isCurrent()) return null
  const descriptor = result.icon_descriptor
  if (descriptor) applyIconDescriptor(descriptor)
  if (result.icon_update !== 'unavailable') await applyLocalBookmarkIconBlob(bookmarkId, result.icon_blob)
  if (isCurrent() && descriptor?.state === 'ready' && result.icon_blob && iconDevice.capture()) {
    const handle = objectIconLoader.acquire(descriptor, result.icon_blob)
    try { await handle.result } finally { handle.release() }
  }
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
  iconDevice.setDataset(data.dataset_epoch)
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

export async function persistCurrentAdminData(isCurrent: IsCurrent = captureSession()): Promise<void> {
  const data = get(adminStore).data
  if (isCurrent() && isLoggedIn() && data.settings) {
    await writeCachedAdminData(data, currentDataVersion, isCurrent)
  }
}

/** Read editable source fields without publishing full image bodies into the view
 * stores. Snapshot projections are display data, never a safe PUT baseline. */
export async function readAdminDataForEdit(): Promise<AdminData | null> {
  if (!isLoggedIn()) return null
  const isCurrent = captureSession()
  try {
    const data = await api.admin.getData({ keepSessionOnUnauthorized: true })
    return isCurrent() ? data : null
  } catch (error) {
    if (!isCurrent()) return null
    throw error
  }
}

export function refreshLoggedInData(forceRemote = false): Promise<void> {
  return loadLoggedInData(forceRemote, beginRefresh())
}

async function loadLoggedInData(forceRemote: boolean, isCurrent: IsCurrent): Promise<void> {
  if (!isCurrent() || !isLoggedIn()) return
  const requestToken = getAuthToken()
  // 后台预览私密对象图标需要短期授权 key。失败只降级成兜底图标，不影响数据刷新。
  void ensureIconAccessKey(() => api.auth.iconAccess())
  const cached = !forceRemote ? await readCachedAdminDataEntry(isCurrent) : null
  if (!isCurrent()) return

  if (cached?.data.settings) {
    applyLoggedInData(cached.data, cached.version)
    hooks.onLocalSnapshotRestored()
  }

  try {
    if (cached?.version) {
      const remoteVersion = await api.data.version(true)
      if (!isCurrent()) return
      await iconDevice.acceptMetadata(remoteVersion, requestToken, isCurrent)
      if (!isCurrent()) return
      currentDataVersion = remoteVersion.version
      if (remoteVersion.version === cached.version && remoteVersion.dataset_epoch === cached.data.dataset_epoch) {
        return
      }
    }

    // This layer checks refresh ownership before acting on a 401.
    const data = await api.admin.getData({ keepSessionOnUnauthorized: true })
    if (!isCurrent()) return
    applyLoggedInData(data)
    await iconDevice.acceptMetadata(data, requestToken, isCurrent)
    if (!isCurrent()) return
    await persistCurrentAdminData(isCurrent)
  } catch (error) {
    if (!isCurrent()) return
    if (cached?.data.settings && !isUnauthorizedError(error)) {
      hooks.onNetworkFallback('网络连接不稳定，当前显示的是本地缓存内容。你可以稍后刷新页面或检查网络连接。')
      return
    }

    throw error
  }
}

let iconSnapshotTimer: ReturnType<typeof setTimeout> | null = null
function scheduleIconSnapshot(): void {
  if (iconSnapshotTimer) return
  const valid = captureSession()
  iconSnapshotTimer = setTimeout(() => { iconSnapshotTimer = null; void persistCurrentAdminData(valid).catch(error => hooks.onRootError(getErrorMessage(error), error)) }, 250)
}
function applyIconDescriptor(next: IconDescriptor, expected?: IconDescriptor): void {
  if (get(adminStore).data.dataset_epoch !== next.dataset_epoch) return
  if (next.object_type === 'category') {
    const patch = <T extends Omit<Category, 'created_at'>>(rows: T[]): T[] => rows.map(row => {
      if (row.id !== next.object_id || (row.icon_write_epoch ?? 0) > next.write_epoch || expected && (row.icon_write_epoch ?? 0) !== expected.write_epoch && row.icon_revision !== next.content_revision) return row
      const display = next.state === 'ready' || next.state === 'unknown' ? 'image' : next.state
      if (row.icon_revision === next.content_revision && row.icon_write_epoch === next.write_epoch && row.icon_display === display) return row
      return { ...row, icon_revision: next.content_revision, icon_write_epoch: next.write_epoch, icon_display: display, icon_cached: display === 'image',
        ...(display === 'empty' ? { icon: null, icon_blob: null, icon_cached: false } : {}) }
    })
    const admin = get(adminStore).data
    const categories = patch(admin.categories)
    if (categories.some((row, index) => row !== admin.categories[index])) {
      adminStore.setCategories(categories)
      const visible = get(publicStore).data
      if (visible) publicStore.setData({ ...visible, categories: patch(visible.categories) })
      scheduleIconSnapshot()
    }
    return
  }
  const patch = <T extends Bookmark>(rows: T[]): T[] => rows.map(row => {
    if (row.id !== next.object_id || (row.icon_write_epoch ?? 0) > next.write_epoch || expected && (row.icon_write_epoch ?? 0) !== expected.write_epoch && row.icon_revision !== next.content_revision) return row
    const display = next.state === 'ready' || next.state === 'unknown' ? 'image' : next.state
    if (row.icon_revision === next.content_revision && row.icon_write_epoch === next.write_epoch && row.icon_display === display) return row
    return { ...row, icon_revision: next.content_revision, icon_write_epoch: next.write_epoch, icon_display: display, icon_cached: display === 'image',
      ...(display === 'empty' ? { icon: null, icon_blob: null, icon_cached: false } : {}) }
  })
  const before = get(adminStore).data.bookmarks
  const after = patch(before)
  if (after.every((row, index) => row === before[index])) return
  adminStore.setBookmarks(after)
  const visible = get(publicStore).data
  if (visible) publicStore.setData({ ...visible, bookmarks: patch(visible.bookmarks as Bookmark[]) })
  scheduleIconSnapshot()
}
objectIconLoader.configure((next, expected) => applyIconDescriptor(next, expected))
