import type { PublicBookmark } from '../../shared/types'
import { createIconVersion } from './bookmarkIconDisplay'
import { iconifyProxyIcon, isIconifyIconUrl, logoSurfIcon } from './icons'
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
}

export type BookmarkCardIconBaseInput = {
  bookmark: PublicBookmark
  iconInView: boolean
  shouldWaitForLocalIconCache?: boolean
}

export type BookmarkCardIconBaseState = {
  iconInView: boolean
  rawIcon: string
  cachedIcon: string
  customTextIcon: string
  iconText: string
  localCacheKey: string
  hasEmbeddedIcon: boolean
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

export function createBookmarkCardIconStateKey(bookmark: PublicBookmark, iconInView: boolean): string {
  return `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.icon_blob ?? ''}:${bookmark.title}:${bookmark.url}:${iconInView}`
}

export function deriveBookmarkCardIconBase(input: BookmarkCardIconBaseInput): BookmarkCardIconBaseState {
  const { bookmark, iconInView, shouldWaitForLocalIconCache = false } = input
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
  const iconifyRemoteUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(rawIcon)
      ? iconifyProxyIcon(rawIcon)
      : ''
  const canUseRawHttpIconFallback =
    /^https?:\/\//i.test(rawIcon) &&
    !iconifyRemoteUrl &&
    bookmark.icon_source !== 'logo_surf' &&
    !customTextIcon
  const shouldReadLocalIconCache =
    iconInView &&
    Boolean(rawIcon) &&
    !iconifyRemoteUrl &&
    !hasEmbeddedIcon &&
    bookmark.icon_source !== 'logo_surf' &&
    !customTextIcon
  const shouldUseIconProxy = canUseRawHttpIconFallback || hasCachedRemoteIcon
  const proxiedHttpIconUrl = shouldUseIconProxy
    ? `/api/icon/${encodeURIComponent(String(bookmark.id))}?v=${createIconVersion(`${bookmark.id}:${rawIcon}:${bookmark.title}:${bookmark.url}`)}`
    : ''

  return {
    iconInView,
    rawIcon,
    cachedIcon,
    customTextIcon,
    iconText,
    localCacheKey,
    hasEmbeddedIcon,
    hasCachedRemoteIcon,
    iconifyRemoteUrl,
    canUseRawHttpIconFallback,
    shouldReadLocalIconCache,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
    nextIconStateKey: createBookmarkCardIconStateKey(bookmark, iconInView),
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
    hasCachedRemoteIcon,
    iconifyRemoteUrl,
    shouldUseIconProxy,
    shouldWaitForLocalIconCache,
    proxiedHttpIconUrl,
  } = baseState

  const iconUrl = (() => {
    if (!baseState.iconInView) return ''
    if (bookmark.icon_source === 'logo_surf') return bookmark.icon || logoSurfIcon(bookmark.title, bookmark.url)
    if (!cachedIconFailed && hasEmbeddedIcon) return cachedIcon
    if (syncLocalCachedIconUrl) return syncLocalCachedIconUrl
    if (localCachedIconUrl) return localCachedIconUrl
    if (localCachePending && shouldWaitForLocalIconCache) return ''
    if ((!rawIcon && !hasCachedRemoteIcon) || customTextIcon) return ''
    if (iconifyRemoteUrl) return iconifyRemoteUrl
    if (/^data:image\//i.test(rawIcon)) return rawIcon
    if (shouldUseIconProxy) return proxiedHttpIconUrl
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
