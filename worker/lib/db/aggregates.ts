// 跨表聚合读取：公开首页数据源与后台聚合数据

import {
  type AdminData,
  type Bookmark,
  type Category,
  type PublicBookmark,
  type PublicCategory,
  type Settings,
  type SiteConfig,
} from '../../../shared/types'
import {
  BOOKMARK_AGGREGATE_LIST_SQL,
  CATEGORY_LIST_SQL,
  PRIVATE_BOOKMARK_LIST_SQL,
  PUBLIC_BOOKMARK_LIST_SQL,
  PUBLIC_CATEGORY_LIST_SQL,
  PUBLIC_DATA_SETTINGS_LIST_SQL,
  PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL,
  SETTINGS_LIST_SQL,
} from './sql'
import { withSchemaRetry } from './schema'
import { settingsFromRows } from '../settingsData'

export async function getPublicDataSource(db: D1Database, siteConfig?: SiteConfig, includePrivate = false): Promise<{
  categories: PublicCategory[]
  bookmarks: PublicBookmark[]
  settings: Settings
}> {
  return await withSchemaRetry(db, async () => {
    const settingsSql = siteConfig
      ? PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL
      : PUBLIC_DATA_SETTINGS_LIST_SQL
    const [settingsResult, categoriesResult, bookmarksResult] = await db.batch([
      db.prepare(settingsSql),
      db.prepare(PUBLIC_CATEGORY_LIST_SQL),
      db.prepare(includePrivate ? PRIVATE_BOOKMARK_LIST_SQL : PUBLIC_BOOKMARK_LIST_SQL),
    ])

    const allCategories = (categoriesResult.results ?? []) as PublicCategory[]
    const visibleCategoryIds = includePrivate
      ? null
      : getPublicCategoryIds(allCategories)
    const allBookmarks = (bookmarksResult.results ?? []) as PublicBookmark[]

    return {
      categories: visibleCategoryIds ? allCategories.filter((category) => visibleCategoryIds.has(category.id)) : allCategories,
      bookmarks: visibleCategoryIds ? allBookmarks.filter((bookmark) => visibleCategoryIds.has(bookmark.category_id)) : allBookmarks,
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>, siteConfig),
    }
  })
}

export function getPublicCategoryIds(categories: PublicCategory[]): Set<number> {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const visible = new Set<number>()

  for (const category of categories) {
    let current: PublicCategory | undefined = category
    let hidden = false
    const visited = new Set<number>()
    while (current) {
      if (visited.has(current.id)) {
        hidden = true
        break
      }
      visited.add(current.id)
      if (current.is_private === true || current.is_private === 1) {
        hidden = true
        break
      }
      current = current.parent_id == null ? undefined : byId.get(current.parent_id)
    }
    if (!hidden) visible.add(category.id)
  }

  return visible
}

/**
 * 匿名图标端点的可见性判定。口径必须与 `getPublicCategoryIds` 保持一致：
 * 私密书签自身不可见；公开书签只要挂在私密分类（或私密分类的后代）下同样不可见。
 * 层级规则不在这里重复实现，只消费上面算好的可见集合。
 */
export function isBookmarkIconAnonymouslyVisible(
  bookmark: Pick<Bookmark, 'category_id' | 'is_private'>,
  visibleCategoryIds: Set<number>,
): boolean {
  if (bookmark.is_private === true || bookmark.is_private === 1) return false
  return visibleCategoryIds.has(bookmark.category_id)
}

export async function getAdminData(db: D1Database): Promise<AdminData> {
  return await withSchemaRetry(db, async () => {
    const [categoriesResult, bookmarksResult, settingsResult] = await db.batch([
      db.prepare(CATEGORY_LIST_SQL),
      db.prepare(BOOKMARK_AGGREGATE_LIST_SQL),
      db.prepare(SETTINGS_LIST_SQL),
    ])

    return {
      categories: (categoriesResult.results ?? []) as Category[],
      bookmarks: (bookmarksResult.results ?? []) as Bookmark[],
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>),
    }
  })
}
