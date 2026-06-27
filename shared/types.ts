// CF-Navs 前后端共享类型与 API 契约（单一事实来源）
// 前端 src/ 与后端 worker/ 都从这里 import，禁止各自重新定义。

// ========== 实体 ==========

export interface Category {
  id: number
  title: string
  icon: string | null
  sort: number
  created_at: number
}

export interface Bookmark {
  id: number
  category_id: number
  title: string
  url: string
  icon: string | null
  icon_source: IconSource | null // 图标获取方式（direct/favicon_im/logo_surf/google/custom）
  description: string | null
  open_method: 1 | 2 // 1=新窗口 2=当前页
  sort: number
  created_at: number
}

// 图标获取方式
//  direct     = 直接抓取站点 favicon（服务端解析）
//  favicon_im = 通过 favicon.im 获取
//  logo_surf  = 由名称生成的文字图标（仿 logo.surf，本地 SVG）
//  google     = Google s2 favicons 接口
//  custom     = 手动填写 / 图床上传等
export type IconSource = 'direct' | 'favicon_im' | 'logo_surf' | 'google' | 'custom'

// ========== 设置 ==========

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface BackgroundSetting {
  type: 'image' | 'color' | 'gradient'
  value: string // image: URL；color: #hex；gradient: CSS 渐变字符串
  blur: number // 0-20 (px)
  mask: number // 0-1 遮罩不透明度
  maskColor: string // 遮罩颜色（CSS 色值），例如 '#000000' 或 'rgba(0,0,0,0.5)'
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

// 卡片风格类型
export type CardStyle = 'info' | 'icon' // info=详情风格, icon=极简风格

// 全部设置的强类型视图（后端按 key 存 JSON，这里是聚合形态）
export interface Settings {
  site_title: string
  site_title_color: string
  site_title_font_size: number
  public_mode: boolean
  theme: ThemeMode
  background: BackgroundSetting
  custom_css: string
  custom_js: string
  image_host_url: string
  search_engine: SearchEngineSetting
  card_size: CardSizeSetting
  card_style: CardStyle // 新增：卡片风格
  card_icon_size: number // 新增：图标尺寸 (px)
  card_show_description: boolean // 新增：是否显示描述（详情风格）
  card_background_color: string // 卡片背景颜色，例如 '#ffffff'
  card_background_opacity: number // 卡片背景不透明度 0-1
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
  SERVER_ERROR: 1500,
} as const

// ========== 各接口的请求/响应数据形状 ==========

// POST /api/login
export interface LoginReq {
  username: string
  password: string
}
export interface LoginResp {
  token: string
  expires_at: number
}

// GET /api/public/data  （公开只读聚合）
export interface PublicData {
  categories: Category[]
  bookmarks: Bookmark[]
  settings: PublicSettings
}
// 公开输出的设置子集（不含密码等敏感项）
export interface PublicSettings {
  site_title: string
  site_title_color: string
  site_title_font_size: number
  theme: ThemeMode
  background: BackgroundSetting
  custom_css: string
  custom_js: string
  search_engine: SearchEngineSetting
  image_host_url: string
  card_size: CardSizeSetting // 添加卡片尺寸
  card_style: CardStyle // 添加卡片风格
  card_icon_size: number // 添加图标尺寸
  card_show_description: boolean // 添加描述显示开关
  card_background_color: string
  card_background_opacity: number
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
}

// POST/PUT 书签
export interface BookmarkUpsertReq {
  category_id: number
  title: string
  url: string
  icon?: string | null
  icon_source?: IconSource | null
  description?: string | null
  open_method?: 1 | 2
}

// GET /api/fetch-favicon?url=...
export interface FaviconResp {
  icon: string // 解析到的“直接”图标 URL（方式1；失败回退 Google）
}

// POST /api/categories/sort  和  /api/bookmarks/sort
// 传有序 id 数组，后端按下标写 sort
export interface SortReq {
  ids: number[]
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
}
export interface ImportResp {
  categories: number
  bookmarks: number
}

// PUT /api/settings  —— 部分更新，传哪些 key 改哪些
export type SettingsUpdateReq = Partial<Settings>
