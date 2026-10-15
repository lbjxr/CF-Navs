> **STATUS: 已完成**（判定于 2026-10-15）——REQ-14 需求已实现（见开发文档与 CHANGELOG）；注意：正文文首"尚未实现"为过时标记，以此 STATUS 为准。

# 管理员密码恢复端点需求（Issue #24）

> 状态：**需求整理，尚未实现**。批准后按本文档排期，状态由 `docs/BACKLOG.md` 承载，实现进度回写 `CHANGELOG.md`。
> 来源：[Issue #24](https://github.com/lbjxr/CF-Navs/issues/24)「[Feature]: 管理员密码忘了，如何重置？」（`enhancement`，2026-09-19，报告者 @Evenjine）。维护者已于 2026-09-19 回复「好的，重置密码这个需求我尽快处理」，视为已获处理意向；开工前仍按仓库惯例以维护者确认为准。
> 建议编号 `REQ-14`（沿用 `REQ-NN` 序列，不占用既有编号；下文以「本需求」表述，编号由维护者确认后生效）。

## 1. 目标

报告者的诉求：管理员忘记密码后，能通过某种凭证（issue 正文建议「使用 token」）重置管理员密码。Issue 原文未提部署方式；「免重新部署、在浏览器内完成」是本方案相对现有 `RESET_ADMIN_CREDENTIALS` 流程的收益，不是报告者提出的验收项。

现状有两个恢复路径，都各有缺口：

1. **仍能登录**：后台「账号安全」表单改密（`POST /api/password`）。不覆盖「已无法登录」场景。
2. **无法登录**：改 `INIT_ADMIN_*` 环境变量（可加 `RESET_ADMIN_CREDENTIALS`）后**重新部署**（`docs/guides/DEPLOYMENT.md`「登录失败」节、`TROUBLESHOOTING.md`）。能恢复，但要求用户还能操作 Wrangler CLI 和部署链路，且改的是部署配置而非站点数据；对部署渠道受限的用户门槛高。

方案：新增一个**无需登录**、由部署者持有的 `SETUP_TOKEN` 授权的恢复端点 `POST /api/recover`，允许直接提交新管理员凭据。`SETUP_TOKEN` 本来就是「部署者证明」的既有契约（`/api/install` 已用它），不引入新的凭证体系——这同时覆盖了 issue 提议的「token 重置」语义。

## 2. 现状事实（实现基线，2026-09-20 `develop`）

| 事实 | 锚点 |
| --- | --- |
| 管理员凭据存 D1 `settings` 表：`admin_username` / `admin_password`（PBKDF2，`salt:hash`），无独立用户表 | `worker/lib/bootstrap.ts` 常量 `ADMIN_USERNAME_KEY` / `ADMIN_PASSWORD_KEY`；`schema.sql` 的 settings key-value 表 |
| 密码哈希与校验、常量时间比较 | `worker/lib/crypto.ts` `hashPassword` / `verifyPassword` |
| `/install` 已有完整的「SETUP_TOKEN 授权 + 失败限流 + 同源校验 + 凭据写入」链路，恢复端点可直接复用 | `worker/routes/install.ts`：`authorizeSetup`、`ensureInstallRateLimitTable` / `readInstallFailures` / `consumeInstallAttempt` / `clearInstallFailures`、`isSameOriginRequest`、安装写入事务（claim token + 条件更新） |
| SETUP_TOKEN 校验入口 | `install.ts` 中 `authorizeSetup(c.env, c.req.header('X-Setup-Token'))` |
| 改密成功后的既有动作（可照搬）：写新哈希 → `clearAllSessions` + `clearAllCachedSessions` 作废全部会话 | `worker/routes/auth.ts` `POST /api/password` |
| `clearAllSessions` 语义：JWT secret 轮换，一次性作废全部会话 | `worker/lib/jwt.ts` `rotateJwtSecret`；`docs/reference/API_CONTRACT.md`「修改密码和凭据重置走 `rotateJwtSecret`」 |
| 登录限流（KV `rl:login:*`）与缺绑定的 fail-closed 口径 | `worker/middleware/rateLimit.ts` `loginRateLimit`；`API_CONTRACT.md`「缺 SESSION 绑定时的行为」 |
| 密码/用户名校验：install 用密码 12–256 位、用户名 ≤64 位、无控制字符；auth 改密才是 8–256 位 | `worker/routes/install.ts:32-34`（`MIN_PASSWORD_LENGTH=12`/`MAX_USERNAME_LENGTH=64`）；`worker/routes/auth.ts` `isValidNewPassword`（8） |
| `SETUP_TOKEN` 是可选变量（`SETUP_TOKEN?`）；未配置时 `/install` 返回 `configuration_required` | `worker/types.ts` `Env`；`worker/routes/install.ts` `GET /install/status` |
| 前端已有「无鉴权 + token 授权」页面先例：`Install.svelte`（SETUP_TOKEN + 新用户名/密码表单） | `src/views/Install.svelte`；挂载逻辑 `src/App.svelte` 安装分支 |
| 恢复后需把登录页引到新流程；登录失败提示在 `LoginModal` | `src/components/LoginModal.svelte` |
| Issue #24 正文只要求「使用 token 重置」，未指定端点形状；无后续评论收窄范围 | `issue://24` |

### 现状缺口（为什么现有能力不够）

- `RESET_ADMIN_CREDENTIALS` 流程要求「重新部署 + 等待下一次登录触发」，不能在浏览器内完成；对部署渠道受限的用户不可用。
- `SETUP_TOKEN` 只在 `/install`（未安装状态）被消费；已安装实例上这个部署者凭证没有任何用户可用的用途，属于已有能力未接入新场景。
- 文档没有「已安装实例、无法登录、手上有 SETUP_TOKEN」这条路径的任何说明。

## 3. 需求子项

### F-1 恢复端点 `POST /api/recover`

- 路径 `POST /api/recover`，挂在 admin 守卫**之外**的公开路由组（与 `authRoutes`/`installRoutes` 同组）；**不挂 `authRequired`**。不可用 `/api/admin/recover`——`worker/index.ts:34-35` 对 `/api/admin`、`/api/admin/*` 强制 `authRequired`，免登录端点放该前缀下会被拦死。
- 鉴权：请求头 `X-Setup-Token`，复用 `authorizeSetup`；未配置 `SETUP_TOKEN` 的实例一律 401（不暴露「token 是否配置」的状态细节，直接按未授权处理）。
- 同源校验：复用 `isSameOriginRequest`，跨域 403（与 `/install` 一致）。
- 失败限流：复用 install 的 D1 失败计数实现（`consumeInstallAttempt` 系列或同构实现），达到阈值返回 `RATE_LIMITED`。限流 key **独立于登录限流**（避免爆破恢复端点烧掉登录尝试次数，或反之）；与 install 共用还是独立 key 由实现定，文档写清（见 R3）。
- 请求体：`{ password }`（**只重置密码，不含 username**，见 F-4）。恢复端点**专用密码策略**（有意区别于 install 的 12–256）：长度 8–12 位，且至少包含两类字符（小写/大写/数字/符号 四类中任意 ≥2 类）。不满足 → `code=BAD_REQUEST`，无写入。
  > 口径提醒：此上限 12 位低于 `/install` 的最小 12 位，是恢复端点刻意的独立策略，不复用 install 的长度规则；登录不再校验长度，故不影响后续登录。
- 前置绑定检查：与 `/install` 一致，缺 `DB`/`SESSION` 绑定或 D1/KV 不可达时返回服务端错误（HTTP 200 + `code=SERVER_ERROR`）。恢复成功需 `createSession` 签发 `LoginResp`，缺 `SESSION` 绑定时该路径 fail-closed，不能静默降级。
- 未安装实例：`/recover` 在站点尚未安装（无管理员凭据、无安装标记）时不执行恢复，引导到 `/install`；避免绕过安装 claim 事务写出一套凭据。
- 行为（全部成功时）：
  1. 写入 `admin_password`（新哈希）；`admin_username` **不改**（D-2）；
  2. **不写 `admin_bootstrap_password`**，保持它作为 `INIT_ADMIN_*` 最近一次应用值的快照；如果把它改成新哈希，而 `INIT_ADMIN_PASSWORD` 未变，下一次非 web-install 实例登录会被 `ensureAdminBootstrap` 判定为初始化凭据变化并回滚本次恢复；
  3. 轮换 JWT secret（`rotateJwtSecret`），作废全部会话；
  4. 清除该来源的恢复失败限流计数（恢复者刚验证过部署者凭证，不应再被限流拦住）；
  5. 返回 `LoginResp`（用现有 `admin_username` 登录），前端直接进入登录态。
- 原子性：恢复只更新 `admin_password` 一个密码键；用户名键和 bootstrap 快照均不改。
- 不允许通过恢复端点修改用户名或除密码以外的任何数据；不触碰 `data_version`（凭据不属于公开数据）。

### F-2 恢复页面 `/recover`（前端）

- 独立轻量页（先例：`Install.svelte`），字段：SETUP_TOKEN、新密码、确认密码。**不含用户名字段**（D-2 只重置密码）；页面可只读展示当前 `admin_username` 供确认，但不可编辑。
- 入口：登录失败提示中给出「忘记密码？」链接；直接访问 `/recover` 也可达。
- 成功后：清除本地旧会话残留，使用返回的 `LoginResp` 直接进入登录态并跳转首页/后台。
- 失败反馈与 install 一致：token 错误、限流、校验错误分别可辨识。
- 公开模式下该页面不泄露任何站点数据；匿名可见的只有表单本身。

### F-3 文档与契约同步

- `docs/reference/API_CONTRACT.md`：新增端点行、鉴权方式（`X-Setup-Token` + 同源）、限流语义、与 `/install` 的关系（安装用 / 已安装恢复用）。
- `docs/guides/DEPLOYMENT.md` 与 `TROUBLESHOOTING.md`：恢复路径重排为三级——①能登录→改密表单；②不能登录+有 SETUP_TOKEN→`/recover`；③不能登录+无 SETUP_TOKEN→`INIT_ADMIN_*` + `RESET_ADMIN_CREDENTIALS` 重部署兜底（现有内容降级为兜底路径）。
- `shared/types.ts`：恢复请求/响应类型与 `InstallReq`/`LoginResp` 的复用关系。

### F-4 明确非目标

- **不允许修改用户名**（D-2）：恢复端点只重置密码，`admin_username` 保持不变；请求体不接受 username，前端表单不提供该字段。需要改用户名的场景走登录后的后台流程，不在本需求内。
- 不做「通过邮箱/外部服务找回」：项目无邮件服务，不引入外部依赖。
- 不做「旧密码 + 恢复码」双因子：SETUP_TOKEN 本身就是部署者凭证，权限等同于可重新部署。
- 不改动 `/install` 的既有语义与安装判定。
- 不为未配置 `SETUP_TOKEN` 的实例提供免凭证恢复——那等于把管理员权限暴露给任何访客。

## 4. 验收标准

**后端**

- 状态码约定沿用 `API_CONTRACT.md` 包络：业务错误返回 HTTP 200 + `code` 区分，仅未授权（真实 401）与跨域（真实 403）使用真实 HTTP 状态，与 `/install` 一致。下列断言按此口径。
- 正确 `SETUP_TOKEN` + 合法新密码：D1 中 `admin_password` 更新、`admin_username` **不变**，旧 token 全部失效（旧 Bearer 请求 401），响应为可用 `LoginResp`（username 为原值）。
- 缺失/错误 `X-Setup-Token`：真实 HTTP 401 + `code=UNAUTHORIZED`；连续失败触发限流后返回 HTTP 200 + `code=RATE_LIMITED`，此时即使 token 正确也被拦截。
- 跨域请求：403，与 `/install` 一致。
- 密码校验：长度 8–12 且至少两类字符；不满足（过短、过长、单一字符类）返回 HTTP 200 + `code=BAD_REQUEST`，不产生任何写入。请求体若携带 username 字段被忽略，不改 `admin_username`。
- 未配置 `SETUP_TOKEN` 的实例：一律 401（响应不区分「未配置」与「错误」）。
- 恢复后再次用新凭据登录正常；`admin_username` 不变；`admin_bootstrap_password` 保持原快照，后续带未变化 `INIT_ADMIN_*` 的登录**不会**把恢复后的密码改回旧值。
- 已安装实例上 `/install` 行为不变（仍拒绝 `already installed`）。

**前端**

- `/recover` 页面在匿名态可达，公开模式下不泄露站点数据；登录失败提示可见「忘记密码？」入口。
- 成功流程：提交 → 进入登录态 → 后台可用；旧标签页的旧会话请求返回 401 并被前端正常处理。
- token 错误、限流、字段校验错误分别有明确提示。

**文档**

- `API_CONTRACT.md`、`DEPLOYMENT.md`、`TROUBLESHOOTING.md` 三处与新行为一致，恢复路径三级口径无矛盾。

**通用门禁（CONTRIBUTING.md §4，涉及 API 行为按更高档执行）**

- `npm run type-check` 0 errors / 0 warnings；`npm test` 全绿；`npm run build` 成功；`git diff --check` 通过。
- API 行为新增 → L1：`node scripts/smoke-test.mjs` 通过，恢复场景纳入冒烟断言（成功恢复、错误 token 401、限流）。
- 真实浏览器验证（L2/L3，按需）：`/recover` 表单交互、成功跳转、错误提示，在隔离 Chrome 下确认。

## 5. 风险与边界

- **R1 恢复端点成为绕过登录的攻击面**：SETUP_TOKEN 常量时间比较 + D1 限流 + 同源校验三重复用；限流阈值与 install 对齐；响应不泄露 token 配置状态。残余风险：SETUP_TOKEN 与登录密码同为长期凭证，泄露面叠加——文档需写明「SETUP_TOKEN 视同管理员级凭证，妥善保管」。
- **R2 错误同步 bootstrap 快照会导致凭据回滚**：F-1 第 2 步必须保持 `admin_bootstrap_password` 不变；它记录最近一次 `INIT_ADMIN_*` 应用值，不是手工改密后的镜像。实现已用 smoke 场景验证：写入新 bootstrap 哈希会使未变的 INIT 密码校验失败，下一次登录回滚。
- **R3 与 `/install` 限流 key 共用导致互相影响**：安装与恢复共用计数时，安装失败可能锁死恢复（或反之）。倾向独立 key；实现时定，文档写清。
- **R4 前端路由 `/recover` 与 SPA 路由/Service Worker 缓存交互**：按 `/admin`、`/install` 的既有页面路由先例接入，避免新增特殊分支。
- **R5 旧会话作废的 15 秒撤销窗口**：`rotateJwtSecret` 是即时全局失效（不依赖 KV 撤销名单），不等同于 logout 的 15 秒窗口；验收按「旧 token 401」断言，不引入对撤销名单的依赖。
- **R6 报告者未持有 SETUP_TOKEN**：部署者即管理员的项目里两者通常同源。`SETUP_TOKEN` 不落库，`authorizeSetup` 每次请求实时读 `env.SETUP_TOKEN` 比较（`install.ts:79-83`），忘记原值不影响恢复——在 Cloudflare 后台（设置 → 变量和密钥 → 生产环境，类型为密钥）或 `npx wrangler secret put SETUP_TOKEN` 设置新值，再按文档重新触发生产部署即可生效；`wrangler.toml` 的 `keep_vars = true` 保证后续部署不抹掉它。已按文档在安装后删除 Secret 的实例同理（后台新建即可）。当前已安装实例没有任何端点能单独验证 token（`POST /api/install` 在已安装时先返回 `already installed`，不做 token 比对），`/recover` 将成为首个可验证路径；401 即 token 未生效。完全无法操作 Cloudflare 后台又无法重新部署的部署者没有任何恢复路径（这是部署者级权限的固有边界）；仍可重新部署的，兜底路径是现有的 `INIT_ADMIN_*` + `RESET_ADMIN_CREDENTIALS` 流程——用 env 里新设的凭据在下次登录时触发覆盖，不要求仍有旧登录能力。
- **R7 恢复页面被第三方 iframe 嵌套钓鱼**：与 `/install` 同等暴露面；沿用现有安全头，不在本需求内新增防护（如需收紧 CSP frame-ancestors 属独立安全决策）。

## 6. 涉及文件（预计改动面）

| 层 | 文件 | 动作 |
| --- | --- | --- |
| Worker | `worker/routes/auth.ts` 或新 `worker/routes/recover.ts`；`worker/index.ts` 挂载 | 新增恢复路由 |
| Worker | 复用 `worker/routes/install.ts` 的授权/限流 helpers（必要时抽到 `worker/lib/` 供两处共用） | 重构或直接复用 |
| Shared | `shared/types.ts` | 新增恢复请求/响应类型 |
| 前端 | `src/views/Recover.svelte`（新）、`src/App.svelte` 路由分支、`src/components/LoginModal.svelte` 入口链接 | 新增页面与入口 |
| 文档 | `docs/reference/API_CONTRACT.md`、`docs/guides/DEPLOYMENT.md`、`docs/guides/TROUBLESHOOTING.md` | 契约与恢复路径三级口径 |
| 测试 | `tests/unit/`（路由行为、限流、bootstrap 同步）；`scripts/smoke-test.mjs` 恢复场景 | 新增断言 |

## 7. 实施顺序建议

1. 后端端点 + 单测（授权、限流、校验、写入、会话作废、bootstrap 同步）。
2. 冒烟场景纳入 `smoke-test.mjs`。
3. 前端 `/recover` 页 + 登录失败入口 + 组件测试。
4. 文档三处同步。
5. 每步固定门禁：`npm run type-check` → `npm test` → `npm run build` → `git diff --check`；端点完成后加 `node scripts/smoke-test.mjs`。
