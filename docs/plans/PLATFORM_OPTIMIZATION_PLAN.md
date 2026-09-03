# CF-Navs 平台优化开发计划

审计基线：`develop` @ `c5b70ae`，`npm test` 483 passed / 78 files，`npm run type-check` 0 error / 0 warning。

本文件是本轮优化的唯一执行依据。每条任务都必须写明**证据**（当前源码事实）、**做法**和**验收标准**；没有可验证验收标准的想法不进入本计划。完成一项后立即回本文件更新状态，再开始下一项。

## 状态总览

| 编号 | 任务 | 分类 | 优先级 | 状态 |
| --- | --- | --- | --- | --- |
| L1 | 已安装站点跳过 `/api/install/status` 探测 | 加载 | P0 | ✅ 已完成 |
| L2 | `/api/data/version` 合并 D1 查询 | 加载 | P0 | ✅ 已完成 |
| L3 | Service Worker 预热构建产物 | 加载 | P1 | ✅ 已完成 |
| L4 | 导航请求改 stale-while-revalidate | 加载 | P2 | ✅ 已完成 |
| S1 | 退出登录真正失效 token | 安全 | P0 | ✅ 已完成 |
| S2 | 图标代理缓存键归一化，防匿名放大 | 安全 | P1 | ✅ 已完成 |
| S3 | `custom_js` 被 CSP 阻断（改为 blob 注入，CSP 不放宽内联） | 安全 | P1 | ✅ 已完成 |
| S4 | 「当前页弹层」打开方式被 CSP 阻断 | 安全 | P1 | ✅ 已完成 |
| S5 | 书签 URL 协议白名单 | 安全 | P1 | ✅ 已完成 |
| S6 | 设置项长度上限 | 安全 | P2 | ✅ 已完成 |
| S7 | 排序/导入数组长度上限 | 安全 | P2 | ✅ 已完成 |
| S8 | 安全相关文档与实现对齐 | 安全 | P1 | ✅ 已完成 |
| R1 | 删除 `stores.ts` 遗留数据获取层 | 冗余 | P1 | ✅ 已完成 |
| R2 | 抽取 Worker 路由公共 helper | 冗余 | P1 | ✅ 已完成 |
| R3 | 书签 POST/PUT 校验去重 | 冗余 | P0 | ✅ 已完成 |
| R4 | 前端 `clamp` / `isRecord` 去重 | 冗余 | P2 | ✅ 已完成（clamp 部分为误判） |
| R5 | 清理未使用导入与死导出 | 冗余 | P2 | ✅ 已完成 |
| U1 | 建立基础设计 token | UI | P1 | ✅ 已完成 |
| U2 | 收敛按钮样式 | UI | P1 | ✅ 已完成 |
| U3 | 收敛输入框与弹窗样式 | UI | P1 | ✅ 已完成 |
| U4 | 收敛过渡动画 | UI | P2 | ✅ 已完成 |
| F1 | 归档已完成的移动端布局计划 | 结构 | P2 | ✅ 已完成 |

优先级定义：P0 = 影响正确性或安全，必须做；P1 = 明确收益，本轮做；P2 = 收益有限但成本低，本轮末尾做；待决策 = 需要用户在两种取舍间拍板。

---

## 一、首访与二访加载链路

### 现状实测的请求序列

**首次访问（冷缓存，匿名，公开模式开启）**

| # | 请求 | 是否打 Worker | 说明 |
| --- | --- | --- | --- |
| 1 | `GET /` | 是 | `no-cache, max-age=0, must-revalidate` |
| 2 | `GET /assets/index-*.js`（227 KB） | 是 | `immutable` 一年 |
| 3 | `GET /assets/index-*.css`（77 KB） | 是 | `immutable` 一年 |
| 4 | `/icon.ico`、`/icon.png`、`/manifest.webmanifest` | 是 | `max-age=86400` |
| 5 | `GET /sw.js` | 是 | `no-cache` |
| 6 | `GET /api/install/status` | 是 | **串行阻塞在数据加载之前** |
| 7 | `GET /api/public/data` | 是 | 首次无本地快照 |

**关闭浏览器后二次访问（有 Service Worker + localStorage 快照）**

| # | 请求 | 是否打 Worker | 说明 |
| --- | --- | --- | --- |
| 1 | `GET /` | 是 | SW 是 network-first，必须等网络返回才能渲染 |
| 2 | `/assets/*` | 视情况 | 浏览器 immutable HTTP 缓存命中；SW Cache Storage 见 L3 |
| 3 | `GET /api/install/status` | 是 | **可以去掉** |
| 4 | `GET /api/data/version` | 是 | 必要；但内部做了 2 次 D1 查询 |
| 5 | `/api/public/data` | 否 | 版本一致时不请求 |

结论：二访最少 3 个 Worker 请求，其中 `/api/install/status` 是纯粹的浪费。

### L1 — 已安装站点跳过 `/api/install/status` 探测（P0）

**证据**

`src/App.svelte:357-395` 的 `checkInstallStatus()` 无条件 `await api.install.status()`，本地的 `cf-navs:installed` 标记只在**请求失败后**才作为兜底使用：

```ts
const installedHint = hasInstalledHint(getInstallHintStorage())
try {
  const status = await api.install.status()   // ← 永远先发，且 await
```

`initializeApp()`（`src/App.svelte:423-427`）在这个 await 完成前不会开始任何数据加载，因此它占用一个完整的串行 RTT。服务端 `worker/routes/install.ts:209-254` 每次会执行 `SELECT 1`（可达性探测）加一次 `SELECT key,value FROM settings WHERE key IN (3 个 key)`，共 2 次 D1 查询。

**做法**

1. `hasInstalledHint()` 为真时直接返回 `true`，不发请求。
2. 保留自愈路径：后续 `/api/data/version` 或 `/api/public/data` 因数据库不可用而失败时（区别于网络错误和 401），再触发一次 `api.install.status()` 复核；确认未安装则清除标记并跳转 `/install`。
3. `/install` 路径本身仍然无条件探测（用户主动进入安装页时必须拿真实状态）。
4. 判定逻辑放进 `src/lib/appInstall.ts` 的纯函数（如 `shouldProbeInstallStatus({ installedHint, pathname })`），保证可单测。

**验收**

- 新增 `tests/unit/appInstall.test.ts` 用例：`installedHint=true` 且路径为 `/` 时不探测；`installedHint=false` 时探测；路径为 `/install` 时无论标记如何都探测。
- 新增用例：数据库不可用错误触发一次复核探测；网络错误和 401 不触发。
- `npm run type-check`、`npm test`、`npm run build` 全绿。
- 真实浏览器复核（部署后）：二次访问首页时网络面板中不出现 `/api/install/status`；首次访问（清除 localStorage）仍出现一次。

**完成记录**

两个纯函数落在 `src/lib/appInstall.ts`：`shouldProbeInstallStatus({ installedHint, pathname, forceProbe })` 和 `shouldRecheckInstallAfterDataError(error)`。`App.svelte` 的 `checkInstallStatus(forceProbe)` 在不需要探测时直接返回，`recheckInstallAfterDataError()` 负责兜底。

顺带扩展了 `dataService` 的 `onRootError` 签名为 `(message, error?)`：`refreshPublicData` 原本只回传消息字符串，而复核判断必须按 `code` / `status` 分辨「服务端挂了」和「未登录 / 公开模式关闭」，光看文案做不到。

**写测试时发现自己的实现有洞**：`api.ts` 对网络失败抛的是 `status: 0` 且 `code: SERVER_ERROR`，第一版只看 `code`，会把弱网当成服务端挂了，在最不该发请求的时候再补一个探测。已改为先判 `status === 0` 直接返回 false，并补了对应用例。

变更文件：`src/lib/appInstall.ts`、`src/App.svelte`、`src/lib/dataService.ts`；测试 `tests/unit/appInstall.test.ts`（+8）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **518 passed / 81 files**；`npm run build` 成功；`git diff --check` 干净。

**待真机复核**：单测只锁住了纯函数和源码接线，「二访不出现 `/api/install/status`」这条必须在部署后用真实浏览器网络面板确认。

### L2 — `/api/data/version` 合并 D1 查询（P0）

**证据**

`worker/routes/public.ts:80-114` 依次调用 `getSiteConfig(c.env.DB)` 与 `getDataVersion(c.env.DB)`。这两个函数（`worker/lib/db/settings.ts:23` 与 `:88`）各自发一条 SQL，都只读 `settings` 表：

```sql
SELECT key, value FROM settings WHERE key IN ('site_title', 'public_mode')
SELECT value FROM settings WHERE key = 'data_version'
```

这是每次页面加载都会走的热路径，两次串行 D1 往返。

**做法**

在 `worker/lib/db/settings.ts` 增加 `getSiteConfigWithDataVersion(db)`，一条 `WHERE key IN ('site_title','public_mode','data_version')` 同时返回三个值，复用现有的 JSON 解析与默认值回退分支。`/api/data/version` 改用它；`getSiteConfig` 与 `getDataVersion` 保留给其它调用方。

**验收**

- 新增单测：用记录 `prepare` 调用的假 D1，断言 `/api/data/version` 处理过程中 `prepare` 只被调用 1 次。
- 新增单测：`site_title` / `public_mode` / `data_version` 任意缺失、值非法、非 JSON 时，返回值与改动前逐字段一致（对照现有 `getSiteConfig` / `getDataVersion` 的回退行为写断言）。
- `npm test` 全绿。

**完成记录**

`worker/lib/db/settings.ts` 新增 `getSiteConfigWithDataVersion`，把行解析抽成 `siteConfigFromRows` / `dataVersionFromValue` 两个内部函数，`getSiteConfig` 与 `getDataVersion` 复用同一份解析逻辑后行为不变（仍保留给其它调用方）。

测试用 `publicRoutes.request()` 直接打路由（沿用 `install.test.ts` 已有的模式），比只测 helper 更接近真实调用链：

- 断言 `prepare` 调用数为 1，并断言这唯一一条 SQL 里含 `data_version`（防止某个分支意外短路掉版本读取）。
- 断言 `public_mode: false` 的匿名分支同样只查一次，且仍返回 `code=1005` 加轻量配置。
- 12 组历史数据（缺失 / 非法类型 / 非 JSON / null）逐字段对照 `getSiteConfig` 与 `getDataVersion` 的旧行为。

**做了反向对照**：临时把路由改回 `getSiteConfig` + `getDataVersion` 两次调用，测试确实报 `expected [ …(2) ] to have a length of 1 but got 2`，确认断言不是空转。

变更文件：`worker/lib/db/settings.ts`、`worker/lib/db.ts`、`worker/routes/public.ts`；测试 `tests/unit/siteConfigVersion.test.ts`（新增 5）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **510 passed / 81 files**；`npm run build` 成功；`git diff --check` 干净。

### L3 — Service Worker 预热构建产物（P1）

**证据**

`public/sw.js:11` 的 `APP_SHELL` 只有 `['/index.html','/manifest.webmanifest','/icon.ico','/icon.png']`，`/assets/*` 不在其中。`:146-158` 对 `/assets/*` 走 cache-first，但缓存条目只能在 SW **已经控制页面之后**由 fetch 拦截写入。首次访问时 SW 在 `install` / `activate` 完成前无法拦截当次的 JS/CSS 请求，因此第一次访问结束时 Cache Storage 里没有任何 `/assets/*`。

后果：用户明确关心的「关闭浏览器后二次访问」场景，实际依赖的是浏览器 HTTP 缓存的 `immutable`，而不是 Service Worker。HTTP 缓存被清理或驱逐后就得回源。

**做法**

页面在 `load` 之后把当前文档实际用到的 `/assets/*` URL 通过 `postMessage` 交给 SW，SW 收到后 `cache.addAll`。资源清单从 `performance.getEntriesByType('resource')` 中筛选同源 `/assets/` 前缀取得，不需要引入构建插件，也不会因为文件名 hash 变化而失效。

在 `src/main.ts` 的 SW 注册回调里做，仅生产构建生效；`postMessage` 失败静默忽略。

**验收**

- 新增 `tests/unit/serviceWorkerPrecache.test.ts` 源码契约：`public/sw.js` 存在 `message` 事件监听且只接受同源 `/assets/` 前缀 URL；`src/main.ts` 在注册成功后发送该消息。
- 真实浏览器复核（部署后）：首次访问完成后，Cache Storage `cf-navs-v*` 中存在 `index-*.js` 与 `index-*.css`；第二次访问时这两个请求的 Network 面板来源标记为 ServiceWorker。
- SW 缓存版本号 `CACHE` 需要递增，避免旧版本 SW 的缓存条目残留。

**完成记录**

页面侧逻辑拆到 `src/lib/serviceWorkerClient.ts`（单测跑在 node 环境，没有真实的 `navigator.serviceWorker` 和 `performance`，必须能注入替身），`main.ts` 只负责接线。测试文件实际叫 `tests/unit/serviceWorkerClient.test.ts`。

`collectPrecacheAssetUrls` 从 `performance.getEntriesByType('resource')` 里筛同源 `/assets/` 前缀，去重、上限 50 条、`getEntriesByType` 抛异常时返回空数组。

**关键细节**：首次访问时 `navigator.serviceWorker.controller` 还是 `null`（SW 尚未接管），必须回退到 `registration.active`——而这一次恰恰是最需要预热的，因为 SW 拦不到当次的 JS/CSS 请求。有专门用例锁住这条。

SW 侧对收到的清单再校验一次同源和 `/assets/` 前缀，逐个 `cache.add` 而不是 `addAll`（任何一个失败都不该让整批预热落空），已存在的条目跳过。`CACHE` 从 `cf-navs-v14` 升到 `v15`。

变更文件：`public/sw.js`、`src/main.ts`、`src/lib/serviceWorkerClient.ts`（新增）；测试 `tests/unit/serviceWorkerClient.test.ts`（新增 13，与 L4 共用）。

### L4 — 导航请求改 stale-while-revalidate（P2）

**证据**

`public/sw.js:132-144` 对 `request.mode === 'navigate'` 使用 network-first，只有网络失败才回落缓存。同时 `worker/lib/assetHeaders.ts:38` 给 HTML 设 `no-cache, must-revalidate`。两者叠加的结果是：**每次打开页面都必须先等一个完整的网络往返才能开始渲染**，本地已有的 `/index.html` 缓存只在离线时才用得上。

**取舍**

改成 stale-while-revalidate（先返回缓存的 `/index.html`，后台再拉新版本写回缓存）可以让二访实现零网络等待的首次绘制。代价是**部署新版本后，用户下一次打开看到的仍是旧版本，再刷新一次才更新**。

因为 `/assets/*` 是 hash 文件名且 SW 对它们 cache-first，旧 HTML 引用的旧 JS/CSS 仍能从 Cache Storage 取到，不会出现白屏；但会存在一次版本滞后。

**需要用户决策**：接受「快一次、慢一版」，还是保持现在的「每次都最新、每次都等网络」。选择接受时，附带实现「检测到新版本后提示刷新」以缩短滞后窗口。

**用户决策：改成缓存优先 + 后台更新。**

**完成记录**

`public/sw.js` 的导航分支改为：命中缓存的 `/index.html` 就立刻返回，同时 `event.waitUntil` 保住后台的网络请求（`respondWith` 之后不 waitUntil 会让后台请求被中止）。缓存缺失时退化为纯网络请求。

后台拿到新 HTML 后逐字节比对旧缓存，**内容确实变化**才向所有窗口 `postMessage({ type: 'shell-updated' })`。不比对的话每次导航都会提示一遍。

`main.ts` 收到通知后弹一条 10 秒的 info toast「已检测到新版本，刷新页面即可使用」，把滞后窗口从「下次打开」缩短到「现在刷新一下」。

变更文件与测试同 L3。

**待真机复核**：二访首屏不等网络、部署后第一次打开出现新版本提示、离线时仍能打开——这三条都必须在真机确认。

---

## 二、接口安全

### S1 — 退出登录真正失效 token（P0）

**整改前历史证据（非当前实现）**

会话从 KV 存储迁移为无状态 JWT 后，初始实现只用 `signJwt` 生成 token，`validateSession` 只做签名和 `exp` 校验，不读 KV。

当时 `logout` 只清理当前 isolate 的内存缓存：

```ts
authRoutes.post('/logout', authRequired, async (c) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  if (token) clearCachedSession(token)
  return c.json(ok(null))
})
```

当时的风险是：JWT 在 `exp` 之前继续有效，退出登录无法影响共享设备或已泄露的旧 token；全局失效手段只有 `rotateJwtSecret`。

**当前实现**

当前 `worker/lib/sessionRevocation.ts` 使用完整 token 的 SHA-256 摘要作为 `revoked:<sha256>` key，不使用 JWT 内的 `jti` 作为 key。撤销 TTL 为 `max(60 秒, token 剩余寿命)`；撤销检查受单个 isolate 的 15 秒缓存窗口影响。logout 的 KV 写入失败时接口仍完成但撤销未落库，后续鉴权请求的 KV 读取失败可能返回错误。

**历史做法与验收记录**

历史方案曾提出把 `jti` 直接作为撤销 key；实际落地改为 token 摘要，以兼容旧 token 并避免将 token 内容暴露在 KV key 中。原始验收中的 TTL「不超过剩余寿命」已按 KV 60 秒硬下限修正为上述 `max(60 秒, 剩余寿命)` 语义。

**验收**

- 新增单测：登录得到 token → 校验通过 → logout → 同一 token 再校验返回 `null`。
- 新增单测：撤销记录的 KV TTL 使用 `max(60 秒, token 剩余寿命)`。
- 新增单测：未 logout 的其它 token 不受影响。
- `scripts/smoke-test.mjs` 增加断言：logout 后用旧 token 请求 `/api/admin/data` 返回 401。
- 同步更新 `docs/reference/API_CONTRACT.md` 的鉴权规则章节。

**完成记录**

**这个 bug 有直接证据**：`scripts/smoke-test.mjs:347` 从第一个提交 `4d8fff6` 起就断言「登出后 token 失效 → 401」。`a296e74` 把会话从 KV 改成无状态 JWT 并同时删掉了 `session.ts` 里的 KV 写入，这条断言从那一刻起就一直是失败的。CI（`.github/workflows/ci.yml`）只跑 type-check / 单测 / build，不跑需要线上部署和凭据的冒烟测试，所以没人发现。计划里原本要"新增"的冒烟断言其实早就存在，本轮不需要加——真正缺的是把它搬进 CI 能跑的单测。

实现落在 `worker/lib/sessionRevocation.ts`：

- 用 **token 的 SHA-256 摘要**而不是 `jti` 做撤销 key。这样对签发本次改动之前的老 token 同样有效，不需要把用户踢下线一次；而且 KV 被 dump 时不会连带泄露一批仍在有效期内的 token。
- TTL 取 token 剩余寿命（下限 60 秒，KV 的硬性下限），过期后墓碑自动消失，不会累积。
- 撤销检查只在 isolate 内存缓存未命中时走 KV，成本模型与既有的 15 秒 session 缓存一致。**代价是别的 isolate 上的 logout 最多 15 秒后才生效**，这个窗口是刻意换来的，已在测试和文档里写明。
- logout 的 KV 写入失败时仍返回成功：前端照常清本地登录态，但撤销未落库，token 会继续有效到 `exp`；后续鉴权的 KV 读取失败可能返回错误。

**写测试时发现了另一个真实缺陷**：`createSession` 的 JWT payload 只有 `{ username, exp }`，同一毫秒内的两次登录会签出**逐字节相同的 token**——撤销其中一个等于把两个都撤销了，「退出这台设备」的语义根本不成立。已加 `jti: crypto.randomUUID()`。老 token 缺 `jti` 不影响校验（只读 `username` / `exp`），所以向后兼容。

顺带把 `authRequired` 校验出的 `exp` 存进 Hono context（`Variables.sessionExpiresAt`），logout 直接取用，省掉一次重复的验签和 KV 读取。同时删掉了改用 JWT 后已无调用方的 `SESSION_PREFIX` / `getSessionKey`（属于 R5 的范围，顺手完成）。

**做了反向对照**：临时注释掉 logout 里的 `revokeSession`，`makes the token unusable afterwards` 用例确实失败。

变更文件：`worker/lib/sessionRevocation.ts`（新增）、`worker/lib/session.ts`、`worker/middleware/auth.ts`、`worker/routes/auth.ts`、`worker/types.ts`；测试 `tests/unit/sessionRevocation.test.ts`（新增 9）、`tests/unit/authSecurity.test.ts`（删除已失效的 `getSessionKey` 用例）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **526 passed / 82 files**；`npm run build` 成功；`git diff --check` 干净。

**待真机复核**：KV 是最终一致的，冒烟测试里 logout 紧接着的那个请求依赖写入 colo 的读己所写。部署后跑一次 `npm run regression:chrome` 或冒烟测试确认第 347 行断言现在通过。

### S2 — 图标代理缓存键归一化（P1）

**证据**

`worker/routes/icon.ts:75`、`:134` 用 `getCachedIconResponse(c.req.raw)` 作为 edge cache 查询键，`worker/lib/iconResponses.ts:57-64` 直接把整个 `Request`（含 query string）交给 `caches.default.match`。这两个路由都是**匿名可访问**的。

对比 `worker/lib/cache.ts:9-14`，公开数据缓存已经做了归一化（`url.search = ''`），图标代理没有。

后果：`GET /api/icon/1?v=<随机>` 每次都是新的缓存键，必然 miss，进而每次执行一次 `getBookmarkIconData` 的 D1 查询；若该书签还没有 `icon_blob` 且图标是 http(s) 地址，还会额外触发一次最长 5 秒的外站抓取（`worker/lib/iconData.ts:111`）。这是一条不需要任何凭据就能放大的 D1 读取与出网请求路径。

（注：写 D1 只发生在 blob 首次写入时，`setIconBlob` 之后不再重复写，所以放大的是读取与抓取，不是无限写入。）

**做法**

给图标代理增加合成缓存键：只保留 `pathname` 加一个白名单参数 `v`，且 `v` 必须匹配 `^[A-Za-z0-9_.:-]{1,64}$`，不匹配时从键中剔除。前端现有的 `/api/category-icon/:id?v=...` 缓存失效用法保持可用，随机长参数则统一落到同一个缓存条目上。

**验收**

- 新增单测：`?v=abc` 与 `?v=abc` 得到同一缓存键；`?v=<超长随机>`、`?foo=1`、无参数三者得到同一缓存键。
- 新增单测：`/api/icon/1` 与 `/api/icon/2` 键不同。
- 现有图标相关测试保持全绿。

**完成记录**

`worker/lib/iconResponses.ts` 新增 `iconCacheKey(request)`；三个图标路由（`/iconify/:prefix/:name`、`/icon/:id`、`/category-icon/:id`）在 handler 开头算一次 `cacheKey`，读写全部用它。

删掉了纯别名 `getCachedIconResponse`（它只是转发 `getCachedResponse`），改为直接调用。

**读写必须用同一个键**，漏掉任何一处都会让缓存永远 miss——比原来更糟。所以补了一条源码契约测试：断言 `iconCacheKey(c.req.raw)` 在 `icon.ts` 中恰好出现 3 次，且不再存在 `cacheResponse(c, c.req.raw` / `getCachedResponse(c.req.raw)` 的残留写法。

没有动 `worker/lib/cache.ts`（公开数据缓存本来就已经归一化）和 `iconifySearch` 的预热路径（它用自己构造的合成请求，没有 query 污染问题）。

变更文件：`worker/lib/iconResponses.ts`、`worker/routes/icon.ts`；测试 `tests/unit/iconResponses.test.ts`（+4）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **530 passed / 82 files**；`npm run build` 成功；`git diff --check` 干净（改写过程中一度引入 CRLF，已按 `.gitattributes` 的 `eol=lf` 修正）。

### S3 — `custom_js` 在生产环境被 CSP 完全阻断（P1，已决策并实施）

**证据**

`worker/lib/assetHeaders.ts:5-17` 的 CSP 是 `script-src 'self'`，没有 `'unsafe-inline'`、nonce 或 hash。

`src/App.svelte:225-235` 的注入方式是创建 `<script>` 元素并写 `textContent`：

```ts
scriptTag = document.createElement('script')
scriptTag.id = 'custom-js-inject'
scriptTag.textContent = jsContent
document.body.appendChild(scriptTag)
```

按 CSP 规范这属于 inline script，`script-src 'self'` 会直接阻断执行并在控制台产生一条 CSP 违规。也就是说**后台「自定义 JS」这个设置项在生产部署上完全不生效**，而且每次页面加载都会刷一条错误。

（`custom_css` 不受影响，`style-src` 带了 `'unsafe-inline'`。）

**需要用户决策**，三个选项：

1. **移除该功能**：删掉设置项、`Settings.custom_js` 字段的写入路径和注入代码。最干净，但是破坏性变更（已保存的值会失效）。
2. **保留但明确标注不生效**：后台该输入框加说明，注入代码去掉（避免刷 CSP 错误），字段保留以兼容旧备份。
3. **让它真正可用**：Worker 改写 HTML 注入 nonce，或 CSP 加 `'unsafe-inline'`。后者会同时打开 `javascript:` URL 和所有内联脚本的执行面，等于放弃 XSS 的主要防线（并直接影响 S5 的结论），**不推荐**。前者需要 Worker 在返回 HTML 时做流式改写并逐次生成 nonce，成本明显高于该功能的价值。

我的建议是选项 2：成本最低、不丢数据、不刷错误，也不削弱 CSP。

**决策经过两轮。第一轮选了「放宽 CSP」，实现后复盘发现代价被低估，第二轮改为不放宽也能达成目标的方案。**

第一轮实现是 `script-src 'self' 'unsafe-inline'`。随后逐条核对隐患时发现三件当时没算清的事：

1. **导入是一条真实的注入链路。** `POST /api/import` 的覆盖模式会写 `settings`，`buildSettingsPatchParams` 遍历 `SETTINGS_KEYS`（其中包含 `custom_js` 和 `footer_html`），而 `validateImportPayload` 对 `settings` **只检查 `isPlainObject`**。也就是说，从论坛或他人处拿到的备份 JSON 可以夹带脚本，导入后立即对所有访客生效。`unsafe-inline` 之前，CSP 会拦住 `footer_html` 那条；之后不会。
2. **`connect-src 'self'` 挡不住外泄。** `img-src` 允许任意 https，图片信标就能把 `localStorage['cf-navs.auth']` 里的管理员 JWT 带走；`form-action` 不回落到 `default-src`，不声明等于不限制。
3. 原注入写在 `App.svelte` 的大响应式块里，该块还引用 `activeTheme` / `homeBackgroundStyle`，**每次切主题都会把用户脚本删掉重跑一遍**。之前 CSP 拦着，这个 bug 一直潜伏。

**最终方案（用户第二轮选择）：改注入方式，CSP 不放宽内联。**

`custom_js` 改用 blob URL 加载而不是 `script.textContent`：

```js
const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }))
script.src = url
```

CSP 相应改为 `script-src 'self' blob:`，**去掉 `'unsafe-inline'`**。

**为什么 `blob:` 不等于 `'unsafe-inline'`**：要拿到一个 blob URL 必须先调用 `URL.createObjectURL`，也就是**已经能执行脚本了**。只能注入 HTML 的攻击者（例如通过 `footer_html`）没有这个能力——blob 的 UUID 不可猜测、只在创建它的文档上下文里有效，而且加载完立刻 revoke。所以放开 `blob:` 对这类攻击者零收益。

直接效果：

| 隐患 | `'unsafe-inline'` | `blob:` |
| --- | --- | --- |
| `footer_html` 里的 `onerror=` | 能执行 | **被拦** |
| `footer_html` 里的 `javascript:` 链接 | 能执行 | **被拦** |
| 任意内联 `<script>` | 能执行 | **被拦** |
| 自定义 JS 本身 | 能执行 | 能执行 |

顺带补了 `form-action 'self'`（一行，堵掉表单外泄通道）。

**为什么没走 nonce**：nonce 是教科书答案，但在这个项目里更差。其一，L4 让 Service Worker 缓存 `index.html`，缓存里的 CSP 头会带着旧 nonce，导致脚本被拦、要刷两次才恢复；其二，`worker/index.ts:71` 的 HTML 响应路径**完全不读 settings**，改用 nonce/hash 就得每次返回 HTML 都读一次 settings，把 L1/L2 刚省下的往返又加回去。

**生命周期修复**：注入逻辑抽到 `src/lib/customScript.ts`，用可注入的 host 接口（node 测试环境没有 `document` 和 `URL.createObjectURL`）。controller 内部用 `lastSource` 做幂等——内容没变就什么都不做；`App.svelte` 里改成一条独立的响应式语句 `$: customScriptController?.apply(...)`，不再跟主题挤在一个块里；`onDestroy` 中 revoke，避免每次重建漏一个 blob URL。

**导入提示**：`createImportOverwriteConfirmation` 现在会检测备份里的 `custom_js` / `footer_html`，在**已有的**覆盖确认弹窗里追加一段：

> 注意：这份备份还包含 自定义 JS（2.0 KB，会在所有访客的浏览器中执行）。只在你信任来源时继续。

不拦截、不丢弃、不加步骤——管理员给自己的站点加脚本是合法需求，真正危险的是「静默」。这个做法比「导入时不写这两个 key」好：后者会让用户恢复自己的备份时丢配置。`ConfirmDialog` 的描述段加了 `white-space: pre-line`，否则警告会和统计文字挤成一团。

**做了三组反向对照**：CSP 退回 `unsafe-inline` → 2 条断言失败；去掉幂等 → 重复执行用例失败；注入改回 `textContent` → 2 条失败。

变更文件：`worker/lib/assetHeaders.ts`、`src/lib/customScript.ts`（新增）、`src/App.svelte`、`src/lib/appConfirmDialog.ts`、`src/components/ConfirmDialog.svelte`；测试 `tests/unit/customScript.test.ts`（新增 10）、`tests/unit/appConfirmDialog.test.ts`（+9）、`tests/unit/assetHeaders.test.ts`（+5）。

**待真机复核**：`blob:` 在 `script-src` 下允许 blob 脚本加载这一点我有把握，但**单元测试跑在 node 环境验证不了真实 CSP 行为**。部署后填一段 `console.log` 验证它确实执行且控制台无 CSP 违规。

### S4 — 「当前页弹层」打开方式被 CSP 阻断（P1，已决策并实施）

**证据**

CSP 未声明 `frame-src`，按规范回落到 `default-src 'self'`，因此**任何跨源 iframe 都被阻断**。

`src/components/BookmarkLinkModal.svelte:32` 正是一个跨源 iframe：

```svelte
<iframe src={url} title={title}></iframe>
```

它由 `open_method === 3`（后台显示为「当前页弹层」，`src/lib/adminFormAdapters.ts:29`）触发。所以选了这个打开方式的书签，在生产环境点开是一个空白弹层加一条 CSP 错误。

**需要用户决策**，两个选项：

1. **放开 iframe**：CSP 增加 `frame-src https:`。只放开 iframe，不影响 `script-src`，风险可控。注意即便如此，大量站点自身带 `X-Frame-Options: DENY` 或自己的 `frame-ancestors`，仍然无法被嵌入——该打开方式本来就只对少数站点有效。
2. **移除该打开方式**：后台去掉「当前页弹层」选项，已有数据回落到「新标签页」。

建议选项 1（一行 CSP 改动 + 一条测试），把「哪些站点能嵌」交给目标站点自己决定。

**用户决策：选项 1，CSP 增加 `frame-src https:`。**

**完成记录**

CSP 增加 `frame-src https:`。只放开 iframe 嵌入，不影响 `script-src`；能不能嵌仍由目标站点自己的 `X-Frame-Options` / `frame-ancestors` 决定，所以这不是"允许嵌入任意站点"，只是不再由我们单方面全部拒绝。

变更文件与测试同 S3。

**待真机复核**：选一个允许被嵌入的站点建书签、打开方式设为「当前页弹层」，确认弹层内正常渲染且控制台无 CSP 违规。

### S5 — 书签 URL 协议白名单（P1）

**证据**

Worker 侧 `worker/routes/bookmarks.ts:70-71`（POST）与 `:114-115`（PUT）对 `url` 只有 `isNonEmptyString` 检查；导入侧 `worker/lib/importValidation.ts:33-34` 同样只检查「是非空字符串」。

前端三条导入路径中只有一条做了过滤：

- 浏览器书签 HTML：`src/lib/importData.ts:223-225` 的 `validBookmarkUrl` 已经限制 `^https?://` 并计入 `skipped`。**这条路径已经安全。**
- SunPanel JSON：`src/lib/importData.ts:30-34` 的 `normalizeUrl` 只做 trim，无协议校验。
- CF-Navs 备份 JSON：原样透传备份文件中的 `url`。

而且前端过滤只是便利性的——`POST /api/import` 是登录后可直接调用的接口，任何客户端都能绕过前端提交任意 `url`。**权威边界必须在 Worker 侧。**

渲染端 `src/components/BookmarkCardInfo.svelte:41`、`BookmarkCardCompact.svelte:38,67` 直接 `href={bookmark.url}`。

**当前是否可被利用：否。** CSP `script-src 'self'` 会阻断 `javascript:` URL 执行；顶层 `data:` 导航被现代浏览器默认拦截。所以这是**纵深防御缺口**，不是当前可利用漏洞。但它也是一个 UX bug（这类书签点了没反应，无 scheme 的 `example.com` 会被当成站内相对路径），并且一旦 S3/S4 的决策放宽了 CSP，它会立刻变成真的存储型 XSS。

**做法**

新增 `worker/lib/urlPolicy.ts`：

- `isAllowedBookmarkUrl(value)`：WHATWG URL 解析后协议必须是 `http:` / `https:`。用于 `POST`/`PUT /api/bookmarks`（配合 R3 的统一校验），不合规直接返回 `code=1002` 并给出可读提示。
- `normalizeImportedBookmarkUrl(value)`：导入专用。合规则原样保留；无 scheme 但补上 `https://` 后能解析成合法 http(s) 地址的（如 `example.com/path`）则补全保留；其余（`javascript:`、`data:`、`vbscript:`、`file:` 等）跳过并计数。

导入路径**不能直接拒绝整批**，也**不能静默丢弃**用户自己备份里的老数据——所以用「能救则救、救不了就计数上报」的策略，跳过数计入 `ImportResp.skipped_bookmarks`，前端导入成功提示中显示。

**验收**

- 新增单测：`https://` / `http://` 通过；`javascript:` / `data:` / `file:` / `vbscript:` / 大小写混写（`JaVaScRiPt:`）/ 内嵌换行制表符绕过（`java\nscript:`）/ 前导空白全部拒绝。
- 新增单测：`POST /api/bookmarks` 与 `PUT /api/bookmarks/:id` 对 `javascript:` 返回 `code=1002`。
- 新增单测：`normalizeImportedBookmarkUrl` 对 `example.com/x` 补全为 `https://example.com/x`，对 `javascript:alert(1)` 返回 `null`。
- 新增单测：导入含 `javascript:` 书签时该条被跳过、其余正常导入、`skipped_bookmarks` 计数正确；被跳过的书签不会让其分类变成空引用错误。

**完成记录**

模块最终落在 `shared/urlPolicy.ts`（不是计划里写的 `worker/lib/`）：实现过程中发现前端也需要它，见下面第二条。

实现中发现并修正的两个问题：

1. **盲目补 `https://` 会篡改数据。** 实测 `https://` + `ftp://a.com` 能解析成合法的 `https://ftp//a.com`（主机名 `ftp`），`file:///etc/passwd` 同理变成 `https://file///etc/passwd`。这比如实丢弃更糟——用户看到的是一条不知从哪来的坏链接。改为只对**没有声明协议**的值补全，并用 `LOOKS_LIKE_HOST_PORT` 把 `localhost:8080`、`192.168.1.10:8123` 这类自建服务写法从「协议」判定中救回来。
2. **原方案会造成用户可感知的回归。** 服务端拒绝裸域名后，用户在后台输入框敲 `example.com` 会撞上一条英文报错，而在改动前这是能保存的（虽然存下来的书签是坏的）。因此把策略提到 `shared/`，在 `toBookmarkPayload` 里先补全再提交；补不了的原样送出，由服务端给出权威错误，前端不会悄悄改成用户没输入过的地址。

变更文件：`shared/urlPolicy.ts`（新增）、`worker/lib/bookmarkPayload.ts`（新增）、`worker/routes/bookmarks.ts`、`worker/lib/importValidation.ts`、`worker/routes/data.ts`、`src/lib/adminFormAdapters.ts`；测试 `tests/unit/urlPolicy.test.ts`（新增 11）、`tests/unit/bookmarkPayload.test.ts`（新增 7）、`tests/unit/importValidation.test.ts`（+4）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **505 passed / 80 files**（基线 483 / 78）；`npm run build` 成功；`git diff --check` 干净。

`bookmarks.ts` 从 289 行降到 234 行，两处 13 行的重复校验条件与两处 11 行的重复字段构造合并为一次 `parseBookmarkUpsertPayload` 调用。

### S6 — 设置项长度上限（P2）

**证据**

`worker/routes/settings.ts:56-174` 对每个字段只校验类型，没有任何长度上限。`custom_css`、`custom_js`、`footer_html`、`site_title`、`card_background_color`，以及 `background.value`（可以是 data URI 大图）都是无界字符串。

`background.value` 会经 `toPublicSettings` 进入 `/api/public/data`（`shared/settings.ts:76`），也就是**每个访客每次拉取聚合数据都会带上它**。一张几 MB 的 data URI 背景会直接违反 `docs/reference/PERFORMANCE_CONTRACT.md` 里「聚合数据保持轻量、约 38 KB」的约定，并且会撑爆 1.5 MB 的本地快照上限。

**做法**

新增 `worker/lib/settingsLimits.ts` 定义各字段上限并在 PUT 校验中统一应用。初始取值：`site_title` 200、`site_title_color` / `card_background_color` / `card_text_color` / `background.maskColor` 64、`image_host_url` 2048、`custom_css` 65536、`custom_js` 65536、`footer_html` 65536、`background.value` 与 `backgrounds.*.value` 各 262144。超限返回 `code=1002` 并在 msg 中给出字段名与上限。

**验收**

- 新增单测：每个受限字段刚好等于上限时通过、上限加一时被拒绝且 msg 含字段名。
- 新增单测：按 Unicode 码位而非 UTF-16 长度计数（避免 emoji 与 CJK 被误判）。
- 同步更新 `docs/reference/API_CONTRACT.md` 的设置接口章节。

**完成记录**

`worker/lib/settingsLimits.ts` 定义上限并导出 `findSettingsLengthError`，`PUT /api/settings` 在所有类型校验通过后统一查一次，错误消息带字段名和上限值。

按码位计数不是吹毛求疵：`'😀'.length === 2`，用 `String.length` 判定会让 100 个 emoji 的标题被当成 200 字符拒掉。有专门用例覆盖。

额外加了一条**字段清单断言**：`Object.keys(SETTINGS_MAX_LENGTHS)` 必须精确等于那 8 个字段。漏掉一个字段就等于这条防线对它不存在，而这种遗漏在普通测试里是看不出来的。

变更文件：`worker/lib/settingsLimits.ts`（新增）、`worker/routes/settings.ts`、`docs/reference/API_CONTRACT.md`；测试 `tests/unit/settingsLimits.test.ts`（新增 7）。

### S7 — 排序与导入数组长度上限（P2）

**证据**

`worker/routes/bookmarks.ts:182-198` 与 `worker/routes/categories.ts:156-173` 的排序接口只校验「数组且每项是正整数」，**没有长度上限**（对比同文件里 `parseBatchIds` 明确限制了 500）。`worker/lib/importValidation.ts:44-52` 对 `categories` / `bookmarks` 数组也没有长度上限。

虽然都是登录后接口，但一次超大 payload 会直接打爆 Worker 的 CPU 与 D1 语句配额，而且用户导入一个超大浏览器书签文件是完全正常的操作路径——现在的表现会是一个没有解释的 500。

**做法**

排序接口上限 5000；导入接口 `categories` 上限 2000、`bookmarks` 上限 20000。超限返回 `code=1002`，msg 明确写出上限值，让用户知道该拆分文件而不是「导入失败」。

**验收**

- 新增单测：等于上限通过、上限加一被拒绝、msg 含上限数字。
- 现有排序与导入测试保持全绿。

**完成记录**

上限统一放在共享 helper 里，避免两个排序路由各写一份：`worker/lib/routeHelpers.ts` 的 `MAX_SORT_IDS = 5000` + `parseSortIds`，`worker/lib/importValidation.ts` 的 `MAX_IMPORT_CATEGORIES = 2000` / `MAX_IMPORT_BOOKMARKS = 20000`。

`parseSortIds` 刻意允许空数组：某个父级下确实可能一个子分类都没有，拒绝空列表会破坏现有语义（这一点有专门用例说明）。

导入超限的 msg 里带上具体数字，让用户知道该拆分文件，而不是只看到「导入失败」。

变更文件：`worker/lib/routeHelpers.ts`、`worker/lib/importValidation.ts`、`worker/routes/bookmarks.ts`、`worker/routes/categories.ts`；测试 `tests/unit/routeHelpers.test.ts`（新增 10，与 R2 共用）、`tests/unit/importValidation.test.ts`（+3）。

### S8 — 安全相关文档与实现对齐（P1）

**证据**

会话机制已改为 JWT；以下是 S8 整改前的文档误差记录（历史引用，当前说明已按实现修正）：

- `docs/reference/API_CONTRACT.md` 当时把 `authRequired` 描述为查 KV session；实际认证路径是 JWT 签名/过期校验，KV 只参与撤销名单检查。
- `docs/reference/PROJECT_OVERVIEW.md` 当时把 Session token 描述为随机生成并写入 KV；实际是 HS256 无状态 JWT，密钥存在 `settings.jwt_secret`。
- `docs/reference/PROJECT_OVERVIEW.md` 当时把认证中间件描述为复用 KV session；实际是单个 isolate 内缓存已验证 JWT，KV 用于限流和撤销名单。

这些历史误差会直接误导后续改动，因此已经在当前文档中更正。

**做法**

把上述三处改写为真实实现，并说明 KV `SESSION` 当前用于登录限流（`rl:login:*`）、点击计数限流（`rl:click:*`）和会话撤销名单（`revoked:*`）。S1 落地后补充撤销机制、15 秒跨 isolate 缓存窗口、KV 写入失败和读取失败行为。

**验收**：文档描述与 `worker/middleware/auth.ts`、`worker/lib/session.ts`、`worker/lib/jwt.ts` 逐条对应；`git diff --check` 无空白问题。

**完成记录**

随 S1 一起完成。改写内容：

- `API_CONTRACT.md` 的鉴权规则章节重写为 JWT 模型，写明 payload 形状、15 秒 isolate 缓存及其带来的跨 isolate 撤销窗口、KV `SESSION` 现在的三种实际用途（登录限流 / 点击限流 / 撤销名单）。
- `API_CONTRACT.md` 的 `/api/data/version` 描述同步 L2 的单条查询契约。
- `PROJECT_OVERVIEW.md` 的安全特性章节改写会话机制，性能章节更正「不必每个请求都读取 KV」的表述，并补上 L1 的启动探测行为。

---

## 三、模块解耦与代码冗余

### R1 — 删除 `src/lib/stores.ts` 的遗留数据获取层（P1）

**证据**

全仓库对 `stores.ts` 的导入只有 5 个符号：

```
publicStore ×4   configStore ×3   authStore ×3   adminStore ×3   isAuthenticated ×1
```

以下导出**没有任何导入方**：`authToken`、`publicCategories`、`publicBookmarks`、`publicSettingsStore`、`adminCategories`、`adminBookmarks`、`adminSettings`（7 个 derived store）。

以下 store 方法**没有任何调用方**：`configStore.refresh`、`publicStore.refresh`、`adminStore.refreshAll`、`adminStore.refreshCategories`、`adminStore.refreshBookmarks`、`adminStore.refreshSettings`、`adminStore.clearError`、`authStore.refreshMe`。它们的职责已经被 `src/lib/dataService.ts` 完全接管。

连带失去调用方的 API 客户端方法：`api.config.get`、`api.auth.me`、`api.categories.list`、`api.bookmarks.list`、`api.settings.get`、`api.bookmarks.fetchFavicon`。其中 `fetchFavicon` 在对应的 UI 按钮被删除后（`123b1cf`）就已经是死代码。

由于 `api` 是一个对象字面量导出，这些方法**无法被 tree-shaking 移除**，会实打实进入 227 KB 的主包。

**做法**

1. 删除上述 7 个 derived store 与 8 个方法，`stores.ts` 收缩为纯状态容器。
2. 删除上述 6 个 API 客户端方法与 `getApiBaseUrl`、`readCachedAdminData`（同样零引用）。
3. **Worker 端对应路由全部保留**：`/api/config`、`/api/me`、`GET /api/categories`、`GET /api/bookmarks`、`GET /api/settings` 是文档化的公开契约，且 `scripts/smoke-test.mjs` 正在使用；`/api/config` 的 edge cache 还被 `/api/public/data` 内部复用。

**验收**

- `npm run type-check` 0 error / 0 warning（若有遗漏引用会立刻暴露）。
- `npm test` 全绿；对 `tests/unit/backgroundRequestSession.test.ts`、`tests/unit/install.test.ts` 中引用 `api.bookmarks.list` / `api.settings.get` 的用例改为使用仍然存在的等价接口。
- 新增契约测试：`src/lib/stores.ts` 不再出现这 7 个 derived store 名称。
- 记录 `npm run build` 前后 `dist/assets/index-*.js` 的字节数变化，写入本文件的完成记录。

**完成记录**

`stores.ts` 386 行 → 219 行，收缩为纯状态容器，并在文件里留了一行注释指向 `dataService.ts`，避免以后又长出第二套取数路径。

删除范围：
- 7 个 derived store：`authToken`、`publicCategories`、`publicBookmarks`、`publicSettingsStore`、`adminCategories`、`adminBookmarks`、`adminSettings`
- 8 个方法：`configStore.refresh`、`publicStore.refresh`、`adminStore.{refreshAll,refreshCategories,refreshBookmarks,refreshSettings,clearError}`、`authStore.refreshMe`
- `AuthState.me` 字段与 `MeResp` 类型（全仓库零读取；`setSession` 相应收成单参数）
- API 客户端：`configApi`、`authApi.me`、`categoriesApi.list`、`bookmarksApi.list`、`settingsApi.get`、`bookmarksApi.fetchFavicon`、`getApiBaseUrl`
- `adminDataCache.readCachedAdminData`

**Worker 路由一条没删**：`/api/config`、`/api/me`、`GET /api/{categories,bookmarks,settings}` 都是文档化契约且 `scripts/smoke-test.mjs` 正在使用。新增的契约测试里有一条**反向断言**，直接检查这 5 个服务端路由仍然注册，防止后人顺着"客户端没用了"把服务端也删掉。

`tests/unit/backgroundRequestSession.test.ts` 里用 `api.bookmarks.list()` 当"用户主动请求"的反例，改用 `api.admin.getData()`（同样是登录态请求，且确实还在用）。

**包体积**：`dist/assets/index-*.js` 224.51 kB → **222.03 kB**（gzip 73.70 → 73.14 kB）。收益不大是意料之中——这些是几十行的薄封装；真正的价值是不再有第二套取数路径可以被误用。

变更文件：`src/lib/stores.ts`、`src/lib/api.ts`、`src/lib/adminDataCache.ts`、`src/App.svelte`；测试 `tests/unit/storesSurface.test.ts`（新增 7）、`tests/unit/backgroundRequestSession.test.ts`（改 1）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **567 passed / 85 files**；`npm run build` 成功；`git diff --check` 干净。

### R2 — 抽取 Worker 路由公共 helper（P1）

**证据**

| 重复项 | 出现文件 |
| --- | --- |
| `function badRequest` | bookmarks / categories / data / favicon / settings（5） |
| `async function readJson` | bookmarks / categories / data / settings（4） |
| `type AppContext = Context<HonoEnv>` | 同上 5 个文件 |
| `function parseId` | bookmarks / categories（2） |
| `function isNonEmptyString` | bookmarks / categories（2） |
| `function isOptionalString` | bookmarks / categories（2） |
| `function parseBatchIds` | bookmarks / categories（2） |

**做法**

新建 `worker/lib/routeHelpers.ts` 统一导出，各路由改为 import。这与 `AGENTS.md` 的「路由编排 vs 纯 helper」拆分原则一致。

**CPU 与挂钟影响**：零。这些都是同步纯函数，构建后是同一份代码，只是不再重复定义。不引入任何额外 await。

**验收**

- `npm run type-check`、`npm test`、`npm run build` 全绿。
- 新增单测直接覆盖 `routeHelpers.ts` 的每个导出（含 `parseBatchIds` 的 500 上限、去重、非正整数拒绝等边界）。
- 各路由文件中不再存在这些函数的本地定义（源码契约断言）。

**完成记录**

新建 `worker/lib/routeHelpers.ts`，导出 `AppContext`、`badRequest`、`readJson`、`parseId`、`isNonEmptyString`、`isOptionalString`、`parseBatchIds`、`parseSortIds` 及两个上限常量。5 个路由文件加 `worker/lib/bookmarkPayload.ts` 全部改为导入。

源码契约测试遍历 5 个路由文件，逐个断言不再存在本地定义——比只测 helper 本身更能防止回潮。

`worker/routes/` 总行数 1836，其中 `bookmarks.ts` 210 行（本轮开始时 289）、`categories.ts` 151 行（原 175）。

变更文件：`worker/lib/routeHelpers.ts`（新增）、`worker/routes/{bookmarks,categories,data,favicon,settings}.ts`、`worker/lib/bookmarkPayload.ts`；测试 `tests/unit/routeHelpers.test.ts`（新增 10）。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **560 passed / 84 files**；`npm run build` 成功；`git diff --check` 干净。

### R3 — 书签 POST/PUT 校验去重（P0）

**证据**

`worker/routes/bookmarks.ts:66-78` 与 `:110-122` 是**逐字符相同**的 13 行校验条件，`:83-93` 与 `:127-137` 是几乎相同的字段构造。两处必须永远保持同步，任何一次单边修改都会造成新增与编辑行为不一致——这是正确性风险，不只是美观问题。

**做法**

抽取 `parseBookmarkUpsertPayload(body)`，返回 `{ ok: true, value } | { ok: false, message }`，同时承担 S5 的 URL 协议校验。两个路由共用。

**验收**

- 新增单测覆盖每个校验分支（category_id、title、url、icon、icon_source、open_method、description_mode 的合法与非法取值）。
- 新增单测断言 POST 与 PUT 对同一份非法 payload 返回完全相同的错误码与 msg。
- 现有书签路由测试全绿。

### R4 — 前端 `clamp` / `isRecord` 去重（P2）

**证据**：`function clamp` 出现在 `adminListState.ts`、`color.ts`、`homeData.ts`、`pagination.ts`、`settingsForm.ts`（5 处）；`function isRecord` 出现在 `adminDataCache.ts`、`importData.ts`、`publicDataCache.ts`（3 处）。

**做法**：新建 `src/lib/guards.ts` 导出 `clamp` 与 `isRecord`，各处改为 import。先逐一比对 5 个 `clamp` 的实现是否完全等价（边界与 NaN 处理），不等价的保留原地实现并加注释说明差异。

**验收**：单测覆盖 `clamp` 的 NaN、min>max、边界值；`npm test` 全绿；各模块行为无变化（现有测试即为回归护栏）。

**完成记录 —— 本条审计有一半是误判，先更正**

逐一比对后发现，**`clamp` 根本不是重复代码**。我最初的 `grep 'function clamp'` 匹配的是前缀，实际是 5 个名字不同、领域不同、NaN 兜底也不同的函数：

| 函数 | 范围 | NaN 兜底 |
| --- | --- | --- |
| `clampAlpha` | 0–1 | 1 |
| `clampByte` | 0–255（含四舍五入） | 0 |
| `clampTitleFontSize` | 16–72 | 32 |
| `clampPage` | 1–totalPages（含 trunc） | 1 |
| `clampNumber` | 泛型 min–max | min |

（`clampAdminListPage` 只是 `clampPage` 的一层转发，本身就是复用。）

每个兜底值都绑着自己的领域含义，合并成一个通用 `clamp` 会把这些语义抹平——**这一项不做才是对的**。

真正逐字重复的只有 `isRecord`（3 处完全相同）。已抽到 `src/lib/guards.ts`，并在文件顶部写明「不要把 clamp 这类带领域语义的函数搬进来」，避免下一个人重复我这个误判。顺带删掉 `importData.ts` 里因此失去引用的 `UnknownRecord` 类型别名。

变更文件：`src/lib/guards.ts`（新增）、`src/lib/adminDataCache.ts`、`src/lib/publicDataCache.ts`、`src/lib/importData.ts`。

### R5 — 清理未使用导入与死导出（P2）

**证据**

- `worker/routes/auth.ts:10` 导入了 `getSessionKey`，函数体内零使用。
- `worker/middleware/auth.ts:7,25-27` 的 `SESSION_PREFIX` / `getSessionKey` 在改用 JWT 后已无生产调用方，仅测试引用。
- `src/lib/api.ts` 的 `getApiBaseUrl`、`src/lib/adminDataCache.ts` 的 `readCachedAdminData` 零引用（并入 R1 一起删）。

**做法**：删除未使用导入；`getSessionKey` 连同其测试一起删除（它描述的 KV session 机制已不存在）。评估在 `tsconfig.json` 打开 `noUnusedLocals` / `noUnusedParameters` 防止回潮——**先跑一次看现存错误数量再决定**，如果超过 20 处则本轮不开，单独记录。

**验收**：`npm run type-check` 0 error / 0 warning；`npm test` 全绿；本文件记录 `noUnusedLocals` 的评估结果与结论。

**完成记录**

`noUnusedLocals` / `noUnusedParameters` 的评估结果：**全仓库只有 6 处**，远低于计划里设的 20 处阈值，因此已在 `tsconfig.json` 开启。

修掉的 6 处（加上开启后 `svelte-check` 又抓出的 1 处）：

- `worker/routes/favicon.ts`：`ErrCode`、`fail`（R2 把 `badRequest` 抽走后留下的）
- `worker/routes/public.ts`：`Settings` 类型导入
- `worker/lib/db/settings.ts`：`SETTINGS_KEYS`（历史遗留）
- `src/App.svelte`：`AdminData` 类型导入（R1 之后失去引用）
- `src/lib/appAuthController.ts` 的 `currentView`、`src/lib/icons.ts` 的 `size`：这两个是**刻意保留在签名里**的形参，改成 `_` 前缀并加注释说明——特别是 `googleIcon` 的 `size`，它其实是历史遗留（早期用 Google s2，现在实际返回 favicon.im 地址），注释里写清楚了，免得后人以为它还有作用。

S1 里已经顺手删掉的 `SESSION_PREFIX` / `getSessionKey`（改用 JWT 后失去意义）也属于本条范围。

`api.ts` 的 `getApiBaseUrl` 和 `adminDataCache.ts` 的 `readCachedAdminData` 在 R1 中一并删除。

变更文件：`tsconfig.json`、`worker/routes/{favicon,public}.ts`、`worker/lib/db/settings.ts`、`src/App.svelte`、`src/lib/appAuthController.ts`、`src/lib/icons.ts`。

验证：`npm run type-check` 0 error / 0 warning；`npm test` **567 passed / 85 files**；`npm run build` 成功（主包 221.97 kB）；`git diff --check` 干净。

---

## 四、UI 一致性

### 现状实测

**同名类、不同实现**。`.primary-button` / `.ghost-button` 在 5 个组件里各写一遍：

| 组件 | 圆角 | 内边距 | 字号 |
| --- | --- | --- | --- |
| `BookmarkModalActions.svelte` | 10px | 7px 12px | 13px |
| `CategoryEditModal.svelte` | 12px | 10px 16px | 14px |
| `LoginModal.svelte` | 12px | 10px 16px | 14px |
| `ConfirmDialog.svelte` | 12px | 8px 14px | 14px |
| `PasswordChangePanel.svelte` | 10px | 10px 16px | 14px |

**输入框**同样分散：圆角 9px（BookmarkEditModal）/ 10px（PasswordChangePanel）/ 12px（Category、Login）/ 14px（ConfirmDialog），内边距 `9px 11px` / `10px 12px`，字号 13 / 14px（移动端被 `app.css` 的 `@media (pointer: coarse)` 统一提到 16px）。

**弹窗卡片圆角**：18px（Category / Login / BookmarkEdit）对 22px（ConfirmDialog）。

**全局取值分布**：`font-size` 48 种取值（11/12/13/14px 共 143 处，同时混用 `0.78rem`、`0.86rem`、`0.9rem` 等 rem 值）；`border-radius` 30 种取值；`transition` 61 处声明、25 种写法（`0.18s ease` ×9、`0.15s`、`0.16s`、`150ms`、`180ms`、`0.2s` 并存，还有 2 处 `all 0.2s ease`）。

**已有的 token 只覆盖表面色**：`--admin-*`（44 个）、`--confirm-*`、`--home-*`。排版、圆角、间距、动效**没有任何 token**。

### U1 — 建立基础设计 token（P1）

在 `src/app.css` 的 `:root` 增加一组基础 token，不改变任何现有取值，只是给出命名：

```
--font-size-xs: 11px;  --font-size-sm: 12px;  --font-size-md: 13px;
--font-size-base: 14px; --font-size-lg: 16px;
--radius-sm: 8px; --radius-md: 10px; --radius-lg: 12px;
--radius-xl: 18px; --radius-pill: 999px;
--transition-fast: 0.15s ease; --transition-base: 0.18s ease;
--control-padding-sm: 7px 12px; --control-padding-md: 10px 16px;
```

**验收**：新增契约测试断言 `:root` 中存在这批 token；`npm run build` 通过；此步骤本身不产生任何视觉变化（token 定义了但还没被引用）。

**完成记录**

`src/app.css` 的 `:root` 增加 16 个 token（比计划多一个 `--control-padding-input-sm`，理由见 U3）。取值全部取自现有代码中出现频次最高的那一档，所以引入 token 本身零视觉变化。

### U2 — 收敛按钮样式（P1）

新建 `src/components/controls.css`（沿用仓库已有的 `adminListPanels.css` / `settingsSections.css` 共享样式表模式），提供 `.ui-button` 与 `--primary` / `--ghost` / `--danger` 修饰类，取值全部引用 U1 的 token。逐个替换上表 5 个组件的本地定义。

统一取值：圆角 `--radius-lg`（12px），内边距 `--control-padding-md`，字号 `--font-size-base`（14px）。`BookmarkModalActions` 目前是最小的一套（10px / 7px12px / 13px），统一后会变大一点，需要复核弹窗底部操作栏在窄屏下不换行。

**验收**

- 契约测试：5 个组件的 `<style>` 中不再出现本地 `.primary-button` / `.ghost-button` 的 `border-radius` / `padding` / `font-size` 声明。
- 契约测试：`controls.css` 中按钮的三项取值各只有一个来源。
- 真实浏览器复核：桌面与 `390x844` 下，登录弹窗、分类弹窗、书签弹窗、确认弹窗、修改密码面板的按钮尺寸一致，且书签弹窗底部操作栏不换行、不溢出。

### U3 — 收敛输入框与弹窗样式（P1）

`.ui-input` 统一为圆角 `--radius-lg`、内边距 `10px 12px`、字号 `--font-size-base`。弹窗卡片圆角统一为 `--radius-xl`（18px），ConfirmDialog 从 22px 收敛过来。

**必须保留** `src/app.css:51-57` 的 `@media (pointer: coarse)` 16px 规则（上一轮修复的 iOS Safari 聚焦自动放大问题），并保证新的 `.ui-input` 不会因为选择器优先级把它盖掉。

**验收**

- 契约测试：`tests/unit/mobileInputZoom.test.ts` 现有 3 个用例保持通过。
- 新增契约测试：控件字号声明不带 `!important`，确保 `pointer: coarse` 规则仍能生效。
- 真实浏览器复核：iOS Safari 上点击书签弹窗标题框与首页搜索框，页面不放大。

**完成记录**

输入框圆角从 9 / 10 / 12 / 14px **四种**统一到 `--radius-lg`（12px），字号从 13 / 14px 统一到 `--font-size-base`。

**内边距刻意保留两档**，这是与计划的第二处偏差：书签弹窗一屏要放 7 个字段，密度确实需要比登录框紧。强行统一成 `10px 12px` 会让表单高度增加约 56px。所以加了 `--control-padding-input-sm`（7px 10px）——仍然是 token、仍然是单一来源，只是承认密集表单和登录框的合理差异。同一种控件出现 4 种圆角才是需要修的问题，间距差异不是。

弹窗卡片圆角：ConfirmDialog 的 22px 收敛到 `--radius-xl`（18px），与分类/登录/书签弹窗一致。

`tests/unit/mobileInputZoom.test.ts` 的 3 个用例全部保持通过，另加一条断言：6 个弹窗组件的 `font-size` 都不带 `!important`，保证 `@media (pointer: coarse)` 的 16px 规则仍能赢。### U4 — 收敛过渡动画（P2）

把 61 处 transition 归并到 `--transition-fast`（0.15s）与 `--transition-base`（0.18s）两档；2 处 `all 0.2s ease` 改为显式列出属性（`all` 会对包括布局属性在内的一切变化启动动画，既有性能成本也容易产生意外动效）。

**验收**：契约测试统计 `transition:` 声明中硬编码时长的数量降到 0（`none` 除外）；`prefers-reduced-motion` 下的现有行为不变。

**完成记录**

61 处声明、25 种写法全部归并到两档：`0.15s / 150ms / 0.16s / 160ms` → `--transition-fast`，`0.18s / 180ms / 0.2s / 0.24s / 0.3s` → `--transition-base`。共改动 32 个文件。

4 处 `transition: all` 改为显式属性列表（`border-color, background, color, box-shadow, transform`）。`all` 会把 `width` / `height` / `padding` 这类布局属性一起卷进动画，既有性能成本也容易在无关改动后产生意外动效。

契约测试遍历 `src/` 下所有 `.svelte` 和 `.css`，断言：`transition:` 声明中不再出现任何数字时长（`none` 除外），且不存在 `transition: all`。**这条测试跑遍全仓库，不只是本次改到的文件**，所以新增组件写死时长也会被挡下。

写测试时抓到两处我自己漏掉的：`ConfirmDialog` 里一处跨多行的 `transform 0.12s ease`，以及同文件按钮的 `font-size: 14px`。

---

## 五、文件结构

### 结论：整体健康，F1 历史问题已完成

当前 tracked 文件仍按 `src/` / `worker/` / `shared/` / `public/` / `scripts/` / `tests/` / `docs/` 分层；`.gitignore` 覆盖 `dist/`、`.wrangler/`、`.dev.vars`、`wrangler.local.toml`、`verify.local.json`、`.claude/`、`.codex/`、`.agents/`、`AGENTS.md`、`_archive/*`、`tmp/`、`docs/history|local|drafts/`。含安装令牌示例和过期配置的部署截图已移除；`docs/screenshots/` 当前保留的图片均应由公开文档引用。

### F1 — 归档已完成的移动端布局计划（P2）

`docs/plans/ADMIN_MOBILE_LAYOUT_PLAN.md` 描述的工作已经在 `23566ed`、`c347d2d` 完成，但文档第 6.1 节仍停留在「未完成 / 待验收」状态，会误导后续读者以为还有待办。

**做法**：在文首加一行完成状态与对应提交号；或移入已忽略的 `docs/history/`。建议前者——保留决策记录对后续维护有价值。

注意：上述“工作区有未提交的本地修改”是当时实施阶段的历史记录，不代表当前工作树状态。

**验收**：`docs/plans/` 下每个文件的状态与实际代码一致；`docs/README.md` 的目录说明无需改动。

**完成记录**

在 `ADMIN_MOBILE_LAYOUT_PLAN.md` 文首加了状态块，注明实现对应的两个提交，并说明第 6.1 节记录的是**实施前的现状勘察**而不是遗留待办——这是最容易被误读的一段。文件保留在 `docs/plans/`，决策记录对后续维护有价值。

上述工作区里的未提交本地修改属于历史上下文，没有纳入优化提交；当前状态以现场 Git 检查为准。

### 不做的事

- 不把 `tests/unit/` 的 78 个平铺文件重组成子目录。当前扁平结构配合清晰的文件命名已经可导航，重组会打断 `git blame` 且没有实质收益。
- 不动 `worker/lib/db.ts` 的 re-export 门面结构，它与 `worker/lib/db/` 子目录的分层是刻意设计。

---

## 六、执行顺序

按「先能验证、后改行为」和「低耦合优先」排：

1. **R3**（书签校验去重）→ 为 S5 铺路，且本身是正确性修复。
2. **S5**（URL 协议白名单）→ 直接接在 R3 的统一校验里。
3. **L2**（`/api/data/version` 合并查询）→ 独立、纯收益、易验证。
4. **L1**（跳过 install 探测）→ 前端启动路径，需要单独一轮验证。
5. **S1**（logout 真正失效 token）→ 安全核心，改动面独立。
6. **S2**（图标缓存键归一化）→ 独立。
7. **R2**（Worker helper 抽取）→ 在所有 Worker 路由改动完成后做，避免反复冲突。
8. **R1**（删除 stores 死层）→ 前端，独立。
9. **S6 / S7**（长度上限）→ 纯校验增量。
10. **U1 → U2 → U3 → U4**（UI 收敛）→ 必须连续做完，中途停下会留下两套并存的样式。
11. **R4 / R5 / F1 / S8**（收尾清理与文档）。
12. **S3 / S4**（CSP 相关）→ 等用户决策后插入执行。

每一项完成后立即：运行 `npm run type-check`、`npm test`、`npm run build`、`git diff --check`，回本文件把状态改为「已完成」并补上实测数据（如包体积变化、请求数变化），然后再开始下一项。

## 七、用户决策记录

| 项 | 选择 |
| --- | --- |
| L4 Service Worker 导航策略 | 改成缓存优先 + 后台更新（附带新版本提示） |
| S3 `custom_js` | 第一轮：放宽 CSP。复盘后第二轮改为：blob URL 注入 + `script-src 'self' blob:`，**不放宽内联** |
| S4 「当前页弹层」 | CSP 增加 `frame-src https:` |

S3 走了两轮。第一轮实现 `'unsafe-inline'` 后逐条核对隐患，发现导入链路和外泄通道的代价被低估；第二轮换成改注入方式而不是改 CSP，功能同样可用而附带风险基本归零。完整经过见 S3 的完成记录。

## 八、剩余的真机验收清单

单元测试只能锁住纯函数、源码契约和路由行为。以下几条必须在部署后用真实浏览器确认：

- **L1**：二次访问首页时网络面板不出现 `/api/install/status`；清掉 localStorage 后首次访问仍出现一次。
- **L3**：首次访问结束后 Cache Storage `cf-navs-v15` 中存在 `index-*.js` 与 `index-*.css`；第二次访问这两个请求来源标记为 ServiceWorker。
- **L4**：二访首屏不等网络即可绘制；部署新版本后第一次打开出现「已检测到新版本」提示；离线时仍能打开。
- **S1**：跑一次 `scripts/smoke-test.mjs`，确认第 347 行「登出后 token 失效 → 401」现在通过（这条断言自 `a296e74` 起一直是失败的）。
- **S3**：后台填一段自定义 JS（例如 `console.log('ok')`），确认它真的执行且控制台无 CSP 违规——`blob:` 在 `script-src` 下的行为单测环境验证不了。再切换一次主题，确认脚本**不会**重复执行。
- **S3 导入提示**：导出一份含自定义 JS 的备份再导入，确认覆盖确认弹窗里出现「这份备份还包含 自定义 JS（… KB…）」且换行正常。
- **S4**：给一个允许被嵌入的站点建书签、打开方式设为「当前页弹层」，确认弹层内正常渲染。
- **U1–U4**：桌面与 `390x844` 下逐个打开登录 / 分类 / 书签 / 确认 / 修改密码五个弹窗，确认按钮与输入框尺寸一致、书签弹窗底部操作栏不换行不溢出；iOS Safari 上点击书签弹窗标题框与首页搜索框，页面不放大。
