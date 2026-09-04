// CF-Navs 前后端共享类型与 API 契约（单一事实来源）
// 前端 src/ 与后端 worker/ 都从这里 import，禁止各自重新定义。

// ========== 实体 ==========

export interface Category {
  id: number
  parent_id: number | null
  title: string
  icon: string | null
  is_private?: boolean | number // 公开分类为 0/false，私密分类为 1/true
  sort: number
  created_at: number
}

export interface Bookmark {
  id: number
  category_id: number
  title: string
  url: string
  icon: string | null
  icon_source: IconSource | null // 图标获取方式（direct/favicon_im/logo_surf/google/iconify/custom）
  icon_background_color: string | null
  icon_blob: string | null // 图标 data URI 缓存（优先用于本地加载）
  icon_cached?: boolean | number | null // Aggregate responses use this lightweight flag instead of sending icon_blob.
  description: string | null
  description_mode?: DescriptionDisplayMode | null
  open_method: 1 | 2 | 3 // 1=新窗口 2=当前页 3=当前页弹层
  is_private?: boolean | number // 公开书签为 0/false，私密书签为 1/true
  sort: number
  click_count?: number
  created_at: number
}

export type PublicCategory = Omit<Category, 'created_at'>
export type PublicBookmark = Omit<Bookmark, 'created_at'>

// 图标获取方式
//  direct     = 直接抓取站点 favicon（服务端解析）
//  favicon_im = 通过 favicon.im 获取
//  logo_surf  = 由名称生成的文字图标（仿 logo.surf，本地 SVG）
//  google     = Google s2 favicons 接口
//  iconify    = Iconify SVG 图标
//  custom     = 手动填写 / 图床上传等
export type IconSource = 'direct' | 'favicon_im' | 'logo_surf' | 'google' | 'iconify' | 'custom'

export type DescriptionDisplayMode = 'always' | 'hover' | 'hidden'

// ========== 设置 ==========

export type ThemeMode = 'light' | 'dark' | 'auto'
export const BUILTIN_BACKGROUND_PRESET_IDS = [
  'paper-sage',
  'paper-clay',
  'paper-wheat',
  'paper-slate',
  'paper-pine',
  'paper-sakura',
  'paper-lavender',
  'paper-indigo',
  'paper-amber',
  'clear-teal',
  'mist-slate',
  'coral-sky',
  'sage-graphite',
  'lumen-amber',
  'ember-night',
  'violet-dawn',
  'ocean-depths',
  'aurora-borealis',
  'citrus-sunset',
  'rose-orbit',
  'indigo-noir',
  'terracotta-dune',
] as const
export type BuiltinBackgroundPresetId = typeof BUILTIN_BACKGROUND_PRESET_IDS[number]
export type BackgroundPresetId = BuiltinBackgroundPresetId | 'custom'

export interface BackgroundSetting {
  type: 'image' | 'color' | 'gradient'
  value: string // image: URL；color: #hex；gradient: CSS 渐变字符串
  blur: number // 0-20 (px)
  mask: number // 0-1 遮罩不透明度
  maskColor: string // 遮罩颜色（CSS 色值），例如 '#000000' 或 'rgba(0,0,0,0.5)'
}

export interface ThemeBackgroundSettings {
  light: BackgroundSetting
  dark: BackgroundSetting
}

export interface SearchEngine {
  name: string
  icon: string
  url_template: string // 含 {q} 占位符
}

export interface SearchEngineSetting {
  current: string // 当前引擎 name
  engines: SearchEngine[]
}

export interface CardSizeSetting {
  width: number // 卡片最小宽度 (px)
  height: number // 卡片最小高度 (px)
}

export interface CategoryDisplaySetting {
  root_font_size: number // 一级分类标题字号 (12-28px)
  root_icon_size: number // 一级分类图标尺寸 (14-36px)
  child_font_size: number // 二级分类标题字号 (11-24px)
  child_icon_size: number // 二级分类图标尺寸 (12-32px)
}

export interface ContentLayoutSetting {
  max_width: number
  max_width_unit: 'px' | '%'
  margin_x: number // 0-100, px
  margin_top: number // 0-50, %
  margin_bottom: number // 0-50, %
}

export interface NavigationSetting {
  position: 'left' | 'top'
  always_expanded: boolean
  top_layout: 'scroll' | 'wrap'
}

// 卡片风格类型
export type CardStyle = 'info' | 'icon' // info=详情风格, icon=极简风格

// 全部设置的强类型视图（后端按 key 存 JSON，这里是聚合形态）
export interface Settings {
  site_title: string
  site_title_color: string
  site_title_font_size: number
  public_mode: boolean
  browser_sync_enabled: boolean
  theme: ThemeMode
  background_preset_id: BackgroundPresetId
  background: BackgroundSetting // 兼容旧版本：新逻辑优先使用 backgrounds
  backgrounds: ThemeBackgroundSettings
  custom_css: string
  custom_js: string
  image_host_url: string
  search_engine: SearchEngineSetting
  card_size: CardSizeSetting
  card_style: CardStyle // 新增：卡片风格
  card_icon_size: number // 新增：图标尺寸 (px)
  category_display: CategoryDisplaySetting
  card_show_description: boolean // 新增：是否显示描述（详情风格）
  card_description_mode: DescriptionDisplayMode
  card_background_color: string // 卡片背景颜色，例如 '#ffffff'
  card_background_opacity: number // 卡片背景不透明度 0-1
  card_icon_show_title: boolean // 极简风格是否显示标题
  card_text_color: string // 卡片标题/描述文字颜色
  search_box_show: boolean
  search_engine_selector_show: boolean
  content_layout: ContentLayoutSetting
  navigation: NavigationSetting
  footer_html: string
  most_visited_count: number
  site_title_show: boolean
}

// ========== API 统一响应包络 ==========
// 所有 /api/* 返回此结构，HTTP 状态码恒为 200（错误用 code 区分），
// 鉴权失败例外：返回 401。
export interface ApiResponse<T = unknown> {
  code: number // 0=成功，非0=错误
  msg: string
  data: T
}

// 错误码约定
export const ErrCode = {
  OK: 0,
  UNAUTHORIZED: 1001, // 未登录 / token 失效
  BAD_REQUEST: 1002, // 参数错误
  NOT_FOUND: 1003, // 资源不存在
  RATE_LIMITED: 1004, // 登录限流
  FORBIDDEN: 1005, // 公开模式关闭且未登录
  CONFLICT: 1006, // 当前资源状态不允许该操作
  SERVER_ERROR: 1500,
} as const


// ========== 错误报告 ==========

// POST /api/error-report 的 payload（前端上报到服务端）
export interface ErrorReportEntry {
  category: 'network' | 'auth' | 'data' | 'scripting' | 'unknown'
  message: string
  stack?: string
  timestamp: number
  url?: string
  line?: number
  col?: number
}

// ========== 各接口的请求/响应数据形状 ==========

// POST /api/login
export interface LoginReq {
  username: string
  password: string
}
export interface LoginResp {
  token: string
  expires_at: number
  username: string
}

// POST /api/logout
// 撤销名单是「退出登录」的全部实质：会话是无状态 JWT，不写名单就等于没退。
// 因此写入失败必须能被调用方分辨，不能一律当成纯成功。
export type LogoutRevocationFailure =
  | 'store_unavailable' // SESSION KV 存在但写入抛错
  | 'store_unconfigured' // 部署缺少 SESSION 绑定，撤销被整体跳过
export type LogoutResp =
  | { revoked: true }
  | { revoked: false; reason: LogoutRevocationFailure }

// GET /api/install/status
export type InstallBinding = 'DB' | 'SESSION'
export type InstallStatusResp =
  | { state: 'installed'; schema_version: number }
  | { state: 'needs_install'; schema_version: number | null; setup_token_configured: true }
  | { state: 'configuration_required'; reason: 'setup_token_missing'; schema_version: number | null }
  | { state: 'bindings_missing'; missing: InstallBinding[] }
  | { state: 'unavailable'; reason: 'database_unreachable' | 'session_store_unreachable' }

// POST /api/install
export interface InstallReq {
  username: string
  password: string
}

// POST /api/password
export interface ChangePasswordReq {
  current_password: string
  new_password: string
}

// GET /api/public/data  （公开只读聚合）
export interface PublicData {
  categories: PublicCategory[]
  bookmarks: PublicBookmark[]
  settings: PublicSettings
  version?: string
}

// GET /api/admin/data  登录态后台聚合数据
export interface AdminData {
  categories: Category[]
  bookmarks: Bookmark[]
  settings: Settings | null
  version?: string
}

// GET /api/data/version  lightweight data version check
export interface DataVersionResp {
  version: string
  site_title: string
  public_mode: boolean
}

// 公开输出的设置子集（不含密码等敏感项）
export interface PublicSettings {
  site_title: string
  site_title_color: string
  site_title_font_size: number
  theme: ThemeMode
  background_preset_id: BackgroundPresetId
  background: BackgroundSetting // 兼容旧版本：新逻辑优先使用 backgrounds
  backgrounds: ThemeBackgroundSettings
  search_engine: SearchEngineSetting
  image_host_url: string
  card_size: CardSizeSetting // 添加卡片尺寸
  card_style: CardStyle // 添加卡片风格
  card_icon_size: number // 添加图标尺寸
  category_display: CategoryDisplaySetting
  card_show_description: boolean // 添加描述显示开关
  card_description_mode: DescriptionDisplayMode
  card_background_color: string
  card_background_opacity: number
  card_icon_show_title: boolean
  card_text_color: string
  search_box_show: boolean
  search_engine_selector_show: boolean
  content_layout: ContentLayoutSetting
  navigation: NavigationSetting
  footer_html: string
  custom_css: string
  custom_js: string
  most_visited_count: number
  site_title_show: boolean
}

// GET /api/config （极简公开配置，登录页用）
export interface SiteConfig {
  site_title: string
  public_mode: boolean
}

// POST/PUT 分类
export interface CategoryUpsertReq {
  title: string
  icon?: string | null
  parent_id?: number | null
  is_private?: boolean
}

// POST/PUT 书签
export interface BookmarkUpsertReq {
  category_id: number
  title: string
  url: string
  icon?: string | null
  icon_source?: IconSource | null
  icon_background_color?: string | null
  description?: string | null
  description_mode?: DescriptionDisplayMode | null
  open_method?: 1 | 2 | 3
  is_private?: boolean
}

// POST /api/browser-sync/bookmarks —— 浏览器扩展单向同步
export interface BrowserSyncBookmark {
  title: string
  url: string
}

export interface BrowserSyncReq {
  bookmarks: BrowserSyncBookmark[]
}

export interface BrowserSyncResp {
  category_id: number
  category_title: string
  created: number
  skipped: number
}

// GET /api/fetch-favicon?url=...
export interface FaviconResp {
  icon: string // 解析到的站点图标 URL；失败时回退 favicon.im
}

// GET /api/fetch-site-meta?url=...
// 新增书签时解析站点名称。接口不会失败：解析不出来时 title 为去掉 www. 的域名。
export interface SiteMetaResp {
  title: string // 站点名称：根地址优先 og:site_name，深层链接优先 og:title/<title>
  final_url: string // 跟随重定向后的最终地址
}

// GET /api/iconify-search?query=...
export interface IconifyCandidate {
  name: string
  prefix: string
  icon: string
  label: string
  collection: string
  url: string
  preview_url: string
  colored: boolean
}

export interface IconifySearchResp {
  query: string
  candidates: IconifyCandidate[]
}

// GET /api/icon-access（需登录）
// 后台预览私密书签/私密分类图标用的短期授权。`<img>` 不发 Authorization 头，所以凭据
// 只能放进 URL 的 `key` 参数。签名密钥是 `settings.jwt_secret`，改密码会顺带作废全部
// 授权；寿命刻意远短于会话（默认 30 分钟），因为它不查撤销名单、登出后无法立即失效。
export interface IconAccessResp {
  key: string
  expires_at: number
}

// POST /api/categories/sort  和  /api/bookmarks/sort
// 传有序 id 数组，后端按下标写 sort
export interface SortReq {
  ids: number[]
}

/** 首页跨分类拖拽后，按分类提交完整的书签顺序。 */
export interface BookmarkReorganizeReq {
  category_orders: Array<{
    category_id: number
    ids: number[]
  }>
}

export type BookmarkBatchMovePosition = 'end' | 'start'

export interface BookmarkBatchMoveExpected {
  id: number
  category_id: number
  sort: number
}

/** POST /api/bookmarks/batch-move 的请求。expected 用于拒绝过期选择。 */
export interface BookmarkBatchMoveReq {
  ids: number[]
  category_id: number
  position: BookmarkBatchMovePosition
  expected: BookmarkBatchMoveExpected[]
}

export interface BookmarkBatchMoveResp {
  moved: number
  category_id: number
  position: BookmarkBatchMovePosition
}

export interface CategorySortReq extends SortReq {
  parent_id: number | null
}

// ========== 数据备份 / 导入导出 ==========

// 导出文件结构（前端在浏览器侧生成下载）
export interface BackupData {
  version: number
  exported_at: number
  categories: Category[]
  bookmarks: Bookmark[]
  settings: Settings | null
}

// POST /api/import —— 覆盖式导入（清空后重建分类与书签，可选应用设置）
export interface ImportReq {
  categories: Category[]
  bookmarks: Bookmark[]
  settings?: Partial<Settings>
  mode?: 'replace' | 'merge'
}
export interface ImportResp {
  categories: number
  bookmarks: number
  data: AdminData
  mode?: 'replace' | 'merge'
  created_categories?: number
  reused_categories?: number
  skipped_bookmarks?: number
}

export interface BatchDeleteReq {
  ids: number[]
}

export interface BatchDeleteBookmarksResp {
  deleted: number
}

export interface BatchDeleteCategoriesResp {
  deleted: number
  deleted_bookmarks: number
}

// PUT /api/settings  —— 部分更新，传哪些 key 改哪些
export type SettingsUpdateReq = Partial<Settings>
