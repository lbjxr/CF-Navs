// D1 查询封装：分类/书签 CRUD、批量排序、settings 聚合读取与部分更新

import type {
  Bookmark,
  Category,
  BookmarkUpsertReq,
  CategoryUpsertReq,
  Settings,
} from '../../shared/types'

// ========== settings 默认值（与 schema.sql 的默认设置保持一致） ==========
// 用于在某个 key 缺失时回退，确保聚合出的 Settings 字段完整。
const DEFAULT_SETTINGS: Settings = {
  site_title: 'CF-Navs',
  site_title_color: '#ffffff',
  site_title_font_size: 32,
  public_mode: true,
  theme: 'auto',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  custom_css: '',
  custom_js: '',
  image_host_url: '',
  search_engine: {
    current: 'Google',
    engines: [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
    ],
  },
  card_size: { width: 200, height: 0 }, // Sun-Panel 标准值
  card_style: 'info',
  card_icon_size: 70,
  card_show_description: true,
  card_background_color: '#ffffff',
  card_background_opacity: 0.9,
}

// Settings 中属于强类型聚合视图的 key（不含 admin_* 等内部 key）
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]

// ========== 分类 ==========

export async function listCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare('SELECT id, title, icon, sort, created_at FROM categories ORDER BY sort ASC, id ASC')
    .all<Category>()
  return results ?? []
}

export async function getCategory(db: D1Database, id: number): Promise<Category | null> {
  return await db
    .prepare('SELECT id, title, icon, sort, created_at FROM categories WHERE id = ?')
    .bind(id)
    .first<Category>()
}

export async function createCategory(db: D1Database, req: CategoryUpsertReq): Promise<Category> {
  const now = Date.now()
  // 新分类排到末尾
  const maxRow = await db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM categories').first<{ m: number }>()
  const sort = (maxRow?.m ?? -1) + 1
  const res = await db
    .prepare('INSERT INTO categories (title, icon, sort, created_at) VALUES (?, ?, ?, ?)')
    .bind(req.title, req.icon ?? null, sort, now)
    .run()
  const id = Number(res.meta.last_row_id)
  return { id, title: req.title, icon: req.icon ?? null, sort, created_at: now }
}

export async function updateCategory(
  db: D1Database,
  id: number,
  req: CategoryUpsertReq,
): Promise<Category | null> {
  const existing = await getCategory(db, id)
  if (!existing) return null
  await db
    .prepare('UPDATE categories SET title = ?, icon = ? WHERE id = ?')
    .bind(req.title, req.icon ?? null, id)
    .run()
  return { ...existing, title: req.title, icon: req.icon ?? null }
}

export async function deleteCategory(db: D1Database, id: number): Promise<boolean> {
  const existing = await getCategory(db, id)
  if (!existing) return false
  // 显式级联删书签（不依赖 PRAGMA foreign_keys，D1 默认未必开启外键）
  await db.batch([
    db.prepare('DELETE FROM bookmarks WHERE category_id = ?').bind(id),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
  return true
}

// 批量排序：按 ids 下标写 sort，单次 batch 提交
export async function sortCategories(db: D1Database, ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const stmts = ids.map((id, i) =>
    db.prepare('UPDATE categories SET sort = ? WHERE id = ?').bind(i, id),
  )
  await db.batch(stmts)
}

// ========== 书签 ==========

export async function listBookmarks(db: D1Database): Promise<Bookmark[]> {
  const { results } = await db
    .prepare(
      'SELECT id, category_id, title, url, icon, icon_source, description, open_method, sort, created_at FROM bookmarks ORDER BY sort ASC, id ASC',
    )
    .all<Bookmark>()
  return results ?? []
}

export async function getBookmark(db: D1Database, id: number): Promise<Bookmark | null> {
  return await db
    .prepare(
      'SELECT id, category_id, title, url, icon, icon_source, description, open_method, sort, created_at FROM bookmarks WHERE id = ?',
    )
    .bind(id)
    .first<Bookmark>()
}

export async function createBookmark(db: D1Database, req: BookmarkUpsertReq): Promise<Bookmark> {
  const now = Date.now()
  const open_method: 1 | 2 = req.open_method === 2 ? 2 : 1
  // 新书签排到所属分类末尾
  const maxRow = await db
    .prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM bookmarks WHERE category_id = ?')
    .bind(req.category_id)
    .first<{ m: number }>()
  const sort = (maxRow?.m ?? -1) + 1
  const res = await db
    .prepare(
      'INSERT INTO bookmarks (category_id, title, url, icon, icon_source, description, open_method, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      req.category_id,
      req.title,
      req.url,
      req.icon ?? null,
      req.icon_source ?? null,
      req.description ?? null,
      open_method,
      sort,
      now,
    )
    .run()
  const id = Number(res.meta.last_row_id)
  return {
    id,
    category_id: req.category_id,
    title: req.title,
    url: req.url,
    icon: req.icon ?? null,
    icon_source: req.icon_source ?? null,
    description: req.description ?? null,
    open_method,
    sort,
    created_at: now,
  }
}

export async function updateBookmark(
  db: D1Database,
  id: number,
  req: BookmarkUpsertReq,
): Promise<Bookmark | null> {
  const existing = await getBookmark(db, id)
  if (!existing) return null
  const open_method: 1 | 2 = req.open_method === 2 ? 2 : req.open_method === 1 ? 1 : existing.open_method
  await db
    .prepare(
      'UPDATE bookmarks SET category_id = ?, title = ?, url = ?, icon = ?, icon_source = ?, description = ?, open_method = ? WHERE id = ?',
    )
    .bind(
      req.category_id,
      req.title,
      req.url,
      req.icon ?? null,
      req.icon_source ?? null,
      req.description ?? null,
      open_method,
      id,
    )
    .run()
  return {
    ...existing,
    category_id: req.category_id,
    title: req.title,
    url: req.url,
    icon: req.icon ?? null,
    icon_source: req.icon_source ?? null,
    description: req.description ?? null,
    open_method,
  }
}

export async function deleteBookmark(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run()
  return (res.meta.changes ?? 0) > 0
}

export async function sortBookmarks(db: D1Database, ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const stmts = ids.map((id, i) =>
    db.prepare('UPDATE bookmarks SET sort = ? WHERE id = ?').bind(i, id),
  )
  await db.batch(stmts)
}

// ========== settings ==========

// 内部读取：原始 key -> 解析后的 JSON 值
async function readRawSettings(db: D1Database): Promise<Map<string, unknown>> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string | null }>()
  const map = new Map<string, unknown>()
  for (const row of results ?? []) {
    if (row.value == null) continue
    try {
      map.set(row.key, JSON.parse(row.value))
    } catch {
      // 容错：无法解析的当作原始字符串
      map.set(row.key, row.value)
    }
  }
  return map
}

// 聚合成强类型 Settings（缺失字段回退默认值）
export async function getSettings(db: D1Database): Promise<Settings> {
  const raw = await readRawSettings(db)
  const out = { ...DEFAULT_SETTINGS } as Settings
  const assignSetting = <K extends keyof Settings>(key: K) => {
    if (raw.has(key)) {
      // 直接采用存储值（已 JSON.parse）
      out[key] = raw.get(key) as Settings[K]
    }
  }
  for (const key of SETTINGS_KEYS) assignSetting(key)
  return out
}

// 读取任意单个内部 key（如 admin_password / admin_username），返回解析后的值
export async function getSettingValue<T = unknown>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string | null }>()
  if (!row || row.value == null) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return row.value as unknown as T
  }
}

// 写入任意单个内部 key（value 会被 JSON.stringify）
export async function setSettingValue(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run()
}

// 部分更新 Settings（只更新传入的 key），batch 提交后返回全量
export async function updateSettings(
  db: D1Database,
  patch: Partial<Settings>,
): Promise<Settings> {
  const stmts: D1PreparedStatement[] = []
  for (const key of SETTINGS_KEYS) {
    if (key in patch && patch[key] !== undefined) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          )
          .bind(key, JSON.stringify(patch[key])),
      )
    }
  }
  if (stmts.length > 0) await db.batch(stmts)
  return await getSettings(db)
}

// ========== 数据导入（覆盖式：清空后重建，保留原始 id 以维持关联） ==========

export async function importData(
  db: D1Database,
  data: { categories: Category[]; bookmarks: Bookmark[]; settings?: Partial<Settings> },
): Promise<{ categories: number; bookmarks: number }> {
  const now = Date.now()
  const stmts: D1PreparedStatement[] = []

  // 先清空（顺序：先书签后分类）
  stmts.push(db.prepare('DELETE FROM bookmarks'))
  stmts.push(db.prepare('DELETE FROM categories'))

  for (const c of data.categories) {
    stmts.push(
      db
        .prepare('INSERT INTO categories (id, title, icon, sort, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(c.id, c.title, c.icon ?? null, Number.isFinite(c.sort) ? c.sort : 0, c.created_at || now),
    )
  }

  for (const b of data.bookmarks) {
    const openMethod = b.open_method === 2 ? 2 : 1
    stmts.push(
      db
        .prepare(
          'INSERT INTO bookmarks (id, category_id, title, url, icon, icon_source, description, open_method, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          b.id,
          b.category_id,
          b.title,
          b.url,
          b.icon ?? null,
          (b as unknown as Record<string, unknown>).icon_source ?? null,
          b.description ?? null,
          openMethod,
          Number.isFinite(b.sort) ? b.sort : 0,
          b.created_at || now,
        ),
    )
  }

  // 设置（仅写入受支持的 key，绝不触碰 admin_* 等内部 key）
  if (data.settings) {
    for (const key of SETTINGS_KEYS) {
      if (key in data.settings && data.settings[key] !== undefined) {
        stmts.push(
          db
            .prepare(
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            )
            .bind(key, JSON.stringify(data.settings[key])),
        )
      }
    }
  }

  await db.batch(stmts)
  return { categories: data.categories.length, bookmarks: data.bookmarks.length }
}

// ========== schema 迁移（幂等，仅缺列时添加） ==========

let _schemaChecked = false

export async function ensureSchema(db: D1Database): Promise<void> {
  if (_schemaChecked) return
  _schemaChecked = true

  // 判断列是否存在，不存在则 ADD COLUMN（D1/SQLite 允许）
  const { results: cols } = await db
    .prepare("PRAGMA table_info(bookmarks)")
    .all<{ name: string }>()

  const colNames = new Set((cols ?? []).map((c) => c.name))

  const stmts: D1PreparedStatement[] = []
  if (!colNames.has("icon_source")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_source TEXT"))
  }
  if (!colNames.has("icon_blob")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_blob TEXT"))
  }

  if (stmts.length > 0) await db.batch(stmts)
}

// ========== icon_blob 存取 ==========

export async function getIconBlob(db: D1Database, id: number): Promise<string | null> {
  const row = await db
    .prepare("SELECT icon_blob FROM bookmarks WHERE id = ?")
    .bind(id)
    .first<{ icon_blob: string | null }>()
  return row?.icon_blob ?? null
}

export async function setIconBlob(db: D1Database, id: number, blob: string | null): Promise<void> {
  await db
    .prepare("UPDATE bookmarks SET icon_blob = ? WHERE id = ?")
    .bind(blob, id)
    .run()
}
