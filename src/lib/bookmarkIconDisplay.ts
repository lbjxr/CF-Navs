import { iconifyProxyIcon, isIconifyIconUrl } from './icons'

type BookmarkIconLike = {
  id: string | number
  title: string
  url: string
  icon?: string | null
  icon_blob?: string | null
  icon_display?: 'image' | 'text' | 'empty'
  icon_cached?: boolean | number | null
  icon_source?: string | null
  icon_revision?: string | null
  icon_write_epoch?: number
}

export type IconStyleOptions = {
  compact?: boolean
  customBackground?: string
}


// 公开图标的浏览器 HTTP cache 无法被服务端远程撤回。发布缓存策略变更时递增该值，
// 让新构建使用新 URL，不复用旧的 max-age 长缓存；edge key 仍由 Worker 的 ns 归一化管理。
export const ICON_CACHE_URL_VERSION = '4'
export function createIconVersion(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
  }
  return Math.abs(hash).toString(36)
}

function iconRadiusFor(size: number): number {
  return Math.round(Math.max(9, Math.min(16, size * 0.22)))
}

function iconPaddingFor(size: number, compact = false): number {
  const ratio = compact ? 0.12 : 0.15
  return Math.round(Math.max(compact ? 5 : 6, Math.min(compact ? 12 : 10, size * ratio)))
}

function iconFontSizeFor(size: number): number {
  return Math.round(Math.max(18, Math.min(32, size * 0.42)))
}

export function buildIconStyle(size: number, options: IconStyleOptions = {}): string {
  const radius = iconRadiusFor(size)
  const imageRadius = Math.max(5, radius - 4)
  return [
    `width: ${size}px;`,
    `height: ${size}px;`,
    'max-width: 100%;',
    `--bookmark-icon-radius: ${radius}px;`,
    `--bookmark-icon-image-radius: ${imageRadius}px;`,
    `--bookmark-icon-padding: ${iconPaddingFor(size, options.compact)}px;`,
    `--bookmark-icon-font-size: ${iconFontSizeFor(size)}px;`,
    options.customBackground ? `background: ${options.customBackground};` : '',
  ].join(' ')
}

export function getBookmarkIconUrl(bookmark: BookmarkIconLike): string {
  const icon = bookmark.icon ?? ''
  const cachedIcon = bookmark.icon_blob ?? ''
  if (/^data:image\//i.test(cachedIcon)) return cachedIcon

  const iconifyUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(icon)
      ? iconifyProxyIcon(icon)
      : ''
  if (iconifyUrl) return iconifyUrl
  if (/^data:image\//i.test(icon)) return icon
  if (/^https?:\/\//i.test(icon)) {
    return bookmark.icon_cached
      ? `/api/icon/${bookmark.id}?v=${createIconVersion(`${bookmark.id}:${icon}:${bookmark.title}:${bookmark.url}:${bookmark.icon_revision ?? bookmark.icon_write_epoch ?? 0}`)}&cv=${ICON_CACHE_URL_VERSION}`
      : icon
  }
  if (bookmark.icon_cached || bookmark.icon_display === 'image') {
    return `/api/icon/${bookmark.id}?v=${createIconVersion(`${bookmark.id}:${bookmark.title}:${bookmark.url}:cached:${bookmark.icon_revision ?? bookmark.icon_write_epoch ?? 0}`)}&cv=${ICON_CACHE_URL_VERSION}`
  }
  return icon
}

export function hasBookmarkImageIcon(bookmark: BookmarkIconLike): boolean {
  if (bookmark.icon_display === 'image') return true
  if (bookmark.icon_display === 'empty' || bookmark.icon_display === 'text') return false
  const icon = bookmark.icon ?? ''
  const cachedIcon = bookmark.icon_blob ?? ''
  return Boolean(
    getBookmarkIconUrl(bookmark) &&
    (
      /^data:image\//i.test(cachedIcon) ||
      /^data:image\//i.test(icon) ||
      /^https?:\/\//i.test(icon) ||
      Boolean(bookmark.icon_cached) ||
      bookmark.icon_source === 'iconify' ||
      isIconifyIconUrl(icon)
    ),
  )
}

export function getBookmarkFallbackIcon(bookmark: BookmarkIconLike, fallback = '\uD83D\uDD16'): string {
  const icon = bookmark.icon ?? ''
  if (/^https?:\/\//i.test(icon) || /^data:image\//i.test(icon) || isIconifyIconUrl(icon)) {
    return fallback
  }
  return icon || fallback
}
