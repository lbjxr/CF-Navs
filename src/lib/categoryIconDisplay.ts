import type { PublicCategory } from '../../shared/types'
import { createIconVersion } from './bookmarkIconDisplay'

export type CategoryIconValue = {
  id: PublicCategory['id']
  title: PublicCategory['title']
  icon: PublicCategory['icon']
}

export function normalizeCategoryIcon(value: CategoryIconValue): string {
  return value.icon?.trim() ?? ''
}

export function getCategoryImageIconUrl(value: CategoryIconValue): string {
  const icon = normalizeCategoryIcon(value)
  if (!icon) return ''
  if (/^data:image\//i.test(icon)) return icon
  if (!/^https?:\/\//i.test(icon)) return ''

  return `/api/category-icon/${encodeURIComponent(String(value.id))}?v=${createIconVersion(`${value.id}:${icon}:${value.title}`)}`
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
