import { readFileSync } from 'node:fs'
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
    public: { getData: vi.fn(), registerClick: vi.fn() },
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

// stores.ts 从 api.ts 导入 authApi / 错误工具，用 importOriginal 保留真实导出，只覆盖 api。
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
  fetchScheduledObjectIconPayload: vi.fn(async () => ({ blob: null, status: 'retryable' })),
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
  applyIconDescriptor,
  configureDataService,
  persistCurrentAdminData,
  getCurrentDataVersion,
  isLoggedIn,
  refreshLoggedInData,
  confirmLoggedInDataAfterLocalMutation,
  recordMutationDataVersion,
  readAdminDataForEdit,
  recordBookmarkClick,
  refreshBookmarkIconCacheInBackground,
  refreshPublicData,
  refreshVisibleData,
} from '../../src/lib/dataService'
import { adminStore, authStore, configStore, publicStore } from '../../src/lib/stores'
import { bookmarkIconDisplay } from '../../src/lib/iconDisplayStore'
import { createHomeDataMemo } from '../../src/lib/homeData'

const settings: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  browser_sync_enabled: false,
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
  category_display: { root_font_size: 16, root_icon_size: 20, child_font_size: 14, child_icon_size: 18, root_title_color: '', child_title_color: '' },
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
  most_visited_count: 8,
  site_title_show: true,
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
    categories: [{ id: category.id, parent_id: category.parent_id, title: category.title, icon: category.icon, sort: category.sort }],
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

    // The confirmed remote version keys the edge cache (`/public/data?v=new`).
    expect(api.public.getData).toHaveBeenCalledWith(false, 'new')
    expect(publicCache.writeCachedPublicData).toHaveBeenCalledOnce()
    expect(getCurrentDataVersion()).toBe('new')
  })

  it('requests unversioned public data on a cold start without an extra version probe', async () => {
    publicCache.readCachedPublicDataEntry.mockResolvedValue(null)
    api.public.getData.mockResolvedValue(makePublicData('cold'))

    await refreshPublicData()

    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.public.getData).toHaveBeenCalledWith(false, null)
    expect(getCurrentDataVersion()).toBe('cold')
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

describe('dataService.recordBookmarkClick', () => {
  beforeEach(() => {
    // 真实 registerClick 恒返回 Promise；裸 mock 返回 undefined 会让调用点的 .catch 抛错。
    api.public.registerClick.mockResolvedValue(null)
  })

  it('persists the optimistic click into the same-version snapshot so a refresh keeps it (anonymous)', async () => {
    const seeded: PublicData = { ...makePublicData('v1'), bookmarks: [{ ...makePublicBookmark(bookmark), click_count: 0 }] }
    applyPublicData(seeded, 'v1')

    recordBookmarkClick(bookmark.id)

    // 内存乐观 +1
    expect(get(publicStore).data?.bookmarks[0].click_count).toBe(1)
    // 乐观值写回「当前版本」快照——否则刷新会用旧快照回退计数
    const persisted = publicCache.writeCachedPublicData.mock.calls.at(-1)
    expect(persisted?.[1]).toBe('v1')
    expect(persisted?.[0].bookmarks[0].click_count).toBe(1)

    // 用持久化快照模拟同版本刷新:计数必须保持,且因版本未变不重拉完整数据
    publicStore.reset()
    publicCache.readCachedPublicDataEntry.mockResolvedValueOnce({ data: persisted![0], version: 'v1' })
    api.data.version.mockResolvedValueOnce({ version: 'v1', site_title: 'CF-Navs', public_mode: true })

    await refreshPublicData()

    expect(get(publicStore).data?.bookmarks[0].click_count).toBe(1)
    expect(api.public.getData).not.toHaveBeenCalled()
  })

  it('swallows registerClick failures instead of leaking an unhandled rejection (PR #26)', async () => {
    applyPublicData({ ...makePublicData('v1'), bookmarks: [{ ...makePublicBookmark(bookmark), click_count: 0 }] }, 'v1')
    api.public.registerClick.mockRejectedValueOnce(new Error('network down'))

    // 行为契约：登记失败不许同步抛错、不许影响本地乐观计数。
    expect(() => recordBookmarkClick(bookmark.id)).not.toThrow()
    expect(api.public.registerClick).toHaveBeenCalledWith(bookmark.id)
    expect(get(publicStore).data?.bookmarks[0].click_count).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 接线断言：rejection 是否被吞只能发生在调用点接了 .catch 上。
    // 本文件跑在 vmForks 的 jsdom 环境，vm 内的 unhandled rejection 传不到
    // 宿主 process，行为层面测不出来，故按仓库既有的接线断言先例对源码形状兜底：
    // 撤掉 .catch 本用例必红（已实测对照）。
    const source = readFileSync('src/lib/dataService.ts', 'utf8')
    expect(source).toMatch(/void api\.public\.registerClick\(bookmarkId\)\.catch\(\(\) => undefined\)/)
  })

  it('increments and persists the admin snapshot when logged in', () => {
    authStore.setSession(session)
    adminStore.replaceData(makeAdminData('v1'))
    applyPublicData({ ...makePublicData('v1'), bookmarks: [{ ...makePublicBookmark(bookmark), click_count: 0 }] }, 'v1')

    recordBookmarkClick(bookmark.id)

    expect(get(adminStore).data.bookmarks.find((b) => b.id === bookmark.id)?.click_count).toBe(1)
    expect(get(publicStore).data?.bookmarks[0].click_count).toBe(1)
    // 登录态持久化后台快照,不写公开快照
    expect(adminCache.writeCachedAdminData).toHaveBeenCalled()
    expect(publicCache.writeCachedPublicData).not.toHaveBeenCalled()
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

describe('dataService.confirmLoggedInDataAfterLocalMutation', () => {
  beforeEach(async () => {
    authStore.setSession(null)
    authStore.setSession(session)
    api.admin.getData.mockResolvedValue(makeAdminData('v1'))
    await refreshLoggedInData(true)
    vi.clearAllMocks()
    api.admin.getData.mockResolvedValue(makeAdminData('fresh'))
  })

  it('falls back to a full refresh when no write has reported a version', async () => {
    await confirmLoggedInDataAfterLocalMutation()
    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.admin.getData).toHaveBeenCalledOnce()
    expect(getCurrentDataVersion()).toBe('fresh')
  })

  it('skips the full refetch when the server is exactly at the last reported write version', async () => {
    recordMutationDataVersion('v2')
    api.data.version.mockResolvedValue({ version: 'v2', site_title: 'CF-Navs', public_mode: true })

    await confirmLoggedInDataAfterLocalMutation()

    expect(api.data.version).toHaveBeenCalledOnce()
    expect(api.data.version).toHaveBeenCalledWith(true)
    expect(api.admin.getData).not.toHaveBeenCalled()
    expect(getCurrentDataVersion()).toBe('v2')
    expect(adminCache.writeCachedAdminData).toHaveBeenCalledOnce()
    expect(adminCache.writeCachedAdminData.mock.calls[0]![1]).toBe('v2')
  })

  it('refetches when another writer moved the version past the last reported one', async () => {
    recordMutationDataVersion('v2')
    api.data.version.mockResolvedValue({ version: 'v3', site_title: 'CF-Navs', public_mode: true })

    await confirmLoggedInDataAfterLocalMutation()

    expect(api.admin.getData).toHaveBeenCalledOnce()
    expect(getCurrentDataVersion()).toBe('fresh')
  })

  it('refetches when the dataset epoch changed even if the version matches', async () => {
    recordMutationDataVersion('v2')
    api.data.version.mockResolvedValue({ version: 'v2', dataset_epoch: 'e'.repeat(32), site_title: 'CF-Navs', public_mode: true })

    await confirmLoggedInDataAfterLocalMutation()

    expect(api.admin.getData).toHaveBeenCalledOnce()
  })

  it('refetches while an earlier forced full refresh has not completed', async () => {
    let release!: (value: AdminData) => void
    api.admin.getData.mockImplementationOnce(() => new Promise<AdminData>((resolve) => { release = resolve }))
    const superseded = refreshLoggedInData(true)
    await Promise.resolve()
    recordMutationDataVersion('v2')
    api.data.version.mockResolvedValue({ version: 'v2', site_title: 'CF-Navs', public_mode: true })

    const confirming = confirmLoggedInDataAfterLocalMutation()
    release(makeAdminData('stale'))
    await Promise.all([superseded, confirming])

    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.admin.getData).toHaveBeenCalledTimes(2)
    expect(getCurrentDataVersion()).toBe('fresh')
  })

  it('forgets reported versions across a session change', async () => {
    recordMutationDataVersion('v2')
    authStore.setSession(null)
    recordMutationDataVersion('v9')
    authStore.setSession({ ...session, token: 'tok-2' })
    api.data.version.mockResolvedValue({ version: 'v2', site_title: 'CF-Navs', public_mode: true })

    await confirmLoggedInDataAfterLocalMutation()

    expect(api.data.version).not.toHaveBeenCalled()
    expect(api.admin.getData).toHaveBeenCalledOnce()
  })

  it('propagates a failed version probe so the caller can report it', async () => {
    recordMutationDataVersion('v2')
    api.data.version.mockRejectedValue(new Error('offline'))
    await expect(confirmLoggedInDataAfterLocalMutation()).rejects.toThrow('offline')
    expect(api.admin.getData).not.toHaveBeenCalled()
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

    expect(api.public.getData).toHaveBeenCalledWith(false, null)
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
    expect(api.public.getData).toHaveBeenCalledWith(false, null)
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

describe('dataService icon descriptor state split', () => {
  const epoch = 'a'.repeat(32)
  const revision = 'sha256-' + 'b'.repeat(64)
  const descriptor = (patch: Record<string, unknown> = {}) => ({
    object_type: 'bookmark' as const, object_id: bookmark.id, dataset_epoch: epoch, write_epoch: 3, state: 'ready' as const, content_revision: revision, ...patch,
  })
  function loggedIn(rows: Bookmark[] = [bookmark]) {
    authStore.setSession(session)
    applyLoggedInData({ ...makeAdminData('v1'), bookmarks: rows, dataset_epoch: epoch } as AdminData)
  }

  it('records an icon update without replacing the bookmark arrays or Home derived data', () => {
    loggedIn([bookmark, { ...bookmark, id: 11, sort: 1 }])
    const admin = get(adminStore).data
    const visible = get(publicStore).data!
    const memo = createHomeDataMemo()
    const sorted = memo.getSortedBookmarks(visible.bookmarks)
    const index = memo.getSearchIndex(sorted, visible.categories, memo.getCategoryTitleMap(visible.categories))

    applyIconDescriptor(descriptor())

    expect(get(adminStore).data).toBe(admin)
    expect(get(publicStore).data).toBe(visible)
    const after = get(publicStore).data!
    expect(memo.getSortedBookmarks(after.bookmarks)).toBe(sorted)
    expect(memo.getSearchIndex(sorted, after.categories, memo.getCategoryTitleMap(after.categories))).toBe(index)
    expect(bookmarkIconDisplay.get(bookmark.id)).toEqual({ dataset_epoch: epoch, icon_revision: revision, icon_write_epoch: 3, icon_display: 'image' })
    expect(bookmarkIconDisplay.get(11)).toBeUndefined()
  })

  it('notifies only the updated bookmark id', () => {
    loggedIn([bookmark, { ...bookmark, id: 11, sort: 1 }])
    const seen10: unknown[] = []
    const seen11: unknown[] = []
    const stop10 = bookmarkIconDisplay.watch(10).subscribe((value) => seen10.push(value))
    const stop11 = bookmarkIconDisplay.watch(11).subscribe((value) => seen11.push(value))
    applyIconDescriptor(descriptor())
    applyIconDescriptor(descriptor()) // 重复描述符不重复通知
    stop10(); stop11()
    expect(seen10).toHaveLength(2)
    expect(seen11).toEqual([undefined])
  })

  it('keeps the previous fencing rules against the effective icon state', () => {
    loggedIn([{ ...bookmark, icon_write_epoch: 5 }])
    applyIconDescriptor(descriptor({ write_epoch: 4 }))
    expect(bookmarkIconDisplay.get(bookmark.id)).toBeUndefined()
    applyIconDescriptor(descriptor({ write_epoch: 6 }))
    expect(bookmarkIconDisplay.get(bookmark.id)?.icon_write_epoch).toBe(6)
    // 有效状态已是 write_epoch 6：更旧的写入不能回退它。
    applyIconDescriptor(descriptor({ write_epoch: 5, state: 'empty', content_revision: null }))
    expect(bookmarkIconDisplay.get(bookmark.id)?.icon_display).toBe('image')
    // 其它数据集的描述符被忽略。
    applyIconDescriptor(descriptor({ dataset_epoch: 'c'.repeat(32), write_epoch: 9 }))
    expect(bookmarkIconDisplay.get(bookmark.id)?.icon_write_epoch).toBe(6)
  })

  it('persists snapshots with the icon state merged back into the rows', async () => {
    loggedIn()
    applyIconDescriptor(descriptor({ state: 'empty', content_revision: null }))
    adminCache.writeCachedAdminData.mockClear()
    await persistCurrentAdminData()
    const written = adminCache.writeCachedAdminData.mock.calls[0][0] as AdminData
    expect(written.bookmarks[0]).toMatchObject({ id: bookmark.id, icon_display: 'empty', icon_write_epoch: 3, icon: null, icon_blob: null, icon_cached: false })
    expect(get(adminStore).data.bookmarks[0].icon_display).toBeUndefined()
  })

  it('drops stale icon state on newer server writes, deletions and identity changes', () => {
    loggedIn([bookmark, { ...bookmark, id: 11, sort: 1 }])
    applyIconDescriptor(descriptor())
    applyIconDescriptor(descriptor({ object_id: 11 }))
    applyLoggedInData({ ...makeAdminData('v2'), bookmarks: [{ ...bookmark, icon_write_epoch: 4 }], dataset_epoch: epoch } as AdminData)
    expect(bookmarkIconDisplay.get(10)).toBeUndefined()
    expect(bookmarkIconDisplay.get(11)).toBeUndefined()
    applyIconDescriptor(descriptor({ write_epoch: 4 }))
    expect(bookmarkIconDisplay.size).toBe(1)
    authStore.setSession(null)
    expect(bookmarkIconDisplay.size).toBe(0)
  })
})

describe('dataService.refreshBookmarkIconCacheInBackground', () => {
  it('后台补图失败不抛出，但用 console.warn 留下诊断线索', async () => {
    const failure = new Error('network down')
    api.bookmarks.refreshIconCache.mockRejectedValueOnce(failure)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(() => refreshBookmarkIconCacheInBackground(7)).not.toThrow()
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[CF-Navs] background bookmark icon refresh failed', 7, failure))
    } finally {
      warn.mockRestore()
    }
  })
})
