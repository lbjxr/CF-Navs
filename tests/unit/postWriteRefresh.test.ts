import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminData, Bookmark, Category, LoginResp } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import { api, setApiBaseUrl, subscribeMutationDataVersion } from '../../src/lib/api'
import { createCategoryController, type CategoryControllerDeps } from '../../src/lib/appCategoryController'
import { createBookmarkController, type BookmarkControllerDeps } from '../../src/lib/appBookmarkController'
import { createEditIntentCounter } from '../../src/lib/appEditIntent'
import { toBookmarkForm } from '../../src/lib/adminFormAdapters'

// 写后刷新的两条路径：
// - 写入结果已用服务端返回值应用到本地（单条增改删、排序）→ confirmAdminDataAfterLocalMutation（只确认版本）；
// - 没有本地应用（批量删除 / 移动、整理）→ refreshAdminDataAfterMutation（整包重拉）。
// 版本号来自写响应包络上的 data_version，由请求层广播。

function envelope(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('request layer broadcasts data_version from write envelopes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setApiBaseUrl('/api')
  })

  it('notifies subscribers only for successful envelopes that carry a version', async () => {
    const seen: string[] = []
    const stop = subscribeMutationDataVersion((v) => seen.push(v))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(envelope({ code: 0, msg: 'ok', data: null, data_version: 'v7' }))
      .mockResolvedValueOnce(envelope({ code: 0, msg: 'ok', data: null }))
      .mockResolvedValueOnce(envelope({ code: ErrCode.BAD_REQUEST, msg: 'bad', data: null, data_version: 'v8' }))
      .mockResolvedValueOnce(envelope({ code: 0, msg: 'ok', data: null, data_version: 'v9' }))
    vi.stubGlobal('fetch', fetchMock)
    setApiBaseUrl('https://navs.example.test/api')

    await api.bookmarks.sort([1, 2])
    await api.bookmarks.sort([1, 2])
    await expect(api.bookmarks.sort([1, 2])).rejects.toThrow('bad')
    stop()
    await api.bookmarks.sort([1, 2])

    expect(seen).toEqual(['v7'])
  })
})

type Calls = string[]

function categoryDeps(calls: Calls): CategoryControllerDeps {
  const category: Category = { id: 5, parent_id: null, title: 'New', icon: null, sort: 0, created_at: 1 }
  const admin = { categories: [category], bookmarks: [] } as Pick<AdminData, 'categories' | 'bookmarks'>
  const step = (name: string) => async () => { calls.push(name) }
  return {
    onChange: () => {},
    editIntent: createEditIntentCounter(),
    api: {
      categories: {
        create: async () => category,
        update: async () => category,
        remove: async () => null,
        batchDelete: async () => ({ deleted: 1, deleted_bookmarks: 0 }),
        sort: async () => null,
      },
    },
    isLoggedIn: () => true,
    openLogin: async () => {},
    ensureLoggedInDataLoaded: async () => true,
    ensureLazyComponent: async () => undefined,
    readAdminDataForEdit: async () => null,
    getAdminData: () => admin,
    requestConfirmation: async () => true,
    applyLocalCategoryUpsert: step('applyLocal'),
    applyLocalCategoryDelete: step('applyLocal'),
    applyLocalCategorySort: step('applyLocal'),
    persistCurrentAdminData: async () => {},
    refreshAdminDataAfterMutation: step('fullRefresh'),
    confirmAdminDataAfterLocalMutation: step('confirm'),
    refreshLoggedInData: step('refreshLoggedIn'),
    setRootError: () => {},
    setCurrentView: () => {},
    setHomeFocusCategoryId: () => {},
    tick: async () => {},
  }
}

function bookmarkDeps(calls: Calls): BookmarkControllerDeps {
  const session: LoginResp = { token: 't', expires_at: Date.now() + 60_000, username: 'admin' }
  const bookmark = { id: 9, category_id: 5, title: 'B', url: 'https://b.example', sort: 0 } as Bookmark
  const step = (name: string) => async () => { calls.push(name) }
  return {
    onChange: () => {},
    editIntent: createEditIntentCounter(),
    api: {
      bookmarks: {
        create: async () => bookmark,
        update: async () => bookmark,
        remove: async () => null,
        batchDelete: async () => ({ deleted: 2 }),
        batchMove: async () => ({ moved: 2, category_id: 5, position: 'end' as const }),
        sort: async () => null,
        reorganize: async () => null,
      },
    },
    getSession: () => session,
    readAdminData: () => ({ categories: [] }),
    isLoggedIn: () => true,
    openLogin: async () => {},
    ensureLoggedInDataLoaded: async () => true,
    ensureLazyComponent: async () => undefined,
    readBookmarkForEdit: async () => null,
    requestConfirmation: async () => true,
    applyLocalBookmarkUpsert: step('applyLocal'),
    applyLocalBookmarkDelete: step('applyLocal'),
    applyLocalBookmarkSort: step('applyLocal'),
    refreshBookmarkIconCacheInBackground: () => { calls.push('iconRefresh') },
    persistCurrentAdminData: async () => {},
    refreshAdminDataAfterMutation: step('fullRefresh'),
    confirmAdminDataAfterLocalMutation: step('confirm'),
    refreshLoggedInData: step('refreshLoggedIn'),
    setRootError: () => {},
  }
}

describe('post-write refresh path per mutation', () => {
  it('category: upsert / delete / sort confirm the version; batch delete refetches', async () => {
    const run = async (fn: (c: ReturnType<typeof createCategoryController>) => Promise<unknown>) => {
      const calls: Calls = []
      await fn(createCategoryController(categoryDeps(calls)))
      return calls
    }
    expect(await run(c => c.submit({ parent_id: null, title: 'New', icon: '' }))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.submit({ id: 5, parent_id: null, title: 'New', icon: '' }))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.remove({ id: 5, title: 'New' }))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.sort(null, [5]))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.batchRemove([5]))).toEqual(['fullRefresh'])
  })

  it('bookmark: upsert / delete / sort confirm the version; batch and reorganize refetch', async () => {
    const run = async (fn: (c: ReturnType<typeof createBookmarkController>) => Promise<unknown>) => {
      const calls: Calls = []
      await fn(createBookmarkController(bookmarkDeps(calls)))
      return calls
    }
    const form = { ...toBookmarkForm({ id: 9, category_id: 5, title: 'B', url: 'https://b.example', icon: null, sort: 0 } as unknown as Bookmark), id: undefined }
    expect(await run(c => c.submit(form))).toEqual(['applyLocal', 'confirm', 'iconRefresh'])
    expect(await run(c => c.submit({ ...form, id: 9 }))).toEqual(['applyLocal', 'confirm', 'iconRefresh'])
    expect(await run(c => c.remove({ id: 9, title: 'B' }))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.sort([9]))).toEqual(['applyLocal', 'confirm'])
    expect(await run(c => c.batchRemove([9, 10]))).toEqual(['fullRefresh'])
    expect(await run(c => c.batchMove({ ids: [9], category_id: 5 } as never))).toEqual(['fullRefresh'])
    expect(await run(c => c.reorganize([{ category_id: 5, ids: [9] }]))).toEqual(['fullRefresh'])
  })
})
