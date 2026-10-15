> **STATUS: 已完成**（判定于 2026-10-15）——REQ-01 已发版（CHANGELOG：L0/L1/L2 验证通过+上线）。

# Spotlight 命令面板与离屏搜索按钮开发文档（REQ-01）

> 配套需求：`docs/plans/SPOTLIGHT_SEARCH_REQUIREMENTS.md`（验收清单与风险以需求文档为准）。
> 本文件是**实现契约**：模块接口、状态归属、键盘/无障碍接线、改动文件清单、分阶段落地顺序与验证门。
> 基线：develop（2026-09-19，`e3eaf72`）；页面效果图审核已通过（`tmp/req01-wireframe/scene{1,2}-*.png`，仅视觉参考，不入仓库）。
> 决策 D-a~D-g 已裁定，见 §10。

## 0. 交付范围一句话

首页搜索框离屏时右上角淡入「搜索书签」浮动按钮；点按钮或 `Ctrl+K`/`Cmd+K`/`/` 唤起居中 Spotlight 面板，**即时**搜索书签并按 `open_method` 打开，**不污染**首页现有过滤态。

## 1. 改动文件清单

### 1.1 新增文件（3 个）

| 文件 | 职责 | 关键契约 |
| --- | --- | --- |
| `src/lib/pageScrollLock.ts` | 可复用页面滚动锁 | 从 `BookmarkEditModal.svelte:265-282`（`setPageScrollLocked`）**原样搬迁**，行为不变；SSR/undefined 守卫；单槽幂等：重复 lock 不覆盖已存值，unlock 还原原始值后清空 |
| `src/lib/searchBoxVisibility.ts` | 搜索框离屏检测（单例） | `IntersectionObserver` 观察 `.hero-search`（常驻 `<section>`），`threshold: 0`、无 `rootMargin`；无 IO 时恒「可见」（降级不渲染浮动按钮）；导出 `subscribe(onChange): Unsubscriber` 与 `destroy()`；`Home` 卸载时释放 |
| `src/components/SearchSpotlight.svelte` | 居中 Spotlight 面板 | 见 §3 |

> **不新增 `searchTiming.ts`**：D-a 裁定 Spotlight 即时过滤，无第二个防抖常量消费者，抽取只增无谓间接层；首页 120ms 常量保留在 `Home.svelte:38`。

### 1.2 复用现成组件

| 组件 | 用途 |
| --- | --- |
| `src/components/BookmarkLinkModal.svelte` | `open_method=3`（当前页弹层）已是独立组件（props `title/url/onClose`，`BookmarkCard.svelte:472` 现用）。Spotlight 选中此类书签时由 App 复用它，**无需抽取或重写**（D-b=a 的低成本实现） |

### 1.3 修改文件（4 个）

| 文件 | 改动 |
| --- | --- |
| `src/views/Home.svelte` | 订阅 `searchBoxVisibility`，把 `searchBoxVisible` 传给 `HomeFloatingActions`；卸载时 `destroy()`。（`SEARCH_FILTER_DEBOUNCE_MS` 保持本地不变） |
| `src/components/HomeFloatingActions.svelte` | 新增 props `searchBoxVisible`、`searchBoxShow`、`onOpenSearch`；主题切换按钮**之前**插入搜索按钮（`data-testid="home-search-button"`、`aria-label="搜索书签"`、`aria-keyshortcuts="Control+K Meta+K"`、平台化提示）；渲染条件 `!searchBoxVisible || !searchBoxShow`；过渡只动 opacity/visibility，reduced-motion 即时；点击先 `closeMenu()` 再 `onOpenSearch` |
| `src/App.svelte` | 持有 `spotlightOpen` 与 `viewBookmark`（`open_method=3` 的复用弹层载荷）；懒加载 `SearchSpotlight`；渲染 `{#if viewBookmark}<BookmarkLinkModal ...>`；全局 keydown 统一唤起/关闭/Esc 优先级 + 模态互斥门 |
| `docs/plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md` | REQ-01 登记补充本开发文档引用（已完成） |

### 1.4 明确不改

`SearchBox.svelte`（引擎跳转、`id="search-query"`、Escape 语义）、`HomeHeroSearch.svelte`、`homeData.ts`（只复用不另写匹配）、`BookmarkCard.svelte`（既有打开行为不变）、`iconVisibility.ts`、`shared/`、`worker/`、`api.ts`、`app.css` 全局 token。

## 2. 地基抽取（阶段 1，零像素变化）

### 2.1 pageScrollLock.ts
搬迁 `BookmarkEditModal` 内联实现为模块级（模块内持有 `previousBodyOverflow / previousDocumentOverflow` 单槽状态）：

```ts
export function setPageScrollLocked(locked: boolean): void
```
- `locked=true`：仅在未锁时保存 `document.body.style.overflow` 与 `document.documentElement.style.overflow`，再置 `hidden`。
- `locked=false`：仅在已锁时还原两处原始值并清空保存。
- `typeof document === 'undefined'` 直接返回。
- `BookmarkEditModal` 改为调用本函数（onDestroy 释放路径 `:344-346` 不变），行为逐字节等价。
- **单槽约束**：这是 D-e「模态互斥」的技术根因——同一时刻只允许一个使用者持锁；Spotlight 与其它模态互斥打开，避免嵌套锁破坏还原。

## 3. SearchSpotlight.svelte 契约

### 3.1 Props / 状态归属
```ts
export let open = false
export let bookmarks: PublicBookmark[] = []
export let categories: PublicCategory[] = []
export let onClose: (() => void) | undefined = undefined
export let onViewBookmark: ((bookmark: PublicBookmark) => void) | undefined = undefined  // open_method=3 委托 App
```
- **不持有** spotlight 开关（`open` 由 App 传入）；面板内查询词是组件本地状态，**不写** `Home.searchQuery`（D-1）。

### 3.2 打开/关闭副作用
- `open` 变 true：`setPageScrollLocked(true)`；记录 `document.activeElement` 为还原目标；下一帧聚焦输入框；重置查询与高亮。
- `open` 变 false：`setPageScrollLocked(false)`；焦点还原到记录元素。
- `onDestroy`：若仍锁则解锁（兜底）。

### 3.3 搜索与结果（即时，D-a）
- 复用 `homeData`：`buildSearchIndex(bookmarks, getCategoryTitleMap(categories))`（`homeData.ts:39-54`）+ `bookmarkMatchesSearch`（`:60-66`），匹配范围 = **标题 + URL + 描述 + 分类标题**（`homeData.ts:46-51`）。
- **即时过滤**：输入变化直接算结果，**不防抖**（面板 ≤50 行轻量项，开销极小；首页 120ms 防抖与此无关）。
- **空查询（D-c）**：展示常用书签 `getMostVisitedBookmarks(bookmarks, N)`（`homeData.ts:91`，纯内存零请求）；无点击数据回退空态文案。
- 结果上限 **50**，超出显示「还有 N 条」；空结果零请求。
- 结果行保持轻量渲染（不渲染 `BookmarkCard`），图标复用 `deriveBookmarkCardIconBase/deriveBookmarkCardIconUrl` + `CachedBookmarkIcon` 同源的缓存/代理/失败回退口径：真实图片优先，失败回退 `iconText`。

### 3.4 键盘与 ARIA
- 结构：`role="dialog" aria-modal="true" aria-label="搜索书签"` → 输入 `role="combobox" aria-expanded aria-controls="spotlight-listbox" aria-activedescendant` → 结果 `role="listbox" id="spotlight-listbox"` → 行 `role="option" aria-selected`。
- ↑/↓ 移动高亮（**到端循环**，D-g：↓ 到底跳首、↑ 到顶跳尾）、Home/End 跳首末、Enter 打开当前高亮（§3.5，只触发一次）、Escape 调 `onClose`。
- 鼠标：结果行 hover 更新高亮、点击即打开（与键盘 Enter 共用 `openBookmarkFromSearch`）。
- 焦点陷阱：dialog 内 Tab 循环（收集可聚焦元素首尾包裹）；打开时首焦点输入框。
- IME：`keydown` 前检查 `event.isComposing` 与 `event.key === 'Process'`，组合中不响应方向键/Enter。

### 3.5 打开行为（open_method 统一入口，D-b=a）
`openBookmarkFromSearch(bookmark)`：先登记访问计数（与卡片一致，见 §3.6），再按 `open_method`（**数值 `1|2|3`**，`shared/types.ts:28`）：
- `1` 新窗口 → `window.open(url, '_blank', 'noopener,noreferrer')`（等价 `BookmarkCard` 的 `openInNewTab = open_method === 1`）。
- `2` 当前页 → 关闭面板后 `location.assign(url)`。
- `3` 当前页弹层 → **复用现成 `BookmarkLinkModal`**：调 `onClose()` 关 Spotlight，再 `onViewBookmark(bookmark)` 交由 App 渲染 `<BookmarkLinkModal title url onClose>`（避免弹层套弹层；App 是模态单一持有者）。

### 3.6 访问计数（与卡片一致）
三种打开都须 `publicStore.incrementClick(bookmark.id)` + `api.public.registerClick(bookmark.id)`（对齐 `BookmarkCard.svelte:318-319`），否则 Spotlight 打开漏计访问统计。

## 4. App.svelte 集成与键盘全局

### 4.1 状态与懒加载
```ts
let spotlightOpen = false
let viewBookmark: PublicBookmark | null = null   // open_method=3 复用 BookmarkLinkModal
let SearchSpotlightComponent: typeof import('./components/SearchSpotlight.svelte').default | null = null
const ensureSearchSpotlightComponent = createLazyComponentLoader({
  load: () => import('./components/SearchSpotlight.svelte'),
  getCurrent: () => SearchSpotlightComponent,
  setCurrent: (c) => { SearchSpotlightComponent = c },
})
function openBookmarkView(bookmark: PublicBookmark) { viewBookmark = bookmark }
function closeBookmarkView() { viewBookmark = null }
```
模板：`{#if SearchSpotlightComponent}<svelte:component this={SearchSpotlightComponent} open={spotlightOpen} {bookmarks} {categories} onClose={closeSpotlight} onViewBookmark={openBookmarkView} />{/if}`；`{#if viewBookmark}<BookmarkLinkModal title={viewBookmark.title} url={viewBookmark.url} onClose={closeBookmarkView} />{/if}`（`BookmarkLinkModal` 静态导入，体量小）。

### 4.2 全局 keydown（svelte:window，App 集中）
```ts
function anyBlockingModalOpen() {
  return loginModalOpen || bookmarkModalOpen || categoryModalOpen || Boolean(confirmDialog) || Boolean(viewBookmark)
}
function handleGlobalKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if (event.isComposing || typing) return

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    spotlightOpen ? closeSpotlight() : openSpotlight()
    return
  }
  if (event.key === '/' && !spotlightOpen) { event.preventDefault(); openSpotlight(); return }
  if (event.key === 'Escape' && spotlightOpen) { event.preventDefault(); closeSpotlight() }
}
```
- `openSpotlight()`：**模态互斥门（D-e）**——`if (spotlightOpen || anyBlockingModalOpen()) return`；否则 `void ensureSearchSpotlightComponent()` 后置 `spotlightOpen = true`。理由：`pageScrollLock` 是单槽（§2.1），嵌套锁会破坏还原。
- **Esc 优先级**：App 是兜底层，Spotlight 打开时 Esc 只关 Spotlight；其它层各自只在自身 `open` 时处理 Esc，互不穿透。

## 5. HomeFloatingActions 改动明细

- 新 props：`searchBoxVisible: boolean`（Home 传入）、`searchBoxShow: boolean`（`publicData.settings.search_box_show ?? true` 归一）、`onOpenSearch: () => AsyncVoid`。
- 渲染条件：`const showSearchButton = !searchBoxVisible || !searchBoxShow`。
- 按钮插主题切换前；`data-testid="home-search-button"`、`aria-label="搜索书签"`、`aria-keyshortcuts="Control+K Meta+K"`、`title` 平台化（Mac `搜索书签 (⌘K)`、其余 `搜索书签 (Ctrl+K)`，D-f）。平台判断用一个小工具（`navigator.userAgentData?.platform ?? navigator.platform`），不引入依赖。
- 移动端折叠形态：按钮进操作组随 `@media` 折叠（DOM 常驻，jsdom 可测）；点击先 `closeMenu()`。
- 视觉：类 `.search-fab`（对齐 `.icon-button` 2.5rem/圆角/边框），accent 高亮但**不新增全局 token**；过渡只动 opacity/visibility，reduced-motion 即时（对齐 `back-to-top-button` matchMedia 先例）。

## 6. 分阶段实施与验证门

| 阶段 | 内容 | 验证门 |
| --- | --- | --- |
| **1 地基** | `pageScrollLock.ts` 抽取；`BookmarkEditModal` 改引用 | L0（type-check/test/build/`git diff --check`）；纯 JS 抽取、不改 CSS/模板 → 视觉必然不变（C-3）；审计=全量单测绿（尤其覆盖 `BookmarkEditModal` 打开/关闭滚动锁的现有用例）+ `git diff` 仅为函数搬迁与 import 改写、无逻辑差异 |
| **2 离屏检测 + 浮动按钮** | `searchBoxVisibility.ts`；Home 订阅 + 透传；HomeFloatingActions 新按钮（平台化提示） | L0：`searchBoxVisibility` 单测、`homeFloatingActions.test.ts` 扩充（渲染三态/aria/点击回调/reduced-motion 类）；L2：真实滚动离屏/回顶显隐与动画 |
| **3 Spotlight + App** | `SearchSpotlight.svelte`；App `spotlightOpen`/`viewBookmark`/懒加载/全局键/模态互斥/Esc 优先级；`BookmarkLinkModal` 复用 | L0：SearchSpotlight 单测（见 §7）；L2（PROB-18c 基座）：三键唤起、模态互斥、Tab 陷阱、Esc 层级、滚动锁开合、焦点还原、`open_method=3` 交接 BookmarkLinkModal、移动端 100dvh/safe-area、z-index 240 叠放 |
| **4 收尾** | RD/BACKLOG/CHANGELOG 回写；`perf:audit` 复跑 | L3：9 项预算，含「Spotlight 出满 50 条」图标请求 ≤260（C-5）；首页防抖 gate 不回归；无新增 `window` 滚动监听（C-9） |

每阶段独立提交；`App.svelte`/`Home.svelte` 若与其它模块同轮改按仓库约定**串行**。

## 7. 测试计划

### 7.1 单元（jsdom）
- `pageScrollLock.test.ts`：lock→unlock 还原原始值；重复 lock 幂等；未锁 unlock 无副作用；SSR 安全。
- `searchBoxVisibility.test.ts`：注入假 IO 断言回调与销毁；无 IO 时恒可见。
- `SearchSpotlight.test.ts`：ARIA 结构、键盘路由（↑↓ 循环/Home/End/Enter 一次）、IME 排除、即时过滤（无防抖延迟）、50 条截断 + 「还有 N 条」、空查询显示常用书签、`aria-activedescendant` 指向现存项、`open_method` 三分支（`3` 调 `onViewBookmark`、其余打开路径）、访问计数被调用、不写 searchQuery；反向对照（去焦点陷阱/去循环后精确失败）。
- `homeFloatingActions.test.ts` 扩充：`searchBoxVisible=false` 显示、`searchBoxShow=false` 恒显、桌面平铺含按钮、点击调 `onOpenSearch`、平台化 title。

### 7.2 L2（真实 Chrome，PROB-18c 基座）
隔离临时 Chrome + CDP 真实输入（`real-chrome-cdp-testing` 流程）：焦点陷阱 Tab 循环、Ctrl+K/Cmd+K// 三键、模态互斥（Login/编辑弹窗打开时 Ctrl+K 不唤起）、IME 不误触发、Esc 层级、滚动锁开合、`open_method=3` → Spotlight 关闭 + BookmarkLinkModal 打开的焦点/滚动锁交接、关闭焦点还原、移动端 430×932 虚拟键盘与 safe-area、z-index 240 叠放。截图留证。

### 7.3 L3
`npm run perf:audit` 9 项 + Spotlight 出满 50 条场景图标请求（≤260）；grep 确认无新增 `window.addEventListener('scroll'`（C-9）。

## 8. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 焦点陷阱实现错误致 Tab 卡死 | L2 真实 Tab 循环用例 + 反向对照；陷阱逻辑抽纯函数便于单测 |
| `aria-activedescendant` 指向已消失项 | 结果更新重置高亮到 0，仅当高亮 < 结果数时设置 id |
| 单槽滚动锁被嵌套破坏 | D-e 模态互斥门（`anyBlockingModalOpen`）；`open_method=3` 先关 Spotlight 再开 BookmarkLinkModal，锁交接串行 |
| Esc 多方 keydown 竞争 | App 集中 Spotlight；各层只在自身 open 响应；L2 逐层验证 |
| 50 条真实图标可能顶破 C-5 ≤260 | 保持结果行轻量、不渲染 `BookmarkCard`，并在 L3 真实测量图标请求与 Cache Storage；jsdom 只覆盖 URL/回退与 ARIA，不能替代部署性能门 |
| 访问计数漏计 | §3.6 三种打开都登记；单测断言 `incrementClick`/`registerClick` 被调 |
| Svelte 5 响应式（模块级单例） | `pageScrollLock`/`searchBoxVisibility` 按既有单例先例（`toast.ts`/`iconAccessKey.ts`）并单测 |

## 9. 完成定义（DoD）

1. §1 清单落地，§6 阶段门逐项通过；
2. 需求文档 §6 验收 F1-F8 / K1-K4 / P1-P3 / A1-A3 全部达成或显式豁免；
3. L2 截图证据 + L3 `perf:audit` 通过记录；
4. RD/BACKLOG（§5 → 开工状态）/CHANGELOG 回写；
5. 无新增依赖、无新增 window 滚动监听、无字面 transition 时长（designTokens 扫描通过）。

## 10. 已裁定决策（D-a~D-g）

| # | 决策 | 结论 | 实现影响 |
| --- | --- | --- | --- |
| D-a | Spotlight 防抖 | **即时过滤，不防抖** | 不抽 `searchTiming.ts`；§3.3 即时；首页 120ms 保留本地 |
| D-b | `open_method=3`（弹层） | **复用现成 `BookmarkLinkModal`**，App 持 `viewBookmark`、Spotlight 关后交接 | §3.5/§4.1（成本低：弹层已是独立组件） |
| D-c | 空查询 | **常用书签**（`getMostVisitedBookmarks`），无数据回退空态 | §3.3 |
| D-d | `/` 唤起 | **保留** | §4.2 |
| D-e | 模态打开时 Ctrl+K | **禁止**（模态互斥门） | §4.2 `anyBlockingModalOpen`（单槽锁根因见 §2.1） |
| D-f | 快捷键提示 | **按平台**（Mac `⌘K`），`aria-keyshortcuts="Control+K Meta+K"` | §5/FR-1.2 |
| D-g | 方向键到端 | **循环** | §3.4 |

## 11. 实现自检与复核（审计）

测试内容见 §6/§7/§9；本节补「审计」——仓库特有陷阱的自检、独立复核与提交安全门。

### 11.1 实现陷阱（仓库特有，必须遵守）
- **Svelte 5 组件测试解析条件**：组件测试依赖 `vite.config.ts` test 模式的 `resolve.conditions: ['browser']`（`CONTRIBUTING.md` §4）。`SearchSpotlight`/`HomeFloatingActions` 在 `onMount` 注册的 `window`/`document` 监听器（全局键、外点关闭）在 jsdom 里靠它才存在。若测试观察不到监听器，**先排查解析条件与缺失的浏览器 API（`matchMedia`/`IntersectionObserver` 需自备 stub），再下「jsdom 做不到」的结论**。
- **写入后缩进自检**：本仓库 `write`/`edit` 可能把新文件缩进减半（JS/TS 语法检查不报错）。每次写/改后跑 `git diff --numstat`（只加几行却大量删行 = 缩进被重排）+ 前导空格宽度直方图（应全偶，出现 1/3/5 即异常），异常用逐行 `n→n*2` 修复后复验。
- **单槽滚动锁**：`pageScrollLock` 同一时刻仅允许一个持锁者（§2.1）。本方案靠 D-e 模态互斥回避嵌套；若将来要并存必须改引用计数，不可无脑二次 lock。
- **token 约束**：不用字面 transition 时长（走 `--transition-*`）、不新增 radius 字面（走 `--radius-*`）——`designTokens.test.ts` 递归扫描会拦截。
- **C-9 无新增 scroll 监听**：离屏检测用 `IntersectionObserver`（对齐 `iconVisibility.ts` 先例），禁止新增 `window.addEventListener('scroll')`。

### 11.2 独立复核
- **阶段 3** 属非简单改动（多文件 + 行为/UX/键盘/焦点/公共交互），Builder 完成并直接自验后走**独立 `workflow-reviewer` 复核**：输入原始目标、验收标准、实际 diff、L0/L2 证据；`PASS` 才交付，`CHANGES_REQUIRED` 修复后再核。
- **阶段 1/2** 视范围可跳过独立复核（单文件抽取 / 局部组件接线），但须在答复说明跳过理由。

### 11.3 提交与安全审计（每阶段）
- 每阶段**独立提交**、只闭环 REQ-01（`feat:` 主题）；实现进入默认分支才生效关闭，日常 `develop` 用 `refs`/不带关闭关键字（本地条目无 Issue，成果记 `CHANGELOG.md`）。
- 提交前过安全门（`CONTRIBUTING.md` §7 / `AGENTS.md`）：精确路径 `git add --`、`git diff --cached --name-only/--stat/--check`、完整暂存差异 + 敏感内容扫描（真实域名/凭据/Token/私有端点）、大文件门、分支/身份/远端分叉检查。
- L2/L3 用隔离临时 Chrome + 按精确 profile 清理（`real-chrome-cdp-testing`）；目标域名与凭据只在 Git 忽略的 `verify.local.json`，**不写进代码/文档/截图/提交**。

### 11.4 审计产物（DoD §3 证据）
- L2：隔离 Chrome 截图 + 控制台/页面异常/失败请求记录（焦点陷阱、模态互斥、Esc 层级、`open_method=3` 交接、移动端、z-index 叠放）。
- L3：`perf:audit` JSON（9 项 + 50 条场景图标数）、首页防抖 gate 未回归、C-9 grep 结果。
- 独立复核裁决（阶段 3）。

## 12. 交付闭环证据（2026-09-19）

- 提交（均在 `develop`，不合 `main`）：阶段1 `7d408a5`（抽 `pageScrollLock` + 单测）、阶段2 `79a3e1f`（离屏可见性 + 搜索按钮）、阶段3 `57a2736`（`SearchSpotlight` + App 集成 + 单测）、复核收敛 `0bafc83`（F1 竞态二次校验 / F2 CSS 令牌过渡 / F4 IME `Process`）、`826dd12`（消除隐藏态按钮组空槽回归）。
- L0：`type-check` 311 files 0/0；`npm test` 125 files / 923 tests 全通过；`npm run build` 成功。
| L2（历史证据） | 原实现的字母头像占位版本完成 REQ-01 场景 25/25：滚动进出搜索按钮、`Ctrl/Cmd+K` 唤起、居中命令面板、`open_method` 1/2/3、Esc/Tab/焦点还原、模态互斥、移动端窄视口无溢出；控制台错误/页面异常/一方 4xx-5xx 均 0。真实图标接入后的 L2 需重新复测。 |
| L3（历史证据） | 原实现的字母头像占位版本 `perf:audit` 全部预算通过（图标请求 232 ≤ 260、Cache Storage 1.2 MiB ≤ 5 MiB 等）；真实图标接入后的 Spotlight 50 条图标请求与 Cache Storage 预算需重新实测。 |
- 独立复核（`workflow-reviewer`）：第一轮 `CHANGES_REQUIRED`（F1 懒加载竞态 / F2 字面时长 / F3 私密书签口径质疑 / F4 IME）→ fix-forward `0bafc83`；第二轮 `CHANGES_REQUIRED`（F1/F4 收敛、F3 非缺陷判定成立、F2 引入隐藏态按钮组空槽回归）→ fix-forward `826dd12`。F3 经核验非缺陷：Home 与 Spotlight 共用同一 `publicData.bookmarks`，匿名端 `getPublicDataSource(includePrivate=false)` 已排除私密书签与私密分类树，展示范围与首页一致、无新增暴露面。
- 当前真实图标接入尚未在部署环境完成 L2/L3 复测；待 `develop` 部署后补跑真实图标、失败回退、控制台/网络错误与 C-5 图标请求预算。
