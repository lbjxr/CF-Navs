> **STATUS: 已完成**（判定于 2026-10-15）——REQ-14 已落地：`worker/routes/recover.ts` 已接线，CHANGELOG 有 L2 真实浏览器验收记录。

# 管理员密码恢复端点开发文档（Issue #24 / REQ-14）

> 配套需求：`docs/plans/ADMIN_RECOVERY_REQUIREMENTS.md`（验收清单与风险以需求文档为准）。
> 高保真效果图：`docs/plans/ADMIN_RECOVERY_MOCKUP_HIFI.html`（7 状态，复刻 `Install.svelte` 视觉，仅评审参考、不入构建）。
> 本文件是**实现契约**：端点/模块接口、鉴权与限流接线、改动文件清单、分阶段落地顺序与验证门。
> 基线：develop（2026-09-20）。开工需维护者显式确认（Issue #24 维护者已表示「尽快处理」）。

## 0. 交付范围一句话

新增免登录的 `POST /api/recover`：同源 + `X-Setup-Token`（复用 `/install` 的部署者令牌）+ 独立限流，校验通过后只写入新管理员密码（保留 `admin_username` 和 `admin_bootstrap_password` 快照）、轮换 JWT secret 作废全部会话，返回 `LoginResp` 直接进入登录态；前端 `/recover` 页承载表单与错误/成功/引导态。

## 1. 关键前置修正（相对需求文档初稿）

实现前必须以源码为准修正需求文档两处事实，否则实现会撞中间件或校验口径不一致：

| # | 需求文档初稿 | 源码事实 | 结论 |
| --- | --- | --- | --- |
| C1 | 端点 `POST /api/admin/recover` | `worker/index.ts:34-35` 对 `/api/admin`、`/api/admin/*` 挂 `authRequired`——该前缀下所有路由强制登录 | 恢复端点免登录，**必须改用 `/api/recover`**，挂在 admin 守卫之外的公开路由组 |
| C2 | 「密码 8–256、用户名 1–32」 | `install.ts:32-34`：`MIN_PASSWORD_LENGTH=12`、`MAX_USERNAME_LENGTH=64`；`auth.ts` 改密才是 8 | 恢复**不复用** install 长度规则，用专用策略（见 §9 D-4）：密码 8–12 位、≥2 类字符；用户名不接受（D-2 只重置密码） |
需求文档 F-1、F-2、§4 涉及这两处的表述已同步。高保真效果图密码提示与错误文案已改为「8–12 位、≥2 类字符」，用户名字段改为只读展示。

## 2. 改动文件清单

### 2.1 新增文件

| 文件 | 职责 | 关键契约 |
| --- | --- | --- |
| `worker/routes/recover.ts` | `POST /api/recover` 路由 | 见 §3 |
| `worker/lib/setupToken.ts` | 共享 `authorizeSetup` + `isSameOriginRequest` | 从 `install.ts` **原样抽出**（行为不变），install 与 recover 共用；`authorizeSetup(env, supplied)` 用 `secretsEqual` 常量时间比较 `env.SETUP_TOKEN` |
| `worker/lib/installRateLimit.ts` | 共享安装/恢复失败限流 | 从 `install.ts` 抽出 `ensureInstallRateLimitTable`/`readInstallFailures`/`consumeInstallAttempt`/`clearInstallFailures` 与常量（表 `install_rate_limits`、`RATE_LIMIT_MAX_ATTEMPTS=5`、窗口 10min）；`client_key` 由调用方传入，recover 用 `recover:<ip>` 前缀与 install 的 `<ip>` **隔离计数** |
| `src/views/Recover.svelte` | `/recover` 页面 | 复刻 `Install.svelte` 视觉；见 §4 |
| `tests/unit/recover.test.ts` | 端点行为单测 | 见 §6 |

> 抽取 `setupToken.ts` / `installRateLimit.ts` 是为避免第三份重复定义（`authorizeSetup`、限流逻辑、`admin_*` key 常量当前散在 `install.ts` 与 `bootstrap.ts`）。管理员 settings key 常量统一从 `worker/lib/bootstrap.ts` 导入，不在 recover 里第三次声明。

### 2.2 复用现成实现（不重写）

| 符号 | 来源 | 用途 |
| --- | --- | --- |
| `hashPassword` / `secretsEqual` | `worker/lib/crypto.ts` | 新密码哈希、令牌比较 |
| `setSettingValue` / `getSettingValues` | `worker/lib/db` | 读安装状态、写凭据 |
| `rotateJwtSecret` | `worker/lib/jwt.ts`（经 `clearAllSessions`，`middleware/auth.ts:62-64`） | 作废全部会话 |
| `clearAllCachedSessions` | `worker/middleware/auth.ts:58-60` | 清当前 isolate 缓存 |
| `createSession` | `worker/lib/session.ts` | 签发 `LoginResp` |
| `hasSessionBinding` / `getClientIp` | `worker/lib/sessionStore` / `middleware/rateLimit` | 绑定判定、限流 key |
| `ADMIN_USERNAME_KEY` 等 key 常量 | `worker/lib/bootstrap.ts` | 凭据/bootstrap 标记写入 |
| `LoginResp` | `shared/types.ts` | 复用响应形状（请求体只 `{ password }`，见 §9 D-2） |

### 2.3 修改文件

| 文件 | 改动 |
| --- | --- |
| `worker/index.ts` | 引入 `recoverRoutes`，在 admin 守卫之外挂 `app.route('/api', recoverRoutes)`（与 `authRoutes`/`installRoutes` 同组，`:29-31` 附近） |
| `worker/routes/install.ts` | 改为从 `setupToken.ts`/`installRateLimit.ts` 导入被抽出的 helper 与常量（删除本地重复定义，行为不变） |
| `shared/types.ts` | 新增 `RecoverReq = { password: string }`（**不含 username**，D-2）；响应复用 `LoginResp` |
| `src/lib/api.ts` | 新增 `authApi.recover(token, { password })`：`POST /api/recover`，头带 `X-Setup-Token`，无 Bearer |
| `src/App.svelte` | 新增 `/recover` 路由分支（对齐 `/install` 既有分支），挂载 `Recover.svelte`；成功后清本地会话残留、以 `LoginResp` 进登录态 |
| `src/components/LoginModal.svelte` | 登录失败提示加「忘记密码？」链接 → `/recover` |
| `docs/reference/API_CONTRACT.md` | 认证接口表补 `POST /api/recover` 行 + 鉴权/限流/与 install 关系 |
| `docs/guides/DEPLOYMENT.md`、`TROUBLESHOOTING.md` | 恢复路径重排为三级（①改密表单 ②`/recover` ③`RESET_ADMIN_CREDENTIALS` 兜底） |
| `scripts/smoke-test.mjs` | 恢复场景断言（见 §6.2） |
| `docs/BACKLOG.md`、`docs/plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md` | REQ-14 登记（§1 可开工 / RD 证据行） |

### 2.4 明确不改

`worker/middleware/auth.ts` 的 `authRequired`、`/api/admin` 守卫链、`/install` 的安装判定与 claim 事务语义、`/api/password` 改密流程、`bootstrap.ts` 的 `ensureAdminBootstrap` 逻辑（recover 只写它读的那几个 key，不改它的判定）。

## 3. `worker/routes/recover.ts` 契约

### 3.1 请求

- `POST /api/recover`，**不挂 `authRequired`**（公开路由组）。
- 头：`X-Setup-Token`。
- 体：`{ password }`（`RecoverReq`；**不含 username**，D-2）。

### 3.2 处理顺序（与 `/install` 对齐，逐条 fail-fast）

1. **同源**：`isSameOriginRequest(c.req.raw)` 否 → `fail(FORBIDDEN, 'cross-origin ...'), 403`（真实 403）。
2. **绑定/可达**：`DB` 缺失或不可达、`SESSION` 缺失（`hasSessionBinding`）或不可达 → `fail(SERVER_ERROR, 'required bindings are unavailable')`（HTTP 200 + code）。恢复成功依赖 `createSession`，缺 `SESSION` 必须 fail-closed，不静默降级。
3. **已安装校验**：`getInstallationState(DB)`；**未安装**（无凭据、无标记）→ `fail(BAD_REQUEST, 'not installed')`；前端据此引导 `/install`。不在未安装实例上写凭据，避免绕过安装 claim 事务。
4. **限流读**：`ensureInstallRateLimitTable` + `readInstallFailures(DB, 'recover:'+ip)`；命中上限 → `fail(RATE_LIMITED, ...)`（HTTP 200 + code）。
5. **令牌校验**：`authorizeSetup(env, X-Setup-Token)` 为假 → `consumeInstallAttempt(DB, 'recover:'+ip)` 后 `fail(UNAUTHORIZED, 'unauthorized'), 401`（真实 401）。未配置 `SETUP_TOKEN` 时 `authorizeSetup` 恒假 → 同样 401，不区分「未配置/错误」。
6. **密码校验**：长度 `8..12` 且至少两类字符（小写/大写/数字/符号 四类中 ≥2 类）→ 否则 `fail(BAD_REQUEST, ...)`，**不产生任何写入**。请求体若携带 username 一律忽略，不校验、不写入。此策略是恢复端点**专用**，不复用 install 的 `MIN_PASSWORD_LENGTH`；抽 `isValidRecoverPassword(pw)` 纯函数便于单测。
7. **写入**：调用 `setSettingValue(DB, admin_password, newHash)`，只更新 `admin_password`。`admin_username` / `admin_bootstrap_username` / `admin_bootstrap_password` **不写、不改**（D-2）。`admin_bootstrap_password` 是非 web-install 实例用于判断 `INIT_ADMIN_*` 是否变化的最近快照；把它改成新哈希会使未变的 INIT 密码校验失败，下一次登录回滚本次恢复。该写入与现有 `/api/password` 保持一致。
8. **作废会话**：`await clearAllSessions(env)`（= `rotateJwtSecret`）+ `clearAllCachedSessions()`。旧 Bearer 立即失效（不依赖 KV 撤销名单，无 15 秒窗口）。
9. **清限流**：`clearInstallFailures(DB, 'recover:'+ip)`。
10. **签发**：读现有 `admin_username` → `createSession(env, adminUsername)` → `ok(LoginResp)`；createSession 抛错 → `fail(SERVER_ERROR, 'recovery completed but session creation failed')`。

### 3.3 状态码口径（沿用 `API_CONTRACT.md` 包络）

| 情况 | 响应 |
| --- | --- |
| 成功 | HTTP 200 + `code=0` + `LoginResp` |
| 跨域 | 真实 HTTP 403 + `code=FORBIDDEN` |
| 令牌错误/未配置 | 真实 HTTP 401 + `code=UNAUTHORIZED` |
| 限流 | HTTP 200 + `code=RATE_LIMITED` |
| 密码校验越界（过短/过长/单一字符类）| HTTP 200 + `code=BAD_REQUEST`（无写入） |
| 未安装 | HTTP 200 + `code=BAD_REQUEST` `'not installed'` |
| 绑定缺失/不可达/签发失败 | HTTP 200 + `code=SERVER_ERROR` |

## 4. `src/views/Recover.svelte` 契约

- 视觉复刻 `Install.svelte`（双栏玻璃卡、teal/sky 渐变、48px 输入、渐变主按钮），文案换恢复场景（效果图 `ADMIN_RECOVERY_MOCKUP_HIFI.html` 已定版）。
- 字段：`SETUP_TOKEN`（password 型、不自动填充）、新密码、确认新密码。**无用户名输入框**（D-2）；可只读展示当前 `admin_username` 供确认。
- 进入页时可先查 `GET /api/install/status`：`installed` → 显示恢复表单；`needs_install`/`configuration_required` → 引导 `/install`（对应效果图⑦）。
- 提交：`authApi.recover(token, payload)`；
  - 成功 → 用返回 `LoginResp` 走 App 登录态、跳首页/后台，提示旧会话已失效。
  - 401 / RATE_LIMITED / BAD_REQUEST → 分别可辨识文案（效果图②③④）；401 附「忘记令牌可在 Cloudflare 后台重设」提示（效果图⑤，对应 R6）。
- 令牌只随请求发送，不写 localStorage。
- 公开模式下页面不拉取任何站点数据。

## 5. 分阶段实施与验证门

| 阶段 | 内容 | 验证门 |
| --- | --- | --- |
| **1 抽取地基** | `setupToken.ts`、`installRateLimit.ts` 抽出；`install.ts` 改引用 | L0（type-check/test/build/`git diff --check`）；纯搬迁、`/install` 行为逐字节等价，审计=既有 `install.test.ts` 全绿 + diff 仅搬迁与 import |
| **2 后端端点** | `recover.ts` + `index.ts` 挂载 + `shared/types.ts` + `recover.test.ts` | L0；L1：`smoke-test.mjs` 恢复场景（§6.2） |
| **3 前端页** | `Recover.svelte`、`api.ts`、`App.svelte` 路由、`LoginModal` 入口 | L0（含组件测试）；L2：真实 Chrome 表单/成功跳转/错误态/引导 |
| **4 文档 + 收尾** | API_CONTRACT/DEPLOYMENT/TROUBLESHOOTING 三级口径；RD/BACKLOG/CHANGELOG 回写；同步修正需求文档 §1 C1/C2 与效果图密码提示 | L0（文档级：`git diff --check` + 链接可达）；三处口径无矛盾 |

每阶段独立提交；`App.svelte` 若与其它模块同轮改按仓库约定串行。

## 6. 测试计划

### 6.1 单元（`recover.test.ts`，参照 `install.test.ts` 的 FakeDb/createKv 夹具）

- 成功：正确令牌 + 合法新密码 → `admin_password` 更新、`admin_username` 与 `admin_bootstrap_password` **不变**、返回可用 `LoginResp`（username 为原值）。
- 令牌错误/缺失 → 401；连续失败到阈值 → RATE_LIMITED；限流后即使令牌正确仍 RATE_LIMITED。
- 限流 key 隔离：recover 失败不影响 `/install` 的计数（断言不同 `client_key`）。
- 跨域 → 403。
- 密码校验：`isValidRecoverPassword` 覆盖 <8 / >12 / 恰好 8 与 12 边界 / 单一字符类（纯数字、纯小写）拒绝 / 两类字符（如字母+数字）通过；越界 → BAD_REQUEST 且**无写入**（断言 settings 未变）。请求体携带 username 时被忽略，`admin_username` 不变。
- 未安装实例 → `not installed`，无写入。
- 缺 `SESSION` 绑定 → SERVER_ERROR（fail-closed）。
- 会话作废：`rotateJwtSecret` 被调用（旧 secret 变化）；反向对照——移除第 8 步则「旧 token 失效」断言失败。
- bootstrap 快照保护：反向对照——如果恢复把 `admin_bootstrap_password` 改成新哈希，而 `INIT_ADMIN_PASSWORD` 未变，模拟下一次 `ensureAdminBootstrap` 会触发回滚；实现必须断言 bootstrap 快照保持原值。

### 6.2 L1（`smoke-test.mjs`）

在本地隔离 Worker（临时 D1/KV，脚本自管）跑：安装后 → 调 `/api/recover` 用新密码重置 → 旧 token 请求受保护端点 401 → 新密码 `/api/login` 成功；错误令牌 401；缺令牌头 401。

### 6.3 L2（真实 Chrome，`real-chrome-cdp-testing` 流程）

隔离临时 Chrome + 页面内 `fetch('/api/recover', ...)`（POST JSON，避免 PowerShell 引号问题）：表单提交成功跳转、令牌错误/限流/校验错误文案、未安装引导 `/install`；截图留证；按精确 profile 清理。域名/凭据只在 Git 忽略的 `verify.local.json`。

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 端点误放 `/api/admin/*` 被 `authRequired` 拦死 | §1 C1：固定 `/api/recover`，公开路由组；单测断言无需 Bearer 即可到达 |
| 绕过登录的攻击面 | 同源 + 令牌常量时间比较 + 独立 D1 限流；401 不泄露令牌是否配置 |
| bootstrap 快照被错误覆盖致凭据回滚 | §3.2 第 7 步只写 `admin_password`；单测 + L1 smoke 覆盖非 web-install INIT bootstrap 场景 |
| 限流与 install 互相锁死 | 独立 `recover:` 前缀 key（同表不同命名空间）；单测隔离断言 |
| 抽取 helper 改坏 `/install` | 阶段 1 纯搬迁 + 既有 `install.test.ts` 回归；diff 审计仅搬迁 |
| 缺 `SESSION` 时签发失败但已改密 | 第 2 步前置 fail-closed，改密前就拒绝；不进入写入 |
| 写入后缩进被工具减半 | 每次写/改跑 `git diff --numstat` + 前导空格宽度直方图（应全偶），异常逐行 `n→n*2` 修复复验 |

## 8. 完成定义（DoD）

1. §2 清单落地，§5 阶段门逐项通过；
2. 需求文档 §4 验收（后端/前端/文档/门禁）全部达成或显式豁免，§1 C1/C2 已回修；
3. L0 全绿 + L1 恢复场景 + L2 截图证据；
4. 阶段 2/3 属行为/公共契约改动 → 独立 `workflow-reviewer` 复核 `PASS`；
5. RD/BACKLOG（§1 可开工）/CHANGELOG 回写；效果图密码提示与用户名字段已同步；bootstrap 快照保护说明与实现一致。

## 9. 决策（已定 / 待裁定）

| # | 决策点 | 状态 | 结论 / 待定 |
| --- | --- | --- | --- |
| D-1 | 端点路径 | 已定 | `POST /api/recover`（不可用 `/api/admin/recover`，见 §1 C1） |
| D-2 | 恢复是否允许改用户名 | **已定** | **不允许**：只重置密码，`admin_username` 保持不变；请求体不含 username，前端无用户名输入框（维护者 2026-09-20 裁定） |
| D-3 | 限流存储 | 已定 | 复用 `install_rate_limits` 表，`client_key` 用 `recover:<ip>` 与 install 隔离 |
| D-4 | 密码校验规则 | **已定** | 恢复端点**专用**：长度 8–12 且 ≥2 类字符（小写/大写/数字/符号）；**不复用** install 的 12–256（维护者 2026-09-20 裁定）。抽 `isValidRecoverPassword` 纯函数 |
| D-5 | 令牌来源 | 已定 | 复用 `SETUP_TOKEN`，不引入第二套凭证；未配置实例走 R6 后台重设 |

## 10. 实现自检与复核（审计）

### 10.1 仓库特有陷阱
- **Svelte 5 组件测试解析条件**：`Recover.svelte` 若在 `onMount` 注册 `window`/`document` 监听，测试依赖 `vite.config.ts` test 模式 `resolve.conditions:['browser']`（`CONTRIBUTING.md` §4）；观察不到监听器先排查解析条件与缺失浏览器 API，再下结论。
- **写入缩进减半**：见 §7 末条，逐次自检。
- **令牌不落库**：`authorizeSetup` 实时读 `env.SETUP_TOKEN`；不要把令牌写进 D1/KV/日志/截图。

### 10.2 独立复核
- 阶段 2（后端端点，鉴权/持久化/安全）与阶段 3（前端 + 公共交互）属非简单改动 → Builder 直接自验后走 `workflow-reviewer`，输入原始目标、验收标准、实际 diff、L0/L1/L2 证据；`PASS` 才交付。
- 阶段 1（纯搬迁）、阶段 4（文档）视范围可跳过独立复核，须在答复说明理由。

### 10.3 提交与安全门（每阶段）
- 独立提交，`develop` 分支；实现进默认分支才触发关闭，日常用 `refs #24`/不带关闭关键字。
- 精确路径 `git add --`、`git diff --cached --name-only/--stat/--check` + 完整暂存差异 + 敏感内容扫描（真实域名/凭据/令牌/私有端点）、大文件门、分支/身份/远端分叉检查。
