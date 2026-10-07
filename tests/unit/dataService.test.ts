import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type {
  AdminData,
  Bookmark,
  Category,
  LoginResp,
  PublicData,
  Settings,
} from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import { ApiError } from '../../src/lib/api'
import { ErrCode } from '../../shared/types'

// api 与三个持久化缓存是纯 IO 边界，全部 mock；stores 使用真实内存实现，
// 以便真实验证编排逻辑对 store 的写入与版本确认分支。
// vi.mock 工厂会被提升到文件顶部，故 mock 对象也用 vi.hoisted 一并提升，
// 避免工厂引用尚未初始化的顶层变量。
const { api, publicCache, adminCache, dataHooks } = vi.hoisted(() => ({
  api: {
    data: { version: vi.fn() },
    public: { getData: vi.fn() },
    admin: { getData: vi.fn() },
    bookmarks: { refreshIconCache: vi.fn() },
  },
  publicCache: {
    readCachedPublicDataEntry: vi.fn(),
    writeCachedPublicData: vi.fn(),
    clearCachedPublicData: vi.fn(),
  },
  adminCache: {
    readCachedAdminDataEntry: vi.fn(),
    writeCachedAdminData: vi.fn(),
    clearCachedAdminData: vi.fn(),
  },
  dataHooks: {
    onRootError: vi.fn(),
    onLocalSnapshotRestored: vi.fn(),
    onNetworkFallback: vi.fn(),
  },
}))

// stores.ts 也从 api.ts 导入 getStoredAuthSession，用 importOriginal 保留真实导出，只覆盖 api。
vi.mock('../../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/api')>()
  return {
    ...actual,
    api,
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    isUnauthorizedError: (error: unknown) =>
      error instanceof Error && (error as { status?: number }).status === 401,
  }
})

vi.mock('../../src/lib/publicDataCache', () => publicCache)
vi.mock('../../src/lib/adminDataCache', () => adminCache)

vi.mock('../../src/lib/localBookmarkIconCache', () => ({
  createBookmarkIconCacheKey: () => 'key',
  writeBookmarkIconDataUri: vi.fn(),
}))

import {
  applyLocalBookmarkDelete,
  applyLocalBookmarkSort,
  applyLocalBookmarkUpsert,
  applyLocalCategoryDelete,
  applyLocalCategorySort,
  applyLocalCategoryUpsert,
  applyPublicData,
  applyLoggedInData,
  configureDataService,
  getCurrentDataVersion,
  isLoggedIn,
  refreshLoggedInData,
  readAdminDataForEdit,
  refreshPublicData,
  refreshVisibleData,
} from '../../src/lib/dataService'
import { adminStore, authStore, configStore, publicStore } from '../../src/lib/stores'

const settings: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
  custom_accent_color: '',
  custom_dark_accent_color: '',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'color', value: '#f8fafc', blur: 0, mask: 0.18, maskColor: '#ffffff' },
    dark: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  },
  custom_css: '',
  custom_js: '',
  image_host_url: '',
  search_engine: {
    current: 'Google',
    engines: [{ name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' }],
  },
  card_size: { width: 80, height: 60 },
  card_style: 'info',
  card_icon_size: 60,
  category_display: { root_font_size: 16, root_icon_size: 20, child_font_size: 14, child_icon_size: 18 },
  card_show_description: true,
  card_description_mode: 'always',
  card_background_color: '#ffffff',
  card_background_opacity: 0.9,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'left', always_expanded: false, top_layout: 'scroll' },
  footer_html: '',
}

const category: Category = { id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0, created_at: 100 }

const bookmark: Bookmark = {
  id: 10,
  category_id: 1,
  title: 'GitHub',
  url: 'https://github.com',
  icon: null,
  icon_source: 'direct',
  icon_background_color: null,
  icon_blob: null,
  icon_cached: 0,
  description: null,
  open_method: 1,
  sort: 0,
  created_at: 200,
}

function makePublicData(version?: string): PublicData {
  return {
    categories: [{ id: category.id, title: category.title, icon: category.icon, sort: category.sort }],
    bookmarks: [],
    settings: toPublicSettings(settings),
    ...(version ? { version } : {}),
  }
}

function makePublicBookmark(item: Bookmark): PublicData['bookmarks'][number] {
  return {
    id: item.id,
    category_id: item.category_id,
    title: item.title,
    url: item.url,
    icon: item.icon,
    icon_source: item.icon_source,
    icon_background_color: item.icon_background_color,
    icon_blob: item.icon_blob,
    icon_cached: item.icon_cached,
    description: item.description,
    open_method: item.open_method,
    sort: item.sort,
  }
}

function makeAdminData(version?: string): AdminData {
  return {
    categories: [category],
    bookmarks: [bookmark],
    settings,
    ...(version ? { version } : {}),
  }
}

const session: LoginResp = { token: 'tok', expires_at: Date.now() + 100000, username: 'admin' }

const onRootError = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  configureDataService({
    onRootError,
    onLocalSnapshotRestored: dataHooks.onLocalSnapshotRestored,
    onNetworkFallback: dataHooks.onNetworkFallback,
  })
  // reset all stores to a clean logged-out state
  authStore.setSession(null)
  adminStore.reset()
  publicStore.reset()
  configStore.reset()
})

describe('dataService.applyPublicData', () => {
  it('writes merged public data into the store and derives site config', () => {
    const result = applyPublicData(makePublicData('v1'))

    expect(get(publicStore).data?.categories).toHaveLength(1)
    expect(get(configStore).data).toMatchObject({ site_title: 'CF-Navs', public_mode: true })
    expect(getCurrentDataVersion()).toBe('v1')
    expect(result.categories).toHaveLength(1)
  })
})

describe('dataService.refreshPublicData', () => {
  it('short-circuits on matching cached version without fetching full data', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValue({ data: makePublicData(), version: 'v1' })
    api.data.version.mockResolvedValue({ version: 'v1', site_title: 'CF-Navs', public_mode: true })

    await refreshPublicData()

    expect(api.data.version).toHaveBeenCalledOnce()
    expect(api.public.getData).not.toHaveBeenCalled()
    expect(getCurrentDataVersion()).toBe('v1')
    expect(dataHooks.onLocalSnapshotRestored).toHaveBeenCalledOnce()
  })

  it('keeps cached public data visible and reports a recoverable network fallback', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValue({ data: makePublicData(), version: 'v1' })
    api.data.version.mockRejectedValue(new Error('network timeout'))

    const result = await refreshPublicData()

    expect(result?.categories).toHaveLength(1)
    expect(dataHooks.onLocalSnapshotRestored).toHaveBeenCalledOnce()
    expect(dataHooks.onNetworkFallback).toHaveBeenCalledOnce()
    expect(onRootError).not.toHaveBeenCalled()
  })

  it('fetches and caches full data when cached version is stale', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValue({ data: makePublicData(), version: 'old' })
    api.data.version.mockResolvedValue({ version: 'new', site_title: 'CF-Navs', public_mode: true })
    api.public.getData.mockResolvedValue(makePublicData('new'))

    await refreshPublicData()

    expect(api.public.getData).toHaveBeenCalledWith(false)
    expect(publicCache.writeCachedPublicData).toHaveBeenCalledOnce()
    expect(getCurrentDataVersion()).toBe('new')
  })

  it('clears admin snapshot when private-mode authenticated public fetch returns unauthorized', async () => {
    authStore.setSession(session)
    adminStore.replaceData(makeAdminData())
    const forbidden = new ApiError('private mode', {
      code: ErrCode.FORBIDDEN,
      data: { site_title: 'Private CF-Navs', public_mode: false },
    })
    const unauthorized = new ApiError('unauthorized', { status: 401, code: ErrCode.UNAUTHORIZED })
    api.public.getData
      .mockRejectedValueOnce(forbidden)
      .mockRejectedValueOnce(unauthorized)

    const result = await refreshPublicData()

    expect(result).toBeNull()
    expect(adminCache.clearCachedAdminData).toHaveBeenCalledOnce()
    expect(get(authStore).session).toBeNull()
    expect(get(adminStore).data.settings).toBeNull()
    expect(get(configStore).data).toEqual({ site_title: 'Private CF-Navs', public_mode: false })
  })

  it('resets public store without fetching when private mode and logged out', async () => {
    configStore.setData({ site_title: 'CF-Navs', public_mode: false })

    const result = await refreshPublicData()

    expect(result).toBeNull()
    expect(api.public.getData).not.toHaveBeenCalled()
    expect(get(publicStore).data).toBeNull()
  })
})

describe('dataService.refreshLoggedInData', () => {
  beforeEach(() => {
    authStore.setSession(session)
  })

  it('short-circuits on matching admin version', async () => {
    adminCache.readCachedAdminDataEntry.mockResolvedValue({ data: makeAdminData(), version: 'v1' })
    api.data.version.mockResolvedValue({ version: 'v1', site_title: 'CF-Navs', public_mode: true })

    await refreshLoggedInData()

    expect(api.admin.getData).not.toHaveBeenCalled()
    expect(get(adminStore).data.settings).toBeTruthy()
    expect(dataHooks.onLocalSnapshotRestored).toHaveBeenCalledOnce()
  })

  it('keeps cached admin data visible and reports a recoverable network fallback', async () => {
    adminCache.readCachedAdminDataEntry.mockResolvedValue({ data: makeAdminData(), version: 'v1' })
    api.data.version.mockRejectedValue(new Error('network timeout'))

    await refreshLoggedInData()

    expect(get(adminStore).data.settings).toBeTruthy()
    expect(dataHooks.onLocalSnapshotRestored).toHaveBeenCalledOnce()
    expect(dataHooks.onNetworkFallback).toHaveBeenCalledOnce()
  })

  it('fetches admin data and persists snapshot when version changed', async () => {
    adminCache.readCachedAdminDataEntry.mockResolvedValue({ data: makeAdminData(), version: 'old' })
    api.data.version.mockResolvedValue({ version: 'new', site_title: 'CF-Navs', public_mode: true })
    api.admin.getData.mockResolvedValue(makeAdminData('new'))

    await refreshLoggedInData()

    expect(api.admin.getData).toHaveBeenCalledOnce()
    expect(adminCache.writeCachedAdminData).toHaveBeenCalled()
  })

  it('forces remote fetch and skips cache read when forceRemote is true', async () => {
    api.admin.getData.mockResolvedValue(makeAdminData('fresh'))

    await refreshLoggedInData(true)

    expect(adminCache.readCachedAdminDataEntry).not.toHaveBeenCalled()
    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.admin.getData).toHaveBeenCalledOnce()
  })
})

describe('dataService local mutations', () => {
  beforeEach(() => {
    authStore.setSession(session)
    adminStore.replaceData(makeAdminData())
    publicStore.setData(makePublicData())
  })

  it('upserts a bookmark into both admin and public stores and persists', async () => {
    const next: Bookmark = { ...bookmark, id: 11, title: 'Docs' }

    await applyLocalBookmarkUpsert(next)

    expect(get(adminStore).data.bookmarks.map((b) => b.id)).toContain(11)
    expect(get(publicStore).data?.bookmarks.map((b) => b.id)).toContain(11)
    expect(adminCache.writeCachedAdminData).toHaveBeenCalled()
  })

  it('upserts a public category without leaking admin-only fields', async () => {
    const nextCategory: Category = { ...category, id: 2, title: 'Private admin category field', created_at: 999 }

    await applyLocalCategoryUpsert(nextCategory)

    const publicCategory = get(publicStore).data?.categories.find((item) => item.id === nextCategory.id)
    expect(publicCategory).toEqual({
      id: nextCategory.id,
      parent_id: nextCategory.parent_id,
      title: nextCategory.title,
      icon: nextCategory.icon,
      sort: nextCategory.sort,
    })
    expect(publicCategory).not.toHaveProperty('created_at')
    expect(get(adminStore).data.categories.find((item) => item.id === nextCategory.id)).toHaveProperty('created_at', 999)
  })

  it('removes a category and its bookmarks from both stores', async () => {
    await applyLocalCategoryDelete(category.id)

    expect(get(adminStore).data.categories).toHaveLength(0)
    expect(get(adminStore).data.bookmarks).toHaveLength(0)
    expect(get(publicStore).data?.categories).toHaveLength(0)
  })

  it('removes a bookmark from both stores and persists', async () => {
    publicStore.setData({ ...makePublicData(), bookmarks: [makePublicBookmark(bookmark)] })

    await applyLocalBookmarkDelete(bookmark.id)

    expect(get(adminStore).data.bookmarks).toHaveLength(0)
    expect(get(publicStore).data?.bookmarks).toHaveLength(0)
    expect(adminCache.writeCachedAdminData).toHaveBeenCalled()
  })

  it('sorts local categories and bookmarks without persisting during queued saves', async () => {
    const nextCategory: Category = { ...category, id: 2, title: 'Docs', sort: 1 }
    const nextBookmark: Bookmark = { ...bookmark, id: 11, title: 'Docs', sort: 1 }

    adminStore.replaceData({
      ...makeAdminData(),
      categories: [category, nextCategory],
      bookmarks: [bookmark, nextBookmark],
    })
    publicStore.setData({
      ...makePublicData(),
      categories: [
        { id: category.id, parent_id: category.parent_id, title: category.title, icon: category.icon, sort: category.sort },
        { id: nextCategory.id, parent_id: nextCategory.parent_id, title: nextCategory.title, icon: nextCategory.icon, sort: nextCategory.sort },
      ],
      bookmarks: [makePublicBookmark(bookmark), makePublicBookmark(nextBookmark)],
    })

    await applyLocalCategorySort(null, [nextCategory.id, category.id], false)
    await applyLocalBookmarkSort([nextBookmark.id, bookmark.id], false)

    expect(get(adminStore).data.categories.map((item) => [item.id, item.sort])).toEqual([[1, 1], [2, 0]])
    expect(get(publicStore).data?.categories.map((item) => [item.id, item.sort])).toEqual([[1, 1], [2, 0]])
    expect(get(adminStore).data.bookmarks.map((item) => [item.id, item.sort])).toEqual([[11, 0], [10, 1]])
    expect(get(publicStore).data?.bookmarks.map((item) => [item.id, item.sort])).toEqual([[11, 0], [10, 1]])
    expect(adminCache.writeCachedAdminData).not.toHaveBeenCalled()
  })
})

describe('dataService.isLoggedIn', () => {
  it('reflects the auth store session state', () => {
    expect(isLoggedIn()).toBe(false)
    authStore.setSession(session)
    expect(isLoggedIn()).toBe(true)
  })
})

describe('dataService.refreshVisibleData', () => {
  it('refreshes logged-in data when a session exists, keeping a private bookmark in the public store', async () => {
    const privateBookmark: Bookmark = { ...bookmark, id: 12, title: 'Secret', is_private: 1 }
    authStore.setSession(session)
    api.data.version.mockResolvedValue({ version: 'v2', site_title: 'CF-Navs', public_mode: true })
    api.admin.getData.mockResolvedValue({ ...makeAdminData('v2'), bookmarks: [bookmark, privateBookmark] })

    await refreshVisibleData()

    expect(api.public.getData).not.toHaveBeenCalled()
    expect(api.admin.getData).toHaveBeenCalledOnce()
    expect(get(publicStore).data?.bookmarks.map((item) => item.id)).toEqual([10, 12])
  })

  it('falls back to the public refresh when logged out', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValue(undefined)
    api.data.version.mockResolvedValue({ version: 'v1', site_title: 'CF-Navs', public_mode: true })
    api.public.getData.mockResolvedValue(makePublicData('v1'))

    await refreshVisibleData()

    expect(api.public.getData).toHaveBeenCalledWith(false)
    expect(api.admin.getData).not.toHaveBeenCalled()
  })

  it('clears the expired session, private stores and refreshes public data when the logged-in refresh is unauthorized', async () => {
    authStore.setSession(session)
    adminStore.replaceData(makeAdminData())
    publicStore.setData({ ...makePublicData(), bookmarks: [makePublicBookmark({ ...bookmark, is_private: 1 })] })
    configStore.setData({ site_title: 'CF-Navs', public_mode: true })
    publicCache.readCachedPublicDataEntry.mockResolvedValue(undefined)
    api.admin.getData.mockRejectedValue(new ApiError('unauthorized', { status: 401, code: ErrCode.UNAUTHORIZED }))
    api.public.getData.mockResolvedValue(makePublicData('v1'))

    await refreshVisibleData()

    expect(get(authStore).session).toBeNull()
    expect(get(adminStore).data.settings).toBeNull()
    expect(adminCache.clearCachedAdminData).toHaveBeenCalledOnce()
    expect(api.public.getData).toHaveBeenCalledWith(false)
  })

  it('drops the private home data before an unauthorized public fallback that itself fails', async () => {
    authStore.setSession(session)
    adminStore.replaceData(makeAdminData())
    publicStore.setData({ ...makePublicData(), bookmarks: [makePublicBookmark({ ...bookmark, is_private: 1 })] })
    configStore.setData({ site_title: 'CF-Navs', public_mode: true })
    adminCache.readCachedAdminDataEntry.mockResolvedValue(undefined)
    publicCache.readCachedPublicDataEntry.mockResolvedValue(undefined)
    api.admin.getData.mockRejectedValue(new ApiError('unauthorized', { status: 401, code: ErrCode.UNAUTHORIZED }))
    api.public.getData.mockRejectedValue(new ApiError('backend down', { status: 500, code: ErrCode.SERVER_ERROR }))

    await refreshVisibleData()

    expect(get(authStore).session).toBeNull()
    expect(get(publicStore).data).toBeNull()
  })

  it('reports non-auth failures instead of swallowing them', async () => {
    authStore.setSession(session)
    adminCache.readCachedAdminDataEntry.mockResolvedValue(undefined)
    api.admin.getData.mockRejectedValue(new ApiError('backend down', { status: 500, code: ErrCode.SERVER_ERROR }))

    await expect(refreshVisibleData()).resolves.toBeUndefined()
    expect(api.public.getData).not.toHaveBeenCalled()
    expect(onRootError).toHaveBeenCalledOnce()
    expect(onRootError.mock.calls[0][0]).toContain('backend down')
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('dataService refresh ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    adminCache.readCachedAdminDataEntry.mockResolvedValue(null)
    publicCache.readCachedPublicDataEntry.mockResolvedValue(null)
    api.public.getData.mockResolvedValue(makePublicData('public'))
    api.admin.getData.mockResolvedValue(makeAdminData('admin'))
  })

  it('discards an authenticated response delivered after logout', async () => {
    authStore.setSession(session)
    const old = deferred<AdminData>()
    api.admin.getData.mockReturnValueOnce(old.promise)
    const refresh = refreshVisibleData()
    await vi.waitFor(() => expect(api.admin.getData).toHaveBeenCalledOnce())
    authStore.setSession(null)
    await refreshVisibleData()
    old.resolve(makeAdminData('old'))
    await refresh
    expect(get(publicStore).data?.bookmarks).toEqual([])
    expect(get(adminStore).data.settings).toBeNull()
    expect(getCurrentDataVersion()).toBe('public')
    expect(adminCache.writeCachedAdminData).not.toHaveBeenCalled()
  })

  it('discards an anonymous response delivered after login', async () => {
    const old = deferred<PublicData>()
    api.public.getData.mockReturnValueOnce(old.promise)
    const refresh = refreshVisibleData()
    await vi.waitFor(() => expect(api.public.getData).toHaveBeenCalledOnce())
    authStore.setSession(session)
    await refreshVisibleData()
    old.resolve(makePublicData('old'))
    await refresh
    expect(get(publicStore).data?.bookmarks).toHaveLength(1)
    expect(getCurrentDataVersion()).toBe('admin')
    expect(publicCache.writeCachedPublicData).not.toHaveBeenCalled()
  })

  it.each(['401', 'network'])('ignores an old %s error after a replacement login', async (kind) => {
    authStore.setSession(session)
    const old = deferred<AdminData>()
    api.admin.getData.mockReturnValueOnce(old.promise)
    const refresh = refreshVisibleData()
    await vi.waitFor(() => expect(api.admin.getData).toHaveBeenCalledOnce())
    const replacement = { ...session, token: 'replacement-session' }
    authStore.setSession(replacement)
    await refreshVisibleData()
    old.reject(kind === '401' ? new ApiError('expired', { status: 401, code: ErrCode.UNAUTHORIZED }) : new Error('offline'))
    await refresh
    expect(get(authStore).session).toEqual(replacement)
    expect(get(publicStore).data?.bookmarks).toHaveLength(1)
    expect(adminCache.clearCachedAdminData).not.toHaveBeenCalled()
    expect(onRootError).not.toHaveBeenCalled()
  })

  it.each(['public', 'admin'])('discards a delayed %s snapshot after a session change', async (kind) => {
    if (kind === 'admin') authStore.setSession(session)
    const old = deferred<unknown>()
    const cache = kind === 'admin' ? adminCache.readCachedAdminDataEntry : publicCache.readCachedPublicDataEntry
    cache.mockReturnValueOnce(old.promise)
    const refresh = refreshVisibleData()
    authStore.setSession(kind === 'admin' ? null : session)
    if (kind === 'public') applyLoggedInData(makeAdminData('new'))
    else applyPublicData(makePublicData('new'))
    old.resolve({ data: kind === 'admin' ? makeAdminData() : makePublicData(), version: 'old' })
    await refresh
    expect(getCurrentDataVersion()).toBe('new')
    expect(get(publicStore).data?.bookmarks).toHaveLength(kind === 'admin' ? 0 : 1)
    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.admin.getData).not.toHaveBeenCalled()
    expect(api.public.getData).not.toHaveBeenCalled()
  })

  it('does not let an old version response change the current configuration', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValueOnce({ data: makePublicData(), version: 'old' })
    const old = deferred<{ version: string; site_title: string; public_mode: boolean }>()
    api.data.version.mockReturnValueOnce(old.promise)
    const refresh = refreshVisibleData()
    await vi.waitFor(() => expect(api.data.version).toHaveBeenCalledOnce())
    authStore.setSession(session)
    await refreshVisibleData()
    old.resolve({ version: 'obsolete', site_title: 'Obsolete', public_mode: false })
    await refresh
    expect(getCurrentDataVersion()).toBe('admin')
    expect(get(configStore).data).toEqual({ site_title: settings.site_title, public_mode: true })
    expect(api.public.getData).not.toHaveBeenCalled()
  })

  it('keeps the latest refresh when same-session responses arrive out of order', async () => {
    authStore.setSession(session)
    const old = deferred<AdminData>()
    api.admin.getData.mockReturnValueOnce(old.promise)
    const refresh = refreshLoggedInData(true)
    await refreshLoggedInData(true)
    old.resolve({ ...makeAdminData('obsolete'), bookmarks: [] })
    await refresh
    expect(getCurrentDataVersion()).toBe('admin')
    expect(get(publicStore).data?.bookmarks).toHaveLength(1)
    expect(adminCache.writeCachedAdminData).toHaveBeenCalledOnce()
  })

  it('clears private view immediately even when the logout public refresh fails', async () => {
    authStore.setSession(session)
    applyLoggedInData(makeAdminData())
    authStore.setSession(null)
    expect(get(publicStore).data).toBeNull()
    expect(get(adminStore).data.settings).toBeNull()
    api.public.getData.mockRejectedValueOnce(new Error('offline'))
    await refreshVisibleData()
    expect(get(publicStore).data).toBeNull()
  })

  it('does not launch a public fallback if login changes during unauthorized cache cleanup', async () => {
    authStore.setSession(session)
    const clearing = deferred<void>()
    adminCache.clearCachedAdminData.mockReturnValueOnce(clearing.promise)
    api.admin.getData.mockRejectedValueOnce(new ApiError('expired', { status: 401, code: ErrCode.UNAUTHORIZED }))
    const refresh = refreshVisibleData()
    await vi.waitFor(() => expect(adminCache.clearCachedAdminData).toHaveBeenCalledOnce())
    authStore.setSession({ ...session, token: 'new-session' })
    await refreshVisibleData()
    clearing.resolve()
    await refresh
    expect(api.public.getData).not.toHaveBeenCalled()
    expect(get(publicStore).data?.bookmarks).toHaveLength(1)
  })

  it('cancels old progressive batches when login replaces the visible data', async () => {
    vi.useFakeTimers()
    try {
      const data = makePublicData('old')
      data.bookmarks = Array.from({ length: 150 }, (_, index) => makePublicBookmark({ ...bookmark, id: index + 1 }))
      applyPublicData(data, 'old', true)
      expect(get(publicStore).data?.bookmarks).toHaveLength(60)
      authStore.setSession(session)
      applyLoggedInData(makeAdminData('new'))
      await vi.runAllTimersAsync()
      expect(get(publicStore).data?.bookmarks).toHaveLength(1)
      expect(getCurrentDataVersion()).toBe('new')
    } finally { vi.useRealTimers() }
  })
})

describe('dataService authoritative edit reads', () => {
  it('restores source fields without replacing projected view stores or snapshots', async () => {
    authStore.setSession(session)
    const projected = makeAdminData('v1')
    projected.bookmarks[0] = { ...bookmark, icon: null, icon_blob: null, icon_display: 'image' }
    applyLoggedInData(projected)
    const view = get(publicStore).data, admin = get(adminStore).data
    const raw = makeAdminData('v1')
    raw.bookmarks = [{ ...bookmark, icon: 'data:image/svg+xml;base64,PHN2Zy8+', icon_source: 'custom' }]
    raw.categories = [{ ...category, icon: 'data:image/svg+xml;base64,PHN2Zy8+' }]
    api.admin.getData.mockResolvedValueOnce(raw)
    expect(await readAdminDataForEdit()).toBe(raw)
    expect(get(publicStore).data).toBe(view)
    expect(get(adminStore).data).toBe(admin)
    expect(adminCache.readCachedAdminDataEntry).not.toHaveBeenCalled()
    expect(adminCache.writeCachedAdminData).not.toHaveBeenCalled()
  })
  it('does not read private edit data while logged out', async () => {
    expect(await readAdminDataForEdit()).toBeNull()
    expect(api.admin.getData).not.toHaveBeenCalled()
  })
  it('discards edit data after an identity change', async () => {
    authStore.setSession(session)
    let resolve!: (data: AdminData) => void
    api.admin.getData.mockReturnValueOnce(new Promise<AdminData>(done => { resolve = done }))
    const pending = readAdminDataForEdit()
    authStore.setSession({ ...session, token: 'new-session' })
    resolve(makeAdminData())
    expect(await pending).toBeNull()
  })
  it('does not surface an old 401 into a new edit session', async () => {
    authStore.setSession(session)
    let reject!: (error: Error) => void
    api.admin.getData.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    const pending = readAdminDataForEdit()
    authStore.setSession({ ...session, token: 'new-session' })
    reject(Object.assign(new Error('old 401'), { status: 401 }))
    expect(await pending).toBeNull()
    expect(get(authStore).session?.token).toBe('new-session')
  })
  it('does not substitute a lossy snapshot when the authoritative read fails', async () => {
    authStore.setSession(session)
    applyLoggedInData(makeAdminData())
    api.admin.getData.mockRejectedValueOnce(new Error('offline'))
    await expect(readAdminDataForEdit()).rejects.toThrow('offline')
    expect(adminCache.readCachedAdminDataEntry).not.toHaveBeenCalled()
  })
})


describe('warm public snapshot rendering', () => {
  function largeData(version: string, count = 150): PublicData {
    const data = makePublicData(version)
    data.bookmarks = Array.from({ length: count }, (_, index) => makePublicBookmark({ ...bookmark, id: index + 1, title: 'Synthetic ' + index }))
    return data
  }
  it('does not retract an already visible full list into a first batch on refresh', async () => {
    vi.useFakeTimers()
    const lengths: number[] = []
    let stop = () => {}
    try {
      applyPublicData(largeData('before'))
      stop = publicStore.subscribe(state => { if (state.data) lengths.push(state.data.bookmarks.length) })
      const next = largeData('after'); next.bookmarks[149].title = 'Changed synthetic title'
      applyPublicData(next, 'after', true)
      expect(lengths).toEqual([150, 150])
      expect(get(publicStore).data?.bookmarks[149].title).toBe('Changed synthetic title')
      await vi.runAllTimersAsync()
      expect(lengths).toEqual([150, 150])
    } finally { stop(); vi.useRealTimers() }
  })
  it('keeps restored cached data complete while applying the authoritative response', async () => {
    vi.useFakeTimers()
    const lengths: number[] = []
    const stop = publicStore.subscribe(state => { if (state.data) lengths.push(state.data.bookmarks.length) })
    try {
      publicCache.readCachedPublicDataEntry.mockResolvedValueOnce({data:largeData('before'),version:'before'})
      api.data.version.mockResolvedValueOnce({version:'after',site_title:'Synthetic',public_mode:true})
      const next=largeData('after');next.bookmarks[149].title='Refreshed'
      api.public.getData.mockResolvedValueOnce(next)
      await refreshPublicData(true)
      expect(lengths).toEqual([150,150])
      expect(dataHooks.onLocalSnapshotRestored).toHaveBeenCalledOnce()
      expect(publicCache.writeCachedPublicData).toHaveBeenCalledOnce()
      expect(get(publicStore).data?.bookmarks[149].title).toBe('Refreshed')
    } finally { stop(); await vi.runAllTimersAsync(); vi.useRealTimers() }
  })
  it('applies removal immediately and invalidates previous first-load batches', async () => {
    vi.useFakeTimers()
    try {
      applyPublicData(largeData('first'), 'first', true)
      expect(get(publicStore).data?.bookmarks).toHaveLength(60)
      applyPublicData(largeData('replacement',149), 'replacement', true)
      expect(get(publicStore).data?.bookmarks).toHaveLength(149)
      await vi.runAllTimersAsync()
      expect(get(publicStore).data?.bookmarks).toHaveLength(149)
      expect(get(publicStore).data?.bookmarks.some(item=>item.id===150)).toBe(false)
      expect(getCurrentDataVersion()).toBe('replacement')
    } finally { vi.useRealTimers() }
  })
})
