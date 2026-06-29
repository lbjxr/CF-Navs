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
- `/api/public/data`：匿名请求先查公开数据 edge cache；缓存未命中时先复用 `/api/config` edge cache，仍未命中才读取轻量 `site_title/public_mode`，公开模式关闭则要求有效 token，否则返回 `code=1005`，该轻量 1005 响应也会短时写入 edge cache。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |

`/api/config` 使用短 TTL Cloudflare edge cache，设置保存或数据导入后会主动失效，主要作为兼容和兜底轻量配置接口。前端普通启动路径优先使用 `/api/public/data` 或 `/api/admin/data` 派生站点配置；公开模式关闭时，匿名 `/api/public/data` 的 1005 响应会在 `data` 中携带 `{ site_title, public_mode: false }`，登录页无需再额外请求 `/api/config`。该 1005 响应使用浏览器 `max-age=0` 和短 edge TTL，避免本地浏览器缓存卡住公开模式切换，同时减少私有站点匿名访问对 D1 的重复读取。`/api/public/data` 只查询并返回首页渲染需要的公开设置、分类和书签字段，不包含 `admin_username`、`admin_password`、`public_mode`、`custom_css`、`custom_js` 等内部或未使用设置字段，也不包含分类/书签的 `created_at` 管理字段；匿名公开访问会先查短 TTL edge cache，命中时直接返回而不读取 D1。前端首页刷新默认匿名请求以保留 edge cache 命中，只有公开模式关闭且本地已登录时才带 token 重试；服务端收到带登录态请求时仍会绕过匿名缓存。缓存未命中时，服务端先复用或预热 `/api/config` 的轻量 edge cache 来判断是否公开，公开时再通过一次 D1 batch 聚合读取公开 settings、分类和书签。

## 认证接口

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/login` | `LoginReq` | `LoginResp` |
| POST | `/api/logout` | 无 | `null` |
| GET | `/api/me` | 无 | `{ username: string }` |

管理员首次初始化使用 `INIT_ADMIN_USER` 和 `INIT_ADMIN_PASSWORD`。密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。
`LoginResp` 包含 `token`、`expires_at` 和 `username`，前端登录成功后直接使用返回的 `username` 更新登录态，不再额外请求 `/api/me`。登录接口会在 bootstrap 初始化时用一次 settings 查询同时读取管理员账号和密码，并复用该结果进行密码校验，避免重复读取账号/密码设置。已有登录态刷新公开首页时只从本地恢复 session，首页数据仍优先匿名请求 `/api/public/data`，不会预加载 `/api/admin/data` 或 `/api/me`；进入后台、创建/编辑书签等需要后台数据时，才由 `/api/admin/data` 完成 token 校验。只有显式刷新用户信息时才需要 `/api/me`。

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
| GET | `/api/icon/:id` | 无 | 书签图标代理。优先返回 Cloudflare edge cache；cache miss 时一次读取书签图标地址、标题和 D1 中缓存的 `icon_blob`；无 blob 时按书签保存的 HTTP(S) 图标地址服务端抓取并写回 D1；外站失败、图标缺失或缓存损坏时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/category-icon/:id` | 无 | 分类图标代理。优先返回 Cloudflare edge cache；HTTP(S) 分类图标由 Worker 服务端抓取；外站失败或图标缺失时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/iconify/:set/:name.svg` | 无 | Iconify 图标预览代理。新增/编辑书签弹窗通过该同源代理预览 Iconify 图标，成功响应可被浏览器 Service Worker 与 Cloudflare edge cache 复用；失败时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再回退 `/favicon.ico` 和 Google。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色。
- `google`：使用 Google s2 favicons 接口。
- `iconify`：使用 Iconify SVG API，保存格式为 `https://api.iconify.design/{set}/{name}.svg`，例如 `mdi:home` 会转换为 `https://api.iconify.design/mdi/home.svg`；新增/编辑弹窗会展示 Iconify 候选，候选和手动输入预览都通过 `/api/iconify/{set}/{name}.svg` 代理加载。
- `custom`：手动填写 URL、表情或图床地址。

创建或更新书签时，如果图标是普通 HTTP(S) 图片，后端会尝试异步缓存到 `bookmarks.icon_blob`；Iconify 图标不写入 `icon_blob`，由 `/api/iconify/:set/:name.svg`、Cloudflare edge cache 和浏览器 Service Worker 缓存复用。更新书签但图标地址未改变时不会清空已有 `icon_blob`。前台展示普通 HTTP(S) 书签图标时默认使用 `/api/icon/:id?v=...`，分类图标默认使用 `/api/category-icon/:id?v=...`，已保存的 Iconify 书签图标使用稳定的 `/api/iconify/:set/:name.svg`，避免页面刷新、搜索筛选或设置保存后直接重复请求外站。

前端不应直接把 `favicon.im` 或持久化的 Iconify 图标地址渲染到首页 `<img>`。Favicon.im、Google s2、Iconify 或自定义外站图标都应通过图标代理展示；第三方服务限流、超时、4xx/5xx、图标缺失或缓存损坏时，代理返回 `no-store` 临时 SVG fallback，不写入长期缓存，也不让前台 `<img>` 请求产生 404。Service Worker 对 `/api/icon/*`、`/api/category-icon/*`、`/api/iconify/*` 和兼容旧版本的 `https://api.iconify.design/*.svg` 使用 cache-first 策略，但不会缓存带 `X-Icon-Fallback: 1` 的临时 fallback；同一个 Iconify 图标应共享同一个 `/api/iconify/*` 本地缓存键，不按书签 ID 重复缓存。

HTTP(S) 图标抓取成功后，代理会直接返回图片字节并写入 Cloudflare edge cache；只有书签图标需要写入 `bookmarks.icon_blob` 时才生成 base64 data URI，避免 Iconify 预览和分类图标在 Worker 内部做不必要的 base64 编解码。

公开聚合、后台聚合、书签列表和图标详情等读取路径默认直接执行查询，避免每个 Worker isolate 冷启动都先跑 `PRAGMA table_info`。如果遇到旧库缺列错误，后端会执行一次兼容 schema 检查/迁移并重试当前查询。

## 首页搜索行为

首页搜索框输入关键词时直接筛选当前首页分类与书签区域，不再弹出本地书签下拉选择。匹配字段包括书签标题、URL、描述和分类标题。按 Enter 仍按当前搜索引擎配置跳转外部搜索。

## 设置接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | `Settings` |
| PUT | `/api/settings` | `SettingsUpdateReq` | 更新后的 `Settings` |

设置存储在 D1 `settings` 表中，`value` 为 JSON 字符串。后端读取时聚合为完整 `Settings` 对象，并对缺失字段使用默认值。后台设置面板提交完整 `Settings` 字段时，`PUT /api/settings` 写入 D1 后直接用本次提交的 payload 和默认值合成响应，避免额外回读 settings 全表；只提交部分字段的兼容请求仍会写入后读取完整 `Settings` 返回。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

导入是覆盖式操作：先清空分类和书签，再按传入数据重建；设置仅写入受支持的公开配置 key，不触碰管理员账号字段。`ImportResp` 包含导入数量和导入后的 `AdminData`，前端应直接使用该响应刷新后台与首页本地 store，避免导入后再请求 `/api/admin/data`。
