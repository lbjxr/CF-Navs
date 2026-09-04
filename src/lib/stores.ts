import { derived, writable, type Readable } from 'svelte/store'
import type {
  AdminData,
  Bookmark,
  Category,
  LoginResp,
  LogoutResp,
  PublicData,
  Settings,
  SiteConfig,
} from '../../shared/types'
import {
  authApi,
  clearStoredAuthSession,
  getErrorMessage,
  getStoredAuthSession,
  isUnauthorizedError,
  setStoredAuthSession,
} from './api'

export interface LoadableState<T> {
  data: T
  loading: boolean
  loaded: boolean
  error: string | null
}

export interface AuthState {
  session: LoginResp | null
  initialized: boolean
  loading: boolean
  error: string | null
}

export interface PublicState extends LoadableState<PublicData | null> {}
export interface ConfigState extends LoadableState<SiteConfig | null> {}
export interface AdminState extends LoadableState<AdminData> {}

const defaultAdminData = (): AdminData => ({
  categories: [],
  bookmarks: [],
  settings: null,
})

function createLoadableState<T>(data: T): LoadableState<T> {
  return {
    data,
    loading: false,
    loaded: false,
    error: null,
  }
}

function toErrorMessage(error: unknown): string {
  return getErrorMessage(error)
}

// 这些 store 只负责持有状态。所有取数、版本确认和本地快照编排都在
// src/lib/dataService.ts；不要在这里再长出一套并行的取数路径。
function createConfigStore() {
  const { subscribe, set } = writable<ConfigState>(createLoadableState<SiteConfig | null>(null))

  return {
    subscribe,
    reset: () => set(createLoadableState<SiteConfig | null>(null)),
    setData: (data: SiteConfig | null) => set({ data, loading: false, loaded: data !== null, error: null }),
  }
}

function createPublicStore() {
  const { subscribe, set, update } = writable<PublicState>(createLoadableState<PublicData | null>(null))

  return {
    subscribe,
    reset: () => set(createLoadableState<PublicData | null>(null)),
    setData: (data: PublicData | null) => set({ data, loading: false, loaded: data !== null, error: null }),
    incrementClick: (bookmarkId: number) => {
      update((state) => {
        if (!state.data) return state
        const bookmarks = state.data.bookmarks.map((bm) => {
          if (bm.id === bookmarkId) {
            return { ...bm, click_count: (bm.click_count ?? 0) + 1 }
          }
          return bm
        })
        return { ...state, data: { ...state.data, bookmarks } }
      })
    },
    setDataProgressively: (data: PublicData) => {
      const BATCH_SIZE = 60
      const all = data.bookmarks
      if (all.length <= BATCH_SIZE) {
        set({ data, loading: false, loaded: true, error: null })
        return
      }
      // First batch renders immediately
      set({
        data: { ...data, bookmarks: all.slice(0, BATCH_SIZE) },
        loading: false,
        loaded: true,
        error: null,
      })
      // Schedule remaining batches via microtasks
      let offset = BATCH_SIZE
      const addMore = () => {
        if (offset >= all.length) return
        const end = Math.min(offset + BATCH_SIZE, all.length)
        set({
          data: { ...data, bookmarks: all.slice(0, end) },
          loading: false,
          loaded: true,
          error: null,
        })
        offset = end
        if (offset < all.length) setTimeout(addMore, 0)
      }
      setTimeout(addMore, 16)
    },
  }
}

function createAuthStore() {
  const initialSession = getStoredAuthSession()
  const { subscribe, set, update } = writable<AuthState>({
    session: initialSession,
    initialized: false,
    loading: false,
    error: null,
  })

  function applySession(session: LoginResp | null): void {
    if (session) {
      setStoredAuthSession(session)
    } else {
      clearStoredAuthSession()
    }

    set({
      session,
      initialized: true,
      loading: false,
      error: null,
    })
  }

  async function initialize(): Promise<void> {
    applySession(getStoredAuthSession())
  }

  async function login(username: string, password: string): Promise<LoginResp> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const session = await authApi.login({ username, password })
      applySession(session)
      return session
    } catch (error) {
      if (isUnauthorizedError(error)) {
        clearStoredAuthSession()
      }

      update((state) => ({
        ...state,
        initialized: true,
        loading: false,
        error: toErrorMessage(error),
      }))
      throw error
    }
  }

  // 返回服务端的撤销结果，让调用方能区分「token 真的作废了」和「只清了本地登录态」。
  // 没有本地会话可退、或请求本身失败时返回 null——此时无从判断服务端状态。
  async function logout(): Promise<LogoutResp | null> {
    update((state) => ({ ...state, loading: true, error: null }))

    let result: LogoutResp | null = null

    try {
      if (getStoredAuthSession()) {
        result = await authApi.logout()
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
        throw error
      }
    }

    applySession(null)
    return result
  }

  return {
    subscribe,
    initialize,
    login,
    logout,
    setSession: (session: LoginResp | null) => applySession(session),
    resetError: () => update((state) => ({ ...state, error: null })),
  }
}

function createAdminStore() {
  const { subscribe, set, update } = writable<AdminState>(createLoadableState(defaultAdminData()))

  return {
    subscribe,
    reset: () => set(createLoadableState(defaultAdminData())),
    setCategories: (categories: Category[]) =>
      update((state) => ({ ...state, data: { ...state.data, categories }, loaded: true, error: null })),
    setBookmarks: (bookmarks: Bookmark[]) =>
      update((state) => ({ ...state, data: { ...state.data, bookmarks }, loaded: true, error: null })),
    setSettings: (settings: Settings | null) =>
      update((state) => ({ ...state, data: { ...state.data, settings }, loaded: true, error: null })),
    replaceData: (data: AdminData) => set({ data, loading: false, loaded: true, error: null }),
  }
}

export const configStore = createConfigStore()
export const publicStore = createPublicStore()
export const authStore = createAuthStore()
export const adminStore = createAdminStore()

export const isAuthenticated: Readable<boolean> = derived(authStore, ($authStore) => Boolean($authStore.session))
