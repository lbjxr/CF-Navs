// schema 迁移（幂等，仅缺列时添加）与旧库缺列时的重试封装

function isRecoverableSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('no such column') ||
    normalized.includes('has no column named')
  )
}

export async function withSchemaRetry<T>(db: D1Database, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isRecoverableSchemaError(error)) throw error
    await ensureSchema(db, true)
    return await operation()
  }
}

let _schemaChecked = false

export async function ensureSchema(db: D1Database, force = false): Promise<void> {
  if (_schemaChecked && !force) return
  _schemaChecked = true

  // 判断列是否存在，不存在则 ADD COLUMN（D1/SQLite 允许）
  const { results: bookmarkCols } = await db
    .prepare("PRAGMA table_info(bookmarks)")
    .all<{ name: string }>()
  const { results: categoryCols } = await db
    .prepare("PRAGMA table_info(categories)")
    .all<{ name: string }>()

  const bookmarkColNames = new Set((bookmarkCols ?? []).map((c) => c.name))
  const categoryColNames = new Set((categoryCols ?? []).map((c) => c.name))

  const stmts: D1PreparedStatement[] = []
  if (!bookmarkColNames.has("icon_source")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_source TEXT"))
  }
  if (!bookmarkColNames.has("internal_url")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN internal_url TEXT"))
  }
  if (!bookmarkColNames.has("icon_blob")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_blob TEXT"))
  }
  if (!bookmarkColNames.has("icon_background_color")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_background_color TEXT"))
  }
  if (!bookmarkColNames.has("description_mode")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN description_mode TEXT"))
  }
  if (!bookmarkColNames.has("is_private")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0"))
  }
  if (!bookmarkColNames.has("click_count")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN click_count INTEGER DEFAULT 0"))
  }
  if (!categoryColNames.has("parent_id")) {
    stmts.push(db.prepare("ALTER TABLE categories ADD COLUMN parent_id INTEGER"))
  }
  if (!categoryColNames.has("is_private")) {
    stmts.push(db.prepare("ALTER TABLE categories ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0"))
  }
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_bookmarks_sort_global ON bookmarks(sort, id)"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_categories_sort_id ON categories(sort, id)"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_categories_parent_sort_id ON categories(parent_id, sort, id)"))

  if (stmts.length > 0) await db.batch(stmts)
}
