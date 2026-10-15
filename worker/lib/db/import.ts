// 数据导入（覆盖式：清空后重建，保留原始 id 以维持关联）

import { type Bookmark, type Category, type Settings } from '../../../shared/types'
import { ensureSchema } from './schema'
import { REPLACE_ICON_DATASET_SQL } from './iconSchema'
import { settingsPatchStatement } from './settings'
import { chunkImportRows, normalizeImportBookmark, normalizeImportCategory, remapImportRecords } from './importHelpers'

// D1 单条预处理语句最多绑定 100 个参数；分类导入每行绑定 9 个参数，
// 因此最多 11 行（99 参数），为新增列保留上限内余量。
export const CATEGORY_IMPORT_CHUNK_SIZE = 11

// D1 对单次 batch 的请求体/语句数有实际上限：20000 书签 ≈ 3000 条语句的
// 单 batch 可能失败。按 ≤200 条语句拆成多个顺序 batch 依次提交。
// 注意这改变了失败语义：不再是单事务原子提交，中途失败会留下部分写入；
// POST /api/import 会返回 500，管理员可用同一份备份文件重新导入恢复。
const IMPORT_BATCH_STATEMENT_LIMIT = 200

async function runImportBatches(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < stmts.length; index += IMPORT_BATCH_STATEMENT_LIMIT) {
    await db.batch(stmts.slice(index, index + IMPORT_BATCH_STATEMENT_LIMIT))
  }
}

export interface ImportOptions {
  // 增量模式：只 INSERT 传入的行（调用方保证 id 为最终值且不与现存行冲突），
  // 跳过 DELETE 全清和图标 epoch 重置。用于 merge 模式。
  incremental?: boolean
}

export async function importData(
  db: D1Database,
  data: { categories: Category[]; bookmarks: Bookmark[]; settings?: Partial<Settings> },
  options?: ImportOptions,
): Promise<{ categories: number; bookmarks: number; importedCategories: Category[]; importedBookmarks: Bookmark[] }> {
  await ensureSchema(db)
  const now = Date.now()
  const incremental = options?.incremental === true
  const stmts: D1PreparedStatement[] = incremental
    ? []
    : [
        db.prepare(REPLACE_ICON_DATASET_SQL),
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('data_version', json_quote(lower(hex(randomblob(16)))))"),
      ]

  let importedCategories: Category[]
  let importedBookmarks: Bookmark[]
  if (incremental) {
    // id 已是最终值：只做规范化，不重排 id。
    importedCategories = data.categories.map((category) => normalizeImportCategory(category, now))
    importedBookmarks = data.bookmarks.map((bookmark) => normalizeImportBookmark(bookmark, now))
  } else {
    const remapped = remapImportRecords(data.categories, data.bookmarks, now)
    importedCategories = remapped.categories
    importedBookmarks = remapped.bookmarks
    // 先清空（顺序：先书签后分类）
    stmts.push(db.prepare('DELETE FROM bookmarks'))
    stmts.push(db.prepare('DELETE FROM categories'))
  }

  for (const chunk of chunkImportRows(importedCategories, CATEGORY_IMPORT_CHUNK_SIZE)) {
    stmts.push(db.prepare(`INSERT INTO categories (id, parent_id, title, icon, icon_blob, icon_revision, is_private, sort, created_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...chunk.flatMap((category) => [category.id, category.parent_id, category.title, category.icon, category.icon_blob ?? null, category.icon_revision ?? null, category.is_private === true || category.is_private === 1 ? 1 : 0, category.sort, category.created_at])))
  }

  // 书签每行 15 个参数，每条语句最多 6 行（90 参数）。
  for (const chunk of chunkImportRows(importedBookmarks, 6)) {
    stmts.push(db.prepare(`INSERT INTO bookmarks (id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, description_mode, open_method, is_private, sort, click_count, created_at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`)
      .bind(...chunk.flatMap((bookmark) => [bookmark.id, bookmark.category_id, bookmark.title, bookmark.url, bookmark.icon, bookmark.icon_source, bookmark.icon_background_color, bookmark.icon_blob, bookmark.description, bookmark.description_mode ?? null, bookmark.open_method, bookmark.is_private === true || bookmark.is_private === 1 ? 1 : 0, bookmark.sort, bookmark.click_count ?? 0, bookmark.created_at])))
  }

  // 设置（仅写入受支持的 key，绝不触碰 admin_* 等内部 key）
  if (data.settings) {
    const settingsStmt = settingsPatchStatement(db, data.settings)
    if (settingsStmt) stmts.push(settingsStmt)
  }

  if (incremental) {
    // 增量模式也 touch data_version，保证缓存失效语义与全量一致。
    stmts.push(db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('data_version', json_quote(lower(hex(randomblob(16)))))"))
  }

  await runImportBatches(db, stmts)
  importedCategories.sort((a, b) => Number(a.parent_id != null) - Number(b.parent_id != null) || (a.parent_id ?? 0) - (b.parent_id ?? 0) || a.sort - b.sort || a.id - b.id)
  importedBookmarks.sort((a, b) => a.sort - b.sort || a.id - b.id)
  return {
    categories: importedCategories.length,
    bookmarks: importedBookmarks.length,
    importedCategories,
    importedBookmarks,
  }
}
