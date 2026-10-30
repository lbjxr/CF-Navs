# 变更记录

> **版本规则**：本文按版本分节。`[Unreleased]` 是已在 `develop` 上交付但尚未打版本 tag 的内容。
> 发版时把 `[Unreleased]` 标题改成 `## v<x.y.z> — <YYYY-MM-DD>`，在其上留一个新的空 `[Unreleased]`，并同步 `package.json` 的 `version`。
> tag 打在 `develop` 上，部署来源也是 `develop`；`main` 只在维护者主动要求时作为归档快照合入，不代表线上代码。
> 完整发版流程见 [CONTRIBUTING.md](CONTRIBUTING.md) 第 6 节。版本制之前的记录按日期分节保留，不追认版本号。

## [Unreleased]

### 修复

- **测试并发导致的偶发超时**：Vitest 默认 worker 数限制在 2～4，避免多核机器的模块冷加载与 jsdom 事件处理争用执行资源，使 `appServices` 和图像生命周期队列用例越过原有 5 秒期限；保留全部用例、原超时和 node/jsdom 隔离方式。工程规则补充可同时覆盖两个子项目的 `VITEST_MAX_WORKERS`，不再把仅改变顶层值的命令行参数当作有效降并发证据。

### 变更

- **可选 GitHub Actions 部署（Issue #23）**：新增 `.github/workflows/deploy.yml`，在 Workers Builds / Git 导入不可用时可由推送触发 `npm ci`、构建、`setup:wrangler` 资源解析和 `wrangler deploy`。默认不启用，必须显式设置仓库变量 `CF_NAVS_DEPLOY_PROVIDER=github-actions`；默认部署仍是 Cloudflare 账号关联的 Git 构建。工作流只用 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 访问目标账号，真实 D1/KV ID 只写入 runner 临时配置；启用前需断开 Cloudflare Git 集成以免重复部署。
- **修正使用指南标题**：移除左上角仅写“CF”的绿色标识，弹窗标题完整显示“CF-Navs 使用指南”，英文切换后显示“CF-Navs User Guide”，切换步骤时保持产品名称；窄屏头部允许换行，避免标题与语言按钮相互挤压。
- **修复指南快捷键暗色对比度**：提示栏的方向键与 Esc 键帽改用主题表面色和边框色，避免暗色模式下浅色符号叠在固定白底上。
- **首页使用指南与右上角菜单**：六步中英指南首次访问时浮在真实首页上，首页入口可随时重开，独立 `/guide/` 也默认显示指南；弹窗及示例插图跟随当前明暗主题、强调色和书签卡片风格，并保持深色模式下的插图对比度。书签示例改为 NodeLoc 论坛，不再渲染模拟首页。首页右上角操作组改为桌面与移动端统一的显隐菜单；窄屏搜索入口隐藏时菜单横向展开，避免遮挡首页标题。
- **修复指南导航缓存串页**：Service Worker 按各自 URL 缓存非首页导航，`/guide/` 不再覆盖离线首页缓存；离线时仍优先回退到最近的指南页或 app shell。

## v0.9.0 — 2026-10-19

### 文档与工具

- **README 自动翻译工作流**：新增基于 Index-Translate 的英文 README 翻译流程，支持预览、完整翻译和自动创建翻译 PR；生成器会按输出目录修正相对链接，并将英文版本的语言切换指回中文 README。

### 变更

- **图标本地优先缓存 v2（取代可信设备）**：所有对象图标（书签 / 分类，公开 / 私密）成功取到真实图片后保存到一个 IndexedDB 库（`cf-navs-icons-v2`），匿名访客同样保存，无需任何开关。每个对象一条，版本取图标代理 URL（去掉 `key`）；同版本直接本地显示、零网络请求，版本变化只重下这一张。新增全局图标标志位 `icon_epoch`（schema 第 4 步，D1 触发器在对象增删、图标 / 可见性 / 所属分类 / 标题链接变化时递增），随 `/api/data/version` 与两类聚合返回；标志位变化时客户端对照当前数据清理已不存在的对象条目。取消 10 MiB / 1000 条 / LRU 总预算，只受浏览器配额约束；保留三个兜底：单图 > 512 KiB 只显示不落盘、首次写入申请 `navigator.storage.persist()`、配额满或 IndexedDB 不可用退回内存且不报错。登出与会话失效只删私密条目。移除可信设备开关与「设备缓存」设置页、`/api/icon-local-copy`、`auth_receipt`、设备状态机与旧副本存储（约 2000 行），启动时删除旧库 `cf-navs-object-icons-v1`；随之删除依赖可信设备的浏览器回归脚本（`issue-browser-regression`、`icon-ui-regression`、`category-icon-{perf,prod}-regression`、`icon-display-prod-regression`、`test:icon-storage`）。服务端 edge 可见性闸门与 edge cache 不变。新增 `iconLocalStore` / `localIconView` / `iconEpoch` / `bookmarkCardLocalFirst` 测试。

### 修复

- **首页书签删除确认弹窗**：确认层级提高到编辑窗口之上，避免右键编辑书签后点击删除时，二次确认被编辑窗口遮挡。
- **脚本去重：本地 wrangler 调用与页面内登录收敛到 `scripts/lib`**（代码审查三轮第 35 项）：新增 `scripts/lib/wranglerLocal.mjs`（仓库根目录、wrangler 入口、`wrangler.local.toml` / `wrangler.toml` 选择、`runWranglerSync`），替换 `smoke-local`、`ordinary-icon-concurrency-experiment`、`ordinary-icon-scale-fixtures` 中三份逐字相同的实现（`smoke-local` 仍以原来的 `fail()` 报错退出）；新增 `scripts/lib/browserLogin.mjs` 的自包含 `loginInPage`，替换 `chrome-regression`、`perf-audit` 与两个图标实验脚本中四份页面内登录（各自对外的返回 / 抛错约定不变）。UI 驱动的登录（`issue-browser-regression`）与纯 API 登录（`ordinary-icon-scale-fixtures`）语义不同，保留原样。新增 `tests/unit/scriptsSharedLib.test.ts`（5 项，含不再保留旧副本的源码护栏）；`smoke` 123/123；`regression:chrome` 对本地生产构建 24/25，唯一失败为沙箱代理拦截外部 favicon 请求，与改动前一致。
- **实测最大规模导入的 D1 单语句限制**（代码审查三轮第 34 项）：审查曾担心导入 2 万条时单个 batch 约 2860 条语句可能超 D1 上限。按 Cloudflare D1 文档，batch 内的限制逐条生效（每条最多 100 个绑定参数、SQL 文本最多 100 KB），整个 batch 受 30 秒时长约束。新增 `tests/unit/importScaleLimits.test.ts`：在真实 SQLite 上导入校验允许的最大规模（2000 分类 + 20000 书签，一个 batch 共 3000 余条语句），逐条断言绑定参数 ≤ 100、SQL ≤ 100 KB，并核对落库行数；把分类或书签的分块各加大一行（超过 100 个参数）的变异均被捕获。另在本地 `wrangler dev`（workerd + D1 本地实现）通过 `/api/import` 实测同等规模：请求体 3.4 MB，1.4 秒完成，导入后 2000 / 20000 行齐全。线上 30 秒时长需部署后验证，暂不改分块策略。
- **归档过时的计划文档**（代码审查三轮第 33 项）：`docs/plans/` 中 16 份已交付、已被取代或只代表某次采集时刻的文档移入 `docs/plans/_archive/`（Spotlight、管理员找回两组需求文档仍写着「尚未实现」，实际已上线；其余为已完成轮次的实施记录与 2026-09 的 Issue / PR 快照），新增归档说明 `docs/plans/_archive/README.md` 并在 `docs/README.md` 的目录表登记。仓库内所有指向这些文件的路径（含本文件历史条目与 `src/lib/pageScrollLock.ts` 注释）同步改为新路径，归档文档内部的相对链接也已修正；全仓 Markdown 相对链接复核 0 处失效。仍在使用的需求基线（REQ-15 图标本地优先、图标请求性能、Issue #31、PH / RD 决策记录、前端体验评估）保留原位。
- **CI 增加首屏包体积门禁**（代码审查三轮第 32 项）：新增 `scripts/check-bundle-size.mjs`（`npm run check:bundle`）与 `bundle-budget.json`，读取 `dist/index.html` 引用的入口脚本、modulepreload 与样式表，按原始字节和 gzip 字节对比预算，超出即以非零退出；CI 在 Build 之后执行。预算以当前构建为基线留约 2% 余量（JS 283000 / gzip 97500，CSS 84000 / gzip 14500 字节；基线 JS 277281 / 95258，CSS 82136 / 13924）。有意增大首屏时须在同一提交调高预算并写明原因。新增 `tests/unit/bundleBudget.test.ts`（4 项）；人为把预算调到基线以下时脚本按预期失败。
- **写后不再无条件整包重拉后台数据**（代码审查三轮第 31 项）：原先每次增删改、排序成功后都 `refreshLoggedInData(true)` 强制重拉 `/api/admin/data`。现在请求层把写响应包络上的 `data_version` 广播出去（`subscribeMutationDataVersion`，在 `initAppServices` 里接到 `dataService.recordMutationDataVersion`），单条分类 / 书签的新建、编辑、删除与两类排序在用服务端返回值应用到本地后改调 `confirmLoggedInDataAfterLocalMutation`：只请求一次 `/api/data/version`，服务端版本恰为本会话最后一次写入回报的版本且数据集未变时，只更新版本号并落快照；版本不符（其它标签页 / 设备写过）、没有版本信息、或有一次强制整包重拉尚未完成时，退回原来的整包重拉。批量删除 / 移动、整理、导入等没有本地应用的写入仍整包重拉；登录会话切换时清空记录的版本。测试：`dataService.test.ts` 新增 7 项（各分支与失败传播；去掉「未完成整包重拉」「数据集」「会话切换清空」「更新版本号」任一判断的变异均被捕获），新增 `tests/unit/postWriteRefresh.test.ts`（3 项：请求层只在成功且带版本的包络上广播；每类写入走哪条刷新路径），`appServices.test.ts` 增 1 项；控制器差分对照测试中两种刷新映射到同一步，路径由新用例单独钉住。`smoke` 新增 11 项（112 → 123）：新建 / 更新 / 排序 / 删除书签与新建 / 删除分类后，响应 `data_version` 等于随后 `/api/data/version`，写接口返回的行与 `/api/admin/data` 中同一行逐字段一致，排序后 `sort` 等于提交下标——这是本地应用可替代重拉的前提。首屏 `index` 276.43 → 277.28 kB（gzip 94.93 → 95.34 kB）。
- **状态层边界：会话存储独立、模块接线集中到启动入口**（代码审查三轮第 30 项）：① 新增 `src/lib/authSession.ts`，把登录会话的 localStorage 持久化、进程内缓存与跨标签页 `storage` 监听从 `api.ts` 移出，`api.ts` 只负责请求（401 时经 `clearStoredAuthSession` 清会话）；② `stores.ts` 不再直接引用 `iconDeviceState` / `iconAccessKey`，`authStore` 改为通过 `configureLifecycle({ onLogoutStart, onSessionCleared })` 钩子通知外部，未接线时为空操作；③ `dataService.ts` 去掉模块加载时的 `objectIconLoader.configure(...)` 副作用；④ 新增 `src/lib/appServices.ts` 的 `initAppServices()`（幂等），由 `main.ts` 在挂载 App 前显式调用，统一接上「登出开始 → 设备副本退出」「会话消失 → 清图标访问 key」「图标描述符 → dataService」三条线，时序与原先一致（登出先于撤销请求通知设备，会话清除后清 key）。测试：新增 `tests/unit/appServices.test.ts`（8 项，含接线前无副作用、登出调用顺序、401 / 其它标签页退出清 key、描述符转发、幂等与源码边界护栏；去掉任一条钩子调用或转发的变异均被捕获），4 个测试文件只改了 mock / 导入路径（`api` → `authSession`）。首屏 `index` 276.18 → 276.43 kB（gzip 94.65 → 94.93 kB），为新增接线模块的固定开销。
- **本地数据快照加 `snapshot_schema_version`**（代码审查三轮第 29 项）：公开 / 后台数据快照（localStorage 与 Cache Storage）原先只校验 `categories` / `bookmarks` 是否为数组，结构变化后旧快照可能被当成新结构读入。`snapshotStorage` 在写入时统一给信封加 `snapshot_schema_version: 1`（不改调用方对象），读取时版本不一致（含更高版本、非数字）一律视为未命中、回落到网络数据；没有该字段的旧快照按第 1 版读取，升级后离线快照不丢。以后快照结构不兼容时只需把 `SNAPSHOT_SCHEMA_VERSION` 加一。新增 `tests/unit/snapshotSchemaVersion.test.ts`（5 项，去掉读侧校验或写侧盖章的变异均被捕获）。
- **删除两个未被引用的前端模块**（代码审查三轮第 28 项）：`src/lib/batchSelection.ts`（跨页选择工具，后台列表已改用 `adminListState`）与 `src/lib/bookmarkFaviconController.ts`（旧 favicon 控制器）在 `src/` 中零引用，只剩各自的单测引用，连同测试一起删除。`knip --production` 复核：`src/` 不再有未被引用的文件；审查中提到的「未引用 SQL 常量」复核后均有调用方，`tslib` 只是传递依赖、`package.json` 未直接声明，两者无需处理。
- **runes 迁移第 8j 步：6 个顶层组件，第 8 步完成**（代码审查三轮第 27 项）：迁移前先补行为基线 `tests/unit/topLevelComponentsBehavior.test.ts`（jsdom，19 项，legacy 上写成并通过）。随后 CategorySection、settings/AdvancedSettingsSection、settings/SettingsHomePreview、views/Admin、SettingsPanel、views/Home 改为 runes，**`src/` 下全部 `.svelte` 组件均为 runes、零 `export let`**。**bindable**：AdvancedSettingsSection `form`（SettingsPanel `bind:form`）、SettingsHomePreview `theme = $bindable('light')`（SettingsPanel `bind:theme`）；CategorySection / Admin / Home / SettingsPanel 无 bindable。**状态**：SettingsPanel `form` → 深层 `$state`（七个设置分区与 AdvancedSettingsSection 经 `bind:form` 后以 `bind:value={form.x}` / `bind:group` 就地写字段，需要深层响应；ThemeBackgroundCard 沿用同一代理，即 8i 预留的路径），`initialForm` 只整体替换 → `$state.raw`；「`value` / `loading` 键变化整体重置」→ 只以键为依赖的 `$effect.pre`（其余引用受键比较守卫，同 8i 两个编辑框）；13 条其余 `$:` → `$derived`。Home 40 条 `$:` → 37 个 `$derived` + 3 个 `$effect.pre`：`activeId = resolveHomeActiveSectionId(navigationSections, activeId)` 这条自引用语句改为**只在解析结果不同时写回**（`untrack`；legacy 每次刷新跑一次，runes 同值重写会自触发）；`focusCategoryId` 聚焦只以 `focusCategoryId` / `sortedCategories` 为依赖（`lastFocusedCategoryId` 仍为普通比较变量）；搜索防抖调度只以 `searchQuery` 为依赖。整体替换的 `selectedCategoryIds`（Map）与 `homeSortDraft` → `$state.raw`。Admin：`<script context="module">` → `<script module>`（只放类型导出），两个懒加载组件构造函数 → `$state.raw`，`<svelte:component this={CategoryEditModalComponent}>` → 动态组件，懒加载触发的两条 `$:` → `$effect.pre`（加载调用 `untrack`），`importSource` → `$state`（`bind:importSource` 给 AdminTabContent）。`on:` 全部改事件属性，`|preventDefault` 移进处理器。**测试**：行为基线与 adminSettingsBehavior / adminSectionsBehavior / uiLeafComponentsBehavior 等既有用例零改动通过。`tests/helpers/uiLeaf/SectionFormHarness.svelte` 随真实父组件改为 runes（`form` 为 `$state`、动态组件替代 `<svelte:component>`）：`onForm` 仍按 legacy `$: onForm(form)` 的对象粒度触发（整体替换或任一字段写入都回调当前 form），并在每次变化后把 `$state.snapshot` 写回调用方传入的原对象，使「断言传入对象被就地写入」的既有用例照常成立；新增 `tests/helpers/reactiveState.svelte.ts`（以 `$state` 包装普通对象），`searchEngineSettingsSelect` 直接挂载 SearchEngine 分区时传入深层代理以模拟真实父组件（断言不变）；`categoryCollapseMarkup` / `homeCategoryScopeActions` 中对 CategorySection / Home 源码的 `export let` / `$:` 字符串断言改为对应 runes 写法；`tests/unit/componentsRunes.test.ts` 扩展为 54 项（含「`src/` 下所有 `.svelte` 以 `<svelte:options runes />` 开头、无 `export let`」的全局护栏）；`eslint.config.js` 为 `.svelte.ts` runes 模块补上 typescript-eslint 解析器。已知差异：① 8h 起的 `binding_property_non_reactive` 开发警告（全量测试 348 条）随 SettingsPanel `form` 改 `$state` **降为 0**，全量测试 `[svelte]` 开发警告为 0。② 设置分区的字段写入现在直接作用在 SettingsPanel 的代理上，`isDirty` / 校验等派生按字段粒度更新（legacy 经 bindable setter 以整份 form 通知），派生均为纯函数，结果相同。③ Home 的 `activeId` 写回只在值变化时发生；聚焦语句不再随无关状态重跑（受 `lastFocusedCategoryId` 守卫，原本即为空操作）。④ 对象 `$derived` 按 `===` 判等、prop 由有值变回 `undefined` 时取默认值（同 8c / 8d）。首屏 `index-*.js` 280.32 → 275.91 kB（gzip 95.85 → 94.55 kB）；chunk 列表（31 个文件名）不变，分包体积：SettingsPanel 94.37 → 92.60（gzip 29.50 → 28.98）、Admin 65.14 → 65.03 kB，其余不变。全量 223 个文件 / 2821 项测试、smoke 112/112 通过。
- **runes 迁移第 8i 步：层级 2 的 6 个组件与 Toast**（代码审查三轮第 26 项）：迁移前先补行为基线 `tests/unit/level2ComponentsBehavior.test.ts`（jsdom，21 项）与设置组件替身 `tests/helpers/level2/SettingsProbe.svelte`：BookmarkCard 外壳样式 / 描述默认值、预览与排序阻止跳转、`open_method=3` 弹层与窗口 Escape、右键菜单的窗口点击关闭与「另一张卡打开时关闭」、排序移动按钮对 pointerdown / touchstart / click 的冒泡阻止、长按 500 ms 与 10 px 取消、700 ms 触摸防误点；BookmarkEditModal 打开锁滚动 / 首个分类回落 / 同内容 value 新对象不重置、输入链接即时生成候选、Logo 方案随标题更新并随提交、Iconify 防抖搜索与选中、无效名称报错后改动任一字段清除错误、新建时失焦自动取标题、保存中忽略取消；CategoryEditModal 有子分类禁用上级选择、手输 Iconify 地址视为已确认、打开时防抖搜索与重开重置；SearchSpotlight 打开聚焦 / 锁滚动、关闭还原焦点、重开清空、结果变少时高亮夹回、鼠标移入高亮、副标题分类名回落；AdminTabContent 按 tab 切换与设置组件 props 转交；ThemeBackgroundCard 类型切换归一化派发、新 prop 整体替换、valid 提示、派发拷贝；Toast 渲染与关闭。legacy 上写成并通过，28 种变异捕获 26 种（存活两种为等价变异：`showDescription=false` 时描述本就不渲染，故 `descriptionMode` 默认值不可观察；Spotlight 关闭时已清空查询，打开时的再次清空冗余）。随后 BookmarkCard、BookmarkEditModal、CategoryEditModal、SearchSpotlight、admin/AdminTabContent、settings/ThemeBackgroundCard 与 Toast 改为 runes。**dispatcher**：ThemeBackgroundCard 的 `change` / `upload` → `onchange(background)` / `onupload()`（参数即原 `e.detail`），唯一调用处 AdvancedSettingsSection 同提交改写；`uiLeafComponentsBehavior` 的三项与 `level1ComponentsBehavior` 的一项直接订阅 `events.change` 的写法随 API 改为传 `onchange` / `onupload`，断言不变。**bindable**：只有 AdminTabContent `importSource`（Admin 以 `bind:importSource` 传入，源恒为非 undefined 的 `'cf-navs'` 起始值）。**状态**：两个编辑框的 `form` → 深层 `$state`（子组件与输入框经 `bind:` 写回字段）；控制器返回的新对象（Iconify 搜索 / 标题解析状态、候选列表、菜单组件、可信图标快照）→ `$state.raw`。**`$:`**：BookmarkCard 32 条按 8g SpotlightBookmarkIcon 的方式 → `$derived` + 5 个 `$effect.pre`（菜单预取、打开时加载菜单、`trustedView.set`、图标状态键复位、窗口监听同步，调用部分 `untrack`）；两个编辑框的「键变化整体重置」只以键为依赖、其余受键比较守卫，两条 `form.icon` 同步只在值不同时写回，确认复位只在需要时写回；SearchSpotlight 高亮夹回与 open 翻转 → `$effect.pre`；Toast `$:` → `$derived`。**事件**：`on:` 改事件属性；BookmarkCard 移动按钮的三个 `|stopPropagation` 用 `{@attach}` + `svelte/events` 的 `on()` 直接挂在按钮上（同 8g BookmarkContextMenu：委托处理器会晚于排序容器的原生监听与窗口点击）；表单 `|preventDefault` 移进 `handleSubmit`；`<svelte:component>` → 动态组件（BookmarkCard 的懒加载菜单、AdminTabContent 以 `{@const}` 取设置组件）。行为基线（除上述订阅写法）与 bookmarkIconRecovery / bookmarkCardLocalIconCache / lazyBookmarkContextMenu / searchSpotlight / homeBookmarkIconAccess 零改动通过；`categoryCollapseMarkup` 中三条对 BookmarkCard 源码的字符串断言（`export let width`、`$: safeInfoCardWidth`、`on:touchstart` / `on:pointerdown|stopPropagation`）改为对应的 runes 写法；`tests/unit/componentsRunes.test.ts` 扩展为 43 项。已知差异与处理：① legacy 以整个 `form` 对象为依赖，BookmarkEditModal「输入链接后刷新候选并清空 candidateError」在任一字段写入时都会重跑——runes 深层 `$state` 是字段粒度，为保持「改动任一字段清除 Iconify 错误」，该副作用显式逐个读取 `form` 的字段（基线有对应用例）；其余由 `form` 派生的值是纯函数，粒度不同结果相同。② ThemeBackgroundCard 原先就地改写 legacy 父组件传入的背景对象并依赖可变 prop 触发自身重渲染（如遮罩透明度同时绑在 ColorAlphaInput 与 Slider 上）；runes 下普通 prop 的字段写入不触发更新，改为以深层 `$state` 承接 prop（父组件传入新对象时整体替换，本地切换类型后保持本地值），父组件传入的若已是 `$state` 代理则沿用同一个代理（8j AdvancedSettingsSection 迁移后即如此）。区别：父组件仍为 legacy 时，字段写入不再顺带改写父组件那份背景对象，父组件经 `onchange` 收到的拷贝与原先相同、随后整体替换，最终状态一致。③ 模板函数调用的依赖：SearchSpotlight 结果行副标题 `categoryTitle(...)`（legacy 编译为 `$.untrack`，只随行对象更新）现在在只有 `categories` 变化时也会更新（旧值滞留的修正）。④ CategoryEditModal 的 `parentCategoryOptions` 原先随 `form` 任一字段变化重建为新数组，现在只随 `form.id` / `categories` 变化；CategoryTreeSelect 对 `items` 只做重新测量，不可观察。⑤ 对象 `$derived` 按 `===` 判等、prop 由有值变回 `undefined` 时取默认值（同 8c / 8d）。`binding_property_non_reactive` 开发警告仍为 348（ThemeBackgroundCard 不新增）。首屏 `index-*.js` 281.90 → 280.32 kB（gzip 96.30 → 95.85 kB）；chunk 列表（31 个文件名）不变，分包体积：BookmarkEditModal 17.11 → 16.56、CategoryEditModal 7.10 → 6.78、SearchSpotlight 8.42 → 8.05、BookmarkContextMenu 4.25 → 4.12、SettingsPanel 94.58 → 94.37、Admin 65.12 → 65.14 kB。
- **runes 迁移第 8h 步：admin/ 三个面板与七个设置分区**（代码审查三轮第 25 项）：迁移前先补行为基线 `tests/unit/adminSectionsBehavior.test.ts`（jsdom，18 项）：AnalyticsPanel 统计与 Top 20（只含有点击、按点击降序）、零访问分页与数据缩减后页码夹回；BookmarkListPanel 搜索过滤并回到第一页、排序表头三态（aria-sort 与实际顺序）、数据缩减后页码夹回、被删掉的书签从选择中剔除、全选当前页与半选态、跨页选择摘要、排序模式进入清空搜索 / 保存回调 / 取消、链接健康检测分批（10 个一批）与进度 / 结果、批量移动成功后清空选择并关闭弹层；CategoryListPanel 分页夹回、选择剔除、全选当前页与批量删除、一级 / 子级排序保存时带父级 id；七个设置分区经 `SectionFormHarness`（以 SettingsPanel 的方式 `bind:form` 的 legacy 替身）观察写回：Card 挂载即按描述策略校正 `card_show_description` 并随单选更新、风格切换；Basic 标题输入 / 主题单选 / saving 禁用；Hero 滑块与开关；Navigation 位置单选切换左右专属开关可用性、常驻展开、边距；Background 强调色；CategoryDisplay 字号与标题颜色；SearchEngine 增删引擎、删除当前默认引擎时回落、改名后下拉选项跟随。legacy 上写成并通过，24 种变异捕获 22 种（存活的两种是 Basic / CategoryDisplay 的 `syncForm` 不再 clone：字段写回本就经 `bind:` 通知父组件，clone 只换对象身份，经 `bind:form` 观察不到）。随后 admin/AnalyticsPanel、admin/BookmarkListPanel、admin/CategoryListPanel 与 settings/Background / Basic / Card / CategoryDisplay / Hero / Navigation / SearchEngine 七个分区改为 runes：七个分区 `form = $bindable()`（SettingsPanel 与 AdvancedSettingsSection 以 `bind:form` 传入，调用处零改动），面板 props 均为单向；两个列表面板各 16 条 `$:` 与 AnalyticsPanel 11 条按原拓扑顺序改为 `$derived` / `$effect.pre`：页码夹回（三处）、选择剔除（两处）、分类搜索关键词变化时重置手动收起、Card 的 `card_show_description` 校正这些写回自身的语句改为 `$effect.pre`，**只在值确实变化时写回**（runes 下对 bindable `form` 的字段写回经 setter 通知 legacy 父组件、父组件随即通知回来，同值重写会无限重跑；legacy 的 `$:` 每次刷新只跑一次）；选择剔除只依赖父组件传入的列表（原语句还依赖选择集合本身，但选择只来自当前列表里的行，剔除结果为空操作）。选择 / 展开集合、排序草稿与健康检测结果 → `$state.raw`；健康检测原先就地 `set` 后以 `healthResults = healthResults` 自赋值触发更新，`$state.raw` 下同引用赋值是空操作，改为每批换新 Map。`on:` 全部改事件属性（fieldset 上的 input / change 与 SearchEngine 下拉自身的 input 都走委托，冒泡顺序仍是下拉先于 fieldset，Issue #25 的「input 阶段先提交 current」不变，`searchEngineSettingsSelect` 零改动通过）；CategoryListPanel 去掉文件开头的 UTF-8 BOM（`<svelte:options runes />` 须位于首行）。行为基线与上述既有测试迁移后**零改动通过**；`tests/unit/componentsRunes.test.ts` 扩展为 32 项。已知差异：① 模板里以函数调用生成的值在 legacy 下只按调用实参的语法依赖更新（编译为 `$.untrack(...)`），runes 下会跟踪函数体内读到的状态——BookmarkListPanel 排序表头的 `aria-label`（`sortButtonLabel(column.field, column.label)`）原先停留在挂载时的「当前未排序…」文案，现在随排序状态更新；行内分类名 `getCategoryTitle(bookmark.category_id)` 与批量移动弹层的目标分类名（`$: moveTargetTitle`）在只有 `categories` 变化时也会更新（均为旧值滞留的修正，基线只钉 aria-sort 与实际顺序）。② 设置分区内对 `form.x` 的 `bind:value` / `bind:group` 在开发构建报 `binding_property_non_reactive`，与 8c FooterSettingsSection 相同的误报（`form` 来自 legacy SettingsPanel、不是 `$state` 代理；写回经 bindable setter 通知父组件，行为由基线覆盖），全量测试中的条数由 9 增至 348（Basic 161、CategoryDisplay 66、Navigation 35、SearchEngine 28、Hero 22、Card 17、Background 10、Footer 9），生产构建不输出；`bind:group` 不支持函数绑定，无法在不改写单选逻辑的前提下规避，留待 SettingsPanel 在 8j 改 `$state` 后一并消失。SearchEngine 引擎行 `{#each}` 内的 `bind:value={engine.name}` 等在 runes 下只就地改写行对象、不立即通知父组件，随后 fieldset 的 input / change 触发的 `syncForm` 在 tick 后 clone 并写回（legacy 会在改写时立即通知），两个 tick 后结果一致（基线的改名用例覆盖）。③ 对象值 `$derived` 按 `===` 判等、prop 由有值变回 `undefined` 时取默认值（同 8c / 8d）。首屏 `index-*.js` 282.08 → 281.90 kB（gzip 96.37 → 96.30 kB）；chunk 列表（31 个文件名）不变，分包体积：Admin 69.12 → 65.12（gzip 20.92 → 20.09）、SettingsPanel 95.31 → 94.58、CategoryEditModal 7.09 → 7.10 kB。

- **runes 迁移第 8g 步：11 个层级 1 首页 / 书签组件**（代码审查三轮第 24 项）：迁移前先补行为基线 `tests/unit/level1ComponentsBehavior.test.ts`（jsdom，23 项）与 `tests/helpers/level1/` 三个 legacy 替身父组件：BookmarkBaseFields 7 个字段经 `bind:` 写回父表单（文本 / 下拉 / 复选框 / 分类树）、父组件改值后输入跟随、链接失焦回调与 loading 禁用；BookmarkCardCompact / Info 点击与右键把原生事件交给当前回调、预览态属性、描述显示模式与 `descriptionMode` 初始默认；BookmarkContextMenu 菜单内 click / pointerdown / 非 Escape 按键不冒泡到 window、Escape 放行、移动只提交一次（数字 id）且提交中不重复、选当前分类不提交；BookmarkIconCandidatePicker 选中态与回调；GradientBackgroundInput 经真实 legacy 父组件 ThemeBackgroundCard：改起始色后派发的新背景为重组渐变、父组件推送新值后两端颜色跟随；HomeHeroSearch / IconifySelector 的 `bind:` 双向写回与显隐 / 回调；HomeCategoryScope 根 / 子分类选择、tablist 语义切换、tab 键盘导航、菜单打开时操作被撤掉即收起；Sidebar 常驻展开的本地偏好读取与上报序列（挂载前 true、挂载后 false）、切换写回、同值不重复上报、悬停展开、移动端按钮 / 遮罩 / Escape / 导航后收起、activeId 变化自动展开父级（手动收起后离开再回来重新展开）、顶部导航高度上报、拖动后吞掉一次点击；SpotlightBookmarkIcon 文字回退与换书签。legacy 上写成并通过，21 种变异均有用例精确失败。随后 BookmarkBaseFields、BookmarkCardCompact、BookmarkCardInfo、BookmarkContextMenu、BookmarkIconCandidatePicker、GradientBackgroundInput、HomeCategoryScope、HomeHeroSearch、IconifySelector、Sidebar、SpotlightBookmarkIcon 改为 runes：`$bindable()` 只用于调用处确有 `bind:` 的 BookmarkBaseFields 7 个字段、HomeHeroSearch `query`、IconifySelector `iconifyName`、GradientBackgroundInput `value`；**GradientBackgroundInput 的 `change` 事件 → `onchange(value)` 回调 prop**（写回 `value` 之后同步调用，时序同原派发），唯一调用处 ThemeBackgroundCard 同提交改为 `onchange={() => void syncBackground()}`，`uiLeafComponentsBehavior` 中直接以 `events.change` 订阅它的一项随 API 改为 `onchange`；外部值同步的 `$:` → 只依赖 `value` 的 `$effect.pre`（比较变量 `lastValue` 保持普通变量）。Sidebar 15 条 `$:` → 4 个 `$derived` + 11 个 `$effect.pre`，按原拓扑顺序声明（本地收起偏好读取在 `isExpanded` 之前），写回自身所读变量或调用函数（`closeTopMenu`、上报回调、`tick().then(...)`）的部分放进 `untrack`，比较变量 `reportedPersistentExpansion` / `revealedActiveParentId` / `leftPreferenceLoaded` 保持普通变量，`{#if}` 内 `bind:this` 的 `topTrack` / `navigationRoot` / `topMenuElement` 用 `$state`、onMount 赋值的 ResizeObserver 与整体替换的展开集合用 `$state.raw`（保持原先「元素出现 / 观察器建好后重绑观察目标」的依赖）。HomeCategoryScope：4 个 `$derived` + 1 个 `$effect.pre`（操作被撤掉时收起菜单），`{#if}` 内的元素引用用 `$state`（避免 `non_reactive_update`），`<svelte:window>` 事件改属性（仍直接挂在 window）；`children` 仍是普通数组 prop（Home 显式传入、不传插槽内容）。SpotlightBookmarkIcon 按 8d CachedBookmarkIcon 的方式：10 个 `$derived` + 2 个 `$effect.pre`（`trustedView.set` 与状态键复位，均 `untrack` 语句体），可信图标快照 `$state.raw`。BookmarkContextMenu：`afterUpdate` → 显式读取全部模板依赖（含测量写回的 placement / maxHeight / topOffset）的 `$effect`，移动提交的 `$:` → `$effect.pre`（写回在 `untrack` 中）；**菜单节点上的 `on:click|stopPropagation`、`on:keydown`、`on:pointerdown|stopPropagation`、`on:touchstart|stopPropagation`、`on:touchmove|stopPropagation` 用 `{@attach}` + `svelte/events` 的 `on()` 直接挂载**而不是事件属性（事件属性会走根节点委托，祖先上的原生监听会先于 stopPropagation 收到事件；`on()` 与 legacy `on:` 同走 `create_event`，先执行内层按钮与分类选择器的委托处理器再停止冒泡，touch 监听仍为非 passive）。其余 `on:` 全部改事件属性（click / contextmenu / keydown / pointerdown / pointermove / pointerup 走委托；blur / wheel / scroll / pointercancel / mouseenter / mouseleave 与 `<svelte:window>` 仍直接挂载）。行为基线与上述既有测试迁移后**零改动通过**；源码文本断言 `categoryCollapseMarkup`（`reserveActions` 默认值、`onwheel`、菜单 `on()` 监听）与 `siteMetaRouteWiring`（`onblur`）随语法更新；`tests/unit/componentsRunes.test.ts` 扩展为 19 项（11 个组件的 runes 护栏、`$bindable` 与父组件 `bind:`、单向 prop 不 bindable、onchange 调用处、菜单直接监听与更新后测量、`$state.raw`）。开发构建下无新增 `[svelte]` 警告（仍只有 8c 的 9 条）。已知差异：① 卡片 / 分类范围 / 导航的 click、contextmenu、keydown、pointer 事件改走委托（同 8d 说明：祖先上用原生 `addEventListener` 注册的监听会先于这些处理器执行；已核对的祖先监听：BookmarkCard 挂在 window 上的点外部关闭在委托之后执行、不受影响；Sortable 只在列表容器上以 pointerdown / mousedown / touchstart 发起拖拽，卡片链接只处理 click / contextmenu，二者不交叉）。② BookmarkContextMenu 只在模板依赖变化时重新测量，legacy 还会在父组件以同一对象重推 `categories` 等任意更新后测量（测量幂等，结果不变）；菜单 `on:click` 等无处理器写法附带的事件转发（`bubble_event`）没有任何订阅方，随之移除。③ 对象值 `$derived` 按 `===` 判等（SpotlightBookmarkIcon 的 `iconBaseState`、Sidebar 的 `activeParentId` 等），同对象重推不再重跑幂等语句（同 8d）。④ prop 由有值变回 `undefined` 时取默认值（同 8c）；BookmarkCardInfo 的 `descriptionMode` 默认值按首次读取时的 `showDescription` 计算一次，与 legacy 初始化时计算一次一致。⑤ GradientBackgroundInput 不再提供 `on:change` / `$on('change')`（唯一调用方已改）。首屏 `index-*.js` 283.81 → 282.08 kB（gzip 96.87 → 96.37 kB）；chunk 列表（31 个文件名）不变，分包体积：BookmarkContextMenu 4.15 → 4.25（`on()` 直接挂载）、IconifySelector 6.94 → 6.75、SearchSpotlight 8.78 → 8.42、BookmarkEditModal 17.31 → 17.11、SettingsPanel 95.32 → 95.31 kB，Admin 69.12 kB 不变。

- **runes 迁移第 8f 步：views/Install 与 views/Recover**（代码审查三轮第 23 项）：迁移前先补行为基线 `tests/unit/viewsBehavior.test.ts`（jsdom，15 项），钉住 Install 的校验顺序与首个错误文案、提交载荷（令牌 / 用户名去两端空白、密码原样）、本地错误优先于 `error` prop 且提交时清除、`error` / `mode` / `installing` props 变化后的重渲染与禁用、配置面板四种 mode 的标题与按钮、缺失绑定列表与空列表回落 `DB / SESSION`、结构版本提示；Recover 的「返回登录 / 前往初始化」回调、提交中禁用与恢复、令牌去空白后传给 API、再次提交先清除服务端错误与令牌提示、未安装与未知错误映射；两者 submit 默认行为被阻止。legacy 上写成并通过，10 种变异（错误优先级颠倒、用户名不去空白、按钮文案、绑定列表无回落、去掉 preventDefault、重试按钮不回调、取消调错回调、finally 不复位、不清服务端错误、未安装不映射）均有用例精确失败。随后两个视图改为 runes：`export let` → `interface Props` + `$props()`（默认值保留）；表单字段与 `localError` / `serverError` / `submitting` / `tokenHint` → `$state`；`formError`、`configuration` → `$derived`；`on:submit|preventDefault` → `onsubmit` + 处理器内 `event.preventDefault()`，`on:click` → `onclick`。App（已是 runes）以动态组件挂载、调用处零改动。行为基线与既有 `recoverView.test.ts` / `appComponent.test.ts` 迁移后**零改动通过**；新增源码护栏 `tests/unit/componentsRunes.test.ts`（4 项，8f 起各批共用）。开发构建下无新增 `[svelte]` 警告（仍只有 8c 的 9 条 `binding_property_non_reactive`）。已知差异：legacy 的 `$: configuration = mode === 'needs_install' ? null : configurationCopy()` 只依赖语句里出现的 `mode`，`configurationCopy()` 内读取的 `missingBindings` 变化不会重算；runes 的 `$derived` 会跟踪它，因此「还缺少存储绑定」页重新检查后若缺失列表改变而 mode 不变，提示文案随之更新（原先停留在旧列表，属文案滞留的修正，其余路径不变）。首屏 `index-*.js` 283.81 kB 不变（gzip 96.88 → 96.87 kB）；chunk 列表（31 个文件名）不变，分包体积：Install 6.54 → 6.43、Recover 5.53 → 5.46 kB。

- **runes 迁移第 8e 步：ui/ 与事件分发叶子 6 个组件**（代码审查三轮第 22 项）：迁移前先补行为基线 `tests/unit/uiLeafComponentsBehavior.test.ts`（jsdom，21 项），全部经**真实 legacy 父组件**观察：Switch 在 Basic / Hero / Navigation / Card 四个设置分区里切换后父表单收到的布尔值（原 `e.detail`，Navigation 映射为 wrap / scroll）与禁用联动；InputGroup / Slider 的 `bind:value` 写回先于回调、number 类型写回数字 / 清空写回空串、CategoryDisplay 无回调时由 fieldset 原生 input 冒泡同步；ColorAlphaInput 的 `change` 载荷（GradientBackgroundInput 用它重组渐变）、`bind:value` + `bind:alpha` 拆分 8 位 hex、父组件改 alpha 后选择器跟随、ThemeBackgroundCard 遮罩键盘调整；GradientPresetSelector 的 `select` 载荷为预设对象（整套写回）、`custom` 无载荷、展开切换；Tooltip 展开中改 `text`、卸载取消 rAF；插槽渲染位置：Navigation 的单位下拉、SearchEngine 的图标生成按钮、ThemeBackgroundCard 的 `<svelte:fragment slot="suffix">` 上传按钮，以及 Switch 的默认插槽（新增 `tests/helpers/uiLeaf/` 两个 legacy 替身：`bind:form` 设置分区壳、Switch 默认插槽父组件）。在 legacy 实现上写成并通过，10 种变异（Switch 载荷取反、number 不转数字、预设选择改发 custom、去掉 rAF 取消、不拆 alpha、去掉具名 / 默认插槽、Slider 写回 +1、change 载荷写死、effectiveAlpha 忽略外部 alpha）均有用例精确失败。随后 ui/InputGroup、ui/Slider、ui/Switch、ui/Tooltip、ColorAlphaInput、settings/GradientPresetSelector 改为 runes：`createEventDispatcher` → 回调 prop（Switch `onchange(checked)`、InputGroup / Slider `oninput(value)`、ColorAlphaInput `onchange(value)`、GradientPresetSelector `onselect(preset)` / `oncustom()`，同步、在 `bind:` 写回之后调用，时序与原派发一致）；InputGroup / Slider / Switch 另派发的 `value` / `checked` 事件只为 `bind:` 约定而设、没有任何调用方，删除。**父组件同提交改写**：11 个 legacy 父组件（BookmarkEditModal 无事件仅核对、GradientBackgroundInput、Advanced / Background / Basic / Card / CategoryDisplay / Hero / Navigation / SearchEngine 六个设置分区与 ThemeBackgroundCard）共 39 处调用，`on:x` → `onx`，`event.detail` → 回调参数（GradientBackgroundInput 两个处理器改为接收字符串，Navigation / Background 直接传处理函数）。`$bindable()` 仅用于调用处确有 `bind:` 的 InputGroup / Slider `value`、ColorAlphaInput `value` / `alpha`；Switch `checked` 只被单向传入，保持普通 prop（本地翻转、父组件随后写回同值，同 legacy）。插槽：Switch `<slot />` → `children` + `{@render children?.()}`，legacy 父组件的默认插槽内容可直接作为 `children` 传入（替身验证）；InputGroup `<slot name="suffix" />` → `suffix` snippet prop，**已验证 legacy 父组件的 `slot="suffix"` 与 `<svelte:fragment slot="suffix">` 不会传给 runes 子组件**（只迁移子组件时，基线中 Navigation 与 ThemeBackgroundCard 的后缀用例失败、Switch 默认插槽用例通过），三处调用改为 `{#snippet suffix()}`，snippet 内的 `bind:value`、`on:click`、`{#each}` 的 `engine` / `index` 照常工作。ColorAlphaInput：HSV / 内部透明度 / 解析标志 / `pickerOpen` → `$state`，比较变量 `lastEmitted` / `lastParsedAlphaMode` 与 `dragging`、元素引用保持普通变量；外部值同步的 `$:` → `$effect.pre`（只依赖 `value` / `alpha`，语句体在 `untrack` 中写回 `value` / `alpha` / HSV，自写触发的重跑因 `value === lastEmitted` 为空操作），10 条派生 `$:` → `$derived`，按原拓扑顺序声明在同步语句之后；Slider `display` → `$derived`；GradientPresetSelector `presetsExpanded` → `$state`；Tooltip `open` / `bubbleStyle` 与 `{#if}` 内的气泡引用 → `$state`（DOM 节点不被代理；避免 `non_reactive_update`），store 订阅与 onMount / onDestroy 沿用。全部 `on:` 改事件属性（click / input / change / keydown / pointerdown / pointermove / pointerup 走委托，父组件 fieldset 上 legacy 的 `on:input` / `on:change` 先跑子组件委托处理器，同步顺序不变；mouseenter / focus / blur / pointercancel / lostpointercapture 与 `<svelte:window>` 仍直接挂载）。行为基线迁移后**零改动通过**；既有 `uiComponents.test.ts` / `colorAlphaInput.test.ts` 的 `events:` 订阅随 API 改为回调 prop（Switch 的 change + checked 双事件用例改为「onchange 只回调一次」）；`tests/unit/leafComponentsRunes.test.ts` 扩展为 35 项（6 个组件的 runes 护栏、`$bindable` 与 `{@render}`、39 处父组件调用无 `on:` / `event.detail` / `slot="suffix"`）。开发构建下无新增 `[svelte]` 警告（仍只有 8c 的 9 条 `binding_property_non_reactive`）。已知差异：① prop 由有值变回 `undefined` 时取默认值（同 8c）；被 `bind:` 的 `value` / `alpha` 若父组件绑定源为 `undefined`，runes 抛 `props_invalid_value`（legacy 会把默认值写回父组件）——现有绑定源都是 `createSettingsFormState` / 预设 / 书签表单归一化后的非 undefined 值，不可观察。② 不再提供 `on:value` / `on:checked` / `$on(...)`（无调用方）。③ ColorAlphaInput 的 `effectiveAlpha` 等派生值在处理器内读取时总是最新值。首屏 `index-*.js` 283.80 → 283.81 kB（gzip 96.87 → 96.88 kB）；chunk 列表（31 个文件名）不变，分包体积：ColorAlphaInput 6.41 → 6.09、SettingsPanel 96.03 → 95.32 kB，Admin 69.12 kB 不变（gzip 20.91 → 20.92），LoginModal 2.45 kB 不变（gzip 1.19 → 1.18）。

- **runes 迁移第 8d 步：9 个层级 0 有状态组件**（代码审查三轮第 21 项）：迁移前先补行为基线 `tests/unit/statefulLeafComponentsBehavior.test.ts`（jsdom，34 项）与 `tests/unit/cachedBookmarkIconBehavior.test.ts`（9 项，只替换本地缓存读写 / 可信图标视图 / 可见性观察三个模块边界，按 id 的图标显示覆盖表用真实实现），被父组件 `bind:` 的 prop 经 `tests/helpers/statefulLeaf/` 下三个 legacy 替身父组件验证双向绑定；全部在 legacy 实现上写成并通过，对组件做的 18 种变异（登录框打开不清空 / 开合键恒定、密码上限放宽、引擎菜单不随选择器关闭、默认引擎变更不清手动选择、更新后回调改为只在挂载时、选中后不还焦点、导出选择重复初始化、子分类不排序、HTML 来源不强制合并、状态键变化不复位失败 / 不回收本地 URL、可信视图可见性写死、可信视图接管后仍读本地缓存、快捷键提示写死、分类图标换源不清失败标记、危险样式写死等）均有用例精确失败。随后 BackupPanel、CachedBookmarkIcon、CategoryIcon、CategoryTreeSelect、ConfirmDialog、HomeFloatingActions、LoginModal、PasswordChangePanel、SearchBox 改为 runes，父组件仍为 legacy、调用处零改动：`export let` → `interface Props` + `$props()`（默认值保留）；被 `bind:` 的 CategoryTreeSelect `value`、SearchBox `query`、BackupPanel `importSource` 用 `$bindable()`；模板依赖的本地 `let` → `$state`，整体替换的 Set（导出选择 / 展开集合）与可信图标快照用 `$state.raw`，只在副作用或处理器里用的比较变量（`formKey` / `stateKey` / `lastDefaultEngine` / `userSelected` / `initializedSelection` / `retryAttempt`）保持普通变量；49 条 `$:` → 38 个 `$derived` / `$derived.by` 与 9 个 `$effect.pre`（登录框打开清空、默认引擎变更清手动选择、引擎选择回落、菜单随选择器关闭、导出选择首次初始化、两处 `trustedView.set`、书签图标状态键复位重载、分类图标换源复位），均与原 `$:` 一样先于 DOM 更新、按原拓扑顺序声明；会写入自己所读变量的语句用 `untrack` 只保留原语句的语法依赖；BackupPanel 原先单独就地排序子分类的 `$:` 并入 `childrenByParent` 的 `$derived.by`；CategoryTreeSelect 的 `afterUpdate`（runes 下不可用）改为显式读取全部模板依赖的 `$effect`，内联菜单模式下挂载后与每次更新后仍通知父菜单重新测量；`on:submit|preventDefault` / `on:dragover|preventDefault` 改为处理器内 `preventDefault()`；`on:` 全部改事件属性（click / change / keydown / focusout 走委托，BookmarkContextMenu 的 legacy `on:click|stopPropagation` / keydown 仍先跑内层委托处理器，Escape 先关内层选择器的既有用例通过；`<svelte:window>` 的 keydown / pointerdown 与 submit / drop / load / error 仍直接挂载）。这 9 个组件没有 `<slot>` 与 `createEventDispatcher`。行为基线与各组件原有测试迁移后**零改动通过**；`tests/unit/leafComponentsRunes.test.ts` 扩展为 27 项（9 个组件的 runes 护栏、无 `beforeUpdate` / `afterUpdate`、三个 `$bindable`、`$state.raw`）。已知差异（不可观察）：对象值 `$derived` 按 `===` 判等，legacy 父组件以同一个 `searchEngine` / `category` / 图标行对象重复推送时不再重跑引擎选择回落与关菜单（结果本就不变；就地改写 `engines` 数组的调用方不存在），也不再以相同入参重调 `trustedView.set`（其内部本就按签名去重）；更新后通知只在模板依赖变化时触发，legacy 还会因深读 `items` 内部字段而触发（就地改写 items 的调用方不存在）；prop 由有值变回 `undefined` 时取默认值（同 8c）。首屏 `index-*.js` 284.67 → 283.80 kB（gzip 96.90 → 96.87 kB）；chunk 列表（31 个文件名）不变，分包体积：Admin 70.04 → 69.12、CategoryTreeSelect 8.08 → 7.53、LoginModal 2.60 → 2.45、SettingsPanel 96.06 → 96.03、ColorAlphaInput 6.42 → 6.41 kB，CategoryEditModal 7.09 kB 不变（gzip 3.06 → 3.07）。

- **runes 迁移第 8c 步：14 个层级 0 纯展示组件**（代码审查三轮第 20 项）：迁移前先补行为基线 `tests/unit/leafComponentsBehavior.test.ts`（jsdom，22 项，在 legacy 实现上写成并通过）：AdminSidebar（激活态 / 计数 / 回调换新）、BookmarkCustomIconField（文字 / 图片预览、输入回调、图床按钮与禁用、错误提示）、BookmarkIcon（图片属性与修饰类、文字回退、load / error 转发到当前回调）、BookmarkIconCandidateButton、BookmarkLinkModal（挂到 body、渲染容器外的点击仍触发 onClose、卸载移除）、BookmarkModalActions（删除按钮出现条件、回调收到事件对象、忙碌态）、BookmarkModalHeader、HomeContentSummary、HomeEmptyPanel、LogoSchemeSelector（仅 `logo_surf` 时标记选中）、AdminPageHeader（登录 / 登出 / 返回首页与禁用）、FooterSettingsSection（经 SettingsPanel 的 `bind:form`：输入写回父表单、脏状态往返、保存 payload、saving 禁用）；AppSplash、DeviceIconCachePanel 与 BookmarkIcon 超时沿用既有测试。随后 14 个组件（AdminSidebar、AppSplash、BookmarkCustomIconField、BookmarkIcon、BookmarkIconCandidateButton、BookmarkLinkModal、BookmarkModalActions、BookmarkModalHeader、DeviceIconCachePanel、HomeContentSummary、HomeEmptyPanel、LogoSchemeSelector、admin/AdminPageHeader、settings/FooterSettingsSection）改为 runes（`<svelte:options runes />`），父组件仍为 legacy、调用处零改动：`export let` → 带 `interface Props` 的 `$props()` 解构（默认值逐个保留，回调 prop 由 `= undefined` 改为可选）；SettingsPanel 以 `bind:form` 绑定的 FooterSettingsSection `form` 用 `$bindable()`；DeviceIconCachePanel 的 `busy` / `localError` 改 `$state`（`$iconDevice` 等 store 订阅沿用）；全部 `on:` 改事件属性（`onclick` / `oninput` / `onchange` 走事件委托，委托监听同时挂在挂载根与 `document` 上，BookmarkLinkModal 移到 body 后的点击仍可达，已有用例；`onerror` / `onload` 不委托，仍直接挂在 `<img>` 上）；`class:` / `style` / `use:` 原样保留。这 14 个组件没有 `$:`、`<slot>`、`createEventDispatcher`、`$$props` / `$$restProps`。行为基线测试迁移后**零改动通过**；新增 `tests/unit/leafComponentsRunes.test.ts`（16 项源码护栏，迁移前 16 项全部失败）。已知差异：① runes 下 prop 由有值变回 `undefined` 时取默认值，legacy 下保持 `undefined`；现有父组件传入的都是非 undefined 的类型化值，不可观察。② `bind:value={form.footer_html}` 等三处在开发构建下报 `binding_property_non_reactive` 警告（`form` 来自 legacy 父组件、不是 `$state` 代理），属误报：写入经 `$bindable` 的 setter 通知 legacy 父组件，行为与原先一致（基线用例覆盖），生产构建不输出；SettingsPanel 在 8j 改用 `$state` 后消失。首屏 `index-*.js` 284.67 kB 不变（gzip 96.83 → 96.90 kB）；chunk 列表（31 个文件名）不变，分包体积：Admin 70.22 → 70.04、SettingsPanel 96.14 → 96.06、BookmarkEditModal 17.55 → 17.31、CategoryTreeSelect 8.09 → 8.08、LoginModal 2.59 → 2.60、ColorAlphaInput 6.41 → 6.42 kB。

- **`App.svelte` runes 迁移第 8b 步：App 改为 runes 模式**（代码审查三轮第 19 项）：只迁移 `src/App.svelte`（`<svelte:options runes />`），子组件保持 legacy（Svelte 5 支持混用）。控制器经 `onChange` 写入的状态与其余模板状态改为 `$state`，其中对象值（`installState` / `activeCategory` / `activeBookmark` / `importExportState` / `confirmDialog` / `viewBookmark` / `customScriptController`）用 `$state.raw`：不做深层代理，子组件拿到的仍是控制器的原对象，同引用赋值即空操作（原有的身份守卫保留为显式意图）；21 条 `$:` 改为 15 个 `$derived`（安装视图、三份 store 数据、`canSeeHome`、标题、后台适配、主题状态与背景 / 预设 / 自定义 CSS 输入）与 6 个 `$effect.pre`（Install / Recover 懒加载、登录闸门、主题与根变量写入、自定义 CSS、自定义脚本）：一律用 `.pre`，与原先 `$:` 一样在同一次刷新中先于 DOM 更新执行，登录闸门因此不会先渲染一帧后台 splash；`<svelte:component this={$X}>` 改为由懒加载 store 派生的动态组件（`RecoverPage` / `InstallPage` / `AdminPage` / `LoginModal` / `BookmarkEditModal` / `CategoryEditModal` / `SearchSpotlight`）；`<svelte:window on:keydown>` 改为 `onkeydown`；`$store` 订阅（`$configStore` / `$publicStore` / `$adminStore` / `$authStore` / `$isAuthenticated` 与 7 个懒加载 store）沿用。第 18 项的组件级测试（含紧随其后加强的闸门时机断言：检查每个被插入 / 移除的节点）**零改动通过**；对迁移后的 App 反向验证：闸门改用 `$effect`（DOM 之后）、`installState` 或 `activeBookmark` 改用会深层代理的 `$state` 均有用例精确失败。已知差异（不可观察）：对象值 `$derived` 按 `===` 判等，store 以同一个 `data` 对象重复推送时不再把相同对象重推给 Home / Spotlight / Admin、也不再以相同内容重调 `customScript.apply`（控制器本就幂等）；从回调中读取派生值（`getAdminData` / `getCanSeeHome` / 快捷键与切换主题时的读取）总是最新值，legacy 下在 store 写入后、下一次刷新前的同一同步段内可能读到旧值，现有调用点都在 await 或用户事件之后；两条懒加载副作用移到派生值之后声明（`$effect.pre` 创建时即同步执行，需避开 TDZ），执行顺序与原 `$:` 拓扑排序结果一致。`customScript.test.ts` 的接线断言由 `$:` 字面量改为匹配新写法（注释指向组件级测试）；新增 `tests/unit/appRunes.test.ts`（3 项源码护栏：runes 开关、无 `$:` / `<svelte:component>` / `on:`、对象值用 `$state.raw`、6 个 `$effect.pre` 且无 `$effect`）。首屏 `index-*.js` 285.51 kB → 284.67 kB（gzip 96.95 kB → 96.83 kB）；chunk 列表（31 个文件名）不变，除 `index` 外只有 `LoginModal-*.js` 2.60 → 2.59 kB（从 `index` 导入的压缩别名改名）。64 个 `export let` 子组件的分批计划（8c–8j，按目录、叶子优先）见 `docs/reference/APP_SPLIT_PLAN.md`。

- **`App.svelte` runes 迁移第 8a 步：组件级行为基线测试**（代码审查三轮第 18 项）：新增 `tests/unit/appComponent.test.ts`（jsdom，34 项），在 runes 迁移前真实挂载 `src/App.svelte` 并钉住其响应式部分的可观察行为。只替换模块边界：启动 / 分类 / 书签 / 设置 / 认证五个控制器换成可手动推送 `onChange` 的替身（方法为可识别的 `vi.fn`，断言模板接线到的正是控制器方法），`dataService` 换成记录回调的替身、全局 `fetch` 一经调用即失败，7 个懒加载组件与 Home / Toast / ConfirmDialog / BookmarkLinkModal 换成新增的 `tests/helpers/appProbe/`（runes 写的 `AppProbe.svelte`：记录父组件传入的 props 与每个 prop 的重新传入次数）且分包可编排为成功 / 失败 / 挂起，媒体查询、图标设备、焦点刷新与自定义脚本控制器换成替身；stores 与 `rootStyleWriter`（外包一层记录调用）用真实实现。覆盖：启动 splash 与外壳揭开、Home / Admin / 登录 splash / 后台 splash 与各懒加载模态的动态组件切换及全部 props（含 `homeTitle` 回落链、`settingsLoading`、`deleting`、`categoryCreateReturnToHome` 才挂载 `CategoryEditModal`）；控制器对象身份守卫（同一 `active` / `importExport` / `installState` 对象再次推送不重新传给子组件、换对象才重传且身份不变）；登录闸门（启动中 / 非首页不触发、私密站点揭开或失去访问权时触发且同一次刷新内切到登录视图，DOM 从未出现后台 splash 或首页（按 MutationObserver 记录的插入与移除节点检查，中途渲染又被替换的视图也会被发现）；安装状态下同样触发）；主题（站点配置 / 系统深色 / 挂载时读本地偏好 / 切换写本地偏好）与根元素 `data-theme` / `data-background-preset` / 背景变量 / `custom-css-inject` 写入，以及点击计数等无关变化不重跑写入、只在各自输入变化时重跑；减少动态效果时跳过外壳入场动画；自定义脚本控制器挂载时创建、`custom_js` 应用、切主题不重跑、`publicData` 换对象时以当前内容再调用、卸载销毁；Install / Recover 懒加载（找回优先、已加载不重载、加载失败提示在 booting 切换 / 其它分包加载 / store 变化 / 根错误等无关更新下保持，安装状态换对象时清掉并重试）；Ctrl+K / Cmd+K / 「/」 / Esc 快捷键、输入框与非首页忽略、模态打开时不唤起、分包加载期间打开模态则不再唤起、书签查看框；确认框、`rootError` 与 dataService 三个回调；共享依赖读写当前状态；onMount / onDestroy（图标设备、系统深色订阅、`boot.start()` 返回 false 时不装焦点刷新、卸载移除全局 keydown）。已做变异验证：去掉闸门的视图切换、闸门改为异步切换、去掉 `installState` / `activeCategory` 身份守卫、`custom_js` 语句依赖主题、自定义 CSS / 主题写入依赖整个 `publicData`、标题回落顺序对调、Install 加载条件去掉 `!recoverActive`、忽略系统深色、忽略减少动态效果、去掉快捷键 `preventDefault`、去掉 Spotlight 加载后的复核、卸载不停焦点刷新等 14 种改动均有用例精确失败。仅新增测试，源码不变；首屏 `index-*.js` 285.51 kB（gzip 96.95 kB）与 chunk 列表（31 个文件名）不变。

- **`App.svelte` 拆分第 7d 步：抽出认证用例控制器**（代码审查三轮第 17 项）：打开 / 关闭登录框、登录（失败交由 authStore 记录、不抛出；`/admin` 下载入后台）、登出（撤销失败的提示在视图切换后弹出；发起后被更新的登录 / 找回操作作废则不再切换视图或报错）、进入后台、忘记密码，以及登录态数据加载 `ensureLoggedInDataLoaded`（401 时清会话 / adminStore / 缓存、刷新公开数据并打开登录框）、变更后刷新与统计页刷新移入 `src/lib/appAuthController.ts` 的 `createAuthController(deps)`（与既有的纯函数同文件）。控制器不持有状态：`loginModalOpen` / `currentView` / `rootError` 仍归 App 经回调写入，`canSeeHome` 经 `getCanSeeHome`、`get(adminStore)` 经 `readAdminState`、公开模式经 `getPublicMode` 在原先的时机读取，认证视图意图仍由 App 创建并注入（改密也作废它）；登出经注入的 `resetCategories` / `resetSettings` / `resetBookmarks` 按原顺序（分类 → 设置 → 书签）重置。打开登录 / 进入后台 / 登录三个原先套了一层 async 的处理器保留包装，兑现时机逐个微任务一致。认证控制器最后创建，共享依赖 `appDeps` 中的 `openLogin` / `ensureLoggedInDataLoaded` / `refreshAdminDataAfterMutation` 改为转发给它的箭头函数（返回同一个 promise），`replacePath` 也并入 `appDeps`。语句顺序与 await 位置逐条保持，**无行为变化**。App.svelte 767 → 616 行；首屏 `index-*.js` 284.60 kB → 285.51 kB（gzip 96.76 kB → 96.95 kB，+0.91 kB）；chunk 列表（31 个文件名）不变，除 `index-*.js` 外只有 `LoginModal-*.js` 由 2.59 kB 变为 2.60 kB（仅为其从 `index` 导入的压缩导出别名改名，代码未变）。新增 `tests/unit/appAuthUseCases.test.ts`（39 项：38 个场景覆盖数据加载未登录 / 已就绪 / 缺设置刷新 / 未就绪 / 刷新中登出 / 401 / 其它错误 / 处理 401 时失败、变更后刷新成功 / 失败、统计页与其它标签、打开登录（公开 / 私密 / 分包失败）、关闭登录（公开 / 私密）、登录（首页 / `/admin` / 失败吞掉 / 刷新失败吞掉）、登出（公开 / 私密 / 撤销失败提示 / 会话未清 / 清缓存期间重新登录 / 无原设置 / 撤销中被打开登录作废 / 载入登录框时被找回作废 / 失败报错 / 作废后失败不报错）、进入后台（未登录 / 成功 / 数据加载失败 / 会话过期 / 分包失败）、忘记密码，以及 7 个处理器并发时的兑现顺序；每个场景同时驱动控制器与逐字复刻的原 App 实现，比对依赖调用序列（含登录态 / adminStore / 公开模式 / canSeeHome 读取、认证视图意图 begin / invalidate、toast 与每次调用时的完整状态快照）、最终状态与 promise 结果；另 1 项 App 接线；已反向对照：登出重置顺序对调、去掉打开登录或进入后台的 async 包装、401 不打开登录、数据加载改为强制刷新、登出去掉意图复核、去掉撤销提示、原设置改在撤销之后读取、登录失败不再吞掉、关闭登录 / 忘记密码不作废意图、路径与视图写入顺序对调、任意标签都刷新、清缓存后不复核登录态、变更后刷新失败改为抛出、私密站点不切登录视图等 16 种改动均有用例精确失败）。

- **`App.svelte` 拆分第 7c 步：抽出设置 / 改密 / 导入导出控制器**（代码审查三轮第 16 项）：设置保存（`runAdminMutation`：保存中 / 错误 / 本地应用 / 「设置已保存」提示）、修改密码（失败原样抛给改密面板；成功后作废认证视图意图、清会话，按原顺序重置分类编辑框 → 设置状态 → 书签编辑框 → adminStore、清缓存，再提示重新登录并打开登录框）、导出与导入（导入时读取当下的 `adminData`，成功且无错误时变更后刷新）以及设置 / 导入导出状态移入 `src/lib/appSettingsController.ts` 的 `createSettingsController(deps)`。形态与第 7a / 7b 步相同：普通闭包 + `onChange`（不新增 store 订阅），控制器持有 `saving` / `error` / `importExport`，App 只在 `importExport` 换了对象时才赋值；`rootError` / `loginModalOpen` / `currentView` 仍归 App 经回调写入；登出中的 `resetSettingsState()` 改为 `settingsController.reset()`，位置不变。`authViewIntent` 改为由 App 在各控制器之前创建并注入。**体积**：App 新增共享依赖对象 `appDeps`（同名同义的依赖只写一次），以展开方式传给启动、分类、书签与设置四个控制器，原先每个控制器各写一遍的 `api` / `isLoggedIn` / `ensureLazyComponent` / `setRootError` 等未压缩属性名不再重复；新控制器在入口一次性解构依赖，方法体内不再重复 `deps.xxx`。语句顺序与 await 位置逐条保持，**无行为变化**。App.svelte 835 → 767 行；首屏 `index-*.js` 284.12 kB → 284.60 kB（gzip 96.47 kB → 96.76 kB，+0.48 kB，此前每个控制器约 +1.75 kB）；chunk 列表（31 个文件名）与除 `index-*.js` 外每个 chunk 的体积均不变。新增 `tests/unit/appSettingsController.test.ts`（26 项：23 个场景覆盖保存成功 / 失败 / 本地应用失败 / 重提清错误 / 保存中被重置 / 重置清错误、改密成功 / 重置顺序 / 请求失败 / 清缓存失败 / 登录分包失败、导出成功 / 失败 / 导出中再次导出 / 导入后导出沿用状态、导入成功 / 取消 / 失败 / 持久化失败 / 刷新失败抛出 / 导出后取消导入 / 成功文案后报错不刷新 / 按调用时的 `adminData`；每个场景同时驱动控制器与逐字复刻的原 App 实现，比对依赖调用序列（含 toast / console.warn 与每次调用时的完整状态快照）、最终状态与 promise 结果，并核对 App 经 `onChange` 拿到的状态与控制器内部一致；另 2 项推送序列 / 导入导出状态对象身份，1 项 App 接线；已反向对照：改密重置顺序对调、不作废认证视图、提示早于清缓存、保存不清错误、导出改传新状态对象、reset 漏推送、保存失败漏推送、刷新判断忽略错误、缓存首次 `adminData` 等 9 种改动均有用例精确失败）。

- **`App.svelte` 拆分第 7b 步：抽出书签用例控制器**（代码审查三轮第 15 项）：书签的打开新建（未指定分类时落到第一个分类）、读取原始数据打开编辑（加载 `BookmarkEditModal` 后复核登录、会话与编辑意图，打开后后台补图）、关闭、提交（新建 / 更新，发起会话作废后不再应用 / 刷新 / 补图 / 提示）、删除、批量删除、批量移动（失败重新抛出）、排序（乐观排序队列）、跨分类整理（失败先回滚到服务端数据再抛出原始错误）以及书签表单状态移入 `src/lib/appBookmarkController.ts` 的 `createBookmarkController(deps)`。形态与第 7a 步相同：普通闭包 + `onChange`（不新增 store 订阅），控制器持有 `modalOpen` / `modalMode` / `active` / `saving` / `deletingId` / `error` 与书签排序队列，App 只在 `active` 换了对象时才赋值；`rootError` 仍归 App 经回调写入；会话经注入的 `getSession`（即 `get(authStore).session`，按引用比较）、默认分类经 `readAdminData`（即 `get(adminStore).data`，仍只在未指定分类时读取）在原先完全相同的时机读取；与分类控制器注入**同一个** `createEditIntentCounter()` 实例，任一方打开 / 重置编辑框仍会作废另一方正在读取的编辑。语句顺序与 await 位置逐条保持，**无行为变化**（包括原有边界语义：提交中途登出时不清 `saving`、无会话时提交永不收尾）。App.svelte 979 → 835 行；首屏 `index-*.js` 282.37 kB → 284.12 kB（gzip 96.27 kB → 96.47 kB，+1.75 kB 主要为依赖注入对象的未压缩属性名）；chunk 列表（31 个文件名）与除 `index-*.js` 外每个 chunk 的体积均不变。新增 `tests/unit/appBookmarkController.test.ts`（47 项：44 个场景覆盖未登录 / 数据未就绪 / 指定或默认分类 / 无分类 / 分包加载失败、编辑成功 / 未登录 / 无数据 / 已不存在 / 分包失败 / 读取或加载期间被共享计数作废 / 会话变化 / 登出 / 作废后失败不报错、关闭、提交新建 / 更新 / 失败 / 请求中登出 / 本地应用或刷新期间换会话 / 无会话 / 表单异常、删除取消 / 成功（从编辑框）/ 失败、批量删除空 / 取消 / 成功 / 无删除不刷新 / 失败、批量移动成功 / 失败抛出 / 刷新失败抛出、排序成功 / 失败回滚 / 回滚再失败告警 / 重叠排序、整理成功 / 失败回滚后抛原错误 / 回滚失败抛回滚错误、重置；每个场景同时驱动控制器与逐字复刻的原 App 实现，比对依赖调用序列（含会话 / adminStore 读取、后台补图、toast、console.warn 与每次调用时的完整状态快照）、最终状态与 promise 结果；另 1 项推送序列 / 表单对象身份，2 项分类与书签控制器共用计数器互相作废；已反向对照：reset 不推进计数、改用私有计数器、新建前不推送清错误、无条件读取默认分类、编辑去掉会话比较、推送前补图、提交本地应用后不复核会话、`isCurrent` 放过 null 会话、删除成功不重置表单、批量移动不再抛出、批量删除漏推送、排序本地应用改为重新拉取、整理失败不回滚 / 吞掉错误等 14 种改动均有用例精确失败）。

- **`App.svelte` 拆分第 7a 步：抽出分类用例控制器**（代码审查三轮第 14 项）：分类的打开新建（含从首页 / 根分类新建与懒加载 `CategoryEditModal` / `Admin`）、读取原始数据打开编辑、关闭、提交（新建 / 更新、从首页新建后回到首页并跨两次 `tick` 聚焦新分类）、删除（按当前 `adminData` 统计直属书签 / 子分类数量的确认）、批量删除、同级排序（乐观排序队列）以及分类表单状态移入 `src/lib/appCategoryController.ts` 的 `createCategoryController(deps)`。与 `appConfirmDialog` / `appBootController` 一致用普通闭包而非 store（不新增任何 store 订阅）：控制器持有 `modalOpen` / `modalMode` / `active` / `saving` / `deletingId` / `error` / `createReturnToHome` 与分类排序队列，每次赋值后经 `onChange` 推送快照，App 只在 `active` 换了对象时才赋值（Svelte 对对象的同引用赋值也会触发依赖，避免把同一份表单值再推给编辑框）；`rootError` / `currentView` / `homeFocusCategoryId` 仍归 App，经回调在原先完全相同的时机写入；api、登录 / 数据加载、懒加载、确认框、`dataService` 本地应用与刷新、`tick` 全部依赖注入，`import()` 字面量仍留在 App。分类与书签共用的 `editIntent` 计数器抽为 `src/lib/appEditIntent.ts` 的 `createEditIntentCounter()`（`next()` / `current()`），App 只创建一个实例注入分类控制器，书签代码改用同一实例，保持「打开 / 重置任一编辑框都会作废另一方仍在读取的编辑」的原语义。三个原先套了一层 async 的处理器（新建根分类 / 编辑 / 提交）同样保留包装，兑现时机逐个微任务一致。语句顺序与 await 位置逐条保持，**无行为变化**。App.svelte 1103 → 979 行；首屏 `index-*.js` 280.60 kB → 282.37 kB（gzip 95.73 kB → 96.27 kB，+1.77 kB 主要为依赖注入对象与状态快照的未压缩属性名）；chunk 列表（31 个文件名）与除 `index-*.js` 外每个 chunk 的体积均不变。新增 `tests/helpers/useCaseWorld.ts`（可编排、可挂起的依赖替身世界，记录每次依赖调用的参数与当时完整状态）与 `tests/unit/appCategoryController.test.ts`（41 项：39 个场景覆盖未登录 / 数据未就绪 / 从后台或首页新建 / 覆盖参数 / 分包加载失败、编辑成功 / 无数据 / 已不存在 / 读取失败 / 被书签侧共享计数作废 / 作废后失败不报错 / 重叠编辑、关闭、提交新建 / 更新 / 回到首页聚焦 / 接口失败 / 本地应用失败 / 表单异常 / 提交中被重置、删除取消 / 成功 / 计数取自调用时数据 / 失败、批量删除空 / 取消 / 成功 / 无删除不刷新 / 仅删书签仍刷新 / 失败、排序成功 / 失败回滚 / 回滚再失败告警 / 重叠排序只由最新一次持久化或报错、重置；每个场景同时驱动控制器与逐字复刻的原 App 实现，比对依赖调用序列（含 toast / console.warn 与每次调用时的完整状态快照）、最终状态与 promise 结果，并核对 App 经 `onChange` 拿到的状态与控制器内部一致；另 2 项推送序列 / 表单对象身份与注入计数器共享；已反向对照：reset 不推进计数、批量删除 / 删除收尾漏推送、reset 后才读「从首页新建」、调换 reset 与本地应用、去掉一次 `tick`、编辑去掉意图比较、改用私有计数器、回滚刷新不带 `true`、删除确认数量对调、`??` 改 `||`、排序 / 打开新建不清错误等 13 种改动均有用例精确失败）；`confirmationFlow` 的分类删除断言改为检查控制器源码并确认 App 经由控制器接线。

- **安装页「重新检查」按钮跳过安装探测**（代码审查三轮第 13 项）：`Install.svelte` 的「重新检查安装状态」/ 配置引导按钮以 `on:click={onRetryStatus}` 接线，App 又把 `boot.initializeApp` 直接作为 `onRetryStatus` 传入，点击时 MouseEvent 落到 `initializeApp(installStatusKnown)` 的参数上并按真值处理：重试跳过安装探测、`installState` 不被重置，状态错误后若数据加载恰好成功，安装页会一直留在屏幕上。现控制器新增无参的 `retryInstallStatus()`（等价于 `() => initializeApp()`），App 改为 `onRetryStatus={boot.retryInstallStatus}`，按钮传入的事件对象不再流入；安装完成后内部的 `initializeApp(true)` 不变。`appBootController.test.ts` 中记录旧行为的用例（「事件对象重试跳过探测」）改为断言修复后的行为：带事件对象点击重试会再次探测、探测前 `installState` 重置为 `checking`、探测成功后安装页消失并进入首页；另增 1 项探测仍失败时显示新的状态错误且不加载数据（已反向对照：把事件对象转交 `initializeApp` 后 2 项精确失败）；`appInstall` 接线断言增加 App 使用 `boot.retryInstallStatus`、不再直接传 `boot.initializeApp`。首屏 `index-*.js` 280.57 kB → 280.60 kB（gzip 95.72 kB → 95.73 kB），chunk 列表（31 个文件名）不变。

- **`App.svelte` 拆分第 6 步：抽出启动 / 安装 / 找回流程控制器**（代码审查三轮第 12 项）：初次加载、安装探测（`checkInstallStatus` / 本地「装过」标记 / 过期标记复核 `recheckInstallAfterDataError`）、安装提交与「请求失败但已提交」兜底、`enterInstalledApp`、`initializeApp` 的数据加载与首页 / 登录闸门 / 后台分支、本地快照提前揭开首页、找回密码的进入 / 完成 / 前往安装 / 返回，以及启动错误后的「重新检查」移入 `src/lib/appBootController.ts` 的 `createAppBootController(deps)`。与 `appConfirmDialog` 一致用普通闭包而非 store（不新增任何 store 订阅）：控制器持有 `booting` / `installState` / `recoverActive` 与最近一次数据加载异常，每次赋值后经 `onChange` 推送快照，App 只在 `installState` 换了对象时才赋值（Svelte 对对象的同引用赋值也会触发依赖，避免 `booting` 变化连带重跑 `installView` 与 Install 分包加载语句）；与其它用例共享的 `rootError` / `currentView` / `loginModalOpen` 仍归 App，经注入的读写回调在原先完全相同的时机读写；api / 本地存储 / 路径 / 缓存清理 / 认证与数据刷新 / 懒加载全部依赖注入，`import()` 字面量仍留在 App。语句顺序与 await 位置逐条保持，**无行为变化**，包括原有的边界语义：不加「过期响应」防护（并发启动各自跑完、按完成顺序覆盖状态，较早的启动先完成即揭开应用）；安装页「重新检查」按钮直接以 `on:click={initializeApp}` 接线，收到的事件对象按真值处理会跳过安装探测（原样保留，见下）。App.svelte 1280 → 1104 行；首屏 `index-*.js` 279.08 kB → 280.57 kB（gzip 95.17 kB → 95.72 kB，+1.49 kB 主要为依赖注入对象与控制器方法的未压缩属性名，已把可直传的函数改为直传）；chunk 列表（31 个文件名）与除 `index-*.js` 外每个 chunk 的体积均不变。新增 `tests/unit/appBootController.test.ts`（56 项：52 个场景覆盖安装探测各状态 / 无 window / 存储不可用、匿名与登录态加载、401 清会话、服务端错误复核（转安装页 / 已安装 / 探测失败）、网络错误不复核、认证初始化失败、懒加载失败、安装成功 / 已提交兜底 / 失败回到待安装 / 重复提交忽略、重试与事件对象重试、并发启动乱序完成、本地快照揭开、找回各出口；每个场景同时驱动控制器与逐字复刻的原 App 实现，比对依赖调用序列（含每次调用时的完整状态快照）、最终状态与 promise 结果；另 2 项推送序列 / 对象身份，2 项浏览器存储读取；已反向对照：真值判断改为 `=== true`、加入代次防护、调换找回完成 / 进入应用顺序、不清 `lastDataError`、找回重启不重置 `installState`、调换记标记与设会话顺序、去掉 `rootError` 闸门、写死路径、调换推送顺序等 9 种改动均有用例精确失败）；`appInstall` 的接线断言改为检查控制器源码并确认 App 经由控制器启动。另记录一个既有问题（本项不修）：「重新检查安装状态」按钮把 MouseEvent 传给 `initializeApp(installStatusKnown)`，导致重试跳过安装探测、`installState` 不被重置，状态错误后若数据加载恰好成功，安装页会一直留在屏幕上（已由第 13 项修复）。

- **`App.svelte` 拆分第 5 步：懒加载组件注册表**（代码审查三轮第 11 项）：7 个 `let XxxComponent` + 7 段 `createLazyComponentLoader` 样板收进 `src/lib/appLazyComponent.ts` 的 `createLazyComponentRegistry(loaders)`（`components`：每个组件一个只读 store，初值 null、加载成功推送一次；`ensure(name)`：每个组件内部仍由 `createLazyComponentLoader` 负责，并发共享一个 promise、已加载不重载、失败原样抛出并清掉 pending 以便重试）。路径仍以 `() => import('./views/Admin.svelte')` 等**字面量**写在 App 中，注册表只接收函数、不拼路径，Vite 分包不变；模板与两条 `$:` 改读 `$AdminComponent` 等。刻意按组件拆 store 而不是一个汇总对象：`$:` 只依赖自己关心的那个组件，其它组件加载完成不会让「Install / Recover 加载失败」的分支重跑并清掉错误提示，与原先 7 个独立变量的依赖关系一致。**无行为变化**。App.svelte 1321 → 1280 行；首屏 `index-*.js` 278.60 kB → 279.08 kB（gzip 95.03 kB → 95.17 kB，+0.48 kB 为 Svelte store 自动订阅的编译产物与注册表循环）；chunk 列表（31 个文件名）与除 `index-*.js` 外每个 chunk 的体积均与拆分前一致，`index` 中 9 条动态 `import("./…")` 不变。新增 `tests/unit/appLazyComponentRegistry.test.ts`（7 项：不预加载、并发共享 pending 且只推送一次、await 后已可读、加载后不重载不重推、失败传播同一错误对象且 store 保持 null 并可重试、组件间互不影响、store 只读；已反向对照：去掉 store 推送后 5 项精确失败），`firstScreenChunks` 增加 1 项断言 7 个组件都保持字面量 `import()`、无静态导入（已反向对照：加静态导入后精确失败）。

- **`App.svelte` 拆分第 4 步：抽出确认对话框控制器**（代码审查三轮第 10 项）：`requestConfirmation` / `closeConfirmDialog` 的 resolver promise 状态机移入 `src/lib/appConfirmDialog.ts` 的 `createConfirmController(onChange)`（`request(input) → Promise<boolean>`、`close(confirmed)`、`getState()`），与仓库其它控制器一致用普通闭包而非 store，App 只保留 `confirmDialog` 一个模板状态并在 `onChange` 中赋值。单 resolver 语义逐条保持：新请求先以 false 兑现仍待决的旧请求，再登记新 resolver 并同步推送新状态（两者之间不推送 null，被顶替方恢复执行时新确认框已打开）；close 先摘 resolver、推送 null，再兑现，重复 close 不会重复兑现，没有待决请求时也照常推送 null。**无行为变化**。App.svelte 1331 → 1321 行；首屏 `index-*.js` 278.48 kB → 278.60 kB（gzip 94.98 kB → 95.03 kB，+0.12 kB 为控制器对象与 `getState`），chunk 列表（31 个文件名）不变。新增 `tests/unit/appConfirmController.test.ts`（13 项：7 项语义用例，含重叠请求顶替、被顶替方在回调中再次请求、重复 close；6 项与逐字复刻的原 App 实现做差分对照，比对状态推送序列与兑现顺序；已反向对照：交换 close 中推送 null 与兑现的顺序、或在 request 中插入 null 推送后 9 项精确失败）。

- **`App.svelte` 拆分第 3 步：splash 模板去重**（代码审查三轮第 9 项）：启动 / 安装 / 找回加载、未公开站点的登录闸门、后台分包加载三段几乎相同的 splash 模板（各约 30 行 SVG + 文案）合并为 `src/components/AppSplash.svelte`，差异收进 props：`gradientId`（`splash-spinner-grad-boot` / `-login` / `-admin`，保持原 id 与 `stroke` 引用）、`title` / `message`（启动段仍按 `lazyViewError` 切换「页面加载失败」与错误文案）、`loading`（`app-splash-card--loading` 修饰类与 `role="status"` / `aria-live="polite"` / `aria-busy="true"`，登录闸门不带）、`progress`（进度条两侧文案，登录闸门为 null 不渲染）。组件不带 `<style>`，样式仍为 `app.css` 中的全局 `.app-splash*` 规则；渲染的元素、类名、属性与文本与原模板一致，**无行为变化**。App.svelte 1394 → 1331 行；首屏 `index-*.js` 279.49 kB → 278.48 kB（gzip 94.84 kB → 94.98 kB：重复模板原本压缩率高，去重后 gzip 反增 0.14 kB，未压缩体积减少 1.01 kB）。新增 `tests/unit/appSplash.test.ts`（5 项：启动、启动加载失败分支、登录闸门、后台加载四种变体逐一与合并前 App 模板逐字摘录的标记做 DOM 等价比对（不计属性顺序、忽略纯空白文本），以及渐变 id 与 SVG 命名空间；已反向对照：改动 `aria-busy` 输出后登录闸门用例精确失败）。

- **`App.svelte` 拆分第 2 步：抽出系统外观媒体查询**（代码审查三轮第 8 项）：把 onMount / onDestroy 中 `prefers-color-scheme: dark` 的订阅与 `prefers-reduced-motion: reduce` 的读取抽到 `src/lib/appMediaPreferences.ts`（`subscribeSystemDark(onChange) → stop`：挂载时立即以当前值同步回调一次，之后随系统变化回调，stop 移除同一个监听；`readReducedMotion()`：只在挂载时读一次）。没有 `window` / `matchMedia`（SSR、jsdom）时安全降级：读取为 false、订阅不回调并返回空操作的 stop。与原实现一致只用 `addEventListener('change')`（原实现没有旧版 `addListener` 兼容，这里也不加），App 只保留 `stopSystemDark` 一个句柄，**无行为变化**。App.svelte 1401 → 1394 行；首屏 `index-*.js` 279.39 kB → 279.49 kB（gzip 94.84 kB，+0.10 kB 为模块函数包装）。新增 `tests/unit/appMediaPreferences.test.ts`（jsdom + matchMedia 替身，5 项：读取减少动态效果、初值同步回调与跟随变化、stop 移除同一监听且之后不再回调、不调用旧版 `addListener`、无 matchMedia 降级）与 `appMediaPreferencesSsr.test.ts`（node 无 window，1 项）。

- **开始拆分 `App.svelte`：抽出全局快捷键决策**（代码审查三轮第 7 项）：新增拆分计划 `docs/reference/APP_SPLIT_PLAN.md`（职责分组与行号、8 个可独立发布的有序提取步骤；项目已在 Svelte 5 但处于 legacy 模式，runes 迁移列为拆分完成后的独立阶段）。第 1 步把 `handleGlobalKeyDown` 中的按键判定（Ctrl+K / Cmd+K 切换、「/」 打开、Esc 关闭 Spotlight；排除输入框 / 文本域 / contenteditable、IME 组合与 `Process` 键；仅首页可见时生效）抽到纯函数模块 `src/lib/appShortcuts.ts`（`resolveGlobalShortcut` / `isTypingTarget`），App 只负责 `preventDefault` 与打开 / 关闭，模态互斥仍由 `openSpotlight` 把关，**无行为变化**。App.svelte 1415 → 1401 行；首屏 `index-*.js` 279.23 kB → 279.39 kB（gzip 94.85 kB，+0.16 kB 为新增导出函数与动作字面量）。新增 `tests/unit/appShortcuts.test.ts`（8 项）。

- **引入 ESLint 与 `.editorconfig`**（代码审查三轮第 6 项）：新增 `eslint.config.js`（ESLint 9 flat config；`@eslint/js` + `typescript-eslint` 8 非 type-aware + `eslint-plugin-svelte` 3 的 recommended；选 ESLint 9 而非 10 是因为 10 要求 Node 22.13+，与 `engines` 的 22.12 下限不符），覆盖 `worker/`、`src/`、`shared/`、`tests/`、`scripts/`（Node 全局）与 `public/sw.js`，`npm run lint`（`--max-warnings 0`）并在 CI 的 Type check 之前新增 Lint 步骤。为免大面积改动关闭 / 收窄的规则（原因写在配置注释）：`svelte/infinite-reactive-loop`（38 处启发式误报）、`svelte/prefer-svelte-reactivity`（15 处）、`svelte/require-each-key`（9 处，补 key 会改变 DOM 复用，属行为变化）、`tests/` 的 `no-explicit-any`（约 100 处测试替身）、`scripts/` 的 `no-unsafe-finally` / `no-debugger`（清理失败须抛出、CDP 暂停点）、TS 文件的 `no-undef`；`no-unused-vars` 与 tsconfig 同用 `_` 前缀约定，`no-empty-object-type` 放行单一 extends 的具名接口；Svelte recommended 规则收窄到 `.svelte` / `.svelte.{ts,js}`（其 `no-inner-declarations` 在 CommonJS 脚本上会崩溃）。按现有代码修复的问题（均无行为变化）：`buildHomeBackground` 中 `Number(mask) ?? 0.3` 的 `??` 永远不生效（`Number()` 不返回 null/undefined；`mask` 已在读写两端归一为数字），删去死代码；`worker/lib/jwt.ts` 5 处 `as any` 改为准确类型（`decodeBase64url` 返回 `Uint8Array<ArrayBuffer>`）；`sortableList` 的 `@ts-ignore` 改为 `@ts-expect-error`；`errorMonitor` 的 `_batch` 改 `const`；`iconData` 两处正则里的字面 BOM 改为 `\uFEFF` 转义；两个设置组件中依赖为常量的 `$:` 改为 `const`；`Home.svelte` 无插值的模板字符串 style 改为普通属性；`scripts/` 中未使用的变量 / 导入 / catch 绑定与一个未用的页面内 `click` 辅助函数删除（保留原有请求副作用）、空 catch 补注释、页面注入全局以 `/* global */` 声明；测试中 `/^  x/` 改为 `/^ {2}x/`。有意的控制字符正则与 `{@html}` 页脚逐行 `eslint-disable` 并注明原因。新增 `.editorconfig`（UTF-8、LF、2 空格、末尾换行；Markdown 不裁行尾空格；只描述现有风格，不重排文件，不引入 Prettier）。CONTRIBUTING 第 4 节同步。

- **错误码约定成文**（代码审查三轮第 5 项）：审计 `worker/` 全部路由与中间件的失败响应，以及前端 `src/lib/api.ts` `request()` 与浏览器扩展的判错方式。结论：项目约定是业务错误走 HTTP 200 + 包络 `code`（`badRequest` → 200 / `1002` 属有意为之，前端与扩展均按 `code !== 0` 判错），真实 HTTP 状态只用于鉴权 401、跨域 403 与少数需要 HTTP 语义的端点（点击计数 400/404/500、错误上报 400/413/429、Iconify 搜索 400/502、图标可信副本 400/403/404/409/503），其中 `objectIconLoader` 依赖图标副本的真实状态、扩展依赖 401，均不能改；审计未发现与约定相悖的路由，**无行为变更**。API_CONTRACT 新增「错误码与 HTTP 状态约定」节（helper / 位置 → HTTP 状态 → code → 何时使用），并修正鉴权小节中 not found 旧码的笔误（`1004` → `1003`）；`badRequest` / `serverError` / `ErrCode` 注释同步。新增 `tests/unit/errorConvention.test.ts`（9 项：`badRequest` / `serverError` / `authRequired` / 全局 `onError` 的状态与 code、`ErrCode` 数值快照、`worker/` 中全部显式非 200 `fail()` 响应的 20 条快照、前端 `ApiError` 对两种错误形态的 `status` / `code`）。

- **`tests/` 纳入类型检查**（代码审查三轮第 4 项）：新增 `tsconfig.tests.json`（继承主配置的 `strict` / `noUnused*`，加载 `@types/node`；测试导入的 `scripts/lib/*.mjs` 只参与推断、`checkJs: false`）与 `npm run type-check:tests`，并串入 `npm run type-check`，CI 的 Type check 步骤随之覆盖。新增开发依赖 `@types/node@^24`（对齐 CI 的 Node 24）与 `@types/jsdom@^21`（对应 jsdom 26）。`tests/` 下全部 200 个 `.ts`（198 个测试文件 + 2 个 helper）纳入、无排除；在此配置下原有 120 个错误 / 37 个测试文件（另有 `src/lib/publicDataFocusRefresh.ts` 2 处在 Node 计时器类型下的 `clearTimeout(null)`，改为 `timer ?? undefined`，行为不变）全部按真实类型修复：测试替身补齐 `Settings` / `PublicCategory` / `PublicBookmark` / `BookmarkFormValue` 等新增必填字段，`vi.fn` 改用函数签名泛型 / `Mock<…>`，闭包内赋值的变量改用 `null as T | null` 避免被收窄为 `null`，JS 推断不出的探针返回形状以测试内局部类型标注；与 workers-types 的 `Element` 合并冲突改用 `appendChild` 与 `Element` 形参，少量测试替身经 `unknown` 定向转换并注明原因，未使用 `any` / `@ts-ignore`。测试行为不变。（2026-10-13 评估的 663 个错误 / 75 个文件含 `scripts/lib/*.mjs` 经 `checkJs` 报出的错误，`scripts/` 仍不在本项范围。）CONTRIBUTING 第 4 节同步。

- **全新安装 `/install` 失败（v0.8.0 起）**（代码审查三轮第 3 项）：v0.8.0 在 `schema.sql` 中加入 6 个 `CREATE TRIGGER … BEGIN … END` 触发器，而安装器的 `splitSqlStatements` 只按分号切分，把每个触发器切成不完整的语句与孤立的 `END`，D1 batch 编译失败（`incomplete input`）整批回滚，全新 D1 库经引导安装器初始化必然失败（v0.8.0–v0.8.3 均受影响；已部署库与手动 `db:init` 不受影响）。现切分器识别 `CREATE [TEMP] TRIGGER` 的触发器体，与 `BEGIN` 配对的 `END`（含体内 `CASE … END`）之后的分号才结束语句，关键字不区分大小写、只认完整单词，字符串 / 引号标识符与 `--`、`/* */` 注释中的分号照旧忽略。新增 `tests/unit/installSchemaSplit.test.ts`（4 项：真实 `schema.sql` 切出 6 条完整触发器、大小写 / 字符串 / 注释 / 引号标识符 / `CASE … END` 边界、含 begin/end 的标识符不误判、真实 SQLite 上以完整 `schema.sql` 跑安装器且 6 个触发器存在并实际触发），`schemaVersioning` 的安装器用例改喂完整 `schema.sql` 并断言安装 batch 自带 6 条完整触发器；已反向对照（还原旧切分器后 5 项精确失败）。

- **schema 迁移版本化**（代码审查三轮第 2 项）：原 `ensureSchema` / `migrateSchema` 在每个 isolate 冷启动的首个写请求上都要 `PRAGMA table_info` 两张表并执行一整批 `CREATE … IF NOT EXISTS`（索引、`click_rate_limits`、6 个触发器）。现改为 `worker/lib/db/schema.ts` 的有序幂等步骤 `SCHEMA_STEPS`（1：旧版缺列与排序索引；2：图标版本列、数据集代次与触发器；3：`click_rate_limits`），库内版本号记在 `settings` 内部键 `schema_version`。每个 isolate 每个 D1 绑定只运行一次（模块级 promise，并发首请求共用）：版本已最新时只读一行、不执行任何 DDL；否则按序执行缺失步骤，每步 DDL 与版本写入同一 D1 batch，失败整步回滚、版本不前进、不缓存失败，下个请求重试。版本写入为单调 upsert（只升不降，回滚部署的旧代码不会降级）；多 isolate 并发加列撞上「duplicate column / already exists」时重算该步重试一次。没有版本行的已部署库（含 v0.8.3）按版本 0 自动升级；未安装库（无 `settings` 表）跳过且不缓存；`/install` 建表后立即以修复模式跑一遍并记录最新版本（不在 `schema.sql` 写死版本，避免对残留旧表的库误记最新）。`withSchemaRetry` 缺列重试改为修复模式（忽略版本号、幂等重跑全部步骤）。各路由的 `ensureSchema` 调用保留（读路径仍按设计不预检，未被全局覆盖），首次之后为已完成的 promise。新增 `tests/unit/schemaVersioning.test.ts`（12 项，真实 SQLite：安装器全新安装 / `schema.sql` 全新库记最新版本且无 ALTER、v0.8.3 无版本行升级、更早结构逐步升级且保留数据、幂等重跑、版本最新时仅一条 SELECT 且同 isolate 零语句、同 isolate 并发共用一次、跨 isolate 并发迁移、不降级更高版本、第 2 步中途失败不升版本且整步回滚后可重试、未安装不缓存），更新 `categorySchemaMigration` 与 `install` 测试替身；API_CONTRACT / PROJECT_OVERVIEW 已同步。另发现既有问题：安装器 `splitSqlStatements` 按分号切分、不识别 `CREATE TRIGGER … BEGIN … END`，`schema.sql` 中 6 个触发器会被切成不完整语句（已由第 3 项修复）。

- **install / recover 的 catch 留痕**（代码审查三轮第 1 项）：逐一复核 `worker/routes/install.ts`（13 处）与 `recover.ts`（8 处）的 catch。17 处非预期失败（D1 / KV 探测、读安装状态、限流读写、建 schema / 写凭据、改密写入、会话创建、失败后的状态复查与 claim 清理）改为 `console.error('[install|recover] <上下文>:', error)`，响应体与状态码不变；只记录原始错误对象，不记录密码、setup token 或请求正文。4 处预期分支保持不记日志并补注释：请求体非法 JSON（2 处），`recoverStaleInstallClaim` / `getInstallationState` 缺表即未安装、其余错误抛给路由 catch 记录（2 处）；`/recover` 缺表按 not installed 的原有注释保留。`install.test.ts` 新增 4 项、`recover.test.ts` 新增 3 项（spy `console.error` 断言日志与响应不变、日志不含密码 / token，预期分支不记日志），已反向对照（还原源码后 5 项日志断言精确失败）。
- **路由 1500 错误留痕**（代码审查二轮第 7 项，全分支审计）：新增 `serverError(c, msg, error)`（`worker/lib/routeHelpers.ts`），`admin` / `auth` / `bookmarks` / `browserSync` / `categories` / `data` / `public` / `settings` 共 21 处 catch 改为先 `console.error('[api] <msg>:', error)` 再返回通用 `code=1500`，客户端报 1500 时 Workers 日志不再为空；响应体不含原始错误。顺带清理改造后未用的 `ErrCode` / `fail` import，并修正 API_CONTRACT 中 `/api/config` 缓存行为的描述。新增 `serverError.test.ts` 3 项（含真实路由 D1 失败断言日志）。`install` / `recover` 的 catch 维持原状（多为预期分支，需单独评估）。
- **静默吞错逐处处理**（代码审查二轮第 6 项）：逐一复核 `src/` 与 `worker/` 的 `.catch(() => undefined)` 及同类静默 catch（共 18 处）。改为留痕或上报：① 排序保存失败后的回滚 `restoreOnError()` 再失败 → `console.warn`（保存错误仍是唯一上报给 `onError` 的错误）；② `refreshBookmarkIconCacheInBackground` 后台补图失败 → `console.warn`（含书签 id）；③ `objectIconLoader` 在 401/403/404 后删除本机副本失败 → 走 `device.reportStorageError`（与 put 失败同路径，`stale` 仍忽略），失去授权的副本删不掉不再无声；④ 存入后的统计刷新失败 → `console.warn`；⑤ Worker 边缘缓存写入 / 失效失败 → `console.warn('[edge-cache] …')`，有无 `ExecutionContext` 都记录（此前有 ctx 时交给运行时、无 ctx 时直接吞掉）。其余 13 处为有意忽略，逐处补注释说明原因：排序队列 / 清理队列只串行化（旧失败已由各自调用方处理）、IndexedDB 事务拒绝的观察与 abort 回声、打开失败的连接不缓存 / 关闭时无句柄（4 处）、内联正文校验失败改走网络、响应体 `cancel()` 失败（4 处）、错误上报读正文失败按空正文 400，`errorMonitor` 的上报传输失败原有注释保留。新增 `edgeCacheBestEffort`（2 项）、`appSortQueue` / `dataService` 各 1 项、`objectIconLoader` 2 项，已反向对照（还原源码后 6 项精确失败）。
- **单元测试提速**（代码审查二轮第 5 项）：`vite.config.ts` 按文件首行的 `// @vitest-environment jsdom` 把测试拆成 `node` / `jsdom` 两个 Vitest project；jsdom 组件测试改走 `vmForks`（同一 worker 复用已加载的 jsdom，每个文件仍在全新 VM 上下文求值），纯逻辑测试留在 `forks`（`vmForks` 下 `node:sqlite` 等跨 realm 对象会让 `instanceof` 失真）；`maxWorkers` 至少 2（默认「核数 − 1」在双核 CI 上只有 1 个）。`iconAccessKeyLifecycle`、`searchBoxVisibility` 不依赖 DOM，去掉 jsdom docblock 改在 node 里跑。双核本机全量 `npm test` **140.5s（environment 58.6s）→ 44.4s / 59.0s 两轮（environment 3.7s / 7.0s）**，测试文件与用例数不变（194 / 2222，逐文件核对每个文件只跑一次：node 152、jsdom 42）；CI 仍只调 `npm test`，无需改动。CONTRIBUTING 第 4 节记录分组约定与 `vmForks` 注意事项；评估把 `tests/` / `scripts/` 纳入类型检查（独立 tsconfig 实测 663 个错误 / 75 个文件，且未依赖 `@types/node`），改动面过大，本项不纳入，理由与后续做法记入 CONTRIBUTING。
- **首屏 JS 瘦身**（代码审查二轮第 4 项）：`npm run build` 实测首屏 `index-*.js` **312.88 kB（gzip 104.94 kB）→ 279.01 kB（gzip 94.73 kB）**，首屏 CSS **99.19 kB（gzip 16.67 kB）→ 82.14 kB（gzip 13.99 kB）**。① `Install` / `Recover` 视图改为按需加载（`createLazyComponentLoader`，加载期间沿用启动 splash，chunk 加载失败时 splash 显示「页面加载失败」并 `console.warn`，不再无限转圈）；② 书签右键 / 长按菜单 `BookmarkContextMenu`（连带 `CategoryTreeSelect`）改为首次打开时加载（`src/lib/lazyBookmarkContextMenu.ts`，所有卡片共用一个加载 promise；只有能打开菜单的卡片才在空闲时预取，加载失败时关闭菜单并告警）；③ 首页背景 / 卡片配色只需要预设的 9 个颜色字段，新增 `src/lib/themePresetRender.ts` 承载，完整 `themePresets.ts`（名称、描述、渐变，约 17 kB）仅随设置 chunk 加载，`tests/unit/themePresetRender.test.ts` 逐项比对两份数据防漂移。已知降级：从未在线加载过的菜单 / 安装 / 找回 chunk 离线时不可用（与后台视图相同；`/assets/*` 首次在线请求后由 Service Worker cache-first 缓存）。新增 `lazyBookmarkContextMenu`（3 项，含真实 BookmarkCard 打开菜单）、`themePresetRender`（2 项）、`firstScreenChunks`（2 项接线断言）；PERFORMANCE_CONTRACT 记录拆分约束与前后体积（文档此前未列 chunk 预算）。
- **可信图标统计广播降为 O(1)**（代码审查二轮第 3 项）：每存入一个可信副本，`objectIconLoader` 都会 `refreshStats()`，它读一次 `storage.state()` 并把统计写进 `iconDevice` 主快照，而主快照的每次更新都会广播给所有图标视图（每张卡片一个 `createTrustedIconView` 订阅者），每个视图再用包含 `icon` / `icon_blob`（可达数百 KB 的 base64）的 `JSON.stringify` 重算签名：N 个图标即 O(N²) 次大字符串序列化与 N 次存储扫描。现统计改为独立 store `iconDevice.stats`（仅设备面板订阅，`statsSnapshot()` 读取），值不变不广播；`refreshStats()` 在 `ICON_STATS_REFRESH_DEBOUNCE_MS`（250ms）窗口内合并为一次存储读取，所有调用者等同一结果，`dispose` 时结清挂起的调用；视图签名不再序列化 `icon` / `icon_blob`，二者单独按值比较。新增 `iconDeviceState` 3 项（独立广播、突发合并、清理与释放）与 `trustedIconView` 1 项（大正文不进签名但变化仍重新评估，已反向对照），同步更新两处测试替身；PERFORMANCE_CONTRACT 已同步。
- **图标显示状态与书签结构数据分离**（代码审查二轮第 2 项，P0 性能）：可信设备模式下每加载完一个图标，`dataService` 的描述符回写都会重建整个 `bookmarks` 数组（`adminStore` + `publicStore`），使首页 `homeData` 的排序 / 分组 / 搜索索引 memo 全部失效、所有分区重渲染，并触发 App 依赖整个 `publicData` 的全局样式块重写自定义 CSS；N 个图标即 N 次 O(N) 重建。现书签图标描述符只写入按 id 索引的独立表 `src/lib/iconDisplayStore.ts`（`bookmarkIconDisplay`，每个 id 一个稳定 store，更新只通知该 id 的订阅者），由 `BookmarkCard` / `SpotlightBookmarkIcon` / `CachedBookmarkIcon` 订阅并合并（`applyIconDisplayOverride`，与原补丁同一 write_epoch 栅栏与 `empty` 清空语义）；持久化后台快照时再把覆盖合并回行；结构数据替换时按数据集 / 删除 / 更新写入清理过期覆盖，登录身份变化时清空。App 的主题背景变量与自定义 CSS 拆成两条只依赖各自原始值的响应式写入，经 `src/lib/rootStyleWriter.ts` 按内容去重，点击计数、书签增删等无关变化不再重写 `<style id="custom-css-inject">`。分类图标数量少，仍走原数组补丁路径。新增 `iconDisplayStore`（5 项）、`rootStyleWriter`（3 项）测试，`dataService` 增 5 项（图标更新不改变 store 与 homeData memo 身份、仅通知对应 id、栅栏规则、快照合并、过期清理），`bookmarkIconRecovery` 增 2 项组件用例（卡片消费按 id 状态，已做反向对照）；PERFORMANCE_CONTRACT 已同步。
- **其余出网请求补 SSRF 重定向防护**（代码审查二轮第 1 项）：ee657d7 只修了 `fetchIcon`，`fetch-site-meta` / `fetch-favicon` 的页面抓取（`fetchPageHtml`）、manifest 抓取（`fetchManifestJson`）、favicon 候选 HEAD/GET 探测（`fetchWithTimeout`）与 `POST /api/bookmarks/check-health` 仍 `redirect: 'follow'`，公网地址 302 到内网 / 元数据地址即可绕过入口检查。现把手动跟随逻辑抽成共享助手 `fetchFollowingSafeRedirects`（`worker/lib/pageMetadata.ts`：入口与每跳 `Location` 经 `parseTargetUrl` 过滤、最多 5 跳、303 下 GET/HEAD 保持、剥离内嵌凭据，被拒抛 `BlockedFetchTargetError`），`fetchIcon` 与上述调用方全部改用它；`fetchPageHtml` 的 `finalUrl` 改为助手跟踪的真实落点（手动跟随下 `response.url` 不可靠）。健康检查对内部地址不发请求，返回新状态值 `blocked`（API_CONTRACT 已同步），并在只取状态码后取消响应体释放连接。新增 `tests/unit/outboundRedirects.test.ts`（13 项）。
- **后端小修**（代码审查第 5 项）：
  - `fetchIcon`（图标代理 / 显式刷新 / 可信副本 / Iconify）补 SSRF 防护：入口复用 `parseTargetUrl`（`isBlockedFetchHostname`），重定向改为手动跟随、每跳重新过滤、最多 5 跳，并剥离 URL 内嵌凭据。
  - 管理员凭据引导 `ensureAdminBootstrap` 的多次并发 `setSettingValue` 改为一条多行 upsert（新增 `setSettingValues`），各键同时生效。
  - 改密码 / `/recover`：新密码与轮换后的 JWT 密钥同一条语句写入（`rotateJwtSecret(db, alsoWrite)`），写入失败两者都不变。
  - `GET /api/bookmarks` 不再读取 `icon_blob` 正文（`icon_blob: null` + `icon_cached`，与聚合一致）；合并导入改用 `listBookmarksWithIconBlobs`，保证重建表时已缓存图标不丢。批量删除分块 `IN (...)` 已随第 1 项落地。
  - 删除死代码：`PUBLIC_DATA_SETTINGS_WITHOUT_SITE_CONFIG_LIST_SQL`、无调用方的 `getDataVersion`、`tslib` 直接开发依赖（仅作为 `@emnapi/runtime` 的可选传递依赖保留在锁文件中；锁文件根版本号顺带同步为 0.8.3）。`getPublicDataSource` 的 `_siteConfig` 形参已随第 2 项删除。`click_count` 仍保留在公开数据中（REQ-17 依赖）。
  - 新增 `tests/unit/backendHardening.test.ts`（9 项）及 bootstrap / recover 原子写入用例。
- **路由鉴权按构造保证**（代码审查第 4 项）：`worker/index.ts` 原先每个受保护前缀都要手写「精确路径 + 通配路径」两行 `authRequired`，注释也承认漏一行接口就静默公开。现拆为公开子应用 `publicApi`（唯一公开清单，只允许直接返回的处理器与调用 `next()` 的透传中间件）与 `use('*', authRequired)` 的受保护子应用 `protectedApi`，后者在全部公开处理器之后挂载：新增接口默认受保护、漏注册方向变为 fail-closed。`auth.ts` 拆出 `authPublicRoutes` / `authProtectedRoutes`，`icon.ts` 拆出 `iconProtectedRoutes`（`/icon-access`、`/iconify-search`），`iconLocalCopy` 的 no-store 头中间件与 browser-sync CORS 在鉴权前执行（401 同样带头）；`authRequired` 改为请求内幂等，保留的逐路由守卫不再重复校验。未登录访问未知 `/api/*` 路径现返回 401 而非 not found。新增 `tests/unit/routeAuth.test.ts`（7 项：枚举全部受保护路由无 token / 伪造 token 均 401、公开路由快照、透传头），删除 `siteMetaRouteWiring` 中 3 条针对旧注册方式的源码文本断言。
- **点击计数限流改用 D1**（代码审查第 3 项）：原实现每次点击 KV get + put，KV 免费额度每天 1000 次写入，用完即整体 fail-open。现限流与计数放进同一个 D1 batch（一次往返），新表 `click_rate_limits`（`schema.sql` 新增；旧库由 `migrateSchema` 幂等补建，缺表时 `withSchemaRetry` 自动迁移）：只为存在且公开的书签建计数行、计数在上限 +1 处饱和（超限点击 0 写入）、过期行按 `reset_at` 索引清理；语义保持每 IP + 书签 10 分钟 3 次、超限仍返回成功。限流 batch 失败时退回单条计数。点击接口不再依赖 `SESSION` 绑定。新增 `tests/unit/clickRateLimit.test.ts`（6 项）。
- **公开数据 edge cache 按版本生效**（代码审查第 2 项）：前端匿名请求一律带 no-cache、服务端见 no-cache 就绕过 edge cache，Cache API 路径实际上是死的，任何人都能用请求头强制读 D1。现在匿名请求忽略 no-cache；前端在确认远端版本后请求 `/api/public/data?v=<data_version>`，服务端按 `v` 建键缓存，过期或伪造的 `v` 只花一条单行版本查询并以当前版本缓存副本（`no-store`）回应，绝不把内容写进不匹配的版本键；无版本旧客户端照常可用。删除从未被命中的后台 3 秒运行时聚合缓存（`worker/lib/runtimeCache.ts`）；`/api/public/data` 处理器拆成「带 token / 匿名」两条清晰路径，去掉 `getPublicDataSource` 无用的 `_siteConfig` 形参；`cache.ts` 的 `waitUntil` 在无 ExecutionContext 时不再抛错。新增 `tests/unit/publicDataEdgeCache.test.ts`（9 项）与 `dataService` 版本化请求用例，API_CONTRACT / PERFORMANCE_CONTRACT 已同步。
- **写操作统一提交，data_version 与业务写入同事务**（代码审查第 1 项）：新增 `worker/lib/db/mutation.ts`（`Mutation` / `commitMutation`），分类、书签、排序、整理、批量移动/删除、设置、导入、浏览器同步的业务写入与 `data_version` 提升放进同一个 D1 batch，取代各路由约 15 处「写入后再单独 `touchDataVersion` + 两次失效」的重复代码；路由统一经 `worker/lib/mutationResponse.ts` 的 `mutationJson` 收尾（按收据失效缓存）。修复：两步之间失败会留下「数据已变、版本未变」；改图标时触发器与路由先后两次对外提升版本（现折叠为同事务内一次，响应版本即库中版本）；显式图标刷新（`POST /api/bookmarks/:id/icon-cache/refresh`）改变图标身份时漏提升版本；404 / 集合全部不存在时不再白白提升版本、打穿缓存。浏览器同步改为单 batch 写入（原逐条往返），开启同步时创建同步分类与设置写入同 batch。写响应包络新增附加字段 `data_version`（见 API_CONTRACT），`data` 形状不变。新增 `tests/unit/mutationCommit.test.ts`（13 项，真实 SQLite：同事务回滚、守卫不提升、触发器折叠、分块删除、显式/匿名图标刷新差异、设置回读、响应字段与失效），并更新受影响的 mock 测试。
- **JWT 签名密钥跨 isolate 失效**（代码审查 P0）：`worker/lib/jwt.ts` 的密钥内存缓存原先永不过期，改密码 / 凭据重置 / `/recover` 触发的 `rotateJwtSecret` 只更新当前 isolate，其它 isolate 会一直接受旧 token、并对新 token 随机返回 401。现缓存 TTL 为 `JWT_SECRET_CACHE_TTL_MS`（15 秒，与 session 内存缓存对齐）；会话校验与图标访问授权在校验失败时经 `refreshJwtSecretAfterVerifyFailure` 按需重读一次 D1（同一 isolate 至少间隔 1 秒，防止伪造 token 放大 D1 读）。新增 4 项单测覆盖 TTL 过期、跨 isolate 轮换、失败重读与限频。

## v0.8.3 — 2026-10-12

- **后台高级颜色选择器**：`ColorAlphaInput` 改为紧凑输入框 + 棋盘格预览 + 浮动 HSV 面板，支持色相、饱和度/明度、透明度拖拽与键盘调节，点击外部或 Escape 关闭；保留原有 `value` / `alpha` 双绑定语义，并支持 `rgba(...)`、三位/六位/八位 Hex 手动输入与反向联动。

## v0.8.2 — 2026-10-12

> Issue #31 第 1、2 点（界面元素自定义 / 一级分类高频标签）。develop 实现、独立复核并部署测试站，真实浏览器 L2 验证通过；用 `refs #31` 不触发关闭（多点 OPEN issue，第 3 点已于 v0.8.1 处理），关闭留待部署验证后手动执行。配套需求/开发文档见 `docs/plans/ISSUE_31_*`。

### 新增

- **分类标题颜色自定义**（REQ-16）：设置「高级与视觉 → 分类标题字体与图标」新增「一级 / 二级分类标题颜色」两项，并入 `category_display`（随现有公开设置链路流转，复用 `ColorAlphaInput`、支持透明度）。非空时首页一级标题、二级 tab、全页搜索分组标题按层级着色，空值跟随主题（`--home-text-color`）；设置实时预览补二级样本以显示层级差异。服务端沿用现有颜色字段的字符串 + 长度校验（`CATEGORY_TITLE_COLOR_MAX=32`、trim、非字符串回退空串）。
- **一级分类聚合二级高频书签**（REQ-17）：一级分类自身无直属书签、只有二级分类有书签时，「本分类」区展示其整个子树的「常用」书签（`getCategoryHotBookmarks`：`click_count` 优先、固定上限 `CATEGORY_HOT_LIMIT` 封顶（与全局 `most_visited_count` 解耦）、低点击按 `sort` 回填保证子树非空即非空），卡片标注来源二级分类名。修复此前空一级在「排序第一个子分类恰为空」时整块显示空态、忽略其它子分类书签的问题。隐私口径：剔除私密书签（`is_private`），与公开「经常访问」一致；**不再按匿名公开可见集（`publicCategoryIds`）过滤**——入参 `allCategoryBookmarks` 已按当前视图过滤（匿名由后端剔除私密分类及整棵子树，管理员为全量），再套用匿名可见集会把管理员正在查看的**私密一级分类**旗下公开子分类书签整体丢弃，导致空私密一级聚合区为空（Issue #31 复核修复，推翻 OQ-17.6 原裁定）。其它设备刷新后生效，不轮询、不改缓存与 `data_version`。

### 修复与调整

- **点击计数即时持久化（Issue #31 第 1 点后续）**：点击书签后把乐观 `click_count + 1` 写回「当前版本」的本地快照（登录态写后台快照、匿名写公开快照），不再只存内存。此前点击刻意不提升 `data_version`，刷新 / 焦点恢复会用旧快照覆盖内存值、同版本门控又不重拉，表现为「刷新多次都不更新，直到进后台『访问分析』强制重拉才生效」；现本设备刷新即保持最新计数。点击仍不提升 `data_version`、不改缓存语义。点击登记收敛到 `dataService.recordBookmarkClick`（`BookmarkCard` / `SearchSpotlight` 共用）。
- **分类聚合数量与全局解耦（Issue #31 第 2 点后续）**：首页一级分类「常用」聚合区的显示条数改用固定常量 `CATEGORY_HOT_LIMIT`（`src/lib/homeData.ts`，当前 12），不再继承全局「经常访问」`most_visited_count`。因此全局数量设为 0 时分类聚合区照常显示；回填逻辑不变（热门不足时按 `sort` 补足）。如需管理员可调可后续升级为独立设置。该上限使「空一级 + 有子分类」各多渲染至多 4 张卡片/图标，`perf:audit` 图标请求预算（`PERF_MAX_ICON_REQUESTS`）相应由 260 上调到 270（实测全流程 ~262）。

## v0.8.1 — 2026-10-11

> Issue #31 第3点（150+ 书签首页滚动卡顿 / 图标请求性能）。develop 提交 `7958b68`、`3be922c`、`adf9953`、`5db771b`，已部署测试站并完成生产只读验证。Issue #31 为多点 OPEN issue（第 1、2 点 UI 自定义 / 二级分类高频标签不在本轮范围），用 `refs #31` 不触发关闭，关闭留待部署验证后手动执行。

### 新增

- 普通对象图标**有界并发调度器**（`src/lib/ordinaryIconScheduler.ts`，`7958b68`）：同源 `/api/icon/` 普通对象代理 fetch 改经一个有界、可释放的内存调度器，生产默认并发 **4**；按完整 URL 合并在途请求、可见优先于预加载、引用计数释放（排队中取消 / 运行中中止）。保留公开完成图标短期复用、私密 `key` 隔离、10 秒传输期限（仅在真正取得槽位后起算）与各调用方独立 object URL；可信设备副本、外部直连 `<img>`、分类与 Iconify 路径不变。并发值 4 由本地受控实验裁定（home355 夹具、CDP 150ms/1.6Mbps、N∈{4,6,8,200}×3 轮）：N=4 冷首屏就绪中位最低（p50 1979ms，对比 6/8 的 2141/2813ms）、卡顿最低、0 破图 / 0 失败。
- 本地图标性能验证工具与计划文档（`5db771b`）：只读探针（分阶段 CDP 时间线、首屏就绪 / 长任务 / 帧间隔、`X-Icon-Fallback` 响应头分类）、隔离本地 150/355/583 规模夹具、N=4/6/8/200 限速对照实验，以及 `docs/plans/ICON_REQUEST_PERFORMANCE_*.md` 决策记录。

### 修复

- **首页滚动卡顿 / 图标并发突发**（Issue #31 第3点）：修复前完整滚动时普通 `/api/icon` 同时在途达桌面 **212** / 窄屏 **111**，冷首屏就绪中位 3276 / 3654ms。有界调度落地后生产实测同时在途降到 **4 / 4**，桌面冷首屏就绪 p50 **3276→2506ms**、窄屏 **3654→3257ms**，滚动帧间隔峰值 **1020→750ms**；`npm run accept:prod` **40/40**，控制台 / 页面异常 / 失败请求 / 写入均为 0。
- **C-5 性能门 `/api/icon` 超额**（`3be922c`）：曾观察到总数 264（>260）。经本地同夹具 N=4 vs N=200 字节级对照证明与有界调度无关，根因是先加载的首屏公开图标被 64 项短期复用上限挤出、跨阶段 remount（搜索清空 / 后台视图）时重取（数据漂移下的既有问题）。将 `MAX_TRANSIENT_OBJECT_ICONS` 由 **64 提到 512**（TTL 仍 30 秒，仅公开 URL `isPublicObjectIconUrl` 门控、私密 `key` URL 永不进入），覆盖整页公开图标集。修复后部署站 `npm run perf:audit` 连跑 2 次 **10/10 通过**，`/api/icon` 稳定 **255 ≤ 260**（阈值未放宽、未设 allow-failures），355 卡片、0 破图、管理数据约 49KB、Cache Storage 约 0.66MiB。

### 决策与限制

- 条件性失败冷却（计划 IP-P3）：**不实施**。真实只读探针（读 CDP 响应头 `X-Icon-Fallback` 脱敏布尔、按对象哈希聚合）在测试站桌面 / 窄屏各 3 轮全阶段测得 `fallback_200`=0、同对象短窗重复回退=0、头解析正控 6/6、可重试失败类别全 0；无实测冷却触发器，不留未接入代码。此为证据门控判断——探针只观测响应头、不读响应体，空 body 200 的绝对不存在未作实测证明。
- 残余：生产 `/api/icon` 仍有约 9 条精确重复，主要来自后台书签表原生 `<img>`（走 Cache Storage、不经本调度 / 复用路径），仍在 255 ≤ 260 预算内；进一步降低列为可选后续项。本轮不改并发协议、缓存头、`key` 身份、可信设备链路或回退语义；冷启动主线程卡顿与各阶段瞬时峰值（cold_home 短时可达 8）未全部消除，仅 full_scroll 的 212 / 111 突发被 N=4 消除。

## v0.8.0 — 2026-10-11

> 用户向摘要见 [v0.8.0 发布说明](docs/V0.8.0_RELEASE_NOTES.md)。本节保留实现细节、验证证据和限制。

### 2026-10-11 发布关键门复核（修复前快照）

- 测试站当前 bundle 为 `assets/index-D3qg2Jno.js`。`npm run accept:prod` 在独立临时 Chrome 中 **40/40** 通过：首访/二访、Service Worker 预缓存、离线壳、匿名边界、只读导出、桌面/390px 弹窗、三档视口、登出撤销均通过；控制台错误、页面异常、非预期 HTTP/网络错误为 0，临时 target、浏览器和 profile 清理成功。
- `npm run perf:audit` 连续两次得到相同门禁结果：9 项通过、图标请求 **265 次（门槛 260，失败）**；355 张首页卡片、0 破图、本站失败请求 0、管理数据约 49 KiB、Cache Storage 约 0.64 MiB。该结果不能记为性能门通过，也不能用放宽环境变量阈值替代原因处理。
- 使用 Cloudflare API 将活动流量从 Worker 版本 390 切到 389，再恢复 390；两版入口均返回同一 `assets/index-D3qg2Jno.js`。切换与恢复均成功，但这是重复 bundle，不能作为 IC-A07 的跨构建升级、旧/新标签并存或回滚证据。恢复后活动版本为 390。
- 进一步切到 2026-10-05 的不同 Worker 版本，入口为 `assets/index-0F5Y0F5E.js`；该版本的性能审计仍为 9/10，图标请求同样是 265。随后恢复 390。两套构建都复现同一超额，当前证据不足以把它归因为本轮最近修复，也不足以放宽 260 门槛。
- 当时发布阻塞保持：需要真正不同 bundle 的两次授权部署，另需解释或修复 265 次图标请求后再重新跑性能门；该快照不代表后续闭环结果。

### 2026-10-11 性能门与 IC-A07 技术阻塞闭环

- 性能修复：对象图标的公开 URL 在同一页面的“经常访问”和分类卡片之间增加短 TTL、有界的内存复用；私密 `key` URL 不进入该缓存，普通持久副本路径和 Cache Storage 契约不变。审计器增加脱敏的路径/重复请求摘要，便于区分真实对象和重复取数。
- 候选 bundle `assets/index-2Fm4qXqU.js` 部署后，`npm run perf:audit` **10/10** 通过：图标请求 **259 ≤ 260**、355 张卡片、0 破图、本站失败请求 0、Cache Storage 约 0.65 MiB、管理数据约 49 KiB。随后 `npm run accept:prod` **40/40** 通过；Cloudflare RUM 的 `/cdn-cgi/rum` 204 遥测不再被误判为业务写入，并保留在排除证据中。
- IC-A07 同一 profile 实测：旧 bundle `index-D3qg2Jno.js` 暖机后为 259 条副本/1,586,252 bytes；候选 bundle `index-2Fm4qXqU.js` 在旧标签仍打开时完整滚动后仍为 259 条/1,586,252 bytes；关闭并清理后 entries/body 均为 0；切回旧 bundle 后实际旧入口恢复且存储仍为 0。两个标签、Chrome/profile 清理均通过，残余进程为 0。
- 本轮已完成技术阻塞验证，但尚未关闭 Issue 或合并 `main`；Issue 闭环和归档合并仍需维护者授权。

### PROB-13 自定义 JS 与 CSP 验收

- 2026-10-10 在独立可见 Chrome 154 的测试站，通过后台文本框输入并保存带可见计数标记的 JS。未保存的隔离预览不执行；保存后首页通过 Blob 脚本执行一次，真实点击主题开关 6 次仍为一次，刷新后新文档也只执行一次，正常流程无 CSP 违规。既有实现通过，无产品代码修改。
- 实际 HTML 响应为 `script-src 'self' blob:`，不包含脚本的 `unsafe-inline` / `unsafe-eval`。反向检查中，内联脚本与实际点击的内联事件均未执行，分别产生预期的 `script-src-elem` / `script-src-attr` 拦截；不能把这两条主动触发的安全日志算成产品异常，也不能以响应头文本替代执行结果。
- 通过真实文件选择按钮加载合成备份：43 B 中文 JS、3338 B JS（显示 3.3 KB），均另带 23 B 页脚 HTML；在 1440×1000 / 820×1180 / 390×844 共 **6/6** 组合中显示准确体积、执行风险及分段换行，提示与按钮不溢出、可命中，截图已复核。空 JS 对照不显示多余警告；真实取消和 Escape 均未发送 `/api/import`，不执行覆盖导入。
- 原设置逐项一致恢复，测试标记消失；测试会话被撤销，专用浏览器/profile 清理完成。全阶段 console error、页面异常、失败请求、非预期 HTTP 错误均为 0，另保留上述两条预期 CSP 安全错误。此项闭环不替代 PROB-13 的两次真实部署升级提示验收，也不代表 iOS/Safari 真机通过。

### REQ-15 导航布局组合补验

- 2026-10-10 测试站独立可见 Chrome 154：左侧悬浮、左侧常驻、顶部滚动、顶部分行 × 1440×1000 / 820×1180 / 390×844 × 浅色/深色共 **24/24** 组合通过，截图已复核；390px 为 Chrome 触摸模拟，不是真机。
- 通过真实设置表单保存布局，鼠标、触摸滑动/点击和键盘验证展开、选择、Enter/方向键、Escape 焦点返回。另有 **8/8** 补充检查：两种顶部布局各在 1920 / 820 / 390px 验证末端子菜单边界、命中与选择，左侧常驻收缩/Enter 恢复及手机子分类选中。未发现需修改的产品行为。
- 24 组展开采证窗口内分类图片解码、像素及 Blob 复用通过，副本响应均为 0；布局往返后原有 51 条分类/书签副本描述无变化，新浏览内容正常增加缓存。原设置完整恢复，未增删分类或书签；测试会话已撤销，专用浏览器/profile 清理完成、残余进程为 0。
- 控制台与页面异常为 0。完整操作期间另有 **7 次同一既有书签的 `503 unavailable`、54 次书签副本 `ERR_ABORTED`**，均非分类请求，原始记录保留；本次不声称全站传输零错误，也不以布局通过证明这些书签请求的根因或恢复矩阵已闭环。跨构建、iOS/Safari、安全区、软键盘和实际读屏仍待对应验收。

### REQ-15 默认协议正文传输调查

- 2026-10-10 同一产品构建在独立 Chrome 中两轮默认协议 UI 组合各 **14/14（exit 0）**，副本请求实际使用 HTTP/3；非预期错误为 0，测试数据、会话和 profile 清理完成。补齐当前默认协议证据，不回写历史失败。
- 固定四个历史失败对象及其内容版本，HTTP/3 与 HTTP/2 各 32 次诊断请求，覆盖串行/四并发和响应克隆开关；64 次均获得完整 JSON，同对象正文长度与哈希一致，最长约 1.50 秒。本轮未复现旧正文中断，不能据此认定传输根因已修复，也不能将接口对照当作 UI 验收。
- 旧记录显示 HTTP 200 后只接收部分正文，随后触发既有约 10 秒客户端取消；尚无证据进一步区分链路、边缘传输或浏览器协议/解码层原因。回归报告新增浏览器版本及压缩/长度元数据，不改变产品超时、重试和协议偏好。

### REQ-15 桌面键盘与缩放补验

- 新增真实键盘进入设置、缓存开关/清理、故障提示与恢复、菜单焦点返回，以及浏览器 AX 名称/角色检查；既有产品行为通过，无需产品修复。
- 通过临时 Chrome 外观页的原生控件选择实际 100%/125%/200% 页面缩放；devicePixelRatio 比例、可见性与命中区检查通过，截图已人工复核。测试站 HTTP/2 组合 **7/7（exit 0）**，异常与清理错误为 0；该轮未覆盖其他布局、读屏软件和真机。后续布局证据见 [REQ-15 导航布局组合补验](#req-15-导航布局组合补验)，不扩大本轮键盘与缩放的覆盖范围。

### REQ-15 普通图像回退的超时与恢复

- `ca97ba5` 新构建测试站 HTTP/2 组合 **11/11（exit 0）**：暖刷新、标签切换、编辑取消、公开/私密双重 ConnectionReset 与超时、成功副本保留、重新登录和退出通过；非预期错误为 0，五条合成记录、三个会话和专用浏览器/profile 清理完成。默认协议传输限制沿用快照验收记录。
- 副本失败后的普通对象代理存在两条路径：共享 fetch 未限制响应正文等待，原生书签图片持续挂起时没有超时触发。为共享对象代理增加包含正文读取的 10 秒期限；书签图标复用原生可见性看门狗，卡片与 Spotlight 通过既有有界重试恢复。
- 不新增持久缓存或增加重试次数；超时释放共享在途条目，迟到正文不能覆盖后续请求。公开/私密冷缺失双重失败与暖副本保留使用真实 UI 清理、浏览、标签切换和原生存储验收，部署后证据见 BACKLOG。

### REQ-15 快照提交与新会话隔离

- `10b9637` 构建在独立 Chrome 禁用 QUIC 的 HTTP/2 组合 **14/14（exit 0）**：六个快照断点、暖刷新、旧 401、初始化交错、重新登录与退出通过，非预期 HTTP/网络/控制台及清理错误为 0。默认协议多轮功能断言通过但受非 fixture 副本正文 10 秒超时影响，整轮仍保留失败；HTTP/2 通过不代表默认协议问题已消失。
- 真实编辑后暂停管理员快照提交，再从另一标签退出并重新登录，复现旧写入收尾删除新会话快照；只看最终结果会被后续重建掩盖。旧作用域写入改为精确删除，排队清理和异步裁剪核验会话归属，旧投影回写同样受保护。
- 书签保存跨越快照等待后，仅原会话继续数据刷新、图标刷新和成功提示，避免退出后的旧操作再发送鉴权请求或影响新页面。
- 延迟处理登录变化的旧标签不再覆盖其他标签已取得的新图标授权记录；旧标签仍需通过正常的会话作用域、数据集、租期和持久化栅栏后才能使用该记录，不扩大离线权限。
- 存储事件先于会话刷新抵达时，作用域不匹配只暂停当前标签读取，不能撤销其他会话的新授权记录；追加该事件顺序的独立回归。
- 增加 localStorage 提交前/后、Cache Storage 调用前/完成后及真实冻结的浏览器场景；通过实际表单保存、第二标签退出/登录、原生存储与中途删除采证验收。快照存储名称、数据格式和容量不变；本轮部署后状态以 BACKLOG 为准。

### REQ-15 浏览流程性能与容量审计

- `eea3023` 构建推送后的默认协议组合 **6/6（exit 0）**：三项基础前置、真实 UI 卸载/迟到响应隔离、五对冷/暖与五轮页面往返、容量淘汰全部通过，指定场景无遗漏。非预期 HTTP/网络/控制台/图像采证错误为 0；35 条合成记录复查不存在，测试会话被拒绝，专用浏览器关闭、profile 删除且残余进程为 0。此前失败报告与独立补清记录保持原样。
- 五轮暖访问均无图标副本正文请求，页面往返后原生正文/索引账目稳定，无孤儿或未引用图像句柄累积。30 张 384 KiB 合成图像逐一实际提交，超过 10 MiB 预算后保留 21 张、正文 8,257,536 字节；设置页计数、UI 清空正文/条目与恢复均通过。另有本地原生 Chrome 的 100/500/1000 规模及联合预算 **36/36** 检查，不能当作测试站真实数据规模。
- 冷/暖仅针对图标副本，页面壳资源已经预热；流程耗时包含操作与就绪等待，不是 LCP。显式解码为 Promise 累计等待，可能重叠，不是 CPU 耗时；未宣称解码次数或成本下降。存储以 Blob 和序列化元数据计量，不代表浏览器 profile 的物理磁盘占用。跨构建、真实到期和真机边界仍见 BACKLOG。
- 增加真实首页滚动、Spotlight、后台分类与返回首页的五轮副本冷/暖对照及五轮同文档生命周期审计；独立记录网络、显式解码、图像句柄和原生持久化账目，不调用产品 Loader/Store 代替操作。
- 增加 30 张 384 KiB 合成图像的真实页面容量验收，观察实际事务提交、超出预算后的淘汰、设置页计数、清理归零及恢复；本轮大样本仅允许已登记 ID 清理。
- 收尾曾在逐条删除后的全量回读中断，旧报告保留失败且已独立补清；大样本改用现有批量删除接口，仍核验归属和最终缺失。另补齐原生图像随真实 UI 卸载的证据及重定向计数，未新增产品缓存或轮询；最终组合中原生迟到响应正常完成且未复活旧视图，没有把这次执行描述为取消分支命中。

### 修复分类保存后丢失图标身份

- `d6b36ba` 新构建默认协议组合 **14/14（exit 0）**：分类保存响应实际返回正确版本/代次，保存确认后的请求不再回退旧代次；键盘、Touch 移动、筛选取消、父子隐私、暖刷新及书签/菜单回归均通过。非预期 HTTP/网络/控制台/图像采证错误为 0，测试数据、会话和浏览器/profile 完整清理。
- 真实分类保存/立即重新加载的组合发现一次未知代次 0 的多余副本读取；创建和更新响应未返回图标元数据，首页本地投影又仅保留五个旧字段，导致已知图标身份与隐私标记被暂时丢弃。
- 分类写入在原 SQL `RETURNING` 中返回现有版本、写入代次和缓存标记；本地投影保留 `PublicCategory` 的完整字段，仅去掉创建时间。不增加查询、缓存、重试或图像正文传输。
- 真实 SQLite 的创建、编辑、改名、隐私、换父级、清空与已有缓存覆盖响应到前端投影；旧实现三项反例失败，只修服务端时前端仍失败。旧测试站 UI 保存也明确观察到响应缺字段；新构建部署后另验，不用本地通过替代真实操作。

### REQ-15 分类编辑、移动与隐私的真实操作验收

- 首次部署后组合保留失败：匿名公开分类仍在原生重试时过早执行像素判定，后续用例又继承了匿名状态。补齐既有原生重试的就绪前置及失败后的独立恢复；后台筛选造成的副本取消另按真实输入、前后 DOM 和会话采证，不能整体忽略取消。
- 新增筛选取消的真实浏览器专项：只延迟临时浏览器中的一次现有分类读取，不修改该分类；真实筛选移除消费者后取消，恢复列表后实际 Blob 与持久副本重建。默认协议 4/4（exit 0），只单列证据完整的准确取消请求，其他异常和清理错误为 0。匿名隐私就绪专项同样通过，原失败记录保留。
- 增加分类原始图标读取、键盘选择/取消、真实改图及新文档暖刷新；增加 390px Touch 移出/移回父分类，以及父/子隐私切换后管理端与访客页面的验证。
- 审查修正验收器对鼠标展开焦点的错误假设，按现有方向键规则进入菜单，并补齐 Enter 的原生回车文本；失败时实际取消弹窗，各场景独立准备本轮合成数据。未改产品交互规则。
- 默认协议专项已验证键盘与改图/刷新、触摸层级移动和隐私恢复，相关非预期错误及资源清理检查通过。早期焦点前置和残留弹窗导致的失败保留；推送后组合验收另记。

### REQ-15 原生图标断点与会话交错验收

- `a7800bb` 自动构建后的默认协议组合 **15/15（exit 0）**：冷/热刷新、六个新增原生/初始化交错、常规旧 401、跨标签退出、重新登录和退出全部通过。非预期 HTTP/网络/控制台/图像采证错误为 0，合成数据、测试会话与浏览器/profile 完整清理；不扩展为任意身份迁移、快照提交或系统崩溃矩阵完成。
- 新增真实副本解码后的退出、重新登录、冻结退出，原生事务 body 写入后 abort，以及写请求仍 pending 时从另一标签实际退出。核验私密 DOM 的逐帧隔离、正文/索引回滚与新 UI 会话恢复，不调用产品 Loader/Store 制造结果。
- 新增新登录聚合数据尚未返回时交付旧 401 的场景，放行新数据后验证真实分类与私密图像。测试站专项通过；早期重新登录未进入目标分类导致的可见性前置失败保留，未据此修改产品加载策略。
- 审查补强探针异步比对后的单次暂停权、像素观察与产品 decoder 的区分、原生方法/Debugger 清理，以及图像核验的绝对期限；推送后完整组合另记。
- pending 写入首轮功能断言通过，但因第二标签退出响应未在对应 CDP session 取证而保留一条未归类 401，整轮保持失败。补齐真实撤销响应后，默认协议专项 4/4（exit 0），非预期 HTTP/网络/控制台及清理错误为 0；只沿用同会话在途请求的既有归类规则，不整体豁免 401。

### REQ-15 私密副本期限与连接中断恢复验收

- `b54c4f3` 推送并自动构建后，默认协议组合 **13/13（exit 0）**：冷/热刷新、真实编辑图标与标题、公开/私密连接中断、两类超时、慢普通代理与顺序重试、重新登录和退出全部通过；非预期 HTTP/网络/控制台/图像采证错误为 0，五条合成记录不存在、三个测试会话均被拒绝，浏览器/profile 清理通过。范围不扩大到尚未执行的解码/事务中断、跨构建或真机。
- 首次推送后组合为 11/12：私密副本已按期取消并在 13.81 秒正确回退，但正常 1.2 秒重试早于较慢的原生图片完成，旧验收器错误要求此时只能有一次请求。保留该失败；验收现只允许一个同身份、前次已结束的准确顺序重试暂扣至像素/冷库核验结束，再检查其真实成功与落盘，不改产品重试或 15 秒期限。
- 新增慢普通代理的确定性专项，必须实际命中上述顺序重试；测试站默认协议 4 项通过，约 13.32 秒显示正确回退，异常与清理错误为 0。显式指定但不存在或未执行的用例也会使总结果失败，避免只跑基础前置而误报通过。
- 新增独立私密超时场景，沿用真实登录、设备缓存 UI 清理、冷库缺失、普通代理像素与新副本哈希的完整流程；提前换源取消及公开场景证据不能冒充私密超时。
- 新增公开/私密副本连接中断场景，故障不落盘，解除后通过真实标签切换触发既有恢复；网络错误仅在对应场景完整通过后按准确 requestId 单列。
- 测试站默认协议两轮专项各 4 项通过：私密请求约 10.01 秒取消、10.73 秒显示正确回退，两类连接中断均正确恢复。非预期 HTTP/网络/控制台与清理错误为 0；未增加产品重试、轮询或缓存。推送后组合验证另记，不用专项结果替代全部失败断点。

### 统一工程规则与历史任务记录的阅读边界

- 本仓库 `develop` 推送后等待 Cloudflare 自动部署，独立实例的手动部署另行说明；发行 tag 不再被当作线上构建已更新的证据。
- 撤销旧 Svelte 4、缺少组件测试环境及 Spotlight 共享防抖的过期前置，保留对应历史判断与后续裁定入口。
- 早期图标验收表、前端需求草案和 Tier 0 以外验证范围明确回指 BACKLOG；不因历史缺口或通用脚本未覆盖而重复安排已完成事项。

### REQ-15 扩展验收默认协议完整通过

- **2026-10-09，`3c85248` 新构建默认协议完整 46/46（exit 0），无跳过。** 签名续期/失败、虚拟时钟租约边界与恢复、真实关闭重开、编辑、三档菜单、503/408/429/500/错图及持续挂起、旧响应/旧 401、冻结与跨标签退出、分类权限均在同一轮通过。
- 非预期 HTTP、网络、控制台、图像采证错误为 0；五条合成记录删除并复查，12 个测试会话均被拒绝，专用浏览器/profile 清理通过。未禁用 QUIC，历史失败与补清理报告保持原样。
- 本轮闭环上述自动化场景；跨构建/旧 SW/回滚、真实长时间停留、真机及未覆盖的解码/持久化中断组合仍在 BACKLOG，不按总通过数扩大验收范围。

### REQ-15 普通图标回退跟随内容版本

- `8b76203` 的新测试站构建七项专项通过：改图后直接故障，不依赖标题变化，503 与超时均显示新图并恢复正确副本，非预期 HTTP/网络/控制台及清理错误为 0。
- 租约暂停时自行生成代理地址的分支也使用已有短版本函数；完整 SHA 字符串超过 Worker 的版本长度上限，旧实现会把不同内容归一到同一 edge key。书签/分类两个跨模块反例已验证修复，不改变正常已签名代理地址或旧格式数字版本。
- 仅修改图标、不修改标题后，副本 503/超时回退曾返回旧图片：普通代理 URL 版本遗漏已有内容 revision，命中修改前的 edge 缓存。书签卡片、通用书签预览及远程分类图标的版本现包含 `icon_revision`，未知时使用 `icon_write_epoch`；已知相同内容不会因单独写代次变化换版本。同步重置书签图像失败状态键。
- 不新增数据库查询、网络请求或缓存层；继续使用原有 `v`、私密授权与客户端 no-store 契约。四个纯函数反例在旧实现失败，测试站“改图后直接进入副本故障”也观察到旧像素，修复部署后另验。
- 503 复用已验证的公开/私密联合故障流程，减少分轮恢复和改写 fixture；保留冷库、真实像素、故障拒收和自然恢复门。

### REQ-15 完整串联中的验收前置与清理

- 首次扩展后的完整轮次为 44/46，原报告保留。原生分类超时场景有意增加 SVG 注释，后面的分类字节检查现先恢复自身标准 fixture；持续挂起后实际原生图片已正确显示，验收器现分别核验原生 Image 与 Fetch/Blob，要求准确请求、当前源、同文档、完整正文、时限和独立像素，不放宽旧 Blob 判定或取消豁免。
- 关联七项默认协议专项通过，原生回退约 10.52 秒显示，之后新副本及正确哈希落库；分类字节与权限检查通过，非预期错误及清理错误为 0。
- 原完整轮次权威清理回读失败，后续独立恢复会话已确认本轮五条记录全部删除并撤销。原报告没有具体 HTTP 码，不能唯一归因；新增受控测试覆盖 `/me` 成功后读到 401 的撤销传播竞态，只允许一次重新认证并重新核验所有权，保留失败状态码/业务码，不循环登录或盲删。

### REQ-15 副本失败恢复与冻结标签退出验收

- 默认协议七项专项通过，覆盖公开/私密书签的 408、429、500 及可解码错图：独立像素保持正确，故障不写入冷 IndexedDB，解除故障后由既有重试/焦点恢复机制建立正确哈希副本；不新增产品重试或轮询。
- 默认协议冻结标签专项四项通过：第二标签实际收到 Chrome freeze 事件，第一标签退出后恢复第二标签，认证与私密 DOM 均清除。两轮非预期 HTTP/网络/控制台错误为 0，合成记录、测试会话与浏览器/profile 清理通过。
- 这些专项不替代默认完整串联、解码/事务中途退出或任意冻结写入矩阵；结果保留对应运行边界。

### REQ-15 分类权限验收与传输协议对照

- 补齐 13 个测试站分类权限/响应头检查：匿名与未知对象一致拒绝、签名不能代替会话、私密祖先撤回公开图像、合法签名预览、管理员副本及相同 URL 恢复公开。独立字节预期与 Chrome 像素分别验证；只操作本轮合成数据。
- fixture 准备与回读移到宿主请求，避免页面内 fetch 卡住测试编排；与浏览器请求日志分开记录，保留真实 UI 请求和清理门。默认协议的四项场景通过，但另有两个非 fixture 的 HTTP/3 副本收到部分正文后超时，整轮保留失败。
- 显式禁用 QUIC 的独立诊断轮实际使用 HTTP/2，四项场景及清理通过，非预期 HTTP/网络/控制台错误为 0。此结果只支持协议/传输环境相关性，未确定根因；不修改默认测试协议、用户 Chrome 或产品网络策略，不以诊断轮替代默认完整回归。

### REQ-15 校正时钟后恢复可信图标副本

- 离线租约到期或检测到时钟回拨时仍暂停副本。重新联网并接受属于当前会话的新认证回执后，同步重置内存中的时钟观察上限，避免旧的未来时间让设备永久停在校验状态；读取快照、迟到响应和错误会话不能重置这个边界，不清理有效图像正文。
- 同文档与重开后的未来时间检查点反例在旧实现失败，修复后通过。测试站增加真实持久副本、离线租约过期、时钟回拨及联网恢复专项；只改变测试文档时钟，不缩短或伪造服务器回执，不替代真实 24 小时等待。新代码部署后结果另记。
- `03e8319` 新构建中，离线过期与回拨两个场景均验证了禁止本地副本、回执不续期及联网后重新恢复有效租约/正确 Blob；该组合轮随后在分类 fixture 的页面通道超时，整轮失败原样保留，不能宣称完整回归通过。

### REQ-15 签名续期保留仍有效的图标授权

- 到期前两分钟是续签窗口，不再当成签名已过期。等待续签、续签失败或返回无效授权时保留仍有效的 key；实际到期或会话变化后仍停止使用旧 key。不增加定时轮询、逐图授权请求或持久化。
- 五个边界反例在旧实现失败，修复后续期、过期及旧会话隔离测试通过。测试站旧构建真实切换标签进入续期窗口后，私密图标从带签名请求变为匿名兜底，独立像素检查失败；新增可重复的挂起、503 与自然恢复专项。新构建部署后结果另行记录，不以本地检查替代。
- `5fce390` 测试站新构建的六项专项通过：578 帧无退化/句柄释放、故障期间零额外图标正文请求，随后真实续签成功；重新登录图像与退出通过，非预期 HTTP/网络/控制台错误为 0，合成数据、会话与浏览器清理完成。

### REQ-15 回归清理与测试会话所有权

- **2026-10-08，提交 `9af3713` 部署后完整 37/37（exit 0）通过**：在线/离线真实重开、快速退出导航、原生挂起、旧快照、编辑/三档菜单、503/副本超时、旧响应/旧 401/跨标签退出及 IDB 故障均通过。快速路径约 5.58 秒，原生受控挂起约 12.10 秒；非预期 HTTP/网络/控制台/图像采证错误为 0。五条合成记录全部一次删除并复查，11 个本轮会话均返回拒绝；浏览器/profile 清理通过，未补写旧失败报告。
- 页面 CDP 分离加原生超时四项专项 exit 0：确认页面已不能执行脚本，服务端数据清理、两个捕获会话的失效确认以及浏览器清理仍成功。多账号同名构建需按完整 check-runs 和已核准账号/build 区分的规则同步到部署验收指南；不将别账号成功误作目标站部署。

- 新构建完整 37 项功能与清理通过，11 个本轮会话均被拒绝，所有删除一次成功；但原生超时用例的准备阶段仍有一次未归类取消，整轮保持失败。证据显示仅 v 改变、同节点新图已加载，原因是修改 fixture 后未等新副本物化就退出；现在该受控用例先核验已落库正文及描述符版本，再进入匿名阶段，快速导航用例时序不变，不扩展任何取消豁免。

- 上轮目标构建专项的八项功能通过，但清理依赖页面 Runtime.evaluate，超时后留下合成分类且无法确认原会话撤销。原报告保留失败；后续只补清理了对应标记的数据，未重置用户认证。
- 服务端清理改由独立、有界、禁止重定向的宿主请求执行；精确 ID、标题和树所有权双重校验，写响应丢失先查权威缺失，再有界重试。会话仅在测试进程内存登记，即使数据清理失败也逐个退出并验证 401，不撤销用户其他会话。
- 目标站五项专项通过；主动分离专用 CDP 页面后，确认无法执行页面脚本，仍删除全部本轮数据并验证三个测试/恢复会话均为 401。首次实测还发现管理员三秒运行时缓存造成重复删除尝试，清理现使用既有 no-cache 绕过契约，避免把旧快照当权威结果；后续复验另记。
- 新增真实页面通道分离故障入口和独立所有权、级联边界、超时、丢失应答、延迟撤销测试。部署后完整回归另行记录，不能仅凭新清理模块或单测宣称所有验收闭环。

### REQ-15 原生分类图片悬空的有界恢复

- 后续串联仍出现多轮原生重试无响应；重试地址增加文档作用域，避免跨文档重复使用重试 URL，不改变 Worker 持久缓存键。浏览器/传输内部原因尚未证实；当时的新地址策略待部署复验，后续通过结果见本次完整验收记录。
- 一次快速路径约 51.86 秒恢复正确图像，但原 30 秒验收限制与既有三次退避预算不符，现按 65.2 秒完整上限核验，旧报告保持失败。副本故障前增加原生冷缺失证明、回退 Blob 追踪提前至导航前；修正后的 503/超时专项通过，未用跳过注入代替验证。

- 完整回归的 37 项功能断言通过后，仍因一次准备阶段的文档更换取消而保留非零退出。导航现在记录实际发起、主 frame 提交及新旧 loader，只单列区间内旧文档的原生只读图标取消，不忽略 HTTP/API 错误或未知取消。旧缺证据报告保持原结果。
- 新增快速导航和原生超时两项均已在新构建通过；首次完整回归的旧 401 用例保留了新会话，但未先确认其图像已就绪。现在旧响应继续暂扣、文档不变，先建立新会话图像基线，再验证迟到错误；不追认旧失败，也不替代初始化中交错矩阵。
- 首次新构建实测中，图片已恢复但受控用例混入 fixture 的版本切换；修正为先确认权威物化版本与当前可见节点、仅暂停准确 URL。专项在真实 200 响应被暂扣后约 12.61 秒通过产品重试恢复正确像素，未使用脚本改图或人工 error 事件。
- 完成状态按请求源区分，旧 Blob/旧 currentSrc 不能提前结束新 URL 的加载等待；另外三个源切换反例覆盖 DOM 属性提交前后及旧事件隔离。
- 快速退出立即导航的旧构建反例再次失败：原生图片没有 load/error，既有 on:error 重试无法触发；将同一图片转为已有 retry 请求后可恢复正确像素。另有真实 200 响应被暂扣的独立负对照，排除只是测试等待不足。
- 可见且在线的原生分类图片增加 10 秒加载期限，超时走现有 retry 参数和有界退避，不改变 loading=lazy、不改协议或持久化。自动重试至多三次，再由限频 focus/online 恢复；成功保留恢复后的 URL。
- 明确错误归属：可信视图的 active 标记不等于 Blob 来源；原生 fallback 即使处于该视图也由组件管理重试，已验证 Blob 的错误仍交给可信副本模块。离屏、隐藏、离线、换源和销毁均清理期限，预览和 Blob 不安装原生加载观察器。
- 新增真实快速导航和原生图片挂起场景，以及严格的完整重试取消证据。旧原生反例和受控挂起均保留，部署后另做原生路径与完整回归，不把后台诊断恢复冒充产品实现。

### REQ-15 真正关闭浏览器后的持久化恢复

- 重开后的组合回归发现旧快照前置把“登录标记已清除”误当“匿名页面已就绪”。现先在原文档核验公开图像、快照及私密对象移除，再开始旧格式恢复；快速退出后立即导航的失败另留待办，未改写成通过。在线/离线重开、匿名旧快照和保存图标七项专项通过。
- 编辑取消增加真实 PUT、前后持久化描述符/哈希、像素与会话/时序匹配；仅在完整替代证据成立后单列。旧报告缺证据的取消不追认，不能靠场景名称或 ERR_ABORTED 放行。
- 新增在线/离线同 profile 关闭重开用例：先验证原生 IDB 正文和图像，再确认旧进程归零、保留目录、新建不同进程/标签；重开后不重新登录、不重填图标，核对原会话、可信偏好、私密对象、像素和持久化哈希，离线恢复联网后再验证。
- 复用现有 CDP 边界，页面采证可重新安装而不重复注册主机监听。安全重启仅允许本轮自建资源；清理路径固定为启动时的绝对路径，纠正 PowerShell 路径转义及查询失败误当零的风险。旧 socket 消息不能混入新连接，旧 pending 命令被明确结束。
- 测试站预推送专项五项（含必需前置）通过，在线有真实鉴权刷新、离线有真实断网失败，五个 fixture 均无正文重取；进程、数据和最终 profile 清理通过。部署后完整串联结果与这些专项分别记录；不把同构建重开当作跨构建升级，也不扩大为签名到期矩阵完成。

### REQ-15 已恢复快照不再重新缩为首批书签

- 推送后等待自动构建，在新入口和默认有头 Chrome 配置上执行完整 33 项，33/33 通过、无跳过；匿名旧快照、IDB 故障、十秒副本恢复、三档菜单、旧 401 与跨标签退出均通过。实际包含 HTTP/3 请求，没有禁用 QUIC、强制 eager 或注入暖刷新运行时补丁。非预期 HTTP/网络/控制台与采证错误为 0，合成数据、会话及浏览器/profile 清理通过。
- 两条原生签名换源取消仍保留于原始请求日志；仅在完整新响应和对应图像成功、所有旧使用者已换源/离开后单列。旧的未完成替代请求报告重放仍拒绝，不通过豁免所有 ERR_ABORTED 消除失败。L0 为 163 文件 / 1691 测试，类型检查与构建通过。
- 真实浏览器复核发现，完整快照已经显示后，初始化网络刷新仍调用渐进更新，先把书签缩到 60 条再补齐；这会撤除后部分类/图标并重建相同请求。三个旧实现反例均失败，缓存恢复到实际刷新调用链可观察到 150 → 60 的回退。
- 数据编排层只对尚未加载的冷状态分批。已有内容直接应用完整权威响应，不保留被删除/撤权的数据，也不改变认证代次、缓存格式、图标许可、网络并发或浏览器协议。旧渐进计时批次仍由 store 的代次失效。
- 默认协议的受控浏览器对照中，暖刷新直接替换完整列表、不经过首批截断，匿名旧快照及存储故障等 11 个场景均通过；该对照不作为新构建部署证据；部署后的原生路径结果见本节首项。签名 key 更换导致的两条取消在完整换源、节点交接和新图加载证据成立后单独分类，原记录仍保留；未完成替代请求的旧失败报告重放仍拒绝。

### REQ-15 挂起副本请求的有界恢复

- 推送后的新构建专项：持续挂起约 10.01 秒后取消，约 10.80 秒显示普通代理生成的新 Blob；故障未落库，解除拦截后由现有重试取得新副本并校验 IDB 协议哈希。四项含必需前置通过，非预期 HTTP/网络/控制台为 0，合成数据及浏览器清理通过；不代替完整串联。
- 验收器曾错误要求普通回退必须是原生 Image 请求，现按实际 Fetch → Blob 链路核验创建时间、MIME、字节非空、像素及不同的新副本 Blob；保留错误假设导致的失败，不通过更换产品路径或单纯接受任意 Blob 掩盖。
- 图标加载协调层为每次实际副本传输（含响应正文读取）设置 10 秒期限；排队等待不消耗期限，普通 API、许可租期、持久化格式和四并发上限不变。期限到达会中止传输并释放槽位，不再依赖浏览器最终报告连接失败。
- 最后一个使用者释放或许可失效时立即结束等待；迟到的成功响应不能重新发布描述符或写入存储。超时复用既有 retryable 分支，在许可有效时保留最近成功图，不缓存错误，恢复后仍可按现有机制重试。
- 新增队列占满、超时保旧及恢复、立即取消、排队起算、计时器清理、撤销后迟到响应回归。前三个反例在旧实现失败；现有真实浏览器流程增加可独立运行的持续挂起故障注入和严格按请求归属的取消证据。
- 此项修复的是已证实的副本请求无界等待，不将其宣称为所有普通图片挂起或连接关闭的根因。签名租期、跨构建升级、关闭重开、其他失败断点及真机覆盖仍按原待办验收。

### REQ-15 旧快照恢复的独立图像验收

- 登录与匿名分别在专用 profile 中仅把本轮合成书签快照改成旧 empty 格式，保留服务端版本；真实完整加载后检查聚合请求、投影版本写回和逐对象像素。匿名只验公开对象，并断言私密对象不可见。
- 测试站九项专项（登录/基线、空闲、关闭缓存右键、延迟启用、冷/热、两种旧快照）通过，非预期 HTTP/网络、浏览器日志和页面异常为 0，合成数据及浏览器/profile 已清理。探针另有九项单测，覆盖所有权、只读检查和存储回退。
- 每例恢复默认视口，避免低高度菜单测试污染随后登录；图像等待有界并记录耗时，失败时在恢复登录前记录原页面与单独网络探针。完整串联曾出现匿名分类图片等待超时，不能用独立通过抹掉，保留在待办继续复核。
- 新退出意图回归同时暂扣匿名完整数据或暖快照版本确认，排除认证请求；新测试站构建下该场景、旧 401 与跨标签退出通过。
- 只验证同构建读取合成旧格式，不冒充关闭浏览器重开、不同构建升级、旧 SW 接管、签名到期矩阵或真机证据。

### 保留退出期间新发起的登录意图

- 完整浏览器回归发现退出后的公开数据刷新较慢时，较晚完成的退出流程会关闭用户刚打开并正在输入的登录弹窗。测试站旧构建通过暂扣真实公开响应稳定复现，不能靠延长测试等待掩盖。
- App 持有认证视图意图代次；打开/关闭登录、提交登录、密码恢复等新操作会使旧退出视图提交失效，懒加载之后再次检查。服务端撤销告警仍显示；新会话已建立时不继续清空其管理视图或缓存。数据请求代次与认证协议不变。
- 新增独立意图测试与真实浏览器延迟响应场景；隔离 Worker + 有头 Chrome 的新场景、旧 401、新会话及跨标签退出共 6 个场景（含必需前置）；未选用例明确记录未执行。退出并发请求的 401 须取得同会话、时序和服务端已撤销证明才单列，不能整体忽略认证错误；推送后测试站复验另记。
- 测试自建 Chrome 禁用原生窗口遮挡暂停，不覆盖页面可见性、不强制图片 eager；真实标签切换仍验证。

### PROB-13 后台测试页动画帧等待修复

- 推送后复验遇到 CDP 超时。受控真实浏览器实验确认后台页的 `pageExportControl` 等待动画帧不返回（页面已 complete，但 visibility 为 hidden）；不通过加长网络超时或削弱断言掩盖。
- 启动后激活本轮专用页面，导出控件测量前再次激活；使用即时滚动后的同步布局读数，移除不必要且可能永不返回的动画帧等待。完整验收主动切至一个自建空标签，再从后台恢复原测试页执行真实导出；该额外标签在正常与失败路径均按 ID 清理。
- 测试站有头 Chrome 完整 40/40，主动切换目标后恢复、真实子集导出及弹窗负向对照均通过；弹窗无非预期网络/HTTP、控制台或页面异常，本轮浏览器/profile 清理通过。
- 不修改产品或全站设置，不把这项实验扩展为所有偶发启动超时的根因；先前失败报告仍保留。

### PROB-13 弹窗验收改为真实输入与严格失败门

- 测试站基线已能找到旧选择器（30/30）；未把历史失配误报为当前产品缺陷。实际发现旧脚本能合成点击桌面隐藏的移动入口，缺失动作栏又会跳过；现按真实可见桌面/移动入口操作，等待懒加载，取消使用鼠标及从表单输入框开始的 Tab/Enter。
- 测量表单直属动作栏的取消/保存按钮、两轴视口与卡片边界、换行及实际命中；缺失、空栏、隐藏、溢出和遮挡都失败。20 个弹窗独立测试覆盖决策与恢复，保留原有 2 个预缓存等待测试，五个测试站页面负向对照逐项拒绝后恢复；不写服务端书签或设置。
- 首访离开已清理旧文档后再计数，等待实际页面就绪；异常中断也输出已执行检查与清理结果。定向模式明确列出未执行范围，默认保留完整流程；临时 profile 未删除则不能完整通过。
- 测试站有头 Chrome 完整 39/39、0 跳过；弹窗阶段业务写入、非预期 HTTP/网络失败、Chrome Log、console 与页面异常均为 0，浏览器/profile 清理通过。较早输入前置错误、超时与失败轮次保留在本地证据，不抵销为通过。
- 弹窗首次打开的焦点仍在触发按钮，报告明确保留该观察；本项不声称自动聚焦、焦点陷阱、手机软键盘或安全区完成。当时另有 S3 与两次真实部署升级的验收欠账；S3 后续证据见 [自定义 JS 与 CSP 验收](#prob-13-自定义-js-与-csp-验收)，当前剩余范围以 BACKLOG 的 PROB-13 为准。

### 复核修复后的真实浏览器总体验收

- 2026-10-06 测试站有头 Chrome：27 项执行且通过，`28-IDLE-CONTROL`、`28-RIGHT-CLICK-OFF` 两项未执行，未计入通过率。编辑数据、图标句柄稳定、冷/热、取消重申请、公开/私密 503 回退、会话交错、三档菜单、存储失败、时差及 CSP/主题色均有对应场景证据。
- 非预期 HTTP/网络失败、浏览器 Log 和各场景脚本异常均为 0；不把主动故障注入、取消和协商混为一谈。1 次预期断网、3 次与成功重试匹配的描述符协商分别记录；无法归属的历史失败不据此追认为通过。早期 P07 断网/取消记录中的 42 次网络失败未留请求 URL，仍无法逐项归属。
- 通过状态驱动的折叠操作菜单处理避免点不到登录/主题按钮；会话数据交错和重新登录图像恢复分开验证，保留失败时只读状态诊断。未执行远端 Issue 状态写入或 main 合并。
- 最终本地 1328 单测、类型检查、构建通过，API 冒烟 109/109；证据记录提交为 `be7fcb3`。本轮合成数据、测试浏览器和 profile 清理通过；早期启动失败的本机临时目录仍有残留，详见本地交付说明，不能宣称所有历史资源均已清理。

以下记录已交付到 develop 的修复及该轮验证范围，取代待办中的“未推送/待提交/尚未复测”旧补记；**不将部分场景升级为完整验收**。原始站点证据仅保存在本地，当前欠账统一见 [BACKLOG](docs/BACKLOG.md)。后文各日期小节保留形成时的验证快照，不能脱离本节的后续结果当作当前状态。

| 范围 | 修复提交（develop） | 已取得的证据及限制 |
| --- | --- | --- |
| 人工反馈 1：续期时保留有效租约 | `01c100b` | 后续真实改图、标题保存及 600ms 偏差场景通过；不代表所有签名到期/续期组合通过 |
| 人工反馈 2：焦点恢复不无条件失效 | `019852f` | `29-TAB-FOCUS`、`28-RIGHT-CLICK-ON` 通过；缓存关闭右键未在最终轮次执行 |
| 人工反馈 3：启用延迟至完整加载 | `48db90e` | `28-ENABLE-DEFERRED`、冷加载、热加载通过；不再是仅脚本语法检查 |
| 旧格式图标及误写 empty 快照 | `96fdcb3`、`a2c1476` | 前者已有测试站逐项冷/热/故障 5/5；后者已交付投影版本与旧快照联网恢复、本地 L0 与隔离图标回归 47/47，脚本已增加旧快照场景。不能据此宣称目标站旧快照专项或跨两个构建升级完成 |
| F28-1 编辑源字段丢失 | `1b9ca51` | 公开/私密书签从快照恢复后只改标题，原图标保留 |
| F28-2 相同内容句柄重建 | `312c760`、`ee519de` | 改图与只改标题均无非目标句柄撤销、显示退化或额外对象正文请求 |
| F28-3 取消后索引复用 | `cea9193` | 冷/热、受控授权/副本交错及重新登录图像恢复通过 |
| F28-4 普通代理编码格式 | `08e5592` | 公开/私密副本 503 后均恢复正确图像，原两项预期失败转为普通通过 |
| F30-1 菜单空间/顶部遮挡/滚动 | `df096eb`、`93abadc` | 三档视口真实编辑、展开/选择、取消和服务端未写入通过；不替代真机键盘/安全区 |
| CSP/主题色/自动注入 | `33eb783` | 严格脚本策略与 no-transform 生效，亮暗主题色正确，冲突日志消失 |
| #29 会话保护复验 | 保留现有代次保护 | 旧管理员/匿名响应、旧 401、双标签退出及重新登录恢复通过；没有为复验另造产品补丁 |

流程见 [真实浏览器回归](docs/guides/ISSUE_BROWSER_REGRESSION.md)，独立图像预期见 [图标验收](docs/guides/ICON_ACCEPTANCE.md)。`no-transform` 阻止自动注入统计是已验证的安全策略选择，不是未修复的控制台错误；如需统计，另行明确 CSP 与隐私边界。

### 区分图标写入栅栏与内容身份（F28-2 跟进）

- 最终串联浏览器回归发现，后台刷新推进写代次时，内容未变的标题编辑仍会重建少数句柄。写代次用于防止旧写入覆盖，不是已验证图像字节的身份。
- 在对象、数据集、内容 revision 与授权 epoch 均未变化时保留既有已验证图像，不再因单独写代次变化重建；权限/数据集/内容/空态变化仍释放。
- 新增该边界回归；真实有头 Chrome 连续更换图标、公开/私密标题编辑及标题保存稳定性检查均通过，数据与非目标句柄保留。

### 修复主题色脚本与 HTML 安全策略冲突

- 将被 CSP 拒绝的内联主题色同步移入构建模块，保留初始同步、主题变化监听和开发热更新清理，不开放 unsafe-inline。
- 静态 HTML 入口与 Worker HTML 响应从同一策略生成安全头，HTML 继续再验证并设置 no-transform，阻止与严格 CSP 冲突的自动脚本注入；静态脚本和 Service Worker 的缓存规则不变。生成规则纳入离线外壳指纹。
- 自动注入的第三方统计不再由代理加入页面；如需统计，应单独设计明确的 CSP 与隐私边界，不能为消除控制台错误直接放开脚本来源。
- 本地 1326 单测、109/109 API 冒烟、有头 Chrome 亮暗主题色与严格策略断言通过；推送后测试站复验另记。

### 补齐顶部导航下的菜单避让与滚动稳定性（F30-1 跟进）

- 测试站复验发现顶部导航仍可能覆盖扩展后的菜单。Sidebar 通过现有测量链报告真实底边，Home 发布顶部排除区域，菜单同时避让顶部导航和底部排序栏。
- 测量自然高度时保留内部列表滚动位置，内部滚动不再触发外层重测；紧凑列表长名称省略显示但保留完整可访问名称/提示，权限提醒仍保留换行。
- 隔离有头 Chrome 使用与测试站相同的顶部导航，在三档视口完成真实编辑、展开、选择、取消和服务端未写入核验；后续再次复验线上，不以先前左侧导航结果代替。

### 为低高度分类菜单保留可操作空间（复核 F30-1）

- 移动分类列表在卡片两侧均不足时，允许覆盖锚点并使用可见视口的可用高度，继续避开底部排序栏；普通编辑菜单仍沿用原方向逻辑。响应 visualViewport 的尺寸与滚动变化，退出选择后恢复原定位。
- 两条新几何回归在旧实现失败；有头 Chrome 在三档视口实际打开编辑、展开/选择子分类、取消草稿并核对服务端未写入，均通过。1000×300 不再只剩不足一行的列表。
- 测试点击先判断命中，避免强制居中滚动使弹层移动；隔离实例启动失败改为通过 finally 清理，受控启动失败未留下新状态目录。

### 统一普通图标代理的数据 URI 解码（复核 F28-4）

- 普通代理复用已有有界图像解码器，支持 UTF-8 URL 编码及 base64 data URI；不再把合法的 charset 图标返回为 HTTP 200 兜底。保留调用方的缓存策略，拒绝畸形、非图像及不支持的字符集。
- 两项已知预期失败转为普通通过回归，并补充 UTF-8 字节长度和失败输入。真实有头 Chrome 分别向公开、私密副本注入 503，再检查普通路径显示正确图像。
- 诊断报告把有明确 CSS 归属的背景加载和已取消响应单列；取消不代表协议成功，操作级请求及句柄预算仍计入取消请求。

### 修复已取消图标读取的索引复用（复核 F28-3 边界）

- 最后一个消费者释放未完成读取时立即移除其索引；同一任务内重新申请将创建新操作，而不是复用已中止的 Promise。迟到的中止结果不得重新发布别名或描述符。
- 保留多消费者共享读取和权限失效边界。新增同任务重申请、迟到旧结果、仍有消费者时不取消的回归；前两项在旧实现失败。
- 新增真实浏览器时序用例：暂停私密图标副本和授权响应，先释放授权以触发 URL 变化，确认新的申请及真实图像恢复。普通冷/热加载、保存稳定性也单独验证，不把前一项已改善的冷加载重复计为新成果。

### 保留内容未变的可信图标句柄（复核 F28-2）

- 已验证并显示的图标按对象、数据集、内容版本、写代次及授权 epoch 保留；快照补齐原始字段或在线 key 更新不再重建同一图像。内容、权限、数据集、隐藏或空图标变化仍释放原句柄。
- 浏览器采集扩展到已显示的其他书签/分类及屏外 Blob 句柄，区分新出现的编辑预览与重载已有图片。旧测试站在单图保存时释放大量无关句柄；本地修复后非目标句柄、逐帧显示与对象正文请求断言通过。
- 启动期间尚有被取消的描述符协商请求，仍作为后续冷启动/生命周期问题保留，不把单项通过写成全站零异常。

### 修复快照恢复后编辑标题清空图标（复核 F28-1）

- 编辑前读取当前身份下的权威原始字段，不把省略图像正文的显示快照直接转成完整更新表单。书签与分类共用该读取边界，但不将完整响应重新发布到首页 store。
- 读取失败、退出或编辑意图变化时不打开过期/缺字段的表单；保留明确的重试错误提示。补充会话竞态、失败不回退到有损快照、读取不污染显示状态的测试。
- 新增真实有头 Chrome 用例：确认快照已经省略图标来源，刷新后打开编辑，只修改公开和私密书签的标题，逐字核对输入并检查保存后的原始图标字段。旧测试站基线失败，本地修复用例通过；推送后的复验独立记录。

### 图标验收器与独立合成数据

- 拆分只读显示对比与合成图像内容验收：显示对比检查完整实例多重集合，包含基线文字项，但不再宣称图像身份已验证。
- 新增无副作用验收函数及 CDP 采集函数，拒绝缺失、重复、错误图像、解码或画布读取失败；隔离图标脚本使用不同书签/分类合成图，验证实际像素与两个书签展示位置，避免同数字 ID 串图被相同测试图片掩盖。
- 增加测试站有头 Chrome 逐项流程：真实输入核验、独立合成记录、Network/Console/Log、逐帧显示、Object URL 调用栈、延迟响应和存储故障；原始站点证据保存在仓库外。
- 留存普通图标代理不支持合法 URL 编码 data URI 的两个预期失败回归。测试站发现的图标数据丢失、重建、冷启动和低高度菜单问题尚未修复；用例与验收边界见 `docs/guides/ISSUE_BROWSER_REGRESSION.md`。
- 合成图像与验收契约见 `docs/guides/ICON_ACCEPTANCE.md`。这是一项测试基础设施改动，不改变产品逻辑，也不代表 #28、#29、#30 已重新验收。

### REQ-15 自动恢复旧版误写的空图标快照（2026-10-05）

- 旧版可能把误判的 empty 描述符写入页面快照；仅修复新请求不能保证已有浏览器自动恢复。为本地快照增加图标投影版本，读取缺少版本且包含 empty 图标的旧快照时保留数据，但不使用旧数据版本跳过联网刷新。
- 成功获取服务端元数据后写入当前投影版本；未受影响的快照不强制刷新，新版真实空图标不会导致反复全量请求。公开与会话隔离的后台快照使用相同纯判断，图标正文缓存、权限和云端数据结构不变。
- 逐书签浏览器脚本新增旧快照污染与升级恢复场景，只改测试自有 profile，不需要用户手工清缓存。
- 本地验证：152 文件 / 1240 测试、类型检查、构建、空白检查通过；隔离 Chrome 图标回归 47/47，热刷新零额外正文请求，测试 profile 与本地数据目录清理完成。

### REQ-15 修复可信缓存误判旧书签图标为空（2026-10-05）

- 聚合接口用 `icon_cached` 表示服务端已有图片，旧数据可能没有原图地址、正文和版本。可信描述符现识别该标志：无版本进入 unknown 按需获取，不再当作 empty 清空显示；首页、Spotlight 和后台列表/统计保持相同契约。
- 副本暂时不可用时复用现有在线渲染；重试不反复清空已恢复的在线图标。本地租约检查或到期时，仅使用对应对象的同源在线接口，仍由服务端鉴权，绝不复用旧私密正文；明确拒绝/删除不回退到旧副本。启动复用已有短暂重试窗口，保持正常热缓存零额外正文请求。
- 新增逐书签对比脚本 `scripts/icon-display-prod-regression.mjs`，在测试专用浏览器中比较关闭、冷/热缓存及副本接口故障，报告和截图只写系统临时目录；不修改站点书签或全站设置。此脚本取代“只要页面有图片”的弱断言。
- 本地验证：152 文件 / 1236 测试、类型检查（0 错误 / 0 警告）、构建及空白检查通过；隔离 Chrome 图标回归 47/47，包含真实保存、热刷新零请求与完整资源清理。线上旧版逐项对比已复现回归；新版推送后验证单独记录。

### REQ-15 设备缓存开启延迟至下次加载（2026-10-05）

- 勾选设备缓存只保存启用偏好，不再立即切换图标路径或自动发起联网校验。新增文档级启用状态，由首次读取已保存偏好决定；当前页面及已打开的其他页面继续走原展示路径，返回首页、焦点恢复、手动校验均不提前激活，下次完整刷新或重新打开页面后才按需缓存。
- 面板显示“已保存，将在下次刷新或重新打开页面时启用”。关闭仍立即停用并清理；关闭后再开启也等下次加载。保留清理失败提示，并支持保存偏好失败后的重试；持久化格式、认证与过期边界不变。
- 本地 L0：152 文件 / 1218 测试、类型检查（0 错误 / 0 警告）、构建与空白检查通过。新增当前/新挂载图标展示、跨页面偏好同步、关闭与重开、校验不提前激活等回归；Chrome 脚本已更新并通过语法检查，但未启动本地服务或执行真实浏览器验证，未部署。

### REQ-15 焦点恢复不再无条件失效全部图标（2026-10-05）

- 修复 `iconDeviceState.resume` 在每次页面焦点恢复时无条件增加失效代次、释放全部图标的路径。继续校验本机授权与持久化缓存状态，但同一有效租约不再进入 checking，不再释放书签和分类图标。
- 磁盘缓存被清理、代次变更、会话撤销或校验失败时仍使旧图标失效；重复 stale 失败不会保留旧授权。未把权限检查转移到右键菜单或展示组件。
- 两条新增焦点回归在旧代码上失败，修复后通过；状态机与真实 loader 组合测试确认保留图标且不增加图片读取/请求。本地 L0：151 文件 / 1210 测试、类型检查（0 错误 / 0 警告）、构建与空白检查通过。尚未用真实浏览器复测右键与焦点事件顺序，不将该路径视为全部偶发原因。

### REQ-15 保存刷新时保留有效图标租约（2026-10-05）

- 修复一种全量图标失效路径：保存书签后重新获取数据，若新授权回执比本机时间略超前，已有有效租约不再立即进入 checking、释放所有书签及分类图标。保留原回执与租约，在新回执生效后一次性接替；不延长旧授权、不修改服务端时间、不持续轮询。
- 冷启动、旧授权到期、数据集切换、退出及撤销仍遵循原安全边界。新增状态机与真实 loader 组合测试，确认续期不释放现有图标、不增加图标读取或网络调用。旧实现运行两条新增回归均失败，修复后通过。
- 本地 L0：151 文件 / 1204 测试、类型检查（0 错误 / 0 警告）、构建与空白检查通过。尚未复测真实浏览器保存流程，不能据此断言人工报告的全部触发原因已消除；焦点恢复的全量失效和首次启用立即切换加载方式另行处理。

### REQ-15 可信冷启动时钟偏差修复（2026-10-05）

- 推送后真实浏览器验证发现，服务器回执时间略超前于客户端时钟时，旧过期保护会让设备停在 checking。现在对不超过 5 秒且没有本机回退的新回执超前做一次性等待重检，时间追上前继续禁止使用副本；大偏差/实际回退要求同步时钟后重新校验。
- 不修改回执、不延长租期、不增加持续轮询。新增状态机测试，并以 600ms 偏差运行隔离 Chrome 图标回归 45/45；1198 单测、类型检查和构建通过。此项是线上复验发现的独立补充修复；`e927427` 推送后，真实站点专项 13/13 通过，可信冷启动、生成图标、LRU 热路径及离线重载恢复；新 profile 重复专项 13/13、最终常规站点验收 30/30。

### REQ-15 图标 LRU 命中落盘修复（2026-10-05）

- 将真实图标 loader 的本地命中接入 1 秒按需合并落盘，并在页面隐藏时尽力提交；空闲不轮询，失败不自循环。
- 容量淘汰在同一 IndexedDB 事务内合入近期命中；失败保留待处理批次，新到达的命中不被旧批次确认删除，同代际恢复不清空 pending touches。租约失效、清理与跨连接旧时间保持安全边界。
- 类型检查 0 错误/警告，151 文件/1193 单测、构建通过；原生 Chrome IndexedDB 回归 36/36，页面图标回归 46/46，包含真实页面自动更新书签/分类 last_used 的断言。`cf3b92d` 推送后的时钟阻塞另行修复后，站点已直接验证 last_used 自动增长、saved_at 不变、热重载零副本请求和空闲写入计数稳定。

### REQ-15 可信图标 UTF-8 data URI 修复（2026-10-05）

- 统一前后端受限图像 data URI 解码，接受项目 `logoSurfIcon` 生成的 `charset=utf-8` SVG，避免开启设备缓存后退成首字母并触发物化 503。Worker 图片嗅探、浏览器解码/哈希、体积上限和会话隔离保持不变；未知字符集/参数仍拒绝。
- 新增真实生成函数、旧数据补 revision、会话鉴权物化及 loader 保存回归；隔离 Chrome fixture 覆盖同格式分类和书签图标的冷/热路径。类型检查 0 错误/警告，150 文件/1185 单测、构建、图标 UI 45/45 与兼容 UI 4/4 通过。
- 提交 `a65944e` 推送后，测试站现有生成图标的可信 Blob、普通重载与离线重载通过；测试隔离 profile 清理旧 SW 外壳后复验，不代表升级接管流程已验证。LRU 接线另行修复。边界与验收依据见[审计修复计划](docs/plans/ICON_AUDIT_FIX_PLAN.md)。

### REQ-15 分类生产冷/热路径修复（2026-10-05）

- 修复可信租约仍在有效期内时被竞态切入 `expired` 的状态机问题：租约回调、同步判定和统一过期入口均会重新读取当前租约并拒绝陈旧过期决定。对应提交为 `b5d8725`、`2f5029a`、`57f6c96`，已推送 `develop`。
- 新 bundle `index-B_vb1kMT.js` 部署到测试站后，`npm run regression:icons:prod` 通过：分类冷路径使用可信 Blob（`body=89989`，`copy200=4`），同 profile 热加载复用 IndexedDB（`copyRequests=0`）；控制台错误、页面异常和非预期 HTTP 均为 0。
- 本次测试创建的 Chrome target、浏览器进程和临时 profile 均已清理。该证据覆盖桌面测试站分类入口；iOS/Safari 与真实设备仍按用户指示由用户自行测试。

### REQ-15 后续验证续跑（2026-10-04）

- 按本轮授权推送空提交触发第二次 Cloudflare 部署；部署计数达到两次，但提交未改变应用 bundle，不能据此证明 IC-A07 的新版本兼容更新路径。
- 在生产隔离创建随机私密合成书签，调用成功 `POST /api/icon-local-copy` 并检查平台响应：200；`Cache-Control: private, no-store`、`CDN-Cache-Control: no-store`、`Cloudflare-CDN-Cache-Control: no-store`，另有 `X-Content-Type-Options: nosniff`。合成书签已删除，本次会话已登出。该部署仍是一期书签实现，不代表未部署的分类代码。
- 本地验证：`npm run type-check`（0 errors / 0 warnings）、`npm test`（150 文件 / 1170 项）、`npm run build`、`npm run smoke`（109/109）通过。隔离 Chrome `regression:icons:local` 45/45 通过，覆盖首页根/子分类物化、书签/分类同 ID 隔离、Sidebar 顶栏及子菜单、Enter/Escape 焦点恢复、首页分类范围与常规分类区、同 profile 重载、搜索分组、Spotlight、后台分类列表与分类编辑预览，并覆盖书签首页、经常访问、搜索、后台与编辑。浏览器控制台错误、页面异常和非预期 HTTP 均为 0；预期的请求取消单列记录，Chrome/profile 已清理。
- 分类后台列表按轻量 `icon_display` 挂载图标；首页、Sidebar、搜索分组和后台列表在本地真实 Chrome 中均能从同一可信分类副本显示，编辑快照中内嵌图片源缺失时仅在进入编辑流程时刷新已鉴权后台数据，避免打开编辑后空图标值覆盖原来源。Q02 本地 D1/Worker 测试与 smoke 证据通过；Q03 桌面入口和键盘路径已通过，移动交互与生产分类部署仍未覆盖。
- 扩展原生 IndexedDB 回归至 28/28：新增 100 书签 + 30 分类联合预算、五轮混合读取/解码、无元数据全扫描和 object URL 峰值证据；`regression:icons:perf` 以同一夹具完成首页冷/热、Sidebar 子菜单、搜索分组、后台分类列表各 5 轮，冷首页每轮至少 30 个分类物化，所有热入口分类正文请求为 0；就绪时延与无异常请求证据已写入开发计划 §8.4。生产平台性能、移动浏览器和真机仍未覆盖。
- IC-A01～A20 逐项证据及缺口已记录在开发计划 §9.2.1。按用户指示，iOS/Safari 和真机事项标记为用户自行测试；代理未执行这些场景。

### 分类图标二期设计冻结（REQ-15 / IC-Q01）

- 冻结分类图标继续使用既有 D1 与单一 IndexedDB：分类表新增成功正文、内容摘要和写入代次语义，复用全局数据集代次、类型化对象键及书签/分类联合预算，不因兼容迁移清空书签副本。
- 列清分类 CRUD、删除、导入重建、浏览器同步建空分类等写入口；冻结分类根链可见性 fail closed、缓存字段导入白名单和 data URI 快照投影约束。普通分类代理保持 no-store，专用认证物化端点按对象类型显式分派。
- 记录 Sidebar、分类范围/区域、搜索分组、后台列表、编辑预览的冷/热请求基线：按实际图片槽位计数，区分持续挂载命中与销毁后重挂载请求。未伪造分类专属耗时/请求数字；固定合成夹具上的分入口量化留给 Q04。
- 验证：分类 D1/迁移、UI/URL、祖先权限、图标代理、导入与快照相关 13 个测试文件/133 项通过。Q01 仅冻结设计；Q02～Q04 尚未实现，P07 发布欠账保持开放。

### 一期书签图标本地审计基线（REQ-15 / IC-P07）

- 扩展原生 IndexedDB 回归：真实 Chrome 断网时由新存储实例读取已保存正文；100、500、1,000 条合成 SVG 各运行五轮 20 项首批样本和全量读盘/解码，并记录中位数、p95、最大值、IndexedDB 读取数、正文/索引占用、全量扫描和 object URL 峰值。
- 本次 26/26 通过；无控制台错误、页面异常、失败请求或非预期 HTTP 状态，临时 Chrome target/profile 已清理。基准只代表单机存储/解码层，不代表真实页面首屏、Worker/D1 或生产平台性能。
- 推送至测试站后完成一轮真实验收：`accept:prod` 30/30、`regression:chrome` 25/25（密码轮换明确跳过）、`perf:audit` 9/9；设备缓存面板在真实浏览器可见且默认关闭，匿名 `POST /api/icon-local-copy` 返回 401/1001 和 `private, no-store`。性能审计覆盖 355 张首页书签卡片，本站失败请求为 0。
- `accept:prod` 的主动断网阶段记录了 42 个 `loadingFailed`；错误为断网/导航取消，属于该场景的预期网络事件，但脚本没有把请求 URL 写入报告，不能逐条归属资源。单独复测无 HTTP 错误；其它线上浏览器探针未观察到本站异常请求或异常 HTTP。测试截图与报告、临时浏览器 profile 已清理。
- 复核 API 契约并更新性能/技术说明、生产验收边界、排障和脚本指南。两次真实部署、生产平台缓存头、其他浏览器及真机证据仍未验证；P07 整体发布出口未因此宣告完成。

### 迁移与兼容回滚清理（REQ-15 / IC-P06）

- 新版继续清理已知旧 `localStorage` / Cache Storage 命名空间，并在兼容回滚构建启动时关闭可信副本、清空新版 IndexedDB 正文与索引；不相关存储和仍由当前界面使用的 v2 外部图标缓存保持不变。普通构建会在旧标签再次写入后通过跨标签存储事件/焦点恢复再次清理。
- 兼容构建恢复快照中已投影掉正文的图片时回到普通 `/api/icon` 路径；可信正文请求遇到协议 1、无图片正文的描述冲突时，最多用服务端返回的新描述重试一次。其它错误仍保持失败状态，不作为预期 HTTP 响应放行。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 149 文件 / 1167 条通过；`npm run build` 成功；隔离 IndexedDB + Chrome 存储回归 16/16；正常图标 UI 回归 34/34、兼容构建 UI 回归 4/4；隔离 API 冒烟 109/109；`git diff --check` 通过。浏览器控制台错误、页面异常、失败请求、非预期 HTTP 状态均为 0，临时 Worker、D1、Chrome target/profile 均已清理。
- IC-P06 本地实现与验证完成，已按阶段单独本地提交；未推送或部署。P07 的本地规模审计已增加；逐项安全证据归档、测试站点/生产部署后验证和两次部署兼容仍未完成，不能据此宣称 REQ-15 一期发布交付完成。

### 完整书签展示与编辑接入（REQ-15 / IC-P05）

- 首页普通分类与「经常访问」、首页搜索、Spotlight、后台书签列表及编辑/显式刷新接入统一的可信图标视图和对象副本协调层；跨展示位置复用一个授权副本，首页/后台数据快照不重复保存图片正文，精简后保留图像类型标记并按可见性通过普通代理懒恢复；可信模式优先读取授权副本。
- 修复移动端后台书签编辑弹窗被底部导航栏覆盖的问题；回归验证保存按钮的实际命中层、鼠标提交、更新请求、保存后刷新及元数据编辑保留既有图片正文。
- 验证：类型检查、构建、148 文件/1157 单测通过；隔离 Worker + 真实 Chrome 覆盖 29/29，包括首次物化、同 profile 刷新零正文请求、普通分类/经常访问/搜索/Spotlight/后台/编辑路径。无控制台错误、页面异常、失败请求或非预期 HTTP 错误；测试 Worker、D1、Chrome target 与 profile 均已清理。
- P05 已完成；P06 迁移/兼容回滚、P07 一期审计、测试站点与生产部署后验证仍未完成，不据此宣称 REQ-15 整体交付。

### 设备选择与会话生命周期（REQ-15 / IC-P04）

- 后台新增独立「设备缓存」区域，默认关闭；风险说明、占用、联网校验、清理及关闭操作不进入全站 Settings 或备份。通过页面回调复用既有数据刷新服务。
- 认证回执、当前数据集、会话身份与离线租期共同决定使用权限；本地快照/图片命中不续租。退出先封禁，迟到回执不得恢复；跨标签使用统一 storage 通知，持久撤销栅栏阻止旧标签覆盖偏好后重开旧会话。
- 保留聚合元信息经过前端转换后的身份；避免相同会话通知反复重置页面数据。退出请求迟到时不清除后来登录的新身份。配额错误不撤销其他有效副本。
- 验证：146 文件/1146 单测、类型与构建、隔离 API 冒烟 109/109 通过；原生存储 16/16，隔离 Worker + 实际页面联调 8/8（包括 390px 布局、键盘、全站设置不变）。无非预期控制台/页面/网络错误，临时资源已清理。
- 此提交接通设备与会话控制；各书签展示/编辑路径的本地优先仍由 IC-P05 完成，不据此宣称整体验收通过。

### 可信图标事务存储基础（REQ-15 / IC-P03）

- 将离线租期、会话匹配、异常时钟、类型隔离和联合容量决策分离为纯策略。选择需求允许的单一 IndexedDB 后端，正文/索引/计数/撤销栅栏在同一原生事务中更新，不增加 Cache Storage/localStorage 图片镜像。
- 加入迟到激活防护、退出清理与写入串行、损坏条目修复和有界 LRU。消除每条索引重复的完整作用域，保留 512 KiB 原预算；常规命中不扫描全量元数据或图片。
- 验证：类型检查、144 文件/1132 单测、构建通过；隔离 Chrome 的原生 IndexedDB 验证 15/15，包括写正文后索引失败回滚、两标签清理与迟到写防护、1,000 条联合容量。无非预期控制台/页面/网络错误，测试浏览器与 profile 已清理。
- 本提交是后续设备状态与页面接入的基础，尚未用于生产图标展示；不能据此宣称二访零下载或完整 UI 回归通过。

### 可信图标副本服务端契约（REQ-15 / IC-P02）

- 为书签成功图片增加独立内容摘要、条件写入代次和数据集身份；显式刷新、代理惰性补图与导入均接入。旧 SQL 改正文时摘要失效，换源时清除旧正文；并发旧请求不能覆盖新保存。
- 新增会话鉴权的单对象数据物化协议，限制输入/图片体积，禁止共享和浏览器自动缓存；普通对象代理的权限顺序与 no-store 不变。
- 公开模式的带 Bearer 版本请求也验证会话；认证回执与普通图标 key 分离。聚合元数据和内容同批读取，导入重建 ID 时原子更换数据集并返回新身份。
- 验证：类型检查、143 文件/1123 项测试、构建、隔离 Wrangler/D1 冒烟 109/109 通过；临时数据库已清理。真实 SQLite 测试覆盖同内容版本、来源 ABA、并发刷新、旧写入保护与迁移/导入回滚。
- 此项仅交付服务端边界，不代表可信设备开关、浏览器持久副本或分类阶段已完成；当前尚未进行生产部署验证。

## v0.7.3 — 2026-10-03

### #28 / PROB-39 部署后复验与验收就绪检查

- 代码基线 `2a22a2dc0d94758e1a7a9a55ec5ef1116c6163fc`：`8709ace` 补齐未缓存 HTTP 图标恢复，`2a22a2d` 修复固定排序工具条遮挡；两项代码提交的 CI 均通过。测试站点上已观察到相应恢复行为和工具条留白，不以本地构建哈希推断部署状态。
- 测试站点只读回归：标准验收 30/30，图标故障注入与三档视口末排卡片/菜单/键盘专项 22/22，性能审计 10/10。355 张卡片、0 破图、图标请求 259 次（预算 260）、后台传输 37,381 B、Cache Storage 630,185 B。只有专项主动注入的一次连接重置，无非预期失败请求或页面/控制台异常。
- 修正验收脚本：弹窗不再依赖固定 320/360ms 等待，也不把任意 `.modal-card` 当成书签弹窗；预缓存检查等待真实入口 JS/CSS 条目，最多 10 秒，超时仍失败。补充慢加载、错误弹窗、延迟缓存和超时的四项测试；全量 140 文件/1095 项单测、类型检查、构建及脚本语法检查通过。
- 预缓存异常另经独立 Cache API 对照定位为本机 Chrome 长临时配置路径问题：较长路径出现存储内部错误，恢复系统临时目录作为 profile 根目录后同站点验收通过；排查办法记入部署后验收指南，不放宽缓存断言或存储预算。
- 测试未保存站点书签/排序/设置或轮换密码，仅撤销本次创建的会话；测试浏览器和临时资源已清理。Chrome 134、报告者原实例及 iOS 虚拟键盘/安全区真机仍未验证，Issue 状态未修改。

### 修复固定排序工具条遮挡末排卡片（PROB-39）

- 测试站点复现窄屏末排卡片中心命中固定排序工具条：工具条脱离文档流，页面滚动范围与右键菜单都未扣除其覆盖区域。
- Home 持有工具条遮挡高度，通过独立尺寸观察 action 在挂载、换行及视口变化时更新；底部留白叠加用户已有边距，卡片滚动停靠与菜单定位使用同一 CSS 变量避让。退出排序/关闭错误栏时清零，卸载时移除监听；不改变排序草稿和保存接口。
- 回归：四条新增组件用例修复前失败；补齐几何边界后全量 139 文件/1091 项单测、类型检查与构建通过。隔离 Chrome 在 1366×768、390×844、1000×300 对末排卡片、移动按钮、分类下拉和键盘操作验证 19/19，无非预期网络/页面/控制台错误；取消排序未产生数据写入，资源清理完成。
- 测试站点复验结果见本轮部署后复验条目；iOS 虚拟键盘与安全区真机验证仍需人工。

### 补齐未缓存 HTTP 图标的失败恢复（Issue #28）

- 复核 Issue 回复后确认，既有修复只覆盖已走对象代理的图标。未有数据库图标缓存的 HTTP 图标直接作为图片加载，失败后不会进入代理重试；后续聚合数据的 `icon_cached` 变化也不在原状态键中，可能继续保留失败状态。
- 保持直连成功时零额外请求，仅在有效书签的直连图片失败后复用现有有界代理恢复；公开与私密授权边界、在途请求合并、独立 Blob 生命周期和 no-store 保持不变。将缓存可用性纳入状态键；不为无效预览 ID、文字图标或 Iconify 图标引入对象代理恢复。
- 真实隔离 Chrome/Worker 对照：外链首次失败后，修复前公开/私密卡片均持续兜底且无代理请求，只有打开编辑并取消才恢复；修复后无需编辑，三处卡片经两次请求恢复真实 PNG（公开重复卡片共享一次），公开 no-store、私密 private/no-store，均无兜底标记。
- 验证：新增六条针对遗漏路径的用例在修复前全部失败，补齐边界后全量 138 文件/1082 项单测、类型检查、构建、API 冒烟 97/97 与 diff 检查通过。仅有两次故障注入产生的预期连接重置，测试资源已清理。
- 现有测试站点连续三轮清站点数据/硬刷新未自然复现持续兜底；受控复现证明的是上述遗漏路径，不能据此断言报告者所有失败都来自同一原因。Chrome 134 与报告者实例未验证；测试站点复验结果见本轮部署后复验条目，Issue 状态不由代码提交改变。

### 2026-10-02 测试站点回归

- 代码基线为 `fc35fb25c43a77bedbdcfdbbcb8444376bfd1c03`：四项修复已分别提交到 `develop`，对应 CI 通过。提交前再次完成类型检查、138 文件/1065 项单测、构建与隔离 API 冒烟 97/97。
- 使用本地验证配置指定的测试站点执行只读回归：标准验收 30/30、性能审计 10/10；确认站点已提供导航响应修复，图标恢复、跨登录切换的延迟响应/旧 401、普通重载均按预期运行。
- 1366×768、390×844、1000×300 的普通底部编辑菜单均可命中；在未被固定工具条遮挡的卡片上，嵌套分类列表、键盘导航和内层 Escape 通过。
- 另发现固定排序工具条遮挡末排卡片/菜单的边界（PROB-39）：390px 窄屏末排卡片中心命中工具条，300px 低高度中末排菜单操作也可能被工具条覆盖。该失败保留在结果中，不能以标准验收脚本通过代替全部交互闭环；修复计划在 `docs/BACKLOG.md`，本轮未追加代码修复。
- 测试未保存排序、修改书签/设置或轮换密码，只撤销本次创建的登录会话。原始报告、截图和临时配置均留在仓库外；测试仅使用独立浏览器配置，不触及日常浏览器。真实 Mac/Safari、虚拟键盘与连续两次部署的新版本提示未验证，Issue 状态未修改。

### 修复跨会话刷新与管理员快照竞态（Issue #29 复核 / PROB-37）

- 数据编排层在会话变化时立即清除旧身份视图，以会话/刷新代次拦截延迟快照、版本、聚合响应和旧 401；渐进渲染批次在数据替换或清空后失效。
- 管理员快照读写清理串行执行，并校验会话归属，防止在途写入越过退出清理后重新落盘；API 层不再允许旧请求的 401 清除新令牌，自动数据刷新由编排层决定何时退出。
- 回归：新增延迟响应、旧错误、版本/快照恢复、渐进渲染及 Cache Storage 在途读写测试。类型检查、135 文件/1040 项单测和构建通过；隔离 Chrome 验证退出后旧管理员响应、登录后旧游客响应、重新登录后旧 401 均不覆盖当前状态，控制台/页面/网络错误为零。测试站点复验与剩余边界见本轮统一记录。

### 修复书签临时兜底图标无法自行恢复（Issue #28 复核）

- 图标获取结果保留可重试失败/兜底状态，首页卡片与 Spotlight 不再把可解码的兜底 SVG 当成真实图标成功。保留按完整 URL 合并在途请求和各组件独立 Blob 生命周期，不持久化对象图标或失败响应。
- 每个图标身份最多自动退避重试三次；隐藏/离线时暂停，耗尽后仅在重新可见或联网事件做 30 秒限频探测。成功解码、身份变化和卸载都会清理旧计时器/监听器；解码失败也受重试预算约束。
- 回归覆盖公开/私密授权、首页/Spotlight、网络和解码失败、换 key、卸载及缓存隔离。隔离 Chrome 注入一次兜底后，两处重复卡片仅追加一次共享请求即恢复真实图片，无需打开编辑弹窗。测试站点复验与剩余边界见本轮统一记录。

### 修复右键菜单内分类下拉的视口裁切（Issue #30 复核）

- 右键菜单使用分类选择器的内嵌布局模式，子树展开/折叠主动通知外层重新测量；其他表单中的选择器保留原有浮层行为。自然高度测量不受上一次限高影响，也不通过 Svelte 绑定变量写临时样式，避免反复触发更新。
- 进入分类选择时暂时收起编辑/移动操作行，为低高度视口保留列表空间；取消后恢复操作行和键盘焦点。保留内层优先 Escape、外部点击和排序草稿取消行为。
- 验证：137 文件/1060 项单测、类型检查和构建通过；隔离 Chrome 在 1366×768、390×844、1000×300 中均验证首次展开不越界并实际选中目标分类，低高度列表为 81px 而非 14px。测试站点复验与剩余边界见本轮统一记录。

### 修复缓存 HTML 重定向响应导致的页面重载失败

- 真实 Chrome 复核发现安装预缓存会跟随 `/index.html` 到 `/` 的重定向。直接把带 `redirected` 标记的缓存 Response 用于导航，会被 Chromium 的 `redirect: manual` 检查拒绝，并产生 Document `ERR_FAILED`。
- 导航输出对这类响应创建保留正文、状态和响应头的新 Response；克隆正文供后台 shell 比较继续读取，静态资源与 API 缓存策略不变。覆盖根路径、管理路径、显式 index.html、首次导航和离线回退。
- 验证：新增五条测试修复前全失败、修复后通过；最终 138 文件/1065 项单测、类型检查、构建与独立 API 冒烟 97/97 通过。隔离 Chrome 完整回归前三项修复、普通重载、断网重载和联网恢复；旧重定向错误消失，断网注入之外无失败请求。测试站点复验与剩余边界见本轮统一记录。

### 修复匿名图标代理的隐私状态缓存泄露（PROB-38）

- 根因：`/api/icon/:id` 与 `/api/category-icon/:id` 先命中不含身份的共享 edge cache，再读取 D1 判断当前对象是否对匿名访客可见；公开图标缓存后改为私密时，同一个 `v` 仍可能返回旧真实图标。分类图标还曾由 Service Worker cache-first 保存。
- 修复：匿名请求先通过目标书签/分类及祖先链的递归 D1 可见性闸门，再允许命中/写入 edge cache；私密、未知、孤儿分类和循环分类返回 `no-store` 身份无关兜底，不读写共享缓存。合法授权 key 继续 `private, no-store`、不读写 edge cache。
- 缓存迁移：公开图标改为浏览器 `max-age=0, must-revalidate`、edge `s-maxage` 保留；icon cache namespace 升到 3；Service Worker cache 版本升到 v17，并移除 `/api/category-icon/*` Cache Storage cache-first。旧 runtime cache 在新 SW 激活时删除。
- 回归：补充公开→私密书签、公开→私密分类、分类祖先/循环/未知对象、旧 edge hit、旧 SW cache 清理、授权/匿名异常缓存策略和 Service Worker network-only 测试；本地独立 Worker/Chrome 验证匿名不再命中旧真实图标、公开 edge hit 仍有效、私密响应为 `private, no-store`。
- 验证：`npm run type-check` 318 files 0/0、`npm test` 134 files/1002 tests、`npm run build`、`npm run smoke` 94/94、`node --check public/sw.js` 和 `git diff --check` 全部通过；真实隔离 Worker/D1/Chrome 覆盖公开→私密、祖先变化、父级缺失、授权 `private,no-store`、SW v17 激活/旧 v16 清理与无 API Cache Storage。推送 develop 后的正式 `perf:audit`/L3 仍列为发布后门禁。

### 分离对象图标的 Edge 与浏览器缓存（PROB-38）

- 生产验收发现共享域名的 Cloudflare Browser Cache TTL 会把公开图标响应的 `max-age=0` 改成 4 小时；公开图标改为私密后，普通浏览器仍可能从磁盘缓存返回旧真实图标。
- 代码级修复仅作用于 `/api/icon/:id` 与 `/api/category-icon/:id`：公开真实图标和永久缺图兜底继续写入 Worker 的 Edge cache，但所有客户端响应（包括 edge hit）统一 `no-store`；授权、拒绝、未知、孤儿和循环对象保持 `private/no-store` 或 `no-store`。
- 图标客户端 URL 版本由 `cv=3` 迁移到 `cv=4`，绕过已存在的旧浏览器条目；不修改共享域名的 Cloudflare Zone 配置，不增加初始部署步骤，也不改变 Iconify 和站点元信息缓存。
- 验证：L0 类型检查 318 files 0/0、单测 134 files/1010 tests、build、diff-check、L1 smoke 97/97；隔离 Worker + 普通 Chrome 验证公开命中、公开→私密、祖先隐私切换、授权、永久缺图和 cv=4 URL，0 破图、0 对象图标 Cache Storage 条目。

### 修复「经常访问」公开图标重复请求（PROB-38）

- 根因：首页「经常访问」与普通分类会把同一本公开书签各渲染一个 `BookmarkCard`，两处本应命中同一条匿名对象代理 URL。但两层问题叠加导致同一图标被请求两次：① `src/views/Home.svelte` 渲染「经常访问」的 `CategorySection` 漏传 `publicCategoryIds`（默认空集合），登录态下 `isBookmarkIconAccessRequired` 把该区公开书签判成需要授权，于是发带 `key` 的 URL、普通分类发匿名 URL——两条不同 URL 各请求一次，带 `key` 的那条还绕过公开 edge cache；② 即便 URL 相同，两个 `BookmarkCard` 实例仍在同一 tick 各自 fetch。
- 修复：两处协同，都是最小改动。① `src/views/Home.svelte` 把 `publicCategoryIds` 传给「经常访问」的 `CategorySection`，公开书签在两处生成同一匿名 URL；私密书签与落在私密树下的公开书签仍带 `key`。② `src/lib/localBookmarkIconCache.ts` 对同源对象代理 URL 合并**在途**请求：按完整 URL（含 `v`/`cv`/`key`）索引，同一 tick 的重复加载共用一次网络请求，各自生成独立可回收 object URL，成功或失败都立即移除索引；不缓存完成结果，跨视图重挂仍重新经过可见性闸门。
- 影响：生产 `perf:audit` 的首页与搜索恢复阶段各减少 4 次重复图标请求（共 8 次），图标请求总数由 264 降至预算内；滚动阶段逐图标请求、对象图标 `no-store`、授权 `private, no-store` 和隐私撤回边界均不变。
- 验证：`npm run type-check` 318 files 0/0、`npm test` 134 files、`npm run build`、`git diff --check` 通过。单测覆盖同 URL 在途合并与独立 object URL、不跨授权/版本合并、各类失败后可重试；新增首页集成回归断言「经常访问」公开图标与普通分类区使用同一匿名 URL、私密与继承私密图标仍带 `key`。本地 build overlay 真实 Chrome 实测首页与搜索阶段图标请求由 17 降到 13；推送部署后以生产 `perf:audit` 复核 ≤260 门槛。

## v0.7.2 — 2026-09-30

### 修复登录态首页私密书签图标停在文字兜底（Issue #28）

- 根因：`/api/icon/:id` 对匿名请求按设计返回 `X-Icon-Fallback: 1` 的文字兜底图。私密书签、以及挂在私密分类（或其后代）下的公开书签都需要短期授权 `key` 才返回真实图标，而首页卡片此前没有接 `withIconAccessKey()`——该方法原先只在 `src/components/admin/*` 使用。于是登录态首页的私密书签永远停在兜底图；打开编辑弹窗会触发 `POST /api/bookmarks/:id/icon-cache/refresh` 写入 `icon_blob`，图标才"恢复"。
- 修复：把授权 key 接进书签图标状态推导链路。`src/lib/bookmarkCardIconState.ts` 的 `deriveBookmarkCardIconBase()`/`deriveBookmarkCardIconState()` 新增 `iconAccessKey`，经 `withIconAccessKey()` 作用于 `proxiedHttpIconUrl`，并让 key 参与 `createBookmarkCardIconStateKey()`——key 到位、续签或清除时重置失败态并重新预取，不被首次匿名兜底锁住。
- 判定规则收敛为一处：`src/lib/adminListState.ts` 新增 `getPublicCategoryIds()` 与 `isBookmarkIconAccessRequired()`，与 worker 的 `getPublicCategoryIds`/`isBookmarkIconAnonymouslyVisible` 严格互补（含私密祖先链、循环分类、`0/1` 与布尔混用）。判定用「可见集合」而非「隐藏集合」，使「书签指向已被删除的分类」这类陈旧数据也落到需要授权的一侧，避免永久兜底。
- 接线范围：`BookmarkCard`、`CategorySection`（逐条判定，覆盖「经常访问」这类混合区块）、`HomeCategoryScope`、`Sidebar`、`SpotlightBookmarkIcon`/`SearchSpotlight`、`Home`。key 由调用方按隐私判定下发，公开对象保持匿名 URL 以保留 edge / Service Worker 缓存；未登录时不下发。
- 顺带修正两处既有缺陷：`worker/routes/icon.ts` 的 `/icon/:id` 与 `/category-icon/:id` 异常分支此前无条件返回公开缓存策略（`public, max-age=300`），合法 key 的私密请求异常时会留下可被浏览器 HTTP 缓存复用的兜底图，现改为 `private, no-store`；`src/lib/iconAccessKey.ts` 的 `clearIconAccessKey()` 无法取消在途请求，旧 promise 可能在登出/改密后重新发布过期 key，现用授权代次作废其回调。
- 验证：`npm run type-check` 318 files 0/0、`npm test` 133 files/984 tests、build 成功；浏览器 L2（隔离实例 1280×800）公开书签匿名 `public, max-age=604800`、私密与私密分类树下书签带 key 且 `private, no-store`，三条卡片均渲染真实图标，Cache Storage 无私密图标条目。反向对照：把逐条判定改回无条件带 key、去掉授权代次判断、去掉异常分支的授权缓存策略，对应用例分别精确失败。独立 `workflow-reviewer` 复核发现的另一项既有问题（图标代理的匿名可见性判定发生在 edge cache 命中之后，可导致私密图标经缓存泄露）不在本 Issue 范围，已登记为 `docs/BACKLOG.md` 的 PROB-38。

### 修复页面底部书签右键菜单被视口裁掉（Issue #30）

- 根因：`BookmarkContextMenu.svelte` 固定从卡片下沿向下展开（`top: calc(100% - 6px)`），页面末尾最后一排卡片下方没有空间，菜单与「编辑」按钮被视口底边裁掉，真实鼠标无法命中。
- 修复：菜单挂载、更新、滚动或视口 resize 后读取父级卡片与菜单自然高度；有足够下方空间时保持向下，有足够上方空间时改为向上，否则按较大一侧夹紧 `max-height` 并允许内部滚动。保留 `position:absolute`、左右 8px、z-index、sortable filter、右键/长按、外部点击与 Escape 语义；嵌套分类选择器先消费 Escape，外层菜单控件的 Escape 仍可关闭菜单。
- 验证：type-check 318 files 0/0、npm test 134 files/991 tests、build 成功；新增 7 条几何/移动选择器/Escape 组件测试，去掉 placement 决策后 4 条精确失败。隔离 Chrome 1280×800、96 条书签滚到文档末尾真实右键：菜单 `top=701.13/bottom=745.79`，编辑按钮完全在视口内，真实点击打开编辑弹窗。

### 修复登录态切回标签页后首页私密书签消失（Issue #29）

- 根因：`src/App.svelte` 把焦点/可见性刷新无条件接到 `refreshPublicData()`；该函数在登录态仍以 `auth=false` 调 `api.public.getData(false)`（`src/lib/api.ts` 的 `publicApi.getData` 默认不带 Authorization），拿到匿名公开数据后经 `applyPublicData()` 覆盖首页绑定的 `publicStore`，而 `adminStore` 保留私密数据——于是首页只剩公开书签、后台却仍显示全部内容。
- 修复：新增 `src/lib/dataService.ts` 的 `refreshVisibleData()`，在事件触发时（不是在安装监听器时）读取 `isLoggedIn()` 分流：已登录走 `refreshLoggedInData()`（默认 `forceRemote=false`，保留 Issue #25 的数据版本门控），未登录走 `refreshPublicData()`。
- 401 降级：会话在后台失效时清 `authStore`/`adminStore`/**`publicStore`**/管理员快照后再回退公开刷新；`publicStore` 必须一起清，否则公开回退若也无快照且非 forbidden 失败，首页会在已登出状态下继续显示私密投影。
- 非鉴权错误按 `refreshPublicData()` 既有契约经 `hooks.onRootError` 上报，不再静默吞掉。
- 验证：`npm run type-check` 318 files 0/0、`npm test` 131 files/967 tests、build 成功；浏览器 L2（隔离实例 1280×800）四种组合——登录+public_mode 开（私密书签保留、无匿名 `/api/public/data`）、登出+公开模式、登录+public_mode 关、双标签页设置同步（`/api/data/version` 带 Authorization）；401 + 公开回退 500 场景首页正确降级为仅公开书签并清除会话。独立 `workflow-reviewer` 复核 PASS。

### Spotlight 结果显示真实书签图标

- Spotlight 结果行接入首页书签图标解析、Iconify 代理、本地缓存、缓存图标代理和失败回退链路；有真实图标时显示图片，图标加载失败或无图片时回退到书签自定义文字/标题首字符。
- 保持轻量结果行，不渲染完整 `BookmarkCard`；图标请求与 Cache Storage 预算需在部署后的 50 条 Spotlight 场景重新实测。

### 后台高级与视觉设置

- 取消“高级与视觉”二级菜单内的折叠，进入菜单后背景、尺寸、卡片表面和分类视觉设置直接可见。

### 修复默认搜索引擎切换不生效（Issue #25）

- 根因：`SearchBox.svelte` 只在“当前选中名不在引擎列表里”时才跟随 `search_engine.current`。Google→Bing 切换后 Google 仍是合法引擎，常驻的搜索框实例（设置面板实时预览、同会话首页）的选中引擎永远停在 Google，导致站点设置里切换默认引擎界面无效。
- 修复：跟踪默认引擎变化，默认引擎变更时清除用户手动选择标记并立即跟随新默认值；手动点选只在默认引擎不变时保持；选中项被移出列表后回落到当前默认引擎。
- 验证：新增 `tests/unit/searchBoxEngineSync.test.ts` 4 条回归（默认跟随、手动保持、默认覆盖、列表移除回落），反向对照旧逻辑精确失败。
- 修复后台默认搜索引擎下拉的真实交互：原生 select 先派发 `input` 再派发 `change`，而 Svelte `bind:value` 只在 `change` 提交；fieldset 的 `on:input` 会先克隆表单，把用户刚选中的选项在 `change` 到达前重置回旧值——表现为「选了没选中、保存按钮仍禁用」。修复：select 在自身 `on:input`（目标阶段，早于 fieldset 冒泡）立即提交 `current`，选项改用稳定 `index` key。新增 `tests/unit/searchEngineSettingsSelect.test.ts`（input 阶段即提交 + 完整序列保持），修复前精确失败。
- 补充（跨标签页同步）：后台保存设置后，其他已打开标签页里的首页此前要手动刷新才能更新（全站通病，无跨标签页同步机制）。新增 `installPublicDataFocusRefresh`：窗口重新获得焦点或页面恢复可见时，按数据版本门控刷新公开数据（数据未变化不发全量请求），防抖合并；切回已打开的标签页即可看到新默认引擎。新增 `tests/unit/publicDataFocusRefresh.test.ts` 4 条防抖/可见性/卸载回归。

## v0.7.1 — 2026-09-21

### 修复 v0.7.0 冒烟脚本 recover 场景（refs #24）

- 根因：`scripts/smoke-test.mjs` 的 `call()` 辅助函数只解构 `{ method, token, body }`，recover 段传入的 `headers: { 'X-Setup-Token': ... }` 被静默丢弃——三个「有效令牌」用例实际未带令牌头，全部返回 `401 unauthorized`；前两个 401 断言（错误令牌 / 缺令牌头）是碰巧通过。CI 自 170fd71（recover 功能提交）起即因此红线，与 merge 到 main 无关。
- 修复：`call()` 增加 `headers` 透传（`accept` 打底 → 附加头 → content-type → authorization）。
- **勘误**：v0.7.0 变更记录中「L1 smoke 83/83（恢复成功…）」表述不准确——该场景在本次修复前实际为 77/83（CI 与本地一致）；修复后 `npm run smoke` 83/83 全过，产品侧 `/api/recover` 功能不受影响（手工实测正常）。
- 验证：`npm run smoke` 83/83、`npm run type-check` 316 files 0/0。

## v0.7.0 — 2026-09-20

### 新增管理员密码恢复端点 `/api/recover`（REQ-14，Issue #24）

- 新增免登录的 `POST /api/recover`：已安装实例上用部署者持有的 `SETUP_TOKEN`（请求头 `X-Setup-Token`，常量时间比较）+ 同源校验 + `install_rate_limits` 表 `recover:<ip>` 独立命名空间限流，重置管理员密码而无需重新部署。**只重置密码、不改用户名**；新密码须 8–12 位且至少含小写/大写/数字/符号中的两类（恢复端点专用策略，与 `/install` 的 12–256 不同）。
- 成功只更新 `settings.admin_password` 并轮换 JWT secret 作废全部旧会话，返回 `LoginResp` 直接进入登录态；**刻意保留 `admin_bootstrap_password` 快照**——把它同步成新哈希会让未变的 `INIT_ADMIN_PASSWORD` 在下一次登录被判定为「初始化凭据变化」并回滚本次重置（该错误由 L1 smoke 场景发现并纠正）。未安装实例返回 `code=1002 not installed`，错误/未配置令牌返回真实 401，跨域 403，限流/密码校验走 `HTTP 200 + code` 包络。
- 忘记原 `SETUP_TOKEN` 时可在 Cloudflare **设置 → 变量和密钥 → 生产环境** 新增/轮换该密钥后重新部署——令牌不落库、每次请求实时读环境值。
- 重构：从 `worker/routes/install.ts` 抽出 `worker/lib/setupToken.ts`（`authorizeSetup` + `isSameOriginRequest`）与 `worker/lib/installRateLimit.ts`（限流四函数 + 常量，`client_key` 参数化），install 与 recover 共用、行为不变；admin 设置 key 常量从 `worker/lib/bootstrap.ts` 导出统一引用。
- 前端：新增 `/recover` 页面 `src/views/Recover.svelte`（复刻安装页视觉，无用户名字段），`src/App.svelte` 挂载 `/recover` 路由分支，登录弹窗新增「忘记密码？」入口，`src/lib/api.ts` 补 `authApi.recover`，`shared/types.ts` 新增 `RecoverReq`。
- 文档：`docs/reference/API_CONTRACT.md` 补 `POST /api/recover` 契约；`docs/guides/DEPLOYMENT.md`、`docs/guides/TROUBLESHOOTING.md` 恢复路径重排为三级（账号安全改密 → `/recover` → `INIT_ADMIN_*`/`RESET_ADMIN_CREDENTIALS` 重部署兜底）。
- 追加：部署密钥非 ASCII 字符前端校验——`src/lib/setupTokenInput.ts` 的 `isAsciiPrintableToken`（可见 ASCII 0x20–0x7E）接入 `Recover.svelte` 与 `Install.svelte`，含全角字符（如全角 `￥`）的令牌在提交前被拦下并给友好提示，不再暴露浏览器 `Headers` 构造的原始 `TypeError`。根因：HTTP 头值限 ISO-8859-1，`SETUP_TOKEN` 含非 ASCII 会让 `X-Setup-Token` 头无法构造。
- 验证：L0 `type-check` 316 files 0/0、`npm test` 948 tests、build 成功；单测 `recover.test.ts` 14/14、`recoverView.test.ts` 7/7、`setupTokenInput.test.ts` 4/4；L1 `npm run smoke` 83/83（恢复成功、错误/缺令牌 401、弱密码 1002、新密码可登录、旧密码被拒）。**部署后真实浏览器 L2 已完成**（`develop` 生产站点，ASCII 令牌 `123456#$%@ss`）：`/recover` 页面渲染（无用户名字段）、客户端密码校验、全角令牌被拦并显示友好提示；正向 round-trip 成功——恢复重置密码后旧密码失效、预置会话经 `rotateJwtSecret` 失效（`/api/me`→401），随后经 `/api/password` 还原原密码、站点状态复原。独立 `workflow-reviewer` 复核 PASS（低 severity 的 schema-less→`not installed` 已修）。Issue #24 在提交进默认分支并最终确认前保持 Open。

### 密码重置操作说明（使用手册）

- **适用场景**：管理员忘记密码，且 `INIT_ADMIN_*` 初始密码校验无法直接登录时，可用 `/recover` 免登录重置。
- **你需要**：部署者持有的部署密钥 `SETUP_TOKEN`。Cloudflare 用户在「控制台 → 设置 → 变量和密钥 → 生产环境」查看或轮换（轮换后重新部署生效）；本地实例经 `wrangler dev --var SETUP_TOKEN:...` 或 `.dev.vars` 注入。
- **操作步骤**：打开站点 `/recover`（或登录弹窗「忘记密码？」入口）→ 输入部署密钥 → 输入新密码（8–12 位，须同时包含小写、大写、数字、符号中的两类）→ 提交。成功后立即回到登录态。
- **生效范围**：只重置密码、不改用户名；同时轮换 JWT secret，全部旧会话立即失效、需重新登录；刻意保留 `admin_bootstrap_password` 快照，不影响后续 `INIT_ADMIN_PASSWORD` 的一致性校验（登录时若检测到该快照与初始密码一致会判定「初始化凭据未变」）。
- **错误语义**：未安装实例返回 `code=1002 not installed`；令牌缺失/错误返回真实 HTTP 401；跨域请求 403；连续失败按 IP 独立限流（`HTTP 200 + code` 包络）。
- **兜底链路**（改密偏好顺序）：后台「账号安全」改密 → `/recover` 页面 → 重新部署（以新 `INIT_ADMIN_*` 或 `RESET_ADMIN_CREDENTIALS` 环境变量覆盖后首次登录回写）。

### 后台管理界面审计整改 P0（对比度 / 焦点环 / 主题基建）

- 由 web-design-guidelines / frontend-design / brand-guidelines / extract-design-system / theme-factory 五个前端技能驱动的只读审计，决策记录 `docs/plans/_archive/ADMIN_UI_REDESIGN_DEVELOPMENT.md`；本版本落地其 P0 批次。P1（站点设置布局拆分、单滚动、预览联动）与 L2/L3 浏览器验证欠账见该文档。
- 对比度按 WCAG AA 复算收敛：浅色占位符 `#94a3b8→#64748b`（2.56→4.76）、暗色占位符 `#64748b→#94a3b8`（3.59→6.66）、后台徽标文字 `#64748b→#475569`（4.34→6.92）、浅色危险红 `#dc2626→#b91c1c`（4.41→5.91）。
- 主题基建：`src/app.css` 补 `color-scheme: light` 与 `:root[data-theme='dark']{color-scheme:dark}`；`index.html` 内联脚本让 `theme-color` 随 `data-theme` 动态（暗 `#08111f` / 浅 `#f8fafc`，MutationObserver 监听）。
- 消灭 token 漂移：`adminListPanels.css` 主按钮硬编码 `#2563eb/#fff` 收敛到 `var(--admin-accent)` + 新增 `--admin-accent-ink`（浅 `#ffffff` / 暗 `#0f172a`）。独立复核发现并修复 token 化引入的暗色主按钮对比度回归（白字 on `#7dd3fc` 仅 1.67:1），修复后浅 5.17 / 暗 10.71。
- 焦点：10 个组件的 `input/textarea:focus{outline:none; ring}` 与 settingsSections.css 两处多选择器规则统一为 `:focus-visible`（BookmarkBaseFields 的 input/select/textarea 一并收敛），保留 3px 可见焦点替代环。
- 验证：`npm run type-check` 315 files 0 errors / 0 warnings；`npm test` 128 files / 948 tests 全通过；`npm run build` 成功；`git diff --check` 干净。独立 Reviewer 两轮（首轮 CHANGES_REQUIRED 暗色主按钮回归 → 修复 → PASS）。L2 浏览器回归与 P1 布局整改未在本提交范围。

### 后台管理界面审计整改 P1/P2（设置布局 / 暗色层级 / 无障碍）

- 承接 `docs/plans/_archive/ADMIN_UI_REDESIGN_DEVELOPMENT.md` 的 P1/P2 批次（P0 已在上一节交付）。
- 站点设置信息架构拆分：二级菜单 6→7，新增「高级与视觉」，把 `AdvancedSettingsSection`（背景 / 尺寸 / 卡片表面 / 分类标题视觉）从「外观与卡片」移出，后者只留配色方案与卡片风格。外观分区展开高级后此前编辑区内滚约 1149px（约 3.5 屏），拆分后单分区编辑区内滚为 0。
- 设置页去三层嵌套滚动：`.settings-panel` 移除 `height: clamp(...)` 锁高与 `overflow: hidden`，编辑区不再自成滚动，交由外层 `.admin-content` 单一滚动；`.settings-preview-column` 改 `position: sticky` 桌面粘性跟随；`@media (max-width:1320px)` 收起为单列并让预览回落静态流。
- 布局与导航小栅格：`.navigation-grid > .field`（显示位置）占整行，两个条件开关成对落在下一行，修复「分类分行显示」开关此前单独占一行、右侧留白的孤立感。
- 自定义样式/脚本：三个 `textarea` 标签补 `HTML` / `CSS` / `JS` 单色 monospace 语言徽标。
- 暗色层级按「表面色差优先于阴影」提亮：`--admin-card-bg` 由半透明 `rgba(15,23,42,0.6)` 改不透明 `#141f33`（与页底 `#08111f` 拉开亮度差）、`--admin-border` 0.22→0.26、`--admin-card-border` 0.2→0.26；正文 `#e5eefb` on `#141f33` ≈ 14:1。浅色 token 不动。
- 动效收敛：移除 `AdminPageHeader` 图标按钮与设置二级菜单 hover 的 `translateY` 抬升，仅保留主保存按钮单点强调。
- 无障碍：后台新增「跳到主内容」skip-link（标准 `:focus` 显现，`href="#admin-main"`），`.admin-content` 补 `id="admin-main"` + `tabindex="-1"`；分类 / 书签搜索框补 `aria-label`。
- 焦点环 token 化：`src/app.css` 新增 `--focus-ring`（浅色保持原 `rgba(37,99,235,0.12)` 零回归，暗色改青色 `rgba(125,211,252,0.35)` 呼应强调色），11 处焦点环字面量收敛到该 token；顺带把 `LoginModal` 的 `input:focus` 补成 `:focus-visible`（P0 因该文件被并行任务占用而遗留，现已释放）。
- 验证：`npm run type-check` 316 files 0/0；`npm test` 128 files / 948 tests 全通过（含随 IA 拆分与单滚动重构同步更新的 `adminSettingsLayout`/`adminSettingsBehavior`/`designTokens`）；`npm run build` 成功；`git diff --check` 干净。本地 `wrangler dev` 真实浏览器（1440 视窗）实测：二级菜单 7 项 / 7 列、预览列 `position: sticky`、面板 `overflow: visible`、四个设置分区编辑区内滚均为 0、语言徽标渲染、暗色卡片 `#141f33` 对页底层差明显、skip-link 接线正确。独立 `workflow-reviewer` 两轮（首轮 CHANGES_REQUIRED：一个菜单用例仍写「六个分区」→ 补「高级与视觉」并改名 → 复检 PASS）。未改动任何并行任务文件（仅 `src/` 与 `tests/`）。


## v0.6.0 — 2026-09-20

功能版本。新增首页离屏搜索按钮与居中 Spotlight 命令面板（REQ-01）：`Ctrl/Cmd+K`、`/` 或浮动按钮唤起，即时检索、键盘导航、主题自适应，高亮项自动滚入可视区。同步收敛后台增删改编排（PROB-24）、后台公开对象图标恢复共享缓存（PROB-35），关闭 PROB-36（首页搜索防抖复核为测量伪影 + `perf:audit` 门禁时序加固）与 PROB-19v（登出撤销的会话存储失败分支），补齐详情卡片列宽缺失回退到 160px（refs #22）。部署来源为 `develop`。

### 新增离屏搜索按钮与居中 Spotlight 命令面板（REQ-01）

- 首页搜索框滚出视口后，右上浮动操作组出现搜索按钮（`search_box_show=false` 时恒显，保证始终有搜索入口）；点击按钮或全局 `Ctrl/Cmd+K`、`/` 唤起居中命令面板 `SearchSpotlight.svelte`，`Esc` 关闭。面板即时过滤，结果范围与首页完全一致（共用同一 `publicData.bookmarks`），空查询展示常用书签，上限 50 条，键盘上下/回车选中、回车打开书签详情。
- 组件懒加载（`ensureSearchSpotlightComponent`）；`openSpotlight` 在 await 加载前后各校验一次 `spotlightOpen / anyBlockingModalOpen / currentView / canSeeHome`，与登录/分类/书签/确认框/详情卡互斥（D-e），共用单槽滚动锁 `src/lib/pageScrollLock.ts`（从 `BookmarkEditModal` 抽出，单实例保存/恢复 `overflow`）。全局 keydown 守卫排除输入态与 IME（`isComposing`、`event.key === 'Process'`）。
- 离屏可见性由 `src/lib/searchBoxVisibility.ts`（IntersectionObserver，无 IO 时回退为可见）观测 `.hero-search`，Home 订阅透传给浮动操作组。搜索按钮常驻 DOM，用 `class:is-visible` + `opacity/visibility` 过渡（走 `--transition-base` 令牌，无字面时长，`prefers-reduced-motion` 关闭过渡）；隐藏态 `aria-hidden` + `tabindex=-1` 不可聚焦，并以 `position:absolute` 移出 flex 流避免按钮组空槽。
- 新增单测 `pageScrollLock.test.ts`、`searchBoxVisibility.test.ts`、`searchSpotlight.test.ts`、`homeFloatingActions.test.ts`（离屏按钮可见性/可聚焦/无障碍名与快捷键）。
- 验证：L0 类型检查 311 files 0/0、`npm test` 125 files / 923 tests 全通过、生产构建成功；L2 真实 Chrome 25/25（滚动进出按钮、Ctrl+K 唤起、居中面板、字母头像占位无图标请求、模态互斥、移动端无溢出）；L3 `perf:audit` 全部预算通过（含首页防抖 jank-immune 门禁、图标请求 232 ≤ 260、缓存 1.2 MiB ≤ 5 MiB）+ Spotlight 50 条探针。独立复核就竞态/过渡/IME/布局空槽提出四轮意见，均已 fix-forward 收敛。
- 上线后修复两处用户实测缺陷并在生产验证：面板配色此前硬编码深色、不随站点主题变化，改为默认亮色 `--spotlight-*` 变量 + `:global([data-theme='dark'])` 覆盖（对齐 `ConfirmDialog`）随主题自动切换；方向键导航此前不滚动，新增 `scrollActiveOptionIntoView`（`aria-activedescendant` 模式下焦点常驻输入框、浏览器不自动跟随高亮），高亮项超出面板时自动滚入可视区。真实 Chrome 生产实测：亮色面板白底深字、暗色深板浅字随 `data-theme` 翻转；50 条结果溢出时连按 ArrowDown 高亮项 `scrollTop` 持续跟随、始终可见。
- **使用说明**：
  - **唤起**：首页按 `Ctrl+K`（macOS `Cmd+K`）或 `/`；向下滚动使顶部搜索框离开视野后，也可点击右上角浮动的搜索按钮（`search_box_show=false` 时该按钮恒显）。
  - **检索**：输入关键词即时过滤书签标题 / 网址 / 分类；空关键词展示最常访问的书签，结果上限 50 条。
  - **键盘**：`↑` / `↓` 移动高亮（到端循环）、`Home` / `End` 跳首尾、`Enter` 打开当前项、`Esc` 关闭；高亮项自动滚入可视区。
  - **打开方式**：沿用每个书签自身设置（新标签页 / 当前页 / 站内弹层）。
  - **主题**：面板配色随站点亮 / 暗主题自动适配。

### 关闭 PROB-36：首页搜索防抖复核为测量伪影，perf:audit 门禁时序加固

- 复核结论：首页搜索**不缺防抖**。`src/views/Home.svelte` 既有 120ms 尾沿防抖（`SEARCH_FILTER_DEBOUNCE_MS` + `scheduleSearchFilterUpdate`），书签过滤/列表重渲染只读防抖后的 `deferredSearchQuery`；隔离 Chrome 正常负载复测 3/3，连打 `n`/`np`/`npm`（间隔 ~46ms < 120ms）settle 前 **0 次 mutation**，防抖窗过后一次重建（7 records）。
- 上轮 L3 `perf:audit` 报出的 16 次 mutation 是测量伪影：那次运行全程 ~294s（约 10 倍负载），固定 45ms 的按键间隔被主线程拖到超过 120ms 防抖窗，防抖在打字途中触发了一次重建并计入 settle 前计数。
- 工具加固（`scripts/perf-audit.mjs`）：`runHomeSearch` 改为记录每次按键真实时间戳与 mutation 批次，门禁只断言「最后一次按键后 60ms 判定窗内无立即重渲染」（未防抖实现会在一个 tick 内命中，卡顿不影响判定）；另报 `rebuiltAfterSettle` 正向佐证搜索链路在工作。复跑 `npm run perf:audit` 该项通过（`immediateAfterLastKey=0`，gaps 55/45ms，settle 后 7 records），其余 9 项预算同轮通过（图标请求 232 ≤ 260、缓存 1.2 MiB ≤ 5 MiB、首页 0 破图、一方请求失败 0）。

### 关闭 PROB-19v：登出撤销的会话存储失败分支闭环

- 登出撤销的 `store_unavailable` 分支（`worker/routes/auth.ts` 的 `POST /logout`：`SESSION` 绑定存在但 `revokeSession` 写入抛错时返回 `{revoked:false, reason:'store_unavailable'}`、HTTP 200 且不谎称撤销成功）已由 `tests/unit/sessionRevocation.test.ts` 路由级单测覆盖——注入 `put` 抛错的 KV，断言响应体，并与 `store_unconfigured`（缺绑定）区分。
- happy path（登出后旧 token 在 15 秒窗口内被拒）三次生产实测 178 ms / 212 ms / 216 ms，均远低于窗口。生产 KV 故障注入不可行且不必要，失败分支的可观察契约已由单测闭环。据此从 `docs/BACKLOG.md` §3 移除，正式关闭。
- 本次为文档 / 状态收尾，未改源码或测试；`sessionRevocation.test.ts` 复跑 11/11 通过。

### 后台公开对象图标改用匿名代理 URL 恢复共享缓存（PROB-35）

- 后台分类 / 书签 / 访问分析三个面板此前无条件给所有对象代理图标 URL 附加授权 `key`，使公开对象的响应也变成 `private, no-store`、丢失 edge / 浏览器 / 分类 Service Worker 缓存，每次渲染都为每个图标回源一次外站。本轮按「有效可见性」分流：公开对象改用不带 `key` 的匿名 `/api/{icon,category-icon}/:id?v=...`（恢复共享缓存），有效私密对象继续带签名 `key`。
- 有效私密判定复用既有前端镜像 `getHiddenCategoryIds`（与 Worker `getPublicCategoryIds` 由 `tests/unit/publicVisibility.test.ts` 交叉断言，覆盖私密祖先链与循环链）：分类看自身是否落入 hidden 集，书签看 `is_private` 或所属分类是否落入 hidden 集——覆盖「公开子分类挂私密根下」「公开书签在私密分类树下」两种 Worker 匿名拒绝条件。
- 不改 Worker 判定顺序、缓存命名空间、TTL、`no-store` 边界与 `withIconAccessKey` 签名；首页公开卡片本就不带 `key`，未受影响。
- 新增 `tests/unit/adminIconAccess.test.ts`：三个面板 mount 后断言渲染 `<img src>` 的 key 分流（公开无 `key`、私密与私密树下对象带 `key`，含祖先链情形）。
- 验证：L0 类型检查 0 errors / 0 warnings、`npm test` 122 files / 906 tests 全通过、生产构建成功。图标链路属缓存 / 性能相关：后台 L2 浏览器分流与推送后的 L3（真实 edge/SW 命中、`perf:audit` 图标请求与 Cache Storage 预算）未跑，进发版前清单。

### 后台增删改编排收敛到 runAdminMutation（PROB-24）

- `src/App.svelte` 里分类 / 书签 / 设置的创建、编辑、删除、批量删除、批量移动共 8 个处理器各自重复的 `try/catch/finally + 成功 Toast + 刷新` 样板，收敛到新的纯编排函数 `src/lib/appAdminMutation.ts` 的 `runAdminMutation`（对齐既有 `runOptimisticSort` 的「纯函数 + 回调选项」约定）。行为不变：成功文案、busy 标记清理时机、批量条件刷新、`handleBatchMoveBookmarks` 的失败重抛、设置提交不触发数据刷新等逐条保持。
- 只做这一块编排收敛，未触碰安装 / 引导、鉴权、排序、reorganize 等其余处理器。
- 新增 `tests/unit/appAdminMutation.test.ts` 断言 run→onSuccess→成功 Toast 的顺序、run 与 onSuccess 抛错统一落 onError、rethrow 重抛原始错误、successMessage 返回空串不弹 Toast、onSettled 恒执行；`tests/unit/confirmationFlow.test.ts` 一条随调用形态改变而失效的源码文本断言改为形态无关的接线存在性检查。
- 验证：L0 类型检查 0 errors / 0 warnings、`npm test` 121 files / 903 tests 全通过、生产构建成功。App.svelte 组件层的 L2 浏览器回归未跑（无可达实例与管理员凭据），进发版前清单。

### 详情卡片列宽缺失回退补齐到 160px（refs #22）

- v0.5.1 只把数据层默认（schema seed、`CARD_SIZE_DEFAULTS`、Home 兜底）改为 160px，组件与 CSS 层仍残留 200px 兜底：`CategorySection` / `BookmarkCard` 的 width prop 默认、两张卡片的网格与外壳 CSS fallback、`getInfoCardTrackWidth` 的非有限输入回落。本轮把这 5 处全部统一到 160px，使首次部署或缺失设置时详情卡列宽下限与共享默认一致；用户显式保存的宽度不迁移。
- 验证：L0 类型检查 0 errors / 0 warnings、`npm test` 120 files / 898 tests 全通过、生产构建成功。

## v0.5.1 — 2026-09-18

问题处理与优化补丁版本。恢复首页书签图标本地优先缓存并补齐部署验证；修复分类/Iconify 图标与搜索在瞬时失败下的恢复、SPA 资产重定向边界、编辑后提示误报「已创建」、详情卡片列宽控件命名；同步 README 与站点截图。部署来源为 `develop`。

### 首页书签图标恢复本地优先加载

- 聚合接口继续只返回 `icon_cached` 轻量标志；首页在本地缓存未命中时，先从 `cf-navs-bookmark-icons-v1` 读取，若 D1 已有持久化图标则抓取一次稳定的 `/api/icon/:id` 响应写入浏览器 Cache Storage，再把本地对象 URL 交给图片元素。
- 恢复异步 Cache Storage 读取期间的等待，避免本地副本尚未读完时先挂载远程 `<img>`；fallback SVG、`private, no-store` 与超过 512 KiB 的响应不进入本地图标缓存，历史脏条目读取时删除，代理失败后回退到已保存的原始 HTTP(S) 图标 URL，后台列表异步读取使用共享请求序列。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 120 files / 897 tests 全通过；`npm run build` 成功；新增首页组件级重挂载用例确认首次写入 Cache Storage、重新挂载不再请求 `/api/icon`。
- 部署的本地测试站点真实 Chrome 验证：隔离 profile 首访成功填充 `cf-navs-bookmark-icons-v1`（192 条），热刷新与关闭后重开首页的 `/api/icon/*` 网络回源均为 0（全部命中浏览器缓存），破图 0；控制台错误、页面异常、失败请求与非预期 4xx/5xx 均为 0。L3 性能预算（Cache Storage 总量）仍未执行。

### 分类与 Iconify 图标瞬时失败恢复

- 图标代理抓取外站图标失败时按性质分流：`404`/`410`、非图片载荷或超出大小上限记为「图标不存在」，兜底 SVG 沿用 5 分钟短缓存；超时、网络错误、`429`/`5xx`、空 body 记为「瞬时失败」，兜底 SVG 改为 `no-store`，不再写进 edge、Service Worker 或浏览器缓存。此前一次瞬时失败会把文字兜底钉住整个 5 分钟缓存期，而响应是 `200 + image/svg+xml`，在网络面板里与真实图标无异——这正是「图标请求明明加载成功、界面却回退成文字」的成因。
- `CategoryIcon.svelte` 的失败态由单向闩锁改为可恢复：首次加载失败先带 `&retry=1` 重试一次，重试仍失败才显示标题首字；图标或授权 key 变化时重置计数。
- Iconify 候选搜索在 SVG 检查被上游限流或瞬时失败时，返回原始 Iconify 候选而不是 502 或空结果；检查不完整的响应不写入十分钟搜索缓存，后续请求可恢复完整元数据。
- 书签/分类编辑弹窗的 Iconify 候选搜索改用 `AbortController`：切换关键词或关闭弹窗时取消在途请求，避免过期候选回填。
- 现象在测试站点实测复现：并发 30 个图标请求整批返回 `200 + X-Icon-Fallback: 1` 的文字 SVG，同一批图标串行请求与浏览器直连 `api.iconify.design` 全部成功；逐条点开分类编辑弹窗本身没有控制台报错。
- 验证：L0 类型检查 0 errors / 0 warnings、119 files / 890 tests、生产构建通过、`git diff --check` 干净；L1 冒烟 75/75。新增用例做过反向对照：暂时还原 `src/components/CategoryIcon.svelte` 与 `worker/` 改动后，组件 3 例、路由 2 例精确失败。未部署，未跑部署后的 L3。
- 已知残余：后台列表的图标 URL 带授权 `key`、响应是 `private, no-store`，因此每次进入后台仍会为每个图标抓一次上游；上游瞬时失败的窗口里那一屏仍会显示文字兜底（下一次加载即恢复，不再持续 5 分钟）。是否改为「公开对象在后台走匿名缓存 URL」或「服务端瞬时失败时回退到最近一次成功的图标」留待裁定，见 `docs/BACKLOG.md` 的 PROB-35。

### 构建分包与 SPA 回退边界修复

- 缺失的 `/assets/*` 构建分包现在返回 404，不再被 SPA `index.html` 回退伪装成 JavaScript；文档导航仍由 Worker 显式回退到应用壳。
- Cloudflare Assets 把未知无扩展名路径重定向到 `/` 时，Worker 识别该 3xx 响应并按文档导航回退应用壳，避免客户端路由被重定向带走。
- Service Worker 由构建产物指纹自动生成缓存版本，并拒绝、清除构建资源 URL 上的 HTML 响应，避免旧壳与已删除 hash 分包混存导致懒加载失败。
- 验证：Worker 与 Service Worker 聚焦回归 25/25；完整 `npm test` 118 files / 872 tests、`npm run type-check` 0 errors / 0 warnings、`npm run build` 通过，构建产物自动生成带 12 位十六进制指纹的 SW 缓存名；未执行部署后的生产与认证浏览器验收。

### 编辑后正确报告「已更新」

- 分类与书签的提交意图只由表单 id 决定，不再在弹窗状态重置后误读为「创建」：编辑保存后 Toast 正确提示「已更新」而不是「已创建」，接口稳定走更新分支。

### 鉴权与分类流程重构

- 登录、登出、后台进入、分类创建/编辑等用例从 `App.svelte` 抽取为独立函数，动作顺序与状态清理保持一致；行为不变，纯内部重构。

### 详情卡片列宽控件命名澄清（refs #21）

- 设置页「卡片最小宽度」更名为「详情卡片列宽下限」，说明文字、无障碍名与测试用例同步；仅文案澄清，不修改保存逻辑或数值边界，不据此声称云端 Issue 已关闭。

### 新安装默认卡片宽度调整

- 新安装及缺失 `card_size` 设置时，详情卡片最小宽度默认由 80px 调整为 160px；已有 D1 中已保存的卡片宽度不迁移。
- 验证：L0 类型检查 0 errors / 0 warnings、116 files / 862 tests、生产构建成功；L1 冒烟测试 75/75；L2 真实 Chrome 回归通过，无控制台错误、页面异常或失败请求。

### 侧边栏子分类颜色与自定义强调色布局修复（#18）

- `Sidebar.svelte` 的 `.toc-child-item` 普通态显式使用 `--toc-text`，修复暗背景下文字和计数落到浏览器默认黑色的问题；悬停、键盘焦点和选中态继续使用 `--toc-accent`，保留自定义主题色与分类字号。
- `BackgroundSettingsSection.svelte` 为两个自定义强调色字段设置 6 列跨度；视口不超过 960px 或设置编辑容器不超过 620px 时占满整行。沿用设置页现有响应式规则，修复字段默认只占 12 列网格中一列而导致的标签折行和输入框挤压，不修改字段绑定或保存逻辑。
- 干净隔离 Chrome 中先复现普通子分类 `rgb(0, 0, 0)` 与约 32px 字段 / 26px 输入框，再验证修复后暗色文字为 `rgb(229, 238, 251)`；1920、1440、1280、1024、960、720、390px × 深/浅主题共 14 组颜色和几何检查通过，PC/窄屏截图已检查。实际键盘导航、悬停、自定义主题变量、两套色值独立输入/提交和取色弹层 Escape 关闭通过，浏览器未见控制台错误、页面异常、失败请求或异常 HTTP 响应。
- L0：类型检查 0 errors / 0 warnings，116 files / 862 tests 全通过，生产构建通过。视觉检查使用当前真实组件的临时离线页面；提交回调与保存值重载仅使用测试专用本地存储，不代表真实 API/D1 持久化或生产验收。未启动开发服务器、部署或关闭 Issue；其他 Issue 与 PR 未处理。

### 文档与站点截图更新

- 纯文档/资源：README 重写与产品预览截图刷新、控制台部署插图恢复、项目状态记录同步。

## v0.5.0 — 2026-09-13

前端工具链安全升级与真实部分导出验收版本。分别闭环本地 `PROB-34` 与 `PROB-14`；不重写现有导入/导出业务，不扩大到未批准的功能需求。部署来自 `develop`，`main` 仅归档已验证的发布结果。

### 发布验收

- `package.json` 与锁文件版本统一为 0.5.0；最终 L0 为类型检查 0 errors / 0 warnings、116 files / 862 tests、生产构建成功，完整依赖审计 0 项。两项编号分别提交，未混合闭环。
- 隔离 L1 75/75、真实 Chrome L2 25/25、生产只读验收 30/30；非空子集及本地真实文件回导证据见下方 PROB-14。430×932、768×1024、1440×900 三档生产截图已检查。
- 生产性能 9 项门禁全部通过，另记录 1 项第三方资源失败信息：本站请求失败 0、首页 371 张卡片且 0 破图、管理数据传输 37,518 B、书签图标请求 234 次、Cache Storage 691,942 B，均在现有预算内。
- 性能检查执行现有脚本，本机临时适配器使用项目 `ws` 并持有测试专用 CDP 会话；不改变指标或阈值。最终测试 target、浏览器、profile 与端口均核验清理，临时驱动和本地数据库已移除。
- 未声明真机 L4、其他未批准功能或本地冷缓存硬导航观测已修复；这些边界及一次硬导航自动恢复的记录保留在对应决策记录中。生产没有执行导入、改设置或密码轮换。

### 前端工具链安全迁移（PROB-34）

- 升级并锁定 Svelte 5.57.0、Vite 7.3.6、Svelte 插件 6.2.4、Vitest 4.1.11、Testing Library 5.4.2 与 Svelte Check 4.7.6；完整 `npm audit --include=dev --json` 为 0 项，不使用强制修复或忽略 peer 依赖。
- `src/main.ts` 改用 Svelte 5 `mount`；保留受支持的组件语法和 test-only `browser` 解析条件。组件测试迁移到 `events` / `rerender`，删除私有运行时字段断言；修正两处对话框容器与书签触控分组的无障碍语义。
- Node.js 要求调整为 22.12+（22.x）或 24+，CI 继续使用 24 LTS。旧锁文件的插件 peer 图无法联合解析时，在临时目录生成一致的新锁文件，再以 `npm ci` 验证安装。
- 验证：类型检查 0 errors / 0 warnings，115 files / 856 tests，生产构建、隔离 L1 75/75 与真实 Chrome L2 25/25 通过；浏览器回归无控制台错误、页面异常、失败请求或非预期 HTTP 错误，密码轮换及恢复仅在临时本地库执行。
- 另以原生输入验证首次安装、键盘子菜单与 Escape 焦点恢复、批量移动/删除弹窗打开取消，以及 390px 后台布局。测试 Chrome 的精确 profile 进程数均为 0，端口关闭、profile 删除；生产验证结果见本版验收记录。

### 真实部分导出与复杂样本验收（PROB-14）

- 删除只选首个根分类并自行构造 Blob 的弱探针；复现了「1 个空分类、0 个书签仍通过」的假阳性。现在使用真实鼠标操作导出界面，在应用下载边界读取真实 Blob，按完整记录验证父分类补齐、子集排除、父分类整支及设置开关。
- 增加缺少非空子分类/排除样本时的明确 `skip`；空选验证按钮禁用。生产禁止原生磁盘下载，备份正文仅在内存比对，报告不保存分类/书签内容。
- 生产从 47 个分类、601 个书签中验证：子分类导出 2 类/25 书签（含父分类，分别不含/包含设置），父分类整支导出 3 类/54 书签；只读验收 30/30、无失败或跳过。没有在生产执行导入或设置写入。
- 隔离本地实例通过真实文件输入和确认框回导：追加后 3 类/3 书签，原有记录与重复链接保留；覆盖后 2 类/1 书签，父子关系、归属、设置与管理员会话正确。该原生入口场景无控制台错误、页面异常、失败请求或异常 HTTP 响应。
- 新增 6 条拒绝弱样本/整站冒充子集/缺父级或重复记录/内容错配/设置泄漏的回归；完整 L0 为 116 files / 862 tests，类型检查 0 errors / 0 warnings，构建通过。测试 Chrome 及 profile 已精确清理，未覆盖的真机事项仍按台账保留。

## v0.4.0 — 2026-09-13

首个主项目正式版本。经维护者确认，将原拟 `v0.2.0` / `v0.3.0` / `v0.4.0` 三批累计成果合并发布；历史切点只保留为开发记录，不补发旧 tag，也不将生产回退到缺少安全修复的旧快照。浏览器扩展的 `extension-v0.2.1` 是独立产品版本，不受本次发布影响。

### 发布与验收记录（REL-01）

- [GitHub Release v0.4.0](https://github.com/lbjxr/CF-Navs/releases/tag/v0.4.0) 已发布；注释 tag 指向 `e60e9f0d0441ab74c2205d4161021f83cfb8b80e`。与完成生产验收的 `0bf26eb8e26f897bf5c71038ab1cc9826913665d` 相比，仅两份发布/生命周期文档有变动，运行时代码和依赖一致。
- 本地类型检查 0 errors / 0 warnings、115 files / 856 tests、构建、隔离 L1 75/75 及 R-01～R-08 真实 Chrome 验收通过；[最终 CI](https://github.com/lbjxr/CF-Navs/actions/runs/34704869683) 与 Workers Builds 检查通过。
- 生产只读验收 27/27，无失败或跳过；性能审计 10/10（含一项第三方资源信息记录）。实际部署入口为 `/assets/index-cMGWuog6.js`，登出撤销 198 ms；430×932、768×1024、1440×900 三档截图已检查。
- 所有测试 Chrome 均使用本轮专用 profile；清理后独立核对对应进程数为 0、端口关闭、profile 删除。没有复用或关闭用户日常 Chrome。
- 生产导出探针采样为 1 个分类、0 个书签；非空子分类导出及追加/覆盖回导在临时本地库验证。`PROB-14`、`PROB-34` 及其他未覆盖事项继续保留，`REL-01` 按已批准的单一 v0.4.0 方案完成。

### Issue 生命周期闭环（REL-02）

- 发布与验收完成后，依次向 [#10](https://github.com/lbjxr/CF-Navs/issues/10#issuecomment-5647377841)、[#11](https://github.com/lbjxr/CF-Navs/issues/11#issuecomment-5647378171)、[#12](https://github.com/lbjxr/CF-Navs/issues/12#issuecomment-5647378957)、[#13](https://github.com/lbjxr/CF-Navs/issues/13#issuecomment-5647379242) 及综合反馈 [#9](https://github.com/lbjxr/CF-Navs/issues/9#issuecomment-5647412925) 评论 `v0.4.0` 与实际验证范围，并逐项核实为 `Closed / completed`。
- 复查时仍开放 [#15（EdgeOne）](https://github.com/lbjxr/CF-Navs/issues/15) 与新增的 [#16（跨设备随手记 / 便签）](https://github.com/lbjxr/CF-Navs/issues/16)；#16 未纳入本版范围，不自动分配 R 编号或承诺实现。
- `REL-02` 完成并从未完成台账移除，需求文档更新为本次云端快照；实时状态仍以 GitHub Issue 为准。没有修改 Project 或合并 `main`，`PROB-14`、`PROB-34` 及其他未覆盖事项继续保留。

### 历史批次归并

- 原 `v0.2.0` 批次：R-01～R-08 的书签整理、首页入口、分类定位、视觉参数与部分导出，以及移动端编辑、排序和分类树滚动修复。
- 原 `v0.3.0` 批次：批量移动后果提示、13 套毛玻璃预设强调色，以及 API 契约和需求追溯整理。
- 原 `v0.4.0` 批次：私密图标访问与缓存隔离、会话安全、组件交互回归、移动端布局、Code scanning / CI 整改，以及本次发版验收补齐的分类定位与 40 px 保存修复。

### 发布范围与已知限制

- 书签支持一级、二级及空分类目标的移动与排序，后台支持批量移动；编辑书签时定位当前分类。
- 登录态首页提供新建主分类、子分类入口，移动端保留可触控操作；支持分类字号和图标尺寸设置、40 px 卡片宽度下限、部分导出备份及顶部导航分行。
- 包含私密图标访问授权与缓存隔离、会话撤销与存储绑定检查、Code scanning 整改，以及 Node.js 24 CI 和兼容依赖安全补丁。
- 包含组件交互测试、移动端布局和滚动修正、预设与自定义背景强调色等累计改进。以下开发记录保留各轮取舍和验证依据。
- 追加导入按分类完整路径复用分类并保留重复链接，覆盖导入会替换全部分类和书签；这是按分类备份与恢复能力，不承诺自动双向或去重同步。
- EdgeOne 兼容尚未实现（#15）；Svelte / Vite / Vitest 的 9 项依赖审计仍由 `PROB-34` 跟踪，按维护者决定另行迁移。其余需真机或特殊环境的验证欠账仍以 `docs/BACKLOG.md` 为准，不因本次发版自动关闭。

### 40 px 卡片宽度保存校验修复（#13）

- `SettingsPanel.svelte` 的保存校验改为复用 `shared/settings.ts` 的 `CARD_SIZE_LIMITS`，移除仍停留在 44 px 的旧下限，宽高边界与输入控件和归一化逻辑保持一致。
- 新增 40 px 保存回归：旧实现的按钮保持禁用，修复后可以提交且载荷保留 40；原生 Chrome 输入并保存后，真实本地 API 返回 `card_size.width=40`。
- 验证：定向 3 files / 38 tests、完整 115 files / 856 tests、类型检查与构建通过。所有修改设置的浏览器验收均使用临时本地数据库，没有改动生产设置。

### 新建子分类后的首页定位修复（#11）

- `Home.svelte` 的 `focusCategory` 先等待当前响应式更新完成，再修改分类选择映射；避免派生分类分组未重新计算，导致新建子分类后侧栏已展开、首页却仍显示父分类书签。
- 新增完整 Home 组件回归，覆盖父分类已有直属书签时新增空子分类并发送定位请求：原实现失败，修复后新子分类被选中且父分类书签不再显示。
- 验证：定向 3 files / 31 tests、完整 115 files / 855 tests、类型检查与构建通过；隔离 Chrome 使用原生鼠标/键盘创建子分类，确认父级预填、持久化结果、自动选中及可见性。未在生产执行数据写入。

### Code scanning 整改与 CI 运行时修复

- CI 改用 Node.js 24 LTS 与 `actions/checkout@v6`、`actions/setup-node@v6`，显式设置 `contents: read` 并关闭凭据持久化；项目声明 Node.js 22 最低版本，保留完整 L0 + L1 闸门。
- 书签导入与页面元数据共用单次实体解码，完善文本、注释和字符引用的解析边界；安全回归脚本改用加密安全随机值，并修复默认检查与凭据恢复结果的判定。
- 兼容范围内更新依赖：锁定 Hono 4.13.7、Wrangler 4.131.1、nanoid 3.3.19；完整依赖审计由 15 项降至 9 项，其余需大版本迁移，记于 `docs/BACKLOG.md` 的 `PROB-34`，未将它们忽略或宣称已修复。
- 验证：类型检查 0 errors / 0 warnings；114 个测试文件、854 个用例通过；构建成功；使用仓库公共配置的隔离 L1 冒烟 75/75，状态目录与监听端口已清理；`actionlint` 通过。CodeQL 2.27.0 标准套件的 JavaScript/TypeScript 与 Actions 均为 0 告警，覆盖原有四类规则；GitHub 告警关闭仍以关联分支重扫为准。

### 排序异步初始化生命周期修复（PROB-33）

- `src/lib/sortableList.ts` 的 `sortableList` action 增加销毁标记与初始化代次；动态导入完成后，仅当前仍有效的初始化可以创建或销毁实例，阻止组件卸载后的拖拽实例复活与连续更新造成的重复创建。排序、跨分类转移与调用方契约不变。
- 新增 4 条真实 SortableJS 生命周期回归，只延迟模块加载，不替换实例实现；覆盖待加载时销毁、连续配置更新、禁用后重新启用及缓存命中时销毁、配置未变化时保留初始化。原实现其中 3 条失败，修复后 4 条全部通过。
- 完整验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 113 files / 845 passed，无未处理异常；`npm run build` 成功。`PROB-33` 从未完成清单移除，根因与边界记录于 `docs/plans/PROBLEM_HANDLING_TASK_LIST.md` 的同名条目。
- 隔离 Chrome 挂载真实 action 与 SortableJS，原生鼠标拖拽验证同列表顺序、跨分类转移载荷、禁用与重新启用；销毁后无活动实例，控制台错误、页面异常、失败请求与异常 HTTP 响应均为 0。临时浏览器与 profile 已清理；未验证生产持久化与真机触摸。

### 移动端顶部导航释放操作按钮预留

- `Sidebar.svelte` 的移动端 `.top-track` 宽度改为 `100%`，取消旧多按钮布局扣除的 `8.5rem`；分类使用完整导航轨道，横向滚动、子菜单、独立「更多操作」入口和桌面布局保持不变。
- 隔离 Chrome 挂载真实导航与功能按钮组件，320 / 390 / 600 / 799 / 800 / 1280 / 1650 / 1651 / 1920px 下的滚动、分行配置共 18 组几何检查通过；390px 轨道由 228px 增至 364px，左右边距均为 5px。原宽度反向对照会重新产生 141px 右侧空白。
- 浏览器原生鼠标输入验证分类选择、子菜单开关与 Escape 焦点恢复、操作菜单、滚动末项可达，以及桌面滚轮横滚 240px；无控制台错误、页面异常、失败请求或异常 HTTP 响应。未执行生产验收，未验证真机触摸滑动。
- 导航定向测试 3 files / 35 passed；在独立修复排序生命周期阻塞 `PROB-33` 后，完整 `npm run type-check` 0 errors / 0 warnings、`npm test` 113 files / 845 passed（无未处理异常）、`npm run build` 均通过。导航修复与排序修复分别提交。

### 首页分类与导航交互修正

- 一级分类选中态从整块分类区外框改为仅包围标题与总站点数，避免强调色喧宾夺主。
- 修复选中二级分类后无法再次选择一级分类的问题；显式选择一级分类不再被空根分类的默认首个二级分类回退覆盖。
- PC 端「新增书签 / 排序」操作行按一级分类标题行高度垂直居中；移动端既有操作收纳规则保持不变。
- 恢复 PC 顶部导航的鼠标滚轮横向滚动，并保留滚动边界、桌面分行和移动端分行行为。
- 验证：定向测试 3 files / 43 passed；`npm run type-check` 0 errors / 0 warnings；`npm test` 112 files / 830 passed；`npm run build` 成功；`git diff --check` 通过。测试站点在用户现有 Chrome 的专用标签页完成视觉与交互复核：选中框、真实鼠标点击下的根/子分类切换、操作行中心偏差 0.43 px，以及页面内 `WheelEvent` 驱动顶部导航横向移动 240 px 均通过；Relay 的真实 `mouseWheel` 输入两次因 20 秒 RPC 超时，未将其作为独立鼠标输入通过证据。无 console error、页面异常、失败请求或异常 HTTP 响应。

### 首页分类层级与操作按钮细化

- 二级分类字体在桌面与移动派生值中限制为至少比一级分类小 1px，同时保留用户原有字号设置范围。
- 一级分类与二级分类统一使用相同的选中边框、背景和底部强调线，移除一级分类独有的大面积强调阴影。
- 根按钮与二级标签共享相同的按钮基础 chrome（PC/移动端尺寸、内边距、圆角、透明度和 hover/focus 过渡），一级分类字体层级保持更高。
- PC 操作行按「新建子分类 → 新增书签 → 排序」排列；新建子分类复用新增书签按钮样式，移动端仍由「更多操作」菜单承载。
- 三按钮操作行对应的子分类标签右侧预留同步调整为 300px，避免横向滚动末端被遮挡。
- 验证：定向测试 3 files / 28 passed；`npm run type-check` 0 errors / 0 warnings；`npm test` 112 files / 834 passed；`npm run build` 成功；`git diff --check` 通过。

### PROB-20c：Cloudflare edge cache 观测结论

- 已复用用户已登录的 Cloudflare Dashboard，只读确认目标 Worker 已部署最新版本；Cloudflare Worker Observability 与 Workers Traces 当前因免费版不可用，Cloudflare Trace 仅提供配置模拟，未展示 `caches.default` 实际 key。
- 用户明确要求按此平台边界将 PROB-20c 标记完成，备注为免费版 Cloudflare 不做 Observability/Workers Traces 验证。代码层 `ICON_CACHE_NAMESPACE='2'` 与匿名/授权响应指纹证据保留在既有记录中；未执行缓存 purge、权限修改或 Issue 操作。

### PROB-32：优化一级分类空态选择

- 删除首页一级分类下的「本分类」语义 tab。一级分类有直属书签时保留根内容并以边框、强调背景和阴影表示选中；直属书签为空且有二级分类时自动选择排序最前的第一个二级分类。
- 根分类模式下二级入口使用普通按钮组，选中二级分类时恢复 `tablist` / `tab` 语义；面板在根模式由现有一级标题标记，避免悬空 `aria-labelledby`。
- 滚动定位、新建分类聚焦和键盘方向键/Home/End 均复用新的选择回退规则；删除新建分类后的失效 root-tab click。
- 新增纯函数与组件行为回归测试，移除过时的「本分类」源码文本断言。
- 验证：目标测试 3 files / 27 passed；`npm run type-check` 0 errors / 0 warnings；`npm test` 112 files / 826 passed；`npm run build` 成功；`git diff --check` 通过。生产部署后的真实首页视觉仍待发布后验证。

### PROB-17：补齐后台备份与导入页移动端证据

- 通过真实 Chrome 生产页面登录后在 `390×844` 视口打开「数据备份与导入」，确认导出分类树、导出按钮、导入来源/模式和文件入口均在页面内，`document.body.scrollWidth` 与视口宽度均为 390，无横向溢出。
- 截图证据落在 Git 忽略目录 `tmp/acceptance/admin-backup-mobile-390x844.png`，未进入提交。
- 验证：生产站点真实浏览器页面，登录成功；移动端面板可访问，布局无横向溢出；关闭测试 tab，未关闭用户浏览器。

### PROB-18c：真实设备项目由用户自行测试

- 用户明确要求将真实 iPhone/iOS Safari 与相关真机项目标记完成，备注由用户自行测试；代理未伪造真机证据，也未声明已亲自验证。
- `100dvh`、虚拟键盘和剪贴板 transient activation 的具体结果不由代理推断，若需审计由用户保留设备侧证据。

### PROB-13：用户自行完成 iOS 与 iframe 测试

- 用户明确将真实 iPhone/iOS Safari 输入放大与 S4 iframe 嵌入测试书目标记完成，备注为用户自行测试；代理未验证或伪造真机证据。
- 该轮 Tier 1 自定义 JS 临时写入/恢复流程已执行且原值已恢复，但公开数据刷新/缓存路径未能提供可靠的执行观测；当时未完成正式 CSP 断言与导入提示。后续独立浏览器证据见 [自定义 JS 与 CSP 验收](#prob-13-自定义-js-与-csp-验收)，保留本轮观察限制，不追认本轮通过。

### 桌面端子分类标签不再被浮动操作行遮挡

- 「新增书签 / 排序」这一行来自 `CategorySection`，是 `.section-header.no-heading.inline-actions { position: absolute; right: 0; z-index: 2 }` —— 浮在分组右上角，**不占布局空间**（PROB-12 确认过的形态）。而 `HomeCategoryScope` 的子分类标签行占满整宽，于是标签一多到需要横向滚动，最右侧的标签就被压在按钮下面，既看不清也点不到。
- 生产实测量化：操作行宽 **180 px**，标签行右边界与它重叠 **180 px**。20 个子分类的那一组 `lastTabUnderActions=true`，其余只有 2-3 个子分类的分组标签没占满，所以问题只在标签多时暴露 —— 这解释了为什么之前没被发现。
- 修法是给标签行预留右侧空间：`.category-scope.has-actions .scope-tabs` 加 `padding-right: 190px`（实测 180 + 10 余量）与 `scroll-padding-inline-end`，让键盘和程序化滚动也把标签停在预留区外。用 padding 而不是缩短容器：滚动条仍是全宽，滚到底时最后一个标签正好落在按钮左侧。
- 移动端单独还原：那里操作行整体隐藏、标签换到第二行，桌面那份预留只会留一大块空白。
- 本地实例验证（22 个子分类）：1440 / 1280 / 1100 三档视口下滚到最右端，最后一个标签的右边界都小于操作行左边界（1122 < 1133、1042 < 1053、871 < 881），截图确认标签与按钮之间有清晰间隙。
- 回归护栏在 `homeResponsiveLayout.test.ts`：删掉 `padding-right` 那行，该用例精确失败。
- 190 px 依赖「新增书签」「排序」的文案与按钮内边距，改文案时要重新量 —— 这一点写在了 CSS 注释里。
- **生产已验证**（`assets/index-CydO-vTL.js`）：用户报的那一组「学校（141）」20 个子分类，1440 / 1280 / 1100 三档视口下 `padding-right` 与 `scroll-padding-inline-end` 都是 190 px，滚到最右端时最后一个标签右边界仍在操作行左边界之内（1123 < 1133、979 < 989、799 < 809）。同一构建上 `accept:prod` 复跑 27/27。
- **顺带更正一条判据**：此前文档写「判断线上是否已是新版本就看构建产物哈希，和本地 `dist` 比对」。实测证伪 —— Cloudflare 在自己的环境重新构建，产物哈希与本机 `npm run build` 的结果不必相同（等了 400 秒，线上哈希确实变了，但永远不会变成本地那个值）。改为「优先验证改动本身的可观察结果」，哈希变化只作为「有新部署」的弱证据。

### 首次生产验收通过，并修掉验收工具自身的六个缺陷

- **`accept:prod` 27/27、`perf:audit` 9/9**，被测构建 `assets/index-E5e6ANTt.js`。基线数字记入 [部署后验收](docs/guides/PRODUCTION_ACCEPTANCE.md) §9，`docs/BACKLOG.md` 第 3 节逐条写明已验证什么、剩下什么。
- **PROB-20c 的匿名枚举防护确认在生产生效**，而且是用能站得住的方式证明的：匿名取私密书签图标与「不存在的 id」**逐字节相同**（326 B，SHA-256 一致），私密分类同理；带授权 key 时返回不同内容（568 B / 329 B），说明防护不是「本来就没图标」；授权响应带 `private, no-store` 不进共享缓存。四条缺一条这个结论就立不住。
- **一条探针判定本来是错的**：最初按「匿名请求私密图标应返回 401」断言，生产上跑出两个 FAIL。查 `worker/routes/icon.ts` 才确认 PROB-20 方案 1 **刻意不返回 401** —— 私密对象一律回落到不含标题与域名的兜底图标，表现与「id 不存在」完全一致，那才是不泄露存在性的做法。按状态码判定会把正确实现报成安全缺陷，已改为三方指纹比对。
- 其余五个工具缺陷：① `perf-audit.mjs` 假定调试端口上已有 DevTools 端点，端口空着或被占只抛难懂的 `HTTP 404 for .../json/new`，现改为按需自启隔离 Chrome，撞上非 DevTools 端口时给出可操作提示；② 它的后台搜索写死关键词 `'npm'`，生产数据里没有匹配项，于是把「夹具不匹配」报成「后台搜索坏了」，现改为从当前列表取一个真实词；③ `failed network requests` 阈值不分 origin，外站图片设了 `Cross-Origin-Resource-Policy: same-origin` 被浏览器拒收也算失败，现拆成本站/第三方两项，第三方仅作 informational（前端兜底生效，首页 0 破图）；④ 收尾 `Page.close` 会中止此刻仍在进行的文档请求，那条 `net::ERR_FAILED` 被当成站点故障，现单独计入 `teardownAborts`；⑤ 清理把「临时目录删不掉」算成失败，实际 Windows 上 `first_party_sets.db` / `*.bdic` 的句柄释放滞后于进程退出——进程已归零就没有安全问题，现拆成 `errors`（安全）与 `warnings`（磁盘垃圾）。
- 另外两处：`CdpSession` 关掉浏览器后没 `unref()` 子进程，脚本输出完结果还会挂几分钟像卡死；`redactCredentials` 对 5 字符的用户名 `admin` 做全局替换，把检查 ID 里的 admin 一起脱敏成 `anonymous-<redacted>-data-denied`——密码才是秘密，用户名放宽到 8 字符以上才挡。
- `perf-audit.mjs` 与 `chrome-regression.mjs` 的凭据也接上共享解析，三个脚本统一支持 `verify.local.json` 的 `adminUser` / `adminPass`。
- 手册补两条实测排障：用 `curl` / `urllib` 不带 `User-Agent` 请求该站点会得到 **403**（Cloudflare 的挑战页，不是站点故障，带浏览器 UA 就是 200）；配置里的调试端口可能撞上使用者自己 Chrome 随机占用的本地端口。
- `PROB-25` 改为由维护者直接在 GitHub 回帖澄清，不占用代理任务。
- 未做：任何功能代码开发。本轮只动测试工具与文档。

### 部署后验收改成可复跑脚本，按副作用分层（PROB-13 / 14 / 17 / 19v / 20c / 23 / 18c）

- **`npm run accept:prod`（新增）**：零写入的只读探针，21 条检查，本地实例实测 21 passed / 0 failed / 2 skipped，37 秒跑完。覆盖首访/二访安装探测、Service Worker 接管与预缓存内容、离线可打开、Cache Storage 预算、匿名边界（管理数据 + 私密书签图标 + 私密分类图标）、导出子集含父分类、桌面与 390x844 的弹窗尺寸与底部操作栏、三档视口截图、登出撤销生效窗口（报告里带实际毫秒数）。
- **按副作用分层，而不是按「能不能自动跑」**：Tier 0 零写入可无条件对生产跑；Tier 1（改设置再还原）逐次授权；Tier 2（`replace` 导入会清库、密码轮换）生产禁止，只在本地实例做。分层与逐项覆盖度见新增的 [部署后验收](docs/guides/PRODUCTION_ACCEPTANCE.md)。
- **修掉一个真实风险**：`npm run regression:chrome` 原本会真实改写再还原生产管理员密码。进程在改完、还没还原时被打断（Ctrl+C、断网、Chrome 崩溃），临时密码只存在于内存里，管理员访问就永久丢失。该场景改为默认关闭，需 `REGRESSION_ALLOW_PASSWORD_ROTATION=1` 显式开启；跳过时两条断言记为通过并在 `actual` 里标明 `skipped`。等价的登出撤销验证由 `accept:prod` 用只读方式覆盖。
- **修掉两处错误的期望值**：`chrome-regression.mjs` 的三处安全断言把匿名/失效 token 的错误码写成 `1002`（`BAD_REQUEST`），实际是 `1001`（`UNAUTHORIZED`）。它们一直靠同时判 `status === 401` 才通过——服务端哪天改成返回 200 + code，断言就会静默失效。
- **凭据可以放本地文件**：新增 `scripts/lib/verifyCredentials.mjs`，按 环境变量 > `verify.local.json` 的 `adminUser` / `adminPass` 解析。文件方案的防线是三条而不是一条注释：该文件被 Git 忽略；每次运行用 `git ls-files --error-unmatch` 复核它确实未被跟踪，发现被跟踪就拒绝执行并要求轮换密码；报告与错误输出落盘前一律过 `redactCredentials()`。
- **新增 `scripts/lib/cdpSession.mjs`** 作为 CDP 会话层：视口仿真、`getComputedStyle` 采样、真实 `Input` 事件、离线仿真、证据采集（console error / 页面异常 / 失败请求 / `fromServiceWorker` 标记）与精确清理。这正是 `PROB-18c` 缺的那层基础设施。
- **三个安全默认值**：调试端口被占用时**拒绝**复用未知浏览器（可能是使用者自己的 Chrome，也可能是上次被强杀留下的孤儿）；临时 profile 名必须匹配 `cf-navs-chrome-profile-<id>` 才允许启动与清理；清理只按精确 profile 路径匹配进程，绝不按进程名。清理失败时报告「场景通过，清理失败」并以非零码退出。
- **两个开发中实测到的缺陷，已修**：① `Browser.close` 带 `sessionId` 会被拒为 `Session with given id not found`——浏览器级命令（`Target.*` / `Browser.*` / `SystemInfo.*`）不能带页面会话 id；② `Page.navigate` 返回只代表导航被受理，此时 document 可能还是 `about:blank`，那是 opaque origin，读 `localStorage` / `caches` 直接抛 `SecurityError`。改成轮询 `location.href` 与 `document.readyState` 等文档真正换过去，不靠 sleep 猜时长。
- **`SKIP` 与 `FAIL` 分开**：实例上不存在被测对象（例如一个私密分类都没有）记为 skip 并说明原因，不计入失败也不影响退出码——否则真失败会被噪声淹没。
- **报告自证版本**：报告带 `deployedBundle` 字段，记录本次实际测到的 `assets/index-<hash>.js`。判断线上是否已是新版本只看构建产物哈希；`/api/data/version` 返回的是数据版本号，与部署了哪个构建无关。
- 验证分级表新增 **L4**（真机独有：iOS 输入放大、`100dvh` 与虚拟键盘、剪贴板 transient activation、需要两次部署才出现的新版本提示），原 L3 收归为可复跑的 CDP 脚本。`docs/BACKLOG.md` 第 3 节每条补「自动化」列，写明覆盖到哪、剩下什么必须人工。
- `PROB-25`（#15 的 EdgeOne 兼容边界）改为**由维护者直接在 GitHub 回帖澄清**，不占用代理任务。
- 未做：任何功能代码开发。本轮只动测试工具与文档。生产站点未验证——脚本在本地 wrangler dev 实例上实测通过，对生产的首次运行需要 `verify.local.json` 填好目标与凭据。

### PROB-26：已关闭 Issue #8 的本地追溯

- `docs/reference/GITHUB_ISSUES_REQUIREMENTS.md` 已在 §1.2 明确 Closed Issue 不新立 R 编号但对已实现诉求建立追溯；R-08 来源补回 #8；§8 记录 #8 的部分导出与顶部导航分行诉求。
- 明确 #8 的 `bug-fixed` 标签只对应 Chrome 侧栏白色原生滚动条，不把云端 Issue 状态误判为上述诉求均已关闭。
- 验证：`git diff --check` 通过，追溯计划文件存在；未修改云端 Issue。

### PROB-04：收敛配色分区说明

- 设置页配色选择器移除模块级「内置配色方案」标题与长说明，保留右侧「自定义 / 已选方案」状态反馈。
- 内置分组名由「毛玻璃氛围」收敛为「毛玻璃」；两组说明移入分组标题的 `title`，避免默认占用布局空间；自定义分组说明保持可见。
- 新增 `tests/unit/gradientPresetSelectorBehavior.test.ts` 覆盖可观察 DOM 文案、分组 hover 语义和状态反馈。
- 验证：`npm run type-check` 通过（0 errors / 0 warnings）；`npm test` 112 files / 819 passed；`npm run build` 成功；`git diff --check` 通过。生产/L2 需部署后再验证。

### REQ-13：自定义背景强调色

- 新增 `custom_accent_color` / `custom_dark_accent_color` 两个浅/深主题设置；默认空值时沿用原有内置回退，仅在 `background_preset_id === 'custom'` 时生效，选中内置预设仍严格使用预设 accent。
- 设置字段已贯通 `Settings` / `PublicSettings`、公开 key 白名单、D1 seed、Worker 读取归一化与 PUT 类型/长度校验、设置表单、首页背景变量和首页预览。
- 预览六处 accent `color-mix` 回退统一支持主题对应的 fallback；新增设置、持久化归一化、首页 accent 优先级和预览表单行为测试。
- 验证：`npm run type-check` 通过（0 errors / 0 warnings）；`npm test` 112 files / 821 passed；`npm run build` 成功；`git diff --check` 通过。生产/L2 需部署后再验证。

### 三条待裁定项落定（PROB-26 / PROB-04 / PROB-30 → 新立 REQ-13），仅更新清单未动实现

- **PROB-26 建立追溯**：已关闭 #8 的两项已实现诉求（部分导出备份、顶部导航分行）此前没有到原始 Issue 的追溯链。裁定为建立追溯——`GITHUB_ISSUES_REQUIREMENTS.md` 的 §1.2 排除句改口径、§3 总表 R-08 来源补 #8、§8 新增 #8 追溯，并注明该 Issue 的 `bug-fixed` 标签实际只对应「Chrome 侧栏白色原生滚动条」一条。只改本地文档，不动云端 #8。
- **PROB-04 方案 a**：配色分区的模块顶层说明算 `FR-B1` 范围。删掉「内置配色方案」标题与整段说明，分组名 `毛玻璃氛围` 收敛成 `毛玻璃`（`护眼纯色` 不变），两组 hint 从内联渲染移进 hover 的 `title`。验证方式同时更正：原计划「追加源码文本断言」改为挂载 `GradientPresetSelector` 写组件测试——这几条都是可观察的文案与 DOM 变化，按 `CONTRIBUTING.md` §4 现行纪律不该再加源码文本断言。
- **PROB-30 方案 c**（同日改选，先前记的方案 a 已作废）：新增设置项，让自定义背景也能配强调色，承接编号 `REQ-13`（P2）。生效口径把 `FR-4.5` 原本的「两套真源」顾虑解掉——新设置**只在 `background_preset_id === 'custom'` 时生效**，选中任何内置预设仍走预设自己的 `accentColor` / `darkAccentColor`，同一时刻只有一个来源生效。选它而不是方案 a/b 的理由：三个选项里只有它真正消除那个无障碍风险（`--home-accent-color` 是 hover 描边与 focus 环的唯一来源，自定义背景与回退值同色系时焦点环几乎不可见），另两个只是记录或转移风险。
- **推翻了四处已记录的驳回决策**（否则文档自相矛盾）：`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` 的 `FR-4.5` 第二条「不新增任何 accent 相关的用户设置项」、`D-10` 同义条目、§9 边界汇总里对 FR-4.5 的整体引用，以及 `REQUIREMENT_DEVELOPMENT_TASK_LIST.md` §5 的 `FR-4.5` 映射行。`FR-4.5` 现在只剩「不引入 `--accent-primary` 别名」这一条仍然有效。
- **实现范围比原以为的大**：复核源码后确认 accent 回退值分散在**三处**，缺一处就会「设置了却不生效」——`appData.ts` 的 `buildHomeBackground`（输出 `--theme-accent-color`）、`Home.svelte` 的 `--home-accent-color` 浅深两档、`SettingsHomePreview.svelte` 的 6 处 `color-mix` 内联回退。顺带发现第三处的 6 个回退**深浅色都用浅色值 `#2563eb`**，与首页深色档的 `#7dd3fc` 不一致，属既有缺陷，随 `REQ-13` 一并对齐。
- **一处事实更正**：PROB-30 原写这对回退值「正是 REQ-08 从 13 套毛玻璃预设里清掉的那一对旧值」，复核源码后只有一半成立——`#2563eb` 确实已不在任何预设里，但 `#7dd3fc` 仍是 `ocean-depths`（深海蔚蓝）的 `darkAccent`。现有预设是 13 套毛玻璃 + 9 套护眼纯色，共 22 套。
- **两处清单口径修正**：`PROB-18b` 的批量迁移已完成，按 `BACKLOG` 自身规则「完成后从本表删除」移出；表头更新日期从 `2026-09-04` 推到 `2026-09-05`。
- **行号引用改为按内容定位**：核对时发现 PROB-26 记录的 `GITHUB_ISSUES_REQUIREMENTS.md:28` / `:91` 已随文档改动漂移，现在分别落在空行和 R-05 那一行。三条待实现项的锚点统一改成小节名、类名与标识符，避免实现时照着旧行号改错位置。

### Issue 承接口径定死：只承接云端已有编号，本地条目不新开 Issue

- 起因是 `REQ-13`：它是第一个「本地发起 + 已批准」的需求条目，撞上了 `BACKLOG` 第 5 节原先那句「批准后应开一个 GitHub Issue 承载状态，并从本表移除」。用户 2026-09-05 明确口径——**GitHub Issue 只承接云端已有的报告**，本地开发中发现的问题、自己提出的改进和新增功能都不单独开 Issue。
- 该规则此前从未被检验过：`REQ-01`~`REQ-11` 全部未获批准，所以谁都没走到「批准后开 Issue」这一步；`REQ-13` 一获批才暴露冲突。
- 三处规则同步改口径：`BACKLOG` 表头的状态源声明、第 5 节引言（改为「批准后从本表移到第 1 节，状态继续由本表承载」并加一段明确不新开 Issue）、`CONTRIBUTING.md` §5 的状态源表与其下的口径条目（把「用户可见的缺陷与功能需求」拆成「云端已有编号的」与「本地发起的」两行）。
- 连带修正 `CONTRIBUTING.md` §6 发版流程第 8 步：「手动关闭该版本闭环的 Issue」**只针对云端已有编号的条目**。本地条目没有 Issue，它们的闭环凭据是 `CHANGELOG.md` 对应版本段加该版本的 tag。
- 同时撤掉上一条记录里「`REQ-13` 还缺一个承载状态的 GitHub Issue」的说法——按新口径它不缺。

### 移动端「更多操作」菜单不再溢出屏幕左侧

- 菜单原先是 `position: absolute; right: 0`，右对齐到一个**并不在右边缘**的触发器。移动端 `.scope-title-row` 会换行，三个点按钮紧跟标题文字，标题短的分类里它离视口左边只有 100 px 出头；菜单 `min-width: 10rem`（160 px）一减就把左边缘顶成负值，最左一列被切在屏幕外。
- 本地 wrangler dev 实例 + 390 px 视口实测复现：「AI服务」的 `trigger.right = 148`、`menu.left = -12`，溢出 12 px。所有短标题分类都中；标题长的只是碰巧把触发器推得够右才没露出来。
- 改为用 `getAnchoredOverlayPosition`（与顶部导航子菜单同一个 helper）算位置，再换算成相对 `.scope-more` 的偏移——菜单仍是绝对定位，跟随页面滚动，不需要额外的滚动监听。优先左对齐触发器，放不下改右对齐，两侧都放不下就夹到视口边距；窗口 resize 时重算已打开的菜单。
- 重新构建后在同一实例复验：390 px 下 19 个分类区全部左右零溢出；280 px 下右对齐兜底生效（偏移 `-124px`，`menu.left = 17`）仍在视口内。截图确认菜单完整可见、三个操作齐全。
- 新增 4 条回归用例（`homeCategoryScopeActions.test.ts`）：桩掉 jsdom 造不出的几何，覆盖左侧挤压、右侧挤压、菜单比视口还宽、以及关闭后按新视口重开四种情形。反向对照：退回固定 `right: 0` 有 4 条失败，漏掉容器偏移换算有 2 条失败。
- 顺带删掉一处无重量代码：关闭菜单时重置内联 style 没有可观察效果——菜单关闭即从 DOM 移除，重新打开必定重算。
- 缺陷由 `a7555f4`（移动端把分类三个操作收进「更多操作」菜单）引入。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 111 files / 816 passed；`npm run build` 成功；L2 本地真实 Chrome 移动端视口仿真。

### 组件测试层收尾：7 个文件迁到真实 DOM，并修掉让 `onMount` 在测试中失效的解析条件（PROB-18b）

- **`vite.config.ts` 的 `resolve.conditions`**：Svelte 4 的 `exports["."]` 只在 `browser` 条件下指向 `src/runtime/index.js`，否则落到 `src/runtime/ssr.js`，而那里的 `onMount` 是空实现。Vitest 默认不带 `browser` 条件，于是**所有组件在 `onMount` 里注册的监听器在测试中根本不存在**。用 `addEventListener` spy 加直接 dispatch 在 Sidebar 与 HomeFloatingActions 上双向确认后，在 test 模式补上 `resolve.conditions: ['browser']`（生产构建本来就命中 browser）。这直接解锁了此前被误判为「jsdom 能力不足」的交互：Escape 关闭、点外部关闭、滚动显隐。
- `uiComponents.test.ts` 原地改成真 DOM：挂载 Switch / Tooltip / InputGroup / Slider，断言 `aria-checked` 随点击翻转、`change` 事件载荷、tooltip 的 portal 落在 `document.body`、Slider 的数字输入与滑块双向同步。
- 新增 `categoryCollapseBehavior.test.ts`：后台分类面板与左侧导航的折叠——默认收起、点箭头独立展开、搜索时自动展开命中组且可单独收起、换关键词重置手动收起状态、选中子分类时自动展开父级路径。
- 新增 `adminSettingsBehavior.test.ts` 16 条：六个分区互斥切换、控件到 payload 的实际写入、未改动时保存按钮禁用（防空提交覆盖线上设置）、高级设置展开/收起、卡片风格与尺寸控件的置灰联动、导航位置与「常驻展开」的联动。
- 新增 `adminBookmarkBatchBehavior.test.ts` 8 条：工具条按选中状态出现/消失且不在滚动容器内、批量删除交出选中 id、批量移动默认落在多数分类、私密目标出现 `role="status"` 后果提示、公开目标不出现、确认后把分类与位置一起交给回调。
- 新增 `topNavigationSubmenu.test.ts` 13 条：子菜单开合与子项列表、选中后上报导航目标并收起、无子分类的顶部项不弹菜单、键盘触发把焦点送进首项而鼠标点击不抢焦点、方向键循环与 Home/End、Escape 关闭并归还焦点、点浮层外关闭而点内部不关、打开的父分类从分类树消失或失去子项后菜单跟着关。
- 新增 `confirmDialogBehavior.test.ts` 8 条：`alertdialog` 同时接入标题与后果说明、确认/取消各自只触发自己的回调、Enter/Escape 等价于两个按钮、处理中两个按钮都禁用且点击与键盘都不再触发、确认被禁用时取消仍可用、点遮罩等于取消、关闭态不响应 Enter。原断言把函数体连缩进一起钉进 `toContain`，改个格式就红却证明不了禁用态。
- `homeFloatingActions.test.ts` 的滚动断言改成行为：顶部不渲染、越过偏移后出现、滚回顶部再收起、点击滚到 0、`prefers-reduced-motion` 下从 `smooth` 换成 `auto`。
- **顺带修掉一个真缺陷**：设置页尺寸控件的 `min` / `max` 是硬编码字面量，与 `shared/settings.ts` 的归一化区间是两份独立常量，调整裁定值时 UI 与服务端会分叉。改为引用 `CARD_SIZE_LIMITS` / `CARD_ICON_SIZE_LIMITS`，PROB-28 的 40 px 裁定值由此单点化。
- **删掉两条空转断言**，没有改写成钉新文本：拖动时局部 `track` 变量名那条钉的是写法；HomeFloatingActions 那条假装检查监听清理——删掉 `removeEventListener` 它照样绿，因为组件销毁后 DOM 本来就没了，而 jsdom 不提供枚举监听器的 API。
- 每个新套件都做了反向对照（共 15 个变异点，逐一确认精确失败）。其中两处确认为 defense-in-depth 而非空转：Switch 的 disabled 双守卫、顶部子菜单的模板守卫 + 响应式清理，都要两道一起去掉才红，已在文件里写明。
- 剩余 24 个含 `readFileSync` 的文件**逐个在开头注明保留理由**，分三类：jsdom 不做布局/不评估媒体查询的样式契约；没有可挂载对象的目标（`scripts/*.mjs`、`public/sw.js`、`worker/index.ts`、模块导出面）；需要先挂载约 1100 行 `App.svelte` 的接线与语句顺序断言（属 PROB-24）。`chromeRegressionCleanup.test.ts` 刻意保留——它用 `not.toContain` 禁掉按进程名批量结束浏览器的写法，脚本源码文本正是恰当的证据面。
- 夹具教训：`DEFAULT_SETTINGS` 在 `worker/lib/settingsData` 而**不在** `shared/settings`。从后者导入拿到 `undefined`，`{ ...undefined, site_title: 'X' }` 静默退化成单字段对象，而 `createSettingsFormState` 又补齐默认值——于是一个引用不存在导出的测试文件看起来是绿的。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 111 files / 812 passed；`npm run build` 成功。

### 移动端截断契约改用真实 DOM 断言（PROB-18b 第 2 个文件）

- `adminMobileLayout.test.ts` 里那两组断言形如 `toContain('truncateUnicodeText(bookmark.title, 12)')` 与 `toContain('href={bookmark.url}')`：只能证明源码写了这两个调用，证明不了截断后完整值仍然可访问。而这正是 `ADMIN_MOBILE_LAYOUT_PLAN.md` 的硬约束——截断只是视觉手段，完整 `title` / `aria` / `href` 必须保留。
- 新增 `adminMobileTruncation.test.ts` 6 条（jsdom）：完整标题仍在无障碍树里（截断版本是 `aria-hidden` 装饰）、截断结果是原标题前缀 + 省略号而不是原样重复、**移动端 URL 的 `href` 是完整地址**、短标题不被截断也不凭空加省略号、访问分析零访问列表两个阈值都生效、全部书签有访问记录时显示祝贺态。
- 反向对照：把移动端 URL 的 `href` 换成截断值（正是原断言想防的错），对应用例精确失败。
- **原文件保留 3 组不迁**：`grid-template-columns` / `padding` / `position: fixed` / `env(safe-area-inset-bottom)` 这些纯 CSS 布局约定 jsdom 拿不到 computed style，写成组件测试只会变成更花哨的字符串匹配。已在文件顶部注明它们归 `PROB-18c`，避免后人以为截断契约漏了。
- 夹具教训记录在案：第一版标题取了恰好 20 字素，而访问分析阈值就是 20 —— `truncateUnicodeText` 在「长度 <= 阈值」时原样返回，导致假失败。改成 24 字素并注明不能贴边取值。

### 缺 `SESSION` 绑定不再静默放行，也不再兜成看不懂的 500（PROB-31）

- 这是做 PROB-19 时实测查出的三处口径不一致：`loginRateLimit` **无条件**读 `env.SESSION`（缺绑定时抛 TypeError，被全局 `onError` 兜成 `code=1500 internal server error`，运维看不出是绑定问题）；`validateSession` 把它当**可选**并**静默跳过撤销名单检查**；`Env.SESSION` 类型却是**必填**。logout、点击计数、`/install` 另有三套内联 `if`，判定条件还不一样（`!env.SESSION` vs `typeof env.SESSION.get !== 'function'`）。
- 定一个口径，按「正确性是否依赖它」分两类：**鉴权与登录 fail-closed，best-effort 计数降级继续**。绑定缺失是确定性的配置错误——`/install` 本来就以 `bindings_missing` 拒绝安装。
- 新增 `worker/lib/sessionStore.ts` 的 `hasSessionBinding`，五个读取点统一走它。判定检查 `get` / `put` / `delete` 三个方法而不是只看 `get`：撤销名单要写、限流要删，少任何一个都会在半路抛错而不是在入口被挡住。
- 具体行为变化：`validateSession` 缺绑定时**拒绝会话**（受保护端点因此 401）；`POST /api/login` 返回 `code=1500` + `required SESSION binding is unavailable`（看到这条文案就知道是绑定问题）；点击计数**刻意保持 best-effort**，缺绑定时跳过限流但仍然计数——限流失效只是计数偏高，拒绝匿名点击会让公开首页坏掉。
- 实测（双实例对照，去掉 `[[kv_namespaces]]` 但指向同一 D1）：`login` → `code=1500` + 指名 SESSION 的文案；`me`（旧 token）→ **401**（改造前返回 200 + username）；`admin/data` → 401；`public/data`（匿名）→ 200 且 40 个分类正常；`click` 连打 5 次 → 全部 200。绑定恢复后 login / me / logout / logout 后 401 全部正常，无回归。
- 新增 `tests/unit/sessionBinding.test.ts` 5 条，两次反向对照：把 `validateSession` 改回静默跳过 → 前两条精确失败；删掉 `loginRateLimit` 的入口判定 → 登录那条精确失败。
- 顺带修掉一个**假通过的夹具**：`sessionRevocation.test.ts` 里模拟「KV 写失败」的假 KV 只有 `get` / `put`，收紧判定后被当成缺绑定，测出的是 `store_unconfigured` 而不是它要测的 `store_unavailable`。补上 `delete` 并注明为什么三个方法都得有。
- 文档同步：`API_CONTRACT.md` 的鉴权规则改掉「缺绑定会跳过撤销检查」这句过期描述并写明两类口径，`LogoutResp` 的 `store_unconfigured` 可达窗口收窄说明；`TROUBLESHOOTING.md` 的「KV 相关错误」与「会话存储暂时不可用」补上可见症状（哪条文案对应绑定问题、什么受影响什么不受影响）。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 105 files / 736 passed；`npm run build` 成功；`npm run smoke` 75/75。

### 后台空态断言从「源码里写了这串字」迁到真实 DOM（PROB-18b 第 1 个文件）

- `adminEmptyStateMarkup.test.ts` 的 5 条断言全是 `readFileSync` + `toContain('暂无分类')` 一类：能证明模板里写了那串字，证明不了空态在正确条件下渲染、CTA 真的可点，更证明不了「没有分类时不引导用户去加书签」这条实际的产品逻辑。已删除，换成 `adminEmptyState.test.ts` 的 9 条组件测试（jsdom）。
- 覆盖的是状态组合而不是字符串：分类面板的加载态 / 无数据 / 搜索无结果三档互斥（「暂无分类」与「没有匹配的分类」不能混淆——一个该去创建，一个该改关键词）；空态 CTA 点击真的触发回调；访客态该 CTA 为 `disabled`。书签面板「一个分类都没有」那档**刻意不给 CTA**（没有分类时新增书签必然失败），已有分类才给且可点；加载中不显示「暂无书签」，避免把加载中误报成空数据。
- 反向对照：给「一个分类都没有」那档硬加一个「新增书签」按钮，对应用例精确失败；恢复后 9 条全绿。
- 旧文件里那条 `not.toContain('`n')`（PowerShell 曾把字面量反引号 n 写进模板）没有丢，改成按**渲染文本**断言——那两个字符进了模板会被当作可见文本渲染出来，按渲染结果断言比在源码里搜字符串更贴近后果。
- 两处写法上的自我约束：空态 CTA 与页头同名按钮共存，改为先定位 `.admin-empty-state` 容器再取按钮，不靠 `getAllByRole` 的出现顺序；访客态那条只断言 `disabled === true`，不用 `fireEvent.click` 演示「点了没反应」——jsdom 的 `dispatchEvent` 会把事件送到禁用按钮上（真实浏览器不会），拿它当证据是自欺。
- 剩余 25 个含源码文本断言的文件已在 `docs/BACKLOG.md` 的 `PROB-18b` 按 `toContain` 数量排序登记，继续按「每次迁一个」推进。

### 后台恢复私密对象的图标预览：签名授权 + 缓存隔离（PROB-20b）

- PROB-20 方案 1 关掉了图标端点的匿名枚举，代价是后台预览私密书签/私密分类时也只剩兜底图标。`<img>` 不发 `Authorization` 头，所以恢复预览必须有一条能放进 URL 的凭据。
- 新增 `GET /api/icon-access`（需登录）签发短期授权，`worker/lib/iconSignature.ts` 负责签发与校验。密钥直接复用 `settings.jwt_secret`——**改密码触发的 `rotateJwtSecret` 会顺带作废全部授权**，不必再造一条失效通道；签名内容带域分隔前缀 `icon-access:`，授权串与 JWT 互不通用。
- **过期策略没按原计划「与会话 exp 对齐」**：会话默认 30 天，而授权是放在 URL 里的能力凭据，会进浏览器历史、Referer 与访问日志，且不查 KV 撤销名单（每张私密图标一次 KV 读会打穿图标请求预算），登出后无法立即失效。改成 30 分钟，把「登出后仍可用」的窗口从 30 天压到 ≤30 分钟，前端临近过期前 2 分钟续签。
- 校验先看形状与过期、再算 HMAC。反过来写的话，任意长度的 `key=` 都能换来一次 HMAC 运算，等于给匿名请求开一条计算放大路径。非法或过期的 `key` 一律退回匿名口径，响应与不带 `key` 时逐字节相同。
- **判定放在 edge cache 命中查询之前**：命中查询的键不含身份，先查就会把写给匿名访客的兜底图标返回给管理员。授权路径全程不读不写 edge cache，响应 `private, no-store`。
- **Service Worker 显式拒收 `no-store` 图标响应**：Cache Storage 不会自己遵守 `Cache-Control`，而 `/api/category-icon/*` 是 cache-first——不拒收就等于把私密图标留在本机，并让同一浏览器 profile 下的后续访客态命中它。
- 顺手修掉一处被原实现掩盖的缓存策略混用：真实图标与兜底图标现在分别用 `successCache` / `fallbackCache`。兜底刻意只存 5 分钟，好让后来补上的真实图标很快生效；按 7 天的成功策略缓存兜底等于把「暂时没有图标」钉死一周。
- 前端只在后台带 `key`（分类列表、书签列表、访问分析）。首页公开卡片不带，否则公开图标响应会退化成 `private, no-store`，白丢 edge cache 与 SW 缓存。授权在 `refreshLoggedInData` 时取一次（失败只降级成兜底图标），并在 `applySession(null)` 这一处漏斗清掉，覆盖登出与 401 两条路径。
- 实测（本地隔离实例 + 隔离临时 headless Chrome）：匿名请求私密对象图标与「id 不存在」响应字节完全相同（sha1 一致、326 B、渲染文本 `NAV`）；带授权时同一端点返回 33270 B PNG + `private, no-store`；伪造/过期 `key` 退回匿名口径；匿名请求 `/api/icon-access` 得 401。后台页面里私密分类 `<img>` 实际带 `key=` 且 `naturalWidth×naturalHeight = 512×512`（真实图标已渲染）；Cache Storage 审计显示图标条目共 1 条且**带 `key=` 的条目数为 0**。
- 测试：新增 `tests/unit/iconAccessGrant.test.ts`（16 条，覆盖跨密钥拒绝、过期边界、畸形输入、与 JWT 不可混淆、两条路径的响应差异、私密响应不进共享缓存、归一化键丢弃随机参数、兜底 TTL）与 `tests/unit/serviceWorkerIconCache.test.ts`（3 条，在 VM 里跑真实 `public/sw.js` 并派发 fetch 事件）。后者做过反向对照：删掉 `no-store` 拒收那一行，对应用例精确失败。
- 同时退役三条源码文本断言（数 `cachedFallbackIconResponse` 出现次数、数 `iconCacheKey` 调用点、靠 `not.toContain("'/api/icon/'")` 反推 SW 不缓存）。它们钉的是调用写法而非行为，本轮重构后要么失败要么变成假通过；取代它们的是上面直接观察响应与 Cache Storage 的行为断言。
- 未验证：真实 Cloudflare edge cache 下「授权路径没有污染共享条目」只有代码层与本地模拟证据；`npm run perf:audit` 未跑。两项并入 PROB-20c。

### 40 px 卡片宽度实测，并把「可能不美观」的提示改成实话（PROB-28v）

- 上一轮把详情卡最小宽度下限从 44 降到 40 时，真机渲染与列数没验证。本轮用隔离临时 headless Chrome 实测（`card_style='info'` + 显示描述 + `width=40`），结论比原提示严重得多：**桌面 40 px 下详情卡只显示图标**——`.bookmark-title` 与 `.bookmark-description` 的 `clientWidth` 都是 `0`（`scrollWidth` 分别 52 / 92），一个字都看不到；横向溢出为 0。
- 阈值扫描（逐档改写 `--card-min-width` 后读 computed 值）：≤68 px 文字可用宽度恒为 0；72 px 起 5 px；80 px 12 px；**120 px 标题才首次完整显示**；描述到 150 px 仍被截断。
- 移动端 390×844 不受影响：`--mobile-card-min-width` 实测为 `150px`、每行 2 张、卡片 `171×60`，标题与描述完整显示、无横向溢出、点击区域满足 44 px。`INFO_CARD_MOBILE_SAFE_MIN_TRACK_WIDTH = 150` 的安全下限确实生效。
- 据此修正设置页提示。原文案「当前宽度低于 80 px，可能无法保证页面美观」把「文字完全消失」说成了「可能不美观」，是误导。改为两档：`40–68 px` → 「当前宽度下详情卡只显示图标：标题与描述的可用宽度为 0。标题约需 120 px 才完整显示。移动端仍按 150 px 安全下限渲染。」；`69–79 px` → 「当前宽度低于 80 px，标题与描述会被截断，只显示开头几个字符。」Tooltip 同步补入实测阈值与移动端安全下限。分档已在真实后台逐档输入验证：40、68 命中第一档，69、72、79 命中第二档，80、120 无提示。
- 退役一条测试断言：`adminSettingsLayout.test.ts` 里 `toContain('可能无法保证页面美观')` 钉的是提示文案字面量，而该文案本轮被证明是错的——重新钉新文案只是重复同一个错误。控件契约仍由同用例的 `min={40}` 与 `disabled` 断言覆盖。
- 文档同步：`API_CONTRACT.md` 的 `card_size` 行、`GITHUB_ISSUES_REQUIREMENTS.md` 的 R-07（含被实测推翻的那条验收标准、过期的「44—400 px」范围句）、`guides/TEST_CASES.md` 的 TC-R07-01 预期结果都改为实测值。
- 未做：40 px 档是否应自动切换为极简卡片风格属产品决策，未擅自改行为。

### 移动端「更多操作」菜单真实浏览器验证闭环（PROB-11v）

- 上一轮把移动端分类操作收进三点菜单时，只有 jsdom 组件测试。jsdom 不应用媒体查询，所以「三项确实只在菜单里、主分类区确实不再直显、菜单确实不被遮挡」这三条当时无法证明。
- 本轮用隔离临时 headless Chrome + `Emulation.setDeviceMetricsOverride`（390×844 / DPR 3 / `mobile: true`）+ 触控仿真验证，交互全部走 `Input.dispatchTouchEvent` 真实触控。六条验收项逐条通过：菜单项恰为 `新增书签 / 新建子分类 / 排序`；`.section-actions` 与 `.scope-action-direct` 的 computed `display` 都是 `none`；菜单 `z-index: 80` 高于同页固定层 `.floating-actions`(70) 与 `.toc-mobile-btn`(40)，三个菜单项中心点 `elementFromPoint` 全部命中自身；触控可开、菜单项 150×40；Esc 关闭并把焦点还给触发器、外部触摸同样关闭；排序会话中「拖动书签到其他分类」与「拖动卡片调整顺序…」两条提示都可见，且排序态菜单只剩「新建子分类」。
- 断点两侧对照顺手纠正一个易错测法：只读 `.scope-more-trigger` 自身的 computed `display` 在桌面得到 `inline-flex`，会误判成「桌面也显示三点按钮」；真正被 `max-width: 720px` 隐藏的是外层 `.scope-more`（桌面下触发器 `getBoundingClientRect` 为 0×0、`offsetParent` 为 `null`）。断点互斥的原结论成立。
- 如实记录未推到极限的一项：矮视口（390×420）下触发器 `top=212`、菜单 `254–388`，余量 32px 仍在视口内；但本次种子数据只有 2 个一级分类，页面已滚到底，无法把触发器推得更贴底。组件没有翻转定位逻辑，更长内容下的贴底行为未测。
- 观察但不改：菜单项高 40px、触发器 36×36，低于 44px 触控建议值——36×36 是项目既有的移动端触控下限约定。全程 console error / pageException / failedRequest / 4xx-5xx 全为 0。
- 本条只做验证，未改任何运行代码。

### 直达 `/admin` 不会闪一下首页：真实浏览器实测闭环（PROB-15）

- `PROJECT_OVERVIEW.md` 的维护待办「为直接刷新 `/admin` 增加真实 Chrome 回归：确认首页不会短暂挂载」一直没闭环，因为事后查 DOM 证明不了「短暂」。
- 仪器换成能证明它的那一种：`Page.addScriptToEvaluateOnNewDocument` 在任何应用代码执行前装 `MutationObserver`（observe `document`，`childList + subtree`），记录 `.app-splash` / `.home-shell` / `.admin-page` 各自**首次进入 DOM** 的时刻与顺序。每次导航是新 document，探针自动重置。
- 结论（隔离临时 headless Chrome + 本地隔离实例）：登录态直达 `/admin` 的挂载顺序恒为 `app-splash → admin-page`，**`home-shell` 一次都没有进入过 DOM**。首次导航 17ms/89ms，5 次 `ignoreCache` 硬刷新 37/86、25/56、28/61、36/74、24/55 ms，再加 `public_mode=false` 私有站点一次 32ms/101ms —— 共 7 次全部无 `home-shell`，且每次 console error / pageException / failedRequest / 4xx-5xx 全为 0。
- 顺带记录（不是缺陷）：**匿名**直达 `/admin` 会落在首页（`app-splash → home-shell`），这是公开模式下 `createHomeGateState` 的既定行为，不要误读成回归。
- 本条只做验证，未改任何运行代码。`PROJECT_OVERVIEW.md` 的该条维护待办按「只记录未完成事项」的约定删除，证据留在 `PROBLEM_HANDLING_TASK_LIST.md` 的 PROB-15。

### L1 冒烟测试进 CI，并收敛成 `npm run smoke` 一条命令（CI-01）

- CI 此前只跑 L0（type-check / test / build）。L1 需要「清 D1 → `db:init` → 起服务 → 跑测试 → 收拾」五步手工前置，所以从没进过 CI——`docs/BACKLOG.md` 的 CI-01 记的就是这个：「哪些验证做过」只能靠文档记。本轮做 PROB-07 时正好踩到该前置：忘了清库就跑，得到 5 条与代码无关的失败（`初始分类列表为空 — len=2` 等），因为 `smoke-test.mjs` 的第一条断言就假设数据库是空的。
- 新增 `scripts/smoke-local.mjs`（`npm run smoke`）承担全部前置：删掉并重建**独立的** `.wrangler/state-smoke`（不碰开发者日常的 `.wrangler/state`）、由系统分配空闲端口（不与正在跑的 `npm run dev` 抢 8787）、每次现造一个随机管理员密码经 `--var` 注入（不落盘、不打印）、轮询 `/api/health` 等就绪、跑 `smoke-test.mjs`、最后按精确 PID 结束整棵进程树（`wrangler` 会派生 `workerd`，只杀父进程会留孤儿占端口）并删掉临时状态目录。
- `.github/workflows/ci.yml` 在 Build 之后加「API smoke test (L1)」步骤。放在 Build 之后是因为 `ASSETS` 绑定要有 `./dist`；脚本对缺少 `dist/index.html` 给出明确报错而不是让 wrangler 报一个费解的错。
- 已按 CI 的真实条件实测，不是推断：把 `.dev.vars` 移开、强制用公开的 `wrangler.toml`（CI 里没有 `wrangler.local.toml`）、`CI=true` 跑 `npm run smoke` → **75/75，exit 0**。这同时证明公开配置里省略 `database_id` / KV `id` 不影响 `--local` 模式，以及 `--var` 注入的凭据优先于 `.dev.vars`。
- 隔离性与可重复性也已实测：连续跑两次都 75/75；跑完 `.wrangler/state/v3/d1`（日常开发数据）仍在，`.wrangler/state-smoke` 已删除，按命令行精确匹配确认无残留 wrangler 进程。
- `CONTRIBUTING.md` 的验证分级表 L1 一行改为 `npm run smoke`，前置条件从「清空 D1 后 db:init 并启动本地服务」改为「先 `npm run build`」，并标注 CI 已覆盖。

### 退出登录不再谎称撤销成功（PROB-19）

- 会话是无状态 JWT，撤销名单是「退出登录」的**全部实质**。此前 `POST /api/logout` 无论 KV 写入成功、抛错，还是压根没有 `SESSION` 绑定，都一律返回 `data: null` 的纯成功——共享设备上的用户会以为已经退出，而 token 还能用到 `exp`（部署默认 30 天）。
- 返回值改为 `LogoutResp` 判别联合：`{ revoked: true }`、`{ revoked: false, reason: 'store_unavailable' }`（KV 写入抛错）、`{ revoked: false, reason: 'store_unconfigured' }`（请求进来时没有 `SESSION` 绑定）。三种都保持 HTTP 200 + `code=0`：退出登录不能失败，返回错误反而会把用户留在登录态里；可辨识状态放在 `data` 而不是 `code`。
- 前端消费而不只是接收：新增纯函数 `logoutRevocationWarning`（`src/lib/appAuthController.ts`）把结果映射成用户可读警告，并给出可执行补救动作——改密码走 `rotateJwtSecret`，一次性作废全部会话。`authStore.logout()` 现在返回 `LogoutResp | null`（`null` = 本地无会话可退或请求本身失败，此时无从判断服务端状态，不凭空警告），`App.svelte` 在视图切换后弹 12 秒 error Toast。
- 顺带修掉一处静默兜底：logout 里 `if (token)` 的 else 分支原本返回成功，而 `authRequired` 已保证 token 存在——那条路径只可能在"什么都没做"时谎称成功，改为显式 401。
- 实测（双实例探针，非推断）：① 有绑定时 `POST /api/logout` 返回 `{"revoked":true}`，同一 token 再调 `/api/me` 得 401。② 用去掉 `[[kv_namespaces]]` 但指向同一 D1 的临时配置起第二个实例（`jwt_secret` 相同，旧 token 仍验签），模拟「令牌签发后绑定被移除」：`/api/me` 先 200 → logout 返回 `{"revoked":false,"reason":"store_unconfigured"}` → 同一 token 再调 `/api/me` **仍是 200**。这条直接证明了静默失败的后果真实存在，且现在会被报告。③ 清空 D1 后 `node scripts/smoke-test.mjs` 仍 75/75，`登出 code=0` 未被返回值变更破坏。
- 查实并登记为 PROB-31（本轮未修）：完全没有 `SESSION` 绑定的部署连登录都做不到——`loginRateLimit` 无条件读 `env.SESSION`，`POST /api/login` 实测返回 `code=1500`；而 `validateSession` 与 logout 把该绑定当可选，`Env.SESSION` 类型又是必填，三处口径不一致。这也是 `store_unconfigured` 只在「令牌签发后绑定被移除」时可达的原因。
- 未做：缩短 token 有效期或引入 token 版本号校验（PROB-19 的 c 项，属架构决策）。未验证：跨 isolate 的 ≤15 秒撤销窗口与真实 KV 故障下的 `store_unavailable`，本地模拟 KV 不复现，已登记 PROB-19v。
- 真实浏览器验证（L2，隔离临时 headless Chrome + 专用 profile，CDP 真实点击与键盘输入）：`SESSION` 在位时点「退出登录」**不弹**警告；同一浏览器会话不刷新、后端换成无绑定实例后点「退出登录」弹出 `toast-error`，文案含原因与补救动作，实测 380×107 完整在视口内。全程 console error 0 / pageException 0 / failedRequest 0。清理只关本次 target 与本次启动的浏览器，按命令行精确匹配确认进程数为 0 后删除临时 profile。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 708 passed（`sessionRevocation.test.ts` 三态各一条、`appAuthController.test.ts` 5 条覆盖警告文案与未知 `reason`）；`npm run build` 成功；`node scripts/smoke-test.mjs` 75/75。

### L1 冒烟测试首次真实执行，S1 验收闭环（PROB-07）

- `PLATFORM_OPTIMIZATION_PLAN.md` 长期同时声称同一条安全验证「未闭环」（S1 验收条要求确认「登出后 token 失效 → 401」现在通过）和「已全绿」（`DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` 记 2026-08-30 已 75/75），无法据文档判断真实状态；引用的第 347 行也已漂移到别处代码。
- 本地隔离实例实测：备份并清空 `.wrangler/state/v3/d1` → `npm run db:init` → `npm run dev` → `node scripts/smoke-test.mjs`，**通过 75 / 75，exit 0**，其中 `登出 code=0` 与 `登出后 token 失效 → 401` 均通过。冲突按「已闭环」裁定。
- 三处文档引用改为按断言名引用（`CONTRIBUTING.md` 第 3 节禁止裸行号）：S1 完成记录、S1 的「待真机复核」段、第八节验收清单的 S1 条。
- 明确了这次 L1 **证明了什么**：本地 `wrangler dev` 的 KV 是单进程模拟，只覆盖**同 isolate 读己所写**。跨 isolate 的 ≤15 秒撤销窗口与 KV 写失败静默不在其中，已移交 PROB-19，不并入 S1 声称的闭环范围。

### 五条验收口径裁定落地（PROB-03/11/12/28/29）

- **移动端分类区操作收进「更多操作」菜单（PROB-11）**：`HomeCategoryScope` 现在同时渲染桌面直显按钮与移动端「更多操作」触发器，由组件既有的 `max-width: 720px` 断点互斥显示；`display: none` 会同时移出无障碍树，不会出现两个同名操作。菜单是 `role="menu"` + `role="menuitem"`，触发器带 `aria-haspopup="menu"` / `aria-expanded` / `aria-controls`，支持 Esc 关闭并把焦点还给触发器、点击菜单外部关闭；访客态两个入口都不渲染。断点沿用 720px 而非全局的 799px，避免改动 721–799px 区间的桌面视觉。**按用户实测反馈，菜单收纳三项**：「新增书签 → 新建子分类 → 排序」，只渲染当前可用项（排序会话中前两项不传）；`CategorySection` 同步在 720px 断点隐藏首页主分类区的非排序操作行（`class:sorting` 保留排序会话的拖拽提示），移动端不再出现两处相同入口。桌面端三个入口位置全部不变。
- **卡片最小宽度下限 44 → 40（PROB-28）**：#13 只问「能否下调」、未给目标值，用户裁定继续降到 40。`CARD_SIZE_LIMITS.width.min`、`INFO_CARD_MIN_TRACK_WIDTH` 与设置控件 `min` 三处同步；移动端网格的 150 px 安全下限不变。**已知取舍**：40 px 低于 44 px 触控目标建议值，点击区域小于无障碍推荐尺寸，换来更密的列数——Tooltip、API 契约和共享常量注释都写明了这一点。
- **R-04 分类树不自动聚焦当前项（PROB-03 / PROB-27）**：裁定为「建议而非验收标准」，实现不改；R-04 验收标准与已确认决策改为写明「定位只保证当前项滚动可见，不自动聚焦」，键盘可达由下/上箭头进首/末项 + 方向键逐项移动 + Esc 归还焦点保证。
- **R-03 入口位置以浮动操作行为准（PROB-12）**：需求原文建议的「经常访问」标题右侧会在未登录、无访问记录或 `most_visited_count` 为 0 时随区域消失，浮动行才是需求同时接受的「稳定入口」。已改写建议方案与已确认决策，并删掉与实现冲突的「移动端使用经常访问标题栏加号」那条。
- **R-05 文档不再写「禁用非法目标」（PROB-29）**：服务端只校验 `category_id` 是正整数且分类存在，「不存在 / 越权 / 跨层级违规」三类在当前数据模型都不成立。R-05 五处表述改为「不禁用任何目标 + 对会让公开书签从公开首页消失的目标逐项标注后果」。
- 工程规范同步：`CONTRIBUTING.md` 的分支模型与发版流程改为「`develop` 既是集成也是发版与部署来源，tag 打在 `develop`，`main` 降级为只在维护者主动要求时合入的归档快照」；并写明关闭关键字在非默认分支不生效、Issue 需在部署验证后手动关闭。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 699 passed（新增 `tests/unit/homeCategoryScopeActions.test.ts` 10 条组件测试，含菜单项顺序与回调隔离断言）；`npm run build` 成功。**未运行部署与 L3**：移动端菜单的断点可见性、40 px 卡片的真机列数与触控都未验证，已登记为 `PROB-11v` / `PROB-28v`。

### 新增主分类入口的图标语义修正

- PC 右上角浮动操作行的「新增主分类」此前只画一个裸加号（U+FF0B），与旁边的 ⚙ / ↪ 并排时说不出加的是什么——可能被读成新增书签。`aria-label` / `title` 一直是对的，缺的是**视觉**语义。
- 改为描边 SVG「闭合文件夹 + 居中加号」，`aria-hidden="true"`，可访问名仍只由 `aria-label` 提供，按钮不再有可见文本。与分类标题内「新建子分类」的图标（文件夹 + 悬在右下角外侧的加号）轮廓不同，两个入口不会互相混淆。
- 尺寸 1.3rem、`stroke-width: 1.9`，沿用 `.back-to-top-button svg` 既有的描边约定；按钮外框、间距、移动端 36×36 触控下限都没动。
- 验证：`tests/unit/homeFloatingActions.test.ts` 升到 jsdom 组件测试——断言访客态不渲染该入口、登录态可访问名与 `data-testid` 不变、图标是 `aria-hidden` 的 svg 且恰好两笔路径、按钮可见文本为空，并锁定源码里不再出现裸加号字符。独立临时 profile 的 Chrome 渲染了同一段标记与 CSS 做视觉确认（浅色与暗色各一次，图标实测 21×21 px），**未在部署页面上验证**。本轮收尾全量门禁：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 700 passed；`npm run build` 成功；`git diff --check` 通过。

### 移动端不再丢掉设置里的「顶部边距」

- 用户报告部署后移动端自适应异常。逐宽度实测证伪了「布局溢出」：登录态与访客态在 280–820 CSS px 全区间 `scrollWidth - clientWidth` 都是 0，固定的目录导航按钮与首页标题也从不相交。真正查出的缺陷只有一条——**`content_layout.margin_top` 在 ≤720px 被整个丢弃**。
- `HomeHeroSearch.svelte` 的 `@media (max-width: 720px)` 把 `.hero-search` / `.hero-search.top-navigation` 的 `margin-top` 写成裸 `3.5rem` / `3rem`，覆盖掉桌面规则里的 `calc(... + var(--content-margin-top, 0%))`。设置项标签是「顶部边距」，并未像「桌面左右边距」那样限定桌面，而「底部边距」在 `.home-shell` 的移动端规则里是保留的——三者口径不一致，这条是遗漏而非取舍。
- 两条规则改回 `calc(3.5rem + var(--content-margin-top, 0%))` 与 `calc(3rem + var(--content-margin-top, 0%))`。「桌面左右边距」`--content-margin-x` 保持桌面独有，不动（`tests/unit/homeResponsiveLayout.test.ts` 原有断言继续锁定这一点）。
- 本地隔离实例实测（登录态、390×844 起逐档改宽）：顶部边距设 8% 时移动端 hero `margin-top` 由恒定 56px 变为 82.2px（360）/ 84.6px（390）/ 86.4px（412）/ 87.8px（430）/ 93.4px（500），标题与目录导航按钮的间距从 6px 升到 32–43px；顶部边距为默认 0 时仍是 56px，**默认配置零视觉变化**。各档 `scrollWidth - clientWidth` 均为 0。
- 验证：`tests/unit/homeResponsiveLayout.test.ts` 新增一条断言，锁定桌面与移动端两处都叠加该变量，并用负向断言禁止再写回裸 `3rem` / `3.5rem`。
- 排查副产物（非本次改动）：`public/sw.js` 的导航请求是 stale-while-revalidate，`sw.js:173-175` 已写明「部署新版本后用户下一次打开看到的仍是旧版」；`main.ts:23-25` 会弹「已检测到新版本，刷新页面即可使用。」的 10 秒提示。因此部署后的第一次打开如果没再刷新一次，看到的是上一版构建——部署后验收必须刷新两次或强制刷新。

## 2026-09-04（图标代理关闭匿名枚举 / 引入组件测试层）
### 图标代理只对匿名可见的对象返回真实图标（PROB-20 方案 1）

- `GET /api/icon/:id` 与 `GET /api/category-icon/:id` 按可猜测的整数 ID 寻址且不要求登录，此前不区分公开/私密，任何人都能按 ID 枚举出私密书签和私密分类的图标；响应还会以不含身份的键写入共享 edge cache。
- 现在两个端点在返回真实图标前判定「对匿名访客是否可见」，口径与 `/api/public/data` 完全一致：复用 `getPublicCategoryIds` 的祖先链遍历，因此挂在私密分类（或其后代）下的**公开**书签同样被拒绝，而不是只看对象自身的 `is_private`。
- 被拒绝的请求返回**传空标题与空 URL** 的兜底 SVG。兜底图会渲染标题前 4 个字符或 URL 的 hostname，不传空就等于换个形式泄露；传空后「私密」与「ID 不存在」的响应完全一致，不留存在性线索。
- 判定发生在 edge cache 命中查询之后，而旧条目是在没有判定的情况下写入的、`s-maxage` 为 6 天，只加服务端过滤不会让它们失效。新增 `ICON_CACHE_NAMESPACE = '2'` 并写进缓存键的 `ns` 参数，旧条目立即不可达；契约里写明收紧判定口径时必须同时递增该值。
- 分类端点改为一次 `listCategories` 同时得到可见集合与目标分类，比原先的 `getCategory` 少一次查询；书签端点只在 cache miss 时多一次分类读取，cache 命中路径与同源请求数不变。
- 已知降级：后台预览私密书签/私密分类的真实图标现在也只得到兜底图标。恢复需要签名 URL 或等价凭据通道（`<img>` 不发 Bearer Token），已登记为后续项。未采用 HttpOnly Cookie（为一个 `<img>` 场景引入全站第二凭据通道与 CSRF 面），也未采用「私密对象内联图标」——三条聚合 SQL 刻意都是 `NULL AS icon_blob`，内联会与 ~38KB 聚合目标和 1.5 MB 快照上限对着干。
- 验证：`tests/unit/publicVisibility.test.ts` 覆盖公开、`0`/`false` 公开、`true`/`1` 私密、公开书签挂私密根、公开书签挂私密后代、分类已删除六种情形；`tests/unit/iconResponses.test.ts` 覆盖缓存键命名空间与两个端点的门禁，含「三条拒绝路径都必须传空标题空 URL」的计数断言。**未做匿名枚举探针实测**，该项需可达部署实例。

### 引入组件测试层（PROB-18 方案 B）

- 此前 `tests/` 的 100 个文件全在 `tests/unit/`，其中 25 个是 `readFileSync` + `toContain` 源码文本断言：只能证明模板里写了某串字符，证明不了 `aria-describedby` 的 id 真的解析到存在的元素，也证明不了选项可点。
- 核对推翻了「缺的是 e2e」这个定性：焦点陷阱、`aria-activedescendant` 有效性、`isComposing` 拦截、destroy 清理都不需要真浏览器；而 computed style 验收、`100dvh` + 虚拟键盘、剪贴板 transient activation 是 jsdom 做不到的。两层需要不同工具，这一轮只补前者。
- 新增 devDependencies `@testing-library/svelte@^4.2.3` 与 `jsdom@^26.1.0`。选 jsdom 26 而不是 30：30 的 engines 要求 node `^22.22.2 || ^24.15.0 || >=26`，而 CI 用的是 node 20。
- **不改全局 vitest 环境**：组件测试用文件首行 `// @vitest-environment jsdom` 单文件启用，既有 100 个文件仍跑默认 node 环境。
- 新增 `tests/unit/categoryTreeSelect.test.ts`：在真实 DOM 上断言每条 `notice` 的 `aria-describedby` 都解析到带该文案的元素、无 `notice` 的选项不带该属性、带后果提示的选项可点击且点击后菜单关闭并改显新选择。同时退役 `adminBookmarkLayout.test.ts` 里被它取代的 4 条源码文本断言，避免重复覆盖。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 101 files / 689 passed；`npm run build` 成功；`git diff --check` 通过。


## 2026-09-04（批量移动默认目标 / 导航谓词纯化 / 设置字段契约 / 排障定位）
### 批量移动默认目标改为「多数书签所在分类」（R-05 验收补齐，PROB-02）

- 此前 `openMoveModal` 取 `selectedBookmarks[0].category_id`，即首个选中项所在分类，与 `GITHUB_ISSUES_REQUIREMENTS.md` R-05 要求的「多数书签所在分类」不符。
- `src/lib/adminListState.ts` 新增纯函数 `pickMajorityCategoryId(selectedBookmarks, categories)`：按 `buildAdminCategoryGroups` + `flattenAdminCategoryGroups` 的展示顺序（`sort` 再 `id`）遍历，用严格 `>` 取众数，因此并列时确定性地落在排序最靠前的分类。
- 候选集限定为分类树里真正可选的分类：已删除的 `category_id` 与挂在不存在父分类下的孤立分类都不参与统计，也不可能成为默认值（旧实现会把这类 id 直接塞进 `moveTargetId`，得到一个树里选不到的目标）；空选或全部目标已删除时回落到排序最靠前的分类。
- 验证：`tests/unit/adminListState.test.ts` 覆盖全同分类、明确多数、两组并列（含「id 更小但排序更靠后」的判别用例）、空选、目标已删除、孤立子分类；`tests/unit/adminBookmarkLayout.test.ts` 锁定组件接线并断言不再出现旧的 `selectedBookmarks[0]` 取值。

### `isValidNavigationSetting` 拆除副作用（PROB-21）

- 该函数签名是 `value is Settings['navigation']` 类型谓词，却在返回 `true` 之前就地改写 `value.top_layout`（缺失或非法一律写成 `'scroll'`）。它的正确性依赖调用方在守卫之后读取被改写的同一个对象——任何「先校验、后另取原值」的新调用点都会静默出错，而这个函数是 `export` 的。
- 现在谓词只判断 `position` 与 `always_expanded`，不读取也不改写入参；谓词类型收窄为 `Pick<Settings['navigation'], 'position' | 'always_expanded'> & { top_layout?: unknown }`，不再谎称 `top_layout` 已合法。`top_layout` 的降级改由 `normalizeNavigationSetting` 在构造返回值时完成，外部可观察行为不变。
- 验证：`lsp references` 确认该导出只有 `normalizeNavigationSetting` 一个调用点。`tests/unit/settingsData.test.ts` 原先把副作用写进契约的用例改为断言「校验且不改写入参」（对传入对象做 `toEqual`），归一化三态（缺失 → `scroll`、`wrap` → `wrap`、`grid` → `scroll`）仍由既有的 `settingsFromRows` 用例覆盖。

### 文档核对与修正

- `docs/reference/API_CONTRACT.md` 设置接口新增字段级契约表（PROB-08）：按 `SETTINGS_KEYS` 顺序列全 30 个键的类型、取值范围、归一化行为与默认值，并显式区分「服务端钳制」与「只是类型注释、服务端不钳制」（`site_title_font_size`、`card_background_opacity`、`background.blur`/`mask`、`content_layout` 数值项）；同时点明未知键在写入与读取聚合两个方向都会被丢弃，`most_visited_count` 与 `site_title_show` 在 PUT 没有类型校验、只在读取时归一化。原先落在浏览器同步小节之后的 4 段设置说明移回「设置接口」标题下，长度上限段不再重复逐字段数字。
- `docs/guides/TROUBLESHOOTING.md` 补齐 `/install` 失败三态的定位路径（PROB-22）：核对发现三态原先都无法靠用户可见文案定位（页面显示「还缺少部署密钥」「还缺少存储绑定」「数据库暂时不可用」，文档小节标题却是「安装令牌无效」「Missing binding」「数据库初始化失败」），且 `unavailable` / `session_store_unreachable` 完全没有对应小节。现新增状态对照表（页面标题 + `data.state` / `data.reason` + 触发条件 → 小节），把用户文案写进既有小节标题，新增「会话存储暂时不可用」小节，并区分 `database_unreachable` 与 schema 缺失（手动执行 `schema.sql` 修不好前者）。
- `docs/plans/_archive/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §12 明确台账里的数值断点证据属于「一次性人工 CDP 证据，不构成持续回归」（PROB-16）。把它们补进 `scripts/chrome-regression.mjs` 需要可达的 `BASE_URL` 与真实管理员凭据（该脚本的安全场景会真实改写再还原管理员密码），还需额外引入视口仿真、确定性分类/书签 fixture 与下载断言；`AGENTS.md` 禁止未经要求启动本地服务或部署，因此这些断点并入 PROB-13 的部署后验收，回归套件本身未改动。
- `docs/plans/TODO.md` 与 `docs/plans/PROBLEM_HANDLING_TASK_LIST.md` 同步勾选与「处理结果」行。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 683 passed；`npm run build` 成功；`git diff --check` 通过；独立 Reviewer 逐条复核后判定 PASS。未运行部署、`smoke-test.mjs`、`chrome-regression.mjs` 与浏览器套件；PROB-02 的批量移动弹窗默认值只有纯函数单测与源码接线断言，未做真机目视确认。


## 2026-09-03（批量移动后果提示 / 毛玻璃强调色 / 文档核对）
### 批量移动目标树逐项后果提示（R-05 验收补齐，PROB-01）

- 核对发现 R-05 写的三个禁用理由在当前数据模型都不成立：`worker/routes/bookmarks.ts` 只校验 `category_id` 为正整数，`worker/lib/db/bookmarks.ts` 只校验「分类存在」；分类最多两层且两层都能挂书签，所以没有跨层级规则；管理员登录后可见全部分类，所以没有越权目标。
- 真正需要提前告知的只有一条：把公开书签移进私密（或私密祖先下的）分类，会让它从公开首页消失（`worker/lib/db/aggregates.ts` 的 `getPublicCategoryIds` 按祖先链隐藏）。因此按「可选 + 逐项后果警告」实现，不硬禁用服务端允许的管理员操作。
- `CategoryTreeOption` 新增 `notice`；`CategoryTreeSelect` 在一级/二级选项内渲染该文案并接入 `aria-describedby`，选项保持可选。
- `getAdminBookmarkCategoryOptions` 改为接收当前选中书签，只在「选中集合含当前对匿名访客可见的公开书签」且目标分类会被隐藏时标注「移入后会从公开首页隐藏 N 个公开书签」；已经躺在私密分类里的公开书签换到另一个私密分类属于「保持隐藏」，不计入 N。新增 `getHiddenCategoryIds` 作为前端镜像。
- 确认弹层重申一次后果，并说明私密书签不受影响、分类可改回公开。
- 验证：`tests/unit/adminListState.test.ts` 覆盖私密根/私密后代/环形数据/计数/无需提示/已隐藏不重复计数等情形；`tests/unit/publicVisibility.test.ts` 交叉断言前端镜像与服务端 `getPublicCategoryIds` 逐项一致，防止两侧漂移；`tests/unit/adminBookmarkLayout.test.ts` 锁定逐项文案、无障碍描述与「不引入 `aria-disabled`」。

### 13 套毛玻璃预设改为逐套强调色（REQ-08）

- 此前 13 套 `glass` 预设共用硬编码 `accentColor: '#2563eb'` / `darkAccentColor: '#7dd3fc'`；9 套 `paper-*` 护眼预设各自已有调好的强调色，未做改动。
- `GradientPresetStyle` 新增 `accent` / `darkAccent`，逐套按该预设主色相取深/浅档：清透蓝绿 `#155e75`、晨雾石青 `#0f766e`、珊瑚晴空 `#be123c`、鼠尾草石墨 `#3f6212`、琥珀晨光 `#92400e`、余烬夜航 `#b91c1c`、紫晶破晓 `#6d28d9`、深海蔚蓝 `#0369a1`、极光苔原 `#047857`、柑橘日落 `#9a3412`、玫瑰星轨 `#be185d`、靛蓝秘境 `#4338ca`、陶土沙丘 `#7c2d12`。浅色与深色强调色各 13 个取值互不重复。
- 这是用户确认接受的视觉变动，不属于「引入 token 不改变视觉」的等值替换。
- 验证：`tests/unit/settingsForm.test.ts` 断言浅色与深色强调色各自 13 个取值互不相同、无一残留旧的 `#2563eb`，并按**最坏可见区域合成后的卡片色**断言对比度 ≥ 4.5:1（最暗 linear stop → 叠最暗 radial 热区 → 叠遮罩层 → 按 `cardBackgroundOpacity` 合成半透明卡片）。实测最低浅色 4.58（极光苔原）、深色 9.26（靛蓝秘境）；阈值调到 5.0 即失败，证明断言走的是合成路径，而不是偏乐观的纯实底卡片色（后者最低 5.47）。

### 文档核对与修正

- 新增 `docs/plans/TODO.md`（扁平勾选清单，按「立即可做 / 需裁定 / 需运行环境 / 需澄清 / 未获批准」分组）、`docs/plans/PROBLEM_HANDLING_TASK_LIST.md`（PROB-01～PROB-30）与 `docs/plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md`（REQ-01～REQ-12），作为 `plans/` 中唯一按可执行任务组织的三份文档；`docs/README.md` 增设对应索引小节。
- PROB-29、PROB-30 是实现 PROB-01 与 REQ-08 时新发现的条目：R-05 的「禁用非法目标」表述仍待改写；`src/lib/appData.ts:253-255` 在无预设时仍回退旧的共用冷蓝 `#2563eb`/`#7dd3fc`（本轮授权范围只含 13 套毛玻璃预设，未改）。
- `docs/reference/API_CONTRACT.md` 书签端点表补上此前漏列的 `POST /api/bookmarks/reorganize`，并补齐其请求形状与 `CONFLICT=1006` 语义。
- `docs/reference/GITHUB_ISSUES_REQUIREMENTS.md` 快照更新到 2026-09-03，Open 数量 5 → 6，补入 #15（EdgeOne 部署兼容请求，标题仍是模板占位，维护者已回复未排期），并说明它未获实现承诺、未分配 R 编号。
- `docs/plans/_archive/UI_UX_Plan.md` 补文首状态块，明确它是已被 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 取代的原始草案，不作为待办；`docs/README.md` 计划清单补上它与 `DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md`。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 680 passed；`npm run build` 成功；`git diff --check` 通过。未运行部署、`smoke-test.mjs`、`chrome-regression.mjs` 与浏览器套件。


## 2026-08-31（移动端拖拽回归修复）
### 分类树触摸滚动与书签拖拽冲突修复

- 根因：首页排序态的 SortableJS 对整个 `[data-sortable-item]` 启用拖拽；分类菜单和移动按钮位于可拖拽卡片内部，仅靠 `z-index`、`overflow-y` 和 `touch-action` 无法阻止父级拖拽竞争。
- `sortableList` 新增 `filter` 与 `preventOnFilter` 选项；首页排序过滤 `.bookmark-context-menu`、`.category-tree-menu` 和 `.bookmark-mobile-menu-trigger`，并关闭过滤区域的 `preventDefault`，保留浏览器原生触摸滚动。
- 菜单和移动按钮阻断 pointer/touch 事件冒泡，避免打开菜单后再次触发卡片拖拽。
- 验证：真实 Chrome CDP 触摸序列使分类树 `scrollTop` 从 0 增长到 199，页面 `window.scrollY=0`，`sortable-ghost=0`、`sortable-drag=0`；`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；console errors/page exceptions/failed requests 均为 0。


## 2026-08-31（分类树滚动验收）
### 移动端排序分类树滚动穿透修复

- 分类树菜单增加 `overscroll-behavior: contain`、`touch-action: pan-y` 和 iOS 惯性滚动支持，阻止触摸滚动链穿透到首页书签列表。
- 分类树所属书签卡片在菜单打开时提升 stacking context（`z-index: 130`），高于首页排序浮窗，确保树内鼠标/触摸命中并可滚动。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；真实 CDP 鼠标滚轮验证分类树 `treeScrollTop=300`、页面 `windowScrollY=0`；截图确认后续分类项可见、排序浮窗不遮挡；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第五轮验收反馈）
### 部署后验收反馈修复（第五轮）

- 修复移动端长按打开菜单/编辑弹窗后页面偶发无法点击：改用基于时间戳的触摸守卫（`withinTouchGuard`，700ms），长按后随即触发的合成 click 被忽略，不再关闭刚打开的菜单，也不会残留状态吞掉后续点击；移除易卡死的 `suppressNextClick` 标志与全局捕获监听。
- 恢复 PC 侧栏当前锚点的突出色：`.toc-item.active .toc-slip` 使用 `--toc-accent`（主题强调色）并铺满宽度，收缩态可清晰指示当前分类；亮色模式非当前项标记由深灰改为乳白（`rgba(248, 250, 252, 0.9)`）。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；spawned headless Chrome：390px 长按弹菜单→编辑→关闭后分类切换正常、二次长按仍生效（menuOpenAfterLongPress/modalOpen/modalGone/tabActive/secondMenuOpen 全 true）；1440px 亮色收缩侧栏当前项 slip `rgb(37,99,235)` 强调、其余 `rgba(248,250,252,0.9)` 乳白；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第四轮验收反馈）
### 部署后验收反馈修复（第四轮）

- 移动端批量浮层不再遮挡分页：改为在 `.admin-panel-footer` 上追加 104px 底部间距，浮层固定于底部导航上方，分页按钮完整可见。
- 恢复 PC 收缩侧栏的圆柱（slip）标记：`.toc-slip` 默认恢复 `--toc-slip` 底色；仅在展开态隐藏非当前项标记，收缩态所有分类保留圆柱指示。
- 长按弹出的操作菜单改为锚定在卡片下方（`top: calc(100% - 6px)`）并与卡片同宽（`left: 8px; right: 8px`），不再覆盖卡片标题，也不会在左列卡片时向左溢出屏幕。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；spawned headless Chrome 截图视觉审计（390px 批量浮层不遮挡分页、长按菜单在卡片下方不遮标题、亮色移动端抽屉当前项标记、PC 亮色收缩侧栏圆柱标记全显）；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第三轮验收反馈）
### 部署后验收反馈修复（第三轮）

- 移动端书签批量浮层压缩高度与留白：字号 12px、按钮 padding 6/10、浮层 padding 8/10，避免遮挡分页按钮。
- 移动端批量选中时列表底部空白修复：`≤700px` 下 `.admin-bookmark-list-panel` 改 `height:auto`、内容和滚动容器 `overflow:visible`，仅保留 `has-batch-selection` 的 84px 底部让位。
- PC/移动端新增书签、排序按钮改用语义化 SVG（书签加号、上下双向箭头）。
- 书签“移动到分类”文案与入口统一改为“移动”。
- 暗色模式下首页“本分类”与二级分类标签文字改为跟随 `--home-text-color`（白色），不再显示黑色。
- 移动端亮色侧边导航去除默认灰色蒙版（`.toc-slip` 默认透明），仅当前锚点分类显示灰色标记。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；relay Chrome 390px/1440px 复核浮层不遮挡分页、无底部空白、图标/文案/暗色标题/侧栏锚点标记均正确，console errors/page exceptions/failed requests 均为 0。

## 2026-08-31
### 部署后验收反馈修复（第二轮）

- 移动端书签卡片移除常驻三点按钮，普通态仅保留长按/右键编辑；仅排序模式显示“移动到分类”入口，并换用移动图标区分。
- 首页排序浮窗显示时，回到顶部按钮上移避让，PC/移动端不再重叠。
- 新建子分类按钮改用文件夹加号图标，与新增书签图标区分。
- 后台批量操作工具栏移出书签列表容器，改为固定浮层：PC 居中、移动端置于底部导航上方，列表不再被挤压出滚动条或空白。
- PC 二级分类标签保留滚轮与横向滚动条访问完整列表（移除失效的 12rem 预留 padding）。
- 分类标题字体与图标卡片保持在“外观与卡片 → 高级设置”内。
- 移动端导出按钮改为随“导入数据”卡片上方的正常流式全宽布局，取消全屏悬浮固定定位。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过。

## 已发布（版本制之前，按日期记录）

以下内容已经进入 `main` 并部署过，但当时没有版本号与 tag，因此保留原有的日期分节，不追认版本。

## 2026-08-30
### 部署后验收反馈修复

- 移动端默认隐藏“移动到分类”菜单项，进入首页排序模式后才开放移动入口。
- 移动端首页排序浮窗改为左右安全区自适应，说明单独一行，取消/保存按钮第二行并排显示。
- 新建子分类入口补充可见加号图标；PC/移动端后台批量操作工具栏与书签滚动列表分离，并避开移动端底部导航。
- 分类标题字体与图标设置移入“外观与卡片 → 高级设置”；PC 二级分类标签支持滚轮和横向滚动条访问完整列表。
- 移动端导出 CTA 上移至后台底部导航上方并预留安全空间。
- 验证：定向测试 37/37、`npm run type-check` 0 errors/0 warnings、`npm run build` 成功、701px/700px 断点浏览器回归通过，Console errors/page exceptions/failed requests 均为 0。
### Open Issue R-01～R-07 实现与 R-08 核对

- 首页支持一级到二级及空分类目标的跨分类排序；移动端提供“移动到分类”菜单，排序仍使用本地草稿、完整分类顺序和冲突恢复。
- 首页新增管理员可见的新建子分类/新增主分类入口；子分类预填当前一级，主分类默认无上级，成功后回首页定位并高亮新分类。
- 编辑书签分类树打开时自动展开父级、滚动并高亮当前分类；不可用分类显示明确状态且不静默改值。
- 后台新增 `POST /api/bookmarks/batch-move`，支持跨页选择、追加末尾/插入顶部、原子归属与排序更新、快照冲突 `1006`，并提供 PC/移动端批量工具栏。
- 设置页新增按层级的分类字号/图标尺寸设置，移动端统一 0.88 派生；详情卡片宽度下限调整为 44 px，44–80 px 显示提示，极简风格宽度控件置灰。
- R-08 未重复实现导出数据逻辑；已核对二级父分类补全、下载计数、replace/merge 和 PC/移动端布局，部署版本与原作者预期仍待同步。
- 验证：`npm test` 99 files / 666 passed；`npm run type-check` 0 errors / 0 warnings；`npm run build` 成功；干净临时 D1 API 冒烟 75/75；独立临时 Chrome 回归 25/25，console errors、page exceptions、failed requests 均为 0。


### Issue #8 功能建议落地

- 部分导出备份：管理员可按分类树选择导出范围，支持父子分类联动、必需父分类补入、settings 开关、全选/清空和空选择保护；导出文件继续兼容现有 `BackupData` 与导入流程。
- 顶部导航分行：新增顶部导航排布设置，桌面/宽屏支持多行换行，移动端 ≤799px 保持单行横向滑动；导航高度变化自动调整首页留白，二级菜单定位保持可用。
- 顶部操作按钮：主题切换、设置、退出按钮在顶部导航模式下与首行对齐，并在重叠场景浮于导航栏上方；移动端预留可滚动轨道空间，避免遮挡分类。
- 设置页 UI/UX：新增统一 Switch、Tooltip、InputGroup、Slider 基础组件；完成站点、首页显示、外观/卡片、布局/导航和搜索设置分区的控件、文案、联动与布局改造；浅色/深色背景改为内部 Tab。
- 验证：`npm run type-check`、`npx vitest run`（95 files / 649 passed）、`npm run build`、`git diff --check` 均通过；`scripts/smoke-test.mjs` 已按当前分类排序与导入重编号契约修正，API 冒烟 **75/75 全部通过**；`scripts/chrome-regression.mjs` 真实浏览器回归 25/25 全部通过（无控制台错误、页面异常与失败请求）；另用隔离 headless Chrome + CDP 完成桌面、移动断点、导出下载与导入验证。

### 设置页布局与提示修复

- 二级设置菜单改为顶部水平导航，桌面、平板和移动端分别使用 6、3、2 列布局，释放参数编辑区横向空间。
- Tooltip 气泡挂载到页面顶层并按视口定位，滚动或缩放时自动校准，避免被设置面板裁切；保留悬停、聚焦、点按、互斥及关闭交互。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 96 files / 655 passed；`npm run build` 成功；隔离 Chrome 覆盖六个设置分区、桌面/移动端布局、Tooltip 视口边界、滚动、互斥及关闭行为，未发现控制台或网络错误。


### 设置页详情卡片高度与滚动边界

- 设置详情卡片在桌面宽度（>1320px）按后台可用高度自适应，使用 `calc(100dvh - 180px)` 并保留 `560px` 最小值与 `960px` 最大值；计算中预留设置包装器底部 `24px` 间距，避免撑出外层滚动区域。
- 设置内容区继续在 `.settings-section-content` 内滚动；≤1320px 切换为单列自然高度，避免固定高度与窄屏页面滚动竞争。

## 2026-08-29

### PR #7 功能集成


感谢 @Helenvin 提交以下核心功能：

- 私密书签和私密分类：未登录访客不会收到受限数据，分类隐私会沿祖先链生效。
- 首页跨分类拖拽排序：管理员可以移动书签分类并统一保存归属和顺序。
- Chrome / Edge 浏览器书签单向同步：新增网页书签同步到“浏览器新增收藏”分类。

该功能经过代码审计、安全修复和回归验证后，以干净的 squash 方式集成到 `develop`，随后进入 `main`。由于原 PR 历史包含旧的主分支合并记录及不适合发布的截图，没有直接使用 GitHub 的原始 PR 合并历史；贡献者署名保留在集成提交和 PR 记录中。

审计期间补充的修复包括浏览器同步 CORS、分类私密标记导入、D1 批量排序、过期排序状态恢复、私密书签点击计数保护、默认 favicon.im 图标以及导入参数边界处理。

### Issue #8

修复 Chrome 展开子分类后左侧导航出现白色原生滚动条的问题。侧边栏仍支持滚轮、触控板、触摸和键盘滚动，仅隐藏原生滚动条显示。

Issue #8 正文中提出的部分导出备份和顶部导航分行显示属于独立功能建议，不包含在本次修复中。
