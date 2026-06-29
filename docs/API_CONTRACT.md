# CF-Navs API 契约

共享类型定义见 `shared/types.ts`。前端和后端都应以共享类型为准；修改接口时同步更新本文件和 `shared/types.ts`。

## 通用约定

- 所有接口前缀为 `/api`。
- 常规响应使用统一包络：`{ code, msg, data }`。
- 业务错误通常仍返回 HTTP 200，用 `code` 区分；认证中间件拦截返回 HTTP 401 且 `code=1001`。
- 写操作使用 `Authorization: Bearer <token>` 鉴权。
- 时间戳使用毫秒数，即 `Date.now()`。

## 鉴权规则

- `authRequired`：读取 Bearer token，查 KV session；无效时返回 401。
- `/api/public/data`：匿名请求先查公开数据 edge cache；缓存未命中时读取 `settings.public_mode`，公开模式关闭则要求有效 token，否则返回 `code=1005`。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |

`/api/config` 使用短 TTL Cloudflare edge cache，设置保存或数据导入后会主动失效。`/api/public/data` 只返回首页渲染需要的公开设置子集，不包含 `admin_username`、`admin_password`、`public_mode`、`custom_css`、`custom_js` 等内部或未使用字段；匿名公开访问会先查短 TTL edge cache，命中时直接返回而不读取 D1，带登录态请求绕过该缓存。

## 认证接口

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/login` | `LoginReq` | `LoginResp` |
| POST | `/api/logout` | 无 | `null` |
| GET | `/api/me` | 无 | `{ username: string }` |

管理员首次初始化使用 `INIT_ADMIN_USER` 和 `INIT_ADMIN_PASSWORD`。密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。
`LoginResp` 包含 `token`、`expires_at` 和 `username`，前端登录成功后直接使用返回的 `username` 更新登录态，不再额外请求 `/api/me`。已有登录态刷新页面时先从本地恢复 session，再由 `/api/admin/data` 完成 token 校验；只有显式刷新用户信息时才需要 `/api/me`。

## 后台聚合接口

全部需要登录。

| 方法 | 路径 | 返回 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/data` | `AdminData` | 后台初始化聚合数据，一次返回分类、书签和完整 `Settings`，用于替代进入后台时分别请求公开数据和设置 |

## 分类接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/categories` | 无 | `Category[]` |
| POST | `/api/categories` | `CategoryUpsertReq` | `Category` |
| PUT | `/api/categories/:id` | `CategoryUpsertReq` | `Category` |
| DELETE | `/api/categories/:id` | 无 | `null` |
| POST | `/api/categories/sort` | `SortReq` | `null` |

删除分类会显式删除该分类下的书签。

## 书签接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/bookmarks` | 无 | `Bookmark[]` |
| POST | `/api/bookmarks` | `BookmarkUpsertReq` | `Bookmark` |
| PUT | `/api/bookmarks/:id` | `BookmarkUpsertReq` | `Bookmark` |
| DELETE | `/api/bookmarks/:id` | 无 | `null` |
| POST | `/api/bookmarks/sort` | `SortReq` | `null` |

## 图标接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/fetch-favicon?url=` | 登录 | 服务端解析目标站 favicon，失败回退 Google s2 |
| GET | `/api/icon/:id` | 无 | 书签图标代理。优先返回 Cloudflare edge cache 和 D1 中缓存的图标 blob；无缓存时按书签保存的 HTTP(S) 图标地址服务端抓取并写回 D1；外站失败时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/category-icon/:id` | 无 | 分类图标代理。优先返回 Cloudflare edge cache；HTTP(S) 分类图标由 Worker 服务端抓取；外站失败时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/iconify/:set/:name.svg` | 无 | Iconify 图标预览代理。新增/编辑书签弹窗通过该同源代理预览 Iconify 图标，成功响应可被浏览器 Service Worker 与 Cloudflare edge cache 复用；失败时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再回退 `/favicon.ico` 和 Google。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色。
- `google`：使用 Google s2 favicons 接口。
- `iconify`：使用 Iconify SVG API，保存格式为 `https://api.iconify.design/{set}/{name}.svg`，例如 `mdi:home` 会转换为 `https://api.iconify.design/mdi/home.svg`；新增/编辑弹窗预览通过 `/api/iconify/{set}/{name}.svg` 代理加载。
- `custom`：手动填写 URL、表情或图床地址。

创建或更新书签时，如果图标是 HTTP(S) 图片，后端会尝试异步缓存到 `bookmarks.icon_blob`。更新书签但图标地址未改变时不会清空已有 `icon_blob`。前台展示 HTTP(S) 书签图标时默认使用 `/api/icon/:id?v=...`，分类图标默认使用 `/api/category-icon/:id?v=...`，避免页面刷新、搜索筛选或设置保存后直接重复请求外站。

前端不应直接把 `favicon.im` 或持久化的 Iconify 图标地址渲染到首页 `<img>`。Favicon.im、Google s2、Iconify 或自定义外站图标都应通过图标代理展示；第三方服务限流、超时或 4xx/5xx 时，代理返回临时 SVG fallback，不写入长期缓存。Service Worker 对 `/api/icon/*`、`/api/category-icon/*`、`/api/iconify/*` 和兼容旧版本的 `https://api.iconify.design/*.svg` 使用 cache-first 策略，但不会缓存带 `X-Icon-Fallback: 1` 的临时 fallback。

## 首页搜索行为

首页搜索框输入关键词时直接筛选当前首页分类与书签区域，不再弹出本地书签下拉选择。匹配字段包括书签标题、URL、描述和分类标题。按 Enter 仍按当前搜索引擎配置跳转外部搜索。

## 设置接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | `Settings` |
| PUT | `/api/settings` | `SettingsUpdateReq` | 更新后的 `Settings` |

设置存储在 D1 `settings` 表中，`value` 为 JSON 字符串。后端读取时聚合为完整 `Settings` 对象，并对缺失字段使用默认值。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

导入是覆盖式操作：先清空分类和书签，再按传入数据重建；设置仅写入受支持的公开配置 key，不触碰管理员账号字段。
