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
  configureDataService,
  getCurrentDataVersion,
  isLoggedIn,
  refreshLoggedInData,
  refreshPublicData,
} from '../../src/lib/dataService'
import { adminStore, authStore, configStore, publicStore } from '../../src/lib/stores'

const settings: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background_preset_id: 'custom',
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
  card_show_description: true,
  card_background_color: '#ffffff',
  card_background_opacity: 0.9,
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
  navigation: { position: 'left', always_expanded: false },
  footer_html: '',
}

const category: Category = { id: 1, title: 'Tools', icon: null, sort: 0, created_at: 100 }

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
        { id: category.id, title: category.title, icon: category.icon, sort: category.sort },
        { id: nextCategory.id, title: nextCategory.title, icon: nextCategory.icon, sort: nextCategory.sort },
      ],
      bookmarks: [makePublicBookmark(bookmark), makePublicBookmark(nextBookmark)],
    })

    await applyLocalCategorySort([nextCategory.id, category.id], false)
    await applyLocalBookmarkSort([nextBookmark.id, bookmark.id], false)

    expect(get(adminStore).data.categories.map((item) => [item.id, item.sort])).toEqual([[2, 0], [1, 1]])
    expect(get(publicStore).data?.categories.map((item) => [item.id, item.sort])).toEqual([[2, 0], [1, 1]])
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
