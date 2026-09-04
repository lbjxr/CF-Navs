# 需求开发任务清单

> **状态：证据与决策记录，不维护待办状态。** 本文保留每条 `REQ-NN` 的需求来源、源码核对证据和「已实现 / 尚未实现」判断，供后续回溯。
>
> **当前待办与状态一律看 [本地待办清单](../BACKLOG.md)**；工程规则看 [CONTRIBUTING.md](../../CONTRIBUTING.md)。本文不再维护进度表或完成名单。
>
> - 核对日期：2026-09-03；核对基线：`develop` 分支当时的工作树。所有「未实现」结论都是 grep + 逐符号静态核对得出，该轮未运行任何构建、测试或浏览器套件。
> - **重要前置**：`REQ-01`~`REQ-11` 全部源自 `plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md`，该文档状态是「需求评估，尚未实现」，**不能直接当作已批准的实现清单**，逐项都需要明确批准才可开工。
> - 本文里形如 `file.ts:123` 的行号引用来自当时的工作树，**可能已经腐烂**；以符号名和上下文为准。
> - 配套文档：缺陷、验收欠账与风险见 [问题处理任务清单](PROBLEM_HANDLING_TASK_LIST.md)。

---

## 1. 编号与范围口径

- 本文编号统一用 `REQ-NN`，**不占用**既有原生编号（`R-01`~`R-08`、`FR-*`、`OQ-*`、`T*`）。每条在「来源映射」列回指原生编号。
- 收录标准：有明确需求来源 + 当前源码确认**尚未实现或仅部分实现**。
- 不收录：已实现的功能（见 §2）、被需求文档明确驳回的条目（见 §5，仅列出以防重复提案）、待用户决策的开放问题（见 §4）、缺陷与验证欠账（属问题清单）。
- 优先级沿用来源文档的阶段划分与依赖顺序，不是产品价值排序。

### 任务分布

| 组 | 条目 | 数量 | 来源 |
| --- | --- | --- | --- |
| A 检索链路（Spotlight） | REQ-01 | 1（含 6 个子项） | `FR-1.1`~`FR-1.6` |
| B 首页操作可发现性 | REQ-02、REQ-03 | 2 | `FR-2.1`、`FR-2.2` |
| C 录入路径 | REQ-04、REQ-05、REQ-06 | 3 | `FR-3.1`~`FR-3.3`、`FR-3.5` |
| D 视觉令牌与配色 | REQ-07、REQ-08、REQ-09 | 3 | `FR-4.1`~`FR-4.3` |
| E 图标渲染 | REQ-10、REQ-11 | 2 | `FR-5.1`、`FR-5.2` |
| F 云端新增需求 | REQ-12 | 1 | Issue #15 |

### 已闭环的条目

`REQ-08`（13 套毛玻璃预设逐套强调色）已在 2026-09-03 实现，用户确认接受该视觉变动。其余条目的当前状态见 [本地待办清单](../BACKLOG.md)。

---

## 2. 已实现，不要重复开发

核对中反复出现「草案假设不存在，源码其实已有」的情况。以下能力**已有源码实现证据**，任何新方案都必须接入而不是重建。

### 2.1 R-01 ~ R-08（Issue 需求，全部有实现证据）

| 编号 | 需求 | 实现证据 | 备注 |
| --- | --- | --- | --- |
| `R-01` | 一级→二级跨分类移动与排序 | `src/views/Home.svelte:187-201`（transfer 更新源/目标顺序）、`:203-211`（菜单移动草稿）、`:215-237`（保存/冲突）、`:572-596`（root+children 统一 sort 组）；`src/components/CategorySection.svelte:170-196`；`src/components/BookmarkCard.svelte:419-442`（仅排序态显示移动入口）；`worker/routes/bookmarks.ts:172`（reorganize + CONFLICT） | 云端 #10 仍 Open |
| `R-02` | 首页新建子分类 | `src/components/HomeCategoryScope.svelte:74-85`；`src/App.svelte:627-644,674-690` | 移动端形态差异见 `PROB-11` |
| `R-03` | 首页新增主分类 | `src/components/HomeFloatingActions.svelte:90-100`；`src/App.svelte:646-647` | 入口位置差异见 `PROB-12` |
| `R-04` | 编辑书签时分类选择器定位当前项 | `src/components/BookmarkBaseFields.svelte:21-24`；`src/components/CategoryTreeSelect.svelte:45-56`；`src/lib/categorySelect.ts:72-90` | 焦点缺口见 `PROB-03` |
| `R-05` | 后台批量移动书签 | `shared/types.ts:378-398`；`src/lib/api.ts:374-378`；`worker/routes/bookmarks.ts:114-169`；`src/components/admin/BookmarkListPanel.svelte:65-77,147-181,451-503` | UI 验收缺口见 `PROB-01`/`PROB-02` |
| `R-06` | 一级/二级分类字体与图标大小 | `shared/settings.ts:3-30`；`shared/types.ts:108-112`；`src/components/settings/CategoryDisplaySettingsSection.svelte:24-64`；消费点 `Home.svelte` / `CategorySection.svelte` / `HomeCategoryScope.svelte` / `Sidebar.svelte` / `SettingsHomePreview.svelte`；`worker/lib/settingsData.ts:167-169` | — |
| `R-07` | 卡片最小宽度下限 | `shared/settings.ts:33-51`（min 44 / max 400）；`src/lib/bookmarkCardLayout.ts:1-12`（clamp + 移动安全 150）；`src/components/settings/AdvancedSettingsSection.svelte:121-160` | 是否满足诉求见 `PROB-28` |
| `R-08` | 按分类部分导出备份 | `src/lib/appBackup.ts:26-76`；`src/components/BackupPanel.svelte:22-99,147-207`；`src/lib/appImportExport.ts:35-53,92-112`；`src/App.svelte:933-951` | 部署/原作者同步见 `PROB-14` |

### 2.2 设置页 UI/UX、顶部导航分行、部分导出

`docs/plans/SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md:3`、`PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md` 文首、`DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md:333-344` 台账均为「已完成，集成验收通过」，源码核对一致：

- 4 个基础组件已建：`src/components/ui/Switch.svelte`、`Tooltip.svelte`、`InputGroup.svelte`、`Slider.svelte`，助手 `src/lib/sliderFormat.ts`、`src/lib/tooltipStore.ts`。
- 顶部导航分行：`src/components/Sidebar.svelte:63-65`（`isWrap` 桌面门控）、`:333-334`（wrap 时禁拖拽）、`:424-496`（箭头/子菜单）、`:682-718`（wrap CSS）、`:1212-1242`（移动端强制单行 48px）；`src/views/Home.svelte:137-150,405-438`（实测高度驱动留白）。
- 右上角按钮对齐：`src/components/HomeFloatingActions.svelte:143-156,247-256`。
- `top_layout` 契约：`shared/types.ts`、`schema.sql`、`worker/lib/settingsData.ts:119-136`（归一化语义问题见 `PROB-21`）。

### 2.3 前端体验草案中「以为没有、其实已有」的机制

| 草案主张 | 实际已有 | 证据 |
| --- | --- | --- |
| 即时过滤 + 120ms 防抖 | 已有 | `src/views/Home.svelte:38`（`SEARCH_FILTER_DEBOUNCE_MS = 120`）、`:238-249`；`src/lib/homeData.ts:35-66` |
| hover 操作预留列 / 防布局抖动 | 已有 | `src/components/CategorySection.svelte:230-236`；`src/components/HomeCategoryScope.svelte:21,65,362-364` |
| 移动端操作折叠 | 已有（折叠为图标方块并隐藏文字） | `CategorySection.svelte:536-546`；`HomeCategoryScope.svelte:394-404` |
| accent 变量链路 | 已有（`--theme-accent-color` → `--home-accent-color`） | `src/lib/appData.ts:253-255,283`；`Home.svelte:675,721` |
| 卡片高度可配 | 已有（`card_size.height`，服务端默认 60，取 0 回退 70px） | `shared/settings.ts:33-43` |
| 图标 `loading="lazy"` / `decoding="async"` | 已有，且多了 `fetchpriority="low"` | `src/components/BookmarkIcon.svelte:35-40` |
| 图标错误三级降级 + 首字兜底 | 已有 | `src/lib/bookmarkCardIconState.ts:75,147-161` |
| 搜索/滚动竞态护栏 | 已有，且比草案的 300ms 布尔锁更完善（900/900/600ms 时间戳窗口） | `Home.svelte:78,297,336,364,378` |
| 搜索结果分组 `content-visibility` | 已有，且首页一级分组「故意不加」是已记录决策 | `Home.svelte:781-790`；`TECHNICAL_NOTES.md:211`；`PROJECT_OVERVIEW.md:262` |
| 图标候选随 URL 变化重算 | 已有，无需开发 | `BookmarkEditModal.svelte:109-112` |

---

## 3. 需求开发任务

### 组 A：检索链路（Spotlight）

#### REQ-01（P1）离屏搜索按钮 + 居中 Spotlight 命令面板

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-1.1`~`FR-1.6`；`docs/plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §2.2（约 `:118-214`） |
| 现状事实 | **全部未实现**。`SearchBox.svelte` 是外部搜索引擎启动器而非书签过滤器（`src/components/SearchBox.svelte:61-71` 走 `window.open`）；本地过滤在 `Home.svelte`，经 `bind:query` 上传（`HomeHeroSearch.svelte:29` → `Home.svelte:429`）；唯一 `IntersectionObserver` 是图标懒加载单例（`src/lib/iconVisibility.ts:4-27`），可作写法先例 |
| 子项 | `FR-1.1` 主搜索框离屏检测 action（目标 `src/lib/searchBoxVisibility.ts`，当前无该文件）<br>`FR-1.2` 离屏时右上角出现搜索按钮（接入 `src/components/HomeFloatingActions.svelte:67-124`，当前该行仅主题/后台/分类/登录登出）<br>`FR-1.3` 懒加载居中 Spotlight dialog（复用 `src/App.svelte:130-151` + `src/lib/appLazyComponent.ts:11-33` 的既有懒加载约定）<br>`FR-1.4` 唤起/关闭、快捷键、焦点陷阱、滚动锁与 Esc 层级（滚动锁当前内联在 `BookmarkEditModal.svelte:257-274,327-330`，需先抽出可共享实现）<br>`FR-1.5` 复用既有搜索索引，结果上限 50 条 + 键盘导航（索引在 `src/lib/homeData.ts:35-66,288-301`）<br>`FR-1.6` Spotlight 与页面过滤态相互独立（当前清空逻辑耦合于 `Home.svelte:251-258,329`） |
| 强制前置 | 120ms 防抖常量当前是 `Home.svelte:38` 的私有值。**必须先抽成共享常量再接 Spotlight，禁止复制第二个数值** |
| 冲突协调 | `FR-1.2` 改 `HomeFloatingActions.svelte`，与 `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md`（需求 C，顶部导航按钮对齐，实现在 `HomeFloatingActions.svelte:143-156`）改同一文件，**必须串行**，不可并行改 |
| 约束 | `C-8` 遮罩层 z-index 落进首页阶梯且不盖 Toast(9999)/Tooltip(1000)；`C-9` 不新增未合并的 `window` 滚动监听；`C-10`/`C-11` token 与 transition 约束 |
| 验证 | 匹配/排序/上限逻辑抽纯函数进 `tests/unit/`；焦点陷阱、快捷键、滚动锁、IME 输入只能靠隔离 Chrome 人工闸门（`C-12`：仓库 0 个 e2e） |

### 组 B：首页操作可发现性

#### REQ-02（P2）PC 端操作胶囊 hover/focus 渐显，排序态恒显

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-2.1`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §3.2（约 `:238-253`） |
| 现状事实 | 预留列与按钮已有（`src/components/CategorySection.svelte:98-122,230-236,302-305`；`HomeCategoryScope.svelte:218-250`），但 `opacity`/`visibility` 渐显规则不存在 |
| 范围 | 只加渐显规则，**不新建布局**（预留列已防抖动） |
| 约束 | `C-10` transition 不得写字面时长；需覆盖 `prefers-reduced-motion` |
| 验证 | `tests/unit/designTokens.test.ts` 已有的递归扫描会拦截字面时长；视觉与 reduced-motion 需人工确认 |

#### REQ-03（P2）空分类固定显示「新增书签」按钮，访客不显示

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-2.2`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §3.2（约 `:254-265`） |
| 现状事实 | **部分实现**。`showEmpty` 与搜索态控制已有（`CategorySection.svelte:15,207,470-477`），正常空态目前只渲染 `empty-card` 提示，固定按钮契约缺失 |
| 约束 | `C-7` 入口继续由 `isAuthenticated` 门禁，访客不得看到（现有门禁点 `Home.svelte:474,494,520,579,606`） |
| 验证 | 登录/未登录两态下空分类渲染差异，人工闸门 + 源码文本断言 |

### 组 C：录入路径

#### REQ-04（P1）弹窗打开信号 token + 用户手势读剪贴板预填 URL

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-3.1`、`FR-3.2`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §4.2（约 `:323-354`） |
| 现状事实 | **未实现**。`BookmarkEditModal.svelte:80-106` 只有 `nextKey` 响应式重置，**没有 `onMount`**（仅 `onDestroy`）；`src/`、`tests/`、`scripts/` 对 Clipboard API 零命中 |
| `FR-3.1` | 建立权威的「弹窗打开」信号与 token，异步回调按 token 失效，避免快速开关导致串数据 |
| `FR-3.2` | **仅创建态**、**必须绑定打开按钮的用户手势**读剪贴板并预填 URL；权限拒绝或非 URL 内容静默降级，不弹错误 |
| 安全边界 | 剪贴板读取受 Transient Activation 约束，不能在 `onMount` 里读。`worker/lib/assetHeaders.ts:41` 当前 Permissions-Policy 只禁 camera/mic/geo，不涉及剪贴板 —— 若要收紧需单独决策 |
| 关联决策 | 是否放宽无点 hostname（localhost/IP）见 `OQ-2`；是否加设置开关见 `OQ-8`。两者默认都是「不做」 |
| 验证 | URL 判定与 token 失效抽纯函数进 `tests/unit/`；真实剪贴板权限与手势链路只能人工闸门 |

#### REQ-05（P1）预填后自动触发标题解析，含 3 秒节流与竞态保护

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-3.3`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §4.2（约 `:355-370`） |
| 现状事实 | 标题解析管线**已有但只由 URL 输入框 `blur` 触发**：`src/components/BookmarkBaseFields.svelte:46`、`BookmarkEditModal.svelte:181-193`、`src/lib/bookmarkTitleController.ts:47-78`、`src/lib/api.ts:386-391`。自动路径与节流不存在 |
| 范围 | 新增自动触发路径 + 3 秒节流 + 与手动 `blur` 路径的竞态保护；不改动现有 `blur` 语义 |
| 契约影响 | **会使 `docs/reference/API_CONTRACT.md:132`「仅 blur 触发」的描述过期，必须同步更新** |
| 验证 | 节流与竞态状态机抽纯函数进 `tests/unit/`；配合 `scripts/smoke-test.mjs` 确认 `fetch-site-meta` 调用未被放大 |

#### REQ-06（P2）新增书签时默认分类取视口中央分类

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-3.5`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §4.2（约 `:380-401`） |
| 现状事实 | **未实现**。现有 scroll-spy 是**顶部对齐**阈值判定（`src/lib/homeData.ts:192-213`；`Home.svelte:72-73,296-310,336,364,378`），且 `activeId` 未暴露给 `src/App.svelte:725-740` |
| 口径修正 | 需求文档已把「视口中央」改口径为可实现形式；实现必须排除 `-1` 哨兵值，并尊重现有 scroll-spy 抑制窗口（不要在抑制期内改默认值） |
| 约束 | `C-9` 不新增未合并的滚动监听 —— 复用 `Home.svelte:288-293,382-393` 已 rAF 合并的通道 |
| 验证 | 中央分类选择逻辑抽纯函数进 `tests/unit/`（覆盖 `-1`、抑制期、无分类、单分类）；实际滚动位置需人工确认 |

### 组 D：视觉令牌与配色

#### REQ-07（P2）新增 `accent-border` / `accent-glow` 两个层级 token

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-4.1`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §5.2（约 `:284-296`） |
| 现状事实 | accent 主链路已存在（`src/lib/appData.ts:253-255,283` → `Home.svelte:675,721`），但**全局** `--accent-border` / `--accent-glow` 均无命中；现散落 24%/16% 的 `color-mix` 字面量 |
| 范围 | 替换 `color-mix` 字面量为 token，并覆盖设置页预览（`src/components/settings/SettingsHomePreview.svelte:455,481,549,569,583,605`） |
| 已驳回前提 | 草案称「组件完全没有硬编码颜色」不成立 —— `src/components/SearchBox.svelte:196-201` 仍有独立 Indigo 渐变字面量。是否统一按钮渐变属独立视觉决策，**不在本条范围** |
| 约束 | `C-3` 引入 token 本身不得产生视觉变化，取值取现有最高频档，并须逐处 diff / 视觉回归证明 |
| 冲突协调 | 改 `SettingsHomePreview.svelte` 与 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 的 `FR-0.5`（预览联动）、`FR-B` 共享同一预览面，需协调 |
| 需并轨决策 | 组件级同名变量**已存在**：`src/components/ConfirmDialog.svelte:120,146,152,164` 定义 `--confirm-accent-border` 并在 `:170` 消费，浅色值 `rgba(37, 99, 235, 0.24)` 恰好就是本条要收敛的 24% 档。新全局 token 的取值必须与其对齐，或在文档明确「不并轨」及理由 |

#### REQ-08（P2，已完成）13 个 glass 预设补齐显式 light/dark accent

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-4.2`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §5.2（约 `:297-300`） |
| 前提倒置（重要） | 草案要求把「护眼主题 accent 改深青绿 `#059669`」，方向是错的。**9 个 `paper-*` 护眼预设各自已有调过的 accent（改动后位于 `src/lib/themePresets.ts:270`、`:277-321`），不得改动**；真正共用一个硬编码冷蓝的是 **13 个 glass 预设**（改动前 `accentColor: '#2563eb'` / `darkAccentColor: '#7dd3fc'` 写在 `createGradientPreset` 内，现为 `:236-237` 读取逐套取值，预设列表在 `:322-334`） |
| 范围 | 只给 13 个 glass 预设补 light/dark 显式 accent 并修正冷蓝 |
| 已定决策 | 用户 2026-09-03 确认**接受视觉变动**（这不是 `C-3` 那类等值换 token），并选定「逐套按背景色调」而非统一一个新 accent |
| 处理结果 | `GradientPresetStyle` 新增 `accent` / `darkAccent`，`createGradientPreset` 不再写死 `#2563eb` / `#7dd3fc`；13 套逐个按主色相取深/浅档 —— 清透蓝绿 `#155e75`、晨雾石青 `#0f766e`、珊瑚晴空 `#be123c`、鼠尾草石墨 `#3f6212`、琥珀晨光 `#92400e`、余烬夜航 `#b91c1c`、紫晶破晓 `#6d28d9`、深海蔚蓝 `#0369a1`、极光苔原 `#047857`、柑橘日落 `#9a3412`、玫瑰星轨 `#be185d`、靛蓝秘境 `#4338ca`、陶土沙丘 `#7c2d12`；浅色与深色强调色各 13 个取值互不重复。9 套 `paper-*` 未改动 |
| 验证 | `tests/unit/settingsForm.test.ts` 新增用例：浅色与深色 accent 各自 13 个取值互不相同、无一残留 `#2563eb`，并按**最坏可见区域合成后的卡片色**断言对比度 ≥ 4.5:1（最暗 linear stop → 叠最暗 radial 热区 → 叠遮罩层 → 按 `cardBackgroundOpacity` 合成半透明卡片）。纯实底卡片色只是最好情况上界（最低 5.47），会掩盖真实风险，故不作判据；合成后实测最低浅色 4.58、深色 9.26，阈值调到 5.0 即失败。`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 680 passed；`npm run build` 成功 |
| 未验证 | 未在真实浏览器逐套切换预设做视觉确认（`AGENTS.md` 禁止未经要求启动本地服务）；渐变背景上的实际观感未实测。合成对比度是**解析式估算**（按 CSS 声明重算，不是渲染采样），真实结果还受 `backdrop-filter`、叠加顺序与子像素抗锯齿影响 |

#### REQ-09（P3）信息卡标题/描述改用既有字号 token

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-4.3`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §5.2（约 `:301-310`） |
| 现状事实 | 仍是 `0.9rem`（14.4px）/ `0.75rem`（12px）字面量（`src/components/BookmarkCardInfo.svelte:135,147`）；目标 token 是 `src/app.css:13` `--font-size-base: 14px` 与 `:11` `--font-size-sm: 12px` |
| 范围 | **只做 14/12 这一档**。描述 12px → `--font-size-sm` 是等值替换；标题 14.4px → 14px 有 0.4px 偏差，须按 `C-3` 逐处 diff 与视觉回归确认可接受，否则不改标题。草案的 13/11 缩字号是独立决策，见 `OQ-5`，默认不做 |
| 约束 | `C-3` 换 token 不得产生视觉变化 |

### 组 E：图标渲染

#### REQ-10（P2）书签图标属性契约按渲染路径补齐

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-5.1`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §6.2（约 `:451-462`） |
| 现状事实 | `src/components/BookmarkIcon.svelte:35-40` 属性完整（含 `fetchpriority="low"`）；`src/components/CachedBookmarkIcon.svelte:101-110` 只有 `loading`/`decoding`，**缺固定尺寸与 `fetchpriority`**；`src/components/CategoryIcon.svelte:40` 同样不完整 |
| 待定边界 | `CachedBookmarkIcon` 是否属于「书签网络图标路径」需产品裁定；若不属于，则须在文档明确其边界而不是补属性 |
| 契约影响 | 需同步 `docs/reference/PERFORMANCE_CONTRACT.md:28-29` 说明该边界 |
| 约束 | `C-5` 图标请求 ≤ 260、Cache Storage ≤ 5 MiB，改动后须重跑 `npm run perf:audit` |

#### REQ-11（P2）字母头像按 hostname/title 派生稳定高对比色

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-5.2`；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §6.2（约 `:463-483`） |
| 现状事实 | 三级降级与首字兜底**已有**（`src/lib/bookmarkCardIconState.ts:75,147-161`），缺的只是派生配色：文字颜色当前固定灰（`src/components/BookmarkIcon.svelte:93,106-107`），`iconStyle` 通道已存在（`src/components/BookmarkCard.svelte:386-410`）但未派生色 |
| 范围 | 按 hostname/title 计算稳定色（同一书签每次结果一致）；用户自定义背景色优先，派生色让位 |
| 验证 | 派生函数抽纯函数进 `tests/unit/`（稳定性、hostname 缺失、极端字符）；WCAG AA 对比度需实测，本轮未验证 |

### 组 F：云端新增需求

#### REQ-12（P3，阻塞）EdgeOne 部署兼容

| 项 | 内容 |
| --- | --- |
| 来源映射 | Issue #15（OPEN，`enhancement`，2026-09-02，`wztx`）；本地需求文档**无对应编号**，见 `PROB-06` |
| 云端事实 | 标题仍是模板占位「简短描述你的新功能想法」，正文诉求「开发兼容 EdgeOne 部署版本」；维护者 2026-09-02 评论「目前没计划…下一个大版本纳入排期」，**未承诺实现** |
| 阻塞原因 | 兼容边界完全未定义 —— Workers 运行时 API 差异、D1/KV 的等价存储、部署配置、构建产物、CI、文档范围都不清楚。详见 `PROB-25` |
| 处理顺序 | 先澄清范围（`PROB-25`）→ 再评估架构可行性 → 才谈立项。**当前不排期** |

---

## 4. 待用户决策（OQ）

来自 `docs/plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §7.1（约 `:390-414`）。**默认结论都是「不做 / 不改」**；只有用户显式推翻，才转为 `REQ` 条目。

| 编号 | 决策点 | 默认 | 推翻代价 |
| --- | --- | --- | --- |
| `OQ-1` | 拼音 / 首字母匹配 | 不做 | 需接受新依赖与首屏 JS 成本；实现树与 `package.json` 当前零命中 |
| `OQ-2` | 剪贴板是否放宽无点 hostname（localhost/IP） | 不放宽 | 若做，必须新建仅用于剪贴板的宽判定，**不得改** `normalizeTitleLookupUrl` |
| `OQ-3` | 是否删除死代码 `src/lib/bookmarkFaviconController.ts` 与 `api.bookmarks.fetchFavicon` | 本轮不删不接 | 二者当前无调用者（`src/lib/api.ts:381-385`、`src/lib/icons.ts:319-347`），删除会影响测试与 API surface |
| `OQ-4` | 首页一级分组是否加 `content-visibility: auto` | 不做 | 需先推翻 `TECHNICAL_NOTES.md:211` 与 `PROJECT_OVERVIEW.md:262` 的已记录决策，并承担 scroll-spy / 锚点 / Ctrl+F 风险 |
| `OQ-5` | 卡片标题/描述是否缩到 13/11px | 不缩 | 接受可读性下降；与 `REQ-09` 互斥 |
| `OQ-6` | 图文间距是否 13.1px → 8px | 不动 | 接受窄卡贴合 |
| `OQ-7` | `CARD_SIZE_DEFAULTS.height` 是否 60 → 48 | 不改 | 信息卡图标会从 44px 压到 36px；且只影响新装实例，老实例已持久化 |
| `OQ-8` | 剪贴板是否加设置开关 | 不需要 | 接受新增 settings 字段 + API + UI 复杂度 |

---

## 5. 已明确不做（列出以防重复提案）

这些条目在需求核对中被**明确驳回或判定零工作量**，不要再当作待办提出。

| 编号 | 结论与理由 | 证据 |
| --- | --- | --- |
| `FR-2.3` | Action Sheet 只在同行按钮 ≥3 且 ≤720px 时才需要；当前最多 2 个按钮，**不触发，本轮零工作量** | `CategorySection.svelte:50,98-122` |
| `FR-2.4` | 不新增 accent 竖条；不改 highlighted 锚点闪烁与 `scroll-margin` | `HomeCategoryScope.svelte:147,162-168,187-191` |
| `FR-3.4` | 图标候选已随 URL 变化免费重算，**无需开发**；不接 fetch-favicon | `BookmarkEditModal.svelte:109-112` |
| `FR-3.6` | 后台两个入口继续用 `categories[0]`；本轮不新增全局「新增书签」入口 | `admin/BookmarkListPanel.svelte:258,282`；`HomeFloatingActions.svelte:67-124` |
| `FR-4.4`（部分） | 毛玻璃描边/柔影与 tooltip 无需开发；8px 间距不动（→`OQ-6`）；48px 默认高度不改（→`OQ-7`） | `BookmarkCardInfo.svelte:79,85-88,107,109`；`shared/settings.ts:33-43` |
| `FR-4.5` | 不引入 `--accent-primary` 别名，不新增 accent 用户设置 | `appData.ts:253-255,283`；`shared/types.ts` 无 accent key |
| `FR-5.3` | 驳回 300ms 布尔互斥锁；现有 900/900/600ms 时间戳窗口更完善 | `Home.svelte:78,297,336,364,378` |
| `FR-5.4` | 首页一级分组不加 `content-visibility`；策略反转另留 `OQ-4` | `Home.svelte:781-790`；`TECHNICAL_NOTES.md:211` |
| `FR-5.5` | 不是功能需求，而是上线前的 9 项性能护栏，随任何落地一起重跑，不单列开发 | `scripts/perf-audit.mjs:28-32,489-545` |

此外，`#9` 评论中的候选贡献 —— 移动端前台编辑、内网/NAS 地址协同、Chrome 新标签页插件、油猴脚本与第三方仓库 —— 按 `GITHUB_ISSUES_REQUIREMENTS.md:29-30` 与 `DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md:34-35` 明确**不属于正式验收范围**，不进本清单。

---

## 6. 实施顺序与冲突协调

### 6.1 必须串行的文件

| 文件 | 争用方 | 处理 |
| --- | --- | --- |
| `src/components/HomeFloatingActions.svelte` | `REQ-01`（FR-1.2 新增搜索按钮） vs `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md` 需求 C（顶部导航按钮对齐，已落地在 `:143-156`） | 串行改，改后必须复验顶部模式对齐数值与 z-index |
| `src/components/settings/SettingsHomePreview.svelte` | `REQ-07`（accent token） vs `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` `FR-0.5`/`FR-B` | 串行改，改后复验预览实时联动 |
| `src/views/Home.svelte`、`src/App.svelte` | `REQ-01`、`REQ-06` 与既有排序/分类回调 | 集中在同一轮改，避免多轮往返 |

### 6.2 建议阶段

1. **阶段 1（前置抽取，不改行为）**：抽出共享防抖常量、抽出可复用滚动锁、抽出 accent token —— 为 `REQ-01`/`REQ-04`/`REQ-07` 铺路。每步必须证明无视觉变化（`C-3`）。
2. **阶段 2（录入路径）**：`REQ-04` → `REQ-05` → `REQ-06`。`REQ-05` 同步更新 `API_CONTRACT.md:132`。
3. **阶段 3（检索链路）**：`REQ-01`。依赖阶段 1 的防抖常量与滚动锁。
4. **阶段 4（视觉）**：`REQ-07` → `REQ-08` → `REQ-09` → `REQ-10` → `REQ-11`。按独立提交保存；回滚优先按提交粒度 revert，**不得**通过修改用户设置数据或删除兼容字段来回滚。
5. **阶段 5（可发现性）**：`REQ-02`、`REQ-03`，可与阶段 4 并行（文件不重叠）。
6. `REQ-12` 不进阶段，阻塞于 `PROB-25` 的范围澄清。

### 6.3 每阶段的固定闸门

`npm run type-check` → `npm test` → `npm run build` → `git diff --check`；涉及 API 行为加 `node scripts/smoke-test.mjs`；涉及首页/后台渲染加 `node scripts/chrome-regression.mjs`；涉及图标或缓存加 `npm run perf:audit`（`C-5` 的 9 项阈值）。

---

## 7. 全局硬约束

完整清单见 [问题处理任务清单 §7](PROBLEM_HANDLING_TASK_LIST.md#7-处理这些问题时必须继续遵守的硬约束)。本清单的所有条目额外受以下约束：

- `C-1` Svelte 4.2.19 无 runes；`C-2` 无 Tailwind 管道，一律 scoped `<style>` + CSS 自定义属性。
- `C-4` 不得绕过设置契约：卡片几何、分类字号图标尺寸、搜索框显隐都是用户可配项，只能改**默认值与归一化逻辑**（`shared/types.ts:103-113,147-149,279-280`）。
- `C-6`/`C-12` 仓库无组件挂载环境、0 个 e2e、100 个单测文件。**要测行为必须先把逻辑抽成纯函数**，否则不算可验证；真实交互单独登记为人工浏览器闸门。
- `C-7` 所有编辑入口继续由 `isAuthenticated` 门禁，不得因「自用定位」放宽。

---

## 8. 未验证事项

- 本轮未运行任何构建、测试、性能或浏览器套件。`REQ-01`~`REQ-11` 的「未实现」结论来自 grep 与逐符号静态核对；`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §8 的新增文件清单是规划，已确认这些目标文件当前都不存在。
- 未验证的对比度与预算：`REQ-08` 各 glass 预设 light/dark 对比度、`REQ-11` 字母头像 WCAG AA、`REQ-10` 改动后的实际图标请求数。
- 未验证的真实交互：焦点陷阱、快捷键、IME、剪贴板权限与 Transient Activation、hover 与 `prefers-reduced-motion`、安全区与虚拟键盘。
- `REQ-10` 的 `CachedBookmarkIcon` 是否属于「书签网络图标路径」是产品边界问题，源码无法判定。
- `REQ-12` 的 EdgeOne 运行时差异未做任何技术调研。
- 云端 Issue 状态经 `issue://` 只读读取（#9~#13、#15 Open；#8、#5 Closed），未执行任何 GitHub 写操作，也不由本地实现推断云端状态。
