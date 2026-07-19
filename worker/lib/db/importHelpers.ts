import type { Bookmark, Category } from '../../../shared/types'
import { normalizeCategoryParentId } from '../../../shared/categoryHierarchy'

// Pure helpers extracted from db/import.ts to enable unit testing
// without D1 database dependencies.

export function normalizeImportCategory(c: Category, now: number): Category {
  return {
    id: c.id,
    parent_id: normalizeCategoryParentId(c.parent_id),
    title: c.title,
    icon: c.icon ?? null,
    sort: Number.isFinite(c.sort) ? c.sort : 0,
    created_at: c.created_at || now,
  }
}

export function normalizeImportBookmark(b: Bookmark, now: number): Bookmark {
  const openMethod = b.open_method === 2 ? 2 : b.open_method === 3 ? 3 : 1
  return {
    id: b.id,
    category_id: b.category_id,
    title: b.title,
    url: b.url,
    icon: b.icon ?? null,
    icon_source: (b as unknown as Record<string, Bookmark['icon_source']>).icon_source ?? null,
    icon_background_color: (b as unknown as Record<string, string | null | undefined>).icon_background_color ?? null,
    icon_blob: (b as unknown as Record<string, string | null | undefined>).icon_blob ?? null,
    description: b.description ?? null,
    description_mode: b.description_mode ?? null,
    open_method: openMethod,
    sort: Number.isFinite(b.sort) ? b.sort : 0,
    created_at: b.created_at || now,
  }
}

export function chunkImportRows<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('chunk size must be positive')
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}
