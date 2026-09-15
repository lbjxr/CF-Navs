# 前端体验与自用效率优化（需求评估）

> 状态：需求评估，尚未实现。本文不是待办清单，而是**把一份草案与真实源码核对之后**留下的决策记录。
> 基线：`develop` @ `5a06fb3`（源码核对基线；不将本地文档与 README 的工作区状态作为实现变更）。
> 来源：用户提交的《CF-Navs 前端体验与自用效率优化需求文档 (PRD)》草案，共 5 个模块 4 个阶段。
> 核对方式：逐条读 `src/`、`shared/`、`worker/`、`docs/reference/`、`tests/`、`scripts/` 对应实现；源码结论带 `文件:行号` 证据，浏览器平台约束另附规范/MDN 链接。
> 定位（沿用草案）：个人自用为主的高性能、低噪点书签管理工作台。单人写入、多设备只读浏览，优化目标是**减少视觉噪点**与**缩短录入路径**，不是多人协作。

## 0. 核对结论摘要

草案的 5 个模块中，模块一和模块三是主要空白；模块二、四、五的大部分机制已经存在，但模块四仍有 glass 预设 accent 缺陷，模块五仍有字母头像配色缺口，且多处草案前提与源码相反。逐项：

| 草案主张 | 核对结果 | 处置 |
| --- | --- | --- |
| 一：主搜索框离屏检测 + 右上角搜索按钮 + 居中命令面板 | 全部不存在。仅有的 `IntersectionObserver` 是图标懒加载单例（`src/lib/iconVisibility.ts:4-27`），可作为写法先例 | 采纳，见 FR-1.x |
| 一：即时过滤 + 120ms 防抖 | **已存在**（`src/views/Home.svelte:38`、`:238-249`、`src/lib/homeData.ts:39-66`） | 复用；新增 Spotlight 前先抽出可共享的常量，禁止复制第二个数值 |
| 一：拼音首字母匹配 | 实现树 `src/`、`tests/`、`scripts/`、`browser-extension/` 均无命中，依赖也不存在；本需求文档自身会出现该词 | 降级为 OQ-1，默认不做 |
| 二：hover 渐显操作胶囊、防布局抖动 | 预留列与 `.has-actions` 机制**已存在**（`src/components/CategorySection.svelte:230-236`、`src/components/HomeCategoryScope.svelte:21`/`:65`/`:362-364`） | 改为“接入已有机制”，不新建布局 |
| 二：移动端折叠为 `···` | 移动端**已折叠为图标方块**并隐藏文字（`CategorySection.svelte:536-546`、`HomeCategoryScope.svelte:394-404`） | 缩窄为 FR-2.3，仅在按钮 ≥3 个时才收进 Action Sheet |
| 三：弹窗打开时读剪贴板并预填 URL | 实现树 `src/`、`tests/`、`scripts/` 无 Clipboard API 命中；需求文档自身有相关文字；`BookmarkEditModal` **没有 `onMount`** | 采纳，但读取必须绑定打开按钮的用户手势，见 FR-3.1/FR-3.2 |
| 三：预填后触发标题/图标解析 | 标题管线已存在但**只由 URL 输入框 `blur` 触发**；图标候选已在 URL 变化时免费重算 | 拆成 FR-3.3（标题）与“无需开发”（图标） |
| 三：分类默认为视口中央分类 | 现有 scroll-spy 是**顶部对齐**，且 `activeId` 未暴露给 `App.svelte` | 采纳但改口径，见 FR-3.5 |
| 四：抽象 `--accent-primary` | accent 变量链路**已存在**：`--theme-accent-color` → `--home-accent-color`（`src/lib/appData.ts:253-255`、`:283`、`Home.svelte:675`/`:721`）；但 `SearchBox` 仍有独立的 Indigo 渐变字面量（`src/components/SearchBox.svelte:196-201`） | 驳回“组件完全没有硬编码颜色”的前提；只补缺失的层级 token，是否统一按钮渐变另列视觉决策 |
| 四：护眼主题 accent 改深青绿 `#059669` | **前提倒置**。9 个 `paper-*` 护眼预设各自已有调过的 accent；真正共用一个蓝的是 13 个 glass 预设 | 反向修，见 FR-4.2 |
| 四：卡片固定 48px 高、13px 标题、8px 间距 | 高度**早已是用户设置**（`card_size.height`，服务端默认 `60`，取 `0` 时回退 70px）；标题 14.4px、间距 13.1px；改 48px 会把信息卡图标从 44px 压到 36px | 改为受控调默认值，见 FR-4.4 |
| 五：`content-visibility: auto` 上首页分类容器 | 只加在搜索结果分组上，且**文档明确记录了“首页一级分组故意不加”的决策** | 降级为 OQ-4，需先推翻旧决策 |
| 五：`loading="lazy"` / `decoding="async"` | `BookmarkIcon` 已有，且多了 `fetchpriority="low"`；`CachedBookmarkIcon` 只有 lazy/async，缺固定尺寸与 fetchpriority（`src/components/CachedBookmarkIcon.svelte:101-110`） | FR-5.1 只把完整属性契约限定到书签图标渲染路径，并补齐缓存路径或明确其边界 |
| 五：`on:error` 回退字母头像 | **已存在**三级降级 + 首字兜底；缺的只是按书签派生颜色 | 缩窄为 FR-5.2 |
| 五：300ms 布尔互斥锁 | **已存在且更好**：900/900/600ms 时间戳窗口（`Home.svelte:78`、`:297`） | 驳回，见 FR-5.3 |

结论：草案中约一半的表面需求已由现有机制覆盖；真正新增或需要修正的主要是 Spotlight、剪贴板录入、glass accent、字母头像配色，以及与这些改动相关的可访问性和竞态护栏。照草案原样实施会重写已有逻辑、破坏 9 个调好的护眼配色、并推翻一条已记录的性能决策。本文按核对结果重排优先级。

## 1. 全局约束（所有模块必须遵守）

这些不是建议，是核对时发现草案会踩到的硬约束。

| 编号 | 约束 | 依据 |
| --- | --- | --- |
| C-1 | Svelte **4.2.19**，无 runes。只能用 `export let` / `$:` / `class:` / `use:` / `bind:` | `package.json` |
| C-2 | **没有 Tailwind / PostCSS 工具类管道**。草案里的 `px-3 py-2`、`font-medium` 一律译成组件内 scoped `<style>` + CSS 自定义属性 | `package.json` 无 tailwind 依赖；以源码构建配置为准 |
| C-3 | **引入 token 本身不得产生视觉变化**：新 token 的取值必须取现有代码中出现频次最高的那一档 | `src/app.css:5-9` 的设计原则注释；落地时还须由逐处 diff/视觉回归证明 |
| C-4 | 不得绕过设置契约。卡片几何、分类字号图标尺寸、搜索框显隐都是用户可配项，只能改**默认值与归一化逻辑** | `shared/types.ts:103-113`、`:147-149`、`:279-280` |
| C-5 | 性能审计必须保持 9 项检查：失败网络请求 `0`、破图 `0`、启动 splash `0`、快速搜索 settle 前 mutations `0`、后台搜索 rows `>0`、图标请求 ≤ `260`、Cache Storage ≤ `5 MiB`、`/api/admin/data` ≤ `60000` B、首页卡片 ≥ `300` | 阈值 `scripts/perf-audit.mjs:28-32`；检查项 `:489-545` |
| C-6 | 单测主要是**源码文本断言**（`readFileSync` + `toContain`），仓库没有组件挂载环境。要测行为必须先把逻辑抽成纯函数 | `tests/unit/*.test.ts` 通例；无 `@testing-library/svelte` |
| C-7 | 所有编辑入口继续由 `isAuthenticated` 门禁，不得因为“自用”放宽 | `Home.svelte:475`/`:495`/`:561`/`:588` 等 |
| C-8 | 新增遮罩层要落进**首页层级**的 z-index 阶梯，且不得盖住 Toast(9999) / Tooltip(1000)；后台层级另有独立值，不能把两棵层级树混写 | §2.1 阶梯表；后台组件实际层级见 `src/components/admin/**` |
| C-9 | 不得新增未合并的 `window` 滚动监听。现有 3 个监听中，`Home.svelte:382` 与 `HomeFloatingActions.svelte:61` 使用 passive；`Home.svelte` 的更新经 rAF 合并，`HomeFloatingActions` 直接更新；`Tooltip.svelte:69` 是捕获阶段监听且未声明 passive，但其处理函数内部会调度定位帧 | `Home.svelte:288-293`/`:382-393`、`HomeFloatingActions.svelte:50-63`、`ui/Tooltip.svelte:65-79` |
| C-10 | **新增的 `transition:` 声明里不得出现任何字面时长**。断言递归扫描 `src` 下 `.svelte`/`.css`：Svelte 只取 `<style>` 块，CSS 文件直接扫描；带分号声明中的数字时长与 `transition: all` 会失败 | `tests/unit/designTokens.test.ts:5-19`、`:47-69` |
| C-11 | 新增弹层的卡片圆角走 `border-radius: var(--radius-xl)`，控件尺寸走 `var(--radius-*)` / `var(--font-size-*)` / `var(--control-padding-*)`；控件 `font-size` 不得带 `!important`（触摸设备 16px 护栏需能覆盖） | `tests/unit/designTokens.test.ts:72-116`、`app.css:82-87` |
| C-12 | 仓库共 **100 个单测文件、0 个 e2e**。新增行为必须能被“纯函数单测 + 源码文本断言”覆盖，否则不算可验证；真实交互另列浏览器人工闸门 | `tests/unit/` 计数；无 `tests/e2e` 目录 |

## 2. 模块一：检索链路重构（Spotlight）

### 2.1 现状

**`SearchBox.svelte` 是外部搜索引擎启动器，不是书签过滤器。** 提交时执行
`window.open(engine.url_template.replaceAll('{q}', …), '_blank', 'noopener,noreferrer')`（`src/components/SearchBox.svelte:61-71`）。
它从不过滤书签；本地过滤全部在 `Home.svelte`，靠 `bind:query` 一路上传（`HomeHeroSearch.svelte:29` → `Home.svelte:429`）。

| 能力 | 状态 | 证据 |
| --- | --- | --- |
| 本地子串过滤（标题/URL/描述/分类路径） | 已有 | `Home.svelte:102-120`；`src/lib/homeData.ts:35-66` |
| 120ms 输入防抖 | 已有 | `Home.svelte:38`（`SEARCH_FILTER_DEBOUNCE_MS = 120`）、`:238-249` |
| 记忆化搜索索引 | 已有 | `homeData.ts:288-301`，按数组身份缓存 |
| 搜索态独立渲染分支（摘要 + 按一级分类分组） | 已有 | `Home.svelte:443-514` |
| `IntersectionObserver` | 实现树仅 1 个 | `src/lib/iconVisibility.ts:4-27`，`rootMargin: '420px 0px'`，首次相交后自解绑，唯一消费者 `BookmarkCard.svelte:326`；需求文档本身另有描述，不计入实现树 |
| 全局键盘快捷键 | **不存在** | `metaKey`/`ctrlKey`/`key === '/'`/`'k'` 在 `src/` 零命中；SearchBox 仅处理自身 Escape |
| 拼音 / 首字母 / 模糊匹配 | **不存在** | 实现树 `src/`、`tests/`、`scripts/`、`browser-extension/` 零命中；`package.json` 无依赖 |
| 焦点陷阱 | **不存在** | ConfirmDialog 只有基础 dialog 键盘处理；Sidebar 已有关闭后焦点恢复（`src/components/Sidebar.svelte:228-249`），因此不能概括为“焦点还原不存在” |
| 共享滚动锁工具 | **不存在** | 唯一实现内联在 `BookmarkEditModal.svelte:257-274` |
| 居中遮罩 + 可点击 scrim + Esc/Enter | 已有最佳参考 | `ConfirmDialog.svelte:26-52`、`:92-115`（`place-items: center`、`backdrop-filter: blur(10px) saturate(1.08)`、`overscroll-behavior: contain`） |
| 弹层懒加载约定 | 已有 | `App.svelte:130-151` + `src/lib/appLazyComponent.ts:11-33` |

z-index 阶梯（**仅首页新面板**必须落位）：首页排序条 20 < 侧栏遮罩 30 < 移动端按钮 40 < 回到顶部 50 < 引擎菜单/顶部导航 60 < 浮动操作 70 < 右键菜单 80 < 书签弹窗 100 < 链接弹层 120 < 卡片 130 < 批量移动 200 < ConfirmDialog 220 < Spotlight **240** < Tooltip 1000 < Toast 9999。后台管理层级另有 8/11/12/60/200/999/1001 等值，不纳入本表；新增层必须通过实际 DOM 叠放验证。

### 2.2 需求

**FR-1.1 主搜索框离屏检测（Svelte action）**
新增 `src/lib/searchBoxVisibility.ts`，按 `iconVisibility.ts:29-43` 的单例写法暴露一个 action，观察 `HomeHeroSearch.svelte` 的 `.search-card`。
- action 参数必须是稳定的 `onVisibilityChange(visible: boolean) => void`；挂载时先同步回调一次 `true`，之后按 `entry.isIntersecting` 回调，重复值不重复通知。
- 必须用 `IntersectionObserver`，不得新增 `window` 滚动监听（C-9）；`threshold: 0`，不加 `rootMargin`。
- action destroy 时必须 `unobserve`/断开本实例关联并忽略已经排队的旧 callback。API 缺失时回调 `true`（始终可见），即不显示浮动按钮，功能优雅降级。

**FR-1.2 右上角搜索按钮**
在 `HomeFloatingActions.svelte` 的 `.floating-actions` 横向 flex 行（`:67`、`:143-150`）里新增一个 `.icon-button`，插在主题切换之前。
- 复用现有 `.icon-button` 样式（`:181-195`）与移动端 2.2rem 变体（`:258-262`），不新造尺寸。
- `data-testid="home-search-button"`，`aria-label="搜索书签"`，`aria-keyshortcuts="Control+K"`。
- 仅当 FR-1.1 报告主搜索框不可见时渲染；淡入淡出只过渡 `opacity`/`visibility`，用 `var(--transition-base)`，并在 `prefers-reduced-motion: reduce` 下禁用或改为即时切换。
- `search_box_show === false` 时**恒定显示**（见 T-1.2）。
- 同步在 `tests/unit/homeFloatingActions.test.ts` 补 testid 与 aria-label 断言（该文件按源码字符串断言，`:8-27`）。
- `HomeFloatingActions` 只负责触发回调，不持有面板状态；新增 `onOpenSearch: () => void | Promise<void>`，由 `App.svelte` 持有 `spotlightOpen`、懒加载 pending/error，并对重复点击幂等。`Home.svelte` 只上报主搜索框可见性，不复制一份 open 状态。

**FR-1.3 居中命令面板（Spotlight）**
新增 `src/components/SearchSpotlight.svelte`，经 `createLazyComponentLoader` 懒加载（`App.svelte:130-151`）。
- 结构与样式对齐 `ConfirmDialog.svelte:92-115`：`position: fixed; inset: 0; display: grid; place-items: center; backdrop-filter: blur(10px) saturate(1.08); overscroll-behavior: contain`，外加一个满铺 `<button class="spotlight-scrim">` 承担点击外部关闭。
- z-index 取 **240**（高于 ConfirmDialog 220，低于 Tooltip 1000）。
- 语义：容器 `role="dialog" aria-modal="true"` 且有 `aria-labelledby`；输入框 `role="combobox" aria-autocomplete="list" aria-expanded aria-controls aria-activedescendant`；结果列表 `role="listbox"`，项 `role="option"`。`aria-activedescendant` 只能指向当前仍存在且 id 稳定的 option。
- 面板内输入框**不得**复用 `id="search-query"`（见 T-1.1）。
- 打开后聚焦输入框；Tab/Shift+Tab 不得逃出面板；关闭时恢复到触发器，触发器已卸载时恢复到安全的页面容器。结果、加载、无结果和“还有 N 条”通过独立 `aria-live="polite"` status 播报，不重复朗读整张列表。

**FR-1.4 唤起与关闭**
- 唤起：点击 FR-1.2 按钮；`Ctrl+K` / `Cmd+K`；`/`（仅当焦点不在 `input`/`textarea`/`[contenteditable]` 内）。
- 快捷键用 `<svelte:window on:keydown>`，与 `ConfirmDialog.svelte:42` 的既有约定一致；命中时 `preventDefault()`。`/` 还必须排除 `event.isComposing` 及 compositionstart/compositionend 期间，避免打断中文输入法。
- 关闭：`Esc`、点击 scrim、选中结果后。关闭时把焦点还原到唤起元素。
- 打开期间锁 body 滚动。**先把 `BookmarkEditModal.svelte:257-274` 的实现抽成 `src/lib/pageScrollLock.ts`**（保存并还原 `documentElement` 与 `body` 的原内联值），两处共用；抽取属于纯搬迁，不得改变行为。
- 只有 Spotlight 和 ConfirmDialog 同时打开时，Esc 归**上层**（Spotlight）处理。不能仅依赖 z-index 或两个 `window` listener 的注册顺序；由 App 持有当前弹层优先级（或提供集中 Esc dispatcher），上层关闭后再允许下层处理。每个全局 listener 必须在 destroy 时移除。

**FR-1.5 结果与键盘导航**
- 数据源复用 `homeData.ts` 的 `normalizeSearchQuery` / `buildSearchIndex` / `bookmarkMatchesSearch`（`:35-66`）和记忆化索引（`:288-301`）。**禁止另写一套匹配。**
- 沿用 120ms 防抖语义，不新增第二个字面量；当前常量只在 `Home.svelte:38`，实现前必须把它抽到共享纯模块并由页面过滤与 Spotlight 共同导入，不能从组件私有作用域直接导入。
- `↑`/`↓` 移动高亮，`Home`/`End` 跳首尾，`Enter` 通过统一的 `openBookmark(bookmark)` 适配既有 `open_method`（same/new/tab/window），`Esc` 关闭。键盘遍历逻辑参照 `Sidebar.svelte:236-250` 与 `CategoryTreeSelect.svelte:121-140` 的既有 roving focus 写法。
- 结果按当前 `bookmarks` 的稳定顺序截取前 50 条；超出显示“还有 N 条，请继续输入”，其中 `N = totalMatches - 50`。首屏分批加载期间允许空/部分结果，不额外请求。
- 结果项只渲染图标 + 标题 + 分类路径，**不渲染 `BookmarkCard`**，避免把卡片的 hover/右键/排序逻辑拖进面板。

**FR-1.6 与页面过滤态的关系**
Spotlight 是**独立**的即时跳转通道，不写 `Home.svelte` 的 `searchQuery`。选中结果后直接调用统一打开适配器，不触发 `handleNavigate`，不改变页面过滤态；关闭也不清空 Home 查询。理由：页面过滤态被 `clearSearchImmediately()` 与导航耦合（见 T-1.3），双向同步会产生难以推理的互相清空。
### 2.3 必须处理的陷阱

| 编号 | 陷阱 | 依据 | 要求 |
| --- | --- | --- | --- |
| T-1.1 | `id="search-query"` 与 `<label for>` 硬编码，第二个实例会产生重复 DOM id | `SearchBox.svelte:136`、`:138` | Spotlight 用自己的唯一 id；顺手把 `SearchBox` 的 id 改成按实例生成 |
| T-1.2 | `search_box_show === false` 时主搜索框根本不渲染，`searchQuery` 永远不变，本地过滤不可达 | `HomeHeroSearch.svelte:25` | 该设置为 false 时浮动搜索按钮必须恒显，否则关掉搜索框就等于没有任何搜索入口 |
| T-1.3 | `clearSearchImmediately()` 被 `handleNavigate` 调用，任何分类导航都会清空查询 | `Home.svelte:251-258`、`:329` | FR-1.6 已通过"不共享状态"规避；若后续改为共享，必须一并接入该重置 |
| T-1.4 | `setDataProgressively` 按 60 条批量替换 `bookmarks` 数组，加载窗口内记忆化索引反复失效 | `src/lib/stores.ts:88-117` | Spotlight 在首屏加载未完成时打开需容忍空/部分结果，不得因此发起额外请求 |
| T-1.5 | `SearchBox` 的 `Escape` 只关引擎下拉，不清查询 | `SearchBox.svelte:46-50` | 保持现状，不要顺手改语义 |

## 3. 模块二：操作降噪与渐进式浮现

### 3.1 现状

**草案把两个组件混为一谈。** 「分类标题行」实际上是两层：

- `HomeCategoryScope.svelte` —— 一级分类头（图标、accent 竖条、`<h2>` + 总数、**新建子分类**、子分类 tablist）。
- `CategorySection.svelte` —— 二级/直属书签区（`<h3>` + 站点计数、**新增书签**、**排序**、书签网格）。

所以草案里的三个胶囊 `+新增书签 / +子分类 / ⇅排序` 分布在**两个文件、两个层级**，不存在"同一行三个按钮"的现状。

| 草案要点 | 状态 | 证据 |
| --- | --- | --- |
| 预留操作位、hover 时不产生布局抖动 | **已有两套机制** | `CategorySection.svelte:230-236` 的 `grid-template-columns: minmax(0, 1fr) auto` 已恒定预留操作列；`HomeCategoryScope.svelte:21`/`:65`/`:362-364` 的 `reserveActions` → `.has-actions` 已预留并调窄标题 `max-width` |
| 毛玻璃描边 `1px solid rgba(255,255,255,0.55)` | **已有，值完全一致** | `CategorySection.svelte:350`；`BookmarkCardInfo.svelte:79` |
| 移动端收起文字 | **已有** | `CategorySection.svelte:536-546`（按钮压成 1.9rem 方块、`.action-label { display: none }`）；`HomeCategoryScope.svelte:394-404`（36px 方块、`font-size: 0`） |
| 子分类 tab 移动端换行 | **已有** | `HomeCategoryScope.svelte:376-382`（`order: 3; flex-basis: 100%`） |
| 空分类不显示大占位框 | **部分已有** | `showEmpty` 可控（`CategorySection.svelte:15`）；`Home.svelte:474`/`:494`/`:520` 搜索态传 `false`，`:579`/`:606` 正常态传 `true` → 大占位框只出现在正常态 |
| 键盘可达 | **已有** | `HomeCategoryScope.svelte:46-63`（Arrow/Home/End roving focus）、`:35-45`（横向滚轮） |

现有空态样式：`.empty-card { padding: 1rem 1.1rem; border-radius: 1rem; border: 1px dashed …; }`（`CategorySection.svelte:470-477`），文案「这个分类下暂时还没有可展示的书签。」（`:207`）。

### 3.2 需求

**FR-2.1 PC 端 hover 渐显（接入既有预留位，不新建布局）**
- 在 `@media (hover: hover) and (pointer: fine)` 内，未 hover 时 `.section-actions` 与 `.scope-action` 取 `opacity: 0; visibility: hidden`；`:hover` / `:focus-within` 及排序态取 `opacity: 1; visibility: visible`。过渡只作用于这两个属性，用 `var(--transition-base)`。
- **只改 `opacity` 与 `visibility`，禁止改 `display`/`width`/`margin`**，因为预留列已经存在，任何盒模型变化都会重新引入抖动；选择器必须覆盖现有 `.scope-action:hover` / `:focus-visible` 的特异性。
- 排序会话进行中（`activeSortMode === true`）必须**恒显**——取消/保存排序不是可发现性可以牺牲的操作（`CategorySection.svelte:47-50`、`:100-122`）。
- 触摸设备不适用 hover：媒体查询外保持现状恒显；键盘用户必须能触达，`:focus-within` 是硬要求。`prefers-reduced-motion: reduce` 下即时切换，不播放非必要过渡。

**FR-2.2 空分类折叠**
- 正常态下，`bookmarks.length === 0` 且该分类没有子分类内容时：已登录用户**固定渲染一个**“新增书签”按钮（复用现有入口，带 `aria-label` 和稳定 testid），不再在“浅色提示”和按钮之间自由选择；未登录访客不渲染该空态。
- 该按钮必须保持原分类 id，且点击后进入现有新增流程；不把可点击操作伪装成纯文本提示。
- 搜索态维持 `showEmpty={false}` 不变。
- 折叠不得改变 `id={sectionId}`（`:82`）与 `scroll-margin-top`（`:216`），否则侧栏 scroll-spy 的 `getBoundingClientRect` 基准会漂。

**FR-2.3 移动端 Action Sheet（收窄范围）**
移动端已经是图标方块，草案的 `···` 折叠**只在同一行按钮数 ≥ 3 时才有收益**。因此：
- 仅当 `showActions` 计算出的可见按钮 ≥ 3（`CategorySection.svelte:50`）且视口 ≤ 720px 时，收成单个 `···` 触发器 + 底部 Action Sheet。
- 当前正常态最多同时出现 2 个（新增书签 + 排序），**所以本条在现状下不触发**，属于为后续新增按钮预留的规则，不产生本轮工作量。
- 若实施，Sheet 复用 `ConfirmDialog` 的 scrim + Esc 约定，不新造遮罩体系；必须具备 `role="dialog" aria-modal="true"`、首焦点、Tab/Shift+Tab 循环、关闭恢复焦点，并使用 `padding-bottom: max(var(--control-padding-md), env(safe-area-inset-bottom))`。

**FR-2.4 不做**
- 不新增 accent 竖条：`.scope-accent` 已是 `background: var(--home-accent-color)`（`HomeCategoryScope.svelte:162-168`），不是硬编码色。
- 不动 `.highlighted` 的锚点闪烁（`:187-191`）与 `scroll-margin-top: 6rem`（`:147`），这两个是导航定位的现有契约。

## 4. 模块三：极速录入管道

### 4.1 现状

| 草案要点 | 状态 | 证据 |
| --- | --- | --- |
| 读剪贴板 | **完全不存在于实现树** | `clipboard` / `readText` / `paste` / `ClipboardEvent` 在 `src/`、`tests/`、`scripts/`、`browser-extension/` 均零命中；需求文档自身不计入该统计 |
| 弹窗"挂载时"钩子 | **不存在** | `BookmarkEditModal.svelte` 只 import 了 `onDestroy`（`:2`、`:327-330`），没有 `onMount`；组件实例经 `App.svelte:138-144` 懒加载后跨开关持久存在 |
| 表单初始化 | 响应式重置块 | `$: nextKey = JSON.stringify({ open, mode, value, categories })`（`:80`）→ `$: if (nextKey !== formKey) {…}`（`:82-106`）。**`categories` 数组身份变化也会触发重置** |
| URL 判定 | 可复用 | `normalizeTitleLookupUrl`（`src/lib/bookmarkTitleController.ts:47-62`）要求 http(s) 且 hostname 含点、剥离内嵌凭据 |
| 标题解析管线 | **已存在，但只由 `blur` 触发** | `BookmarkBaseFields.svelte:46` → `BookmarkEditModal.svelte:181-193` → `scheduleBookmarkTitleLookup` → `api.bookmarks.fetchSiteMeta`（`src/lib/api.ts:386-391`） |
| 标题解析门禁 | 三重 | 非 `create` 跳过、标题已非空跳过、`lastUrl` 去重（`bookmarkTitleController.ts:71`/`:73`/`:78`）；填入截断 20 字（`:9`、`:103`） |
| 图标解析 | **已免费具备** | `getIconCandidates(url, title)` 在 `form.url` 每次变化时响应式重算（`BookmarkEditModal.svelte:109-112`），实现是纯客户端 URL 拼接（`src/lib/icons.ts:319-347`），无网络 |
| 服务端 favicon 接口 | **死代码** | `api.bookmarks.fetchFavicon`（`api.ts:381-385`）无调用者；`src/lib/bookmarkFaviconController.ts` 整个文件只被 `tests/unit/bookmarkFaviconController.test.ts:6` 引用；`docs/plans/PLATFORM_OPTIMIZATION_PLAN.md:558` 已记录该结论 |
| 分类默认值 | `categories[0]` | `App.svelte:735` 与 `BookmarkEditModal.svelte:86` 都回退 `categories[0]?.id`；`createBookmarkFormValue` 取 `value?.category_id ?? fallbackCategoryId`（`src/lib/bookmarkFormIcons.ts:32`） |
| 分类选择器 | 无 `preselect` prop | `CategoryTreeSelect.svelte:10-11` 只有 `bind:value` + `items`；设 `draft.category_id` 即可预选，**无需改组件** |
| 视口分类跟踪 | 有，但**顶部对齐** | `resolveActiveHomeRootId`（`src/lib/homeData.ts:192-213`）取"最后一个越过阈值的一级分类"，阈值 `navigationScrollOffset + 36`（`Home.svelte:299`）；`activeId` 与 `selectedCategoryIds` **未向 `App.svelte` 暴露** |
| 全局"新增书签"入口 | **不存在** | `HomeFloatingActions.svelte:67-124` 只有主题/后台/新建主分类/登出/登录 |

新增书签入口共 **7 个实际入口**、其中 **5 个显式传分类 id**：`CategorySection.svelte:78`（`category.id`，被 `Home.svelte:484`/`:504`/`:622` 复用）、`CategoryListPanel.svelte:293`/`:321`。只有 `BookmarkListPanel.svelte:258`/`:282` 不传 —— 而那两处在后台书签列表里，“视口中央分类”没有语义。按源码 click 表达式计数则是 5 处，其中 3 处显式传 id、2 处不传；实现和测试必须注明采用哪一种口径。

浏览器与安全前置条件：
- `Permissions-Policy` 只列了 `camera=(), microphone=(), geolocation=()`（`worker/lib/assetHeaders.ts:41`），`clipboard-read` 未列出 → 回退默认 `self`，**策略层不阻止** `navigator.clipboard.readText()`。
- CSP 只加在 HTML 响应上（`assetHeaders.ts:66-68`），API JSON 不带 CSP。
- 仓库**没有** HSTS / `upgrade-insecure-requests` / http→https 重定向代码，安全上下文靠 Cloudflare 区域提供；`wrangler dev` 的 `http://localhost` 本身也是安全上下文。这是**假设而非保证**，必须写进文档而不是当成既有事实。
- Chromium 可能要求 transient user activation 并弹出 `clipboard-read` 授权提示；Firefox 125+ 已支持 `readText()`，不能再写成“Firefox 页面脚本没有该 API”。因此本需求必须允许浏览器拒绝/不支持时静默降级，而不能把某一浏览器版本当作永久能力判断。
- `/api/fetch-site-meta` 需要鉴权（`worker/index.ts:57`），**没有任何限流**（`worker/routes/favicon.ts` 无 rate limit），仅有 6 小时边缘缓存（`:21`、`:130-133`）与 4s 截止时间（`:20`）。

### 4.2 需求

**FR-3.1 造一个真正的“弹窗打开”信号**
现有 `nextKey` 响应式块不能当作 `onMount`：它会在 `categories` 数组身份变化时重复触发，一次开窗可能跑多次。因此，正常开关可用 `let wasOpen = false` 检测 `$: if (open && !wasOpen) { wasOpen = true; onOpened() } else if (!open) { wasOpen = false }`；但 Svelte 4 同一 flush 内被合并的 false→true 瞬时变化不可被该模式捕获。若产品要求“每次用户点击恰好一次”，必须由打开方传入单调递增的 `openRequestId`/显式打开回调作为权威信号，`wasOpen` 仅作组件侧兜底。
- 先同步更新“已处理打开”的 token，再启动异步任务；关闭、切换 `mode/value` 或销毁时取消/使任务失效。剪贴板读取优先在打开按钮 click/keydown 的用户手势路径内完成；响应式信号仅作 best-effort fallback。
- 剪贴板读取与自动标题解析都挂在该打开信号/用户手势结果上，不挂在 `nextKey` 重置块里。

**FR-3.2 剪贴板预填 URL**
- 仅在 `mode === 'create'` 且 `form.url` 为空时执行。
- `await navigator.clipboard.readText()` 全程 `try/catch`，任何失败（无 API、未授权、非安全上下文、不满足用户手势、浏览器不支持）都**静默跳过**，不弹 Toast、不报错、不阻塞开窗。
- 读取不得宣称“挂载时必然成功”：优先在触发打开的 click/keydown handler 内取得文本，再通过显式 `initialUrl`/`clipboardText` 打开参数交给 modal；响应式打开信号仅作为无法保持用户手势时的 best-effort fallback。
- 预填成功后给 URL 控件可见且可访问的状态（例如带 `aria-live="polite"` 的“来自剪贴板” status），并在用户修改 URL、关闭弹窗或下一次打开时清除。

**FR-3.3 预填后触发标题解析**
- 程序化写 `form.url` **不会**触发 `blur`，而 `handleUrlBlur` 是 `scheduleBookmarkTitleLookup` 的唯一调用者（`BookmarkEditModal.svelte:181-193`）。所以必须在 FR-3.2 成功后**直接调用** `scheduleBookmarkTitleLookup`。
- 状态机本身与触发源无关，可直接复用，三重门禁（非 create / 标题非空 / `lastUrl` 去重）继续生效，不得放宽。
- **需要新增客户端节流**：现有唯一保护是 `lastUrl` 去重与边缘缓存，服务端无限流。节流作用域固定为当前 modal 组件实例生命周期内的“自动触发”路径，时间源使用 `performance.now()`；仅自动触发受限，用户 blur 不受限；关闭重开不得绕过同一实例的窗口。
- `docs/reference/API_CONTRACT.md:132` 目前写的是“前端只在新增书签、书签标题为空、且网址输入框失焦时调用该接口”。本需求增加剪贴板预填自动触发路径，落地时必须同步更新该契约。

**FR-3.4 图标解析：无需开发**
`getIconCandidates` 已在 URL 变化时响应式重算且无网络开销（`BookmarkEditModal.svelte:109-112`、`icons.ts:319-347`），FR-3.2 预填 URL 后候选列表自动出现。
- **明确不做**：不接 `/api/fetch-favicon`。它虽然可用，但前端已无调用者，接回去等于让每次开窗多打一次无限流的鉴权接口，换取的只是候选列表里多一个来源。
- `src/lib/bookmarkFaviconController.ts` 是只被测试引用的残留脚手架。本轮不接线；是否删除列为 OQ-3。

**FR-3.5 分类默认为视口内分类**
- 新增 `resolveViewportCenterRootId(sectionTops, viewportCenter)`，放在 `src/lib/homeData.ts` 旁，**与 `resolveActiveHomeRootId` 并存而不是改它**——后者是侧栏高亮的既有契约（`homeData.ts:192-213`，`tests/unit/homeNavigation.test.ts:107-118` 已钉住其行为）。
- `viewportCenter` 统一使用 viewport 坐标（`clientY`）；`sectionTops` 使用对应 `getBoundingClientRect().top` 的 viewport 坐标，不混用 document offset。若调用时读取布局，必须在同一帧使用同一坐标系。
- `Home.svelte` 需要新增一个回调把"当前视口分类 + 该分类下选中的子分类"（`activeId` / `selectedCategoryIds`，`:72-73`）上报给 `App.svelte`，供 `handleOpenCreateBookmark(categoryId?)`（`App.svelte:725-740`）在**没有显式 id 时**使用。
- 必须尊重 `scrollSpySuppressedUntil` 抑制窗口（`Home.svelte:78`、`:297`），否则点击侧栏后立刻开窗会拿到过渡中的错误分类。
- 落库前必须校验该 id 存在于 `categories` 中；否则 `CategoryTreeSelect` 会显示「当前分类不可用」（`:27-28`）。特别注意首页的合成伪分类 `经常访问`（`id: -1`，`Home.svelte:41-47`）**必须排除**。
- 现状下共有 7 个实际新增书签入口，其中 5 个显式传入分类 id、后台 `BookmarkListPanel` 的 2 个不传；不要再写“6/8”。本条只影响未来的全局入口与这两处后台入口，后台列表按 FR-3.6 保持现状。

**FR-3.6 边界**
- 后台 `BookmarkListPanel.svelte:258`/`:282` 继续回退 `categories[0]`，不接视口逻辑。
- 草案设想的"全局唤起新增书签"入口今天不存在。若要新增，应放进 `HomeFloatingActions` 的 flex 行并遵守 C-7 门禁；本轮**不新增**，避免与模块一的搜索按钮同时抢占同一块视觉空间。

## 5. 模块四：主题 accent 与卡片排版规范

### 5.1 现状

**草案的三个前提有两个是反的。** 逐条核对：

**(a) accent 抽象已经存在。** 链路是
`themePresets.ts` 的 preset → `buildHomeBackground()` 拼出 `--theme-accent-color`（`src/lib/appData.ts:253-255`、`:283`）→ `Home.svelte:675`（亮）/`:721`（暗）映射成 `--home-accent-color`。
`SearchBox`、`Sidebar`、`HomeCategoryScope`、`BookmarkCardInfo`、`BookmarkCardCompact` 消费该变量，但不能说组件完全没有硬编码 Indigo：`SearchBox.svelte:196-201` 仍有 `#2563eb → #4f46e5` 的按钮渐变。默认 accent 仍不是 Indigo，而是 `#2563eb`（blue-600）与暗色 `#7dd3fc`（sky-300）。

**(b) 护眼预设的 accent 已经各自调过，草案的方向会破坏它们。**

| | 数量 | accent 来源 | 证据 |
| --- | --- | --- | --- |
| `paper-*` 护眼（`surface: 'flat'`） | **9** | 每个预设**独立**传 `colors.accent` / `colors.darkAccent` | `themePresets.ts:266`；取值见 `:273-317`，如 `paper-sage` `#71836f`、`paper-sakura` `#c88797`、`paper-amber` `#bd8b42` |
| 毛玻璃（`surface: 'glass'`） | **13** | **全部共用**写死的 `#2563eb` / `#7dd3fc` | `themePresets.ts:232-233`，被 `:318-330` 全部 13 个预设复用 |

所以真正的缺陷是：`柑橘日落`、`玫瑰星轨`、`陶土沙丘`、`余烬夜航` 这些暖色/粉色毛玻璃预设，accent 仍然渲染成冷蓝。草案要求的「护眼 accent 统一改深青绿 `#059669`」会把 9 套调好的低饱和配色全部覆盖成同一个绿，**方向错误**。

**(c) 真正缺的是 `--accent-subtle` 那一层。** 全仓库实现树中的 `color-mix(in srgb, var(--*-accent-color) N%, …)` 共 **33 处 / 7 个文件**，百分比分布如下；多行 CSS 也计入，不能用只按单行匹配的脚本复核：

| 百分比 | 次数 | 用途 | 位置 |
| --- | --- | --- | --- |
| **24%** | **10** | 一律是 `border-color` | `BookmarkCardInfo:193`/`:201`/`:227`、`BookmarkCardCompact:172`/`:180`/`:206`、`SearchBox:224`/`:234`/`:443`、`Sidebar:666` |
| **16%** | **4** | 一律是 `box-shadow: 0 8px 22px` | `BookmarkCardInfo:197`/`:231`、`BookmarkCardCompact:176`/`:210` |
| 20% | 4 | 焦点环 / 边框 | `HomeCategoryScope:250`、`Sidebar:665`、`SettingsHomePreview:549`/`:583` |
| 14% | 4 | hover 底色 | `Sidebar:664`/`:676`、`SettingsHomePreview:569`/`:605` |
| 18% / 22% / 8% | 各 2 | 侧栏与预览的边框、底色 | `Sidebar:677`/`:663`/`:675`/`:678`、`SettingsHomePreview:455`/`:481` |
| 12% / 34% / 46% / 58% / 68% | 各 1 | 一次性效果 | `HomeCategoryScope:190`/`:312`/`:308`/`:188`、`Home.svelte:769` |

注意 `SettingsHomePreview.svelte` 消费的是 `--theme-accent-color`（带 `#2563eb` 回退）而不是 `--home-accent-color`（`:455`、`:481`、`:549`、`:569`、`:583`、`:605`）。**这是正确的，不要"统一"掉**：`--home-accent-color` 只定义在 `.home-shell` 上（`Home.svelte:675`），后台预览不在该子树内，它自己调 `buildHomeBackground(previewSettings, theme)` 生成 `--theme-accent-color`（`SettingsHomePreview.svelte:63-64`、`:74`）。因此 token 化时必须**同时**覆盖两层，或把新 token 定义在 `--theme-accent-color` 那一层。

**(d) 卡片几何全部是既有用户设置，不是硬编码。**

| 项 | 现值 | 归一化与边界 |
| --- | --- | --- |
| 卡片宽 | `card_size.width`，默认 **80** | `CARD_SIZE_LIMITS.width = { min: 44, max: 400 }`（`shared/settings.ts:38-41`）；前端再经 `getInfoCardTrackWidth` 夹取（`bookmarkCardLayout.ts:6-9`） |
| 卡片高 | `card_size.height`，默认 **60** | `{ min: 0, max: 300 }`；`0` 表示自动，此时回退 `infoCardHeight = 70`（`BookmarkCard.svelte:96`） |
| 图标尺寸 | `card_icon_size`，默认 60 | `CARD_ICON_SIZE_LIMITS = { min: 40, max: 100 }`（`shared/settings.ts:43`），**只作用于 icon 风格卡** |
| 信息卡图标 | **派生，不可直接设** | `infoIconInset = infoCardHeight <= 56 ? 6 : 8`；`infoIconSize = max(32, min(高-2×inset, 宽-2×inset))`（`BookmarkCard.svelte:98-99`） |
| 图文间距 | `gap: 0.82rem` = **13.1px** | `BookmarkCardInfo.svelte:107` |
| 标题 | `0.9rem` = **14.4px** / `weight 600` | `BookmarkCardInfo.svelte:135` |
| 描述 | `0.75rem` = **12px**，单行 + `min-height: 0.9em` 占位 | `BookmarkCardInfo.svelte:147` |
| 毛玻璃描边 + 柔影 | **与草案取值逐字相同** | `border: 1px solid rgba(255, 255, 255, 0.55)`（`:79`）+ 三层 `box-shadow`（`:85-88`） |
| 标题 tooltip | 已接 | `title` / `aria-label` / `data-tooltip`（`BookmarkCardInfo.svelte:47-49`） |

`Home.svelte` 五处调用点全部按 `settings?.card_size?.width ?? 80` / `?.height ?? 60` 传参（`:476-477`、`:496-497`、`:521-522`、`:581-582`、`:608-609`），前端 prop 默认值 `width = 200` / `height = 0`（`BookmarkCard.svelte:40-41`）在首页**不生效**，只是组件层兜底。

### 5.2 需求

**FR-4.1 补齐 `--accent-subtle` 层（视觉中性重构）**
只抽两个 token，取值必须落在出现频次最高的两档，使重构本身不产生任何像素变化（C-3）：
- `--accent-border: color-mix(in srgb, var(--home-accent-color) 24%, transparent)` —— 替换全部 10 处 `border-color`。
- `--accent-glow: color-mix(in srgb, var(--home-accent-color) 16%, transparent)` —— 替换全部 4 处 `box-shadow: 0 8px 22px …`。
- 定义位置：与 `--home-accent-color` **同一处**（`Home.svelte:675`/`:721`），并在 `SettingsHomePreview` 的预览根上按 `--theme-accent-color` 再定义一份，否则后台预览会丢样式。
- **不要**为 12% / 20% / 34% / 46% / 58% / 68% 这些一次性取值造 token —— 只出现 1~4 次的值抽成 token 只会增加间接层。
- **不改名** `--home-accent-color` 为 `--accent-primary`：它有 33 处消费点与两个定义点，重命名是纯风险，收益为零。

**FR-4.2 反向修：给 13 个毛玻璃预设各自的 accent**
- 在 `createGradientPreset` 的签名里加 `accent` / `darkAccent` 两个必填参数（或并入现有 `GradientPresetStyle` 对象，`themePresets.ts:207-211`），删掉 `:232-233` 的写死值。13 个 glass 预设必须在源码中显式提供这两个 hex 值；禁止运行时从 CSS 渐变字符串取色。
- 每个值必须从该预设的既有色板确定性选择或人工校准，不是另发明无关色：例如 `citrus-sunset` / `terracotta-dune` 取暖橙赭，`rose-orbit` 取洋红，`ember-night` 取余烬红，`ocean-depths` / `indigo-noir` 保持蓝系。light/dark 两个值分别按对应卡片背景验证对比度。
- **明确驳回草案的 `#059669` / `#0f766e`**：9 个 `paper-*` 预设的 accent 已按各自色相调过（`themePresets.ts:273-317`），统一成深青绿会把“樱落粉黛”“温暖陶土”“晨光琥珀”的 accent 变成绿色。护眼预设本轮**一个都不动**。
- 验收标准是可观察的：切到任一暖色 glass 预设，卡片 hover 描边与侧栏高亮不再是冷蓝；亮/暗主题下文本和焦点指示器仍满足 §6.3 的对比度要求。
- 该改动**会**产生视觉变化，属于有意为之，与 C-3 不冲突（C-3 约束的是 token 抽象，不是配色修复）。

**FR-4.3 排版 token 对齐（无视觉变化）**
草案的「13px 标题 / 11px 副标题」对应 `app.css:12` 的 `--font-size-md: 13px` 与 `:10` 的 `--font-size-xs: 11px`，但**当前实际值是 14.4px / 12px**。两者不等价，因此：
- 只做一件事：把 `BookmarkCardInfo.svelte:135`/`:147` 的 `0.9rem`/`0.75rem` 换成 `var(--font-size-base)`（14px）/ `var(--font-size-sm)`（12px）——这是**最接近现值**的既有档位，14.4→14px 与 12→12px 的差异不可感知。
- **不采纳** 13px/11px：那是主动缩小两档字号，属于设计变更而非 token 化，若确实要缩，走 OQ-5 单独决策。
- 描述行的 `min-height: 0.9em` 占位必须保留，否则无描述的卡片会比有描述的矮一截。

**FR-4.4 卡片几何：只调默认值，不硬编码**
- 草案的「固定 48px 高」在现有体系里等价于把 `CARD_SIZE_DEFAULTS.height` 从 `60` 改成 `48`（`shared/settings.ts:33-36`）。允许，但必须清楚代价：`infoIconInset` 会从 8 掉到 6，`infoIconSize` 从 44px 掉到 36px（`BookmarkCard.svelte:98-99`），图标可辨识度下降。
- **禁止**在组件里写死高度绕过 `card_size`（C-4）。`.bookmark-card-info { height: 70px }`（`BookmarkCardInfo.svelte:109`）是 `height === 0` 时的自动档兜底，只有它可以调，且调它等于改「自动」的含义。
- 草案的「图文间距 8px」对当前 13.1px 是 -39%。信息卡默认宽度只有 80px，收窄间距能多给标题 5px，但会让图标与文字贴在一起。**列为 OQ-6，本轮不动。**
- 毛玻璃描边与柔影**无需开发**：`border: 1px solid rgba(255, 255, 255, 0.55)`（`:79`）与三层 `box-shadow`（`:85-88`）已与草案取值逐字相同。
- 标题 tooltip **无需开发**：`title` / `aria-label` / `data-tooltip` 已接（`:47-49`）。

**FR-4.5 不做（第二条已于 2026-09-05 被推翻）**
- 不引入 `--accent-primary` 别名（见 FR-4.1 末条）。**这一条仍然有效。**
- ~~不新增任何 accent 相关的用户设置项~~ —— **已推翻**。原理由是「accent 由预设决定是当前的设计意图，加设置项会与 22 个预设的调色形成两套真源」。用户 2026-09-05 裁定 PROB-30 时选择让自定义背景也能配 accent，理由是自定义背景（`background_preset_id === 'custom'`）下没有预设色相可依，回退值与用户自选背景同色系时焦点环几乎不可见——`--home-accent-color` 是 hover 描边与 focus 环的唯一来源。
- 「两套真源」这个顾虑在新口径下的解法：**accent 设置只在没有预设时生效**，选中任何内置预设时仍由预设的 `accentColor` / `darkAccentColor` 决定，用户值不参与。因此不存在同时生效的两个来源，只存在「有预设走预设、无预设走用户值、用户也没设才走内置回退」这一条链。
- 承接编号：`REQ-13`（见 `REQUIREMENT_DEVELOPMENT_TASK_LIST.md`）。本节其余「不做」结论不受影响。

### 5.3 必须处理的陷阱

| 编号 | 陷阱 | 依据 | 要求 |
| --- | --- | --- | --- |
| T-4.1 | `--home-accent-color` 只存在于 `.home-shell` 子树 | `Home.svelte:675`、`:721` | 新 token 必须在后台预览根上再定义一份，否则 `SettingsHomePreview` 静默退回 `#2563eb` |
| T-4.2 | `paper-*` 有专属选择器钩子 `[data-background-preset^='paper-']` | `BookmarkCardInfo.svelte:192-198` | 改 glass accent 不得误伤该分支；两条规则的百分比目前相同（24%/16%），token 化后仍须保持相同 |
| T-4.3 | `card_size.height` 下限是 `0` 且 `0` 有特殊语义 | `shared/settings.ts:40`、`BookmarkCard.svelte:96` | 任何"最小高度"校验都不能把 `0` 当非法值 |
| T-4.4 | 信息卡宽度默认 80，`getInfoCardTrackWidth` 下限 44 | `shared/settings.ts:39`、`bookmarkCardLayout.ts:1`/`:6-9` | 讨论标题字号与间距时必须以 80px 宽为基准算，不能按组件 prop 默认的 200px 推演 |
| T-4.5 | 33 处 `color-mix` 分散在 7 个文件 | 见 §5.1(c) 表 | 替换必须逐处核对百分比，不能全局 `sed`；24% 与 16% 之外的值保持原样 |

## 6. 模块五：长列表性能与滚动联动

### 6.1 现状

**草案的四条里三条已经实现，第四条已有更好的实现。**

| 草案要点 | 状态 | 证据 |
| --- | --- | --- |
| `loading="lazy"` + `decoding="async"` | `BookmarkIcon` 已有且多了 `fetchpriority="low"`；缓存与分类图标路径只有部分属性 | `BookmarkIcon.svelte:35-40`；`CachedBookmarkIcon.svelte:101-110`（只有 lazy/async）；`CategoryIcon.svelte:40`（只有 lazy/async） |
| 固定 `width`/`height` 防抖 | **仅 BookmarkIcon 已有**；`CachedBookmarkIcon` 和 `CategoryIcon` 的 `<img>` 没有固定尺寸，不能泛化为全路径已实现 | `BookmarkIcon.svelte:35-36` + `aspect-ratio: 1 / 1`（`:54`）；`CachedBookmarkIcon.svelte:101-110`；`CategoryIcon.svelte:40` |
| `on:error` 回退字母头像 | **已有，且远超三级** | `on:error={handleError}`（`:40`）→ `cachedIconFailed` / `fallbackFailed` → `deriveBookmarkCardIconUrl` 的 13 分支优先级链（`src/lib/bookmarkCardIconState.ts:147-161`）；无图时渲染 `iconText`（`BookmarkIcon.svelte:44`） |
| 字母兜底 | **已有，含最终兜底** | `iconText = customTextIcon \|\| bookmark.title.trim().slice(0, 1) \|\| '书'`（`bookmarkCardIconState.ts:75`） |
| 300ms 布尔互斥锁 | **已有且更强** | `scrollSpySuppressedUntil` 时间戳窗口（`Home.svelte:78`）：导航 900ms（`:336`）、`focusCategory` 900ms（`:364`）、二级 tab 切换 600ms（`:378`）；判定在 `updateActiveRootFromScroll` 入口（`:297`） |
| 滚动监听已合并 | **已有** | `scheduleActiveRootUpdate` 用 `requestAnimationFrame` 去重（`:288-294`），监听 `{ passive: true }`（`:382`），`onDestroy` 里同时移除监听与取消 rAF（`:391-394`） |
| `content-visibility: auto` | **只在搜索结果分组上** | `.search-category-group { content-visibility: auto; contain-intrinsic-size: auto 420px }`（`Home.svelte:782-783`），并在 `:hover`/`:focus-within` 时回退 `visible` / `none`（`:786-790`） |

**这三条不是"顺手加的"，是有契约的：**
- `docs/reference/PERFORMANCE_CONTRACT.md:28` 明文写「Icon rendering should keep native lazy loading, async decoding, fixed image dimensions, and low fetch priority for bookmark icons.」
- `:29` 写「Failed icon handling should prefer stable fallback behavior over repeated retries in the same interaction path.」
- `tests/unit/bookmarkCardTheme.test.ts:88-90` 已钉住 `content-visibility: auto` 与 hover 回退两条规则。

**首页一级分组不加 `content-visibility` 是一条已记录的决策，不是遗漏：**
- `docs/reference/TECHNICAL_NOTES.md:211`：「全站搜索结果分区使用 `content-visibility: auto` 降低离屏渲染成本；普通首页一级分组保持正常绘制和命中测试，性能通过只挂载直属书签及当前选中二级书签控制。」
- `docs/reference/PROJECT_OVERVIEW.md:262` 记录同一决策。
- 首页真正的挂载量控制手段是**结构性的**：只挂载各一级分组的直属书签，二级内容按 tab 切换挂载。这与 `content-visibility` 是两种互斥策略，不是叠加关系。

### 6.2 需求

**FR-5.1 书签图标属性契约：补齐并限定范围**
- `BookmarkIcon.svelte` 必须继续包含 `loading="lazy"`、`decoding="async"`、`fetchpriority="low"`、`width={size}`、`height={size}`（`:35-40`）。若 `CachedBookmarkIcon` 继续作为书签渲染路径，则也必须补固定尺寸与低优先级；若有意不补，必须在实现和 `PERFORMANCE_CONTRACT.md` 中明确它不是该契约覆盖的网络图标路径。
- 三个属性和尺寸的测试不能只断言 `BookmarkIcon` 而宣称全站图标契约；按实际覆盖路径逐文件断言。


**FR-5.2 字母头像按书签派生颜色（唯一真实缺口）**
现状字母兜底的颜色是固定灰：`.icon-text { color: #475569 }`（`BookmarkIcon.svelte:93`），暗色 `#cbd5e1`（`:106-107`）。一屏十几个无图书签会得到十几个一样的灰方块。因此：
- 新增纯函数 `deriveIconTextColor(hostname: string, title: string)`（或 `deriveIconTextPalette`），放 `src/lib/` 下，输入**只允许** `bookmark.url` 的 hostname 与 `bookmark.title`，不得把整个 bookmark 对象耦合进颜色算法；输出稳定的前景/背景色对。必须是纯函数，才能按 C-6 写单测。
- 色彩空间用 `oklch()` 或固定色板取模，**不要**用随机 hash 直接映射 RGB —— 会产出低对比度组合。对比度至少满足 WCAG AA（4.5:1）。
- 由 `BookmarkCard.svelte` 计算并通过 `iconStyle` 透传（该通道已存在，`BookmarkIcon.svelte:8`/`:29`），**不在 `BookmarkIcon.svelte` 里读 `bookmark`** —— 它当前完全不知道 `bookmark` 的存在，保持这个边界。
- 用户自定义 `icon_background_color` 时（`has-custom-background`，`:9`/`:26`）**必须让位**，不得覆盖用户设置。
- 这是**纯函数 + BookmarkCard 样式透传 + CSS 变量**改动，不只是 CSS 变量；它会改变 `iconStyle` 字符串，因此仍需确认卡片数与破图数不变。
- 明确自定义背景的判定必须使用 `trim()` 并校验可接受的 CSS 颜色，避免空白字符串因 truthy 而错误地阻止派生色。派生色应同时提供 sRGB fallback 与 `oklch()` 增强路径；对比度按实际字体和实际卡片背景计算。
- **明确不做拼音首字母**：`bookmark.title.trim().slice(0, 1)` 对中文取到的是汉字，这是有意的（比拼音首字母信息量更大），且引入拼音库需要新依赖，见 OQ-1。

**FR-5.3 滚动互斥锁：驳回，不改**
- 草案的「300ms 布尔锁」比现有实现**更弱**：布尔锁需要成对置位/复位，`smooth` 滚动没有完成事件，只能靠定时器猜；现有的 `performance.now() + N` 时间戳窗口天然自愈，多次触发只是把截止时间往后推。
- 现有窗口按场景分档（900/900/600ms）也比单一 300ms 更贴合：`scrollIntoView({ behavior: 'smooth' })` 在长距离跳转时超过 300ms 是常态。
- **本条唯一遗留动作**：模块三 FR-3.5 读取"视口内分类"时必须复用同一个 `scrollSpySuppressedUntil` 判据，不得另起一套。

**FR-5.4 `content-visibility` 上首页分组：不做，降级为待决问题**
- 需要先推翻 `TECHNICAL_NOTES.md:211` 与 `PROJECT_OVERVIEW.md:262` 的既有决策，这不是实现细节而是策略反转，见 OQ-4。
- 若将来推翻，必须一并处理三件事，否则会引入回归：
  1. `contain-intrinsic-size` 的占位高度会让 `getBoundingClientRect().top` 在未渲染分组上失真，直接破坏 `updateActiveRootFromScroll`（`Home.svelte:296-310`）的 scroll-spy 与 FR-3.5 的视口分类。
  2. `scroll-margin-top`（`HomeCategoryScope` 6rem、`CategorySection` 1.5rem）与锚点跳转的落点会随占位高度漂移。
  3. 浏览器内 `Ctrl+F` 查找在 `content-visibility: auto` 的跳过子树内行为不一致，而首页正是最可能被 `Ctrl+F` 的页面（搜索结果页有 hover 回退兜底，首页没有等价出口）。

**FR-5.5 性能预算护栏**
本模块及 Spotlight 落地后必须重跑 `scripts/perf-audit.mjs` 并满足 9 项检查：失败网络请求 `0`、首页/滚动破图 `0`、启动 splash `0`、快速搜索 settle 前 mutations `0`、后台搜索 rows `>0`、图标请求 ≤ `260`、Cache Storage ≤ `5 MiB`、`/api/admin/data` ≤ `60000` B、首页卡片 ≥ `300`（阈值 `scripts/perf-audit.mjs:28-32`，检查项 `:489-545`）。
- FR-5.2 是纯函数 + BookmarkCard 样式透传 + CSS 变量改动，不只是 CSS 变量；它会改变 `iconStyle` 字符串，因此仍需确认卡片数、破图数和请求预算不变。
- Spotlight 会额外挂载最多 50 个图标，是本轮**最可能触及图标请求预算**的改动，必须在 FR-1.5 的 50 条上限下实测，而不是只测首页静态加载。

### 6.3 横向前端最佳实践护栏（落地时必须满足）

以下约束不是额外功能，而是 FR-1/2/3/5 在真实浏览器中可用的最低条件：

| 领域 | 必须满足 | 依据与验收 |
| --- | --- | --- |
| 焦点与 ARIA | Spotlight 打开后首焦点进 combobox；Tab/Shift+Tab 保持在 dialog；关闭恢复触发器或安全容器；scrim 有可访问名称；空结果、加载和截断提示使用独立 `aria-live="polite"` | 新增 `SearchSpotlight` 源码断言 + Chrome 键盘/屏幕阅读器人工检查；现有 ConfirmDialog 仅提供基础 dialog 参考（`ConfirmDialog.svelte:20-60`） |
| 键盘与输入法 | `/`、Ctrl/Cmd+K 不得在输入控件、contenteditable 或 `event.isComposing` 时触发；`aria-activedescendant` 永远指向当前存在的 option；Enter 只执行一次 | 真实键盘场景；`SearchBox` 当前仅有自身 Escape（`SearchBox.svelte:46-50`） |
| 动效 | 新增 opacity/transform 动效必须在 `prefers-reduced-motion: reduce` 下即时或明显缩短；不得写 transition 字面时长，沿用 token | `app.css:415-418`、`tests/unit/designTokens.test.ts:47-69`；同时验收渐显不导致布局位移 |
| 异步竞态与清理 | action observer、window listener、timer、scroll lock 在 destroy/关闭时清理；剪贴板和 site-meta 的 await 返回前检查打开 token/当前 URL，过期响应不得覆写新表单；必要时使用 AbortController | `BookmarkEditModal.svelte:98-106` 已有 requestId 继承意图；`Tooltip.svelte:66-79` 展示监听清理模式；必须补关闭后快速重开人工场景 |
| 剪贴板 | `readText()` 必须在用户点击/keydown 的 transient activation 链路内调用；挂载后的异步 `$:` 读取只作为失败降级，不得承诺必然成功；权限提示或拒绝不得破坏焦点和开窗；非安全上下文/不支持浏览器静默跳过 | `worker/lib/assetHeaders.ts:41` 未声明 clipboard policy；[MDN Clipboard.readText()](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText) 记录安全上下文与权限约束；验收 Chromium 首次授权、拒绝和不支持路径 |
| 视口与移动端 | Spotlight/Action Sheet 使用 `100dvh`（必要时 `svh` fallback）而非只写 `100vh`；底部和四边安全区使用 `env(safe-area-inset-*)`；虚拟键盘出现时输入和关闭按钮仍可见 | `src/components/HomeFloatingActions.svelte:159-168` 已有 safe-area 先例；`BookmarkEditModal.svelte:457-460` 已混用 `100vh/100dvh` |
| CSS 特异性 | token 化逐 selector 核对，不得覆盖 `.paper-*` 专属规则或 `:focus-visible` 的更高优先级；自定义背景不得被派生 `background` inline style 覆盖 | `BookmarkCardInfo.svelte:192-198`、`BookmarkCard.svelte:492-495`；验收使用 computed style，而非只看源码字符串 |
| 文案与语言 | 操作名称使用用户可识别的动词并保持一致（打开/关闭/搜索）；“来自剪贴板”、无结果、权限拒绝文案提供 sentence case/中文本地化，不把内部 API 名写入界面 | 本文面向个人中文使用，但仍需避免把 `readText`、`fetchSiteMeta` 等实现术语暴露给用户 |

## 7. 待决问题与已定决策

### 7.1 待决问题（默认取"不做"，需要用户显式推翻）

| 编号 | 问题 | 默认取向 | 推翻代价 |
| --- | --- | --- | --- |
| OQ-1 | 是否引入拼音 / 首字母匹配（草案模块一与模块五都提到） | **不做** | 需要新增运行时依赖（实现树 `src/`、`tests/`、`scripts/`、`browser-extension/` 零命中；`package.json` 无该依赖）；会增大首屏 JS；自用场景下中文标题直接输入汉字已可命中现有子串过滤 |
| OQ-2 | 剪贴板 URL 判定是否放宽到无点主机名（`http://localhost:8788`、`http://192.168.x.x`） | **不放宽** | `normalizeTitleLookupUrl` 的“hostname 含点”是它同时服务标题解析的安全约束（`bookmarkTitleController.ts:47-62`）。放宽需另写一个只服务剪贴板的宽判定，不得改动原函数 |
| OQ-3 | 是否删除 `src/lib/bookmarkFaviconController.ts` 与 `api.bookmarks.fetchFavicon` | **本轮不删也不接** | 删除会连带删 `tests/unit/bookmarkFaviconController.test.ts`；另有 `tests/unit/storesSurface.test.ts:60-62` 对 API 表面做断言。属于独立的死代码清理，不应混进体验优化 |
| OQ-4 | 首页一级分组是否加 `content-visibility: auto` | **不做** | 要推翻 `TECHNICAL_NOTES.md:211` 与 `PROJECT_OVERVIEW.md:262` 的已记录决策，并处理 FR-5.4 列出的 scroll-spy、锚点和浏览器查找风险 |
| OQ-5 | 卡片标题/描述是否缩到草案的 13px / 11px | **不缩**，只对齐到最近档位 14px / 12px | 那是主动缩两档字号的设计变更；信息卡默认宽度只有 80px，缩字号能多放 2~3 个字，但会降低可读性 |
| OQ-6 | 图文间距是否从 13.1px 收到草案的 8px | **不动** | -39% 会让图标与标题贴死；收益是给标题多 5px |
| OQ-7 | 是否把 `CARD_SIZE_DEFAULTS.height` 从 60 改成 48 | **本轮默认不改，需显式决策后才可改** | 会把信息卡图标从 44px 压到 36px；且存量用户已保存的设置不受默认值影响，只影响新装实例（`BookmarkCard.svelte:98-99`、`shared/settings.ts:33-36`） |
| OQ-8 | 剪贴板读取是否需要一个设置开关 | **不需要**，静默降级已足够 | 加开关意味着新增 settings key、归一化、后台 UI、API 契约四处改动，而失败路径本来就静默 |

### 7.2 已定决策（不再讨论）

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D-1 | Spotlight 与页面过滤态**不共享状态** | `clearSearchImmediately()` 与 `handleNavigate` 耦合（`Home.svelte:251-258`、`:329`），双向同步会互相清空（T-1.3） |
| D-2 | 复用 `homeData.ts` 的匹配与记忆化索引，**禁止另写匹配逻辑** | `normalizeSearchQuery` / `buildSearchIndex` / `bookmarkMatchesSearch`（`:35-66`）+ 按数组身份缓存（`:288-301`）已是既有契约 |
| D-3 | 防抖仍为 120ms；实现前把当前只在 `Home.svelte:38` 的常量抽到共享纯模块 | Spotlight 不能导入组件私有常量，页面过滤和 Spotlight 必须共享同一导出，避免第二个字面量 |
| D-4 | 滚动互斥用现有 `scrollSpySuppressedUntil` 时间戳窗口，**驳回 300ms 布尔锁** | 布尔锁需要 `smooth` 滚动的完成事件，而该事件不存在（FR-5.3） |
| D-5 | 护眼 `paper-*` 九个预设的 accent **一个都不改** | 每个已按自身色相调过（`themePresets.ts:273-317`），统一成深青绿是回归（FR-4.2） |
| D-6 | 不重命名 `--home-accent-color` 为 `--accent-primary` | 33 个 color-mix 消费点分散在 7 个文件，重命名是纯风险零收益（FR-4.1） |
| D-7 | 不接 `/api/fetch-favicon` | 前端无生产调用者；接回去等于每次开窗多打一次无限流的鉴权接口，只换来候选列表多一个来源（FR-3.4） |
| D-8 | 本轮不新增“全局唤起新增书签”入口 | 会与模块一的浮动搜索按钮抢同一块视觉空间（FR-3.6） |
| D-9 | 移动端 Action Sheet 只在同行按钮 ≥ 3 时触发，**现状不触发** | 正常态最多 2 个按钮，移动端已折叠为图标方块（FR-2.3） |
| D-10 | ~~不新增任何 accent 相关用户设置项~~ **已于 2026-09-05 推翻** | 原理由是「accent 由 22 个预设决定是现有设计意图，加设置项会形成两套真源」。用户裁定 PROB-30 时改为「让自定义背景也能配 accent」：新设置只在 `background_preset_id === 'custom'` 时生效，有预设时仍由预设决定，因此不产生两套同时生效的真源。承接编号 `REQ-13`（FR-4.5） |


## 8. 文件所有权总表

新增生产文件 6 个，改动生产文件 18 个，新增测试文件 4 个，扩充既有测试文件 4 个；文档同步项 2 个。测试文件逐个列出，不使用“等”作为所有权占位。同一生产文件被多个模块触碰的，在“冲突”列标注。

### 8.1 新增生产文件

| 文件 | 归属 | 内容 | 单测策略 |
| --- | --- | --- | --- |
| `src/lib/searchBoxVisibility.ts` | FR-1.1 | `IntersectionObserver` action、稳定可见性回调、destroy 清理 | action 生命周期源码断言；阈值/重复值逻辑若抽纯函数则单测 |
| `src/lib/searchTiming.ts` | FR-1.5 | 导出唯一的 `SEARCH_FILTER_DEBOUNCE_MS = 120` | 直接导出值断言；页面过滤和 Spotlight 均引用同一模块 |
| `src/lib/pageScrollLock.ts` | FR-1.4 | 从 `BookmarkEditModal.svelte:257-274` 搬迁的 body/document 滚动锁 | `pageScrollLock.test.ts` 测原内联值恢复、重复锁和解锁 |
| `src/components/SearchSpotlight.svelte` | FR-1.3 / FR-1.5 | 居中命令面板，z-index **240**，dialog/combobox/listbox 语义 | `searchSpotlight.test.ts` 测源码语义、token、快捷键及清理约束 |
| `src/lib/clipboardUrl.ts` | FR-3.2 | 剪贴板文本 → 可用 URL 的判定与 2048 字符上限 | `clipboardUrl.test.ts` 测非 URL、超长、凭据剥离和默认拒绝 localhost |
| `src/lib/iconTextColor.ts` | FR-5.2 | `deriveIconTextColor(hostname, title)` → 稳定的前景/背景色对 | `iconTextColor.test.ts` 测稳定性、WCAG 相对亮度和空值兜底 |

### 8.2 新增测试文件

| 文件 | 归属 | 覆盖 |
| --- | --- | --- |
| `tests/unit/pageScrollLock.test.ts` | FR-1.4 | 滚动锁原内联值、重复加锁、解锁恢复 |
| `tests/unit/searchSpotlight.test.ts` | FR-1.1 / FR-1.3 / FR-1.5 | action、ARIA、z-index、共享防抖引用、结果上限 |
| `tests/unit/clipboardUrl.test.ts` | FR-3.2 | URL 判定、2048 上限、凭据剥离 |
| `tests/unit/iconTextColor.test.ts` | FR-5.2 | 颜色稳定性、对比度、空 hostname |

### 8.3 改动生产文件

| 文件 | 模块 | 改动要点 | 冲突 |
| --- | --- | --- | --- |
| `src/App.svelte` | 一 + 三 | 注册 Spotlight 懒加载；`handleOpenCreateBookmark(categoryId?)` 在无显式 id 时消费视口分类 | **两模块共改**，阶段上必须串行 |
| `src/views/Home.svelte` | 一 + 三 + 四 | 上报搜索框可见性/唤起；上报 `activeId`/`selectedCategoryIds`；定义两个 accent token；迁移 120ms 常量引用 | **三模块共改**，冲突面最大 |
| `src/components/HomeHeroSearch.svelte` | 一 | 给 `.search-card` 挂 FR-1.1 action | — |
| `src/components/HomeFloatingActions.svelte` | 一 | 插入搜索按钮、接入 `onOpenSearch`，保留现有 safe-area/触摸尺寸 | — |
| `src/components/SearchBox.svelte` | 一 + 四 | 实例化唯一 id；24% `color-mix` 换 token；是否统一按钮 Indigo 渐变须另作视觉决定 | 两模块共改 |
| `src/components/BookmarkEditModal.svelte` | 一 + 三 | 改用共享滚动锁；建立打开边沿；在用户手势链路中请求剪贴板并触发标题解析 | 两模块共改 |
| `src/components/CategorySection.svelte` | 二 | `.section-actions` 渐显；空态折叠；保持 section id/scroll margin | — |
| `src/components/HomeCategoryScope.svelte` | 二 | `.scope-action` 渐显；其余 color-mix 保持原值 | — |
| `src/lib/bookmarkTitleController.ts` | 三 | 增加仅自动触发路径的 3 秒节流；保留三重门禁和过期响应保护 | — |
| `src/lib/homeData.ts` | 三 | 新增 `resolveViewportCenterRootId`，不修改 `resolveActiveHomeRootId` | — |
| `src/lib/themePresets.ts` | 四 | 为 13 个 glass 预设提供显式 light/dark accent；不改 9 个 paper 预设 | — |
| `src/components/BookmarkCardInfo.svelte` | 四 | 24%/16% color-mix 换 token；字号换既有 base/sm token | — |
| `src/components/BookmarkCardCompact.svelte` | 四 | 24%/16% color-mix 换 token | — |
| `src/components/Sidebar.svelte` | 四 | 仅 24% color-mix 换 token，其余百分比保持原样 | — |
| `src/components/settings/SettingsHomePreview.svelte` | 四 | 预览根定义与首页相同的 accent token | — |
| `src/components/BookmarkCard.svelte` | 五 | 计算派生字母头像颜色，经既有 `iconStyle` 透传；校验自定义背景让位 | — |
| `src/components/BookmarkIcon.svelte` | 五 | `.icon-text` 读取 CSS 变量并保留原值 fallback | — |
| `src/components/CachedBookmarkIcon.svelte` | 五 | 若仍属于书签网络图标路径，补固定尺寸和 `fetchpriority`；否则在性能契约中声明边界 | — |

### 8.4 扩充既有测试文件

| 文件 | 归属 | 改动 |
| --- | --- | --- |
| `tests/unit/homeFloatingActions.test.ts` | 一 | 搜索按钮、safe-area、ARIA 属性断言 |
| `tests/unit/bookmarkTitleController.test.ts` | 三 | 自动节流、用户 blur 不受限、三重门禁/竞态 |
| `tests/unit/homeNavigation.test.ts` | 三 | 视口中央函数、排除 `id: -1`，并锁定旧 scroll-spy 行为 |
| `tests/unit/designTokens.test.ts` | 四 + 五 | token 使用、替换计数、图标属性；计数断言按文件基线明确写出 |

### 8.5 文档同步

| 文件 | 位置 | 原因 |
| --- | --- | --- |
| `docs/reference/API_CONTRACT.md` | site-meta 约束段（当前约 `:132`） | 增加“剪贴板预填后自动触发”路径，并写明 3 秒自动节流 |
| `docs/reference/PERFORMANCE_CONTRACT.md` | Bookmark Icons 段 | 记录 Spotlight 结果最多 50 项，以及 CachedBookmarkIcon 是否属于固定尺寸/低优先级契约 |

### 8.6 明确不碰的文件

| 文件 | 原因 |
| --- | --- |
| `src/lib/bookmarkFaviconController.ts` + `tests/unit/bookmarkFaviconController.test.ts` | 死代码，OQ-3 未决；另保留 `tests/unit/storesSurface.test.ts:60-62` 的 API 表面断言 |
| `src/lib/iconVisibility.ts` | 是 FR-1.1 的写法先例，不是改造对象；其 `rootMargin: '420px 0px'` 只适用于图标预取 |
| `shared/settings.ts` / `shared/types.ts` / `worker/**` | 本轮无设置项和服务端接口变更；只有 OQ-7 被显式推翻时才允许改默认高度 |
| `src/lib/api.ts` | 不新增接口；FR-3.3 复用现有 `fetchSiteMeta`（`:386-391`） |
| 9 个 `paper-*` 预设（`themePresets.ts:273-317`） | D-5；已有专属 accent，不得被 glass 修复覆盖 |

## 9. 分阶段任务

草案原本的分期是按模块顺序排的。核对后重排为**按风险与依赖排**：先做零视觉变化的地基，再做两个真正的新功能，最后才碰配色与字号。理由是 `src/App.svelte` 与 `src/views/Home.svelte` 被三个模块共改（§8.2），必须串行；而视觉变化一旦和新功能混在一个阶段，出问题时无法判断是哪一类改动导致的。

### 阶段 1：零视觉变化的地基（可独立合并）

本阶段任何一处产生像素变化都算失败。

| # | 任务 | 对应 | 验收 |
| --- | --- | --- | --- |
| 1.1 | 把 `BookmarkEditModal.svelte:257-274` 的滚动锁**原样**抽成 `src/lib/pageScrollLock.ts`，弹窗改为调用它 | FR-1.4 | 新增纯函数单测：锁后 `overflow` 被改、解锁后内联样式回到原始值（含"原本就有内联值"与"原本为空"两种情形） |
| 1.2 | `SearchBox.svelte:136`/`:138` 的 `id="search-query"` 与 `<label for>` 改为按实例生成 | T-1.1 | 源码文本断言：不再出现字面量 `id="search-query"` |
| 1.3 | 抽 `--accent-border`（24%）与 `--accent-glow`（16%）两个 token，替换 14 处 `color-mix`，并在 `Home.svelte:675`/`:721` 与 `SettingsHomePreview` 预览根两处定义 | FR-4.1 | 源码断言：两个 token 在两处均有定义；10 处 24% 与 4 处 16% 的目标替换完成，其余百分比按改前文件基线保持 |
| 1.4 | 补 `BookmarkIcon` 属性护栏，并决定 `CachedBookmarkIcon` 是否属于同一书签图标契约 | FR-5.1 | 逐文件断言属性；若纳入缓存路径，补固定尺寸与 `fetchpriority` |
| 1.5 | 将 `SEARCH_FILTER_DEBOUNCE_MS = 120` 从 `Home.svelte:38` 抽到 `src/lib/searchTiming.ts`，页面过滤和 Spotlight 共同引用 | D-3 | 源码断言只有一个 120ms 定义；本阶段不改变过滤时序 |

### 阶段 2：模块一 Spotlight（本轮最大增量）

依赖阶段 1 的 1.1 与 1.2；同时必须先确定共享 120ms 常量的迁移位置。

| # | 任务 | 对应 |
| --- | --- | --- |
| 2.1 | `src/lib/searchBoxVisibility.ts`：单例 `IntersectionObserver`，`threshold: 0`，无 `rootMargin`，API 缺失回调“始终可见”，destroy 清理 | FR-1.1 |
| 2.2 | `HomeHeroSearch.svelte` 挂 action；`search_box_show === false` 时上报“不可见” | FR-1.1 / T-1.2 |
| 2.3 | `HomeFloatingActions.svelte` 新增 `.icon-button` 搜索按钮，接入 `onOpenSearch`，复用既有尺寸和 safe-area | FR-1.2 |
| 2.4 | `SearchSpotlight.svelte`：对齐 `ConfirmDialog` 的遮罩结构，z-index 240，完整 dialog/combobox/listbox 语义、首焦点和焦点陷阱 | FR-1.3 |
| 2.5 | 唤起与关闭：点击 / `Ctrl+K` / `Cmd+K` / `/`（非输入态且非 IME）；Esc、scrim、选中后关闭；集中处理 Esc 优先级；关闭还原焦点；锁滚动并清理 | FR-1.4 |
| 2.6 | 结果与键盘导航：共享匹配与 120ms 防抖、统一 `open_method` 适配、稳定顺序、50 条上限、aria-live，不渲染 `BookmarkCard` | FR-1.5 / FR-1.6 / D-1 / D-2 / D-3 |
| 2.7 | 经 `createLazyComponentLoader` 注册到 `App.svelte`，处理 lazy import 失败和重复唤起 | FR-1.3 / FR-1.4 |

### 阶段 3：模块三 极速录入管道

依赖阶段 2 完成 `App.svelte` / `Home.svelte` 的共享接线；阶段 3 不得重新定义 Spotlight 或页面过滤状态。

| # | 任务 | 对应 |
| --- | --- | --- |
| 3.1 | `BookmarkEditModal.svelte` 建立打开边沿，异步任务使用打开 token 并在关闭/销毁时失效 | FR-3.1 |
| 3.2 | `src/lib/clipboardUrl.ts` + 弹窗接线：仅 `create` 且 URL 为空；优先用户手势链路读取；失败全程静默；2048 字上限 | FR-3.2 |
| 3.3 | 预填后的可见且可访问反馈；用户修改、关闭或下一次打开时清除 | FR-3.2 / 6.3 |
| 3.4 | 预填成功后直接调用 `scheduleBookmarkTitleLookup`，仅自动路径加 3 秒节流，并阻止过期响应覆写新表单 | FR-3.3 |
| 3.5 | `resolveViewportCenterRootId` + `Home.svelte` 上报 + `App.svelte:725-740` 消费；使用 client 坐标；尊重 suppression；排除 `id: -1` | FR-3.5 |
| 3.6 | 同步 `docs/reference/API_CONTRACT.md:132`，明确 blur 与剪贴板自动触发两条路径 | FR-3.3 / §8.5 |

### 阶段 4：视觉调整（每项按独立提交隔离，可单独回滚）

本阶段是唯一允许产生视觉变化的阶段；每项保持独立提交边界，回滚时不得撤销其他模块的行为修复。

| # | 任务 | 对应 | 风险 |
| --- | --- | --- | --- |
| 4.1 | `.section-actions` 与 `.scope-action` 的 hover/`focus-within` 渐显；只改 `opacity`/`visibility`；排序会话中恒显；`@media (hover: hover) and (pointer: fine)` 包裹并支持 reduced-motion | FR-2.1 | 低。预留列已存在，不引入布局抖动 |
| 4.2 | 空分类折叠：已登录使用固定提示/按钮，未登录访客不渲染；不改 `id` 与 `scroll-margin-top` | FR-2.2 | 中。改错会让侧栏 scroll-spy 基准漂移 |
| 4.3 | 13 个 glass（毛玻璃）预设各自的显式 light/dark accent，从预设色板确定性取值 | FR-4.2 | 中。会改变视觉，是有意的配色修复 |
| 4.4 | `BookmarkCardInfo.svelte:135`/`:147` 字号换 `var(--font-size-base)` / `var(--font-size-sm)` | FR-4.3 | 低。14.4→14px、12→12px |
| 4.5 | 字母头像按 hostname 派生颜色，自定义背景让位，提供 sRGB fallback 并通过 WCAG 对比度验证 | FR-5.2 | 中。涉及纯函数、BookmarkCard 透传和 CSS 变量，不影响请求数但会改变样式 |

### 不在本轮实现但需保留为边界的条款

FR-2.3（移动端 Action Sheet，现状不触发）；FR-2.4（模块二“不做”边界）；FR-3.4（图标候选无需开发）；FR-3.6（后台边界）；FR-4.4（几何默认值/间距本轮不改，分别由 OQ-7/OQ-6 约束）；**FR-4.5 只剩「不引入 `--accent-primary` 别名」这一条**——「不新增 accent 设置」已于 2026-09-05 随 PROB-30 裁定推翻，改由 `REQ-13` 承接；FR-5.3 与 FR-5.4（驳回/降级）；FR-5.5（性能护栏，随各阶段验证）；OQ-1 至 OQ-8（待决）。FR-1.6 已并入阶段 2.6，不得遗漏。

## 10. 验证方案

### 10.1 可用的验证手段（先认清约束）

验证分为**两类本地源码自动化**与**两类真实浏览器闸门**：类型/单元测试负责编译与纯函数/源码契约，性能审计/Chrome 回归负责真实目标站和运行时交互。

| 手段 | 命令 | 能验什么 | 不能验什么 |
| --- | --- | --- | --- |
| 类型检查 | `npm run type-check`（`tsc --noEmit && svelte-check`） | prop 契约、类型漏洞、Svelte 模板里的类型错误 | 运行时行为、样式 |
| 单元测试 | `npm test`（`vitest run`，当前 100 个文件） | 纯函数行为；`readFileSync` + `toContain` 的源码文本断言 | **组件挂载与交互**——仓库无 `@testing-library/svelte`，无 jsdom 挂载环境（C-6） |
| 性能审计 | `npm run perf:audit` | 脚本定义的 9 项检查：网络失败、卡片/破图、splash、搜索 mutations、后台 rows、admin 传输、图标请求、Cache Storage | 需要 `ADMIN_USER`/`ADMIN_PASS` 与可访问目标站，属真实环境闸门 |
| 浏览器回归 | `npm run regression:chrome` | 真实浏览器功能回归 | 需要凭据与目标站；目标来自 git-ignored 的 `verify.local.json`，凭据来自环境变量 |

**直接后果**：Spotlight 的键盘导航、剪贴板权限/用户手势、hover 渐显和响应式布局不能仅靠现有单测证明。必须同时满足 §10.2 的自动断言和 §10.3 的真实浏览器清单。

### 10.2 自动化验证（必须新增/扩充的断言）

| 需求 | 断言类型 | 具体断言 |
| --- | --- | --- |
| FR-1.4（滚动锁抽取） | **纯函数单测** | 锁后 `overflow` 生效；解锁后内联样式**逐字**回到原值；覆盖"原本有内联值"与"原本为空"；重复加锁不叠加 |
| FR-1.1 | 源码断言 | `searchBoxVisibility.ts` 含 `IntersectionObserver`、`threshold: 0`、destroy 清理；同时用 AST 或同时覆盖单/双引号的调用匹配，不能只排查 `addEventListener('scroll'` |
| FR-1.2 | 源码断言（扩充 `homeFloatingActions.test.ts`） | 含 `data-testid="home-search-button"`、`aria-label="搜索书签"`、`aria-keyshortcuts="Control+K"` |
| FR-1.3 | 源码断言 | `SearchSpotlight.svelte` 含 `role="dialog"`、`aria-modal="true"`、`role="listbox"`、`role="option"`、`aria-activedescendant`、`z-index: 240`、`border-radius: var(--radius-xl)`（C-11）；**不含** `id="search-query"`（T-1.1） |
| FR-1.5 | 源码断言 + 纯函数单测 | Spotlight 引用共享模块的 `SEARCH_FILTER_DEBOUNCE_MS`（当前定义 `Home.svelte:38`，实现前需迁移）；引用 `bookmarkMatchesSearch` / `buildSearchIndex`（D-2）；稳定顺序、`totalMatches - 50` 和 50 上限均有测试 |
| FR-3.2 | **纯函数单测** | 非 URL 文本 → 空；> 2048 字 → 空；`http://localhost` → 空（OQ-2 默认取向）；带内嵌凭据的 URL → 凭据被剥离 |
| FR-3.3 | **纯函数单测** | 3 秒内第二次自动触发被拒；用户 `blur` 触发不受该节流影响；三重门禁行为不变（扩充 `bookmarkTitleController.test.ts`） |
| FR-3.5 | **纯函数单测** | `resolveViewportCenterRootId` 取视口中央而非顶部；`id: -1` 被排除；`sectionTops` 为空时返回 `null`；**同时断言 `resolveActiveHomeRootId` 的既有行为未变**（`homeNavigation.test.ts:107-118` 必须继续通过） |
| FR-4.1 | 源码断言 | 两个 token 在 `Home.svelte` 与 `SettingsHomePreview.svelte` 均有定义；24% 与 16% 的目标 `color-mix` 归零；其余百分比按**逐文件基线计数**保持（测试固定基线数字，不能用 `toContain` 表达“与改前相同”） |
| FR-4.2 | 源码断言 | `themePresets.ts` 不再包含 glass 默认字面量 `accentColor: '#2563eb'`；13 个 glass 预设各自传入显式 light/dark accent，且颜色算法/字段符合 FR-4.2 |
| FR-4.3 | 源码断言 | `BookmarkCardInfo.svelte` 含 `var(--font-size-base)` 与 `var(--font-size-sm)`；`min-height: 0.9em` 仍在 |
| FR-5.1 | 源码断言 | `BookmarkIcon.svelte` 五项属性齐全；若 CachedBookmarkIcon 纳入书签契约，同样逐项断言固定尺寸与低优先级 |
| FR-5.2 | **纯函数单测 + 浏览器验收** | 同输入同输出（稳定性）；实现 hex→linear sRGB 相对亮度与 WCAG 公式（仓库无色彩库）；按实际字体/背景达到普通文本 ≥4.5:1（大文本 ≥3:1）；不同 hostname 产出不同色；空 hostname 有确定兜底 |
| 全局 C-10 | 已有断言自动生效 | 新增的 `transition:` 若含字面时长，`designTokens.test.ts:47-61` 直接失败 |

### 10.3 人工验收清单（自动化覆盖不到的部分）

**模块一**
- 向下滚动到主搜索框离屏 → 右上角搜索按钮淡入；滚回顶部 → 淡出。
- 后台把「显示搜索框」关掉 → 浮动搜索按钮**恒显**（T-1.2，这是唯一搜索入口）。
- `Ctrl+K`、`Cmd+K`、`/` 三种唤起都生效；焦点在任意输入框、`contenteditable` 或 IME composition 期间按 `/` **不**唤起。
- Spotlight 打开后首焦点进入 combobox，Tab/Shift+Tab 不越出 dialog；页面不能滚动；关闭后焦点回到唤起元素或安全容器。
- Spotlight 与 ConfirmDialog 同时打开时，Esc 先关 Spotlight；Spotlight listener 销毁后 ConfirmDialog 仍可正常处理 Esc。
- `↑`/`↓`/`Home`/`End` 移动高亮；`Enter` 按统一适配器执行每一种 `open_method` 且只执行一次；空结果和截断提示能被屏幕阅读器播报。
- 首屏数据仍在分批加载时打开 Spotlight → 允许空/部分结果，**不得**触发额外请求（T-1.4）。
- 在 `prefers-reduced-motion: reduce` 下，Spotlight 和搜索按钮不播放非必要过渡；在窄屏、100dvh、虚拟键盘和刘海屏下，输入框、关闭按钮和结果仍可见。

**模块二**
- PC 端：分类标题行未 hover 时看不到操作按钮，hover/Tab 进入后出现，**标题文字不发生任何位移**。
- 进入排序会话 → 取消/保存按钮恒显，不随 hover 消失。
- 触摸设备（或 DevTools 模拟 `pointer: coarse`）→ 按钮保持恒显。
- 空分类：已登录看到一行提示/按钮，**未登录访客什么都看不到**。
- 折叠前后点击侧栏跳到该分类，落点位置不变（scroll-spy 基准未漂）。

**模块三**
- 复制一个 http(s) 网址 → 点「新增书签」→ URL 自动填入，且**有可见的"来自剪贴板"提示**。
- 复制一段普通文字 / 复制超长文本 → URL 保持为空，无 Toast、无报错。
- Chromium 首次读取可能要求 transient user activation 并出现授权提示；拒绝或离开安全上下文后 → 静默跳过，弹窗照常可用且焦点不丢失。Firefox 125+ 等支持 `readText()` 的浏览器也必须覆盖拒绝路径，不把 API 存在等同于权限成功。
- 预填后标题自动解析；3 秒内反复开关弹窗**不应**连续打 `/api/fetch-site-meta`。
- 编辑已有书签（`mode !== 'create'`）→ **不读剪贴板**、**不覆盖** URL。
- 滚到某个分类中部 → 开「新增书签」→ 分类下拉预选该分类。
- 点侧栏跳转后**立刻**开窗 → 拿到的是目标分类而非过渡中的分类（`scrollSpySuppressedUntil`）。
- 后台书签列表的两个新增入口仍回退第一个分类（FR-3.6）。

**模块四**
- 逐个切换 22 个预设，确认：9 个 `paper-*` 的 accent **与改前逐一相同**；13 个毛玻璃各自的 accent 与其渐变协调，暖色预设不再出现冷蓝。
- 后台「首页预览」里的卡片描边与首页真实卡片**取值一致**（T-4.1）。
- 亮/暗两种主题都过一遍。
- 把 `card_size.height` 设成 `0`（自动档）→ 卡片回到 70px 且图标 54px（`0` 的特殊语义未被破坏，T-4.3）。

**模块五**
- 一屏内多个无图书签 → 字母头像颜色互不相同且文字清晰可读。
- 给某个书签设了 `icon_background_color` → 派生色**让位**给用户设置。
- 亮/暗主题下都满足对比度。

### 10.4 收尾闸门

阶段 4 合并前，按顺序跑完并全部通过：

```
npm run type-check
npm test
npm run build
```

随后在可访问的目标站上（`BASE_URL` 与浏览器参数取自 git-ignored 的 `verify.local.json`，凭据只走环境变量）手动跑：

```
npm run perf:audit
npm run regression:chrome
```

`perf:audit` 必须满足 C-5 的 **9 项检查**。其中**图标请求数 ≤ 260** 是本轮最可能被 Spotlight 顶破的一项，必须在“打开 Spotlight 并输入到出满 50 条结果”的场景下实测，而不是只测首页静态加载。

### 10.5 本轮完成定义与回滚

只有同时满足以下条件，本文档对应的实现轮次才可标记为完成：

1. §2–§6 的 FR 条款全部映射到阶段任务；明确“不做”的条款和 OQ 没有被误报为已实现。
2. `npm run type-check`、`npm test`、`npm run build` 全部通过；测试覆盖 §10.2 的纯函数、源码契约和逐文件基线。
3. `npm run perf:audit` 的 9 项检查全部通过，且 `npm run regression:chrome` 覆盖 §10.3 的键盘、焦点、IME、剪贴板、响应式和 reduced-motion 场景。
4. 阶段 4 的视觉改动按独立提交保存；若回滚，优先按提交粒度 revert，并重新跑类型、单测、构建和受影响的浏览器/性能闸门。不得用修改用户设置数据或删除兼容字段来回滚。
