import { derived, writable, type Readable } from 'svelte/store'
import type {
  AdminData,
  Bookmark,
  Category,
  LoginResp,
  PublicData,
  PublicSettings,
  Settings,
  SiteConfig,
} from '../../shared/types'
import {
  api,
  clearStoredAuthSession,
  getErrorMessage,
  getStoredAuthSession,
  isUnauthorizedError,
  setStoredAuthSession,
  type MeResp,
} from './api'

export interface LoadableState<T> {
  data: T
  loading: boolean
  loaded: boolean
  error: string | null
}

export interface AuthState {
  session: LoginResp | null
  me: MeResp | null
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

function createConfigStore() {
  const { subscribe, set, update } = writable<ConfigState>(createLoadableState<SiteConfig | null>(null))

  async function refresh(): Promise<SiteConfig> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const data = await api.config.get()
      set({ data, loading: false, loaded: true, error: null })
      return data
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
      throw error
    }
  }

  return {
    subscribe,
    refresh,
    reset: () => set(createLoadableState<SiteConfig | null>(null)),
    setData: (data: SiteConfig | null) => set({ data, loading: false, loaded: data !== null, error: null }),
  }
}

function createPublicStore() {
  const { subscribe, set, update } = writable<PublicState>(createLoadableState<PublicData | null>(null))

  async function refresh(): Promise<PublicData> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const data = await api.public.getData()
      set({ data, loading: false, loaded: true, error: null })
      return data
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
      throw error
    }
  }

  return {
    subscribe,
    refresh,
    reset: () => set(createLoadableState<PublicData | null>(null)),
    setData: (data: PublicData | null) => set({ data, loading: false, loaded: data !== null, error: null }),
  }
}

function createAuthStore() {
  const initialSession = getStoredAuthSession()
  const { subscribe, set, update } = writable<AuthState>({
    session: initialSession,
    me: null,
    initialized: false,
    loading: false,
    error: null,
  })

  function applySession(session: LoginResp | null, me: MeResp | null = null): void {
    if (session) {
      setStoredAuthSession(session)
    } else {
      clearStoredAuthSession()
    }

    set({
      session,
      me,
      initialized: true,
      loading: false,
      error: null,
    })
  }

  async function initialize(): Promise<void> {
    const session = getStoredAuthSession()
    if (!session) {
      applySession(null)
      return
    }

    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const me = await api.auth.me()
      set({
        session,
        me,
        initialized: true,
        loading: false,
        error: null,
      })
    } catch (error) {
      if (isUnauthorizedError(error)) {
        applySession(null)
        return
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

  async function login(username: string, password: string): Promise<LoginResp> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const session = await api.auth.login({ username, password })
      setStoredAuthSession(session)
      const me = await api.auth.me()
      set({
        session,
        me,
        initialized: true,
        loading: false,
        error: null,
      })
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

  async function logout(): Promise<void> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      if (getStoredAuthSession()) {
        await api.auth.logout()
      }
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
        throw error
      }
    }

    applySession(null)
  }

  async function refreshMe(): Promise<MeResp | null> {
    const session = getStoredAuthSession()
    if (!session) {
      applySession(null)
      return null
    }

    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const me = await api.auth.me()
      set({
        session,
        me,
        initialized: true,
        loading: false,
        error: null,
      })
      return me
    } catch (error) {
      if (isUnauthorizedError(error)) {
        applySession(null)
        return null
      }

      update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
      throw error
    }
  }

  return {
    subscribe,
    initialize,
    login,
    logout,
    refreshMe,
    setSession: (session: LoginResp | null, me: MeResp | null = null) => applySession(session, me),
    resetError: () => update((state) => ({ ...state, error: null })),
  }
}

function createAdminStore() {
  const { subscribe, set, update } = writable<AdminState>(createLoadableState(defaultAdminData()))

  function handleAdminError(error: unknown): never {
    if (isUnauthorizedError(error)) {
      clearStoredAuthSession()
    }

    throw error
  }

  async function refreshAll(): Promise<AdminData> {
    update((state) => ({ ...state, loading: true, error: null }))

    try {
      const data = await api.admin.getData()
      set({ data, loading: false, loaded: true, error: null })
      return data
    } catch (error) {
      update((state) => ({ ...state, loading: false, error: toErrorMessage(error) }))
      handleAdminError(error)
    }
  }

  async function refreshCategories(): Promise<Category[]> {
    try {
      const categories = await api.categories.list()
      update((state) => ({
        ...state,
        data: { ...state.data, categories },
        loaded: true,
        error: null,
      }))
      return categories
    } catch (error) {
      update((state) => ({ ...state, error: toErrorMessage(error) }))
      handleAdminError(error)
    }
  }

  async function refreshBookmarks(): Promise<Bookmark[]> {
    try {
      const bookmarks = await api.bookmarks.list()
      update((state) => ({
        ...state,
        data: { ...state.data, bookmarks },
        loaded: true,
        error: null,
      }))
      return bookmarks
    } catch (error) {
      update((state) => ({ ...state, error: toErrorMessage(error) }))
      handleAdminError(error)
    }
  }

  async function refreshSettings(): Promise<Settings> {
    try {
      const settings = await api.settings.get()
      update((state) => ({
        ...state,
        data: { ...state.data, settings },
        loaded: true,
        error: null,
      }))
      return settings
    } catch (error) {
      update((state) => ({ ...state, error: toErrorMessage(error) }))
      handleAdminError(error)
    }
  }

  return {
    subscribe,
    refreshAll,
    refreshCategories,
    refreshBookmarks,
    refreshSettings,
    reset: () => set(createLoadableState(defaultAdminData())),
    setCategories: (categories: Category[]) =>
      update((state) => ({ ...state, data: { ...state.data, categories }, loaded: true, error: null })),
    setBookmarks: (bookmarks: Bookmark[]) =>
      update((state) => ({ ...state, data: { ...state.data, bookmarks }, loaded: true, error: null })),
    setSettings: (settings: Settings | null) =>
      update((state) => ({ ...state, data: { ...state.data, settings }, loaded: true, error: null })),
    replaceData: (data: AdminData) => set({ data, loading: false, loaded: true, error: null }),
    clearError: () => update((state) => ({ ...state, error: null })),
  }
}

export const configStore = createConfigStore()
export const publicStore = createPublicStore()
export const authStore = createAuthStore()
export const adminStore = createAdminStore()

export const isAuthenticated: Readable<boolean> = derived(authStore, ($authStore) => Boolean($authStore.session))
export const authToken: Readable<string | null> = derived(authStore, ($authStore) => $authStore.session?.token ?? null)
export const publicCategories: Readable<Category[]> = derived(publicStore, ($publicStore) => $publicStore.data?.categories ?? [])
export const publicBookmarks: Readable<Bookmark[]> = derived(publicStore, ($publicStore) => $publicStore.data?.bookmarks ?? [])
export const publicSettingsStore: Readable<PublicSettings | null> = derived(
  publicStore,
  ($publicStore) => $publicStore.data?.settings ?? null,
)
export const adminCategories: Readable<Category[]> = derived(adminStore, ($adminStore) => $adminStore.data.categories)
export const adminBookmarks: Readable<Bookmark[]> = derived(adminStore, ($adminStore) => $adminStore.data.bookmarks)
export const adminSettings: Readable<Settings | null> = derived(adminStore, ($adminStore) => $adminStore.data.settings)
