# CF-Navs API 契约

共享类型定义见 `shared/types.ts`。前端和后端都应以共享类型为准；修改接口时同步更新本文件和 `shared/types.ts`。

## 通用约定

- 所有接口前缀为 `/api`。
- 常规响应使用统一包络：`{ code, msg, data }`。
- 业务错误通常仍返回 HTTP 200，用 `code` 区分；认证中间件拦截返回 HTTP 401 且 `code=1001`。完整口径见下方「错误码与 HTTP 状态约定」。
- 受保护的写操作使用 `Authorization: Bearer <token>` 鉴权；安装接口使用一次性的 `X-Setup-Token`，公开点击计数接口不要求登录。
- 时间戳使用毫秒数，即 `Date.now()`。
- **写响应的 `data_version`（附加字段）**：改变聚合数据的受保护写接口（分类/书签增删改、批量删除/移动、排序、整理、设置保存、导入、浏览器同步、显式图标刷新）成功且确实提升了数据版本时，包络额外携带 `data_version: string`，值即本次提交后的 `/api/data/version` 版本号：`{ code: 0, msg, data, data_version }`。业务写入与版本提升在**同一个 D1 batch（同一事务）**中提交（`worker/lib/db/mutation.ts` 的 `Mutation` / `commitMutation`），不会出现「数据已变、版本未变」或对外先后变化两次。未写入任何数据（404、批量集合全部不存在、空设置补丁）时不提升版本、不失效缓存，也不带该字段。该字段只在包络层出现，`data` 形状不变；旧客户端忽略即可，客户端也不应依赖它一定存在。

## 错误码与 HTTP 状态约定

`code` 取值见 `shared/types.ts` 的 `ErrCode`：`0` 成功、`1001` 未认证、`1002` 参数错误、`1003` 不存在、`1004` 限流、`1005` 禁止访问、`1006` 状态冲突、`1500` 服务端错误。

**默认规则：业务错误走包络，HTTP 200。** 判错一律看 `code !== 0`，而不是 HTTP 状态。前端 `src/lib/api.ts` 的 `request()` 对两种形态都抛 `ApiError`：HTTP 非 2xx 时 `status` 为真实状态、`code` 取包络的 `code`（无包络时退回 HTTP 状态）；HTTP 200 且 `code !== 0` 时 `status=200`、`code` 为包络值。会话失效判定（`isUnauthorizedError`）同时认 `status === 401` 与 `code === 1001`。浏览器扩展（`browser-extension/background.js`）同样以 `code !== 0` 判错，另对 HTTP 401 单独处理。因此**不要把现有 HTTP 200 的业务错误改成 4xx**，也不要把下表的真实状态端点改回 200——`objectIconLoader` 依赖图标副本的 401/403/404/409 真实状态，浏览器扩展依赖 401。

| helper / 位置 | HTTP 状态 | `code` | 何时使用 |
| --- | --- | --- | --- |
| `ok(data)`（`worker/lib/response.ts`） | 200 | `0` | 成功 |
| `badRequest(c, msg)`（`worker/lib/routeHelpers.ts`） | 200 | `1002` | 请求体 / 参数 / id 校验失败、非法 URL、出网目标被拒、导入超限等业务校验失败 |
| `c.json(fail(ErrCode.NOT_FOUND, …))` | 200 | `1003` | 受保护接口的目标资源不存在；未知 `/api/*` 路径（登录后） |
| `c.json(fail(ErrCode.CONFLICT, …))` | 200 | `1006` | 资源状态不允许该操作（整理 / 批量移动集合过期、浏览器同步已关闭、分类仍有子分类） |
| `c.json(fail(ErrCode.RATE_LIMITED, …))` | 200 | `1004` | 登录、安装、找回限流 |
| `c.json(fail(ErrCode.FORBIDDEN, …))` | 200 | `1005` | 公开模式关闭时匿名访问 `/api/public/data`、`/api/data/version` |
| `c.json(fail(ErrCode.UNAUTHORIZED, 'invalid credentials'))` | 200 | `1001` | `POST /api/login` 用户名或密码错误（不是会话失效，前端登录请求不带 Bearer，不会误清登录态） |
| `serverError(c, msg, error)` | 200 | `1500` | 路由 catch 的非预期失败；原始错误只写 Workers 日志 |
| `app.onError`（`worker/index.ts`） | 200（`/api/*`）/ 500 文本（其它路径） | `1500` | 未被路由捕获的异常 |
| `authRequired` 中间件 | **401** | `1001` | 缺少 / 无效 / 已撤销的 Bearer token；未登录访问未知 `/api/*` 路径 |
| `/api/public/data`、`/api/data/version` 带无效 Bearer | **401** | `1001` | 带了 token 但会话无效，不能退回匿名结果 |
| `POST /api/install`、`POST /api/recover` | **401** / **403** | `1001` / `1005` | `X-Setup-Token` 错误或未配置 / 跨域请求；其余失败（参数、已安装 / 未安装、限流、服务端错误）走 HTTP 200 包络 |
| `serverError(c, msg, error, 500)` | **500** | `1500` | 仅 `POST /api/public/bookmarks/:id/click` 的 catch |
| `POST /api/public/bookmarks/:id/click` | **400** / **404** | `1002` / `1003` | 非法 id / 书签不存在或为私密 |
| `POST /api/error-report` | **400** / **413** / **429** | `1002` / `1002` / `1004` | 无效 payload / 请求体超限 / 限流 |
| `GET /api/iconify-search` | **400** / **502** | `1002` / `1500` | 查询词非法 / 上游 Iconify 搜索失败 |

新增端点默认用前半张表的 helper（HTTP 200 + `code`）。只有调用方必须靠 HTTP 语义区分结果（鉴权、跨域、`sendBeacon` 式上报、带协议的图标副本、上游代理失败）时才返回真实状态，并同步本表与 `tests/unit/errorConvention.test.ts` 的非 200 快照——该测试扫描 `worker/` 中全部 `c.json(fail(ErrCode.X, …), <status>)`，并钉住 `badRequest` / `serverError` / `authRequired` / `onError` 的状态与 `code`。

## 鉴权规则

- `authRequired`：读取 Bearer token，用 `settings.jwt_secret` 校验 HS256 签名和 `exp`，再查 KV 撤销名单。签名、过期或撤销不通过返回 401；KV 读取故障可能由全局错误处理返回服务端错误。**缺少 `SESSION` 绑定时不再跳过撤销检查，而是直接拒绝会话**（见下方口径）。
- **路由鉴权按构造保证**：`worker/index.ts` 把 API 拆成公开子应用 `publicApi`（唯一的公开清单，见下方「公开接口」「安装接口」与 `/login`、`/recover`、图标代理）和受保护子应用 `protectedApi`（`use('*', authRequired)`，在全部公开处理器之后挂载）。新增接口默认受保护；未登录访问未知的 `/api/*` 路径或公开路径的未定义方法时返回 401 / `code=1001`（此前为 `code=1003` not found），登录后仍返回 not found。`tests/unit/routeAuth.test.ts` 枚举受保护子应用的全部路由断言无 token / 伪造 token 均为 401，并对公开路由清单做快照。
- 会话是无状态 JWT，payload 为 `{ username, exp, jti }`。`jti` 保证同一毫秒内的两次登录也会签出不同 token，否则「退出这台设备」会连带撤销另一台。
- `POST /api/logout` 把当前 token 的 SHA-256 摘要写入 KV `revoked:<sha256>`，TTL 为 `max(60 秒, token 剩余寿命)`，以满足 KV `expirationTtl` 的下限。用摘要而不是 token 本身做 key，避免 KV 被 dump 时泄露仍在有效期内的 token。其它 isolate 上最多 15 秒后才感知到撤销，这是内存缓存换来的固定窗口。撤销名单是「退出登录」的**全部实质**，写不进去就等于没退，因此该接口用 `LogoutResp` 把结果显式告知调用方，不再一律返回纯成功——三种结果见「认证接口」小节。
- 修改密码和凭据重置走 `rotateJwtSecret`，一次性作废全部会话；新密码哈希与新的 JWT 签名密钥写在**同一条** settings upsert 里（`POST /api/password`、`POST /api/recover`），不会出现「密码已改、旧 token 仍有效」的中间态。
- KV `SESSION` 绑定当前只用于登录限流（`rl:login:*`）和会话撤销名单（`revoked:*`），不再存储会话本身。点击计数限流已改用 D1 表 `click_rate_limits`（见下文点击计数说明），不再读写 KV。
- **缺 `SESSION` 绑定时的行为按「正确性是否依赖它」分两类**（判定统一在 `worker/lib/sessionStore.ts` 的 `hasSessionBinding`，要求 `get`/`put`/`delete` 三个方法都存在）：
  - **鉴权与登录 fail-closed**：`validateSession` 拒绝会话（受保护端点因此 401 / `code=1001`），`POST /api/login` 返回 `code=1500` + `required SESSION binding is unavailable`。撤销名单不可用时不能静默放行——那等于「撤销名单不存在」而调用方无从得知。缺绑定是确定性的配置错误，`/install` 本来就以 `bindings_missing` 拒绝安装。
  - `POST /api/public/bookmarks/:id/click` 不依赖 `SESSION` 绑定：其限流存于 D1，限流语句失败时仍按 best-effort 跳过限流**继续计数**（限流失效只是计数偏高，拒绝匿名点击会让公开首页的正常功能坏掉）。
- `/api/public/data`：**匿名请求一律先查公开数据 edge cache，且忽略客户端的 `Cache-Control: no-cache / no-store / max-age=0` 与 `Pragma: no-cache`**——否则任何人用一个请求头就能强制读 D1。新鲜度改由版本化 URL 保证：
  - `GET /api/public/data?v=<data_version>`（`v` 取自 `/api/data/version`，格式 `[A-Za-z0-9_-]{1,64}`，不合格式视为未带版本）。缓存键为路径 + 规范化的 `v`，与版本一一对应；版本前进即换键，旧键自然不可达，不依赖 Cache API 只作用于当前 colo 的 `delete`。
  - 带版本未命中时，服务端先用一条轻量 settings 查询（与 `/api/data/version` 同一条）确认 `v` 是否仍是当前版本：是则读一次聚合 batch 并缓存到该键；否（过期或伪造的 `v`）则优先用**当前版本**键的缓存副本回应，响应改为 `Cache-Control: no-store`，正文是当前版本的数据（`data.version` 为当前版本），不重定向、也不把内容写进过期键；当前版本键也未命中时才读聚合 batch。因此过期或随机 `v` 最多只引发这条单行查询。
  - 聚合 batch 读出的内容总是写进它真实版本的键；只有 `v` 等于读出的版本（或未带版本）时，返回给客户端的响应才是可缓存的公开头。
  - 未带 `v` 的旧客户端请求继续可用：使用无版本键（写操作失效的就是这一个），未命中时同时写入无版本键与版本键。跨 colo 场景下无版本键最多滞后一个 edge TTL（120 秒）；响应自带 `version`，前端下一次版本确认即自愈。
  - 缓存未命中且未带版本时，先复用 `/api/config` edge cache，仍未命中才读取轻量 `site_title/public_mode`；公开模式关闭时匿名请求返回 `code=1005`，该轻量 1005 响应短时写入本次请求的缓存键（过期 `v` 不写）。
  - 带 Bearer 的请求从不读写共享缓存：先校验会话，无效返回 401，有效则返回包含私密书签的数据（`no-store`）。
- `/api/data/version`：用一次 `settings` 查询读取 `site_title`、`public_mode`、内部 `data_version`、图标数据集代次 `dataset_epoch` 与全局图标标志位 `icon_epoch`。带 Bearer 时始终校验会话（包括公开模式）；无效会话返回 401，不能退回匿名成功。私有站点的匿名访问仍返回 `code=1005`。单次版本元数据查询是热路径契约；既有会话验证的 D1/KV 成本单独计量。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/data/version` | 公开模式或登录 | `DataVersionResp` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |
| POST | `/api/public/bookmarks/:id/click` | 无 | `null` |
| POST | `/api/error-report` | 无 | `{ received: number }` |

`/api/config` 使用短 TTL Cloudflare edge cache，设置保存或数据导入后会主动失效，主要作为兼容和兜底轻量配置接口。注意：与 `/api/public/data` 不同，匿名请求若携带 `Cache-Control: no-cache` / `max-age=0`，`/api/config` 仍会绕过 edge cache 直接读取 D1（仅 2 行轻量设置）。前端普通启动路径优先使用本地快照加 `/api/data/version` 做远端确认；本地无可用快照或版本变化时，才请求 `/api/public/data` 或 `/api/admin/data` 派生站点配置。公开模式关闭时，匿名 `/api/public/data` 的 1005 响应会在 `data` 中携带 `{ site_title, public_mode: false }`，登录页无需再额外请求 `/api/config`。该 1005 响应使用浏览器 `max-age=0` 和短 edge TTL，避免本地浏览器缓存卡住公开模式切换，同时减少私有站点匿名访问对 D1 的重复读取。`/api/public/data` 只查询并返回首页渲染需要的公开设置、分类和书签字段，书签公开字段携带用于轻量判断图标缓存的 `icon_cached`，`icon_blob` 恒为 `null`，但不包含 `admin_username`、`admin_password` 等内部字段，也不包含分类/书签的 `created_at`。**注意 `custom_css` 与 `custom_js` 属于公开设置**（见 `shared/settings.ts` 的 `PUBLIC_SETTINGS_KEYS`）：它们会随公开数据下发给每个匿名访客并在其浏览器中生效，这是「自定义 CSS/JS」这个功能的预期行为；匿名公开访问会先查短 TTL edge cache，命中时直接返回而不读取 D1。前端匿名拉取完整聚合数据时，若刚通过 `/api/data/version` 确认了远端版本，就请求 `/api/public/data?v=<version>`（冷启动没有本地快照时不为此额外请求版本，直接请求无版本地址），只保留 fetch `cache: "no-store"`、不再发送 no-cache 请求头；带登录态请求始终绕过匿名缓存。缓存未命中时，服务端先复用或预热 `/api/config` 的轻量 edge cache 来判断是否公开，公开时再通过一次 D1 batch 聚合读取公开 settings、分类和书签；该 batch 同时读取 `site_title/public_mode`、数据版本和图标数据集代次，避免把先前配置与新数据版本拼接成不一致的权限快照。

`/api/error-report` 接收前端运行时错误上报，payload 为 `{ errors: ErrorReportEntry[] }` 或单个 `ErrorReportEntry`。该接口不要求登录，但限制请求体为 16 KB、单批最多 10 条，并对消息、分类、URL 和行列字段做类型与长度归一化；有效请求通过 D1 原子计数按来源 IP 限制为每分钟 12 次，已封禁来源可由当前 Worker isolate 内存快速拒绝。超大请求返回 HTTP 413，高频请求返回 HTTP 429，无效 JSON 或无有效条目返回 HTTP 400。Worker 只把有限字段写入 `console.error`，响应中的 `received` 表示实际接收条数；前端会对同一错误做 60 秒去重，且上报失败不得影响页面主流程。

`POST /api/public/bookmarks/:id/click` 由首页在打开书签时调用，成功后将对应 `click_count` 加一。每个 IP 与书签 ID 组合在 10 分钟内最多计数 3 次，超过后仍返回成功但不重复增加计数；书签不存在或为私密书签返回 HTTP 404。点击计数不会提升 `data_version`，后台访问分析打开时会强制刷新后台聚合数据。限流计数存于 D1 表 `click_rate_limits`（`schema.sql` 安装时创建，旧库由版本化迁移第 3 步补建，缺表时经 schema 重试自动迁移），与计数更新放在**同一个 D1 batch**：只为存在且公开的书签建计数行；计数在上限 +1 处饱和，超限后的重复点击不再产生写入；过期行在每次 batch 开头按 `reset_at` 索引清理。限流 batch 因其它原因失败时退回为不限流的单条计数。

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
| POST | `/api/logout` | 无 | `LogoutResp` |
| POST | `/api/password` | `ChangePasswordReq` | `null` |
| POST | `/api/recover` | `RecoverReq` | `LoginResp` |
| GET | `/api/me` | 无 | `{ username: string }` |

全新部署通过 `/install` 初始化管理员：`POST /api/install` 使用 `SETUP_TOKEN` 授权，并将管理员密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。`INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 和初始化凭据标记仅用于已有旧数据库的升级或凭据恢复：修改兼容变量后，下一次登录会同步更新 D1 中的管理员凭据；后台账号安全修改后的密码不会被未变化的初始化变量覆盖。旧数据库可通过新的 `RESET_ADMIN_CREDENTIALS` 标记执行一次强制重置。

`POST /api/recover` 仅用于**已安装实例**，不要求 Bearer token；请求头 `X-Setup-Token` 通过与 `/install` 相同的常量时间比较验证部署者身份，同源校验和 `install_rate_limits` 表的 `recover:<ip>` 独立命名空间限流仍生效。请求体为 `{ password }`，只重置密码、不修改 `admin_username`；密码长度须为 8–12 位且至少包含小写、大写、数字、符号四类中的两类。成功只更新 `settings.admin_password`，保留 `admin_bootstrap_password` 的 `INIT_ADMIN_*` 快照，然后轮换 JWT secret、作废全部旧会话并返回 `LoginResp`。未安装返回 `code=1002` 的 `not installed`；错误/未配置令牌返回真实 HTTP 401；跨域返回真实 HTTP 403；限流和密码校验错误遵循 HTTP 200 + `code` 包络。令牌不落库，忘记原值时可在 Cloudflare 生产环境变量和密钥中新增/轮换 `SETUP_TOKEN` 后重新部署。
`LoginResp` 包含 `token`、`expires_at` 和 `username`，前端登录成功后直接使用返回的 `username` 更新登录态并停留/返回前台首页，不再额外请求 `/api/me` 或立即预加载后台分包。登录接口会在 bootstrap 初始化时用一次 settings 查询同时读取管理员账号和密码，并复用该结果进行密码校验，避免重复读取账号/密码设置。已有登录态刷新页面时会先恢复本地 session 和可能存在的 `AdminData` 快照，再请求 `/api/data/version` 确认远端版本；版本变化时才请求 `/api/admin/data`。只有显式刷新用户信息时才需要 `/api/me`。
`POST /api/logout` 会尝试把当前 token 写入 KV 撤销名单，TTL 为 `max(60 秒, token 剩余寿命)`，并返回 `LogoutResp` 说明撤销是否真的落库。三种结果都是 HTTP 200 + `code=0`（退出登录不能失败：前端必须清掉本地登录态，返回错误反而会把用户留在登录态里）：

| `data` | 含义 | token 的实际状态 |
| --- | --- | --- |
| `{ revoked: true }` | 撤销名单已写入 | 同一 isolate 立即失效；其它 isolate 最多 15 秒后失效 |
| `{ revoked: false, reason: 'store_unavailable' }` | `SESSION` 绑定存在但 KV 写入抛错 | **仍然有效到 `exp`**（部署默认 30 天） |
| `{ revoked: false, reason: 'store_unconfigured' }` | 请求进来时没有 `SESSION` 绑定，撤销被整体跳过 | **仍然有效到 `exp`** |

后两种情况下前端照常清除本地登录态，但会额外提示「服务端未能作废旧的登录令牌」并给出可执行的补救动作——改密码走 `rotateJwtSecret`，一次性作废全部会话。这两种结果的**后果相同、原因不同**，因此用 `reason` 区分而不是合并成一个布尔值：`store_unconfigured` 是部署配置问题（照 `TROUBLESHOOTING.md` 补绑定），`store_unavailable` 是运行时故障（重试即可）。后续请求若 KV 读取也失败，鉴权可能返回错误。

`store_unconfigured` 的可达窗口在 PROB-31 之后**进一步收窄到「令牌签发后绑定被移除，且 `validateSession` 的 isolate 内存缓存仍命中」的 ≤15 秒内**。原因：`loginRateLimit` 缺绑定时直接返回 `code=1500`，一开始就没有绑定的部署拿不到 token（`/install` 也会先以 `bindings_missing` 拒绝安装）；而缓存过期后 `authRequired` 会直接 401，不会再走到 logout 的这个分支。两条都已实测确认。

`reason` 是可扩展取值：客户端遇到不认识的 `reason` 时仍必须给出警告，只是不带原因说明，不能静默当成成功。

## 后台聚合接口

全部需要登录。

Chrome/Edge 扩展通过 `OPTIONS /api/categories` 预检后读取此列表；CORS 只影响扩展跨源调用能力，GET 仍必须携带有效 Bearer Session Token，未认证响应为 401。

| 方法 | 路径 | 返回 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/data` | `AdminData` | 后台初始化聚合数据，一次返回分类、书签和完整 `Settings`，用于替代进入后台时分别请求公开数据和设置 |

`AdminData` 和 `PublicData` 响应可携带可选 `version` 字段，前端只用于快照校验，不参与页面渲染。前端会按当前登录态把 `AdminData` 写入浏览器本地快照（优先 localStorage，超出限制时仍可用 Cache Storage）；匿名公开数据也会写入同源本地快照。页面刷新时可以先用快照恢复界面，随后请求 `/api/data/version`：版本相同则不拉完整数据，版本不同才请求 `/api/admin/data` 或 `/api/public/data`。`/api/admin/data` 每次直读一次 D1 batch（原 Worker isolate 内 3 秒运行时聚合缓存已删除：前端请求总带 no-cache 绕过它，它从未被命中，却要求每个写路由记得失效）。退出登录会清除本地后台快照。

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

分类创建与更新响应同时返回本次写入后的 `icon_revision`、`icon_write_epoch` 和 `icon_cached`，由同一条 SQL 的 `RETURNING` 取得，不新增回读查询，也不重复返回 `icon_blob` 正文。前端应用本地分类更新时必须保留这些图标身份字段和 `is_private`；不能用缺少元数据的投影覆盖实体、暂时回退为未知版本/代次 0，再依赖后台刷新修补。首页投影仅移除 `created_at`，字段边界与 `PublicCategory` 类型一致。

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
| POST | `/api/bookmarks/:id/icon-cache/refresh` | 无 | `{ icon_blob, icon_descriptor, icon_update }` |
| POST | `/api/bookmarks/check-health` | `{ ids: number[] }` | `{ id, status, ok }[]` |

`POST /api/bookmarks/:id/icon-cache/refresh` 在当前源/写入代次下显式刷新成功图标，支持 data URI 及 HTTP(S)（含 Iconify），失败不覆盖最近成功正文。响应保留 `icon_blob`，并附 `icon_descriptor` 与 `icon_update`（updated/unchanged/cleared/unavailable）；并发保存获胜时返回重新读取的当前结果，不能返回旧源抓取结果。相同字节保持内容版本不变。响应为 `private, no-store`。浏览器能否保存仍须通过可信设备、当前会话与统一存储策略，不能因接口返回了 data URI 自动认领权限。

`GET /api/bookmarks` 的列表口径与聚合一致：`icon_blob` 恒为 `null`，以 `icon_cached` 表示 D1 中是否已有图标正文，不再把每个书签的 base64 正文读进 Worker 再下发（当前前端不调用该接口；需要正文的合并导入在服务端内部单独读取）。批量删除按 D1 参数上限分块执行 `DELETE ... WHERE id IN (...)`。批量删除请求最多包含 500 个正整数 ID；排序请求的 `ids` 最多 5000 个；服务端会去重并忽略已不存在的记录。书签 `url` 必须是 `http(s)` 地址，其它协议返回 `code=1002`；后台表单会先把缺协议的写法（`example.com`）补成 `https://` 再提交，补不了的原样送出由服务端拒绝。书签写入可携带 `description_mode: "always" | "hover" | "hidden" | null`；更新时省略该字段会保留原覆盖值，显式 `null` 会恢复跟随全局设置。
`POST /api/bookmarks/batch-move` 用于管理员批量移动书签，不改变 `/api/bookmarks/reorganize` 的完整排序契约。请求为 `{ ids: number[], category_id: number, position: 'end' | 'start', expected: { id: number, category_id: number, sort: number }[] }`；`ids` 最多 500 个且不得重复，`expected` 必须与 `ids` 一一对应，用于拒绝过期集合。`position='end'` 追加到目标分类现有书签末尾，`position='start'` 插入目标分类开头；默认由前端传 `end`。服务端必须在一次原子操作中更新选中书签的 `category_id` 和受影响书签的全局 `sort`，校验失败不得部分成功。选中集合、快照、目标分类或权限不一致返回 `code=1006`（`ErrCode.CONFLICT`）；其它服务端故障返回 `code=1500`。成功返回 `{ moved, category_id, position }`。
`POST /api/bookmarks/reorganize` 是首页跨分类整理会话的保存通道。请求为 `{ category_orders: Array<{ category_id: number, ids: number[] }> }`，`category_id` 与全部 `ids` 必须是正整数，否则返回 `code=1002`。服务端按分类提交的完整顺序一次性重写受影响书签的 `category_id` 与全局 `sort`（单个 `db.batch`，不拆多批）。**payload 必须覆盖库中每一个书签**：数量不符或有书签未出现在任何 `category_orders` 里都会失败；同一 `category_id` 重复出现、同一书签 id 出现在多个分类里、`category_id` 指向不存在的分类，同样失败。以上都归为状态冲突。请求集合与库中状态不一致（分类被删、书签集合过期）时返回 `code=1006`（`ErrCode.CONFLICT`），前端据此提示「数据已变化，请刷新后重试」并重新拉取；其它故障返回 `code=1500`。`batch-move` 沿用同一 `BookmarkReorganizeError` → `CONFLICT` 判定。

`POST /api/bookmarks/check-health` 最多检查请求中的前 20 个书签，Worker 先用 HEAD 请求目标地址，遇到 405、403 或 400 时回退 GET，单个目标超时为 3 秒，返回 HTTP 状态码、`ok`、`timeout`、`error` 或 `blocked`。重定向手动跟随并逐跳过滤（与下文出网目标过滤同一口径，最多 5 跳）；书签地址或任一跳指向内部地址时不发出该请求，返回 `status: "blocked"`。

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

出网目标过滤：`/api/fetch-site-meta` 与 `/api/fetch-favicon` 共用 `parseTargetUrl`，拒绝指向环回、私有、链路本地（含云元数据 `169.254.169.254`）、运营商级 NAT、组播保留段的 IPv4/IPv6 字面量，以及 `localhost`、`*.local`、`*.internal`、`metadata.google.internal` 等内部主机名，被拒绝时返回 `code=1002`。`favicon` 解析出的 `<link rel="icon">` 候选来自第三方页面，同样经过该过滤，避免恶意页面绕过入口检查。图标抓取（`/api/icon/:id`、`/api/category-icon/:id` 的 cache miss、显式图标刷新、可信副本、Iconify 代理共用的 `fetchIcon`）同样经过该过滤：入口地址被拒绝时不发请求；重定向改为手动跟随（`redirect: 'manual'`），**每一跳**的 `Location` 都重新过滤，最多 5 跳，超出或命中内部地址按永久失败（`missing`）处理。`fetch-site-meta` / `fetch-favicon` 的页面抓取、manifest 抓取、图标候选与 `/favicon.ico` 探测以及链接健康检查共用同一个手动跟随助手（`worker/lib/pageMetadata.ts` 的 `fetchFollowingSafeRedirects`），不再有自动跟随重定向的出网请求：页面重定向到内部地址时按抓取失败处理（站点名称回退域名、图标回退 favicon.im）。该防线只检查地址字面量：`new URL()` 会先把 `2130706433`、`0x7f.0.0.1` 一类写法归一成点分形式，因此常见进制绕过已被拉平，但它**挡不住 DNS 重绑定**（合法域名解析到内网），Workers 没有可插手的解析钩子。

前端只在**新增**书签、书签标题为空、且网址输入框失焦时调用该接口；返回后会再次确认标题仍为空才写入，请求在途期间用户已输入标题则丢弃结果。写入表单前按字素簇截断到 20 个字符（复用 `src/lib/truncateUnicodeText.ts`，与后台列表一致），超长时以 `…` 结尾，避免标题输入框内容超出可视范围不便修改；接口本身仍返回最长 80 个字符的完整结果。

需要注意接口的能力边界：它只解析服务端返回的静态 HTML。由 JavaScript 在页面加载后改写的标题（常见于 SPA，例如静态 `<title>` 是模板默认值、真实站点名由前端调接口取回后再设置）无法获取，这类站点只能拿到静态 HTML 里的原始标题，需要用户手动修改。

因为这是用户没有主动触发的后台请求，前端调用时带 `keepSessionOnUnauthorized`：接口返回 401 或 `code=1001` 时**不清除本地登录态**，避免 token 恰好过期时把用户正在填写、尚未保存的书签表单一起丢掉。用户主动发起的请求仍然按原有规则清除登录态。

## 图标接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/fetch-favicon?url=` | 登录 | 服务端依次解析目标站 `<link rel="icon">`、Web App Manifest `icons[]`、`/favicon.ico`，失败或超时回退 `favicon.im` |
| GET | `/api/iconify-search?query=` | 登录 | 搜索 Iconify 候选并返回预览地址 |
| GET | `/api/icon-access` | 登录 | 签发后台预览私密对象图标用的短期授权，返回 `IconAccessResp`。响应 `private, no-store` |
| GET | `/api/icon/:id` | 无 | 书签图标代理。匿名请求先读取目标书签及所属分类祖先链做当前可见性判定，再允许命中 Cloudflare edge cache；不可见/未知对象返回不含标题与域名的 `no-store` 文字兜底，公开对象 cache miss 时读取图标地址、标题与 D1 中缓存的 `icon_blob`，无 blob 时按书签保存的 HTTP(S) 图标地址服务端抓取并写回 D1 |
| GET | `/api/category-icon/:id` | 无 | 分类图标代理。匿名请求先读取目标分类及祖先链做当前可见性判定，再允许命中 Cloudflare edge cache；不可见/未知对象返回 `no-store` 文字兜底，公开对象 cache miss 时服务端抓取 HTTP(S) 分类图标。Service Worker 不再 cache-first 拦截该路径 |
| GET | `/api/iconify/:set/:name.svg` | 无 | Iconify 图标预览代理。新增/编辑书签弹窗通过该同源代理预览，成功响应可被 Cloudflare edge cache 复用；失败时返回临时 SVG 文字图标并带 `X-Icon-Fallback: 1`（缓存策略见下方「图标抓取失败的两种兜底」） |

**图标端点的匿名可见性规则。** `/api/icon/:id` 与 `/api/category-icon/:id` 按可猜测的整数 ID 寻址且不要求登录，因此两者都在**共享 edge cache 命中之前**做当前可见性判定，口径与 `/api/public/data` 完全一致：私密书签不可见；公开书签只要挂在私密分类（或私密分类的后代）下同样不可见；私密分类及其后代不可见；分类缺失、祖先链循环或无法读取权威元数据也按不可见处理。层级规则复用 `getPublicCategoryIds` 的祖先链遍历。被拒绝的请求返回**不含标题与域名**、`Cache-Control: no-store` 的兜底 SVG，与「ID 不存在」的响应完全一致，不提供存在性或内容线索。

**私密对象的授权预览（`key` 参数）。** 后台需要看到私密书签/私密分类的真实图标，而 `<img>` 不发 `Authorization` 头，因此两个端点接受 `?key=<授权>`：

- 授权由 `GET /api/icon-access` 签发，形如 `<exp 毫秒时间戳>.<base64url(HMAC-SHA256)>`。签名密钥就是 `settings.jwt_secret`，**改密码触发的 `rotateJwtSecret` 会顺带作废全部已签发授权**；签名内容带域分隔前缀 `icon-access:`，所以授权串与 JWT 互不通用。
- **寿命 30 分钟，刻意远短于会话（默认 30 天）**。授权是放在 URL 里的能力凭据，会进浏览器历史、Referer 与访问日志；它又不查 KV 撤销名单（每张私密图标一次 KV 读会打穿 `C-5` 的图标请求预算），因此登出后无法立即失效——短寿命是唯一的补偿，前端在临近过期前续签。
- 校验**先看形状与过期，再算 HMAC**：否则任意长度的 `key=` 都会换来一次 HMAC 运算，等于给匿名请求开一条计算放大路径。非法或过期的 `key` 一律**退回匿名口径**，响应与不带 `key` 时逐字节相同。
- 带合法授权的响应是 `private, no-store`，且**既不读也不写 edge cache**（`cacheKey` 为 `null`）。`public/sw.js` 不接管 `/api/category-icon/*`；Cache Storage 只缓存不含 `no-store` 的 Iconify 资源，不保存用户对象图标。
- 前端只在登录态且对象需要授权时带 `key`；公开对象保持匿名 URL，继续使用 edge cache。非法或过期 `key` 一律退回上述匿名口径。

匿名公开图标的客户端响应统一使用 `Cache-Control: no-store`，避免站点级 Browser Cache TTL（例如共享域名的 4 小时默认值）把可撤回的图标留在访问者浏览器；Worker 内部的 `caches.default` 仍分别保留真实图标 `s-maxage=518400` 与永久缺图 `s-maxage=300`。公开对象命中 edge cache 后也必须重新包装为客户端 `no-store`，不能直接透传缓存副本的公开头。发布时递增 icon cache namespace 与 Service Worker cache 版本，使旧 edge/SW 条目不可达；浏览器已经保存的旧 HTTP cache 无法远程撤回，因此客户端 URL 版本也要递增。

**代码级缓存分离。** 只有 `/api/icon/:id` 与 `/api/category-icon/:id` 使用「Edge 可缓存、客户端 no-store」边界；`/api/iconify/*` 和站点元信息继续使用各自的公开缓存策略。合法授权响应继续 `private, no-store`，不读写共享 edge cache。对象代理响应不会持久化到浏览器对象图标缓存；当前 `cf-navs-bookmark-icons-v2` 仅可保存允许本地优化的原始外站图标，`v1` 仅作为旧版本迁移清理目标。这是隐私撤回优先于对象图标本地命中率的有意取舍。

真实图标与兜底图标的缓存策略仍然分开：公开真实图标可在 edge cache 复用，但客户端不保存；公开对象的永久缺图兜底可使用短 `s-maxage=300`，客户端仍为 `no-store`；隐私拒绝/未知对象的兜底不进入共享缓存。


**图标抓取失败的两种兜底。**
- 图标确实不存在（`missing`）时，Worker 内部 edge cache 使用 `s-maxage=300`；返回浏览器的响应仍为 `no-store`。超时、网络错误、`429`/`5xx`、空 body 等瞬时失败一律 `no-store`。隐私拒绝/未知对象的兜底也一律 `no-store`，不能写入共享缓存。

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再解析 Web App Manifest `icons[]`，回退 `/favicon.ico`，最终回退 `https://favicon.im/{hostname}?larger=true`。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色；中文标题优先按两个字一行换行，长标题最多 4 行并自动缩放字号。
- `google`：历史来源名称，当前实现与 Favicon.im 候选一致，使用 `https://favicon.im/{hostname}?larger=true`，参数 `size` 不再影响结果。
- `iconify`：使用 Iconify SVG API，保存格式为 `https://api.iconify.design/{set}/{name}.svg`，例如 `mdi:home` 或 `https://icon-sets.iconify.design/mdi/home/` 会转换为 `https://api.iconify.design/mdi/home.svg`；新增/编辑弹窗会展示 Iconify 候选，候选、手动输入预览和 icon-sets 页面链接都通过 `/api/iconify/{set}/{name}.svg` 代理加载。
- `custom`：手动填写 URL、表情、纯文字或图床地址。非 URL / 非 data URI 的值会在首页按文本图标直接渲染。

创建或更新书签后，前端会对普通 HTTP(S) 图标显式调用刷新接口，尽量缓存到 `bookmarks.icon_blob`；普通 Iconify 预览与 icon-sets 页面链接不主动写入 `icon_blob`（显式刷新和可信副本协议可取得并版本化成功图片），新增/编辑弹窗、后台预览和首页展示都通过 `/api/iconify/:set/:name.svg` 同源代理，由 Cloudflare edge cache 复用。更新书签但图标地址或图标来源未改变时不会清空已有 `icon_blob`。**聚合响应不下发 `icon_blob`（该字段为 `null`），而以 `icon_cached` 表示 D1 中是否已有持久化缓存**；首页据此取得图标：已有 `icon_blob` 时使用内嵌 data URI，普通 HTTP(S) 图标在缺少本地副本时读取 `/api/icon/:id` 当前响应并仅用于当前渲染，不再写入浏览器 Cache Storage；失败时回退到保存的原始 HTTP(S) 图标 URL。HTTP(S) 分类图片使用 `/api/category-icon/:id?v=...`，data URI、文字和表情分类图标直接渲染；一级标题、二级标签、搜索分组和折叠导航复用相同解析与图片失败回退规则。

前端普通渲染普通 HTTP(S) 书签图标时应读取聚合数据中的 `icon_cached` 轻量标志，不应假设聚合响应携带二进制 `icon_blob`；`/api/icon/:id` 与 `/api/category-icon/:id` 的客户端响应统一 `no-store`，公开复用只发生在 Worker edge cache。旧版 `cf-navs-bookmark-icons-v1` 会在新本地缓存初始化时清理；原始外站图标仍可按大小和响应头写入新的本地优化缓存。后台列表仍可把 `/api/icon/:id` 作为兼容预览入口——对私密对象需要附带 `GET /api/icon-access` 签出的 `key` 才能得到真实图标，不带 `key` 时只返回兜底图标。当前首页的 Iconify 展示通过 `/api/iconify/:set/:name.svg` 同源代理；标准 `https://api.iconify.design/*.svg` 仅作为规范化存储值和兼容外部资源路径保留。

HTTP(S) 图标抓取成功后，代理会直接返回图片字节并写入 Cloudflare edge cache；只有书签图标需要写入 `bookmarks.icon_blob` 时才生成 base64 data URI，避免 Iconify 预览和分类图标在 Worker 内部做不必要的 base64 编解码。

公开聚合、后台聚合、书签列表和图标详情等读取路径默认直接执行查询，冷启动不额外读库。如果遇到旧库缺列错误，后端会以修复模式幂等重跑全部迁移步骤并重试当前查询。

**Schema 版本。** 库内版本号存于 `settings` 表的内部键 `schema_version`（JSON 整数，不属于 `SETTINGS_KEYS`，不出现在设置读写与导入导出中；与安装标记 `installation_schema_version` 无关）。迁移是 `worker/lib/db/schema.ts` 中有序、幂等的 `SCHEMA_STEPS`，`ensureSchema` 每个 isolate 只运行一次：先读一行版本号，已是最新则不执行任何 DDL；否则按序执行缺失步骤，每步的 DDL 与版本写入同在一个 D1 batch，失败整步回滚、版本不前进。版本写入只升不降，并发迁移撞上「列已存在」时重算该步重试。没有版本行的旧库（含 v0.8.3）按版本 0 自动升级，无需手动操作；`/install` 建表后立即记录最新版本，手动执行 `schema.sql` 的库在首个写请求时记录。

普通书签/分类代理的 `v` 必须包含聚合数据已有的 `icon_revision`，未知时回退至 `icon_write_epoch`。快照可能省略图片来源和正文，仅用来源、标题或网址不能区分“只换图”的新内容。已知 revision 不变时不因写入代次单独变化更换版本；版本计算在前端完成，不增加服务端查询或改变权限、no-store 与 SW 边界。

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

下表按 `shared/settings.ts` 的 `SETTINGS_KEYS` 顺序列出全部 32 个设置键。「取值范围」以服务端实际行为为准：PUT 校验见 `worker/routes/settings.ts`，归一化见 `shared/settings.ts` 与 `worker/lib/settingsData.ts`；类型注释写了范围但服务端不钳制的字段已逐项标出。默认值以 `worker/lib/settingsData.ts` 的 `DEFAULT_SETTINGS` 为准，并与 `schema.sql` 的 seed 对齐。未知键在两个方向都会被丢弃：写入和读取聚合都只遍历 `SETTINGS_KEYS`。

| 键名 | 类型 | 取值范围 | 归一化行为 | 默认值 |
| --- | --- | --- | --- | --- |
| `site_title` | `string` | 长度 ≤ 200 码位 | PUT 非字符串拒绝；不做内容归一化 | `'CF-Navs'` |
| `site_title_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串拒绝；不校验颜色语法 | `''` |
| `site_title_font_size` | `number` | 服务端不限范围 | PUT 只校验 `typeof number`；读取不钳制 | `32` |
| `public_mode` | `boolean` | `true` / `false` | PUT 非布尔拒绝 | `true` |
| `browser_sync_enabled` | `boolean` | `true` / `false` | PUT 非布尔拒绝；提交 `true` 时幂等创建同步根分类 | `false` |
| `theme` | `ThemeMode` | `'light'` / `'dark'` / `'auto'` | PUT 集合外拒绝 | `'light'` |
| `background_preset_id` | `BackgroundPresetId` | 22 个内置预设 ID 或 `'custom'` | PUT 集合外拒绝；读取时非法值归一化为 `'custom'`，键缺失取默认值而不是 `'custom'` | `'ocean-depths'` |
| `custom_accent_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串或超长拒绝；读取时去除首尾空白，空值在自定义背景下回退内置浅色强调色；选中内置预设时不生效 | `''` |
| `custom_dark_accent_color` | `string` | 长度 ≤ 64 码位 | PUT 非字符串或超长拒绝；读取时去除首尾空白，空值在自定义背景下回退内置深色强调色；选中内置预设时不生效 | `''` |
| `background` | `BackgroundSetting` | `type` 取 `'image'` / `'color'` / `'gradient'`；`value` ≤ 262144 码位；`maskColor` ≤ 64 码位；`blur` `0-20`、`mask` `0-1` 只是类型注释，服务端不钳制 | PUT 允许部分对象，只校验出现过的属性；读取时非对象整体回落默认，属性缺失或非法逐项回落默认，数值不四舍五入也不钳制 | 见 `DEFAULT_SETTINGS.background` |
| `backgrounds` | `ThemeBackgroundSettings` | `light` / `dark` 各自同 `background` | PUT 要求对象且 `light`、`dark` 均为合法背景对象；读取时逐主题逐属性归一化；整键缺失时由已归一化的 `background` 派生两套主题 | 见 `DEFAULT_SETTINGS.backgrounds` |
| `custom_css` | `string` | 长度 ≤ 65536 码位 | PUT 非字符串或超长拒绝；不做内容清洗 | `''` |
| `custom_js` | `string` | 长度 ≤ 65536 码位 | PUT 非字符串或超长拒绝；不做内容清洗 | `''` |
| `image_host_url` | `string` | 长度 ≤ 2048 码位 | PUT 非字符串或超长拒绝；不校验 URL 语法 | `''` |
| `search_engine` | `SearchEngineSetting` | 服务端不限引擎数量，也不限 `url_template` 形态 | PUT 只要求顶层是非数组对象，不校验 `engines` 元素与 `{q}` 占位符；读取不归一化 | Google 与 Bing 两条，见 `DEFAULT_SETTINGS.search_engine` |
| `card_size` | `CardSizeSetting` | `width` 40–400、`height` 0–300，整数 | PUT 与读取都过 `normalizeCardSizeSetting`：非对象按空对象，非有限数回落默认，有限数四舍五入后钳制。`width` 下限 2026-09-04 由 44 降到 40（PROB-28 / #13），低于 44 px 时点击区域小于触控推荐尺寸，属已知取舍。**2026-09-05 实测**：桌面详情卡在 ≤68 px 时标题与描述的可用宽度为 0（只显示图标），标题约需 120 px 才完整显示；移动端由 `INFO_CARD_MOBILE_SAFE_MIN_TRACK_WIDTH = 150` 兜住，不受该值影响 | `{ width: 160, height: 60 }` |
| `card_style` | `CardStyle` | `'info'` / `'icon'` | PUT 集合外拒绝 | `'info'` |
| `card_icon_size` | `number` | 40–100，整数 | PUT 与读取都过 `normalizeCardIconSize`，规则同 `card_size` | `60` |
| `category_display` | `CategoryDisplaySetting` | 尺寸：`root_font_size` 12–28、`root_icon_size` 14–36、`child_font_size` 11–24、`child_icon_size` 12–32（整数）；`root_title_color` / `child_title_color` 为字符串，空串=跟随主题色，长度 ≤ 32 码位 | PUT 与读取都过 `normalizeCategoryDisplaySetting`：尺寸逐项回落默认后四舍五入并钳制；两个颜色 trim 后截断到 32 码位、非字符串回退 `''`（不校验颜色语法，与 `card_text_color` 口径一致）。两个颜色随 `toPublicSettings` 进入 `/api/public/data`，非空时首页一级/二级分类标题文字按层级着色，不影响计数徽标 | `{ root_font_size: 16, root_icon_size: 20, child_font_size: 14, child_icon_size: 18, root_title_color: '', child_title_color: '' }` |
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
| POST | `/api/browser-sync/bookmarks` | `{ bookmarks: { title: string, url: string }[], category_id?: number }`，最多 100 条 | `{ category_id, category_title, created, skipped }` |

服务端只接收 `http://` 和 `https://` 书签；目标分类内的重复 URL、空标题、非法 URL 或无效记录会计入 `skipped`。传入 `category_id` 时必须指向现存分类，否则返回 `1003`，不写入任何书签，也不回退到默认分类；省略时保持旧客户端行为，写入“浏览器新增收藏”。同步创建的书签默认写入 `https://favicon.im/<hostname>?larger=true`，`icon_source` 为 `favicon_im`，不在同步请求期间执行外部页面抓取。同步开关关闭时返回冲突错误，不会写入数据。浏览器收藏夹文件夹不会作为导航分类处理，扩展在每次同步确认前由用户选择分类。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

`ImportReq.mode` 支持 `replace` 和 `merge`。单次导入最多 2000 个分类、20000 个书签，超出返回 `code=1002` 并在 msg 中给出上限。协议不合规的书签会被**跳过而不是让整批导入失败**——为了一条 `javascript:` 小书签让整次备份恢复失败是更糟的结果：缺协议的写法补成 `https://` 保留，`javascript:` / `data:` / `file:` / `ftp:` 等一律丢弃并计入 `ImportResp.skipped_bookmarks`。旧备份缺少 `parent_id` 时按一级分类处理。合并模式按去除首尾空格、忽略大小写的完整分类路径复用现有分类，因此不同父分类下允许同名子分类；重复 URL 保留，当前站点设置保持不变。

导入在写入前验证分类深度、父级引用和书签分类引用。覆盖和合并都会先建立旧分类 ID 到新分类 ID 的映射，按一级分类、二级分类、书签的顺序重建，并同时重写二级分类 `parent_id` 与书签 `category_id`。设置仅在覆盖导入中写入受支持的公开配置 key，不触碰管理员账号字段。`ImportResp` 包含导入数量和导入后的 `AdminData`，前端使用该响应更新本地数据并显式同步导入状态。

## 图标版本元数据

共享类型见 `shared/iconDescriptor.ts`。

- 公开聚合、后台聚合与 `/api/data/version` 都附 `dataset_epoch`（数据集身份，导入 / 恢复时更换）与 `icon_epoch`（整数，全局图标标志位）。`icon_epoch` 由 D1 触发器维护：书签 / 分类的新增、删除，图标来源、正文、`icon_revision` 变化，`is_private`、书签所属分类、分类父级变化，以及参与图标 URL 版本的标题 / 链接变化都会递增；排序与点击计数不递增。旧库在 schema 第 4 步迁移时补齐计数与触发器。
- 客户端用 `dataset_epoch:icon_epoch:视角` 判断是否需要对照数据清理本地图标；单个图标是否重下由其代理 URL 的 `v=` 版本决定。
- 书签轻量字段 icon_revision/icon_write_epoch 与聚合数据的 version、dataset_epoch 同批读取。内部数据集代次不进入用户 Settings 或可信备份输入；导入重建表时原子更换代次，返回带新身份的聚合数据。当前 merge 也通过重建/重映射实现，因此同样更换代次。
- setIconBlob 条件提交保护数据集、源、代次和预期正文/版本；legacy SQL 改正文时摘要失效，改源时同时清旧正文。已发布内容变化与 data_version 在同一数据库更新边界发布；匿名图标代理仅补充未知摘要时不逐图触发全量刷新。管理员显式调用 `POST /api/bookmarks/:id/icon-cache/refresh` 时，只要可观察的图标身份（`icon_revision` 或是否有正文 `icon_cached`）发生变化（包括「未知摘要 → 已知摘要」），就在同一 batch 里提升 data_version 并随响应返回 `data_version`；同一字节的不同编码不提升。
- 已移除：`POST /api/icon-local-copy` 与 `auth_receipt`（可信设备协议）。

## HTML 入口响应策略

非 API 的 HTML 入口继续使用再验证缓存，并禁止代理修改正文（`no-transform`）。Worker HTML 响应与直接静态资源入口的规则均来自 `worker/lib/assetHeaders.ts`，由构建生成静态入口规则并纳入离线外壳指纹；API 的鉴权、私密响应与 no-store 契约不因此改变。严格脚本策略及自动注入统计的取舍见 `SECURITY.md`。
