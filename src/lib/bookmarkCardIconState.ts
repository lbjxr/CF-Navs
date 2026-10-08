import type { PublicBookmark } from '../../shared/types'
import { ICON_CACHE_URL_VERSION, createIconVersion } from './bookmarkIconDisplay'
import { iconifyProxyIcon, isIconifyIconUrl, logoSurfIcon } from './icons'
import { withIconAccessKey } from './iconAccessKey'
import { createBookmarkIconCacheKey } from './localBookmarkIconCache'

export type BookmarkCardIconStateInput = {
  bookmark: PublicBookmark
  iconInView: boolean
  cachedIconFailed: boolean
  fallbackFailed: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
  shouldWaitForLocalIconCache?: boolean
  /** 私密对象的短期授权 key；公开对象必须留空，否则会丢掉共享缓存语义。 */
  iconAccessKey?: string
}

export type BookmarkCardIconBaseInput = {
  bookmark: PublicBookmark
  iconInView: boolean
  shouldWaitForLocalIconCache?: boolean
  /** 私密对象非空：key 必须同时作用于代理 URL 与本地预取 URL。 */
  iconAccessKey?: string
}

export type BookmarkCardIconBaseState = {
  iconInView: boolean
  rawIcon: string
  cachedIcon: string
  customTextIcon: string
  iconText: string
  localCacheKey: string
  hasEmbeddedIcon: boolean
  hasProjectedImageIcon: boolean
  hasCachedRemoteIcon: boolean
  iconifyRemoteUrl: string
  canUseRawHttpIconFallback: boolean
  shouldReadLocalIconCache: boolean
  shouldUseIconProxy: boolean
  shouldWaitForLocalIconCache: boolean
  proxiedHttpIconUrl: string
  nextIconStateKey: string
}

export type BookmarkCardIconUrlInput = {
  bookmark: PublicBookmark
  baseState: BookmarkCardIconBaseState
  cachedIconFailed: boolean
  fallbackFailed: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
}

export type BookmarkCardIconUrlState = {
  iconUrl: string
  hasRenderableIcon: boolean
}

export type BookmarkCardIconState = BookmarkCardIconBaseState & BookmarkCardIconUrlState

export function createBookmarkCardIconStateKey(
  bookmark: PublicBookmark,
  iconInView: boolean,
  iconAccessKey = '',
): string {
  // key 参与状态键：续签、过期或清除时必须重置 cachedIconFailed/fallbackFailed 并重新加载，
  // 否则第一次匿名失败态会一直挡住带 key 的真实图标。
  return `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.icon_blob ?? ''}:${Boolean(bookmark.icon_cached)}:${bookmark.icon_display ?? ''}:${bookmark.title}:${bookmark.url}:${bookmark.icon_revision ?? bookmark.icon_write_epoch ?? 0}:${iconInView}:${iconAccessKey}`
}

export function deriveBookmarkCardIconBase(input: BookmarkCardIconBaseInput): BookmarkCardIconBaseState {
  const { bookmark, iconInView, shouldWaitForLocalIconCache = false, iconAccessKey = '' } = input
  const rawIcon = bookmark.icon?.trim() ?? ''
  const cachedIcon = bookmark.icon_blob?.trim() ?? ''
  const customTextIcon =
    rawIcon &&
      bookmark.icon_source !== 'logo_surf' &&
      bookmark.icon_source !== 'iconify' &&
      !isIconifyIconUrl(rawIcon) &&
      !/^data:image\//i.test(rawIcon) &&
      !/^https?:\/\//i.test(rawIcon)
      ? rawIcon
      : ''
  const iconText = customTextIcon || bookmark.title.trim().slice(0, 1) || '书'
  const localCacheKey = createBookmarkIconCacheKey({
    id: bookmark.id,
    icon: rawIcon,
    iconSource: bookmark.icon_source,
  })
  const hasEmbeddedIcon = /^data:image\//i.test(cachedIcon)
  const hasCachedRemoteIcon = Boolean(bookmark.icon_cached) && !hasEmbeddedIcon
  const hasProjectedImageIcon = bookmark.icon_display === 'image' && !rawIcon && !cachedIcon && Number.isInteger(bookmark.id) && bookmark.id > 0
  const iconifyRemoteUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(rawIcon)
      ? iconifyProxyIcon(rawIcon)
      : ''
  const canUseRawHttpIconFallback =
    /^https?:\/\//i.test(rawIcon) &&
    !iconifyRemoteUrl &&
    !customTextIcon
  const shouldReadLocalIconCache =
    iconInView &&
    (canUseRawHttpIconFallback || hasCachedRemoteIcon) &&
    !iconifyRemoteUrl &&
    !hasEmbeddedIcon &&
    !customTextIcon
  // Local snapshots omit image bytes but preserve this display marker. A rollback
  // build has no trusted local copy, so restore those images through the ordinary proxy.
  const shouldUseIconProxy = hasCachedRemoteIcon || hasProjectedImageIcon
  // 私密对象的代理响应是 `private, no-store`，必须带 key 才能拿到真实图标；
  // 公开对象 iconAccessKey 为空，URL 保持匿名以便命中 Worker edge cache，Service Worker 不接管对象代理。
  // Keep the successful uncached path as a direct <img> (no extra request and no
  // CORS dependency). On a direct-image failure the existing bounded recovery can
  // fetch through the object proxy, even before D1 has an icon_blob.
  const canRecoverHttpIcon = canUseRawHttpIconFallback && Number.isInteger(bookmark.id) && bookmark.id > 0
  // Projected snapshots omit source bytes. Content-only edits must still change
  // the edge-cache version; a known revision stays stable across write fences.
  const proxiedHttpIconUrl = shouldUseIconProxy || canRecoverHttpIcon
    ? withIconAccessKey(
      `/api/icon/${encodeURIComponent(String(bookmark.id))}?v=${createIconVersion(`${bookmark.id}:${rawIcon}:${bookmark.title}:${bookmark.url}:${bookmark.icon_revision ?? bookmark.icon_write_epoch ?? 0}`)}&cv=${ICON_CACHE_URL_VERSION}`,
      iconAccessKey,
    )
    : ''

  return {
    iconInView,
    rawIcon,
    cachedIcon,
    customTextIcon,
    iconText,
    localCacheKey,
    hasEmbeddedIcon,
    hasProjectedImageIcon,
    hasCachedRemoteIcon,
    iconifyRemoteUrl,
    canUseRawHttpIconFallback,
    shouldReadLocalIconCache,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
    nextIconStateKey: createBookmarkCardIconStateKey(bookmark, iconInView, iconAccessKey),
  }
}

export function shouldReadBookmarkLocalIconCache(input: BookmarkCardIconBaseInput): boolean {
  return deriveBookmarkCardIconBase(input).shouldReadLocalIconCache
}

export function deriveBookmarkCardIconUrl(input: BookmarkCardIconUrlInput): BookmarkCardIconUrlState {
  const {
    bookmark,
    baseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl = '',
    localCachedIconUrl = '',
    localCachePending = false,
  } = input
  const {
    rawIcon,
    cachedIcon,
    customTextIcon,
    hasEmbeddedIcon,
    iconifyRemoteUrl,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
  } = baseState

  const iconUrl = (() => {
    if (!baseState.iconInView) return ''
    if (!cachedIconFailed && hasEmbeddedIcon) return cachedIcon
    if (bookmark.icon_source === 'logo_surf' && !rawIcon) return logoSurfIcon(bookmark.title, bookmark.url)
    if (bookmark.icon_source === 'logo_surf' && /^data:image\//i.test(rawIcon)) return rawIcon
    if (syncLocalCachedIconUrl) return syncLocalCachedIconUrl
    if (localCachedIconUrl) return localCachedIconUrl
    if (localCachePending && shouldWaitForLocalIconCache) return ''
    if ((!rawIcon && !baseState.shouldUseIconProxy) || customTextIcon) return ''
    if (iconifyRemoteUrl) return iconifyRemoteUrl
    if (/^data:image\//i.test(rawIcon)) return rawIcon
    if (shouldUseIconProxy && !cachedIconFailed) return proxiedHttpIconUrl
    if (baseState.canUseRawHttpIconFallback) return rawIcon
    return ''
  })()

  return {
    iconUrl,
    hasRenderableIcon: Boolean(iconUrl) && !fallbackFailed,
  }
}

export function deriveBookmarkCardIconState(input: BookmarkCardIconStateInput): BookmarkCardIconState {
  const baseState = deriveBookmarkCardIconBase({
    bookmark: input.bookmark,
    iconInView: input.iconInView,
    shouldWaitForLocalIconCache: input.shouldWaitForLocalIconCache,
    iconAccessKey: input.iconAccessKey,
  })
  const urlState = deriveBookmarkCardIconUrl({
    bookmark: input.bookmark,
    baseState,
    cachedIconFailed: input.cachedIconFailed,
    fallbackFailed: input.fallbackFailed,
    syncLocalCachedIconUrl: input.syncLocalCachedIconUrl,
    localCachedIconUrl: input.localCachedIconUrl,
    localCachePending: input.localCachePending,
  })

  return {
    ...baseState,
    ...urlState,
  }
}
