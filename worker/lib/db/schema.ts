import { BOOKMARK_ICON_TRIGGERS, CATEGORY_ICON_TRIGGERS, INITIALIZE_ICON_DATASET_SQL } from './iconSchema'

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

const checkedSchemas = new WeakSet<D1Database>()
const pendingSchemas = new WeakMap<D1Database, Promise<void>>()

export async function ensureSchema(db: D1Database, force = false): Promise<void> {
  const pending = pendingSchemas.get(db)
  if (pending) return pending
  if (checkedSchemas.has(db) && !force) return
  const operation = migrateSchema(db)
  pendingSchemas.set(db, operation)
  try {
    await operation
    checkedSchemas.add(db)
  } finally {
    pendingSchemas.delete(db)
  }
}

async function migrateSchema(db: D1Database): Promise<void> {

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
  if (!bookmarkColNames.has("icon_revision")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_revision TEXT"))
  }
  if (!bookmarkColNames.has("icon_write_epoch")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_write_epoch INTEGER NOT NULL DEFAULT 0"))
  }
  if (!bookmarkColNames.has("icon_source")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_source TEXT"))
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
  if (!categoryColNames.has("icon_blob")) stmts.push(db.prepare("ALTER TABLE categories ADD COLUMN icon_blob TEXT"))
  if (!categoryColNames.has("icon_revision")) stmts.push(db.prepare("ALTER TABLE categories ADD COLUMN icon_revision TEXT"))
  if (!categoryColNames.has("icon_write_epoch")) stmts.push(db.prepare("ALTER TABLE categories ADD COLUMN icon_write_epoch INTEGER NOT NULL DEFAULT 0"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_bookmarks_sort_global ON bookmarks(sort, id)"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_categories_sort_id ON categories(sort, id)"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_categories_parent_sort_id ON categories(parent_id, sort, id)"))

  stmts.push(db.prepare(INITIALIZE_ICON_DATASET_SQL), ...BOOKMARK_ICON_TRIGGERS.map((sql) => db.prepare(sql)), ...CATEGORY_ICON_TRIGGERS.map((sql) => db.prepare(sql)))
  await db.batch(stmts)
}
