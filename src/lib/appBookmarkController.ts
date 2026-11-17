import type {
  AdminData,
  BatchDeleteBookmarksResp,
  Bookmark,
  BookmarkEditData,
  BookmarkBatchMoveReq,
  BookmarkBatchMoveResp,
  BookmarkReorganizeReq,
  BookmarkUpsertReq,
  LoginResp,
} from '../../shared/types'
import { getErrorMessage } from './api'
import { toBookmarkForm, toBookmarkPayload } from './adminFormAdapters'
import type { BookmarkFormValue } from './adminTypes'
import { runAdminMutation } from './appAdminMutation'
import {
  createBatchDeleteConfirmation,
  createDeleteBookmarkConfirmation,
  type ConfirmDialogInput,
} from './appConfirmDialog'
import type { EditIntentCounter } from './appEditIntent'
import { createBookmarkDraft } from './appModalState'
import { createOptimisticSortState, runOptimisticSort } from './appSortQueue'

// 书签的新建 / 编辑 / 提交 / 删除 / 批量删除 / 批量移动 / 排序 / 跨分类整理与表单状态
// （App.svelte 拆分第 7b 步，代码审查三轮第 15 项）。
//
// 与 appCategoryController 同一形态：普通闭包控制器，持有书签编辑框状态，每次赋值后经 `onChange`
// 推送整份快照（不新增 store 订阅）。编辑意图计数器与分类控制器共用同一个注入实例；
// 编辑读取与组件加载并行；显示状态先发布，权威数据就绪前禁止提交。

export interface BookmarkEditorState {
  modalOpen: boolean
  modalMode: 'create' | 'edit'
  active: Partial<BookmarkFormValue> | null
  reading: boolean
  readError: string
  saving: boolean
  deletingId: number | null
  error: string
}

export interface BookmarkControllerDeps {
  onChange: (state: BookmarkEditorState) => void
  editIntent: EditIntentCounter
  api: {
    bookmarks: {
      create: (payload: BookmarkUpsertReq) => Promise<Bookmark>
      update: (id: number, payload: BookmarkUpsertReq) => Promise<Bookmark>
      remove: (id: number) => Promise<unknown>
      batchDelete: (ids: number[]) => Promise<BatchDeleteBookmarksResp>
      batchMove: (payload: BookmarkBatchMoveReq) => Promise<BookmarkBatchMoveResp>
      sort: (ids: number[]) => Promise<unknown>
      reorganize: (categoryOrders: BookmarkReorganizeReq['category_orders']) => Promise<unknown>
    }
  }
  /** 当前登录会话（`get(authStore).session`），按引用比较判断提交 / 编辑是否仍属于发起时的会话。 */
  getSession: () => LoginResp | null
  /** `get(adminStore).data`：新建时没有指定分类则落到第一个分类。 */
  readAdminData: () => Pick<AdminData, 'categories'>
  isLoggedIn: () => boolean
  openLogin: () => Promise<void>
  ensureLoggedInDataLoaded: () => Promise<boolean>
  ensureLazyComponent: (name: 'BookmarkEditModal') => Promise<unknown>
  readBookmarkForEdit: (bookmarkId: number, signal: AbortSignal) => Promise<BookmarkEditData | null>
  requestConfirmation: (input: ConfirmDialogInput) => Promise<boolean>
  applyLocalBookmarkUpsert: (bookmark: Bookmark) => Promise<void>
  applyLocalBookmarkDelete: (bookmarkId: number) => Promise<void>
  applyLocalBookmarkSort: (ids: number[], refreshMissing?: boolean) => Promise<void>
  refreshBookmarkIconCacheInBackground: (bookmarkId: number) => void
  persistCurrentAdminData: () => Promise<void>
  refreshAdminDataAfterMutation: () => Promise<void>
  /** 写入结果已用服务端返回值应用到本地之后调用：只确认版本，期间有别的写入才整包重拉。 */
  confirmAdminDataAfterLocalMutation: () => Promise<void>
  refreshLoggedInData: (force?: boolean) => Promise<void>
  setRootError: (message: string) => void
}

export interface BookmarkController {
  getState: () => BookmarkEditorState
  /** 关闭并清空书签编辑框（同时推进编辑意图）；登出 / 改密时也会调用。 */
  reset: () => void
  openCreate: (categoryId?: string | number, initialUrl?: string) => Promise<void>
  openEdit: (bookmark: { id: string | number }) => Promise<void>
  retryEdit: () => Promise<void>
  destroy: () => void
  close: () => Promise<void>
  submit: (form: BookmarkFormValue) => Promise<void>
  remove: (bookmark: { id: string | number; title: string }) => Promise<void>
  batchRemove: (ids: number[]) => Promise<void>
  /** 失败时设置错误并把原始错误重新抛给调用方（批量移动面板据此保留选择）。 */
  batchMove: (payload: BookmarkBatchMoveReq) => Promise<void>
  sort: (ids: Array<string | number>) => Promise<void>
  /** 跨分类整理（全量提交）：失败时先回滚到服务端数据再抛出原始错误，由首页展示。 */
  reorganize: (categoryOrders: BookmarkReorganizeReq['category_orders']) => Promise<void>
}

export function createBookmarkController(deps: BookmarkControllerDeps): BookmarkController {
  const { editIntent } = deps
  let modalOpen = false
  let modalMode: 'create' | 'edit' = 'create'
  let active: Partial<BookmarkFormValue> | null = null
  let reading = false
  let readError = ''
  let editingId: number | null = null
  let readIntent: number | null = null
  let readAbort: AbortController | null = null
  let saving = false
  let deletingId: number | null = null
  let error = ''
  const sortState = createOptimisticSortState()

  function getState(): BookmarkEditorState {
    return { modalOpen, modalMode, active, reading, readError, saving, deletingId, error }
  }

  function emit(): void {
    deps.onChange(getState())
  }

  function reset(): void {
    editIntent.next()
    clearEditRead()
    modalOpen = false
    modalMode = 'create'
    active = null
    error = ''
    saving = false
    emit()
  }

  function clearEditRead(): void {
    readAbort?.abort()
    readAbort = null
    readIntent = null
    editingId = null
    reading = false
    readError = ''
  }

  const stopEditIntent = editIntent.subscribe((intent) => {
    if (readIntent === null || readIntent === intent) return
    clearEditRead()
    modalOpen = false
    active = null
    emit()
  })

  async function openCreate(categoryId?: string | number, initialUrl = ''): Promise<void> {
    editIntent.next()
    if (!deps.isLoggedIn()) {
      await deps.openLogin()
      return
    }

    error = ''
    emit()
    if (!await deps.ensureLoggedInDataLoaded()) {
      return
    }
    const fallbackCategoryId = categoryId ?? deps.readAdminData().categories[0]?.id
    await deps.ensureLazyComponent('BookmarkEditModal')
    modalMode = 'create'
    active = createBookmarkDraft(fallbackCategoryId, initialUrl)
    modalOpen = true
    emit()
  }

  async function openEdit(bookmark: { id: string | number }): Promise<void> {
    const intent = editIntent.next()
    const editSession = deps.getSession()
    if (!deps.isLoggedIn()) {
      await deps.openLogin()
      return
    }
    const bookmarkId = Number(bookmark.id)
    const abort = new AbortController()
    readAbort = abort
    readIntent = intent
    editingId = bookmarkId
    modalMode = 'edit'
    active = null
    modalOpen = true
    reading = true
    readError = ''
    error = ''
    emit()
    const isCurrent = () => intent === editIntent.current() && deps.getSession() === editSession && deps.isLoggedIn()
    const timeout = setTimeout(() => abort.abort(new Error('读取书签超时，请重试。')), 10_000)
    let stopAbortWait = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(abort.signal.reason)
      abort.signal.addEventListener('abort', onAbort, { once: true })
      stopAbortWait = () => abort.signal.removeEventListener('abort', onAbort)
    })
    try {
      const ready = Promise.all([
        deps.readBookmarkForEdit(bookmarkId, abort.signal),
        deps.ensureLazyComponent('BookmarkEditModal'),
      ])
      const [current] = await Promise.race([ready, cancelled])
      if (!isCurrent()) return
      if (!current) throw new Error('书签已不存在，请刷新后重试。')
      if (current.id !== bookmarkId) throw new Error('书签数据不匹配，请重试。')
      active = toBookmarkForm(current)
      reading = false
      readIntent = null
      emit()
    } catch (caught) {
      const failure = abort.signal.aborted ? abort.signal.reason : caught
      abort.abort()
      if (!isCurrent()) return
      reading = false
      readError = `无法读取书签的原始编辑数据：${getErrorMessage(failure)} 请重试或取消。`
      emit()
    } finally {
      clearTimeout(timeout)
      stopAbortWait()
      if (readAbort === abort) readAbort = null
      if (intent === editIntent.current() && !isCurrent()) {
        clearEditRead()
        modalOpen = false
        active = null
        emit()
      }
    }
  }

  async function submit(form: BookmarkFormValue): Promise<void> {
    if (reading || readError) return
    // 同分类提交：意图只看表单，reset() 之后 mode 已经变回 'create'。
    const isEdit = form.id != null
    const submitSession = deps.getSession()
    const isCurrent = () => submitSession !== null && deps.getSession() === submitSession
    saving = true
    error = ''
    emit()

    await runAdminMutation({
      isCurrent,
      run: () =>
        isEdit
          ? deps.api.bookmarks.update(Number(form.id), toBookmarkPayload(form))
          : deps.api.bookmarks.create(toBookmarkPayload(form)),
      onSuccess: async (bookmark) => {
        reset()
        await deps.applyLocalBookmarkUpsert(bookmark)
        if (!isCurrent()) return
        await deps.confirmAdminDataAfterLocalMutation()
        if (isCurrent()) deps.refreshBookmarkIconCacheInBackground(bookmark.id)
      },
      successMessage: (bookmark) =>
        isEdit ? `书签「${bookmark.title}」已更新` : `书签「${bookmark.title}」已创建`,
      onError: (message) => {
        error = message
        emit()
      },
      onSettled: () => {
        saving = false
        emit()
      },
    })
  }

  async function deleteBookmark(bookmark: { id: string | number; title: string }): Promise<void> {
    const confirmed = await deps.requestConfirmation(createDeleteBookmarkConfirmation(bookmark.title))
    if (!confirmed) return

    const bookmarkId = Number(bookmark.id)
    deletingId = bookmarkId
    error = ''
    emit()

    await runAdminMutation({
      run: () => deps.api.bookmarks.remove(bookmarkId),
      onSuccess: async () => {
        reset()
        await deps.applyLocalBookmarkDelete(bookmarkId)
        await deps.confirmAdminDataAfterLocalMutation()
      },
      successMessage: () => `书签「${bookmark.title}」已删除`,
      onError: (message) => {
        error = message
        emit()
      },
      onSettled: () => {
        deletingId = null
        emit()
      },
    })
  }

  async function batchRemove(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    if (!await deps.requestConfirmation(createBatchDeleteConfirmation('bookmark', ids.length))) return

    await runAdminMutation({
      run: () => deps.api.bookmarks.batchDelete(ids),
      onSuccess: async (result) => {
        if (result.deleted > 0) await deps.refreshAdminDataAfterMutation()
      },
      successMessage: (result) => `已删除 ${result.deleted} 个书签`,
      onError: (message) => {
        error = message
        emit()
      },
    })
  }

  async function batchMove(payload: BookmarkBatchMoveReq): Promise<void> {
    error = ''
    emit()

    await runAdminMutation({
      run: () => deps.api.bookmarks.batchMove(payload),
      onSuccess: () => deps.refreshAdminDataAfterMutation(),
      successMessage: (result) => `已移动 ${result.moved} 个书签`,
      onError: (message) => {
        error = message
        emit()
      },
      rethrow: true,
    })
  }

  async function sort(ids: Array<string | number>): Promise<void> {
    error = ''
    emit()

    await runOptimisticSort(sortState, ids, {
      applyLocalSort: (sortedIds) => deps.applyLocalBookmarkSort(sortedIds, false),
      saveRemoteSort: (sortedIds) => deps.api.bookmarks.sort(sortedIds),
      persist: deps.persistCurrentAdminData,
      onSuccess: deps.confirmAdminDataAfterLocalMutation,
      restoreOnError: () => deps.refreshLoggedInData(true),
      onError: (caught) => {
        error = getErrorMessage(caught)
        emit()
      },
    })
  }

  async function reorganize(categoryOrders: BookmarkReorganizeReq['category_orders']): Promise<void> {
    try {
      await deps.api.bookmarks.reorganize(categoryOrders)
    } catch (caught) {
      await deps.refreshLoggedInData(true)
      throw caught
    }
    await deps.refreshAdminDataAfterMutation()
  }

  return {
    getState,
    reset,
    openCreate,
    openEdit,
    async retryEdit() {
      if (modalOpen && modalMode === 'edit' && editingId !== null && !reading && !saving && deletingId === null) {
        await openEdit({ id: editingId })
      }
    },
    destroy() {
      stopEditIntent()
      reset()
    },
    async close() {
      reset()
    },
    submit,
    remove: deleteBookmark,
    batchRemove,
    batchMove,
    sort,
    reorganize,
  }
}
