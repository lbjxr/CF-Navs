// D1 查询封装：分类/书签 CRUD、批量排序、settings 聚合读取与部分更新

import type {
  AdminData,
  Bookmark,
  Category,
  BookmarkUpsertReq,
  CategoryUpsertReq,
  PublicBookmark,
  PublicCategory,
  SiteConfig,
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
  background_preset_id: 'custom',
  background: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  backgrounds: {
    light: { type: 'color', value: '#f8fafc', blur: 0, mask: 0.18, maskColor: '#ffffff' },
    dark: { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' },
  },
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
  card_icon_show_title: true,
  card_text_color: '',
  search_box_show: true,
  search_engine_selector_show: true,
  content_layout: {
    max_width: 1200,
    max_width_unit: 'px',
    margin_x: 0,
    margin_top: 0,
    margin_bottom: 0,
  },
  footer_html: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeBackgroundSetting(value: unknown, fallback: Settings['background']): Settings['background'] {
  if (!isRecord(value)) return { ...fallback }

  const type = value.type === 'image' || value.type === 'gradient' || value.type === 'color'
    ? value.type
    : fallback.type
  return {
    type,
    value: typeof value.value === 'string' ? value.value : fallback.value,
    blur: typeof value.blur === 'number' ? value.blur : fallback.blur,
    mask: typeof value.mask === 'number' ? value.mask : fallback.mask,
    maskColor: typeof value.maskColor === 'string' ? value.maskColor : fallback.maskColor,
  }
}

function normalizeThemeBackgroundSettings(value: unknown, fallbackBackground: Settings['background']): Settings['backgrounds'] {
  const fallback = isRecord(value) ? value : {}
  return {
    light: normalizeBackgroundSetting(fallback.light, fallbackBackground),
    dark: normalizeBackgroundSetting(fallback.dark, fallbackBackground),
  }
}

function normalizeBackgroundPresetId(value: unknown): Settings['background_preset_id'] {
  return value === 'clear-teal' || value === 'mist-slate' || value === 'custom' ? value : 'custom'
}

// Settings 中属于强类型聚合视图的 key（不含 admin_* 等内部 key）
const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
const PUBLIC_DATA_SETTINGS_KEYS: (keyof Settings)[] = [
  'site_title',
  'site_title_color',
  'site_title_font_size',
  'public_mode',
  'theme',
  'background_preset_id',
  'background',
  'backgrounds',
  'image_host_url',
  'search_engine',
  'card_size',
  'card_style',
  'card_icon_size',
  'card_show_description',
  'card_background_color',
  'card_background_opacity',
  'card_icon_show_title',
  'card_text_color',
  'search_box_show',
  'search_engine_selector_show',
  'content_layout',
  'footer_html',
]
const PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_KEYS = PUBLIC_DATA_SETTINGS_KEYS.filter(
  (key) => key !== 'site_title' && key !== 'public_mode',
)

const CATEGORY_LIST_SQL = 'SELECT id, title, icon, sort, created_at FROM categories ORDER BY sort ASC, id ASC'
const BOOKMARK_LIST_SQL =
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, open_method, sort, created_at FROM bookmarks ORDER BY sort ASC, id ASC'
const PUBLIC_CATEGORY_LIST_SQL = 'SELECT id, title, icon, sort FROM categories ORDER BY sort ASC, id ASC'
const PUBLIC_BOOKMARK_LIST_SQL =
  'SELECT id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, open_method, sort FROM bookmarks ORDER BY sort ASC, id ASC'
const SETTINGS_LIST_SQL = 'SELECT key, value FROM settings'
const PUBLIC_DATA_SETTINGS_LIST_SQL = `SELECT key, value FROM settings WHERE key IN (${PUBLIC_DATA_SETTINGS_KEYS
  .map((key) => `'${key}'`)
  .join(',')})`
const PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL = `SELECT key, value FROM settings WHERE key IN (${PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_KEYS
  .map((key) => `'${key}'`)
  .join(',')})`
// D1 单条预处理语句最多绑定 100 个参数；本 UPDATE 每个 id 用 3 个参数
// （CASE 的 WHEN ? THEN ? 两个 + WHERE IN (?) 一个），故每批最多 33 个 id，取 30 留余量。
const SORT_UPDATE_CHUNK_SIZE = 30

function isRecoverableSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('no such column') ||
    normalized.includes('has no column named')
  )
}

async function withSchemaRetry<T>(db: D1Database, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!isRecoverableSchemaError(error)) throw error
    await ensureSchema(db, true)
    return await operation()
  }
}

async function sortRowsByIds(db: D1Database, table: 'categories' | 'bookmarks', ids: number[]): Promise<void> {
  if (ids.length === 0) return

  const stmts: D1PreparedStatement[] = []
  for (let start = 0; start < ids.length; start += SORT_UPDATE_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + SORT_UPDATE_CHUNK_SIZE)
    const cases = chunk.map(() => 'WHEN ? THEN ?').join(' ')
    const where = chunk.map(() => '?').join(', ')
    const params: number[] = []

    chunk.forEach((id, index) => {
      params.push(id, start + index)
    })
    params.push(...chunk)

    stmts.push(
      db
        .prepare(`UPDATE ${table} SET sort = CASE id ${cases} ELSE sort END WHERE id IN (${where})`)
        .bind(...params),
    )
  }

  if (stmts.length === 1) {
    await stmts[0].run()
  } else {
    await db.batch(stmts)
  }
}

// ========== 分类 ==========

export async function listCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare(CATEGORY_LIST_SQL)
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
  const category = await db
    .prepare(
      `INSERT INTO categories (title, icon, sort, created_at)
       SELECT ?, ?, COALESCE(MAX(sort), -1) + 1, ? FROM categories
       RETURNING id, title, icon, sort, created_at`,
    )
    .bind(req.title, req.icon ?? null, now)
    .first<Category>()

  if (!category) {
    throw new Error('failed to create category')
  }

  return category
}

export async function updateCategory(
  db: D1Database,
  id: number,
  req: CategoryUpsertReq,
): Promise<Category | null> {
  return await db
    .prepare('UPDATE categories SET title = ?, icon = ? WHERE id = ? RETURNING id, title, icon, sort, created_at')
    .bind(req.title, req.icon ?? null, id)
    .first<Category>()
}

export async function deleteCategory(db: D1Database, id: number): Promise<boolean> {
  // 显式级联删书签（不依赖 PRAGMA foreign_keys，D1 默认未必开启外键）
  const [, categoryDelete] = await db.batch([
    db.prepare('DELETE FROM bookmarks WHERE category_id = ?').bind(id),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ])
  return (categoryDelete.meta.changes ?? 0) > 0
}

// 批量排序：按 ids 下标写 sort，单次 batch 提交
export async function sortCategories(db: D1Database, ids: number[]): Promise<void> {
  await sortRowsByIds(db, 'categories', ids)
}

// ========== 书签 ==========

export async function listBookmarks(db: D1Database): Promise<Bookmark[]> {
  return await withSchemaRetry(db, async () => {
    const { results } = await db
      .prepare(BOOKMARK_LIST_SQL)
      .all<Bookmark>()
    return results ?? []
  })
}

export async function getPublicDataSource(db: D1Database, siteConfig?: SiteConfig): Promise<{
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
      db.prepare(PUBLIC_BOOKMARK_LIST_SQL),
    ])

    return {
      categories: (categoriesResult.results ?? []) as PublicCategory[],
      bookmarks: (bookmarksResult.results ?? []) as PublicBookmark[],
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>, siteConfig),
    }
  })
}

export async function getAdminData(db: D1Database): Promise<AdminData> {
  return await withSchemaRetry(db, async () => {
    const [categoriesResult, bookmarksResult, settingsResult] = await db.batch([
      db.prepare(CATEGORY_LIST_SQL),
      db.prepare(BOOKMARK_LIST_SQL),
      db.prepare(SETTINGS_LIST_SQL),
    ])

    return {
      categories: (categoriesResult.results ?? []) as Category[],
      bookmarks: (bookmarksResult.results ?? []) as Bookmark[],
      settings: settingsFromRows((settingsResult.results ?? []) as Array<{ key: string; value: string | null }>),
    }
  })
}

export interface BookmarkIconData {
  title: string
  url: string
  icon: string | null
  icon_source: Bookmark['icon_source']
  icon_blob: string | null
}

export async function getBookmarkIconData(db: D1Database, id: number): Promise<BookmarkIconData | null> {
  return await withSchemaRetry(db, async () => (
    await db
      .prepare('SELECT title, url, icon, icon_source, icon_blob FROM bookmarks WHERE id = ?')
      .bind(id)
      .first<BookmarkIconData>()
  ))
}

export async function createBookmark(db: D1Database, req: BookmarkUpsertReq): Promise<Bookmark | null> {
  const now = Date.now()
  const open_method: 1 | 2 | 3 = req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : 1
  return await withSchemaRetry(db, async () => (
    await db
      .prepare(
        `INSERT INTO bookmarks (
           category_id, title, url, icon, icon_source, icon_background_color,
           description, open_method, sort, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort) FROM bookmarks WHERE category_id = ?), -1) + 1, ?
         WHERE EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, open_method, sort, created_at`,
      )
      .bind(
        req.category_id,
        req.title,
        req.url,
        req.icon ?? null,
        req.icon_source ?? null,
        req.icon_background_color ?? null,
        req.description ?? null,
        open_method,
        req.category_id,
        now,
        req.category_id,
      )
      .first<Bookmark>()
  ))
}

export async function updateBookmark(
  db: D1Database,
  id: number,
  req: BookmarkUpsertReq,
): Promise<Bookmark | null> {
  const nextIcon = req.icon ?? null
  const nextIconSource = req.icon_source ?? null
  const openMethod: 1 | 2 | 3 | null =
    req.open_method === 2 ? 2 : req.open_method === 3 ? 3 : req.open_method === 1 ? 1 : null
  return await withSchemaRetry(db, async () => (
    await db
      .prepare(
        `UPDATE bookmarks
         SET category_id = ?,
             title = ?,
             url = ?,
             icon_blob = CASE
               WHEN ((icon IS NULL AND ? IS NULL) OR icon = ?)
                AND ((icon_source IS NULL AND ? IS NULL) OR icon_source = ?)
               THEN icon_blob
               ELSE NULL
             END,
             icon = ?,
             icon_source = ?,
             icon_background_color = ?,
             description = ?,
             open_method = COALESCE(?, open_method)
         WHERE id = ? AND EXISTS (SELECT 1 FROM categories WHERE id = ?)
         RETURNING id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, open_method, sort, created_at`,
      )
      .bind(
        req.category_id,
        req.title,
        req.url,
        nextIcon,
        nextIcon,
        nextIconSource,
        nextIconSource,
        nextIcon,
        nextIconSource,
        req.icon_background_color ?? null,
        req.description ?? null,
        openMethod,
        id,
        req.category_id,
      )
      .first<Bookmark>()
  ))
}

export async function deleteBookmark(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run()
  return (res.meta.changes ?? 0) > 0
}

export async function sortBookmarks(db: D1Database, ids: number[]): Promise<void> {
  await sortRowsByIds(db, 'bookmarks', ids)
}

// ========== settings ==========

// 内部读取：原始 key -> 解析后的 JSON 值
function readRawSettingsRows(rows: Array<{ key: string; value: string | null }>): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const row of rows) {
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

function settingsFromRawMap(raw: Map<string, unknown>): Settings {
  const out = { ...DEFAULT_SETTINGS } as Settings
  const assignSetting = <K extends keyof Settings>(key: K) => {
    if (raw.has(key)) {
      // 直接采用存储值（已 JSON.parse）
      out[key] = raw.get(key) as Settings[K]
    }
  }
  for (const key of SETTINGS_KEYS) assignSetting(key)
  out.background_preset_id = normalizeBackgroundPresetId(out.background_preset_id)
  out.background = normalizeBackgroundSetting(out.background, DEFAULT_SETTINGS.background)
  out.backgrounds = normalizeThemeBackgroundSettings(raw.get('backgrounds'), out.background)
  return out
}

function settingsFromRows(rows: Array<{ key: string; value: string | null }>, base: Partial<Settings> = {}): Settings {
  const raw = readRawSettingsRows(rows)
  for (const key of SETTINGS_KEYS) {
    if (base[key] !== undefined) {
      raw.set(key, base[key])
    }
  }
  return settingsFromRawMap(raw)
}

export function settingsFromPatchDefaults(patch: Partial<Settings>): Settings {
  const raw = new Map<string, unknown>()
  for (const key of SETTINGS_KEYS) {
    if (patch[key] !== undefined) {
      raw.set(key, patch[key])
    }
  }
  return settingsFromRawMap(raw)
}

async function readRawSettings(db: D1Database): Promise<Map<string, unknown>> {
  const { results } = await db.prepare(SETTINGS_LIST_SQL).all<{ key: string; value: string | null }>()
  return readRawSettingsRows(results ?? [])
}

// 聚合成强类型 Settings（缺失字段回退默认值）
export async function getSettings(db: D1Database): Promise<Settings> {
  return settingsFromRawMap(await readRawSettings(db))
}

export async function getSiteConfig(db: D1Database): Promise<SiteConfig> {
  const { results } = await db
    .prepare("SELECT key, value FROM settings WHERE key IN ('site_title', 'public_mode')")
    .all<{ key: string; value: string | null }>()

  const config: SiteConfig = {
    site_title: DEFAULT_SETTINGS.site_title,
    public_mode: DEFAULT_SETTINGS.public_mode,
  }

  for (const row of results ?? []) {
    if (row.value == null) continue

    try {
      const value = JSON.parse(row.value) as unknown
      if (row.key === 'site_title' && typeof value === 'string') {
        config.site_title = value
      } else if (row.key === 'public_mode' && typeof value === 'boolean') {
        config.public_mode = value
      }
    } catch {
      if (row.key === 'site_title') config.site_title = row.value
    }
  }

  return config
}

export async function getSettingValues<T = unknown>(
  db: D1Database,
  keys: string[],
): Promise<Map<string, T | null>> {
  if (keys.length === 0) return new Map()

  const placeholders = keys.map(() => '?').join(',')
  const { results } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<{ key: string; value: string | null }>()

  const values = new Map<string, T | null>()
  for (const row of results ?? []) {
    if (row.value == null) {
      values.set(row.key, null)
      continue
    }

    try {
      values.set(row.key, JSON.parse(row.value) as T)
    } catch {
      values.set(row.key, row.value as unknown as T)
    }
  }

  return values
}

// 写入任意单个内部 key（value 会被 JSON.stringify）
export async function setSettingValue(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run()
}

function settingsPatchStatement(db: D1Database, patch: Partial<Settings>): D1PreparedStatement | null {
  const placeholders: string[] = []
  const params: unknown[] = []

  for (const key of SETTINGS_KEYS) {
    if (key in patch && patch[key] !== undefined) {
      placeholders.push('(?, ?)')
      params.push(key, JSON.stringify(patch[key]))
    }
  }

  if (placeholders.length === 0) return null

  return db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ${placeholders.join(', ')}
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(...params)
}

// 部分更新 Settings（只更新传入的 key），batch 提交后返回全量
export async function updateSettings(
  db: D1Database,
  patch: Partial<Settings>,
): Promise<Settings> {
  await settingsPatchStatement(db, patch)?.run()
  return await getSettings(db)
}

// ========== 数据导入（覆盖式：清空后重建，保留原始 id 以维持关联） ==========

export async function writeSettingsPatch(db: D1Database, patch: Partial<Settings>): Promise<void> {
  await settingsPatchStatement(db, patch)?.run()
}

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

  for (const c of data.categories) {
    const category: Category = {
      id: c.id,
      title: c.title,
      icon: c.icon ?? null,
      sort: Number.isFinite(c.sort) ? c.sort : 0,
      created_at: c.created_at || now,
    }
    importedCategories.push(category)
    stmts.push(
      db
        .prepare('INSERT INTO categories (id, title, icon, sort, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(category.id, category.title, category.icon, category.sort, category.created_at),
    )
  }

  for (const b of data.bookmarks) {
    const openMethod = b.open_method === 2 ? 2 : b.open_method === 3 ? 3 : 1
    const bookmark: Bookmark = {
      id: b.id,
      category_id: b.category_id,
      title: b.title,
      url: b.url,
      icon: b.icon ?? null,
      icon_source: (b as unknown as Record<string, Bookmark['icon_source']>).icon_source ?? null,
      icon_background_color: (b as unknown as Record<string, string | null | undefined>).icon_background_color ?? null,
      icon_blob: (b as unknown as Record<string, string | null | undefined>).icon_blob ?? null,
      description: b.description ?? null,
      open_method: openMethod,
      sort: Number.isFinite(b.sort) ? b.sort : 0,
      created_at: b.created_at || now,
    }
    importedBookmarks.push(bookmark)
    stmts.push(
      db
        .prepare(
          'INSERT INTO bookmarks (id, category_id, title, url, icon, icon_source, icon_background_color, icon_blob, description, open_method, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(
          bookmark.id,
          bookmark.category_id,
          bookmark.title,
          bookmark.url,
          bookmark.icon,
          bookmark.icon_source,
          bookmark.icon_background_color,
          bookmark.icon_blob,
          bookmark.description,
          bookmark.open_method,
          bookmark.sort,
          bookmark.created_at,
        ),
    )
  }

  // 设置（仅写入受支持的 key，绝不触碰 admin_* 等内部 key）
  if (data.settings) {
    const settingsStmt = settingsPatchStatement(db, data.settings)
    if (settingsStmt) stmts.push(settingsStmt)
  }

  await db.batch(stmts)
  importedCategories.sort((a, b) => a.sort - b.sort || a.id - b.id)
  importedBookmarks.sort((a, b) => a.sort - b.sort || a.id - b.id)
  return {
    categories: importedCategories.length,
    bookmarks: importedBookmarks.length,
    importedCategories,
    importedBookmarks,
  }
}

// ========== schema 迁移（幂等，仅缺列时添加） ==========

let _schemaChecked = false

export async function ensureSchema(db: D1Database, force = false): Promise<void> {
  if (_schemaChecked && !force) return
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
  if (!colNames.has("icon_background_color")) {
    stmts.push(db.prepare("ALTER TABLE bookmarks ADD COLUMN icon_background_color TEXT"))
  }
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_bookmarks_sort_global ON bookmarks(sort, id)"))
  stmts.push(db.prepare("CREATE INDEX IF NOT EXISTS idx_categories_sort_id ON categories(sort, id)"))

  if (stmts.length > 0) await db.batch(stmts)
}

// ========== icon_blob 写入 ==========

export async function setIconBlob(db: D1Database, id: number, blob: string | null): Promise<void> {
  await db
    .prepare("UPDATE bookmarks SET icon_blob = ? WHERE id = ?")
    .bind(blob, id)
    .run()
}
