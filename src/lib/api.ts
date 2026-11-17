import { readBoundedBody } from '../../shared/boundedBody'
import type { IconDescriptor } from '../../shared/iconDescriptor'
import {
  ErrCode,
  type AdminData,
  type BatchDeleteBookmarksResp,
  type BatchDeleteCategoriesResp,
  type BookmarkBatchMoveReq,
  type BookmarkBatchMoveResp,
  type BookmarkReorganizeReq,
  type ApiResponse,
  type Bookmark,
  type BookmarkEditData,
  type BookmarkUpsertReq,
  type Category,
  type CategorySortReq,
  type CategoryUpsertReq,
  type ChangePasswordReq,
  type DataVersionResp,
  type FaviconResp,
  type IconAccessResp,
  type IconifySearchResp,
  type ImportReq,
  type ImportResp,
  type InstallReq,
  type InstallStatusResp,
  type LoginReq,
  type LoginResp,
  type LogoutResp,
  type PublicData,
  type RecoverReq,
  type Settings,
  type SettingsUpdateReq,
  type SiteMetaResp,
  type SortReq,
} from '../../shared/types'
import { clearStoredAuthSession, getAuthToken } from './authSession'

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

const JSON_HEADERS = {
  accept: 'application/json',
  'content-type': 'application/json',
}
const NO_CACHE_HEADERS = {
  'cache-control': 'no-cache',
  pragma: 'no-cache',
}

let apiBaseUrl = '/api'

// 写接口在包络上附带本次提交后的 data_version。请求层只负责把它广播出去，
// 由 dataService 判断写后是否还需要整包重拉（接线见 appServices）。
const mutationVersionListeners = new Set<(version: string) => void>()
function notifyMutationDataVersion(version: string): void {
  for (const listener of mutationVersionListeners) listener(version)
}
export function subscribeMutationDataVersion(listener: (version: string) => void): () => void {
  mutationVersionListeners.add(listener)
  return () => { mutationVersionListeners.delete(listener) }
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

async function parseResponseBody(response: Response, maxBytes?: number): Promise<unknown> {
  const bytes = maxBytes ? await readBoundedBody(response.body, maxBytes) : undefined
  if (bytes === null) throw new ApiError('Response exceeds size limit', { status: response.status })
  const text = bytes ? new TextDecoder().decode(bytes) : await response.text()
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

export function setApiBaseUrl(baseUrl: string): void {
  apiBaseUrl = baseUrl || '/api'
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
  maxResponseBytes?: number
  // 后台自动发起的请求应设为 true：用户没主动操作时，不该因为一次 401
  // 就清掉登录态，把手上未保存的表单一起弄丢。
  keepSessionOnUnauthorized?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, keepSessionOnUnauthorized = false, headers: initHeaders, maxResponseBytes, ...init } = options
  const headers = createHeaders(initHeaders)
  const sessionToken = getAuthToken()

  if (auth) {
    maybeAttachAuth(headers)
  }

  let response: Response
  try {
    const requestInit: RequestInit = {
      ...init,
      headers,
    }
    if (auth && requestInit.cache === undefined) {
      requestInit.cache = 'no-store'
    }

    response = await fetch(buildUrl(path), {
      ...requestInit,
    })
  } catch (error) {
    throw new ApiError('Network request failed', {
      status: 0,
      code: ErrCode.SERVER_ERROR,
      cause: error,
    })
  }

  const payload = await parseResponseBody(response, maxResponseBytes)
  const envelope = isApiResponse<T>(payload) ? payload : null

  if (!response.ok) {
    if (response.status === 401 && !keepSessionOnUnauthorized && sessionToken === getAuthToken()) {
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
    if (auth && envelope.code === ErrCode.UNAUTHORIZED && !keepSessionOnUnauthorized && sessionToken === getAuthToken()) {
      clearStoredAuthSession()
    }

    throw new ApiError(envelope.msg || 'Request failed', {
      status: response.status,
      code: envelope.code,
      data: envelope.data,
    })
  }

  if (typeof envelope.data_version === 'string' && envelope.data_version) notifyMutationDataVersion(envelope.data_version)
  return envelope.data
}

function jsonRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  auth = false,
  additionalHeaders?: HeadersInit,
): Promise<T> {
  const headers = new Headers(JSON_HEADERS)
  if (additionalHeaders) {
    new Headers(additionalHeaders).forEach((value, key) => headers.set(key, value))
  }

  return request<T>(path, {
    method,
    auth,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export const installApi = {
  status: () => request<InstallStatusResp>('/install/status', { cache: 'no-store', headers: NO_CACHE_HEADERS }),
  install: (payload: InstallReq, setupToken: string) =>
    jsonRequest<LoginResp>('/install', 'POST', payload, false, { 'X-Setup-Token': setupToken }),
}

export function publicDataPath(version?: string | null): string {
  return version ? `/public/data?v=${encodeURIComponent(version)}` : '/public/data'
}

export const publicApi = {
  // 匿名请求带上已知的 data_version（`?v=`），服务端按版本命中 edge cache，且会忽略匿名
  // 请求的 no-cache 指令，因此匿名请求不再发送 no-cache 头。登录态请求从不读共享缓存。
  getData: (auth = false, version?: string | null) =>
    request<PublicData>(publicDataPath(auth ? null : version), auth
      ? { auth, cache: 'no-store', headers: NO_CACHE_HEADERS, keepSessionOnUnauthorized: true }
      : { cache: 'no-store', keepSessionOnUnauthorized: true }),
  registerClick: (id: number) =>
    request<null>(`/public/bookmarks/${id}/click`, { method: 'POST', keepalive: true }),
}

export const adminApi = {
  getData: (options: Pick<RequestOptions, 'keepSessionOnUnauthorized'> = {}) =>
    request<AdminData>('/admin/data', { auth: true, cache: 'no-store', headers: NO_CACHE_HEADERS, ...options }),
}

export const authApi = {
  login: (payload: LoginReq) => jsonRequest<LoginResp>('/login', 'POST', payload),
  changePassword: (payload: ChangePasswordReq) => jsonRequest<null>('/password', 'POST', payload, true),
  logout: () => jsonRequest<LogoutResp>('/logout', 'POST', undefined, true),
  iconAccess: () => request<IconAccessResp>('/icon-access', { auth: true, cache: 'no-store', keepSessionOnUnauthorized: true }),
  recover: (payload: RecoverReq, setupToken: string) =>
    jsonRequest<LoginResp>('/recover', 'POST', payload, false, { 'X-Setup-Token': setupToken }),
}

export const categoriesApi = {
  create: (payload: CategoryUpsertReq) => jsonRequest<Category>('/categories', 'POST', payload, true),
  update: (id: number, payload: CategoryUpsertReq) => jsonRequest<Category>(`/categories/${id}`, 'PUT', payload, true),
  remove: (id: number) => request<null>(`/categories/${id}`, { method: 'DELETE', auth: true }),
  batchDelete: (ids: number[]) => jsonRequest<BatchDeleteCategoriesResp>('/categories/batch-delete', 'POST', { ids }, true),
  sort: (parentId: CategorySortReq['parent_id'], ids: CategorySortReq['ids']) =>
    jsonRequest<null>('/categories/sort', 'POST', { parent_id: parentId, ids }, true),
}

export const bookmarksApi = {
  getForEdit: (id: number, signal?: AbortSignal) => request<BookmarkEditData>(`/bookmarks/${id}`, {
    auth: true, cache: 'no-store', headers: NO_CACHE_HEADERS, keepSessionOnUnauthorized: true, signal,
  }),
  create: (payload: BookmarkUpsertReq) => jsonRequest<Bookmark>('/bookmarks', 'POST', payload, true),
  update: (id: number, payload: BookmarkUpsertReq) => jsonRequest<Bookmark>(`/bookmarks/${id}`, 'PUT', payload, true),
  refreshIconCache: (id: number) =>
    jsonRequest<{ icon_blob: string | null; icon_descriptor?: IconDescriptor; icon_update?: 'updated' | 'unchanged' | 'cleared' | 'unavailable' }>(`/bookmarks/${id}/icon-cache/refresh`, 'POST', undefined, true),
  remove: (id: number) => request<null>(`/bookmarks/${id}`, { method: 'DELETE', auth: true }),
  batchDelete: (ids: number[]) => jsonRequest<BatchDeleteBookmarksResp>('/bookmarks/batch-delete', 'POST', { ids }, true),
  batchMove: (payload: BookmarkBatchMoveReq) => jsonRequest<BookmarkBatchMoveResp>('/bookmarks/batch-move', 'POST', payload, true),
  sort: (ids: SortReq['ids']) => jsonRequest<null>('/bookmarks/sort', 'POST', { ids }, true),
  reorganize: (category_orders: BookmarkReorganizeReq['category_orders']) =>
    jsonRequest<null>('/bookmarks/reorganize', 'POST', { category_orders }, true),
  checkHealth: (ids: number[]) =>
    jsonRequest<Array<{ id: number; status: number | string; ok: boolean }>>('/bookmarks/check-health', 'POST', { ids }, true),
  fetchFavicon: (url: string) =>
    request<FaviconResp>(`/fetch-favicon?url=${encodeURIComponent(url)}`, {
      auth: true,
      keepSessionOnUnauthorized: true,
    }),
  fetchSiteMeta: (url: string) =>
    request<SiteMetaResp>(`/fetch-site-meta?url=${encodeURIComponent(url)}`, {
      auth: true,
      // 这是失焦时后台自动发起的，不能因为它把用户正在填的表单连同登录态一起清掉。
      keepSessionOnUnauthorized: true,
    }),
}

export const iconifyApi = {
  search: (query: string, signal?: AbortSignal) => request<IconifySearchResp>(
    `/iconify-search?query=${encodeURIComponent(query)}`,
    { auth: true, signal },
  ),
}

export const settingsApi = {
  update: (payload: SettingsUpdateReq) => jsonRequest<Settings>('/settings', 'PUT', payload, true),
}

export const dataApi = {
  version: (auth = false) =>
    request<DataVersionResp>('/data/version', { auth, cache: 'no-store', headers: NO_CACHE_HEADERS, keepSessionOnUnauthorized: true }),
  importAll: (payload: ImportReq) => jsonRequest<ImportResp>('/import', 'POST', payload, true),
}

// 客户端只暴露实际在用的接口。GET /api/config、/api/me、/api/categories、
// /api/bookmarks、/api/settings 这些服务端路由仍然保留（文档化契约 + 冒烟测试在用），
// 只是前端已经改由 /api/admin/data 和 /api/public/data 聚合获取，不再单独调用。
export const api = {
  install: installApi,
  public: publicApi,
  admin: adminApi,
  auth: authApi,
  categories: categoriesApi,
  bookmarks: bookmarksApi,
  iconify: iconifyApi,
  settings: settingsApi,
  data: dataApi,
}

export default api
