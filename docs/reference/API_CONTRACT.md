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
- `/api/public/data`：匿名请求默认可查公开数据 edge cache；缓存未命中时先复用 `/api/config` edge cache，仍未命中才读取轻量 `site_title/public_mode`，公开模式关闭则要求有效 token，否则返回 `code=1005`，该轻量 1005 响应也会短时写入 edge cache。请求带 `Cache-Control: no-cache`、`Cache-Control: no-store`、`Cache-Control: max-age=0` 或 `Pragma: no-cache` 时，服务端必须绕过公开数据和站点配置 edge cache。
- `/api/data/version`：读取内部 `settings.data_version`，返回轻量版本号；公开模式关闭时匿名请求返回 `code=1005` 并携带轻量站点配置，登录态请求需通过 token 校验。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/data/version` | 公开模式或登录 | `DataVersionResp` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |
| POST | `/api/error-report` | 无 | `{ received: number }` |

`/api/config` 使用短 TTL Cloudflare edge cache，设置保存或数据导入后会主动失效，主要作为兼容和兜底轻量配置接口。前端普通启动路径优先使用本地快照加 `/api/data/version` 做远端确认；本地无可用快照或版本变化时，才请求 `/api/public/data` 或 `/api/admin/data` 派生站点配置。公开模式关闭时，匿名 `/api/public/data` 的 1005 响应会在 `data` 中携带 `{ site_title, public_mode: false }`，登录页无需再额外请求 `/api/config`。该 1005 响应使用浏览器 `max-age=0` 和短 edge TTL，避免本地浏览器缓存卡住公开模式切换，同时减少私有站点匿名访问对 D1 的重复读取。`/api/public/data` 只查询并返回首页渲染需要的公开设置、分类和书签字段，书签公开字段包含用于本地优先图标展示的 `icon_blob`，但不包含 `admin_username`、`admin_password`、`public_mode`、`custom_css`、`custom_js` 等内部或未使用设置字段，也不包含分类/书签的 `created_at` 管理字段；未携带 no-cache 指令的匿名公开访问会先查短 TTL edge cache，命中时直接返回而不读取 D1。前端拉取完整聚合数据时默认带 `Cache-Control: no-cache`、`Pragma: no-cache` 和 fetch `cache: "no-store"`；服务端收到 no-cache 指令或带登录态请求时会绕过匿名缓存。缓存未命中时，服务端先复用或预热 `/api/config` 的轻量 edge cache 来判断是否公开，公开时再通过一次 D1 batch 聚合读取公开 settings、分类和书签；如果同一请求刚从 D1 读取过 `site_title/public_mode`，公开 settings 查询会跳过这两行并把已知值合并回响应。

`/api/error-report` 接收前端运行时错误上报，payload 为 `{ errors: ErrorReportEntry[] }` 或单个 `ErrorReportEntry`。该接口不要求登录，但限制请求体为 16 KB、单批最多 10 条，并对消息、分类、URL 和行列字段做类型与长度归一化；有效请求通过 D1 原子计数按来源 IP 限制为每分钟 12 次，已封禁来源可由当前 Worker isolate 内存快速拒绝。超大请求返回 HTTP 413，高频请求返回 HTTP 429，无效 JSON 或无有效条目返回 HTTP 400。Worker 只把有限字段写入 `console.error`，响应中的 `received` 表示实际接收条数；前端会对同一错误做 60 秒去重，且上报失败不得影响页面主流程。

## 认证接口

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/login` | `LoginReq` | `LoginResp` |
| POST | `/api/logout` | 无 | `null` |
| GET | `/api/me` | 无 | `{ username: string }` |

全新部署通过 `/install` 初始化管理员：`POST /api/install` 使用 `SETUP_TOKEN` 授权，并将管理员密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。`INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 和初始化凭据标记仅用于已有旧数据库的升级或凭据恢复：修改兼容变量后，下一次登录会同步更新 D1 中的管理员凭据；后台账号安全修改后的密码不会被未变化的初始化变量覆盖。旧数据库可通过新的 `RESET_ADMIN_CREDENTIALS` 标记执行一次强制重置。
`LoginResp` 包含 `token`、`expires_at` 和 `username`，前端登录成功后直接使用返回的 `username` 更新登录态并停留/返回前台首页，不再额外请求 `/api/me` 或立即预加载后台分包。登录接口会在 bootstrap 初始化时用一次 settings 查询同时读取管理员账号和密码，并复用该结果进行密码校验，避免重复读取账号/密码设置。已有登录态刷新页面时会先恢复本地 session 和可能存在的 `AdminData` 快照，再请求 `/api/data/version` 确认远端版本；版本变化时才请求 `/api/admin/data`。只有显式刷新用户信息时才需要 `/api/me`。

## 后台聚合接口

全部需要登录。

| 方法 | 路径 | 返回 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/data` | `AdminData` | 后台初始化聚合数据，一次返回分类、书签和完整 `Settings`，用于替代进入后台时分别请求公开数据和设置 |

`AdminData` 和 `PublicData` 响应可携带可选 `version` 字段，前端只用于快照校验，不参与页面渲染。前端会按当前登录态把 `AdminData` 写入浏览器本地快照（优先 localStorage，超出限制时仍可用 Cache Storage）；匿名公开数据也会写入同源本地快照。页面刷新时可以先用快照恢复界面，随后请求 `/api/data/version`：版本相同则不拉完整数据，版本不同才请求 `/api/admin/data` 或 `/api/public/data`。完整聚合请求默认带 no-cache 指令，服务端收到后会绕过 Worker isolate 内的短 TTL 运行时聚合缓存。退出登录会清除本地后台快照。

## 分类接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/categories` | 无 | `Category[]` |
| POST | `/api/categories` | `CategoryUpsertReq` | `Category` |
| PUT | `/api/categories/:id` | `CategoryUpsertReq` | `Category` |
| DELETE | `/api/categories/:id` | 无 | `null` |
| POST | `/api/categories/batch-delete` | `{ ids: number[] }` | `{ deleted: number, deleted_bookmarks: number }` |
| POST | `/api/categories/sort` | `CategorySortReq` | `null` |

`Category`、公开分类和 `CategoryUpsertReq` 均包含 `parent_id: number | null`。`null` 表示一级分类，非空值必须指向现有一级分类；服务端拒绝自身父级、三级结构，以及把仍有子分类的一级分类移动到其他父级。旧客户端更新请求缺少 `parent_id` 时保留当前父级，新建请求缺少该字段时创建为一级分类。

`CategorySortReq` 为 `{ parent_id: number | null, ids: number[] }`。`ids` 必须与该父级作用域下的完整兄弟集合完全一致，服务端拒绝重复、缺失、跨父级或额外 ID。分类存在子分类时，单个删除和包含该分类的批量删除均返回冲突错误且不写入任何删除；无子分类时仅删除该分类及其直属书签。

## 书签接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/bookmarks` | 无 | `Bookmark[]` |
| POST | `/api/bookmarks` | `BookmarkUpsertReq` | `Bookmark` |
| PUT | `/api/bookmarks/:id` | `BookmarkUpsertReq` | `Bookmark` |
| DELETE | `/api/bookmarks/:id` | 无 | `null` |
| POST | `/api/bookmarks/batch-delete` | `{ ids: number[] }` | `{ deleted: number }` |
| POST | `/api/bookmarks/sort` | `SortReq` | `null` |
| POST | `/api/bookmarks/:id/icon-cache/refresh` | 无 | `{ icon_blob: string \| null }` |

`POST /api/bookmarks/:id/icon-cache/refresh` 会按当前书签图标和 `icon_source` 刷新可持久化图标缓存：普通 HTTP(S) 图标在短超时时间内尝试写入 `bookmarks.icon_blob` 并返回 data URI，data URI 图标原样写入；Iconify、logo_surf 或非持久化来源会清空或跳过 `icon_blob`。前端只在编辑、保存等显式刷新动作调用该接口；编辑弹窗会先打开，再在后台触发刷新并把返回的 `icon_blob` 同步写入浏览器本地缓存。普通 HTTP(S) 图标抓取超时或失败时接口会尽快返回已有 `icon_blob` 或 `null`，前端可继续使用已保存的原始图标 URL 作为显示兜底。

批量删除请求最多包含 500 个正整数 ID；服务端会去重并忽略已不存在的记录。书签写入可携带 `description_mode: "always" | "hover" | "hidden" | null`；更新时省略该字段会保留原覆盖值，显式 `null` 会恢复跟随全局设置。

## 图标接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/fetch-favicon?url=` | 登录 | 服务端解析目标站 favicon，失败回退 Google s2 |
| GET | `/api/icon/:id` | 无 | 书签图标代理。优先返回 Cloudflare edge cache；cache miss 时一次读取书签图标地址、标题和 D1 中缓存的 `icon_blob`；无 blob 时按书签保存的 HTTP(S) 图标地址服务端抓取并写回 D1；普通 HTTP(S) 外站抓取失败、图标缺失、非 HTTP(S) 值或缓存损坏时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/category-icon/:id` | 无 | 分类图标代理。优先返回 Cloudflare edge cache；HTTP(S) 分类图标由 Worker 服务端抓取；外站失败或图标缺失时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/iconify/:set/:name.svg` | 无 | Iconify 图标预览代理。新增/编辑书签弹窗通过该同源代理预览 Iconify 图标，成功响应可被浏览器 Service Worker 与 Cloudflare edge cache 复用；失败时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再回退 `/favicon.ico` 和 Google。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色；中文标题优先按两个字一行换行，长标题最多 4 行并自动缩放字号。
- `google`：使用 Google s2 favicons 接口。
- `iconify`：使用 Iconify SVG API，保存格式为 `https://api.iconify.design/{set}/{name}.svg`，例如 `mdi:home` 或 `https://icon-sets.iconify.design/mdi/home/` 会转换为 `https://api.iconify.design/mdi/home.svg`；新增/编辑弹窗会展示 Iconify 候选，候选、手动输入预览和 icon-sets 页面链接都通过 `/api/iconify/{set}/{name}.svg` 代理加载。
- `custom`：手动填写 URL、表情、纯文字或图床地址。非 URL / 非 data URI 的值会在首页按文本图标直接渲染。

创建或更新书签后，前端会对普通 HTTP(S) 图标显式调用刷新接口，尽量缓存到 `bookmarks.icon_blob`；Iconify 图标和 icon-sets 页面链接不写入 `icon_blob`，后台预览由 `/api/iconify/:set/:name.svg`、Cloudflare edge cache 和同源 Service Worker 缓存复用。更新书签但图标地址或图标来源未改变时不会清空已有 `icon_blob`。首页卡片普通渲染时优先读取聚合数据里的 `icon_blob`，没有内嵌图标时才读取浏览器本地图标缓存；两者都缺失时，可回退使用已保存的普通 HTTP(S) 图标 URL，避免 favicon.im 等可浏览器直连的图标保存后退成文字。普通渲染不主动把 `/api/icon/:id` 挂载到首页 `<img>` 上；只有编辑/保存等显式刷新动作会调用刷新接口。分类图标默认使用 `/api/category-icon/:id?v=...`，已保存的 Iconify 书签图标首页可直接使用标准 Iconify SVG URL，并依赖浏览器 HTTP 缓存复用；后台预览仍使用稳定的 `/api/iconify/:set/:name.svg`。

前端普通渲染普通 HTTP(S) 书签图标时应先读取聚合数据中的 `icon_blob`，没有内嵌图标时再读取浏览器本地图标缓存，缓存缺失时可使用保存的原始 HTTP(S) 图标 URL 兜底；不要直接把 `/api/icon/:id` 挂载到首页 `<img>`，后台列表仍可把 `/api/icon/:id` 作为兼容预览入口。`/api/icon/:id` 主要作为兼容兜底代理和旧缓存入口保留。持久化的 Iconify 图标首页可使用标准 `https://api.iconify.design/*.svg`，由浏览器 HTTP 缓存复用，避免每个 Iconify 书签都消耗 Worker 请求；后台预览和新增/编辑弹窗仍可规范化为 `/api/iconify/*`。图标缺失、非 HTTP(S) 值或缓存损坏时，代理返回 `no-store` 临时 SVG fallback，不写入长期缓存。Service Worker 对 `/api/icon/*`、`/api/category-icon/*`、`/api/iconify/*` 使用 cache-first 策略，但不会缓存带 `X-Icon-Fallback: 1` 的临时 fallback；对跨域 `https://api.iconify.design/*.svg` 不缓存 `opaque` 响应，并跳过超过 512KB 的图标响应，避免 Cache Storage 膨胀。同一个 Iconify 图标应共享稳定缓存键，不按书签 ID 重复缓存。

HTTP(S) 图标抓取成功后，代理会直接返回图片字节并写入 Cloudflare edge cache；只有书签图标需要写入 `bookmarks.icon_blob` 时才生成 base64 data URI，避免 Iconify 预览和分类图标在 Worker 内部做不必要的 base64 编解码。

公开聚合、后台聚合、书签列表和图标详情等读取路径默认直接执行查询，避免每个 Worker isolate 冷启动都先跑 `PRAGMA table_info`。如果遇到旧库缺列错误，后端会执行一次兼容 schema 检查/迁移并重试当前查询。

## 首页搜索行为

首页搜索框输入关键词时直接切换到全站分组搜索结果，不再弹出本地书签下拉选择。匹配字段包括书签标题、URL、描述和完整分类路径。搜索父分类名称可命中后代分类书签；结果保留命中子分类的父级，并只渲染存在匹配内容的分支。按 Enter 仍按当前搜索引擎配置跳转外部搜索。

## 设置接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | `Settings` |
| PUT | `/api/settings` | `SettingsUpdateReq` | 更新后的 `Settings` |

设置存储在 D1 `settings` 表中，`value` 为 JSON 字符串。后端读取时聚合为完整 `Settings` 对象，并对缺失字段使用默认值。后台设置面板提交完整 `Settings` 字段时，`PUT /api/settings` 写入 D1 后直接用本次提交的 payload 和默认值合成响应，避免额外回读 settings 全表；只提交部分字段的兼容请求仍会写入后读取完整 `Settings` 返回。

`navigation` 是公开设置对象，结构为 `{ position: 'left' | 'top', always_expanded: boolean }`。缺失或非法的 D1 历史值读取时回退为 `{ position: 'left', always_expanded: false }`；更新接口拒绝未知位置或非布尔 `always_expanded`。`always_expanded` 只控制桌面左侧布局，顶部和移动端不会应用该值，但后台切换布局时会保留原配置。

背景配置保留旧版 `background` 字段作为兼容值，并新增 `backgrounds.light` / `backgrounds.dark` 分别保存浅色和深色主题的背景类型、背景值、模糊度、遮罩透明度和遮罩颜色。公开首页渲染时按当前实际主题优先读取 `backgrounds` 中对应配置；旧备份或旧数据库缺少 `backgrounds` 时，后端会用旧 `background` 自动派生两套背景。

后台设置面板内置 22 组背景方案。`Settings` 与 `PublicSettings` 通过 `background_preset_id` 持久化当前选择，取值分为：

- 护眼纯色：`paper-sage`、`paper-clay`、`paper-wheat`、`paper-slate`、`paper-pine`、`paper-sakura`、`paper-lavender`、`paper-indigo`、`paper-amber`；
- 毛玻璃渐变：`clear-teal`、`mist-slate`、`coral-sky`、`sage-graphite`、`lumen-amber`、`ember-night`、`violet-dawn`、`ocean-depths`、`aurora-borealis`、`citrus-sunset`、`rose-orbit`、`indigo-noir`、`terracotta-dune`；
- 自定义：`custom`。

选择内置方案时前端同时写入对应的 `backgrounds`、遮罩、卡片背景透明度和自动文字色设置。护眼纯色默认将 `card_background_opacity` 设为 `0.9`，浅色模式使用与页面背景同色系的浅卡片色，暗色模式使用预设的深色卡片色；该透明度同时作用于书签卡片、搜索框和分类导航。运行时根据 `background_preset_id` 选择对应的亮暗强调色和高对比标题/备注颜色，用户设置的 `card_text_color` 始终优先。

旧数据缺少 `background_preset_id`，或仍为 `custom` 但浅色/深色背景值匹配内置方案时，后台面板会自动识别并显示对应预设。旧版护眼配置中的白色卡片背景会在公开设置聚合时映射为当前护眼预设的同色系卡片色；用户保存的非白色卡片背景保持不变。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

`ImportReq.mode` 支持 `replace` 和 `merge`。旧备份缺少 `parent_id` 时按一级分类处理。合并模式按去除首尾空格、忽略大小写的完整分类路径复用现有分类，因此不同父分类下允许同名子分类；重复 URL 保留，当前站点设置保持不变。

导入在写入前验证分类深度、父级引用和书签分类引用。覆盖和合并都会先建立旧分类 ID 到新分类 ID 的映射，按一级分类、二级分类、书签的顺序重建，并同时重写二级分类 `parent_id` 与书签 `category_id`。设置仅在覆盖导入中写入受支持的公开配置 key，不触碰管理员账号字段。`ImportResp` 包含导入数量和导入后的 `AdminData`，前端使用该响应更新本地数据并显式同步导入状态。
