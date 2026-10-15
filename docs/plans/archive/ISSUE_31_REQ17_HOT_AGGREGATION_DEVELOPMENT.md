> **STATUS: 已完成**（判定于 2026-10-15）——REQ-17 已发版（CHANGELOG），热门聚合已实现。

# REQ-17 开发文档：一级分类聚合二级高频书签（Issue #31 第 2 点）

> 配套需求：`docs/plans/ISSUE_31_CATEGORY_VISUAL_AND_HOT_AGGREGATION_REQUIREMENTS.md`（REQ-17 节；验收/风险/已裁定决策以需求文档为准）。
> 本文件是**实现契约**：聚合算法、Home 选择/渲染接线、来源标注、改动文件清单、分阶段落地顺序与验证门。
> 基线：`develop` @ `9dbd913`（2026-10-11）；行号可能漂移，以符号名为准。
> §4 各 OQ 已裁定（见需求文档），本文不重开产品决策；开工仍需维护者显式批准。

## 0. 交付范围一句话

当一级分类自身无直属书签、只有二级分类有书签时，该一级「本分类」区展示其整个子树的**常用书签**（`click_count` 优先、固定常量 `CATEGORY_HOT_LIMIT` 封顶、低点击按 `sort` 回填保证非空），卡片标注来源二级分类名；取代现状「只渲染排序第一个子分类（可能为空）的内容」。（2026-10-12 复核修订：封顶由全局 `most_visited_count` 改为独立常量，二者解耦。）

## 1. 关键实现决策

- **DEV-17-A：纯客户端派生，不改 D1 schema / 聚合 SQL / API。** `/api/public/data` 已返回当前身份可见的全量书签（含 `category_id`/`click_count`，`worker/lib/db/aggregates.ts:27-58`），聚合在 `src/lib/homeData.ts` 新 helper 完成。
- **DEV-17-B：改空一级的默认选择为「本分类」（root），并在「本分类」被选中且触发条件成立时渲染聚合列表。** 现状 `resolveHomeCategoryForRoot`（`homeData.ts:179-194`）对空一级默认选 `root.children[0]`，这正是用户实测到「首个子分类为空→整块空态」的根因。改为默认选 `root`，由聚合列表填充「本分类」内容；用户点二级 tab 仍看该子分类、点标题（`.scope-root-trigger`，`HomeCategoryScope.svelte:169-179` 已存在 `select(rootId)`）回到「本分类」= 聚合区（满足 OQ-17.5）。
- **DEV-17-C：来源二级分类名以卡片上的轻量 chip 呈现**（OQ-17.4）。复用现有 `getCategoryTitleMap`（`Home.svelte:115`）。这是本需求唯一新增的卡片内视觉元素，须在 L2 按卡片最小宽度验证不破版。

## 2. 改动文件清单

### 2.1 新增（0 个文件，1 个导出函数）

`src/lib/homeData.ts` 新增 `getCategoryHotBookmarks`（见 §3）。

### 2.2 修改

| 文件 | 改动 |
| --- | --- |
| `src/lib/homeData.ts` | ① 新增 `getCategoryHotBookmarks`；② `resolveHomeCategoryForRoot`（`:179-194`）空一级默认 `root.children[0]` → `root`（DEV-17-B） |
| `src/views/Home.svelte` | ① 复用 `publicCategoryIds`（`:128`）、`categoryTitleById`（`:115`）、`allCategoryBookmarks`（`:98`）；② 非排序渲染块（`:661-695`）：当 `selectedCategory.id === category.id` 且该一级直属桶为空且有子分类时，`bookmarks` 换为 `getCategoryHotBookmarks(...)`，并传来源标题 map + 「常用」标记；③ 在面板（`:621-630` 的 `.scope-section-list`）顶部渲染小标题「常用（来自 N 个子分类）」 |
| `src/components/CategorySection.svelte` | 新增可选 prop `bookmarkSourceTitles?: ReadonlyMap<number, string>`；非空时每张卡片传 `sourceCategoryTitle`；不改既有调用方（prop 可选、默认 `undefined`） |
| `src/components/BookmarkCard.svelte` | 新增可选 prop `sourceCategoryTitle?: string`；非空时在卡片渲染一个 `aria-hidden` 友好的 muted 来源 chip（详情/极简两风格都要兼容，详情卡在标题区、极简卡在 tooltip 或副标题；具体位置以不破 `card_size.width` 最小宽度为准，L2 验证） |
| `tests/unit/homeNavigation.test.ts` | 更新 `:107-118`「空一级回退首个子分类」用例为新契约：空一级默认选 `root`（本分类）；新增 `getCategoryHotBookmarks` 用例（见 §5） |

### 2.3 不改（OQ 裁定边界）

- 不改 `worker/`、`shared/`、`/api/public/data`、`click_count` 自增与 `data_version`/edge 缓存语义（FR-17.7：刷新一致靠重新拉取 + 既有响应式重算，不轮询、不改缓存）。
- 不改排序模式分支（`Home.svelte:631-660`，仍显式渲染一级+各子分类空投放区）。
- 不改全局「经常访问」区（`MOST_VISITED_CATEGORY`，`Home.svelte:45-50,558-575`）；允许其与一级聚合区重复同一书签（OQ-17.5）。
- 不覆盖全页搜索/Spotlight/Sidebar 计数（OQ-17.8，仅首页普通模式）。

## 3. `getCategoryHotBookmarks` 契约

```ts
export function getCategoryHotBookmarks(
  root: CategoryNode<PublicCategory>,
  categoryBookmarks: ReadonlyMap<number, PublicBookmark[]>,
  limit: number,
): PublicBookmark[]
```

算法（频次优先 + 回填）：
1. `n = Math.max(0, Math.floor(Number(limit) || 0))`；`n === 0` → `[]`。
2. 子树 id = `[root.id, ...root.children.map((c) => c.id)]`；收集这些桶的全部书签（一本书签只在自己的 `category_id` 桶，天然不重复）。
3. **隐私过滤**（FR-17.6，2026-10-12 复核修订）：仅剔除 `is_private === true/1`。**不再**按 `publicCategoryIds`/祖先可见集过滤——入参 `categoryBookmarks`（= `allCategoryBookmarks`）已按当前视图预过滤（匿名由后端剔除私密子树，管理员为全量），再套匿名可见集会把管理员查看的私密一级旗下公开子分类书签整体丢弃，使空私密一级聚合恒空。
4. **频次段** `hot`：`click_count > 0`，按 `click_count desc, sort, id`。
5. **回填段** `rest`：`click_count <= 0`（或 `== null`），按 `sort, id`。
6. 返回 `[...hot, ...rest].slice(0, n)`：满 N 即止；子树过滤后非空时结果非空（A17-7 永不空区）；两段不相交，无需去重。
7. **纯函数、不改入参**（对齐 `getMostVisitedBookmarks` 的不可变约定，`homeData.ts:94-110`）。

> 新鲜度（A17-8）：helper 在 Home 的响应式 `$:` 链里调用，入参 `allCategoryBookmarks` 源自 `bookmarks` prop（`publicData`）。点击设备经 `publicStore.incrementClick` 乐观更新 `click_count` → 本页重算重排；其它设备刷新页面重新拉取 `/api/public/data` 后重算。无轮询、无实时推送。

## 4. Home 选择/渲染接线

### 4.1 触发判定（复用现有派生）
```ts
// 每个 root group 内（Home.svelte 现有 {#each categoryGroups as group}）
const rootDirectEmpty = (allCategoryBookmarks.get(category.id)?.length ?? 0) === 0 && category.children.length > 0
const showHot = rootDirectEmpty && selectedCategory.id === category.id   // 「本分类」被选中（默认或点标题回来）
const hotBookmarks = showHot
  ? getCategoryHotBookmarks(category, allCategoryBookmarks, CATEGORY_HOT_LIMIT)
  : null
```
- `selectedCategory` 由 `getHomeCategoryGroups`→`resolveHomeCategoryForRoot` 决定；DEV-17-B 使空一级默认 `selectedCategory === root`，故默认 `showHot=true`。
- 点二级 tab → `selectedCategory` 变子分类 → `showHot=false` → 走原「子分类直属书签」路径。

### 4.2 渲染（非排序块 `:661-695`）
- `showHot` 时：`CategorySection` 的 `bookmarks={hotBookmarks}`、`bookmarkSourceTitles={<子树书签 id → 其 category 标题>}`（用 `categoryTitleById` 构造）、`showEmpty={true}`（子树真无书签才空态）。
- 面板顶部加小标题「常用（来自 N 个子分类）」，N = 有书签的子分类数；`showHot=false` 时不渲染该小标题，保持现状。
- `showHot=false` 时：完全维持现有 `category={selectedCategory} bookmarks={selectedBookmarks}` 路径。

### 4.3 数量与全局解耦（2026-10-12 复核修订）
聚合封顶改用 `src/lib/homeData.ts` 的固定常量 `CATEGORY_HOT_LIMIT`（当前 12），**不读** `most_visited_count`。因此全局「经常访问」设为 0 时，分类聚合区照常显示（二者独立）；用户要求去掉对全局数量的继承，只保留一个最大显示条数。单测锁定「`most_visited_count=0` 仍显示聚合区」。

## 5. 分阶段实施与验证门

| 阶段 | 内容 | 验证门 |
| --- | --- | --- |
| **1 helper** | `getCategoryHotBookmarks` | L0；单测：子树收集、仅剔除 `is_private`（**不**按祖先/`publicCategoryIds` 过滤，私密一级旗下公开子分类书签保留）、`click_count` 排序、回填补足、封顶、`n=0`、空子树、不改入参、同票 tie-break |
| **2 接线** | `resolveHomeCategoryForRoot` 默认改 root + 更新其单测；Home 触发/渲染/小标题；`CategorySection`/`BookmarkCard` 来源 chip | L0：更新后的 `homeNavigation` 用例；jsdom 渲染 `Home`（复用 `homeCategoryFocus.test.ts` 手法）断言「空一级（首个子分类为空、他子有书签）显示聚合而非空态」「点二级 tab 切回子分类」「点标题回聚合」「来源 chip 文案」 |
| **3 真机 L2** | 150+ 书签 / 10 一级 / 6 二级规模 | 空一级显示聚合、零点击一级按 sort 回填非空、点击本页重排、二级 tab 切换、来源 chip 在最小卡片宽度不破版、匿名态私密一级不渲染且管理员态私密一级旗下公开子分类书签正确聚合（两态构成不要求一致）、刷新一致、无横向溢出；控制台/4xx-5xx 为 0 |
| **4 收尾** | BACKLOG/CHANGELOG 回写；`perf:audit` 复跑 | L3：图标请求/缓存预算不回归 #31 第 3 点（聚合会增重复卡片渲染，R17-3） |

每阶段独立提交；`Home.svelte`/`homeData.ts` 若与 REQ-16 或其它模块同轮改**串行**。

## 6. 测试计划

### 6.1 单元（纯函数 + jsdom）
- `getCategoryHotBookmarks`：
  - 子树 = root 直属 + 各二级直属；只取子树内书签。
  - `is_private` 书签剔除；**不按 `publicCategoryIds`/祖先可见集过滤**（入参数据已按视图预过滤）——私密一级旗下公开子分类书签必须保留。
  - 全部有点击 → 纯频次 `click_count desc, sort, id`；
  - 部分零点击 → 频次段在前、`sort` 回填段在后，补足到 N；
  - 全部零点击 → 全按 `sort` 回填、非空；
  - `n=0` → `[]`；空子树 → `[]`；不改入参数组。
- `resolveHomeCategoryForRoot`：空一级默认 → `root`（替换旧 `children[0]` 断言）；显式选 child/root 行为不变。
- `Home`（jsdom，`// @vitest-environment jsdom`）：构造「空一级 + 首个子分类为空 + 次子分类有书签」→ 断言聚合书签出现（修复用户实测场景）、空态不出现；点二级 tab → 显示该子分类；点 `.scope-root-trigger` → 回聚合；来源 chip 文本存在。

### 6.2 L2（真实 Chrome，`real-chrome-cdp-testing`）
隔离临时 Chrome + 精确 profile 清理；150+ 书签规模夹具（本地库或授权测试站只读/Tier 1）。场景见 §5 阶段 3。来源 chip 在 `card_size.width` 下限（详情 40px / 移动 150px）截图确认不溢出、不遮点击区。

### 6.3 L3
`npm run perf:audit`：聚合区引入的额外卡片/图标渲染不使图标请求超预算（对照 #31 第 3 点已交付基线）。

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| R17-1 隐私（2026-10-12 复核修订） | `getCategoryHotBookmarks` 仅剔除 `is_private`；匿名由后端预过滤私密子树，不再在客户端套 `publicCategoryIds`（否则空私密一级聚合恒空）；§6.1 私密书签剔除 + 私密一级保留公开子分类用例 |
| 默认选择改动破坏现有 tab/scroll-spy | 只改空一级分支（非空一级默认仍 root，无变化）；更新 `homeNavigation` 用例；L2 验证 tab 切换与标题回选 |
| R17-3 重复渲染/图标预算 | 允许重复（OQ-17.5）但 L3 `perf:audit` 复测；聚合复用 `CategorySection`/图标缓存口径，不新建渲染路径 |
| R17-5 冷启动回填非频次 | 文案「常用」+ 回填为 `sort` 顺序；验收说明如实描述，不宣称冷启动即高频 |
| DEV-17-C 来源 chip 破版 | 可选 prop、默认关闭；L2 按卡片最小宽度验证；若详情卡窄档放不下，降级为 `title`/tooltip 承载来源名（不占布局），在实现时按 L2 结果定并记录 |
| 新鲜度误解 | FR-17.7：仅本页即时 + 刷新重算；文档/验收标注跨设备 ≤~120s 缓存滞后，不改缓存 |

## 8. 实现陷阱（仓库特有，必须遵守）

- **Svelte 5 组件测试解析条件**：`Home` jsdom 测试依赖 `vite.config.ts` test 模式 `resolve.conditions:['browser']`（`CONTRIBUTING.md` §4）；`scrollIntoView`/`scrollTo` 需 stub（见 `homeCategoryFocus.test.ts`）。观察不到行为先查解析条件，再下结论。
- **写入后缩进自检**：`write`/`edit` 可能把缩进减半（JS/TS 不报错）。每次改 `src/lib/homeData.ts` 后 `git diff --numstat`（只加几行却大量删行=重排）+ 前导空格直方图应全偶，异常按 `n→n*2` 修复复验（`homeData.ts`/`adminListState.ts` 曾复现）。
- **不改入参**：`getCategoryHotBookmarks` 必须像 `getMostVisitedBookmarks` 一样返回新数组、不 mutate `categoryBookmarks` 的桶（否则污染全局渲染）。单测断言源数组不变。
- **选择默认改动的连带**：`resolveHomeCategoryForRoot` 被 `getHomeCategoryGroups`、`updateActiveRootFromScroll`（`Home.svelte:325`）、`handleScopeSelect` 共用；改默认分支后逐一核对 scroll-spy `activeId` 与 tab `aria-selected` 不错乱（L2）。

## 9. 独立复核与提交安全门

- REQ-17 属**多文件 + 行为/关键用户流程 + 隐私口径**改动，阶段完成并直接自验后走独立 `workflow-reviewer`：输入原始目标、需求 §6 验收、实际 diff、L0/L2/L3 证据；`PASS` 才交付。
- 每阶段独立提交（`feat:` 主题，本地条目无 Issue 不带关闭关键字、成果记 `CHANGELOG.md`）。提交前过 `CONTRIBUTING.md` §7 / `AGENTS.md` 安全门：精确路径 `git add --`、`--name-only/--stat/--check`、完整暂存差异 + 敏感内容扫描、大文件门、分支/身份/远端分叉检查。
- 开工与提交推送均需维护者当轮显式授权；默认只留本地 worktree。

## 10. 完成定义（DoD）

1. §2 清单落地，§5 四阶段门逐项通过；
2. 需求 §6 验收 A17-1~A17-8 达成或显式豁免（尤其 A17-7 永不空区、A17-8 刷新一致不轮询、A17-3 私密不泄漏）；
3. 用户实测的「首个子分类为空→整块空态」场景经 jsdom + L2 复测已消除；
4. L2 截图（含来源 chip 最小宽度、匿名/登录对比、刷新一致）+ L3 `perf:audit` 不回归记录；
5. BACKLOG（§5 转状态）/ CHANGELOG 回写；
6. 无 schema/API 改动、`getCategoryHotBookmarks` 不 mutate 入参、无新增轮询/实时监听。
