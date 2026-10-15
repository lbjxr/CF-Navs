> **STATUS: 已完成**（判定于 2026-10-15）——REQ-01 已发版落地；注意：正文"尚未实现"标记基于 2026-09-19 基线，已过时。

# Spotlight 命令面板与离屏搜索按钮需求（REQ-01）

> 状态：**需求评估，尚未实现**。批准后按本文档排期，状态由 `docs/BACKLOG.md` §5 承载，实现进度回写 `CHANGELOG.md`。
> 来源：`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §模块一（FR-1.1～FR-1.6）——该文档基于旧基线、行号已漂移，本文按当前 develop（2026-09-19，`e3eaf72`）源码符号重写，并补全验收、风险与已裁定决策。
> 实现须维护者**显式批准**才开工。开发契约见 `docs/plans/SPOTLIGHT_SEARCH_DEVELOPMENT.md`。

## 1. 目标

给首页加一套「离屏可唤起」的搜索能力，解决两个现状缺口：

1. **离屏不可达**：搜索框在页面顶部（`HomeHeroSearch.svelte` 的 `.hero-search`）。用户滚到长页面中下部时，顶部搜索框不可见也不可达，只能先滚回顶部。
2. **无键盘唤起**：全仓库无任何全局快捷键（`metaKey|ctrlKey|isComposing` 在 `src/` 零命中）；键盘用户无法快速聚焦搜索。

方案：搜索框滚出视口时淡入一个浮动搜索按钮（`HomeFloatingActions` 组内、主题切换按钮之前）；点按钮或按 `Ctrl+K` / `Cmd+K` / `/` 打开**居中 Spotlight 命令面板**，在面板内直接完成书签搜索与打开，不滚动、不离开当前位置。

## 2. 现状事实（实现基线）

| 事实 | 锚点 |
| --- | --- |
| 顶部 `<section class="hero-search">` 始终渲染；`search_box_show ?? true` 只门控内部 `.search-card` | `HomeHeroSearch.svelte:15-33`（root `:16`、search-card 门控 `:25`） |
| 搜索框双语义：回车/按钮 = 外部引擎跳转（`window.open(url_template.replaceAll('{q}'))`，**不过滤书签**）；本地实时过滤在 `Home.svelte` | `SearchBox.svelte:62-71,137-143`；`Home.svelte:430-437` |
| 引擎选择器 `role=listbox`（z-index 60），Escape 只关引擎菜单 | `SearchBox.svelte:95-96,112-120,46-50` |
| 首页本地过滤 120ms 尾沿防抖：`searchQuery`（即时）→ `deferredSearchQuery`（防抖后）分离，列表只读后者 | `Home.svelte:38,101-102,237-246` |
| 匹配与记忆化索引：`buildSearchIndex` 索引 **标题+URL+描述+分类标题**；`bookmarkMatchesSearch` 命中 | `homeData.ts:39-66`；记忆化 `getSearchIndex`（`:288-301`）、分类标题图 `getCategoryTitleMap`（`Home.svelte:105`） |
| 浮动操作组 `HomeFloatingActions`：fixed top:1.25rem right:1.25rem z-index 70；`aria-haspopup` 菜单、Escape/外点关闭、主题切换按钮已存在 | `HomeFloatingActions.svelte:110-123,152,158-163` |
| 顶部导航栏 fixed top:12px z-index 60 height 52px；浮动组已在其上（70，需求 C 已定） | `Sidebar.svelte:656-673` |
| `open_method` 是**数值** `1|2|3`：1=新窗口、2=当前页、3=当前页弹层 | `shared/types.ts:28,328` |
| `open_method=3` 弹层已是独立组件 `BookmarkLinkModal.svelte`（`title/url/onClose`）；卡片打开还会 `publicStore.incrementClick` + `api.public.registerClick` | `BookmarkCard.svelte:10,315-321,471-473` |
| 全局无快捷键、无焦点陷阱；既有惯例 = Escape 关闭 + 还原触发器 + roving focus | `Sidebar.svelte:231-250,403-411` 等 |
| 滚动锁现状：`BookmarkEditModal.svelte:265-282` 内联保存 `documentElement+body` overflow、onDestroy 还原（`:344-346`）——抽共享 | `BookmarkEditModal.svelte:265-282,344-346` |
| 遮罩形态先例：`ConfirmDialog.svelte` fixed inset-0 居中、blur scrim、`role=alertdialog`、z-index **220** | `ConfirmDialog.svelte:45-95` |
| z-index 实测阶梯：ConfirmDialog **220** < Spotlight **240**（新）< Tooltip **1000**（`ui/Tooltip.svelte:176`）< Toast **9999**（`Toast.svelte:40`） | — |
| 首页最近/常用派生（纯内存，零请求） | `getMostVisitedBookmarks`（`homeData.ts:91`）、`Home.svelte:115-117` |

## 3. 需求子项

### FR-1.1 搜索框可见性检测（searchBoxVisibility.ts）
- 新增单例 `searchBoxVisibility.ts`：`IntersectionObserver` 观察 `.hero-search`（常驻 `<section>`），`threshold: 0`、无 `rootMargin`——搜索框**离开视口即离屏**。
- 无 `IntersectionObserver` 时回调恒「可见」（降级为不显示浮动按钮，不报错）。
- 暴露 `subscribe(onChange)` / `destroy()`；`Home` 组件销毁时释放。

### FR-1.2 浮动搜索按钮
- 位置：`HomeFloatingActions` 操作组内、主题切换按钮**之前**；沿用需求 C 落地规则（`.below-top-navigation` 对齐、z-index 70 > 顶部导航 60、移动端 48px）。
- 渲染条件：搜索框离屏时显示；`search_box_show === false` 时**恒显**（否则没有任何搜索入口）。
- `data-testid="home-search-button"`、`aria-label="搜索书签"`、`aria-keyshortcuts="Control+K Meta+K"`。
- 提示文案**按平台**：Mac 显示 `⌘K`、其余显示 `Ctrl K`（D-f）。
- 过渡只动 `opacity/visibility`，`prefers-reduced-motion: reduce` 下禁用动画（沿用 `HomeFloatingActions:68-70` 的 matchMedia 先例）。
- `HomeFloatingActions` 只回调不持 Spotlight 状态；`App.svelte` 持有 `spotlightOpen` 并幂等懒加载 `SearchSpotlight.svelte`。

### FR-1.3 Spotlight 命令面板（SearchSpotlight.svelte）
- 懒加载组件；遮罩/居中布局对齐 `ConfirmDialog` 形态；**z-index 240**（阶梯见 §2）。
- ARIA：容器 `role="dialog" aria-modal="true"` + 输入 `role="combobox"` + 结果 `role="listbox"`/`option` + `aria-activedescendant` 指向当前高亮项。
- 组件内自带 `.sr-only`（不跨组件泄漏）。

### FR-1.4 唤起与关闭
- 唤起：浮动按钮 / `Ctrl+K` / `Cmd+K` / `/`（D-d 保留 `/`）。全局键**排除输入态**（目标为 input/textarea/contenteditable）与 IME 组合中（`isComposing`）。
- **模态互斥（D-e）**：任一阻塞模态打开时（`loginModalOpen`/`bookmarkModalOpen`/`categoryModalOpen`/`confirmDialog`/书签查看弹层）不唤起 Spotlight——避免与既有单槽滚动锁冲突。
- 关闭：Escape / 点击 scrim / 选中并打开某书签。
- 滚动锁：把 `BookmarkEditModal.svelte:265-282` 的内联实现原样搬迁抽成 `pageScrollLock.ts`（保存→锁→还原），`BookmarkEditModal` 与 Spotlight 共用；行为不变。
- Escape 层级：Spotlight 打开时 Esc 只关 Spotlight，由 `App.svelte` 集中优先级；各层只在自身 `open` 时处理 Esc，互不穿透。
- **不改 `SearchBox` 的 Escape 语义**（只关引擎菜单）。

### FR-1.5 面板内搜索行为
- 复用 `homeData` 匹配（`bookmarkMatchesSearch` + `buildSearchIndex`，Spotlight 用自己的 bookmarks/categories 建索引或 `createHomeDataMemo`），**禁止另写一套匹配**；匹配范围 = 标题+URL+描述+分类标题。
- **即时过滤（D-a）**：Spotlight 输入不防抖——面板最多 50 行轻量项，过滤开销极小，命令面板惯例即时反馈。首页 120ms 防抖是给 354 张卡片的，Spotlight 不消费该常量（因此不抽 `searchTiming.ts`；首页保留本地常量）。
- **空查询（D-c）**：默认展示**常用书签**（`getMostVisitedBookmarks`，纯内存零请求）；无点击数据时回退空态文案。
- 键盘导航：↑/↓ 移动高亮（**到端循环**，D-g）、Home/End 跳首/末、Enter 打开当前高亮（只触发一次）、Escape 关闭。
- 鼠标：结果行 hover 高亮、点击即打开（与键盘共用同一打开入口）。
- 打开语义：`open_method` 数值 `1|2|3`——`1`→`window.open(_blank)`、`2`→`location.assign`、`3`→复用 `BookmarkLinkModal`（D-b，见开发文档 §3.5）；三者都同样登记访问计数（`incrementClick` + `registerClick`）。
- 结果上限 **50** 条 + 「还有 N 条」提示；空结果无额外网络请求。
- **不渲染 `BookmarkCard`**（保留轻量结果行，避免卡片行为进入面板），但结果行图标复用首页图标解析/本地缓存/代理/失败回退链路；有真实图标时显示图片，加载失败或无图标时稳定回退到文字图标。

### FR-1.6 状态独立（D-1）
- Spotlight 是**独立通道**：不写 `Home.searchQuery`、不触发 `handleNavigate`/`clearSearchImmediately`。关闭 Spotlight 后页面过滤态保持原样，两套搜索互不污染。
- 搜索范围 = **公开书签**（首页 `bookmarks`/`categories` 为公开集），不含私密/后台数据，与首页实时过滤一致。

## 4. 不做的事

- 不改 `SearchBox.svelte` 的引擎跳转与 Escape 语义（T-1.5）、不改其 `id="search-query"`。
- 不抽 `searchTiming.ts`（D-a 后无第二消费者，抽取只增无谓间接层）；首页 120ms 常量保留在 `Home.svelte:38`。
- 不重写 `BookmarkLinkModal`（复用现成组件），不改 `BookmarkCard` 的既有打开行为。
- 不碰 `iconVisibility.ts`、`shared/`、`worker/`、`api.ts`、`app.css` 全局 token。
- 不引入新依赖、不新增 `window` 滚动监听（C-9）、不用字面 transition 时长（C-10，走 `--transition-base`）、radius 用 token（C-11）。

## 5. 实施顺序（阶段化）

**阶段 1（地基，零像素变化）**：抽 `pageScrollLock.ts`（`BookmarkEditModal` 原样搬迁，行为不变），`BookmarkEditModal` 改引用。
**阶段 2（离屏检测 + 浮动按钮）**：`searchBoxVisibility.ts` → Home 订阅 + 透传 → `HomeFloatingActions` 新按钮（含平台化提示）。
**阶段 3（Spotlight 主体）**：`SearchSpotlight.svelte` + App 集成（`spotlightOpen` 懒加载、全局键与 Esc 优先级、模态互斥、焦点陷阱、滚动锁、即时过滤、50 条上限、常用书签空态、`open_method` 三分支含 `BookmarkLinkModal`、独立状态）。
**阶段 4（收尾）**：文档回写（RD/BACKLOG/CHANGELOG）、`perf:audit` 复测。

约束：`App.svelte`/`Home.svelte` 同时被其它模块（REQ-02/03）改动时**串行**；与顶部导航（需求 C）浮动按钮对齐改动也串行。

## 6. 验收清单

### 功能
- F1 搜索框离屏 → 浮动按钮淡入；回顶 → 淡出；reduced-motion 即时显隐。
- F2 `search_box_show=false` 时按钮恒显。
- F3 三种唤起（按钮 / Ctrl+K / Cmd+K / `/`）可用；输入态与 IME 组合中不触发；任一阻塞模态打开时不唤起。
- F4 打开即聚焦输入框；关闭（Esc/scrim/选中）后焦点还原到触发元素；滚动锁开合正确。
- F5 输入**即时**出结果（无防抖延迟）；空查询显示常用书签（无数据回退空态）。
- F6 ↑/↓（到端循环）/Home/End/Enter（按 `open_method` 打开且只触发一次，含 `3` 走 `BookmarkLinkModal`）/鼠标点击均可；三种打开都登记访问计数。
- F7 结果上限 50 + 「还有 N 条」；空结果零额外请求。
- F8 Esc 不穿透；关闭后 `Home.searchQuery` 未被写入，页面过滤态不变。

### 键盘与焦点（真实浏览器层，L2）
- K1 Tab 循环自洽（焦点陷阱）；K2 关闭后焦点还原；K3 与引擎菜单/顶部子菜单共存不串焦点；K4 IME 输入不误触发。

### 性能
- P1 `npm run perf:audit` 9 项全过，其中**图标请求 ≤260 在「Spotlight 出满 50 条结果」场景实测**。
- P2 首页搜索防抖 gate（时序稳健版）不回归。
- P3 无新增 `window` 滚动监听（C-9）；transition 全走 token（C-10）。

### 无障碍（jsdom 断言 + L2 实测）
- A1 `dialog/combobox/listbox/option/aria-activedescendant` 语义完整且 `aria-activedescendant` 只指向现存 option。
- A2 scrim 有可访问名；结果行图标 `aria-hidden`（不渲染 BookmarkCard）。
- A3 源码断言：z-index 240、`border-radius: var(--radius-xl)`、不含 `id="search-query"`。

## 7. 验证策略（按层）

- **L0（每阶段）**：`type-check` / `test` / `build` / `git diff --check`。新增单测：`searchBoxVisibility`（IO/降级/destroy）、`pageScrollLock`（保存/还原/重复锁/异常释放）、`SearchSpotlight`（ARIA/键盘路由/即时过滤/50 条截断/常用书签空态/`open_method` 三分支/不写 searchQuery）、扩充 `homeFloatingActions.test.ts`。阶段 1 要求零像素变化。
- **L2（PROB-18c 基座）**：焦点陷阱/Tab 循环/三键/IME/Esc 层级/模态互斥/滚动锁/移动端虚拟键盘与 safe-area/z-index 240 叠放，用 `scripts/lib/cdpSession.mjs` + 真实 Input（`real-chrome-cdp-testing` 流程）。
- **L3**：`perf:audit` 9 项 + Spotlight 出满 50 条场景图标请求数实测。

## 8. 风险清单

- **R1 图标请求预算（实现口径已更新）**：结果行现在显示真实图标，可能增加最多 50 条图标链路请求；仍不渲染 `BookmarkCard`，必须在 L3「Spotlight 出满 50 条结果」场景实测 C-5 图标请求 ≤260 与 Cache Storage ≤5 MiB。
- **R2 Esc 层级/模态互斥**：全局 keydown 多方监听 + 单槽滚动锁——App 集中 Spotlight 优先级 + 模态打开时不唤起（D-e），L2 逐层验证。
- **R3 与其它模块串行**：`App.svelte`/`Home.svelte` 与 REQ-02/03、需求 C 共改须串行。
- **R4 jsdom 盲区**：焦点陷阱/IME/滚动锁/安全区只能 L2（PROB-18c 基座），否则登记发版前清单。
- **R5 滚动锁搬迁回归**：`BookmarkEditModal` 抽共享须行为不变，原样搬迁 + 单测锁住。
- **R6 `BookmarkLinkModal` 与 Spotlight 叠放**：`3` 分支复用现成组件，但由 App 在 Spotlight 关闭后打开（避免弹层套弹层），L2 验证滚动锁与焦点交接。
