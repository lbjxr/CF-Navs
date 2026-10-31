import type { IconDescriptor } from '../../shared/iconDescriptor'
import { iconEpochToken, iconLocalStore, iconObjectKey } from './iconLocalStore'
import { applyIconDisplayOverride, bookmarkIconDisplay } from './iconDisplayStore'
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
// 本会话最近一次写接口回报的 data_version（见 recordMutationDataVersion），
// 以及是否有一次整包重拉尚未成功完成（被新的刷新取代或失败）。
let lastMutationVersion: string | null = null
let fullRefreshPending = false

// authStore owns identity; this module owns all visible-data refreshes. A session change
// invalidates pending work synchronously, including anonymous -> login -> logout (ABA).
let activeSession = get(authStore).session
let sessionEpoch = 0
let refreshEpoch = 0
authStore.subscribe(({ session }) => {
  if (session === activeSession) return
  const loggedOut = Boolean(activeSession) && !session
  activeSession = session
  // 登出 / 会话过期：只删除本机私密图标条目，公开图标继续复用。
  if (loggedOut) void iconLocalStore().clearPrivate()
  sessionEpoch += 1
  refreshEpoch += 1
  currentDataVersion = null
  lastMutationVersion = null
  fullRefreshPending = false
  adminStore.reset()
  publicStore.reset()
  bookmarkIconDisplay.clear()
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

type IconEpochSource = { dataset_epoch?: string; icon_epoch?: number }
type IconObjects = { bookmarks: Array<{ id: number }>; categories: Array<{ id: number }> }

/**
 * 服务端图标标志位与本机记录不同时，按当前可见数据清理已不存在 / 不再可见的本地图标条目。
 * 版本变化的图标在显示时按 URL 版本比对重新下载，这里不逐个下载。
 */
function reconcileLocalIcons(metadata: IconEpochSource, data: IconObjects | null | undefined): void {
  if (!data) return
  const token = iconEpochToken(metadata, isLoggedIn() ? 'admin' : 'anonymous')
  if (!token) return
  const store = iconLocalStore()
  if (store.epoch() === token) return
  const live = new Set<string>()
  for (const row of data.bookmarks) live.add(iconObjectKey('bookmark', row.id))
  for (const row of data.categories) live.add(iconObjectKey('category', row.id))
  void store.reconcile(token, live).catch((error) => console.warn('[CF-Navs] icon reconcile failed', error))
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
    // A restored snapshot is already visible. Replaying the first 60-item batch
    // would tear down its later categories/icons, then recreate identical requests.
    // Replacement still removes revoked/deleted data immediately; only cold loads batch.
    if (progressive && !currentState.loaded) {
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
    let confirmedVersion: string | null = null
    if (cached?.version) {
      const remoteVersion = await api.data.version(false)
      if (!isCurrent()) return null
      configStore.setData({
        site_title: remoteVersion.site_title,
        public_mode: remoteVersion.public_mode,
      })
      currentDataVersion = remoteVersion.version
      confirmedVersion = remoteVersion.version

      if (remoteVersion.version === cached.version) {
        reconcileLocalIcons(remoteVersion, get(publicStore).data)
        return get(publicStore).data
      }
    }

    // 已确认远端版本时按版本请求，命中该版本的 edge cache；冷启动没有快照时不为此额外请求版本。
    const response = await api.public.getData(false, confirmedVersion)
    if (!isCurrent()) return null
    const data = applyPublicData(response, undefined, progressive)
    reconcileLocalIcons(response, data)
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

// 书签点击计数：本地乐观 +1，并把乐观值写回「当前版本」的本地快照，再异步登记到服务端。
// 点击刻意不提升 data_version（避免公开聚合缓存整体失效，见 #31 第 3 点），因此仅靠内存乐观值
// 不够：刷新 / 焦点恢复会先用旧快照覆盖内存，再因版本未变而短路、不重拉服务端新值，表现为
// 「刷新多次都不更新，直到进后台强制重拉」。把乐观值持久化进同版本快照即可让本设备刷新保持一致。
export function recordBookmarkClick(bookmarkId: number): void {
  publicStore.incrementClick(bookmarkId)
  if (isLoggedIn()) {
    // 登录态首页数据由后台快照派生，必须同步后台 store 并持久化，否则刷新会被旧后台快照覆盖。
    adminStore.incrementClick(bookmarkId)
    void persistCurrentAdminData()
  } else {
    const data = get(publicStore).data
    if (data) void writeCachedPublicData(data, currentDataVersion)
  }
  // 计数是 fire-and-forget：失败（限流、网络异常）必须静默吞掉，
  // 否则会冒泡成 unhandledrejection，被错误监控误报为前端异常（PR #26 问题 2）。
  void api.public.registerClick(bookmarkId).catch(() => undefined)
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
  return result.icon_blob
}

export function refreshBookmarkIconCacheInBackground(bookmarkId: number): void {
  // 保存书签后的后台补图是尽力而为：失败不打断用户操作，下次加载 / 显式刷新会重试。
  void refreshBookmarkIconCache(bookmarkId).catch((error) => {
    console.warn('[CF-Navs] background bookmark icon refresh failed', bookmarkId, error)
  })
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
  pruneBookmarkIconDisplay(mergedAdminData.dataset_epoch, mergedAdminData.bookmarks)

  const settings = mergedAdminData.settings
  if (!settings) {
    throw new Error('failed to load admin settings')
  }

  applyConfigFromSettings(settings)
  applyPublicData(adminDataToPublicData(mergedAdminData, settings), version)
}

export async function persistCurrentAdminData(isCurrent: IsCurrent = captureSession()): Promise<void> {
  const stored = get(adminStore).data
  // 快照里带上图标显示覆盖，下次启动直接拿到已验证的图标身份。
  const bookmarks = bookmarkIconDisplay.applyTo(stored.bookmarks)
  const data = bookmarks === stored.bookmarks ? stored : { ...stored, bookmarks }
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

/** 由请求层在每个写响应带回 data_version 时调用（接线见 appServices）。会话切换时清空。 */
export function recordMutationDataVersion(version: string): void {
  lastMutationVersion = version
}

/**
 * 写入成功且结果已用服务端返回值应用到本地之后调用，替代无条件的整包重拉：
 * 只请求一次 `/data/version`，若服务端版本正是本会话最后一次写入回报的版本、
 * 数据集也没换，说明期间没有别的写入，本地状态即为最新，只更新版本号并落快照；
 * 否则（别的标签页 / 设备写过、没有版本信息、有未完成的整包重拉）退回整包重拉。
 */
export function confirmLoggedInDataAfterLocalMutation(): Promise<void> {
  return confirmAfterLocalMutation(beginRefresh())
}

async function confirmAfterLocalMutation(isCurrent: IsCurrent): Promise<void> {
  if (!isCurrent() || !isLoggedIn()) return
  const expected = lastMutationVersion
  if (!expected || fullRefreshPending) return loadLoggedInData(true, isCurrent)
  const remote = await api.data.version(true)
  if (!isCurrent()) return
  if (remote.version !== expected || remote.dataset_epoch !== get(adminStore).data.dataset_epoch) {
    return loadLoggedInData(true, isCurrent)
  }
  reconcileLocalIcons(remote, get(adminStore).data)
  currentDataVersion = remote.version
  await persistCurrentAdminData(isCurrent)
}

async function loadLoggedInData(forceRemote: boolean, isCurrent: IsCurrent): Promise<void> {
  if (!isCurrent() || !isLoggedIn()) return
  if (forceRemote) fullRefreshPending = true
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
      currentDataVersion = remoteVersion.version
      if (remoteVersion.version === cached.version && remoteVersion.dataset_epoch === cached.data.dataset_epoch) {
        reconcileLocalIcons(remoteVersion, get(adminStore).data)
        return
      }
    }

    // This layer checks refresh ownership before acting on a 401.
    const data = await api.admin.getData({ keepSessionOnUnauthorized: true })
    if (!isCurrent()) return
    applyLoggedInData(data)
    fullRefreshPending = false
    reconcileLocalIcons(data, data)
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
// 由 refreshBookmarkIconCache 用服务端返回的图标描述符更新显示状态（也供测试）。
export function applyIconDescriptor(next: IconDescriptor, expected?: IconDescriptor): void {
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
  // 书签：只写独立的图标显示表，不重建 bookmarks 数组（见 iconDisplayStore.ts）。
  const row = bookmarkRowIndex(get(adminStore).data.bookmarks).get(next.object_id)
  if (!row) return
  const current = applyIconDisplayOverride(row, bookmarkIconDisplay.get(row.id))
  if ((current.icon_write_epoch ?? 0) > next.write_epoch || expected && (current.icon_write_epoch ?? 0) !== expected.write_epoch && current.icon_revision !== next.content_revision) return
  const display = next.state === 'ready' || next.state === 'unknown' ? 'image' : next.state
  if (current.icon_revision === next.content_revision && current.icon_write_epoch === next.write_epoch && current.icon_display === display) return
  bookmarkIconDisplay.set(row.id, { dataset_epoch: next.dataset_epoch, icon_revision: next.content_revision, icon_write_epoch: next.write_epoch, icon_display: display })
  scheduleIconSnapshot()
}

// 按数组身份缓存 id 索引：图标描述符逐个到达时不必每次线性查找。
let bookmarkRowIndexSource: Bookmark[] | null = null
let bookmarkRowIndexMemo = new Map<number, Bookmark>()
function bookmarkRowIndex(rows: Bookmark[]): Map<number, Bookmark> {
  if (rows !== bookmarkRowIndexSource) {
    bookmarkRowIndexSource = rows
    bookmarkRowIndexMemo = new Map(rows.map(row => [row.id, row]))
  }
  return bookmarkRowIndexMemo
}

// 结构数据替换后，丢弃不再适用的图标显示覆盖：换数据集、书签已删除、服务端已有更新的写入。
function pruneBookmarkIconDisplay(datasetEpoch: string | undefined, bookmarks: Bookmark[]): void {
  if (bookmarkIconDisplay.size === 0) return
  const index = bookmarkRowIndex(bookmarks)
  bookmarkIconDisplay.prune((id, value) => {
    const row = index.get(id)
    return value.dataset_epoch === datasetEpoch && Boolean(row) && (row!.icon_write_epoch ?? 0) <= value.icon_write_epoch
  })
}
