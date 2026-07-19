// 数据导入（覆盖式：清空后重建，保留原始 id 以维持关联）

import { type Bookmark, type Category, type Settings } from '../../../shared/types'
import { ensureSchema } from './schema'
import { settingsPatchStatement } from './settings'
import { chunkImportRows, normalizeImportCategory, normalizeImportBookmark } from './importHelpers'

export async function importData(
  db: D1Database,
  data: { categories: Category[]; bookmarks: Bookmark[]; settings?: Partial<Settings> },
): Promise<{ categories: number; bookmarks: number; importedCategories: Category[]; importedBookmarks: Bookmark[] }> {
  await ensureSchema(db)
  const now = Date.now()
  const stmts: D1PreparedStatement[] = []
  const importedCategories: Category[] = []
  const importedBookmarks: Bookmark[] = []

  // 先清空（顺序：先书签后分类）
  stmts.push(db.prepare('DELETE FROM bookmarks'))
  stmts.push(db.prepare('DELETE FROM categories'))

  for (const c of data.categories) importedCategories.push(normalizeImportCategory(c, now))
  importedCategories.sort((a, b) => Number(a.parent_id != null) - Number(b.parent_id != null) || a.sort - b.sort || a.id - b.id)
  for (const chunk of chunkImportRows(importedCategories, 16)) {
    stmts.push(db.prepare(`INSERT INTO categories (id, parent_id, title, icon, sort, created_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...chunk.flatMap((category) => [category.id, category.parent_id, category.title, category.icon, category.sort, category.created_at])))
  }

  for (const b of data.bookmarks) importedBookmarks.push(normalizeImportBookmark(b, now))
  for (const chunk of chunkImportRows(importedBookmarks, 7)) {
    stmts.push(db.prepare(`INSERT INTO bookmarks (id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, sort, created_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...chunk.flatMap((bookmark) => [bookmark.id, bookmark.category_id, bookmark.title, bookmark.url, bookmark.icon, bookmark.icon_source, bookmark.icon_background_color, bookmark.icon_blob, bookmark.description, bookmark.description_mode ?? null, bookmark.open_method, bookmark.sort, bookmark.created_at])))
  }

  // 设置（仅写入受支持的 key，绝不触碰 admin_* 等内部 key）
  if (data.settings) {
    const settingsStmt = settingsPatchStatement(db, data.settings)
    if (settingsStmt) stmts.push(settingsStmt)
  }

  await db.batch(stmts)
  importedCategories.sort((a, b) => Number(a.parent_id != null) - Number(b.parent_id != null) || (a.parent_id ?? 0) - (b.parent_id ?? 0) || a.sort - b.sort || a.id - b.id)
  importedBookmarks.sort((a, b) => a.sort - b.sort || a.id - b.id)
  return {
    categories: importedCategories.length,
    bookmarks: importedBookmarks.length,
    importedCategories,
    importedBookmarks,
  }
}
