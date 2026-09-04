# CF-Navs API 契约

共享类型定义见 `shared/types.ts`。前端和后端都应以共享类型为准；修改接口时同步更新本文件和 `shared/types.ts`。

## 通用约定

- 所有接口前缀为 `/api`。
- 常规响应使用统一包络：`{ code, msg, data }`。
- 业务错误通常仍返回 HTTP 200，用 `code` 区分；认证中间件拦截返回 HTTP 401 且 `code=1001`。
- 受保护的写操作使用 `Authorization: Bearer <token>` 鉴权；安装接口使用一次性的 `X-Setup-Token`，公开点击计数接口不要求登录。
- 时间戳使用毫秒数，即 `Date.now()`。

## 鉴权规则

- `authRequired`：读取 Bearer token，用 `settings.jwt_secret` 校验 HS256 签名和 `exp`；在 `SESSION` 绑定存在时再查 KV 撤销名单。签名、过期或撤销不通过返回 401；KV 读取故障可能由全局错误处理返回服务端错误；缺少 `SESSION` 绑定时会跳过撤销检查，部署必须正确配置该绑定。
- 会话是无状态 JWT，payload 为 `{ username, exp, jti }`。`jti` 保证同一毫秒内的两次登录也会签出不同 token，否则「退出这台设备」会连带撤销另一台。
- `POST /api/logout` 把当前 token 的 SHA-256 摘要写入 KV `revoked:<sha256>`，TTL 为 `max(60 秒, token 剩余寿命)`，以满足 KV `expirationTtl` 的下限。用摘要而不是 token 本身做 key，避免 KV 被 dump 时泄露仍在有效期内的 token。其它 isolate 上最多 15 秒后才感知到撤销，这是内存缓存换来的固定窗口；logout 的 KV 写入失败时接口仍完成，但撤销未落库，token 会继续有效到 `exp`。
- 修改密码和凭据重置走 `rotateJwtSecret`，一次性作废全部会话。
- KV `SESSION` 绑定当前只用于登录限流（`rl:login:*`）、点击计数限流（`rl:click:*`）和会话撤销名单（`revoked:*`），不再存储会话本身。
- `/api/public/data`：匿名请求默认可查公开数据 edge cache；缓存未命中时先复用 `/api/config` edge cache，仍未命中才读取轻量 `site_title/public_mode`，公开模式关闭则要求有效 token，否则返回 `code=1005`，该轻量 1005 响应也会短时写入 edge cache。请求带 `Cache-Control: no-cache`、`Cache-Control: no-store`、`Cache-Control: max-age=0` 或 `Pragma: no-cache` 时，服务端必须绕过公开数据和站点配置 edge cache。
- `/api/data/version`：用一次 `settings` 查询同时读取 `site_title`、`public_mode` 和内部 `data_version`，返回轻量版本号；公开模式关闭时匿名请求返回 `code=1005` 并携带轻量站点配置，登录态请求需通过 token 校验。这是每次页面加载都会走的热路径，查询条数是契约。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/data/version` | 公开模式或登录 | `DataVersionResp` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |
| POST | `/api/public/bookmarks/:id/click` | 无 | `null` |
| POST | `/api/error-report` | 无 | `{ received: number }` |

`/api/config` 使用短 TTL Cloudflare edge cache，设置保存或数据导入后会主动失效，主要作为兼容和兜底轻量配置接口。前端普通启动路径优先使用本地快照加 `/api/data/version` 做远端确认；本地无可用快照或版本变化时，才请求 `/api/public/data` 或 `/api/admin/data` 派生站点配置。公开模式关闭时，匿名 `/api/public/data` 的 1005 响应会在 `data` 中携带 `{ site_title, public_mode: false }`，登录页无需再额外请求 `/api/config`。该 1005 响应使用浏览器 `max-age=0` 和短 edge TTL，避免本地浏览器缓存卡住公开模式切换，同时减少私有站点匿名访问对 D1 的重复读取。`/api/public/data` 只查询并返回首页渲染需要的公开设置、分类和书签字段，书签公开字段携带用于轻量判断图标缓存的 `icon_cached`，`icon_blob` 恒为 `null`，但不包含 `admin_username`、`admin_password` 等内部字段，也不包含分类/书签的 `created_at`。**注意 `custom_css` 与 `custom_js` 属于公开设置**（见 `shared/settings.ts` 的 `PUBLIC_SETTINGS_KEYS`）：它们会随公开数据下发给每个匿名访客并在其浏览器中生效，这是「自定义 CSS/JS」这个功能的预期行为；未携带 no-cache 指令的匿名公开访问会先查短 TTL edge cache，命中时直接返回而不读取 D1。前端拉取完整聚合数据时默认带 `Cache-Control: no-cache`、`Pragma: no-cache` 和 fetch `cache: "no-store"`；服务端收到 no-cache 指令或带登录态请求时会绕过匿名缓存。缓存未命中时，服务端先复用或预热 `/api/config` 的轻量 edge cache 来判断是否公开，公开时再通过一次 D1 batch 聚合读取公开 settings、分类和书签；如果同一请求刚从 D1 读取过 `site_title/public_mode`，公开 settings 查询会跳过这两行并把已知值合并回响应。

`/api/error-report` 接收前端运行时错误上报，payload 为 `{ errors: ErrorReportEntry[] }` 或单个 `ErrorReportEntry`。该接口不要求登录，但限制请求体为 16 KB、单批最多 10 条，并对消息、分类、URL 和行列字段做类型与长度归一化；有效请求通过 D1 原子计数按来源 IP 限制为每分钟 12 次，已封禁来源可由当前 Worker isolate 内存快速拒绝。超大请求返回 HTTP 413，高频请求返回 HTTP 429，无效 JSON 或无有效条目返回 HTTP 400。Worker 只把有限字段写入 `console.error`，响应中的 `received` 表示实际接收条数；前端会对同一错误做 60 秒去重，且上报失败不得影响页面主流程。

`POST /api/public/bookmarks/:id/click` 由首页在打开书签时调用，成功后将对应 `click_count` 加一。每个 IP 与书签 ID 组合在 10 分钟内最多计数 3 次，超过后仍返回成功但不重复增加计数；点击计数不会提升 `data_version`，后台访问分析打开时会强制刷新后台聚合数据。

## 安装接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| GET | `/api/install/status` | 无 | 无 | `InstallStatusResp` |
| POST | `/api/install` | `X-Setup-Token` + 同源请求 | `InstallReq` | `LoginResp` |

`POST /api/install` 只允许同源请求，在数据库未安装时校验 `X-Setup-Token`，初始化内置 schema、创建管理员并返回登录会话。安装状态、绑定缺失、数据库不可用和缺少 `SETUP_TOKEN` 均通过 `InstallStatusResp` 区分；安装完成后再次安装会被拒绝。

## 认证接口

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/login` | `LoginReq` | `LoginResp` |
| POST | `/api/logout` | 无 | `null` |
| POST | `/api/password` | `ChangePasswordReq` | `null` |
| GET | `/api/me` | 无 | `{ username: string }` |

全新部署通过 `/install` 初始化管理员：`POST /api/install` 使用 `SETUP_TOKEN` 授权，并将管理员密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。`INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 和初始化凭据标记仅用于已有旧数据库的升级或凭据恢复：修改兼容变量后，下一次登录会同步更新 D1 中的管理员凭据；后台账号安全修改后的密码不会被未变化的初始化变量覆盖。旧数据库可通过新的 `RESET_ADMIN_CREDENTIALS` 标记执行一次强制重置。
`LoginResp` 包含 `token`、`expires_at` 和 `username`，前端登录成功后直接使用返回的 `username` 更新登录态并停留/返回前台首页，不再额外请求 `/api/me` 或立即预加载后台分包。登录接口会在 bootstrap 初始化时用一次 settings 查询同时读取管理员账号和密码，并复用该结果进行密码校验，避免重复读取账号/密码设置。已有登录态刷新页面时会先恢复本地 session 和可能存在的 `AdminData` 快照，再请求 `/api/data/version` 确认远端版本；版本变化时才请求 `/api/admin/data`。只有显式刷新用户信息时才需要 `/api/me`。
`POST /api/logout` 会尝试把当前 token 写入 KV 撤销名单，TTL 为 `max(60 秒, token 剩余寿命)`。KV 写入成功后，同一 isolate 会立即按撤销名单拒绝该 token，其它 isolate 可能因最多 15 秒的内存缓存延迟感知。若 logout 的 KV 写入失败，退出流程仍完成但 token 会继续有效到 `exp`；后续请求若 KV 读取也失败，鉴权可能返回错误。前端同时清除本地登录态。

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
| POST | `/api/bookmarks/batch-move` | `BookmarkBatchMoveReq` | `BookmarkBatchMoveResp` |
| POST | `/api/bookmarks/sort` | `SortReq` | `null` |
| POST | `/api/bookmarks/reorganize` | `BookmarkReorganizeReq` | `null` |
| POST | `/api/bookmarks/:id/icon-cache/refresh` | 无 | `{ icon_blob: string \| null }` |
| POST | `/api/bookmarks/check-health` | `{ ids: number[] }` | `{ id, status, ok }[]` |

`POST /api/bookmarks/:id/icon-cache/refresh` 会按当前书签图标和 `icon_source` 刷新可持久化图标缓存：普通 HTTP(S) 图标在短超时时间内尝试写入 `bookmarks.icon_blob` 并返回 data URI，data URI 图标原样写入；Iconify、logo_surf 或非持久化来源会清空或跳过 `icon_blob`。前端只在编辑、保存等显式刷新动作调用该接口；编辑弹窗会先打开，再在后台触发刷新并把返回的 `icon_blob` 同步写入浏览器本地缓存。普通 HTTP(S) 图标抓取超时或失败时接口会尽快返回已有 `icon_blob` 或 `null`，前端可继续使用已保存的原始图标 URL 作为显示兜底。

批量删除请求最多包含 500 个正整数 ID；排序请求的 `ids` 最多 5000 个；服务端会去重并忽略已不存在的记录。书签 `url` 必须是 `http(s)` 地址，其它协议返回 `code=1002`；后台表单会先把缺协议的写法（`example.com`）补成 `https://` 再提交，补不了的原样送出由服务端拒绝。书签写入可携带 `description_mode: "always" | "hover" | "hidden" | null`；更新时省略该字段会保留原覆盖值，显式 `null` 会恢复跟随全局设置。
`POST /api/bookmarks/batch-move` 用于管理员批量移动书签，不改变 `/api/bookmarks/reorganize` 的完整排序契约。请求为 `{ ids: number[], category_id: number, position: 'end' | 'start', expected: { id: number, category_id: number, sort: number }[] }`；`ids` 最多 500 个且不得重复，`expected` 必须与 `ids` 一一对应，用于拒绝过期集合。`position='end'` 追加到目标分类现有书签末尾，`position='start'` 插入目标分类开头；默认由前端传 `end`。服务端必须在一次原子操作中更新选中书签的 `category_id` 和受影响书签的全局 `sort`，校验失败不得部分成功。选中集合、快照、目标分类或权限不一致返回 `code=1006`（`ErrCode.CONFLICT`）；其它服务端故障返回 `code=1500`。成功返回 `{ moved, category_id, position }`。
`POST /api/bookmarks/reorganize` 是首页跨分类整理会话的保存通道。请求为 `{ category_orders: Array<{ category_id: number, ids: number[] }> }`，`category_id` 与全部 `ids` 必须是正整数，否则返回 `code=1002`。服务端按分类提交的完整顺序一次性重写受影响书签的 `category_id` 与全局 `sort`（单个 `db.batch`，不拆多批）。**payload 必须覆盖库中每一个书签**：数量不符或有书签未出现在任何 `category_orders` 里都会失败；同一 `category_id` 重复出现、同一书签 id 出现在多个分类里、`category_id` 指向不存在的分类，同样失败。以上都归为状态冲突。请求集合与库中状态不一致（分类被删、书签集合过期）时返回 `code=1006`（`ErrCode.CONFLICT`），前端据此提示「数据已变化，请刷新后重试」并重新拉取；其它故障返回 `code=1500`。`batch-move` 沿用同一 `BookmarkReorganizeError` → `CONFLICT` 判定。

`POST /api/bookmarks/check-health` 最多检查请求中的前 20 个书签，Worker 先用 HEAD 请求目标地址，遇到 405、403 或 400 时回退 GET，单个目标超时为 3 秒，返回 HTTP 状态码、`ok`、`timeout` 或 `error`。

## 站点信息接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/fetch-site-meta?url=` | 登录 | `SiteMetaResp` |

新增书签时用于自动解析站点名称。服务端抓取目标页并解析标题，**接口不会失败**：非法 `url` 返回 `code=1002`，其余任何情况（抓取超时、非 HTML、反爬拦截、解码失败）都返回 `code=0`，`title` 退回去掉 `www.` 前缀的域名。

名称按用户输入的地址判断意图：`url` 指向根路径（`/`、空路径或 `index.html` 一类默认文档）时优先取 `og:site_name`，再依次尝试 `og:title`、`twitter:title`、`<title>`；深层链接则优先 `og:title`，再依次 `twitter:title`、`<title>`、`og:site_name`。根/深层的判定使用请求地址而非重定向落点，因为它代表用户的收藏意图。**域名兜底同样使用请求地址**：需要登录的站点（如 `mail.google.com`）会被跳转到登录域，用落点域名当书签名没有意义。

解析结果会做归一化：解码 HTML 实体（单次扫描，不会把 `&amp;lt;` 二次解码）、折叠空白、剥离控制字符与零宽/双向控制符、按 Unicode 码位截断到 80。占位、反爬和登录页标题（`Untitled`、`无标题`、`404 Not Found`、`Just a moment...`、`Sign in - Google Accounts`、`登录 - 知乎` 等）以及解码失败（含 U+FFFD）的候选会被跳过并继续尝试下一来源，全部失败才用域名兜底。登录页判定刻意保守：只在整个标题就是登录字样、或登录字样后紧跟分隔符时命中，`Login Manager 使用手册` 这类正常标题不会被误判。

页面抓取共用 `worker/lib/pageMetadata.ts`：单次请求 3 秒超时，整体 4 秒 deadline，按 BOM → `Content-Type` charset → `<meta charset>` 的顺序选择解码器，因此 GBK/GB2312/Big5 等非 UTF-8 页面也能解出正确标题；不支持的 charset label 回退 UTF-8。目标地址中内嵌的账号密码会在请求前剥离。

响应体采用流式读取：标题和 og 标签都在 `<head>` 内，读到 `</head>` 即停止拉取后续分片并断开连接，最多读取 128KB，因此不会为了一个标题下载整页内容。`/api/fetch-favicon` 的 `<link rel="icon">` 解析共用同一条路径，同样只读 `<head>`。

解析成功的结果会写入 Cloudflare edge cache（6 小时，按目标地址建合成缓存键，不含 `Authorization`），重复解析同一地址直接命中缓存。**域名兜底的结果不写缓存**，避免一次抓取失败或被拦截后，用户重试时长时间拿到同一个坏结果。

出网目标过滤：`/api/fetch-site-meta` 与 `/api/fetch-favicon` 共用 `parseTargetUrl`，拒绝指向环回、私有、链路本地（含云元数据 `169.254.169.254`）、运营商级 NAT、组播保留段的 IPv4/IPv6 字面量，以及 `localhost`、`*.local`、`*.internal`、`metadata.google.internal` 等内部主机名，被拒绝时返回 `code=1002`。`favicon` 解析出的 `<link rel="icon">` 候选来自第三方页面，同样经过该过滤，避免恶意页面绕过入口检查。该防线只检查地址字面量：`new URL()` 会先把 `2130706433`、`0x7f.0.0.1` 一类写法归一成点分形式，因此常见进制绕过已被拉平，但它**挡不住 DNS 重绑定**（合法域名解析到内网），Workers 没有可插手的解析钩子。

前端只在**新增**书签、书签标题为空、且网址输入框失焦时调用该接口；返回后会再次确认标题仍为空才写入，请求在途期间用户已输入标题则丢弃结果。写入表单前按字素簇截断到 20 个字符（复用 `src/lib/truncateUnicodeText.ts`，与后台列表一致），超长时以 `…` 结尾，避免标题输入框内容超出可视范围不便修改；接口本身仍返回最长 80 个字符的完整结果。

需要注意接口的能力边界：它只解析服务端返回的静态 HTML。由 JavaScript 在页面加载后改写的标题（常见于 SPA，例如静态 `<title>` 是模板默认值、真实站点名由前端调接口取回后再设置）无法获取，这类站点只能拿到静态 HTML 里的原始标题，需要用户手动修改。

因为这是用户没有主动触发的后台请求，前端调用时带 `keepSessionOnUnauthorized`：接口返回 401 或 `code=1001` 时**不清除本地登录态**，避免 token 恰好过期时把用户正在填写、尚未保存的书签表单一起丢掉。用户主动发起的请求仍然按原有规则清除登录态。

## 图标接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/fetch-favicon?url=` | 登录 | 服务端依次解析目标站 `<link rel="icon">`、Web App Manifest `icons[]`、`/favicon.ico`，失败或超时回退 `favicon.im` |
| GET | `/api/iconify-search?query=` | 登录 | 搜索 Iconify 候选并返回预览地址 |
| GET | `/api/icon/:id` | 无 | 书签图标代理，**只对匿名可见的书签返回真实图标**（见下方可见性规则）。通过判定后优先返回 Cloudflare edge cache；cache miss 时读取书签的图标地址、标题与 D1 中缓存的 `icon_blob`；无 blob 时按书签保存的 HTTP(S) 图标地址服务端抓取并写回 D1；普通 HTTP(S) 外站抓取失败、图标缺失、非 HTTP(S) 值或缓存损坏时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/category-icon/:id` | 无 | 分类图标代理，**只对匿名可见的分类返回真实图标**（见下方可见性规则）。优先返回 Cloudflare edge cache；cache miss 时一次读取全部分类，同时算出可见集合与目标分类；HTTP(S) 分类图标由 Worker 服务端抓取；外站失败或图标缺失时返回临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |
| GET | `/api/iconify/:set/:name.svg` | 无 | Iconify 图标预览代理。新增/编辑书签弹窗通过该同源代理预览，成功响应可被 Cloudflare edge cache 复用；失败时返回 `no-store` 临时 SVG 文字图标，并带 `X-Icon-Fallback: 1` |

**图标端点的匿名可见性规则。** `/api/icon/:id` 与 `/api/category-icon/:id` 按可猜测的整数 ID 寻址且不要求登录，因此两者都在返回真实图标前做一次可见性判定，口径与 `/api/public/data` 完全一致：私密书签不可见；公开书签只要挂在私密分类（或私密分类的后代）下同样不可见；私密分类及其后代不可见。层级规则复用 `getPublicCategoryIds` 的祖先链遍历，不在图标端点重复实现。被拒绝的请求返回**不含标题与域名**的兜底 SVG（`public, max-age=300`，带 `X-Icon-Fallback: 1`），与「ID 不存在」的响应完全一致，不提供存在性或内容线索——兜底 SVG 会渲染标题前 4 个字符或 URL 的 hostname，所以这两条路径必须传空标题与空 URL。只有 HTTP 400（非正整数 ID）走 `no-store`。

判定发生在 cache 命中查询**之后**，因此收紧判定口径时必须同时递增 `worker/lib/iconResponses.ts` 的 `ICON_CACHE_NAMESPACE`：edge cache 的键不含身份，旧条目是在没有判定的情况下写入的，`s-maxage` 为 6 天，只加服务端过滤不会让它们失效。命名空间体现在缓存键的 `ns` 参数上，与前端用于图标更新失效的 `v` 参数并存。可见性判定给 `/api/icon/:id` 的 cache miss 增加一次分类表读取（`/api/category-icon/:id` 不增加，它本来就要读分类），命中路径不受影响，同源请求数也不变。

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再解析 Web App Manifest `icons[]`，回退 `/favicon.ico`，最终回退 `https://favicon.im/{hostname}?larger=true`。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色；中文标题优先按两个字一行换行，长标题最多 4 行并自动缩放字号。
- `google`：历史来源名称，当前实现与 Favicon.im 候选一致，使用 `https://favicon.im/{hostname}?larger=true`，参数 `size` 不再影响结果。
- `iconify`：使用 Iconify SVG API，保存格式为 `https://api.iconify.design/{set}/{name}.svg`，例如 `mdi:home` 或 `https://icon-sets.iconify.design/mdi/home/` 会转换为 `https://api.iconify.design/mdi/home.svg`；新增/编辑弹窗会展示 Iconify 候选，候选、手动输入预览和 icon-sets 页面链接都通过 `/api/iconify/{set}/{name}.svg` 代理加载。
- `custom`：手动填写 URL、表情、纯文字或图床地址。非 URL / 非 data URI 的值会在首页按文本图标直接渲染。

创建或更新书签后，前端会对普通 HTTP(S) 图标显式调用刷新接口，尽量缓存到 `bookmarks.icon_blob`；Iconify 图标和 icon-sets 页面链接不写入 `icon_blob`，后台预览由 `/api/iconify/:set/:name.svg` 和 Cloudflare edge cache 复用。更新书签但图标地址或图标来源未改变时不会清空已有 `icon_blob`。**聚合响应不下发 `icon_blob`（该字段为 `null`），而以 `icon_cached` 表示 D1 中是否已有持久化缓存**；首页据此配合浏览器本地图标缓存、`/api/icon/:id` 兼容路径或已保存的普通 HTTP(S) URL 取得图标。普通渲染不主动把 `/api/icon/:id` 挂载到首页 `<img>` 上；只有编辑/保存等显式刷新动作会调用刷新接口。HTTP(S) 分类图片使用 `/api/category-icon/:id?v=...`，data URI、文字和表情分类图标直接渲染；一级标题、二级标签、搜索分组和折叠导航复用相同解析与图片失败回退规则。已保存的 Iconify 书签图标首页可直接使用标准 Iconify SVG URL，并依赖浏览器 HTTP 缓存复用；后台预览仍使用稳定的 `/api/iconify/:set/:name.svg`。

前端普通渲染普通 HTTP(S) 书签图标时应读取聚合数据中的 `icon_cached` 轻量标志，不应假设聚合响应携带二进制 `icon_blob`；缓存缺失时再读取浏览器本地图标缓存或保存的原始 HTTP(S) 图标 URL 兜底。不要直接把 `/api/icon/:id` 挂载到首页 `<img>`，后台列表仍可把 `/api/icon/:id` 作为兼容预览入口——但**该入口对私密对象只返回兜底图标**，后台预览私密书签/私密分类的真实图标需要另设签名 URL 或等价凭据通道，属未实现项。持久化的 Iconify 图标首页可使用标准 `https://api.iconify.design/*.svg`，由浏览器 HTTP 缓存复用，避免每张图标都占用一次同源 Worker 请求。

HTTP(S) 图标抓取成功后，代理会直接返回图片字节并写入 Cloudflare edge cache；只有书签图标需要写入 `bookmarks.icon_blob` 时才生成 base64 data URI，避免 Iconify 预览和分类图标在 Worker 内部做不必要的 base64 编解码。

公开聚合、后台聚合、书签列表和图标详情等读取路径默认直接执行查询，避免每个 Worker isolate 冷启动都先跑 `PRAGMA table_info`。如果遇到旧库缺列错误，后端会执行一次兼容 schema 检查/迁移并重试当前查询。

## 首页搜索行为

首页搜索框输入关键词时直接切换到全站分组搜索结果，不再弹出本地书签下拉选择。匹配字段包括书签标题、URL、描述和完整分类路径。搜索父分类名称可命中后代分类书签；结果保留命中子分类的父级，并只渲染存在匹配内容的分支。按 Enter 仍按当前搜索引擎配置跳转外部搜索。

## 数据导入接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/import` | `ImportReq` | `ImportResp` |

导入支持 `replace` 覆盖和 `merge` 追加合并两种模式；服务端在写入前校验分类深度、父级关系和书签引用，成功后返回导入后的后台聚合数据及分类复用、跳过书签等统计。

## 设置接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | `Settings` |
| PUT | `/api/settings` | `SettingsUpdateReq` | 更新后的 `Settings` |

设置存储在 D1 `settings` 表中，`value` 为 JSON 字符串。后端读取时聚合为完整 `Settings` 对象，并对缺失字段使用默认值。后台设置面板提交完整 `Settings` 字段时，`PUT /api/settings` 写入 D1 后直接用本次提交的 payload 和默认值合成响应，避免额外回读 settings 全表；只提交部分字段的兼容请求仍会写入后读取完整 `Settings` 返回。

`browser_sync_enabled` 默认值为 `false`，仅属于管理员设置，不会下发到公开设置。开启该设置时服务端会幂等创建根分类“浏览器新增收藏”；关闭时不会删除该分类或其中已有书签。

下表按 `shared/settings.ts` 的 `SETTINGS_KEYS` 顺序列出全部 30 个设置键。「取值范围」以服务端实际行为为准：PUT 校验见 `worker/routes/settings.ts`，归一化见 `shared/settings.ts` 与 `worker/lib/settingsData.ts`；类型注释写了范围但服务端不钳制的字段已逐项标出。默认值以 `worker/lib/settingsData.ts` 的 `DEFAULT_SETTINGS` 为准，并与 `schema.sql` 的 seed 对齐。未知键在两个方向都会被丢弃：写入和读取聚合都只遍历 `SETTINGS_KEYS`。

| 键名 | 类型 | 取值范围 | 归一化行为 | 默认值 |
| --- | --- | --- | --- | --- |
| `site_title` | `string` | 长度 ≤ 200 码位 | PUT 非字符串拒绝；不做内容归一化 | `'CF-Navs'` |
| `site_title_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串拒绝；不校验颜色语法 | `''` |
| `site_title_font_size` | `number` | 服务端不限范围 | PUT 只校验 `typeof number`；读取不钳制 | `32` |
| `public_mode` | `boolean` | `true` / `false` | PUT 非布尔拒绝 | `true` |
| `browser_sync_enabled` | `boolean` | `true` / `false` | PUT 非布尔拒绝；提交 `true` 时幂等创建同步根分类 | `false` |
| `theme` | `ThemeMode` | `'light'` / `'dark'` / `'auto'` | PUT 集合外拒绝 | `'light'` |
| `background_preset_id` | `BackgroundPresetId` | 22 个内置预设 ID 或 `'custom'` | PUT 集合外拒绝；读取时非法值归一化为 `'custom'`，键缺失取默认值而不是 `'custom'` | `'ocean-depths'` |
| `background` | `BackgroundSetting` | `type` 取 `'image'` / `'color'` / `'gradient'`；`value` ≤ 262144 码位；`maskColor` ≤ 64 码位；`blur` `0-20`、`mask` `0-1` 只是类型注释，服务端不钳制 | PUT 允许部分对象，只校验出现过的属性；读取时非对象整体回落默认，属性缺失或非法逐项回落默认，数值不四舍五入也不钳制 | 见 `DEFAULT_SETTINGS.background` |
| `backgrounds` | `ThemeBackgroundSettings` | `light` / `dark` 各自同 `background` | PUT 要求对象且 `light`、`dark` 均为合法背景对象；读取时逐主题逐属性归一化；整键缺失时由已归一化的 `background` 派生两套主题 | 见 `DEFAULT_SETTINGS.backgrounds` |
| `custom_css` | `string` | 长度 ≤ 65536 码位 | PUT 非字符串或超长拒绝；不做内容清洗 | `''` |
| `custom_js` | `string` | 长度 ≤ 65536 码位 | PUT 非字符串或超长拒绝；不做内容清洗 | `''` |
| `image_host_url` | `string` | 长度 ≤ 2048 码位 | PUT 非字符串或超长拒绝；不校验 URL 语法 | `''` |
| `search_engine` | `SearchEngineSetting` | 服务端不限引擎数量，也不限 `url_template` 形态 | PUT 只要求顶层是非数组对象，不校验 `engines` 元素与 `{q}` 占位符；读取不归一化 | Google 与 Bing 两条，见 `DEFAULT_SETTINGS.search_engine` |
| `card_size` | `CardSizeSetting` | `width` 40–400、`height` 0–300，整数 | PUT 与读取都过 `normalizeCardSizeSetting`：非对象按空对象，非有限数回落默认，有限数四舍五入后钳制。`width` 下限 2026-09-04 由 44 降到 40（PROB-28 / #13），低于 44 px 时点击区域小于触控推荐尺寸，属已知取舍 | `{ width: 80, height: 60 }` |
| `card_style` | `CardStyle` | `'info'` / `'icon'` | PUT 集合外拒绝 | `'info'` |
| `card_icon_size` | `number` | 40–100，整数 | PUT 与读取都过 `normalizeCardIconSize`，规则同 `card_size` | `60` |
| `category_display` | `CategoryDisplaySetting` | `root_font_size` 12–28、`root_icon_size` 14–36、`child_font_size` 11–24、`child_icon_size` 12–32，整数 | PUT 与读取都过 `normalizeCategoryDisplaySetting`，逐项回落默认后四舍五入并钳制 | `{ root_font_size: 16, root_icon_size: 20, child_font_size: 14, child_icon_size: 18 }` |
| `card_show_description` | `boolean` | `true` / `false` | PUT 非布尔拒绝；与 `card_description_mode` 双向联动，读取结果恒为 `card_description_mode === 'always'`，不是独立存储语义 | `true` |
| `card_description_mode` | `DescriptionDisplayMode` | `'always'` / `'hover'` / `'hidden'` | PUT 集合外拒绝；读取时合法值保留，缺失或非法则按旧 `card_show_description === false` 取 `'hidden'`，否则 `'always'` | `'always'` |
| `card_background_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串或超长拒绝；不校验颜色语法 | `'#ffffff'` |
| `card_background_opacity` | `number` | 类型注释为 `0-1`，服务端不钳制 | PUT 只校验 `typeof number` | `0.42` |
| `card_icon_show_title` | `boolean` | `true` / `false` | PUT 非布尔拒绝 | `true` |
| `card_text_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串或超长拒绝；不校验颜色语法 | `''` |
| `search_box_show` | `boolean` | `true` / `false` | PUT 非布尔拒绝 | `true` |
| `search_engine_selector_show` | `boolean` | `true` / `false` | PUT 非布尔拒绝 | `true` |
| `content_layout` | `ContentLayoutSetting` | `max_width_unit` 取 `'px'` / `'%'`；`margin_x` `0-100`px、`margin_top` / `margin_bottom` `0-50`% 只是类型注释，服务端不钳制 | PUT 允许部分对象，只校验出现过的属性；读取不补齐缺失子字段，因此部分对象会原样进入聚合结果 | `{ max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 }` |
| `navigation` | `NavigationSetting` | `position` 取 `'left'` / `'top'`；`always_expanded` 布尔；`top_layout` 取 `'scroll'` / `'wrap'` | PUT 只校验 `position` 与 `always_expanded`；读取时这两项非法则整项回落默认，`top_layout` 缺失或非法归一化为 `'scroll'`（详见下文 `navigation` 说明） | `{ position: 'left', always_expanded: false, top_layout: 'scroll' }` |
| `footer_html` | `string` | 长度 ≤ 65536 码位 | PUT 非字符串或超长拒绝；不做内容清洗 | `''` |
| `most_visited_count` | `number` | 聚合结果为 0–20 的整数 | PUT 无类型校验，原值入库；读取时 `Number(value) \|\| 0` 后四舍五入并钳制到 0–20，因此非数值变成 `0`，数值字符串会被转换 | `8` |
| `site_title_show` | `boolean` | 聚合结果按 truthiness 判定 | PUT 无类型校验，原值入库；读取时键存在即取 `Boolean(value)`，只有键缺失才为 `true`，因此字符串 `'false'` 会被判为 `true` | `true` |

字符串设置项超出上限时返回 `code=1002`，msg 中包含字段名与上限值；长度按 Unicode 码位计数，含 emoji 的标题不会被误判。逐字段上限见上表。背景值的上限尤其重要：它会随 `toPublicSettings` 进入每个访客的 `/api/public/data`，不限长会直接破坏性能契约中「聚合数据保持轻量」的约定。

`navigation` 是公开设置对象，结构为 `{ position: 'left' | 'top', always_expanded: boolean, top_layout: 'scroll' | 'wrap' }`。缺失或非法的 D1 历史值读取时，`position`/`always_expanded` 回退为原默认值，缺失或非法 `top_layout` 归一化为 `'scroll'`；当前更新接口显式校验 `position` 与 `always_expanded`，随后由 settings normalization 处理 `top_layout`，不能表述为更新接口直接拒绝非法 `top_layout`。`always_expanded` 只控制桌面左侧布局，顶部和移动端不会应用该值，但后台切换布局时会保留原配置。

背景配置保留旧版 `background` 字段作为兼容值，并新增 `backgrounds.light` / `backgrounds.dark` 分别保存浅色和深色主题的背景类型、背景值、模糊度、遮罩透明度和遮罩颜色。公开首页渲染时按当前实际主题优先读取 `backgrounds` 中对应配置；旧备份或旧数据库缺少 `backgrounds` 时，后端会用旧 `background` 自动派生两套背景。

后台设置面板内置 22 组背景方案。`Settings` 与 `PublicSettings` 通过 `background_preset_id` 持久化当前选择，取值分为：

- 护眼纯色：`paper-sage`、`paper-clay`、`paper-wheat`、`paper-slate`、`paper-pine`、`paper-sakura`、`paper-lavender`、`paper-indigo`、`paper-amber`；
- 毛玻璃渐变：`clear-teal`、`mist-slate`、`coral-sky`、`sage-graphite`、`lumen-amber`、`ember-night`、`violet-dawn`、`ocean-depths`、`aurora-borealis`、`citrus-sunset`、`rose-orbit`、`indigo-noir`、`terracotta-dune`；
- 自定义：`custom`。

选择内置方案时前端同时写入对应的 `backgrounds`、遮罩、卡片背景透明度和自动文字色设置。护眼纯色默认将 `card_background_opacity` 设为 `0.9`，浅色模式使用与页面背景同色系的浅卡片色，暗色模式使用预设的深色卡片色；该透明度同时作用于书签卡片、搜索框和分类导航。运行时根据 `background_preset_id` 选择对应的亮暗强调色和高对比标题/备注颜色，用户设置的 `card_text_color` 始终优先。

旧数据缺少 `background_preset_id`，或仍为 `custom` 但浅色/深色背景值匹配内置方案时，后台面板会自动识别并显示对应预设。旧版护眼配置中的白色卡片背景会在公开设置聚合时映射为当前护眼预设的同色系卡片色；用户保存的非白色卡片背景保持不变。

## 浏览器书签同步接口

全部需要登录，Chrome/Edge 扩展使用与后台相同的 Bearer Session Token。该接口只允许新增书签，不提供删除或反向同步能力。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/browser-sync/bookmarks` | `{ bookmarks: { title: string, url: string }[] }`，最多 100 条 | `{ category_id, category_title, created, skipped }` |

服务端只接收 `http://` 和 `https://` 书签；重复 URL、空标题、非法 URL 或无效记录会计入 `skipped`。同步创建的书签默认写入 `https://favicon.im/<hostname>?larger=true`，`icon_source` 为 `favicon_im`，不在同步请求期间执行外部页面抓取。同步开关关闭时返回冲突错误，不会写入数据。浏览器收藏夹文件夹不会作为导航分类处理，所有记录固定写入“浏览器新增收藏”。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

`ImportReq.mode` 支持 `replace` 和 `merge`。单次导入最多 2000 个分类、20000 个书签，超出返回 `code=1002` 并在 msg 中给出上限。协议不合规的书签会被**跳过而不是让整批导入失败**——为了一条 `javascript:` 小书签让整次备份恢复失败是更糟的结果：缺协议的写法补成 `https://` 保留，`javascript:` / `data:` / `file:` / `ftp:` 等一律丢弃并计入 `ImportResp.skipped_bookmarks`。旧备份缺少 `parent_id` 时按一级分类处理。合并模式按去除首尾空格、忽略大小写的完整分类路径复用现有分类，因此不同父分类下允许同名子分类；重复 URL 保留，当前站点设置保持不变。

导入在写入前验证分类深度、父级引用和书签分类引用。覆盖和合并都会先建立旧分类 ID 到新分类 ID 的映射，按一级分类、二级分类、书签的顺序重建，并同时重写二级分类 `parent_id` 与书签 `category_id`。设置仅在覆盖导入中写入受支持的公开配置 key，不触碰管理员账号字段。`ImportResp` 包含导入数量和导入后的 `AdminData`，前端使用该响应更新本地数据并显式同步导入状态。
