> **STATUS: 进行中**（判定于 2026-10-15）——需求已定稿并经维护者裁定（2026-10-11），但开工仍需显式批准，尚未进入 BACKLOG 排期。

# Issue #31 第 1、2 点需求：分类视觉自定义扩展与一级分类高频聚合（REQ-16 / REQ-17）

> 状态：**需求已定稿；§4 各 OQ 于 2026-10-11 由维护者裁定，OQ-17.6 于 2026-10-12 实现复核后修订**（见 FR-17.6 / OQ-17.6 行）。开工仍需维护者显式批准；获批后进入 `docs/BACKLOG.md` §5 排期，实现进度回写 `CHANGELOG.md`。
> 来源：[Issue #31](https://github.com/lbjxr/CF-Navs/issues/31)「建议增强界面元素自定义…」（`bug`,`enhancement`，报告者 @gittiging，2026-10-10）第 1、2 点。维护者 2026-10-11 回复「第一点和第二点我这边会记录下再次优化」，视为已获记录意向，**未承诺排期**；开工仍以维护者显式确认为准。
> 建议编号：第 1 点 → `REQ-16`，第 2 点 → `REQ-17`（沿用 `REQ-NN` 序列；`REQ-01`~`REQ-15` 已占用、`REQ-12` 预留给 #15，`16/17` 为下一个空号）。编号由维护者确认后生效。
> 基线：按当前 `develop` 源码符号核对（`shared/types.ts`、`src/lib/homeData.ts` 等已逐符号读取）；行号可能随后续改动漂移，以符号名为准。

## 0. 范围与边界

- 本文只覆盖 Issue #31 的**第 1 点（界面元素自定义，重点字体颜色）**与**第 2 点（一级分类展示二级分类高频标签）**，两者是互相独立的需求，可分别排期。
- **第 3 点（150+ 书签卡顿、首页图标请求性能）不在本文**：已由 `docs/plans/ICON_REQUEST_PERFORMANCE_DEVELOPMENT.md` / `ICON_REQUEST_PERFORMANCE_TASK_LIST.md` 承载，且该计划已明确「首页视觉定制、二级分类高频入口不在其范围内」。维护者评论称 v0.8 已对第 3 点优化。
- 本文不修改源码、数据库、API 或云端 Issue；实现时以当时的源码、共享类型与测试为准。
- 下文各节「§4 已裁定决策」记录维护者 2026-10-11 的产品裁定；实现以此为准，不再重新开放，除非维护者显式推翻。

---

## REQ-16：界面元素自定义扩展（分类字体颜色等视觉属性）

### 1. 目标

把「界面上可见元素的视觉自定义权限」更多交给后台管理员。Issue 原文举的具体例子是**一级分类、二级分类的字体颜色**，并泛指「所能看到的界面上的元素」。

**范围裁剪建议**：「所有可见元素都可自定义」是开放式诉求，无法作为可验收契约。本需求把首版收敛为**分类标题的字体颜色**（一级 / 二级），其余元素（计数徽标、二级 tab、导航文字、空态文案、操作按钮等）是否纳入由 §4 OQ-16.2 裁定。颜色之外的其它属性（字号、图标尺寸）已由历史 R-06 的 `category_display` 覆盖，不重复开。

### 2. 现状事实（实现基线）

| 事实 | 锚点 |
| --- | --- |
| 设置是全局管理员配置（D1 `settings(key,value)` JSON 键值表），**不是分类实体属性**；分类实体 `Category` 只有 id/parent_id/title/icon/私密/排序，无颜色字段 | `schema.sql:5-20,51-54`；`shared/types.ts:8-21`；`CategoryUpsertReq` 无颜色 `shared/types.ts:326-330` |
| `category_display` 当前只有 4 个**按层级的尺寸**字段，**无颜色**：`root_font_size`/`root_icon_size`/`child_font_size`/`child_icon_size` | `shared/types.ts:118-123` |
| 已有颜色类设置都是**全局单值**，语义各异：`site_title_color`、`card_background_color`、`card_text_color`、`custom_accent_color`/`custom_dark_accent_color`（后者分浅/深两值） | `shared/types.ts:145,151-152,165,168` |
| 首页分类标题/文字当前走**一个共享文字色** `--home-text-color`（浅色回退 `#0f172a`、深色 `#e5eefb`），不是按层级分别着色 | `src/views/Home.svelte:735-747,780-788`；`CategorySection.svelte:306-324`；`HomeCategoryScope.svelte:354-355,503-506` |
| 激活/焦点态另用 `--home-accent-color`（强调色），与文字色分离 | `HomeCategoryScope.svelte:518-538`；`Sidebar.svelte:665-700` |
| `card_text_color` 非空时同时作标题色+描述色（覆盖主题），为空才用预设的浅/深差异——即「空值跟随主题、非空固定」模式 | `src/lib/appData.ts:283-310` |
| 颜色字段的服务端校验很弱：只做字符串类型+长度限制，**不校验颜色语法** | `worker/routes/settings.ts:75-76,113-114,131-132`；`worker/lib/settingsLimits.ts:13-17`；`docs/reference/API_CONTRACT.md:242,262,265` |
| 已有颜色交互组件 `ColorAlphaInput` + `parseCssColor`/`splitCssColorAlpha` 可复用；文本框仍可写入任意字符串 | `src/components/ColorAlphaInput.svelte:43-111`；`src/lib/color.ts:1-151` |
| 设置新字段必须贯通的链路（缺一不可）：`Settings` → `PublicSettings` → `SETTINGS_KEYS`/`PUBLIC_SETTINGS_KEYS` → client 表单 clone/create/normalize → shared 归一化 → Worker default/read/write → D1 seed | `shared/types.ts:143-176`；`shared/settings.ts:62-167`；`src/lib/settingsForm.ts:58-339`；`worker/lib/settingsData.ts:15-181`；`worker/routes/settings.ts:176-205`；`schema.sql:59-89` |
| 分类尺寸经 `--category-root-*`/`--category-child-*` CSS 变量从 `Home.svelte` 派生，被 CategorySection / HomeCategoryScope / Sidebar / 全页搜索分组 / SettingsHomePreview 统一消费；**快捷 Spotlight 不消费该变量**（独立固定字号） | `src/views/Home.svelte:150-168`；`CategorySection.svelte:88-99,254-372`；`HomeCategoryScope.svelte:163-544`；`Sidebar.svelte:491-549`；`SearchSpotlight.svelte:384-398` |
| 设置面板 8 个二级菜单；分类视觉设置（`CategoryDisplaySettingsSection`）当前嵌在「高级与视觉」分区 | `src/components/SettingsPanel.svelte:35-42`；`AdvancedSettingsSection.svelte:48-192`；R-06 落点记录 `docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:250-252` |
| 主题系统有亮/暗/跟随系统三态，叠加浏览器本地偏好；`document.documentElement.dataset.theme` 驱动 | `shared/types.ts:88-89`；`src/lib/appThemeState.ts:17-30`；`src/App.svelte:294-306`；`src/app.css:1-56` |
| 设置页实时预览只有 2 个根级示例，**不渲染真实二级 tab / 子分类样本**；二级（child）变量目前「已注入但无完整可视回归样本」 | `SettingsHomePreview.svelte:12-16,68-79,151-168` |

### 3. 需求子项

> `FR-16.x` 依 §4 已裁定决策给出实现约束。

- **FR-16.1 新增颜色设置字段**：按「一级标题色 + 二级标题色」两个全局字段落地（OQ-16.1 已裁定：按层级全局，不做每分类覆盖）。字段贯通 §2 表最后一行列出的**全部链路**，不能只改 UI。新字段加入 `PublicSettings` 白名单（分类色属前台可见视觉，须进公开投影）。
- **FR-16.2 消费链路**：新色经新增 CSS 变量（如 `--category-root-title-color` / `--category-child-title-color`）从 `Home.svelte` 派生，被 CategorySection / HomeCategoryScope / 全页搜索分组 / SettingsHomePreview 消费。OQ-16.2 已裁定：**首版仅改一级/二级标题文字**，不覆盖导航 / 图标 fallback / 计数徽标 / 空态 / 操作按钮，Spotlight 不纳入；激活 / 焦点仍用 `--home-accent-color`。空值时**回退到现有 `--home-text-color`**（跟随主题），非空时为固定值。
- **FR-16.3 设置 UI**：控件放入「高级与视觉」分区的分类视觉组（`CategoryDisplaySettingsSection` 旁），复用 `ColorAlphaInput`；每个控件有可访问名称、支持清空回退默认。
- **FR-16.4 校验与归一化**：新颜色字段的 client/shared/Worker 三段归一化与**现有颜色字段口径一致**（字符串+长度限制，空值回退）。OQ-16.5 已裁定：**沿用现有弱校验、不收紧为仅 hex/rgb/rgba**，避免与既有颜色字段形成双标准。
- **FR-16.5 实时预览补齐**：预览须能展示真实二级 tab / 子分类样本，使一级/二级颜色差异在预览中可见（当前预览无二级样本，是已知缺口）；并随亮/暗主题切换验证对比度。

### 4. 已裁定决策（2026-10-11）

| 编号 | 决策点 | 裁定（2026-10-11） | 影响 |
| --- | --- | --- | --- |
| OQ-16.1 | **作用域**：按层级全局（一级色/二级色各一个），还是每个分类独立覆盖？ | 按层级全局（与 R-06 `category_display` 的「按层级全局、不做每分类覆盖」一致） | 决定放进 `category_display`/新设置键，还是放进分类实体 + `CategoryEditModal` |
| OQ-16.2 | **覆盖哪些元素**：仅一级/二级标题文字，还是连同图标 fallback、计数徽标、二级 tab、左/顶部导航、全页搜索分组、空态、操作按钮？Spotlight 是否纳入？激活/hover/focus 是否仍用强调色？ | 首版只改**一级/二级标题文字**；激活/焦点仍用 `--home-accent-color`；Spotlight 暂不纳入 | 决定新增变量数量与消费点数量 |
| OQ-16.3 | **主题语义**：单个固定色；浅/深两套色；还是「跟随主题/自动对比度 + 可选覆盖」？ | 单固定值 + 空值跟随主题（与 `site_title_color`/`card_text_color` 一致） | 单值在深/浅切换下可能对比度失效；两套值像 accent 那样需成对字段 |
| OQ-16.4 | **与卡片文字色关系**：分类标题色是否独立于 `card_text_color`？是否允许 alpha？ | 独立字段；允许 alpha（复用 `ColorAlphaInput`） | 独立=语义清晰但多两个字段 |
| OQ-16.5 | **校验强度**：沿用现有「字符串+长度」弱校验，还是收紧为仅 hex/rgb/rgba？ | 沿用现有口径（避免与既有颜色字段双标准） | 收紧需同时改三段归一化与 API 契约 |
| OQ-16.6 | **「所有界面元素」边界**：是否只做分类颜色，把其它元素留作后续？ | 首版只做分类标题色，其余元素另行立项 | 防止开放式范围无法验收 |

### 5. 不做的事

- 不新增分类**字号/图标尺寸**设置（R-06 已覆盖）。
- 不做每个分类独立颜色（除非 OQ-16.1 裁定推翻建议默认）。
- 不触碰 Issue #31 第 3 点性能范围、不改 `card_size`/`card_icon_size` 等既有几何设置。
- 不引入新依赖、不新建一套与现有颜色字段并行的校验协议。

### 6. 验收清单

- A16-1 修改一级/二级标题色后，首页、全页搜索分组、设置预览**同步更新**，刷新后保持（走 `PublicSettings`）。
- A16-2 清空颜色值 → 回退到主题派生色（`--home-text-color`）；亮/暗主题切换下文字始终可读（人工对比度确认）。
- A16-3 一级/二级两个字段**互不误写**，且不改分类标题文字、图标内容或父子关系。
- A16-4 非法/空/旧数据缺字段 → 一致回退安全默认；保存失败不覆盖已存值（client/shared/Worker 三段同口径）。
- A16-5 现有锁定 `category_display` 默认/边界与「高级与视觉」菜单归属的单测（`tests/unit/settingsData.test.ts`、`settingsForm.test.ts`、`adminSettingsLayout.test.ts`）扩展同类契约，而非另建协议。

### 7. 风险

- R16-1 **主题对比度**：单固定色在深/浅主题下可能不可读（见 `card_text_color` 既有模式）。缓解：空值跟随主题 + 预览强制验证两主题。
- R16-2 **链路遗漏**：新设置字段漏改任一段（公开投影/归一化/seed）会导致前台读不到或旧库崩默认。缓解：按 §2 表最后一行逐段核对 + 单测。
- R16-3 **范围蔓延**：「所有元素可定制」若不收敛，无法验收。缓解：OQ-16.6 收敛到分类标题色。

---

## REQ-17：一级分类聚合展示二级分类的高频访问标签

### 1. 目标

当一个一级分类**自身无直属书签、书签都分散在其二级分类下**时，该一级分类区当前的行为取决于它**排序第一个子分类**是否有书签：首个子分类有书签 → 显示该**一个**子分类的全部书签；首个子分类为空 → 面板直接显示空态「这个分类下暂时还没有可展示的书签」，**即使该一级下其它二级分类有大量书签也不显示**（已实测确认，见 §2）。两种结果从美观和实用上都不理想——用户反馈的正是后一种。需求：在这种一级分类里，聚合展示其子树下的**常用书签**，类似现有「经常访问」区块。**选择模型已与维护者对齐（2026-10-11）**：Issue 原文是「高频访问标签」而非「全量二级书签」，全量展开会占用过多行，故采用**频次优先 + 封顶 + 低点击回填**（详见 FR-17.1 / FR-17.4），保证该区在子树非空时永不为空。

### 2. 现状事实（实现基线）

| 事实 | 锚点 |
| --- | --- |
| 访问频次是 **D1 持久化 `bookmarks.click_count`**（非 localStorage）；点击经 `incrementBookmarkClick`（`WHERE id=? AND is_private=0`）自增，前端同时做内存乐观更新 | `schema.sql:18-35`；`worker/lib/db/bookmarks.ts:333-339`；`BookmarkCard.svelte:360-362`；`src/lib/stores.ts:84-92` |
| 「经常访问」是**纯客户端数组过滤/排序/截断**：`getMostVisitedBookmarks(items, limit)` —— `click_count>0`、排除私密、按 `click_count desc, sort, id` 排序后 slice；**无 `category_id`/子树参数** | `src/lib/homeData.ts:94-110` |
| 首页用合成 `MOST_VISITED_CATEGORY`(id=-1) 交给 `CategorySection` 渲染（`showEmpty=false`），**没有独立 MostVisited 组件**；数量由 `settings.most_visited_count`（0–20，为 0 则空）控制 | `src/views/Home.svelte:45-50,129-132,558-575`；`HeroSettingsSection.svelte:28-36` |
| 分类最多两层：`parent_id=NULL` 为一级，非空为二级；书签只存**一个 `category_id`**；一级与二级**都可直接挂书签** | `schema.sql:5-20`；`shared/types.ts:8-25`；`docs/reference/CATEGORY_HIERARCHY_DESIGN.md:9-16,102-118` |
| 书签按 `category_id` 分桶（`groupBookmarksByCategory`）；一级树总数 = 自身桶 + 各子桶之和（`getCategoryTreeBookmarkCount`） | `src/lib/homeData.ts:79-88,112-121` |
| **已有「空一级」兜底，但只是机械选首个子分类、非高频聚合**：一级自身桶为空且有子分类时，`resolveHomeCategoryForRoot` **无条件**默认选中 `root.children[0]`（按 sort/id 的第一个子分类，与 `click_count` 无关），面板只渲染**该一个**子分类的书签。**实测确认**（jsdom 渲染 `Home.svelte`）：首个子分类有书签 → 显示其全部书签；首个子分类为空 → 面板显示空态文案，**其它有书签的二级分类不显示** | `src/lib/homeData.ts:179-194`；`src/views/Home.svelte:583,661-664`；空态 `src/components/CategorySection.svelte:236`；锁定测试 `tests/unit/homeNavigation.test.ts:107-118` |
| 空一级（自身+所有子均空，或显式选中空子）→ `CategorySection` 以 `showEmpty=true` 渲染「这个分类下暂时还没有可展示的书签」 | `src/components/CategorySection.svelte:15-16,235-236` |
| 服务端公开/登录 SQL 都带回 `click_count`，但**无按分类子树的过滤/排序**；匿名用公开 SQL + 分类祖先可见性过滤，登录态取全量不做该过滤 | `worker/lib/db/sql.ts:11-20`；`worker/lib/db/aggregates.ts:27-49` |
| `getMostVisitedBookmarks` 只排除**书签自身** `is_private`，**不检查分类祖先私密性**；登录聚合含私密分类树 → 管理员与匿名看到的高频构成可能不同 | `src/lib/homeData.ts:94-110`；`worker/routes/public.ts:131-169` |
| 点击**不提升 `data_version`**（避免每次点击使公开聚合缓存整体失效），公开数据可被 edge cache 以 `s-maxage=120/swr=300` 复用 → 高频排名**不承诺跨设备/跨边缘即时一致** | `worker/routes/public.ts:199-268` |
| Spotlight 空查询固定 top 8（`MOST_VISITED_LIMIT`），不读 `most_visited_count` | `src/components/SearchSpotlight.svelte:23-43` |

### 3. 需求子项

- **FR-17.1 聚合取数（纯客户端优先，频次优先 + 回填）**：`/api/public/data` 已返回当前身份可见的全量书签（含 `category_id`/`click_count`），首版在 `src/lib/homeData.ts` 新增 helper（如 `getCategoryHotBookmarks(root, categoryBookmarks, limit)`）：① 收集该一级**整个子树** id = `[root.id, ...root.children.map(id)]` 的书签；② 剔除私密书签（`is_private`），按 `click_count desc, sort, id` 取 `click_count>0` 的前 N；③ 命中不足 N 时，用子树内剩余书签按 `sort, id` **回填**到 N（回填项不要求有点击）。满 N 即止、子树非空时结果非空。**不改 D1 schema 或 API**。
- **FR-17.2 触发条件**：仅在「一级自身直属桶为 0 且存在至少一个有书签的子分类」时启用聚合（OQ-17.1 已裁定）；一级自身有书签时保持现有「本分类=直属书签」语义。
- **FR-17.3 展示形态**：复用 `CategorySection` 渲染一个合成的「常用」区（与现有 MostVisited 同模式，复用 `BookmarkCard`、公开分类 id、私密图标授权），不新建卡片组件；OQ-17.4 已裁定：区块标题用**一级分类名 + 「常用」副标题**，卡片**标注来源二级分类名**。
- **FR-17.4 数量与排序（2026-10-12 复核修订）**：上限改用固定常量 `CATEGORY_HOT_LIMIT`（`src/lib/homeData.ts`，当前 12），**与全局「经常访问」`most_visited_count` 解耦**，不随全局数量缩放；排序为「频次优先、同票 `sort/id`，回填段按 `sort/id`」。因此 `most_visited_count=0` **不再**隐藏分类聚合区（两者独立）。原「复用 `most_visited_count`、`=0` 隐藏」见 OQ-17.3 修订说明。
- **FR-17.5 选择态**：用户点二级 tab 后替换为该子分类内容；OQ-17.5 已裁定：手动选回一级「本分类」时**显示聚合区**；全局 Most Visited 已出现的书签**允许**在一级聚合区重复。
- **FR-17.6 隐私口径（OQ-17.6 已裁定，2026-10-12 复核修订）**：聚合剔除私密书签（`bookmark.is_private`），与公开「经常访问」一致。**不再按匿名公开可见集（`publicCategoryIds`/祖先规则）过滤**：入参 `categoryBookmarks`（= `allCategoryBookmarks`）已按当前视图过滤——匿名由后端 `/api/public/data` 剔除私密分类及其整棵子树，管理员为全量。原裁定「管理员也套用匿名公开可见集」会把管理员正在查看的**私密一级分类**旗下公开子分类书签整体丢弃，使空私密一级聚合区恒为空（用户在测试站以私密「学校」一级 + 公开子分类「铜陵」高频书签实测报告）。匿名侧因数据已预过滤不受影响、不泄露私密；管理员侧与其子分类 tab 实际可见内容一致。
- **FR-17.7 新鲜度（OQ-17.7 已裁定）**：不做轮询或实时推送。点击设备本页通过内存乐观更新即时重排；其它设备在**刷新页面**后按重新拉取的数据重排。跨设备刷新新鲜度受现有公开数据缓存 TTL 约束（浏览器 `max-age=30` / edge `s-maxage=120` / `swr=300`），最多滞后约 2 分钟；**不改缓存、不让点击提升 `data_version`**（否则回退 #31 第 3 点性能优化）。

### 4. 已裁定决策（2026-10-11）

| 编号 | 决策点 | 裁定（2026-10-11） | 影响 |
| --- | --- | --- | --- |
| OQ-17.1 | **何时出现**：仅「一级直属为空且有二级」时，还是所有有二级的一级都加「高频」入口？一级有直属书签时是否仍聚合？ | 仅「一级直属为空且有二级」时启用；一级非空保持现状 | 决定触发判定与是否出现双区（直属区+聚合区） |
| OQ-17.2 | **取数范围与零点击处理**：取整个子树还是仅二级直属？`click_count=0` 的书签如何处理？ | 取整个一级子树（含一级直属，触发时通常为空）；**不硬排除零点击**——频次优先取前 N，不足则按 `sort` 回填，确保非空（已对齐） | 回填保证冷门一级也有内容；纯频次过滤会让从未点击的一级重新变空 |
| OQ-17.3 | **数量设置**：复用 `most_visited_count` 还是新增「一级高频数量」独立设置？`=0` 是否隐藏？ | ~~复用 `most_visited_count` 作每个一级上限，`=0` 隐藏聚合区~~ **2026-10-12 复核修订**：与全局解耦，改用固定常量 `CATEGORY_HOT_LIMIT`（当前 12），不加后台设置；`most_visited_count=0` 不再隐藏分类聚合区（用户要求去掉继承，只设最大显示条数） | 分类聚合数量不再随全局缩放；若日后需管理员可调，再升级为独立设置 |
| OQ-17.4 | **展示语义**：区块标题用「经常访问」「子分类常用」还是一级分类名？卡片是否显示来源二级名/路径？ | 标题复用一级分类名 + 副标题「常用」；卡片显示来源二级名 | 影响用户是否误以为卡片直属一级 |
| OQ-17.5 | **重复与选择**：全局 Most Visited 已显示的书签能否再现于一级聚合区？手动选回一级「本分类」显示什么？ | 允许重复（与现状「全局区与分类区可重复」一致）；选回一级显示聚合区 | 重复会增加 DOM/图标加载（与第 3 点性能耦合，但第 3 点不在本文范围） |
| OQ-17.6 | **登录/匿名口径**：管理员登录后是否仍严格用匿名公开可见集？私密书签是否永远排除？是否与 `getPublicCategoryIds` 完全一致？ | ~~严格用公开可见集，私密永远排除，祖先规则与 `getPublicCategoryIds` 一致~~ **2026-10-12 复核修订**：仅剔除私密书签（`is_private`），**不再**按 `publicCategoryIds`/祖先可见集过滤（入参数据已按视图预过滤） | 原裁定会使管理员查看的空私密一级聚合区恒为空；修订后匿名因数据预过滤仍不泄露私密，管理员与子分类 tab 可见内容一致 |
| OQ-17.7 | **新鲜度**：实时 / 刷新后一致 / 可滞后？是否轮询监听？ | **刷新后一致、不轮询**：点击设备即时乐观重排，其它设备刷新页面后按新数据重排；跨设备刷新受现有缓存 TTL 约束最多滞后 ~2 分钟，**不改缓存、不提升 `data_version`** | 要消除 ~2 分钟滞后须降 edge TTL 或点击提升 `data_version`，两者都回退 #31 第 3 点性能，故不做 |
| OQ-17.8 | **范围边界**：仅首页普通模式，还是同时覆盖全页搜索/Spotlight/Sidebar 计数/排序模式？ | 仅首页普通模式 | 排序模式仍显式渲染空投放区，不叠加聚合 |

### 5. 不做的事

- 不改 D1 schema / 聚合 SQL / `/api/public/data` 契约（首版纯客户端派生即可满足；除非 OQ 决定要服务端子树排序）。
- 不新建访问计数来源（复用 `click_count`），不引入 localStorage 频次。
- 不改点击不提升 `data_version` 与现有 edge cache 语义（新区域只承诺与当前聚合数据一致）。
- 不碰 Issue #31 第 3 点性能工作；但实现时须注意聚合会增加重复卡片/图标渲染这一耦合。
- 不改排序模式的空分类投放区行为。

### 6. 验收清单

- A17-1 一级直属为空、有二级且二级**有点击数据** → 一级区显示跨所有子分类按 `click_count` 降序的聚合高频列表（复用稳定 tie-break、至多 N 条），**取代**现状「只渲染排序第一个子分类（可能为空）的内容」。
- A17-2 聚合至多显示 `CATEGORY_HOT_LIMIT` 条（当前 12，约 1–2 行），与全局 `most_visited_count` 无关；全局设为 0 不影响分类聚合区。
- A17-3 **私密不泄漏（2026-10-12 复核修订）**：匿名只消费后端 `/api/public/data` 已过滤的数据（私密分类及其整棵子树不在 payload 内），聚合区绝不出现私密分类子树书签；管理员为全量数据，聚合区会显示其正在查看的私密一级分类旗下**非私密**书签，与该子分类 tab 实际可见内容一致。两态构成**不要求一致**（管理员本就处处可见私密内容）；聚合始终剔除 `is_private` 书签。
- A17-4 点二级 tab → 替换为该子分类书签；选回一级 → 显示聚合区（按 OQ-17.5）；全部为空 → 普通空态文案。
- A17-5 聚合 helper 有单测锁定：子树过滤范围、私密排除、`click_count desc/sort/id` tie-break、空集回退；与现有 `homeNavigation.test.ts` 的空一级 fallback 契约不冲突（或按新行为更新该测试）。
- A17-6 真实浏览器（L2）：150+ 书签 / 10 一级 / 6 二级规模下，空一级分类正确显示聚合、点击重排、无横向溢出；匿名态私密一级不渲染，管理员态私密一级旗下公开子分类书签正确聚合。
- A17-7 **永不空区**：一级直属为空、二级有书签但**全部零点击**时，聚合区按 `sort` 回填显示前 N 条（而非现状空态）；子树确实无任何书签时才显示普通空态。
- A17-8 **刷新一致、不轮询**：另一设备点击某书签后，本设备**刷新页面**后聚合排序反映到新 `click_count`（受公开数据缓存 TTL ≤~120s 约束）；页面不发起轮询或实时监听。

### 7. 风险

- R17-1 **隐私口径（2026-10-12 复核修订）**：聚合仅剔除书签自身 `is_private`，**不**在客户端按 `publicCategoryIds`/祖先可见集过滤。匿名安全由后端预过滤保证（私密分类子树不进入 payload）；若误加祖先过滤，会把管理员正在查看的私密一级旗下公开子分类书签整体丢弃，使聚合区恒空（本次线上缺陷根因）。单测锁定：私密书签剔除、私密一级旗下公开子分类书签保留。
- R17-2 **跨设备刷新滞后（已接受）**：点击不提升 `data_version` 且公开数据 edge 缓存 `s-maxage=120`，故另一设备刷新后最多约 2 分钟才反映最新排名；点击设备本页即时。按 OQ-17.7 裁定接受该滞后，不改缓存；要更快须另定缓存策略并评估对 #31 第 3 点性能的影响。
- R17-3 **重复渲染/性能耦合**：聚合区与全局 Most Visited、普通分类可能重复同一书签，增加图标请求（第 3 点性能预算关注项）。缓解：OQ-17.5 明确是否去重；实现后按现有 `perf:audit` 复测图标请求预算。
- R17-4 **语义漂移**：触发条件若只按「当前为空」判定，一级日后新增直属书签后聚合语义会变。缓解：OQ-17.1/17.2 把触发与取数范围写死。
- R17-5 **回填项非频次**：冷门一级（子树零点击）聚合区按 `sort` 回填，展示的是「排在前面的」而非「最常用的」书签，直到产生点击数据后自动切换为频次排序。这是刻意取舍（宁可展示靠前项也不留空区），验收说明须如实描述，不宣称冷启动即为「高频」。

---

## 共同约束与验证策略

### 实施顺序（阶段化）

两个需求相互独立，可分别排期；若同轮实现且都改 `Home.svelte` / `src/lib/homeData.ts` / 设置链路，须**串行**，避免并发改同一文件。

1. REQ-16：设置字段贯通（类型→公开投影→归一化→seed→表单）→ CSS 变量派生与消费 → 设置 UI + 预览补齐 → L0 单测。
2. REQ-17：`homeData.ts` 聚合 helper + 单测 → `Home.svelte` 触发与渲染接线 → L2 真机规模验证。
3. 收尾：文档回写（本文状态、`BACKLOG.md` §5、`CHANGELOG.md`）。

### 验证分层

- **L0（每阶段）**：`type-check` / `test` / `build` / `git diff --check`。REQ-16 新增颜色归一化、公开投影、表单回填单测；REQ-17 新增聚合 helper（子树过滤/私密/tie-break/空集）单测。
- **L2（真实浏览器）**：REQ-16 一级/二级颜色在首页/全页搜索/预览生效、亮暗切换对比度；REQ-17 空一级聚合、点击重排，匿名态私密一级不渲染、管理员态私密一级旗下公开子分类书签正确聚合（两态构成不要求一致，见 A17-3）。按 `real-chrome-cdp-testing` 用隔离临时 Chrome + 精确 profile 清理。
- **L3**：REQ-17 实现后按现有 `perf:audit` 复测图标请求/缓存预算（因聚合增加卡片渲染），确认不回归第 3 点已交付的性能。

### 文件所有权（预判，实现时以当时源码为准）

| 需求 | 预计改动 |
| --- | --- |
| REQ-16 | `shared/types.ts`、`shared/settings.ts`、`worker/lib/settingsData.ts`、`worker/routes/settings.ts`、`worker/lib/settingsLimits.ts`、`schema.sql`、`src/lib/settingsForm.ts`、`src/components/settings/CategoryDisplaySettingsSection.svelte`(或新组件)、`src/views/Home.svelte`、`CategorySection.svelte`、`HomeCategoryScope.svelte`、`SettingsHomePreview.svelte`、`docs/reference/API_CONTRACT.md`、相关单测 |
| REQ-17 | `src/lib/homeData.ts`、`src/views/Home.svelte`、（视 OQ）`src/components/CategorySection.svelte`、相关单测；仅在 OQ 决定服务端排序时才涉 `worker/` 与 API |

> §4 各 OQ 于 2026-10-11 由维护者裁定（含 OQ-17.7 的「刷新后一致、不轮询、接受 ≤~120s 缓存滞后」）；其中 **OQ-17.6 隐私口径于 2026-10-12 实现复核后修订**（聚合仅剔除 `is_private`，不再客户端套匿名可见集，见 FR-17.6 / OQ-17.6 / A17-3 / R17-1）。**开工仍需维护者显式批准**；获批后再进入 `BACKLOG.md` §5 排期。本文不代表 Issue #31 第 1、2 点已承诺实现。
