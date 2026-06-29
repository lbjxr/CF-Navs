import {
  ErrCode,
  type AdminData,
  type ApiResponse,
  type Bookmark,
  type BookmarkUpsertReq,
  type Category,
  type CategoryUpsertReq,
  type FaviconResp,
  type ImportReq,
  type ImportResp,
  type LoginReq,
  type LoginResp,
  type PublicData,
  type Settings,
  type SettingsUpdateReq,
  type SiteConfig,
  type SortReq,
} from '../../shared/types'

export interface MeResp {
  username: string
}

export interface StoredAuthSession extends LoginResp {}

export interface ApiErrorOptions {
  status?: number
  code?: number
  data?: unknown
  cause?: unknown
}

export class ApiError extends Error {
  status: number
  code: number
  data: unknown

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? ErrCode.SERVER_ERROR
    this.data = options.data ?? null

    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

const AUTH_STORAGE_KEY = 'cf-navs.auth'
const JSON_HEADERS = {
  accept: 'application/json',
  'content-type': 'application/json',
}

let apiBaseUrl = '/api'

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<ApiResponse<T>>
  return typeof candidate.code === 'number' && typeof candidate.msg === 'string' && 'data' in candidate
}

function buildUrl(path: string): string {
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ApiError('Invalid JSON response', {
      status: response.status,
      code: ErrCode.SERVER_ERROR,
      cause: error,
    })
  }
}

function createHeaders(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders)
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json')
  }
  return headers
}

function maybeAttachAuth(headers: Headers): void {
  const token = getAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
}

function normalizeStoredAuthSession(value: unknown): StoredAuthSession | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<StoredAuthSession>
  if (typeof candidate.token !== 'string' || typeof candidate.expires_at !== 'number') {
    return null
  }

  if (candidate.expires_at <= Date.now()) {
    return null
  }

  return {
    token: candidate.token,
    expires_at: candidate.expires_at,
    username: typeof candidate.username === 'string' ? candidate.username : '',
  }
}

export function setApiBaseUrl(baseUrl: string): void {
  apiBaseUrl = baseUrl || '/api'
}

export function getApiBaseUrl(): string {
  return apiBaseUrl
}

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!isBrowser()) {
    return null
  }

  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    const session = normalizeStoredAuthSession(parsed)
    if (!session) {
      clearStoredAuthSession()
    }
    return session
  } catch {
    clearStoredAuthSession()
    return null
  }
}

export function setStoredAuthSession(session: StoredAuthSession): void {
  if (!isBrowser()) {
    return
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredAuthSession(): void {
  if (!isBrowser()) {
    return
  }

  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function getAuthToken(): string | null {
  return getStoredAuthSession()?.token ?? null
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isUnauthorizedError(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.code === ErrCode.UNAUTHORIZED)
}

export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Request failed'
}

export interface RequestOptions extends RequestInit {
  auth?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, headers: initHeaders, ...init } = options
  const headers = createHeaders(initHeaders)

  if (auth) {
    maybeAttachAuth(headers)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers,
    })
  } catch (error) {
    throw new ApiError('Network request failed', {
      status: 0,
      code: ErrCode.SERVER_ERROR,
      cause: error,
    })
  }

  const payload = await parseResponseBody(response)
  const envelope = isApiResponse<T>(payload) ? payload : null

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredAuthSession()
    }

    throw new ApiError(envelope?.msg ?? response.statusText ?? 'Request failed', {
      status: response.status,
      code: envelope?.code ?? response.status,
      data: envelope?.data ?? payload,
    })
  }

  if (!envelope) {
    throw new ApiError('Invalid API response', {
      status: response.status,
      code: ErrCode.SERVER_ERROR,
      data: payload,
    })
  }

  if (envelope.code !== ErrCode.OK) {
    if (auth && envelope.code === ErrCode.UNAUTHORIZED) {
      clearStoredAuthSession()
    }

    throw new ApiError(envelope.msg || 'Request failed', {
      status: response.status,
      code: envelope.code,
      data: envelope.data,
    })
  }

  return envelope.data
}

function jsonRequest<T>(path: string, method: string, body?: unknown, auth = false): Promise<T> {
  return request<T>(path, {
    method,
    auth,
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const configApi = {
  get: () => request<SiteConfig>('/config'),
}

export const publicApi = {
  getData: (auth = false) => request<PublicData>('/public/data', { auth }),
}

export const adminApi = {
  getData: () => request<AdminData>('/admin/data', { auth: true }),
}

export const authApi = {
  login: (payload: LoginReq) => jsonRequest<LoginResp>('/login', 'POST', payload),
  logout: () => jsonRequest<null>('/logout', 'POST', undefined, true),
  me: () => request<MeResp>('/me', { auth: true }),
}

export const categoriesApi = {
  list: () => request<Category[]>('/categories', { auth: true }),
  create: (payload: CategoryUpsertReq) => jsonRequest<Category>('/categories', 'POST', payload, true),
  update: (id: number, payload: CategoryUpsertReq) => jsonRequest<Category>(`/categories/${id}`, 'PUT', payload, true),
  remove: (id: number) => request<null>(`/categories/${id}`, { method: 'DELETE', auth: true }),
  sort: (ids: SortReq['ids']) => jsonRequest<null>('/categories/sort', 'POST', { ids }, true),
}

export const bookmarksApi = {
  list: () => request<Bookmark[]>('/bookmarks', { auth: true }),
  create: (payload: BookmarkUpsertReq) => jsonRequest<Bookmark>('/bookmarks', 'POST', payload, true),
  update: (id: number, payload: BookmarkUpsertReq) => jsonRequest<Bookmark>(`/bookmarks/${id}`, 'PUT', payload, true),
  remove: (id: number) => request<null>(`/bookmarks/${id}`, { method: 'DELETE', auth: true }),
  sort: (ids: SortReq['ids']) => jsonRequest<null>('/bookmarks/sort', 'POST', { ids }, true),
  fetchFavicon: (url: string) => request<FaviconResp>(`/fetch-favicon?url=${encodeURIComponent(url)}`, { auth: true }),
}

export const settingsApi = {
  get: () => request<Settings>('/settings', { auth: true }),
  update: (payload: SettingsUpdateReq) => jsonRequest<Settings>('/settings', 'PUT', payload, true),
}

export const dataApi = {
  importAll: (payload: ImportReq) => jsonRequest<ImportResp>('/import', 'POST', payload, true),
}

export const api = {
  config: configApi,
  public: publicApi,
  admin: adminApi,
  auth: authApi,
  categories: categoriesApi,
  bookmarks: bookmarksApi,
  settings: settingsApi,
  data: dataApi,
}

export default api
