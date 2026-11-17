import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdminData,
  BatchDeleteBookmarksResp,
  Bookmark,
  BookmarkBatchMoveReq,
  BookmarkBatchMoveResp,
  BookmarkReorganizeReq,
  BookmarkUpsertReq,
  Category,
  LoginResp,
} from '../../shared/types'
import { getErrorMessage } from '../../src/lib/api'
import { toBookmarkForm, toBookmarkPayload } from '../../src/lib/adminFormAdapters'
import type { BookmarkFormValue } from '../../src/lib/adminTypes'
import { runAdminMutation } from '../../src/lib/appAdminMutation'
import {
  createBookmarkController,
  type BookmarkControllerDeps,
  type BookmarkEditorState,
} from '../../src/lib/appBookmarkController'
import { createCategoryController } from '../../src/lib/appCategoryController'
import {
  createBatchDeleteConfirmation,
  createDeleteBookmarkConfirmation,
  type ConfirmDialogInput,
} from '../../src/lib/appConfirmDialog'
import { createEditIntentCounter } from '../../src/lib/appEditIntent'
import { createBookmarkDraft } from '../../src/lib/appModalState'
import { createOptimisticSortState, runOptimisticSort } from '../../src/lib/appSortQueue'
import { toastStore } from '../../src/lib/toast'
import { flush, track, UseCaseWorld, type Plan } from '../helpers/useCaseWorld'

// 代码审查三轮第 15 项：App.svelte 拆分第 7b 步（书签用例）。
// 每个用例在同一份脚本下分别驱动新控制器与逐字复刻的原 App 实现（见文件末尾 legacy），
// 断言两者的依赖调用序列（含每次调用时的完整状态快照；会话 / adminStore 读取、toast、console.warn
// 也记入日志）、最终状态与 promise 结果完全一致，再对控制器的结果做语义断言。

interface Snap extends BookmarkEditorState {
  editIntent: number
  rootError: string
}

interface Impl {
  openCreate(categoryId?: string | number): Promise<void>
  openEdit(bookmark: { id: string | number }): Promise<void>
  close(): Promise<void>
  submit(form: BookmarkFormValue): Promise<void>
  remove(bookmark: { id: string | number; title: string }): Promise<void>
  batchRemove(ids: number[]): Promise<void>
  batchMove(payload: BookmarkBatchMoveReq): Promise<void>
  sort(ids: Array<string | number>): Promise<void>
  reorganize(orders: BookmarkReorganizeReq['category_orders']): Promise<void>
  /** 登出 / 改密中的 resetBookmarkState()。 */
  reset(): void
  /** 分类侧推进共享计数（打开 / 重置分类编辑框）。 */
  bumpIntent(): void
  read(): Snap
}

interface Ctx {
  loggedIn: boolean
  session: LoginResp | null
  categories: Category[]
}

const sessionA = { token: 'a', username: 'admin', expires_at: 1 } as unknown as LoginResp
const sessionB = { token: 'b', username: 'admin', expires_at: 2 } as unknown as LoginResp
const cat = (id: number) => ({ id, parent_id: null, title: `C${id}`, icon: null, sort: id, created_at: 0 }) as Category
const bm = (id: number, categoryId = 1, title = `B${id}`) =>
  ({ id, category_id: categoryId, title, url: `https://e.com/${id}`, icon: null, sort: id }) as unknown as Bookmark
const rawData = (): AdminData => ({ categories: [cat(1), cat(2)], bookmarks: [bm(10), bm(11, 2)], settings: null })

class World extends UseCaseWorld {
  ctx: Ctx
  impl!: Impl
  constructor(plan: Plan, ctx: Partial<Ctx> = {}) {
    super(plan, {
      ensureLoggedInDataLoaded: true,
      confirm: true,
      readAdminDataForEdit: rawData(),
      readBookmarkForEdit: bm(10),
      'api.create': bm(50, 1, 'New'),
      'api.update': bm(10, 1, 'Edited'),
      'api.batchDelete': { deleted: 2 },
      'api.batchMove': { moved: 2, category_id: 2, position: 'end' },
    })
    this.ctx = { loggedIn: true, session: sessionA, categories: [cat(1), cat(2)], ...ctx }
    this.snapshot = () => ({ ...this.impl.read(), loggedIn: this.ctx.loggedIn, session: this.ctx.session?.token ?? null })
  }

  /** 模拟登出 / 换会话（authStore 的会话对象换了）。 */
  switchSession(session: LoginResp | null): void {
    this.ctx.session = session
    this.ctx.loggedIn = session !== null
  }
}

let activeWorld: World | null = null

beforeEach(() => {
  vi.spyOn(toastStore, 'addToast').mockImplementation((message, type) => {
    activeWorld?.record('toast', message, type)
    return ''
  })
  vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
    activeWorld?.record('warn', message)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  activeWorld = null
})

function doubles(w: World) {
  return {
    isLoggedIn: () => {
      w.record('isLoggedIn')
      return w.ctx.loggedIn
    },
    getSession: () => {
      w.record('getSession')
      return w.ctx.session
    },
    readAdminData: () => {
      w.record('readAdminData')
      return { categories: w.ctx.categories }
    },
    openLogin: () => w.call<void>('openLogin'),
    ensureLoggedInDataLoaded: () => w.call<boolean>('ensureLoggedInDataLoaded'),
    ensureLazyComponent: (name: string) => w.call('ensure', name),
    readAdminDataForEdit: () => w.call<AdminData | null>('readAdminDataForEdit'),
    readBookmarkForEdit: (id: number, _signal: AbortSignal) => w.call<Bookmark>('readBookmarkForEdit', id),
    requestConfirmation: (input: ConfirmDialogInput) => w.call<boolean>('confirm', input),
    api: {
      bookmarks: {
        create: (payload: BookmarkUpsertReq) => w.call<Bookmark>('api.create', payload),
        update: (id: number, payload: BookmarkUpsertReq) => w.call<Bookmark>('api.update', id, payload),
        remove: (id: number) => w.call('api.remove', id),
        batchDelete: (ids: number[]) => w.call<BatchDeleteBookmarksResp>('api.batchDelete', ids),
        batchMove: (payload: BookmarkBatchMoveReq) => w.call<BookmarkBatchMoveResp>('api.batchMove', payload),
        sort: (ids: number[]) => w.call('api.sort', ids),
        reorganize: (orders: BookmarkReorganizeReq['category_orders']) => w.call('api.reorganize', orders),
      },
    },
    applyLocalBookmarkUpsert: (bookmark: Bookmark) => w.call<void>('applyLocalUpsert', bookmark),
    applyLocalBookmarkDelete: (id: number) => w.call<void>('applyLocalDelete', id),
    applyLocalBookmarkSort: (ids: number[], refreshMissing?: boolean) => w.call<void>('applyLocalSort', ids, refreshMissing),
    refreshBookmarkIconCacheInBackground: (id: number) => { w.callSync('refreshIconCache', id) },
    persistCurrentAdminData: (...args: unknown[]) => w.call<void>('persist', ...args),
    refreshAdminDataAfterMutation: () => w.call<void>('refreshAfterMutation'),
    // 差分对照里与 legacy 的「写后刷新」是同一步；走哪条路径由下方 post-write refresh 用例单独钉住。
    confirmAdminDataAfterLocalMutation: () => w.call<void>('refreshAfterMutation'),
    refreshLoggedInData: (force?: boolean) => w.call<void>('refreshLoggedIn', force),
  }
}

// ---------------------------------------------------------------------------
// 新控制器接到世界上（接线方式与 App.svelte 相同）
// ---------------------------------------------------------------------------

function attachController(w: World): Impl {
  const d = doubles(w)
  const editIntent = createEditIntentCounter()
  let rootError = ''
  let published: BookmarkEditorState | null = null
  const deps: BookmarkControllerDeps = {
    ...d,
    onChange: (next) => { published = next },
    editIntent,
    setRootError: (message) => { rootError = message },
  }
  const controller = createBookmarkController(deps)
  // 与 App 一样：初值取自构造后的 getState()，之后只经 onChange 更新。
  published = controller.getState()
  const impl: Impl = {
    openCreate: (id) => controller.openCreate(id),
    openEdit: (b) => controller.openEdit(b),
    close: () => controller.close(),
    submit: (f) => controller.submit(f),
    remove: (b) => controller.remove(b),
    batchRemove: (ids) => controller.batchRemove(ids),
    batchMove: (p) => controller.batchMove(p),
    sort: (ids) => controller.sort(ids),
    reorganize: (o) => controller.reorganize(o),
    reset: () => controller.reset(),
    bumpIntent: () => { editIntent.next() },
    // App 只通过 onChange 拿到状态；漏推送会让它与控制器内部状态不一致。
    read: () => {
      const state = published!
      expect(state).toEqual(controller.getState())
      return { ...state, editIntent: editIntent.current(), rootError }
    },
  }
  w.impl = impl
  return impl
}

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

interface Result { world: World; impl: Impl; settled: string[] }

interface Scenario {
  name: string
  plan?: Plan
  ctx?: Partial<Ctx>
  drive: (impl: Impl, w: World, settled: string[]) => Promise<void>
  check?: (r: Result) => void
}

const form = (patch: Partial<BookmarkFormValue> = {}): BookmarkFormValue => ({
  ...toBookmarkForm(bm(0)),
  id: undefined,
  title: ' New ',
  url: 'example.com',
  ...patch,
})
const calls = (w: World) => w.log.map(e => e.call)
const boom = new Error('boom')
const movePayload: BookmarkBatchMoveReq = { ids: [10, 11], category_id: 2, position: 'end', expected: [] } as unknown as BookmarkBatchMoveReq
const orders: BookmarkReorganizeReq['category_orders'] = [{ category_id: 1, ids: [11, 10] }]

const scenarios: Scenario[] = [
  // --- 新建 ---
  {
    name: 'open create while logged out: opens login only',
    ctx: { loggedIn: false, session: null },
    drive: (impl, _w, s) => track(s, 'open', impl.openCreate(1)),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['isLoggedIn', 'openLogin'])
      expect(impl.read()).toMatchObject({ modalOpen: false, editIntent: 1 })
    },
  },
  {
    name: 'open create when logged-in data is not ready: error cleared, stays closed',
    plan: { ensureLoggedInDataLoaded: [{ value: false }], 'api.remove': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'del', impl.remove({ id: 10, title: 'B10' }))
      await track(s, 'open', impl.openCreate(1))
    },
    check: ({ impl, world }) => {
      expect(world.log.find(e => e.call === 'ensureLoggedInDataLoaded')!.state).toMatchObject({ error: '' })
      expect(impl.read()).toMatchObject({ modalOpen: false, error: '' })
    },
  },
  {
    name: 'open create with a category: draft in that category',
    drive: (impl, _w, s) => track(s, 'open', impl.openCreate('2')),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['isLoggedIn', 'ensureLoggedInDataLoaded', 'ensure'])
      expect(impl.read()).toMatchObject({ modalOpen: true, modalMode: 'create', active: createBookmarkDraft('2') })
    },
  },
  {
    name: 'open create without a category: falls back to the first admin category',
    ctx: { categories: [cat(7), cat(8)] },
    drive: (impl, _w, s) => track(s, 'open', impl.openCreate()),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['isLoggedIn', 'ensureLoggedInDataLoaded', 'readAdminData', 'ensure'])
      expect(impl.read().active).toEqual(createBookmarkDraft(7))
    },
  },
  {
    name: 'open create without any category: draft without a category',
    ctx: { categories: [] },
    drive: (impl, _w, s) => track(s, 'open', impl.openCreate()),
    check: ({ impl }) => { expect(impl.read().active).toEqual(createBookmarkDraft(undefined)) },
  },
  {
    name: 'open create when the modal chunk fails: rejects, stays closed',
    plan: { ensure: [{ error: new Error('chunk') }] },
    drive: (impl, _w, s) => track(s, 'open', impl.openCreate(1)),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['open:err:chunk'])
      expect(impl.read().modalOpen).toBe(false)
    },
  },

  // --- 编辑 ---
  {
    name: 'edit: reads one authoritative bookmark and opens without refreshing the icon',
    drive: (impl, _w, s) => track(s, 'edit', impl.openEdit({ id: '10' })),
    check: ({ impl, world }) => {
      expect(calls(world)).toContain('readBookmarkForEdit')
      expect(calls(world)).not.toContain('readAdminDataForEdit')
      expect(calls(world)).not.toContain('refreshIconCache')
      expect(world.log.find(entry => entry.call === 'readBookmarkForEdit')).toMatchObject({ args: [10], state: { modalOpen: true, reading: true, active: null } })
      expect(impl.read()).toMatchObject({ modalOpen: true, modalMode: 'edit', active: toBookmarkForm(bm(10)), reading: false, readError: '' })
    },
  },
  {
    name: 'edit while logged out: opens login',
    ctx: { loggedIn: false, session: null },
    drive: (impl, _w, s) => track(s, 'edit', impl.openEdit({ id: 10 })),
    check: ({ world }) => { expect(calls(world)).toEqual(['getSession', 'isLoggedIn', 'openLogin']) },
  },
  {
    name: 'edit with no raw data: retryable error without a form',
    plan: { readBookmarkForEdit: [{ value: null }] },
    drive: (impl, _w, s) => track(s, 'edit', impl.openEdit({ id: 10 })),
    check: ({ impl, world }) => {
      expect(calls(world)).toContain('ensure')
      expect(impl.read()).toMatchObject({ modalOpen: true, active: null, reading: false, rootError: '' })
      expect(impl.read().readError).toContain('书签已不存在')
    },
  },
  {
    name: 'edit a bookmark that no longer exists: root error',
    plan: { readBookmarkForEdit: [{ error: new Error('书签已不存在，请刷新后重试。') }] },
    drive: (impl, _w, s) => track(s, 'edit', impl.openEdit({ id: 99 })),
    check: ({ impl }) => { expect(impl.read().readError).toContain('书签已不存在') },
  },
  {
    name: 'edit when the modal chunk fails: retryable error on the shell',
    plan: { ensure: [{ error: new Error('chunk') }] },
    drive: (impl, _w, s) => track(s, 'edit', impl.openEdit({ id: 10 })),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['edit:ok'])
      expect(impl.read()).toMatchObject({ modalOpen: true, reading: false, rootError: '' })
      expect(impl.read().readError).toContain('chunk')
    },
  },
  {
    name: 'edit superseded by a category action on the shared counter while reading: dropped',
    plan: { readBookmarkForEdit: [{ defer: 'r' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'edit', impl.openEdit({ id: 10 }))
      await flush()
      impl.bumpIntent()
      await w.release('r', { value: bm(10) })
      await p
    },
    check: ({ impl, world }) => {
      expect(calls(world)).toContain('ensure')
      expect(impl.read()).toMatchObject({ modalOpen: false, editIntent: 2 })
    },
  },
  {
    name: 'edit superseded while loading the modal: dropped without icon refresh',
    plan: { ensure: [{ defer: 'e' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'edit', impl.openEdit({ id: 10 }))
      await flush()
      impl.reset()
      await w.release('e')
      await p
    },
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshIconCache')
      expect(impl.read().modalOpen).toBe(false)
    },
  },
  {
    name: 'edit where the session changes while loading the modal: dropped',
    plan: { ensure: [{ defer: 'e' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'edit', impl.openEdit({ id: 10 }))
      await flush()
      w.ctx.session = sessionB
      await w.release('e')
      await p
    },
    check: ({ impl }) => { expect(impl.read().modalOpen).toBe(false) },
  },
  {
    name: 'edit where the user logged out while loading the modal: dropped',
    plan: { ensure: [{ defer: 'e' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'edit', impl.openEdit({ id: 10 }))
      await flush()
      w.switchSession(null)
      await w.release('e')
      await p
    },
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshIconCache')
      expect(impl.read().modalOpen).toBe(false)
    },
  },
  {
    name: 'edit superseded and then failing: no root error',
    plan: { readBookmarkForEdit: [{ defer: 'r' }] },
    drive: async (impl, w, s) => {
      const p = track(s, 'edit', impl.openEdit({ id: 10 }))
      await flush()
      impl.bumpIntent()
      await w.release('r', { error: boom })
      await p
    },
    check: ({ impl }) => { expect(impl.read().rootError).toBe('') },
  },
  {
    name: 'close resets the form and bumps the shared counter',
    drive: async (impl, _w, s) => {
      await track(s, 'edit', impl.openEdit({ id: 10 }))
      await track(s, 'close', impl.close())
    },
    check: ({ impl }) => {
      expect(impl.read()).toMatchObject({ modalOpen: false, modalMode: 'create', active: null, error: '', saving: false, editIntent: 2 })
    },
  },

  // --- 提交 ---
  {
    name: 'submit create: saves, resets, applies, refreshes, background icon refresh, toast 已创建',
    drive: async (impl, _w, s) => {
      await track(s, 'open', impl.openCreate(1))
      await track(s, 'submit', impl.submit(form()))
    },
    check: ({ impl, world }) => {
      const apiCall = world.log.find(e => e.call === 'api.create')!
      expect(apiCall.args).toEqual([toBookmarkPayload(form())])
      expect(apiCall.state).toMatchObject({ saving: true, error: '' })
      const tail = calls(world).slice(calls(world).indexOf('api.create'))
      expect(tail).toEqual(['api.create', 'getSession', 'applyLocalUpsert', 'getSession', 'refreshAfterMutation', 'getSession', 'refreshIconCache', 'getSession', 'toast', 'getSession'])
      expect(world.log.find(e => e.call === 'applyLocalUpsert')!.state).toMatchObject({ modalOpen: false })
      expect(world.log.find(e => e.call === 'toast')!.args).toEqual(['书签「New」已创建', 'success'])
      expect(impl.read()).toMatchObject({ modalOpen: false, saving: false })
    },
  },
  {
    name: 'submit edit: update API and 已更新 toast',
    drive: async (impl, _w, s) => {
      await track(s, 'edit', impl.openEdit({ id: 10 }))
      await track(s, 'submit', impl.submit(form({ id: 10 })))
    },
    check: ({ world }) => {
      expect(world.log.find(e => e.call === 'api.update')!.args[0]).toBe(10)
      expect(world.log.find(e => e.call === 'toast')!.args).toEqual(['书签「Edited」已更新', 'success'])
    },
  },
  {
    name: 'submit failure: error on the open form, saving cleared',
    plan: { 'api.create': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'open', impl.openCreate(1))
      await track(s, 'submit', impl.submit(form()))
    },
    check: ({ impl }) => { expect(impl.read()).toMatchObject({ modalOpen: true, error: 'boom', saving: false }) },
  },
  {
    name: 'submit after logout mid-request: nothing applied, saving left as is (original semantics)',
    plan: { 'api.create': [{ defer: 'c' }] },
    drive: async (impl, w, s) => {
      await track(s, 'open', impl.openCreate(1))
      const p = track(s, 'submit', impl.submit(form()))
      await flush()
      w.switchSession(null)
      await w.release('c')
      await p
    },
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('applyLocalUpsert')
      expect(calls(world)).not.toContain('toast')
      expect(impl.read()).toMatchObject({ modalOpen: true, saving: true })
    },
  },
  {
    name: 'submit where the session changes during the local apply: stops before refresh',
    plan: { applyLocalUpsert: [{ effect: (w) => { (w as World).ctx.session = sessionB } }] },
    drive: async (impl, _w, s) => {
      await track(s, 'open', impl.openCreate(1))
      await track(s, 'submit', impl.submit(form()))
    },
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('refreshAfterMutation')
      expect(calls(world)).not.toContain('toast')
      expect(impl.read()).toMatchObject({ modalOpen: false })
    },
  },
  {
    name: 'submit where the session changes during the refresh: no icon refresh, no toast',
    plan: { refreshAfterMutation: [{ effect: (w) => { (w as World).ctx.session = sessionB } }] },
    drive: async (impl, _w, s) => {
      await track(s, 'open', impl.openCreate(1))
      await track(s, 'submit', impl.submit(form()))
    },
    check: ({ world }) => {
      expect(calls(world)).not.toContain('refreshIconCache')
      expect(calls(world)).not.toContain('toast')
    },
  },
  {
    name: 'submit without a session at all: never current, nothing settles',
    ctx: { session: null },
    drive: (impl, _w, s) => track(s, 'submit', impl.submit(form())),
    check: ({ impl, world }) => {
      expect(calls(world)).not.toContain('applyLocalUpsert')
      expect(impl.read()).toMatchObject({ saving: true, error: '' })
    },
  },
  {
    name: 'submit with a malformed form: payload error goes to the form error',
    drive: (impl, _w, s) => track(s, 'submit', impl.submit({ title: 'x' } as unknown as BookmarkFormValue)),
    check: ({ impl }) => {
      expect(impl.read().error).not.toBe('')
      expect(impl.read().saving).toBe(false)
    },
  },

  // --- 删除 ---
  {
    name: 'delete cancelled: nothing',
    plan: { confirm: [{ value: false }] },
    drive: (impl, _w, s) => track(s, 'del', impl.remove({ id: 10, title: 'B10' })),
    check: ({ world }) => {
      expect(calls(world)).toEqual(['confirm'])
      expect(world.log[0].args).toEqual([createDeleteBookmarkConfirmation('B10')])
    },
  },
  {
    name: 'delete from the open edit form: deletingId, reset, local delete, refresh, toast',
    drive: async (impl, _w, s) => {
      await track(s, 'edit', impl.openEdit({ id: 10 }))
      await track(s, 'del', impl.remove({ id: '10', title: 'B10' }))
    },
    check: ({ impl, world }) => {
      expect(world.log.find(e => e.call === 'api.remove')!.state).toMatchObject({ deletingId: 10, modalOpen: true })
      expect(world.log.find(e => e.call === 'applyLocalDelete')!.state).toMatchObject({ modalOpen: false, deletingId: 10 })
      expect(world.log.at(-1)!.args).toEqual(['书签「B10」已删除', 'success'])
      expect(impl.read()).toMatchObject({ deletingId: null, modalOpen: false })
    },
  },
  {
    name: 'delete failure: error, deletingId cleared, form kept',
    plan: { 'api.remove': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'edit', impl.openEdit({ id: 10 }))
      await track(s, 'del', impl.remove({ id: 10, title: 'B10' }))
    },
    check: ({ impl }) => { expect(impl.read()).toMatchObject({ error: 'boom', deletingId: null, modalOpen: true }) },
  },

  // --- 批量删除 / 移动 ---
  {
    name: 'batch delete with no ids: nothing',
    drive: (impl, _w, s) => track(s, 'batch', impl.batchRemove([])),
    check: ({ world }) => { expect(world.log).toEqual([]) },
  },
  {
    name: 'batch delete cancelled',
    plan: { confirm: [{ value: false }] },
    drive: (impl, _w, s) => track(s, 'batch', impl.batchRemove([10, 11])),
    check: ({ world }) => {
      expect(calls(world)).toEqual(['confirm'])
      expect(world.log[0].args).toEqual([createBatchDeleteConfirmation('bookmark', 2)])
    },
  },
  {
    name: 'batch delete success: refresh and toast',
    drive: (impl, _w, s) => track(s, 'batch', impl.batchRemove([10, 11])),
    check: ({ world }) => {
      expect(calls(world)).toEqual(['confirm', 'api.batchDelete', 'refreshAfterMutation', 'toast'])
      expect(world.log.at(-1)!.args).toEqual(['已删除 2 个书签', 'success'])
    },
  },
  {
    name: 'batch delete that deleted nothing: no refresh',
    plan: { 'api.batchDelete': [{ value: { deleted: 0 } }] },
    drive: (impl, _w, s) => track(s, 'batch', impl.batchRemove([99])),
    check: ({ world }) => { expect(calls(world)).toEqual(['confirm', 'api.batchDelete', 'toast']) },
  },
  {
    name: 'batch delete failure: bookmark error, resolves',
    plan: { 'api.batchDelete': [{ error: boom }] },
    drive: (impl, _w, s) => track(s, 'batch', impl.batchRemove([10])),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['batch:ok'])
      expect(impl.read().error).toBe('boom')
    },
  },
  {
    name: 'batch move success: clears the error, refresh, toast',
    plan: { 'api.remove': [{ error: boom }] },
    drive: async (impl, _w, s) => {
      await track(s, 'del', impl.remove({ id: 10, title: 'B10' }))
      await track(s, 'move', impl.batchMove(movePayload))
    },
    check: ({ impl, world }) => {
      expect(world.log.find(e => e.call === 'api.batchMove')).toMatchObject({ args: [movePayload], state: { error: '' } })
      expect(world.log.at(-1)!.args).toEqual(['已移动 2 个书签', 'success'])
      expect(impl.read().error).toBe('')
    },
  },
  {
    name: 'batch move failure: error set and the original error rethrown',
    plan: { 'api.batchMove': [{ error: new Error('conflict') }] },
    drive: (impl, _w, s) => track(s, 'move', impl.batchMove(movePayload)),
    check: ({ impl, settled }) => {
      expect(settled).toEqual(['move:err:conflict'])
      expect(impl.read().error).toBe('conflict')
    },
  },
  {
    name: 'batch move whose refresh fails: error set and rethrown',
    plan: { refreshAfterMutation: [{ error: new Error('refresh') }] },
    drive: (impl, _w, s) => track(s, 'move', impl.batchMove(movePayload)),
    check: ({ impl, world, settled }) => {
      expect(calls(world)).not.toContain('toast')
      expect(settled).toEqual(['move:err:refresh'])
      expect(impl.read().error).toBe('refresh')
    },
  },

  // --- 排序 ---
  {
    name: 'sort success: local sort without refetch, save, persist, refresh',
    drive: (impl, _w, s) => track(s, 'sort', impl.sort(['11', 10])),
    check: ({ world }) => {
      expect(calls(world)).toEqual(['applyLocalSort', 'api.sort', 'persist', 'refreshAfterMutation'])
      expect(world.log[0].args).toEqual([[11, 10], false])
      expect(world.log[1].args).toEqual([[11, 10]])
    },
  },
  {
    name: 'sort failure: error and restore',
    plan: { 'api.sort': [{ error: boom }] },
    drive: (impl, _w, s) => track(s, 'sort', impl.sort([11, 10])),
    check: ({ impl, world }) => {
      expect(calls(world)).toEqual(['applyLocalSort', 'api.sort', 'refreshLoggedIn'])
      expect(world.log.at(-1)).toMatchObject({ args: [true], state: { error: 'boom' } })
      expect(impl.read().error).toBe('boom')
    },
  },
  {
    name: 'sort failure with failing restore: warns',
    plan: { 'api.sort': [{ error: boom }], refreshLoggedIn: [{ error: new Error('restore') }] },
    drive: (impl, _w, s) => track(s, 'sort', impl.sort([11, 10])),
    check: ({ world }) => { expect(calls(world).at(-1)).toBe('warn') },
  },
  {
    name: 'overlapping sorts: queued, only the latest persists',
    plan: { 'api.sort': [{ defer: 's1' }, {}] },
    drive: async (impl, w, s) => {
      const a = track(s, 'a', impl.sort([10, 11]))
      await flush()
      const b = track(s, 'b', impl.sort([11, 10]))
      await flush()
      await w.release('s1')
      await Promise.all([a, b])
    },
    check: ({ world }) => {
      expect(calls(world)).toEqual(['applyLocalSort', 'api.sort', 'applyLocalSort', 'api.sort', 'persist', 'refreshAfterMutation'])
    },
  },

  // --- 跨分类整理 ---
  {
    name: 'reorganize success: submit then refresh',
    drive: (impl, _w, s) => track(s, 'reorg', impl.reorganize(orders)),
    check: ({ world, settled }) => {
      expect(calls(world)).toEqual(['api.reorganize', 'refreshAfterMutation'])
      expect(world.log[0].args).toEqual([orders])
      expect(settled).toEqual(['reorg:ok'])
    },
  },
  {
    name: 'reorganize failure: restores from the server, then rethrows the original error',
    plan: { 'api.reorganize': [{ error: new Error('stale') }] },
    drive: (impl, _w, s) => track(s, 'reorg', impl.reorganize(orders)),
    check: ({ impl, world, settled }) => {
      expect(calls(world)).toEqual(['api.reorganize', 'refreshLoggedIn'])
      expect(world.log[1].args).toEqual([true])
      expect(settled).toEqual(['reorg:err:stale'])
      expect(impl.read().error).toBe('')
    },
  },
  {
    name: 'reorganize failure whose restore fails: the restore error propagates',
    plan: { 'api.reorganize': [{ error: new Error('stale') }], refreshLoggedIn: [{ error: new Error('offline') }] },
    drive: (impl, _w, s) => track(s, 'reorg', impl.reorganize(orders)),
    check: ({ settled }) => { expect(settled).toEqual(['reorg:err:offline']) },
  },

  // --- 重置（登出 / 改密）---
  {
    name: 'reset from an open edit form clears everything',
    drive: async (impl, _w, s) => {
      await track(s, 'edit', impl.openEdit({ id: 10 }))
      impl.reset()
    },
    check: ({ impl }) => {
      expect(impl.read()).toMatchObject({ modalOpen: false, modalMode: 'create', active: null, editIntent: 2 })
    },
  },
]

function runScenario(sc: Scenario, attach: (w: World) => Impl): Promise<Result> {
  const world = new World(sc.plan ?? {}, sc.ctx)
  activeWorld = world
  const impl = attach(world)
  const settled: string[] = []
  return sc.drive(impl, world, settled).then(async () => {
    await flush()
    activeWorld = null
    return { world, impl, settled }
  })
}

describe('app bookmark controller', () => {
  it('prefills a URL without saving it and clears it on the next ordinary creation', async () => {
    const world = new World({})
    attachController(world)
    const controller = createBookmarkController({
      ...doubles(world),
      onChange: () => {},
      editIntent: createEditIntentCounter(),
      setRootError: () => {},
    })
    await controller.openCreate(undefined, 'https://new.example/Case')
    expect(controller.getState()).toMatchObject({
      modalOpen: true, modalMode: 'create', active: { category_id: 1, title: '', url: 'https://new.example/Case' },
    })
    expect(calls(world)).not.toContain('api.create')
    await controller.close()
    await controller.openCreate(2)
    expect(controller.getState().active).toMatchObject({ category_id: 2, title: '', url: '' })
  })

  for (const sc of scenarios) {
    it(sc.name, async () => {
      const ours = await runScenario(sc, attachController)
      // Edit opening deliberately changes the old wait-before-display sequence.
      // Keep differential coverage for the unchanged create/mutation workflows.
      if (!calls(ours.world).includes('readBookmarkForEdit')) {
        const legacy = await runScenario(sc, attachLegacy)
        expect(ours.world.log).toEqual(legacy.world.log)
        expect(ours.impl.read()).toEqual(legacy.impl.read())
        expect(ours.settled).toEqual(legacy.settled)
      }
      expect(ours.world.gates.size).toBe(0)
      sc.check?.(ours)
    })
  }

  it('publishes a snapshot after every change and keeps the active form identity otherwise', async () => {
    const world = new World({})
    activeWorld = world
    attachController(world)
    const states: BookmarkEditorState[] = []
    const controller = createBookmarkController({
      ...doubles(world),
      onChange: (s) => states.push(s),
      editIntent: createEditIntentCounter(),
      setRootError: () => {},
    })
    expect(controller.getState()).toEqual({ modalOpen: false, modalMode: 'create', active: null, reading: false, readError: '', saving: false, deletingId: null, error: '' })
    await controller.openEdit({ id: 10 })
    await controller.submit(form({ id: 10 }))
    // 先显示读取外壳 → 原始表单 → saving=true → reset → onSettled
    expect(states.map(s => [s.modalOpen, s.saving])).toEqual([[true, false], [true, false], [true, true], [false, false], [false, false]])
    expect(states[2].active).toBe(states[1].active)
  })

  it('opens a cancellable shell and starts the component load while the raw read is pending', async () => {
    const world = new World({ readBookmarkForEdit: [{ defer: 'read' }], ensure: [{ defer: 'chunk' }] })
    attachController(world)
    const read = vi.fn((id: number, _signal: AbortSignal) => world.call<Bookmark>('readBookmarkForEdit', id))
    const controller = createBookmarkController({
      ...doubles(world), readBookmarkForEdit: read, editIntent: createEditIntentCounter(), onChange: () => {}, setRootError: () => {},
    })
    const pending = controller.openEdit({ id: 10 })
    expect(controller.getState()).toMatchObject({ modalOpen: true, reading: true, active: null })
    expect(world.gates.has('read')).toBe(true)
    expect(world.gates.has('chunk')).toBe(true)
    const signal = read.mock.calls[0][1]
    await controller.submit(form({ id: 10 }))
    expect(calls(world)).not.toContain('api.update')
    await controller.close()
    expect(signal.aborted).toBe(true)
    await world.release('read', { value: bm(10) })
    await world.release('chunk')
    await pending
    expect(controller.getState()).toMatchObject({ modalOpen: false, active: null, reading: false })
  })

  it('keeps failed reads unsavable and retries with authoritative embedded icon fields', async () => {
    const world = new World({ readBookmarkForEdit: [{ error: new Error('offline') }, { value: { ...bm(10), icon: 'data:image/svg+xml;base64,PHN2Zy8+', icon_source: 'custom' } }] })
    attachController(world)
    const controller = createBookmarkController({ ...doubles(world), editIntent: createEditIntentCounter(), onChange: () => {}, setRootError: vi.fn() })
    await controller.openEdit({ id: 10 })
    expect(controller.getState()).toMatchObject({ modalOpen: true, reading: false, active: null })
    expect(controller.getState().readError).toContain('offline')
    await controller.submit(form({ id: 10 }))
    expect(calls(world)).not.toContain('api.update')
    await controller.retryEdit()
    expect(controller.getState()).toMatchObject({ reading: false, readError: '', active: { icon: 'data:image/svg+xml;base64,PHN2Zy8+', icon_source: 'custom' } })
    expect(calls(world).filter(call => call === 'readBookmarkForEdit')).toHaveLength(2)
    expect(calls(world)).not.toContain('refreshIconCache')
  })

  it('rejects a mismatched single-bookmark response rather than filling another form', async () => {
    const world = new World({ readBookmarkForEdit: [{ value: bm(11) }] })
    const controller = attachController(world)
    await controller.openEdit({ id: 10 })
    expect(controller.read()).toMatchObject({ active: null, reading: false, modalOpen: true })
    expect(controller.read().readError).toContain('数据不匹配')
  })

  it('aborts an edit superseded by another bookmark and ignores its late success', async () => {
    const world = new World({ readBookmarkForEdit: [{ defer: 'first' }, { value: bm(11) }] })
    attachController(world)
    const read = vi.fn((id: number, _signal: AbortSignal) => world.call<Bookmark>('readBookmarkForEdit', id))
    const controller = createBookmarkController({ ...doubles(world), readBookmarkForEdit: read, editIntent: createEditIntentCounter(), onChange: () => {}, setRootError: () => {} })
    const old = controller.openEdit({ id: 10 })
    const firstSignal = read.mock.calls[0][1]
    await controller.openEdit({ id: 11 })
    expect(firstSignal.aborted).toBe(true)
    await world.release('first', { value: bm(10) })
    await old
    expect(controller.getState()).toMatchObject({ active: { id: 11 }, reading: false, readError: '' })
  })

  it('aborts and releases the editor when the owning App is destroyed', async () => {
    const world = new World({ readBookmarkForEdit: [{ defer: 'read' }] })
    attachController(world)
    const read = vi.fn((id: number, _signal: AbortSignal) => world.call<Bookmark>('readBookmarkForEdit', id))
    const controller = createBookmarkController({ ...doubles(world), readBookmarkForEdit: read, editIntent: createEditIntentCounter(), onChange: () => {}, setRootError: () => {} })
    const pending = controller.openEdit({ id: 10 })
    controller.destroy()
    expect(read.mock.calls[0][1].aborted).toBe(true)
    await world.release('read', { error: new Error('aborted') })
    await pending
    expect(controller.getState()).toMatchObject({ modalOpen: false, active: null, readError: '' })
  })

  it('times out a stalled component load and never revives its late response', async () => {
    vi.useFakeTimers()
    try {
      const world = new World({ ensure: [{ defer: 'chunk' }] })
      attachController(world)
      const controller = createBookmarkController({ ...doubles(world), editIntent: createEditIntentCounter(), onChange: () => {}, setRootError: () => {} })
      const pending = controller.openEdit({ id: 10 })
      await vi.advanceTimersByTimeAsync(10_000)
      await pending
      expect(controller.getState()).toMatchObject({ modalOpen: true, reading: false, active: null })
      expect(controller.getState().readError).toContain('超时')
      await world.release('chunk')
      expect(controller.getState().active).toBeNull()
    } finally { vi.useRealTimers() }
  })
})

// 两个控制器注入同一个计数器：任一方打开 / 重置编辑框，都会作废另一方仍在读取的编辑。
describe('shared edit intent between category and bookmark controllers', () => {
  function setup(plan: Plan) {
    const world = new World(plan)
    activeWorld = world
    attachController(world)
    const editIntent = createEditIntentCounter()
    const d = doubles(world)
    const bookmarks = createBookmarkController({ ...d, onChange: () => {}, editIntent, setRootError: () => {} })
    const categories = createCategoryController({
      ...d,
      api: { categories: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), batchDelete: vi.fn(), sort: vi.fn() } },
      onChange: () => {},
      editIntent,
      getAdminData: () => rawData(),
      applyLocalCategoryUpsert: vi.fn(),
      applyLocalCategoryDelete: vi.fn(),
      applyLocalCategorySort: vi.fn(),
      setRootError: () => {},
      setCurrentView: () => {},
      setHomeFocusCategoryId: () => {},
      tick: async () => {},
    })
    return { world, editIntent, bookmarks, categories }
  }

  it('opening a category form drops a bookmark edit still reading its data', async () => {
    const { world, editIntent, bookmarks, categories } = setup({ readBookmarkForEdit: [{ defer: 'b' }] })
    const pending = bookmarks.openEdit({ id: 10 })
    await flush()
    await categories.openCreate(null, true)
    expect(bookmarks.getState().modalOpen).toBe(false)
    await world.release('b', { value: bm(10) })
    await pending
    expect(bookmarks.getState().modalOpen).toBe(false)
    expect(categories.getState().modalOpen).toBe(true)
    expect(editIntent.current()).toBe(2)
  })

  it('resetting the bookmark form drops a category edit still reading its data', async () => {
    const { world, bookmarks, categories } = setup({ readAdminDataForEdit: [{ defer: 'c' }] })
    const pending = categories.openEdit({ id: 1 })
    await flush()
    bookmarks.reset()
    await world.release('c', { value: rawData() })
    await pending
    expect(categories.getState().modalOpen).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// legacy：逐字复刻拆分前 App.svelte（HEAD 6b9e027）的书签代码。
// 仅做机械替换：App 作用域变量 → `app.xxx`，模块级依赖 → 世界替身
// （api / lazyComponents / dataService / requestConfirmation / handleOpenLogin / ensureLoggedInDataLoaded /
// refreshAdminDataAfterMutation → 同名替身；`get(authStore).session` → getSession()，
// `get(adminStore).data` → readAdminData()），控制流与语句顺序不变。
// ---------------------------------------------------------------------------

function attachLegacy(w: World): Impl {
  const d = doubles(w)
  const app = {
    rootError: '',
    bookmarkModalOpen: false,
    bookmarkModalMode: 'create' as 'create' | 'edit',
    activeBookmark: null as Partial<BookmarkFormValue> | null,
    editIntent: 0,
    savingBookmark: false,
    deletingBookmarkId: null as number | null,
    bookmarkError: '',
  }
  const api = d.api
  const lazyComponents = { ensure: d.ensureLazyComponent }
  const authStore = 'authStore'
  const adminStore = 'adminStore'
  // svelte/store 的 get：读哪个字段就记录对应的读取（authStore.session / adminStore.data）。
  const get = (_store: typeof authStore | typeof adminStore) => ({
    get session() { return d.getSession() },
    get data() { return d.readAdminData() },
  })
  const {
    isLoggedIn, readAdminDataForEdit, applyLocalBookmarkUpsert, applyLocalBookmarkDelete, applyLocalBookmarkSort,
    refreshBookmarkIconCacheInBackground, persistCurrentAdminData, refreshLoggedInData,
  } = d
  const handleOpenLogin = d.openLogin
  const ensureLoggedInDataLoaded = d.ensureLoggedInDataLoaded
  const refreshAdminDataAfterMutation = d.refreshAdminDataAfterMutation
  const requestConfirmation = d.requestConfirmation
  const bookmarkSortState = createOptimisticSortState()

  function resetBookmarkState(): void {
    app.editIntent += 1
    app.bookmarkModalOpen = false
    app.bookmarkModalMode = 'create'
    app.activeBookmark = null
    app.bookmarkError = ''
    app.savingBookmark = false
  }

  async function handleOpenCreateBookmark(categoryId?: string | number): Promise<void> {
    app.editIntent += 1
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }

    app.bookmarkError = ''
    if (!await ensureLoggedInDataLoaded()) {
      return
    }
    const fallbackCategoryId = categoryId ?? get(adminStore).data.categories[0]?.id
    await lazyComponents.ensure('BookmarkEditModal')
    app.bookmarkModalMode = 'create'
    app.activeBookmark = createBookmarkDraft(fallbackCategoryId)
    app.bookmarkModalOpen = true
  }

  async function handleEditBookmark(bookmark: { id: string | number }): Promise<void> {
    const intent = ++app.editIntent
    const editSession = get(authStore).session
    if (!isLoggedIn()) {
      await handleOpenLogin()
      return
    }
    app.bookmarkError = ''
    try {
      const data = await readAdminDataForEdit()
      if (!data || intent !== app.editIntent) return
      const current = data.bookmarks.find(item => item.id === Number(bookmark.id))
      if (!current) throw new Error('书签已不存在，请刷新后重试。')
      await lazyComponents.ensure('BookmarkEditModal')
      if (!isLoggedIn() || get(authStore).session !== editSession || intent !== app.editIntent) return
      app.bookmarkModalMode = 'edit'
      app.activeBookmark = toBookmarkForm(current)
      app.bookmarkModalOpen = true
      refreshBookmarkIconCacheInBackground(Number(bookmark.id))
    } catch (error) {
      if (intent === app.editIntent) app.rootError = `无法读取书签的原始编辑数据：${getErrorMessage(error)}`
    }
  }

  async function handleCloseBookmarkModal(): Promise<void> {
    resetBookmarkState()
  }

  async function handleSubmitBookmark(form: BookmarkFormValue): Promise<void> {
    const isEdit = form.id != null
    const submitSession = get(authStore).session
    const isCurrent = () => submitSession !== null && get(authStore).session === submitSession
    app.savingBookmark = true
    app.bookmarkError = ''

    await runAdminMutation({
      isCurrent,
      run: () =>
        isEdit
          ? api.bookmarks.update(Number(form.id), toBookmarkPayload(form))
          : api.bookmarks.create(toBookmarkPayload(form)),
      onSuccess: async (bookmark) => {
        resetBookmarkState()
        await applyLocalBookmarkUpsert(bookmark)
        if (!isCurrent()) return
        await refreshAdminDataAfterMutation()
        if (isCurrent()) refreshBookmarkIconCacheInBackground(bookmark.id)
      },
      successMessage: (bookmark) =>
        isEdit ? `书签「${bookmark.title}」已更新` : `书签「${bookmark.title}」已创建`,
      onError: (message) => {
        app.bookmarkError = message
      },
      onSettled: () => {
        app.savingBookmark = false
      },
    })
  }

  async function handleDeleteBookmark(bookmark: { id: string | number; title: string }): Promise<void> {
    const confirmed = await requestConfirmation(createDeleteBookmarkConfirmation(bookmark.title))
    if (!confirmed) return

    const bookmarkId = Number(bookmark.id)
    app.deletingBookmarkId = bookmarkId
    app.bookmarkError = ''

    await runAdminMutation({
      run: () => api.bookmarks.remove(bookmarkId),
      onSuccess: async () => {
        resetBookmarkState()
        await applyLocalBookmarkDelete(bookmarkId)
        await refreshAdminDataAfterMutation()
      },
      successMessage: () => `书签「${bookmark.title}」已删除`,
      onError: (message) => {
        app.bookmarkError = message
      },
      onSettled: () => {
        app.deletingBookmarkId = null
      },
    })
  }

  async function handleBatchDeleteBookmarks(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    if (!await requestConfirmation(createBatchDeleteConfirmation('bookmark', ids.length))) return

    await runAdminMutation({
      run: () => api.bookmarks.batchDelete(ids),
      onSuccess: async (result) => {
        if (result.deleted > 0) await refreshAdminDataAfterMutation()
      },
      successMessage: (result) => `已删除 ${result.deleted} 个书签`,
      onError: (message) => {
        app.bookmarkError = message
      },
    })
  }
  async function handleBatchMoveBookmarks(payload: BookmarkBatchMoveReq): Promise<void> {
    app.bookmarkError = ''

    await runAdminMutation({
      run: () => api.bookmarks.batchMove(payload),
      onSuccess: () => refreshAdminDataAfterMutation(),
      successMessage: (result) => `已移动 ${result.moved} 个书签`,
      onError: (message) => {
        app.bookmarkError = message
      },
      rethrow: true,
    })
  }

  async function handleSortBookmarks(ids: Array<string | number>): Promise<void> {
    app.bookmarkError = ''

    await runOptimisticSort(bookmarkSortState, ids, {
      applyLocalSort: (sortedIds) => applyLocalBookmarkSort(sortedIds, false),
      saveRemoteSort: (sortedIds) => api.bookmarks.sort(sortedIds),
      persist: persistCurrentAdminData,
      onSuccess: refreshAdminDataAfterMutation,
      restoreOnError: () => refreshLoggedInData(true),
      onError: (error) => {
        app.bookmarkError = getErrorMessage(error)
      },
    })
  }

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

  const impl: Impl = {
    openCreate: handleOpenCreateBookmark,
    openEdit: handleEditBookmark,
    close: handleCloseBookmarkModal,
    submit: handleSubmitBookmark,
    remove: handleDeleteBookmark,
    batchRemove: handleBatchDeleteBookmarks,
    batchMove: handleBatchMoveBookmarks,
    sort: handleSortBookmarks,
    reorganize: handleReorganizeBookmarks,
    reset: resetBookmarkState,
    bumpIntent: () => { app.editIntent += 1 },
    read: () => ({
      modalOpen: app.bookmarkModalOpen,
      modalMode: app.bookmarkModalMode,
      active: app.activeBookmark,
      reading: false,
      readError: '',
      saving: app.savingBookmark,
      deletingId: app.deletingBookmarkId,
      error: app.bookmarkError,
      editIntent: app.editIntent,
      rootError: app.rootError,
    }),
  }
  w.impl = impl
  return impl
}
