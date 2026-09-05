# 变更记录

> **版本规则**：本文按版本分节。`[Unreleased]` 是已在 `develop` 上交付但尚未打版本 tag 的内容。
> 发版时把 `[Unreleased]` 标题改成 `## v<x.y.z> — <YYYY-MM-DD>`，在其上留一个新的空 `[Unreleased]`，并同步 `package.json` 的 `version`。
> tag 打在 `develop` 上，部署来源也是 `develop`；`main` 只在维护者主动要求时作为归档快照合入，不代表线上代码。
> 完整发版流程见 [CONTRIBUTING.md](CONTRIBUTING.md) 第 6 节。版本制之前的记录按日期分节保留，不追认版本号。

## [Unreleased]

尚未打版本 tag。以下小节按开发轮次记录，将分三批归入 `v0.2.0` / `v0.3.0` / `v0.4.0`，批次边界见 `docs/BACKLOG.md` 的 `REL-01`。
判定依据：`origin/main` 的变更记录止于 `2026-08-30`，因此 `2026-08-31` 及之后的全部小节都属于本段。

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
- `docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §12 明确台账里的数值断点证据属于「一次性人工 CDP 证据，不构成持续回归」（PROB-16）。把它们补进 `scripts/chrome-regression.mjs` 需要可达的 `BASE_URL` 与真实管理员凭据（该脚本的安全场景会真实改写再还原管理员密码），还需额外引入视口仿真、确定性分类/书签 fixture 与下载断言；`AGENTS.md` 禁止未经要求启动本地服务或部署，因此这些断点并入 PROB-13 的部署后验收，回归套件本身未改动。
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
- `docs/plans/UI_UX_Plan.md` 补文首状态块，明确它是已被 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 取代的原始草案，不作为待办；`docs/README.md` 计划清单补上它与 `DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md`。
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
