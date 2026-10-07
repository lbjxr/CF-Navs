import type { PublicCategory } from '../../shared/types'
import { ICON_CACHE_URL_VERSION, createIconVersion } from './bookmarkIconDisplay'
import { iconifyIcon } from './icons'

export type CategoryIconValue = {
  id: PublicCategory['id']
  title: PublicCategory['title']
  icon: PublicCategory['icon']
  icon_blob?: string | null
  icon_display?: 'image' | 'text' | 'empty'
  icon_revision?: string | null
  icon_write_epoch?: number
}

export function normalizeCategoryIcon(value: CategoryIconValue): string {
  return value.icon?.trim() ?? ''
}

export function getCategoryImageIconUrl(value: CategoryIconValue): string {
  const icon = normalizeCategoryIcon(value)
  if (!icon) return value.icon_display === 'image'
    ? `/api/category-icon/${encodeURIComponent(String(value.id))}?v=${createIconVersion(`${value.id}:${value.icon_revision ?? value.icon_write_epoch ?? 0}`)}&cv=${ICON_CACHE_URL_VERSION}`
    : ''
  if (/^data:image\//i.test(icon)) return icon

  const remoteIcon = iconifyIcon(icon) || icon
  if (!/^https?:\/\//i.test(remoteIcon)) return ''

  return `/api/category-icon/${encodeURIComponent(String(value.id))}?v=${createIconVersion(`${value.id}:${remoteIcon}:${value.title}`)}&cv=${ICON_CACHE_URL_VERSION}`
}

export function hasCategoryImageIcon(value: CategoryIconValue): boolean {
  return Boolean(getCategoryImageIconUrl(value))
}

export function getCategoryTextIcon(value: CategoryIconValue): string {
  const icon = normalizeCategoryIcon(value)
  if (!icon || hasCategoryImageIcon(value)) return ''
  return icon
}

export function getCategoryIconFallbackText(value: CategoryIconValue): string {
  const title = value.title.trim()
  return [...title][0] ?? '分'
}

/** Retry addresses are document-scoped to avoid reusing an earlier document's
 * retry address. The Worker ignores retry in edge keys. */
export function createCategoryRetryUrl(source: string, attempt: number, timeOrigin: number): string {
  if (!source.startsWith('/api/category-icon/') || !Number.isSafeInteger(attempt) || attempt < 1 || !Number.isFinite(timeOrigin) || timeOrigin <= 0) throw new Error('Invalid native category retry identity')
  return source + (source.includes('?') ? '&' : '?') + 'retry=' + attempt + '-' + Math.trunc(timeOrigin).toString(36)
}
