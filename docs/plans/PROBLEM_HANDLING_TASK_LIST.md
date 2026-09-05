# 问题处理任务清单

> **状态：证据与决策记录，不维护待办状态。** 本文保留每条 `PROB-NN` 的核对证据、判断依据和处理结果，供后续回溯「当初为什么这么改」。
>
> **当前待办与状态一律看 [本地待办清单](../BACKLOG.md)**；用户可见的缺陷与需求看 GitHub Issue；工程规则看 [CONTRIBUTING.md](../../CONTRIBUTING.md)。本文不再维护勾选、进度表或完成名单，避免同一事实写两份。
>
> - 核对日期：2026-09-03；核对基线：`develop` 分支当时的工作树。
> - 核对方式：逐条读 `docs/reference/`、`docs/plans/`、`docs/guides/`、`CHANGELOG.md`，再到 `src/`、`worker/`、`shared/`、`tests/`、`scripts/`、`public/` 找实现证据；云端 Issue 通过 GitHub 独立读取。
> - 文档与源码冲突时以源码为事实。本文里形如 `file.ts:123` 的行号引用来自当时的工作树，**可能已经腐烂**；以符号名和上下文为准，不要直接相信行号。
> - 配套文档：尚未实现的功能需求见 [需求开发任务清单](REQUIREMENT_DEVELOPMENT_TASK_LIST.md)。

---

## 1. 编号与范围口径

- 本文编号统一用 `PROB-NN`，**不占用**既有原生编号（`R-01`~`R-08`、`FR-*`、`NFR-*`、`C-*`、`OQ-*`、`T*`、`L*`/`S*`/`U*`）。每条都在「来源映射」列回指原生编号。
- 收录标准：当前源码/文档/云端状态能证明的**缺陷、验收未达标、文档与源码不一致、遗留验证欠账、残余风险、信息不足**。
- 不收录：已闭环的历史轮次记录、实施前基线快照、尚未实现的功能需求（属需求清单）、评论中的候选贡献。
- 优先级：`P0` 阻断可用性 / `P1` 影响正确性、安全或已声明验收 / `P2` 影响一致性与可维护性 / `P3` 表述与整洁度。

### 分类分布

| 分类 | 条目 | 数量 |
| --- | --- | --- |
| A 验收未达标（功能缺口） | PROB-01 ~ PROB-04 | 4 |
| B 文档与源码不一致 | PROB-05 ~ PROB-12 | 8 |
| C 遗留验证欠账 | PROB-13 ~ PROB-18 | 6 |
| D 安全与稳定性风险 | PROB-19 ~ PROB-24 | 6 |
| E 信息不足需澄清 | PROB-25 ~ PROB-30 | 6 |

### 已执行的验证记录

这些是历史轮次实际跑过的闸门，作为证据保留；不代表当前状态。

- **2026-09-03 核对轮**：未运行 `type-check` / `npm test` / `build` / `perf:audit` / 浏览器套件，也未执行 git、部署或 GitHub 写操作。该轮所有「已实现」结论均为静态源码证据。
- **2026-09-04 第一轮**（PROB-02/08/16/21/22）：`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 683 passed；`npm run build` 成功；`git diff --check` 通过。独立 Reviewer 逐条复核判定 **PASS**，findings 为空。未运行部署、`smoke-test.mjs`、`chrome-regression.mjs` 与浏览器套件；PROB-02 的弹窗默认值未做真机目视确认。
- **2026-09-04 第二轮**（PROB-20 方案 1 + PROB-18 方案 B）：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 101 files / 689 passed；`npm run build` 成功；`git diff --check` 通过。新增 devDependencies `@testing-library/svelte`、`jsdom`。未运行部署、`smoke-test.mjs`、`chrome-regression.mjs`、`perf:audit` 与匿名枚举探针。

PROB-29、PROB-30 是 2026-09-03 轮实现 PROB-01 与 REQ-08 时新发现并登记的条目。已完成条目保留在原位置并追加「处理结果」行，不删除，便于回溯当初的证据与判断。

---

## 2. A 类：验收未达标（功能缺口）

这些条目的需求文档已把行为写进**验收标准或已确认决策**，但当前源码不满足。它们不是新需求。

### PROB-01（P1，已完成）批量移动的目标分类树没有逐项后果提示

| 项 | 内容 |
| --- | --- |
| 来源映射 | `R-05`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:205`、`:209`、`:218`；Issue #9 / #12 |
| 文档要求 | `:205`「目标分类树显示完整路径、当前选项和**禁用项原因**」；`:209` 已确认决策「目标树中**越权/非法目标禁用并说明原因**」；`:218`「禁用非法目标（不存在、越权、跨层级违规）并在禁用项旁说明原因」 |
| 源码事实 | `src/lib/adminListState.ts:120-123`（改动前）`getAdminBookmarkCategoryOptions` 直接返回 `buildCategoryTreeOptions(categories)`，全量分类均可选；`src/lib/categorySelect.ts:8-12` `CategoryTreeOption` 只有 `{ id, title, children }`，没有 `disabled` 或原因字段；`src/components/CategoryTreeSelect.svelte:16` 的 `disabled` 是**整控件级** prop（`:41` 提前返回、`:191` 落在 trigger 上），不是逐项能力 |
| 现有防线 | 只在服务端：`worker/routes/bookmarks.ts:114-169` 与 `worker/lib/db/bookmarks.ts:207-228` 校验目标分类并返回 `CONFLICT=1006` |
| 影响 | 用户能选中非法/越权目标并提交，只在请求失败后才得到反馈，与 `:205`/`:209` 直接冲突 |
| 复核推翻的前提 | 进一步读服务端后发现 `:218` 写的三个禁用理由**在当前数据模型都不成立**：`worker/routes/bookmarks.ts:133-143` 只校验 `category_id` 是正整数，`worker/lib/db/bookmarks.ts:207-213` 只校验「分类存在」；分类最多两层且两层都能直接挂书签，所以没有跨层级规则；管理员登录后可见全部分类，所以没有越权目标。按 `:218` 字面实现「禁用」等于发明一条服务端不存在的限制 |
| 真实危害 | 只有一条：把公开书签移进私密（或私密祖先下的）分类，会让它从公开首页消失 —— `worker/lib/db/aggregates.ts:41-48` 过滤 + `:54-78` `getPublicCategoryIds` 按祖先链隐藏 |
| 已定策略 | 用户 2026-09-03 选定「可选 + 逐项后果警告」：不硬禁用服务端允许的管理员操作，改为逐项标注后果并在确认弹层重申一次 |
| 处理结果 | `src/lib/categorySelect.ts` `CategoryTreeOption` 新增 `notice`；`src/components/CategoryTreeSelect.svelte` 在一级/二级选项内渲染该文案并接入 `aria-describedby`，选项保持可选；`src/lib/adminListState.ts` 新增 `getHiddenCategoryIds`，`getAdminBookmarkCategoryOptions` 改为接收当前选中书签，只在「选中集合含**当前对匿名访客可见的**公开书签」且目标会被隐藏时标注「移入后会从公开首页隐藏 N 个公开书签」——已经躺在私密分类里的公开书签换到另一个私密分类是「保持隐藏」，不计入 N；`src/components/admin/BookmarkListPanel.svelte` 确认弹层重申后果并说明私密书签不受影响、分类可改回公开。服务端校验保持不变，仍是最终防线 |
| 验证 | `tests/unit/adminListState.test.ts` 覆盖私密根 / 私密后代 / 环形数据 / 计数 / 四种无需提示情形；`tests/unit/publicVisibility.test.ts` 交叉断言前端镜像与服务端 `getPublicCategoryIds` 逐项一致，防止两侧漂移；`tests/unit/adminBookmarkLayout.test.ts` 锁定逐项文案、无障碍描述与「不引入 `aria-disabled`」。`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 680 passed；`npm run build` 成功。未运行浏览器套件（`AGENTS.md` 禁止未经要求启动本地服务） |
| 遗留 | `:205`/`:209`/`:218` 的「禁用非法目标」表述与当前数据模型不符，应改写为「逐项后果提示」并说明无非法目标；该文档修正尚未执行，需与 PROB-11/PROB-12 的口径回写一起裁定 |

### PROB-02（P2，已完成）批量移动默认目标是首个选中项，不是「多数书签所在分类」

| 项 | 内容 |
| --- | --- |
| 来源映射 | `R-05`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:218` |
| 文档要求 | `:218`「默认展开并高亮当前**多数书签所在分类**的父级，便于就近选择」 |
| 源码事实 | `src/components/admin/BookmarkListPanel.svelte:151`：`moveTargetId = selectedBookmarks[0] ? Number(selectedBookmarks[0].category_id) : Number(categories[0].id)` —— 取首个选中项，未做众数统计 |
| 处理动作 | 抽 `pickMajorityCategoryId(selectedBookmarks)` 纯函数（并列时取排序最靠前的分类，保持确定性），替换 `:151` 的取值 |
| 验证 | `tests/unit/` 覆盖：全同分类、明确多数、并列、空选、目标已删除 |
| 处理结果 | `src/lib/adminListState.ts` 新增 `pickMajorityCategoryId(selectedBookmarks, categories)`：按 `flattenAdminCategoryGroups(buildAdminCategoryGroups(categories))` 的展示顺序（`sort` 再 `id`）遍历，用严格 `>` 取众数，因此并列时落在排序最靠前的分类；候选集只含分类树里真正可选的分类，已删除或挂在不存在父分类下的 `category_id` 不参与统计，空选或全部目标已删除时回落到排序最靠前的分类。`src/components/admin/BookmarkListPanel.svelte` 的 `openMoveModal` 改为 `moveTargetId = pickMajorityCategoryId(selectedBookmarks, categories)`，替换原先的 `selectedBookmarks[0]` 取值 |
| 验证结果 | `tests/unit/adminListState.test.ts` 覆盖全同分类、明确多数、两组并列（含「id 更小但排序更靠后」的判别用例）、空选、目标已删除、孤立子分类；`tests/unit/adminBookmarkLayout.test.ts` 锁定组件接线并断言不再出现 `Number(selectedBookmarks[0].category_id)`。`npx vitest run tests/unit/adminListState.test.ts` 通过；`npm run type-check` 0 errors / 0 warnings |

### PROB-03（P2，已完成）分类树打开时当前项只滚动可见，未获得焦点

| 项 | 内容 |
| --- | --- |
| 来源映射 | `R-04`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:167-188` |
| 源码事实 | `src/components/CategoryTreeSelect.svelte:51-56` `revealSelectedOption(focus = false)` 默认只 `scrollIntoView({ block: 'nearest' })`，仅在 `focus === true` 时 `selected?.focus()`；`:48`（鼠标打开）和 `:135`（键盘打开）都不传 `focus`；紧随其后的 rAF（`:137-141`）在 `:139-140` 把焦点给**首项或末项** |
| 事实边界 | 「当前项可见」已满足；「当前项获得焦点」未满足。R-04 段把键盘可达列为验收，但未逐字要求当前项自动聚焦 —— 属于验收口径需裁定，见 PROB-27 |
| 处理动作 | 裁定后二选一：a) 键盘打开时 `revealSelectedOption(true)`，无选中项才落首项；b) 保持现状并在 R-04 段写明「打开只保证可见，不自动聚焦」 |
| 验证 | 隔离 Chrome 键盘打开分类树，记录 `document.activeElement` 的 `aria-selected` |
| 裁定与处理结果 | 用户 2026-09-04 选 b) **保持现状，回写文档**。已在 `GITHUB_ISSUES_REQUIREMENTS.md` 的 R-04 验收标准与「已确认决策」写明：定位只保证当前项滚动可见，**不自动把焦点移到当前项**；键盘可达由「下箭头进首项 / 上箭头进末项 + 方向键逐项移动 + Esc 关闭并把焦点还给触发器」保证。`CategoryTreeSelect.svelte` 未改动 |

### PROB-04（P3）配色分区仍渲染模块顶层大段说明，分组名与 FR-B2 不一致

| 项 | 内容 |
| --- | --- |
| 来源映射 | `FR-B1`、`FR-B2`；`docs/plans/SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md:102-103`；`docs/plans/UI_UX_Plan.md:30-31` |
| 已满足部分 | `FR-B1` 指向的 `BackgroundSettingsSection.svelte` 已无副标段落（当前该文件仅 `legend` + 子组件，见全文 39 行）；每套预设的文学性描述已移入 `GradientPresetSelector.svelte:45-46` 的 `title`/`aria-label`，符合 `FR-B2` 的 hover 要求 |
| 未满足部分 | `GradientPresetSelector.svelte:25-26` 仍渲染 `内置配色方案` + 「每套方案包含浅色/深色两种背景，选中后会一并套用遮罩和推荐的卡片透明度、文字颜色。」——即 `UI_UX_Plan.md:30` 要求直接删除的「模块顶层说明」；`FR-B2` 要求分组名精简为「毛玻璃」「护眼纯色」，源码为 `毛玻璃氛围`（`:15`）且分组 hint 仍内联渲染（`:16`、`:38`） |
| 事实边界 | `FR-B1` 逐字只点名 `BackgroundSettingsSection.svelte:34`（实施前行号）。说明文案是否随组件下移而出界，属范围裁定，不是已证缺陷 |
| 处理动作 | 裁定后二选一：a) 删除 `GradientPresetSelector.svelte:26` 段落、分组名收敛为「毛玻璃」「护眼纯色」并把 hint 移入 hover；b) 在 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` FR-B1/FR-B2 明确保留该说明与现用分组名 |
| 验证 | `tests/unit/adminSettingsLayout.test.ts` 追加源码文本断言（符合仓库既有测试通例） |

---

## 3. B 类：文档与源码不一致

### PROB-05（P1，已完成）API 契约的书签端点表漏列 `POST /api/bookmarks/reorganize`

| 项 | 内容 |
| --- | --- |
| 来源映射 | `docs/reference/API_CONTRACT.md:93-103`、`:108` |
| 文档事实 | 书签端点表（`:93-103`）共 9 行，含 `batch-delete`、`batch-move`、`sort`、`icon-cache/refresh`、`check-health`，**没有** `reorganize`；该端点只在 `:108` 的散文里被当作既有契约引用 |
| 源码事实 | `worker/routes/bookmarks.ts:172` 注册 `bookmarksRoutes.post('/reorganize', …)`，是首页跨分类整理的保存通道 |
| 影响 | 契约文档是公共事实来源（`docs/README.md:25`），漏列会让后续改动误判该端点不存在 |
| 处理动作 | 在 `:93-103` 表格补 `POST /api/bookmarks/reorganize`（请求 `BookmarkReorganizeReq`、返回 `null`），并补 `CONFLICT=1006` 语义说明 |
| 验证 | 逐个比对 `worker/routes/` 全部 `.get/.post/.put/.delete` 注册与契约表，确认无第二处漏列 |
| 处理结果 | 已在端点表补 `POST /api/bookmarks/reorganize`（`BookmarkReorganizeReq` → `null`），并新增一段说明：请求形状 `{ category_orders: Array<{ category_id, ids }> }`、非正整数返回 `code=1002`、状态冲突返回 `code=1006`、其它故障 `code=1500`，并点明 `batch-move` 沿用同一 `BookmarkReorganizeError` → `CONFLICT` 判定 |
| 复核结果 | 已逐个比对 `worker/routes/bookmarks.ts` 的 10 处路由注册与契约表，补入后无第二处漏列 |

### PROB-06（P1，已完成）Issue 需求文档的 Open 快照过期，缺 #15

| 项 | 内容 |
| --- | --- |
| 来源映射 | `docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:5-7`、`:18-24`；Issue #15 |
| 文档事实 | `:5` 快照 2026-08-31；`:7`「当前 Open 数量：5 个，#9、#10、#11、#12、#13」；`:24`「本次 Open 查询返回的正式范围只有 #9—#13」 |
| 云端事实 | 现有 **6 个 Open**：#9、#10、#11、#12、#13、**#15**。`gh issue view 15` 精确时间：创建 2026-09-02 13:34 UTC、更新 2026-09-02 14:24 UTC，作者 `wztx`，标签 `enhancement`，标题仍是模板占位「[Feature]: 简短描述你的新功能想法」，正文实际诉求是 **EdgeOne 部署兼容**；维护者 2026-09-02 评论「目前没计划…下一个大版本纳入排期」，未承诺实现 |
| 处理动作 | 更新 `:5` 快照日期、`:7` Open 列表与 `:18-24` 表格；按 PROB-25 裁定后决定 #15 是否立项（需求侧对应 `REQ-12`） |
| 验证 | 重新读取 `issue://lbjxr/CF-Navs/?state=open` 并与表格逐行对照 |
| 处理结果 | 快照日期改为 2026-09-03，Open 数量 5 → 6，表格补入 #15 行（用上面 `gh` 核到的精确 UTC 时间），范围句改为「#9—#13 与 #15」，并新增一段说明 #15 未获实现承诺、未分配 R 编号、兼容边界待澄清，指向 PROB-25 与 REQ-12 |

### PROB-07（P1，已完成）平台优化的「剩余真机验收 S1」可能已被后续冒烟覆盖但未回写

| 项 | 内容 |
| --- | --- |
| 来源映射 | `S1`；`docs/plans/PLATFORM_OPTIMIZATION_PLAN.md` 第八节「剩余的真机验收清单」的 S1 条与 S1 完成记录；`docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` 的冒烟补跑记录 |
| 冲突 | `PLATFORM_OPTIMIZATION_PLAN.md` 的 S1 验收条仍写「跑一次 `scripts/smoke-test.mjs`，确认第 347 行『登出后 token 失效 → 401』现在通过（这条断言自 `a296e74` 起一直是失败的）」；但 `DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` 记录 2026-08-30 已补跑 `smoke-test.mjs` 并 **75/75 全绿** |
| 源码事实 | 该断言在 `scripts/smoke-test.mjs` 的「登出」小节（紧跟 `登出 code=0`），**不在**文档引用的第 347 行；计划文档的裸行号引用已漂移，违反 `CONTRIBUTING.md` 第 3 节 |
| 影响 | 一条安全相关的遗留验证同时被标为「未闭环」和「已全绿」，无法据文档判断真实状态 |
| 处理动作 | 重跑 `scripts/smoke-test.mjs` 确认该断言当前结果，然后在 `PLATFORM_OPTIMIZATION_PLAN.md` 第八节的 S1 条标注闭环或保留，并修正行号引用 |
| 验证 | `node scripts/smoke-test.mjs`（需可用本地 D1），记录该条断言与总数 |
| 处理结果 | 断言**当前通过**，冲突按「已闭环」裁定。`PLATFORM_OPTIMIZATION_PLAN.md` 改三处：S1 完成记录里的 `scripts/smoke-test.mjs:347` 改为按断言名引用；「待真机复核」段改写为已闭环记录，并写明本地 `wrangler dev` 的 KV 是单进程模拟、只覆盖同 isolate 读己所写；第八节的 S1 条划掉并标注闭环，把跨 isolate 撤销窗口与 KV 写失败语义明确移交 PROB-19。三处都不再写裸行号 |
| 验证结果 | 备份并清空 `.wrangler/state/v3/d1` → `npm run db:init` → `npm run dev`（本地 `127.0.0.1:8787`，凭据取 `.dev.vars` 的 `INIT_ADMIN_USER` / `INIT_ADMIN_PASSWORD`，未写入任何被跟踪文件）→ `node scripts/smoke-test.mjs`：**通过 75 / 75，exit 0**。`登出 code=0` 与 `登出后 token 失效 → 401` 两条均为 `✓`。这是本轮首次真实执行 L1，此前所有「75/75」结论都只有文档记载 |
| 未验证 | 跨 isolate 撤销延迟（≤15 秒）与 KV 写失败静默：本地模拟 KV 不复现最终一致性，属 PROB-19 |

### PROB-08（P2，已完成）设置字段缺少字段名级的契约说明

| 项 | 内容 |
| --- | --- |
| 来源映射 | `docs/reference/API_CONTRACT.md:185-188`；`shared/types.ts:122-157`；`shared/settings.ts:45-92` |
| 源码事实 | `Settings` 接口与 `SETTINGS_KEYS` 共约 30 个字段；契约文档在 `PUT` 端点处只以聚合类型名 `Settings` 概称 |
| 文档现状 | `PROJECT_OVERVIEW.md:20-30`、`:52` 有**语义级**覆盖（标题字号、搜索、经常访问数、卡片风格、背景等能读到功能描述）。缺的是**按字段名可追溯的类型/取值范围说明** |
| 逐字检索无命中（reference/ 与 guides/ 范围内） | `site_title_font_size`、`card_size`、`card_style`、`card_icon_size`、`category_display`、`card_show_description`、`card_icon_show_title`、`search_box_show`、`search_engine_selector_show`、`content_layout`、`most_visited_count`、`site_title_show` |
| 仅散文提及、缺字段级语义 | `card_background_color`、`card_background_opacity`、`card_text_color`、`theme`、`search_engine` |
| 定性 | 文档**颗粒度缺口**，不是代码缺失。字段全部在用：`src/lib/settingsForm.ts:90-94` 默认值、`src/views/Home.svelte:131-135` 消费、`src/components/settings/SettingsHomePreview.svelte:68-75` 预览 |
| 处理动作 | 在 `API_CONTRACT.md` 增设置字段表（字段名 / 类型 / 取值范围 / 归一化行为 / 默认值），范围以 `shared/settings.ts` 的归一化函数为准 |
| 验证 | 用 `SETTINGS_KEYS` 逐键核对表格完整性 |
| 处理结果 | `docs/reference/API_CONTRACT.md` 的「设置接口」新增字段级契约表：按 `SETTINGS_KEYS` 顺序列全 30 个键的「键名 / 类型 / 取值范围 / 归一化行为 / 默认值」，范围与归一化逐条取自 `worker/routes/settings.ts` 的 PUT 校验和 `shared/settings.ts`、`worker/lib/settingsData.ts` 的归一化函数，并显式区分「服务端钳制」与「只是类型注释、服务端不钳制」（`site_title_font_size`、`card_background_opacity`、`background.blur/mask`、`content_layout` 数值项）。同时点明未知键在写入与读取聚合两个方向都被丢弃，`most_visited_count` / `site_title_show` 在 PUT 无类型校验、只在读取时归一化。原先散落在浏览器同步小节之后的 4 段设置说明（长度上限、`navigation`、背景兼容、22 组预设）一并移回「设置接口」标题下，长度上限段不再重复逐字段数字，改为指向新表 |
| 验证结果 | 用 `shared/settings.ts:60-91` 的 `SETTINGS_KEYS` 逐键比对，30 行一一对应、顺序一致；`shared/types.ts:133-164` 的 `Settings` 字段集合与之相同，无单侧字段 |

### PROB-09（P2，已完成）`UI_UX_Plan.md` 无状态标注，且未进 `docs/README.md` 索引

| 项 | 内容 |
| --- | --- |
| 来源映射 | `docs/plans/UI_UX_Plan.md:1-6`；`docs/README.md:58`、`:60-68`；`docs/plans/SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md:5` |
| 冲突 | `docs/README.md:58` 声明「每份文档文首都标注了状态和对应的实现提交」，但 `UI_UX_Plan.md:1-6` 只有「核心设计原则」，无状态块；`docs/README.md` 的计划文档列表（现为 `:60-68`，共 9 条）也**不含**该文件 |
| 已确认关系 | `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md:5` 明确「来源：`docs/plans/UI_UX_Plan.md`…本文将该规范转化为可执行、可验收的需求」，即 `UI_UX_Plan.md` 是**已被取代的原始草案** |
| 影响 | 一份无状态、未索引的草案与已完成需求文档并存，后续开发可能把草案条目当待办重复实施（PROB-04 即由此产生） |
| 处理动作 | 在 `UI_UX_Plan.md` 文首加状态块：「原始改造草案；已由 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 取代并落地，仅作历史来源保留，不作为待办」；并把它列入 `docs/README.md` 计划文档清单 |
| 处理结果 | `UI_UX_Plan.md` 文首已加状态块：标明它是「原始改造草案，已被取代」，已由 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 转化落地、仅作历史来源保留、不作为待办，且 FR 编号冲突以后者为准，并指向 PROB-04。`docs/README.md` 计划清单已补该文件（注明已被取代）|

### PROB-10（P2，已完成）`DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md` 未列入 README 的计划文档清单

| 项 | 内容 |
| --- | --- |
| 来源映射 | `docs/README.md:14`、`:60-68` |
| 事实 | 该文件在 `:14` 的「确定任务类型后看对应执行计划」里被指名，但 `:60-68` 的「开发计划与决策记录」清单缺这一行 |
| 影响 | 按目录索引查文档的人会漏掉 R-01~R-08 的执行台账 |
| 处理动作 | 在 `:60-68` 补 `DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md`，并按 PROB-09 补 `UI_UX_Plan.md`。本文两份新清单已在 `docs/README.md:70-75` 单列小节，无需重复添加 |
| 处理结果 | `docs/README.md` 计划清单已补「开发任务规划（R-01～R-08 Issue 需求）」指向 `plans/DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md`，并按 PROB-09 补入 `UI_UX_Plan.md`。两份新清单仍单列在「当前任务清单」小节，未重复添加 |

### PROB-11（P2，已完成）R-02 首页新建子分类的移动端交互形态与计划 T6 不同

| 项 | 内容 |
| --- | --- |
| 来源映射 | `R-02`、`T6`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:85`、`:72`；`docs/plans/DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md` T6 任务卡 |
| 差异 | 计划要求移动端把分类操作收进「更多操作」菜单（对应 `GITHUB_ISSUES_REQUIREMENTS.md:72` 的端侧规划）；源码 `src/components/HomeCategoryScope.svelte:74-85` 是直接渲染的 scope-action 按钮 |
| 定性 | 功能入口存在且满足「不依赖 hover/右键」，属交互形态偏差，非功能缺失 |
| 处理动作 | 裁定后二选一：a) 移动端收进更多操作菜单；b) 在 R-02 段与 T6 台账写明「已改为直显图标按钮」并说明理由 |
| 裁定与处理结果 | 用户 2026-09-04 选 a) **移动端收进「更多操作」菜单**。`HomeCategoryScope.svelte` 现在同时渲染桌面直显按钮（`.scope-action-direct`）与移动端「更多操作」触发器（`.scope-more-trigger`），由既有的 `max-width: 720px` 断点互斥显示——`display: none` 同时移出无障碍树，不会出现两个同名操作。菜单为 `role="menu"` + `role="menuitem"`，触发器带 `aria-haspopup="menu"` / `aria-expanded` / `aria-controls`；支持 Esc 关闭并把焦点还给触发器、`svelte:window` 上的 pointerdown 判定点击外部关闭；访客态（`reserveActions=false`）两个入口都不渲染。断点沿用组件既有的 720px，未改成全局的 799px，避免改动 721–799px 区间的桌面视觉 |
| 验证结果 | 新增 `tests/unit/homeCategoryScopeActions.test.ts`（组件测试，jsdom）覆盖 6 条：disclosure 语义、`aria-controls` 指向真实菜单节点、点击菜单项执行回调并收起、Esc 关闭并归还焦点、点击外部关闭、访客态不渲染；断点互斥用源码断言锁定。`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 695 passed；`npm run build` 成功。**移动端实际可见性与触控仍需 L3 真机确认**（jsdom 不应用媒体查询） |
| 2026-09-04 追加修正 | 用户实测反馈：移动端应该把**三个**操作都收进三点按钮，不只是「新建子分类」。`HomeCategoryScope` 新增 `onAddBookmark` / `onRequestSort` 两个 prop，菜单按「新增书签 → 新建子分类 → 排序」固定顺序渲染，只渲染当前可用项（排序会话中 Home 不再传前两者）；`CategorySection` 的 `.section-actions` 加 `class:sorting`，并在其既有的 `max-width: 720px` 块里隐藏 `.section-header.inline-actions .section-actions:not(.sorting)`，避免与菜单重复入口。排序会话中的「拖动书签到其他分类」提示不隐藏，否则移动端拖拽时没有任何说明。桌面端三个入口位置全部不变 |
| 追加验证 | 组件测试扩到 10 条：新增菜单项顺序断言（`['新增书签','新建子分类','排序']`）、三个操作各自的回调隔离断言（点一个不能触发另两个）、「只渲染当前可用操作」断言，以及 `CategorySection` 的隐藏规则与 `class:sorting` 源码断言。`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 699 passed |
| PROB-11v 真实浏览器验证（2026-09-05，已闭环） | 隔离临时 headless Chrome + `Emulation.setDeviceMetricsOverride`（390×844、DPR 3、`mobile: true`）+ `setTouchEmulationEnabled`，媒体查询与 computed style 真实生效；交互全部用 `Input.dispatchTouchEvent` 真实触控，不用 `dispatchEvent`。逐条对照 PROB-11v 的验收项：**① 三项只在菜单里** —— `.scope-more-menu` 内 `role="menuitem"` 恰为 `['新增书签','新建子分类','排序']`；**② 主分类区不再直显** —— `.section-actions` computed `display: none`、`.scope-action-direct` 同为 `none`（两个分类区都测）；**③ 菜单在视口内不被遮挡** —— 菜单 `z-index: 80`，实测高于同页固定层 `.floating-actions`(70) 与 `.toc-mobile-btn`(40)；三个菜单项中心点 `elementFromPoint` 全部命中自身（无覆盖物），菜单盒 160×134 完整在视口内；**④ 触控可点** —— 真实触控打开菜单、菜单项触控目标 150×40；**⑤ Esc / 外部点击一致** —— Esc 关闭且 `document.activeElement` 回到 `.scope-more-trigger`、`aria-expanded` 回 `false`；重开后触摸菜单外空白同样关闭并复位 `aria-expanded`；**⑥ 排序会话拖拽提示仍可见** —— 从菜单点「排序」进入排序态后，每个分类区的 `.section-actions` 带 `sorting` 且 computed `display: flex`，`.sort-session-label`「拖动书签到其他分类」(118×17) 与 `.sort-hint`「拖动卡片调整顺序，完成后点击「保存排序」。」(358×18) 都可见；排序态下菜单只剩 `['新建子分类']`，证明「只渲染当前可用项」成立；点「取消」退出后 `.section-actions` 全部回到 `display: none` |
| PROB-11v 断点两侧对照 | 390px 与 720px：`.scope-more` 可见（触发器 36×36）、`.scope-action-direct` 与 `.section-actions` 均 `none`。721px 与 1280px：`.scope-more` 的 computed `display: none`（触发器 `getBoundingClientRect` 为 0×0、`offsetParent` 为 `null`、命中测试为 zero-size，确认已移出无障碍树与命中链），`.scope-action-direct` 105×34 可见、`.section-actions` `flex` 且含「新增书签 / 排序」。**注意**：只读触发器自身的 computed `display` 会得到 `inline-flex` 而误判为可见——真正被 `max-width: 720px` 隐藏的是外层 `.scope-more`。断点互斥的结论成立 |
| PROB-11v 未能推到极限的一项 | 「菜单不溢出视口」在本次种子数据可达的最靠下位置成立：390×420 矮视口下触发器 `top=212`、菜单 `254–388`，余量 32px 全部在视口内。无法把触发器推得更低是因为页面已滚到底（只有 2 个一级分类）。更长内容下的贴底行为未测；组件没有翻转定位逻辑，若日后出现贴底溢出属新问题 |
| PROB-11v 观察（未列为缺陷） | 菜单项高 40px、触发器 36×36，均低于 44px 触控建议值。36×36 是项目既有的移动端触控下限约定（见 `ADMIN_MOBILE_LAYOUT_PLAN.md` 与浮动操作行），本条只做记录，不在本轮改动。全程 console error 0、pageException 0、failedRequest 0、4xx/5xx 0 |

### PROB-12（P3，已完成）R-03 入口位置与建议方案不同

| 项 | 内容 |
| --- | --- |
| 来源映射 | `R-03`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:86`；Issue #11 |
| 差异 | 需求建议入口在「经常访问」标题右侧；源码 `src/components/HomeFloatingActions.svelte:90-100` 实现为登录态全局浮动操作 |
| 定性 | 低风险。需求同时接受「稳定入口」，且 #11 原文把新增主分类标为可选 |
| 处理动作 | 仅回写文档：在 R-03 段记录最终入口位置为浮动操作行 |
| 裁定与处理结果 | 用户 2026-09-04 选 **回写文档，确认浮动操作行就是最终形态**。已改写 R-03 的建议交互方案与「已确认决策」：入口固定在登录态全局浮动操作行，并写明不放「经常访问」标题右侧的理由——该区域在未登录、无访问记录或 `most_visited_count` 为 0 时不渲染，入口会跟着消失；同时删掉了原先「移动端使用经常访问标题栏的加号或更多菜单」这条与实现冲突的建议。`HomeFloatingActions.svelte` 未改动 |

---

## 4. C 类：遗留验证欠账

这些条目**有源码实现证据**，缺的是可复核的运行验证。不要当作未实现重做。

### PROB-13（P1）平台优化剩余真机验收 7 组未闭环

- 来源映射：`L1`/`L3`/`L4`/`S3`/`S3 导入提示`/`S4`/`U1–U4`；`docs/plans/PLATFORM_OPTIMIZATION_PLAN.md:861-872`
- 文档明确「单元测试只能锁住纯函数、源码契约和路由行为」，以下必须部署后真实浏览器确认：
  - `L1`（`:865`）二访首页无 `/api/install/status`，清 localStorage 后首访仍出现一次。
  - `L3`（`:866`）首访后 Cache Storage `cf-navs-v15` 含 `index-*.js`/`index-*.css`；二访来源标记 ServiceWorker。
  - `L4`（`:867`）二访首屏不等网络可绘制；部署新版本后出现「已检测到新版本」；离线可打开。
  - `S3`（`:869`）后台自定义 JS 真实执行、无 CSP 违规、切主题不重复执行（`blob:` 在 `script-src` 下的行为单测环境验证不了）。
  - `S3 导入提示`（`:870`）导入含自定义 JS 的备份时覆盖确认弹窗出现体积提示且换行正常。
  - `S4`（`:871`）「当前页弹层」打开可嵌入站点正常渲染。
  - `U1–U4`（`:872`）桌面与 `390x844` 下五个弹窗尺寸一致、书签弹窗底部操作栏不换行不溢出；iOS Safari 点输入框不放大。
- `S1` 单列为 PROB-07（状态自相矛盾）。
- 处理动作：部署后按上表逐条真机执行并回写台账；`U1–U4` 与 iOS 放大项需真实 iOS Safari，隔离 Chrome 不可替代。

### PROB-14（P1）R-08 部分导出的部署版本与原作者预期未同步

- 来源映射：`R-08`；`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:91`、`:351`；`CHANGELOG.md:72`
- 源码事实：功能存在且成链 —— `src/lib/appBackup.ts:26-76`（子集筛选 + 强制补父分类 + settings 开关）、`src/components/BackupPanel.svelte:22-99,147-207`（三态树 / 默认全选 / 空选拦截）、`src/lib/appImportExport.ts:35-53`（空选报错）、`src/App.svelte:933-936`（接线）；`tests/unit/appBackup.test.ts` 覆盖 helper
- 欠账：部署版本是否已含该功能、Issue #9 原作者是否认可该形态，均未验证。云端 #9 仍 Open
- 处理动作：部署后在生产自定义域实测一次导出下载与 replace/merge 导入，再决定是否向 #9 回帖征询原作者确认。**GitHub 写操作需单独授权**

### PROB-15（P1，已完成）直接刷新 `/admin` 的真实 Chrome 回归待办未闭环

- 来源映射：`docs/reference/PROJECT_OVERVIEW.md` 的维护待办「直接刷新 `/admin` 的真实 Chrome 回归」
- 待办原文：确认首页不会短暂挂载，并记录控制台错误、页面异常和失败请求
- 源码事实：`src/App.svelte` 有 `isAdminPath` 判定与 Admin 懒加载路径，但「不短暂挂载首页」需运行观测
- 处理动作：隔离临时 Chrome 直接导航 `/admin`，采集 console / pageException / failedRequests 与首页 shell 出现帧；按本地 `real-chrome-cdp-testing` 流程只开专用 target 并清理
- 仪器（2026-09-04）：**不是**靠事后查 DOM——那证明不了「短暂挂载」。用 `Page.addScriptToEvaluateOnNewDocument` 在任何应用代码执行前装一个 `MutationObserver`（observe `document`，`childList + subtree`），记录 `.app-splash` / `.home-shell` / `.admin-page` 三个标志节点各自**首次进入 DOM** 的时刻与顺序。每次导航都是新 document，`window.__probe` 自动重置，不会串场
- 验证结果（登录态直达 `/admin`，本地隔离实例 + 隔离临时 headless Chrome）：挂载顺序恒为 `app-splash → admin-page`，**`home-shell` 从未进入 DOM**。首次导航 `app-splash` 17ms / `admin-page` 89ms；随后 5 次 `ignoreCache` 硬刷新分别为 37/86、25/56、28/61、36/74、24/55 ms，6 次全部无 `home-shell`。`public_mode=false`（私有站点，走另一条 gate 分支）再测一次：`app-splash` 32ms / `admin-page` 101ms，同样无 `home-shell`。每次 console error 0、pageException 0、failedRequest 0、4xx/5xx 0。`document.title` 为「管理后台」，`.admin-page` 首屏标题「导航内容管理」，`location.pathname` 保持 `/admin`
- 顺带记录（不是缺陷）：**匿名**直达 `/admin` 时挂载顺序是 `app-splash → home-shell`（18–24ms / 52–136ms）且停在首页。这是公开模式下 `createHomeGateState` 的既定行为——未登录时 `/admin` 落回首页，不是「短暂挂载」。读本条时不要把它当成回归
- 一次性异常（未复现）：最早一次匿名导航记录到 1 条 `net::ERR_FAILED`，但当时未记 requestId → URL 映射；补上映射后重跑该场景 0 失败，后续 7 次导航也都是 0。判定为 `about:blank` → 首个 `/admin` 请求切换时的一次性取消，不作为缺陷登记
- 清理：只关本次创建的 target；`Browser.close` 仅对 manifest 标记 `browserStartedByTest=true` 的实例执行；按命令行精确匹配确认残留进程为 0 后删除 `cf-navs-chrome-profile-probe15-*` 临时 profile。未按进程名批量清理，未触碰用户自有 Chrome

### PROB-16（P2，已完成）设置页/导航/导出的关键交互数值未进可复跑回归套件

- 来源映射：`docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md:333-344`、`:346-369`
- 已有可复跑闸门：`scripts/smoke-test.mjs`（75 项 API 端到端）、`scripts/chrome-regression.mjs`（25 项，覆盖首页渲染/搜索/主题、后台 shell、书签搜索、设置页与备份页渲染、右键编辑弹窗、登出与三项鉴权探针，见 `scripts/chrome-regression.mjs:1054-1079`）
- 欠账：台账声称的具体数值型断点证据**不在**这两个套件内，属一次性人工 CDP 证据 —— `820px` 桌面分行 2 行/98px、箭头隐藏、子菜单在视口内（`:337`）；浮动按钮 `top=18`/`nav top=12`/`z-index=70`、移动 `top=14`/`nav top=8`（`:338`）；`721/768/799px` 中间断点复验（`:354`）；实际下载 3 分类/6 书签与 replace+merge `code=0`（`:335`）
- 处理动作：把上述数值断言补入 `scripts/chrome-regression.mjs`，或在台账明确标为「一次性人工证据，不构成持续回归」
- 处理结果：按第二个选项落地 —— 在 `docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §12 台账表后新增定性块，逐条点名 `820px` 分行 2 行/98px、浮动按钮 `top=18`/`nav top=12`/`z-index=70` 与移动 `top=14`/`nav top=8`、`721/768/799px` 中间断点、实际下载 3 分类/6 书签与 replace+merge `code=0`，明确标为「一次性人工 CDP 证据，不构成持续回归」，并写清两个可复跑套件实际只覆盖到「已渲染 / 控件存在」与 API 端到端。`scripts/chrome-regression.mjs` 未改动
- 不补断言的理由（已核实，非推断）：该脚本需要可达的 `BASE_URL`（环境变量或被忽略的 `verify.local.json`）与真实管理员凭据，且其安全场景会真实改写再还原管理员密码；脚本只启动/连接 Chrome，不启动应用。当前套件没有视口仿真、`getComputedStyle` 采样或下载/导入自动化能力，补数值断言还需引入确定性分类/书签 fixture。`AGENTS.md` 规定未经明确要求不启动本地服务、不部署，故这些断点只能并入 PROB-13 的部署后验收

### PROB-17（P2）后台移动端布局缺三档视觉截图

- 来源映射：`docs/plans/ADMIN_MOBILE_LAYOUT_PLAN.md:206-214`
- 欠账：实现后未补备份/导入页移动截图，以及 `430x932`、`768x1024`、桌面补充截图；文档明确契约测试不能替代真机视觉
- 处理动作：按既有截图流程（`bringToFront` → `fonts.ready` → 布局读取 → 重绘）补齐；截图落 `docs/screenshots/` 需先确认是否属于发布资产

### PROB-18（P2，已完成）无 e2e 层，行为验证依赖源码文本断言

- 来源映射：`C-6`、`C-12`；`docs/plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md:44`、`:50`
- 事实：`tests/` 下 100 个文件全部是 `tests/unit/*.test.ts`，无 `tests/e2e`；仓库无 `@testing-library/svelte`，组件契约测试多为 `readFileSync` + `toContain`
- 影响：焦点陷阱、键盘导航、IME、剪贴板权限、hover/reduced-motion 等只能靠人工浏览器闸门，PROB-01/02/03 的修复也受此约束
- 处理动作：不新增框架的前提下，坚持「行为先抽纯函数再单测」；把不可单测的交互固定登记为浏览器人工闸门。是否引入 e2e 需单独决策
- 用户裁定（2026-09-04）：采用**方案 B「补组件层，不引入 e2e」**。核对推翻了条目原本的定性——缺的不是 e2e，而是组件/DOM 层：`FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md:395-398` 列的焦点陷阱、`aria-activedescendant` 有效性、`isComposing` 拦截、destroy 清理都不需要真浏览器，而 `:399-401` 的剪贴板 transient activation、`100dvh` + 虚拟键盘、computed style 验收则**jsdom 做不到**，必须留给真实浏览器。两层用不同工具，不能用一个「要不要 e2e」的答案覆盖
- 处理结果：新增 devDependencies `@testing-library/svelte@^4.2.3`（peer 支持 svelte ^3/^4/^5）与 `jsdom@^26.1.0`（engines `node >=18`，与 CI 的 `node-version: 20` 兼容；`jsdom@30` 要求 node ^22.22.2/^24.15.0/>=26，会在 CI 上不满足 engines，故不用）。**不改全局 vitest 环境**：组件测试用文件首行 `// @vitest-environment jsdom` 单文件启用，既有 100 个文件仍跑默认 node 环境，零回归风险。新增 `tests/unit/categoryTreeSelect.test.ts` 作为首个组件测试，断言 3 条行为：每条 `notice` 的 `aria-describedby` 真正解析到一个带该文案的元素、无 `notice` 的选项不带该属性、带后果提示的选项仍可点击且点击后菜单关闭并改显新选择。同时退役 `tests/unit/adminBookmarkLayout.test.ts` 里被真实 DOM 断言取代的 4 条 `CategoryTreeSelect.svelte` 源码文本断言，避免重复覆盖
- 为什么组件层比原来的断言强：`readFileSync` + `toContain` 只能证明模板里写了 `aria-describedby={item.notice ? ...}` 这串字符，证明不了 id 真的解析到存在的元素、也证明不了选项可点。组件测试是在真实 DOM 上查 `#${id}` 并触发 `fireEvent.click`
- 遗留（增量进行中，见下）：剩余源码文本断言文件的逐步迁移；以及**方案 C** —— 用户裁定改为不引入 Playwright，而是走本地已有 Chrome 或 `real-chrome-cdp-testing` 技能路线，见 BACKLOG 的 `PROB-18c`

#### PROB-18b（P2，增量进行中）源码文本断言文件迁到组件层

按「每次迁一个文件」推进，不做一次性大迁移。

**第 1 个（2026-09-05）：`adminEmptyStateMarkup.test.ts` → `adminEmptyState.test.ts`（已删除旧文件）**

- 原文件 5 条断言全是 `readFileSync` + `toContain('暂无分类')` 一类。它们能证明的只有「模板里写了这串字」——证明不了空态在正确条件下渲染、CTA 真的可点，也证明不了「没有分类时不引导用户去加书签」这条实际的产品逻辑
- 新文件 9 条组件测试（jsdom），按状态组合渲染真实 DOM：分类面板的加载态 / 无数据 / 搜索无结果三档互斥（「暂无分类」与「没有匹配的分类」不能混淆——一个该去创建，一个该改关键词）；空态 CTA 点击真的触发回调；访客态该 CTA 为 `disabled`。书签面板的「一个分类都没有」档**刻意不给 CTA**（没有分类时新增书签必然失败），已有分类才给且可点；加载中不显示「暂无书签」，避免把加载中误报成空数据
- 反向对照：给「一个分类都没有」那档硬加一个「新增书签」按钮，`一个分类都没有时引导去建分类，不给「新增书签」CTA` 精确失败；恢复后 9 条全绿
- 旧文件里那条 `not.toContain('`n')`（PowerShell 把字面量反引号 n 写进模板的事故）**没有丢**，改成按**渲染文本**断言：那两个字符如果进了模板会被当作可见文本渲染出来，按渲染结果断言比在源码里搜字符串更贴近后果
- 定位器纠正：空态 CTA 与页头同名按钮共存，`getAllByRole` 取最后一个是靠出现顺序的脆弱写法；改为先定位 `.admin-empty-state` 容器再取其中的按钮
- 一处**没有**写成假证据的地方：访客态那条只断言 `disabled === true`，不用 `fireEvent.click` 去演示「点了没反应」。jsdom 的 `dispatchEvent` 会把事件送到禁用按钮上（真实浏览器不会），拿它当证据是自欺
- 验证：`npx vitest run` 104 files / 730 passed（迁移后总数不变，旧文件 5 条换成新文件 9 条）；`npm run type-check` 0 errors / 0 warnings

**第 2 个（2026-09-05）：`adminMobileLayout.test.ts` 的两组截断断言 → `adminMobileTruncation.test.ts`（原文件保留 3 组纯 CSS 断言）**

- 迁的是「移动端截断标题/URL 但保留完整值」两组。原断言形如 `toContain('truncateUnicodeText(bookmark.title, 12)')` 与 `toContain('href={bookmark.url}')`：只能证明源码里写了这两个调用，证明不了截断后完整值仍然可访问。而这正是 `ADMIN_MOBILE_LAYOUT_PLAN.md` 的硬约束——截断只是视觉手段，完整 `title` / `aria` / `href` 必须保留
- 新文件 6 条组件测试（jsdom）：完整标题仍在无障碍树里（`aria-label` + `title` 都是完整值，截断版本是 `aria-hidden` 装饰）、截断结果确实更短且是原标题的前缀 + 省略号（不是原样重复）、**移动端 URL 的 `href` 是完整地址**、短标题不被截断也不凭空加省略号、私密标记出现在元信息里、访问分析零访问列表两个阈值都生效且完整值可访问、全部书签有访问记录时显示祝贺态而不是空列表
- 反向对照：把移动端 URL 的 `href` 换成截断值（这正是原断言想防的错），`移动端 URL 截断不改变链接目标` 精确失败；恢复后 6 条全绿
- **原文件保留 3 组不迁**：`grid-template-columns` / `padding` / `position: fixed` / `env(safe-area-inset-bottom)` 这些纯 CSS 布局约定，jsdom 不做布局、拿不到 computed style，写成组件测试只会变成更花哨的字符串匹配。已在文件顶部注明它们属 PROB-18c 的范围，避免后人以为这里漏了截断契约
- 夹具教训：第一版把标题设成恰好 20 字素，而访问分析的阈值就是 20 —— `truncateUnicodeText` 在「长度 <= 阈值」时原样返回，导致那条断言假失败。改成 24 字素并注明为什么不能贴边取值
- 验证：`npx vitest run` 106 files / 740 passed；`npm run type-check` 0 errors / 0 warnings；`npm run build` 成功

**第 3 个（2026-09-05）：`uiComponents.test.ts` 原地改成真 DOM 断言（`d901f45`）**

- 原文件断言 `toContain('role="switch"')`、`toContain('dispatch(\'change\', checked)')` 一类。新版挂载 Switch / Tooltip / InputGroup / Slider，断言 `aria-checked` 随点击翻转、`change` 事件载荷、tooltip 的 portal 落在 `document.body`、Slider 的数字输入与滑块双向同步
- 反向对照：去掉 `handleKeydown` 的 disabled 守卫，测试仍绿——因为 jsdom 对 disabled 按钮仍派发 click，而 Switch 有两道防线（`handleKeydown` 与 `toggle` 各自检查）。两道都去掉才红。已在文件里注明这属 defense-in-depth，不是空转断言

**第 4 个（2026-09-05）：`categoryCollapseMarkup.test.ts` 后两组 → `categoryCollapseBehavior.test.ts`（`10b039d`）**

- 迁的是后台分类面板与左侧导航的折叠行为：默认收起、点箭头独立展开、搜索时自动展开命中组且可单独收起、换关键词重置手动收起状态、当前选中子分类时自动展开父级路径
- 原文件保留第一组（Home 传给 CategorySection 的 prop、`sortableList` 的 `filter` 选项、卡片网格 CSS 变量与断点）——那些是跨组件接线与样式，挂载单组件读不到

**第 5 个（2026-09-05）：`adminSettingsLayout.test.ts` 部分 → `adminSettingsBehavior.test.ts`（`4eed21f`）**

- 16 条真 DOM 断言：六个分区互斥切换、控件到 payload 的实际写入、未改动时保存按钮禁用（防空提交覆盖线上设置）、高级设置展开/收起、卡片风格与尺寸控件的置灰联动、导航位置与「常驻展开」的联动
- **写测试时发现的真缺陷**：尺寸控件的 `min` / `max` 是硬编码字面量，与 `shared/settings.ts` 的归一化区间是两份独立常量，调整裁定值时 UI 与服务端会分叉。已改为引用 `CARD_SIZE_LIMITS` / `CARD_ICON_SIZE_LIMITS`，PROB-28 的 40 px 裁定值由此单点化
- 夹具教训：`DEFAULT_SETTINGS` 在 `worker/lib/settingsData`，**不在** `shared/settings`。从后者导入拿到的是 `undefined`，`{ ...undefined, site_title: 'X' }` 静默退化成只有一个字段的对象，而 `createSettingsFormState` 又把默认值补齐，于是大部分断言照样通过——一个引用不存在导出的测试文件看起来是绿的

**第 6 个（2026-09-05）：`adminBookmarkLayout.test.ts` 部分 → `adminBookmarkBatchBehavior.test.ts`（`b369865`）**

- 8 条真 DOM 断言：工具条按选中状态出现/消失且不在滚动容器内、批量删除交出选中 id、批量移动默认落在多数分类、私密目标出现 `role="status"` 后果提示、公开目标不出现、确认后把分类与位置一起交给回调
- 反向对照：默认目标退回首个选中项、工具条永不渲染、摘掉私密提示，各自精确失败。提示里的计数语义（已在私密分类里的书签不计入「移入后隐藏」）留在纯函数层 `adminListState.test.ts`，那里已有对应断言
- 原文件只留一条 CSS：`grid-template-rows`、`z-index`、`env(safe-area-inset-bottom)` 偏移

**第 7 个（2026-09-05）：`navigationLayout.test.ts` 部分 → `topNavigationSubmenu.test.ts`（`e1b55a9`、`375900b`）**

- 13 条真 DOM 断言：子菜单开合、子项列表、选中后上报导航目标并收起、无子分类的顶部项不弹菜单、键盘触发（`detail === 0`）把焦点送进首项而鼠标点击不抢焦点、方向键循环与 Home/End、Escape 关闭并归还焦点、点浮层外关闭而点内部不关、打开的父分类从分类树消失或失去子项后菜单跟着关
- 删掉三条钉实现标识符的断言：拖动时的局部 `track` 变量名、焦点跳转的源码行、无子项守卫
- 「打开的父分类消失」这条只有在模板守卫与响应式清理**都**去掉时才红，两道防线互为兜底，已在文件里说明

**关键环境修复（2026-09-05，`375900b`）：Svelte 的 `browser` 解析条件**

- Svelte 4 的 `exports["."]` 只在 `browser` 条件下指向 `src/runtime/index.js`，否则落到 `src/runtime/ssr.js`，而那里的 `onMount` 是空实现。Vitest 默认不带 `browser` 条件，于是**所有组件在 `onMount` 里注册的监听器在测试中全部不存在**
- 用 `addEventListener` spy 加直接 dispatch 在两个独立组件上双向确认：Sidebar 的 document `keydown`/`pointerdown` 从未触发，HomeFloatingActions 从未注册 scroll 监听
- `vite.config.ts` 在 test 模式补 `resolve.conditions: ['browser']`（生产构建本来就命中 browser）。这直接解锁了此前被判定「jsdom 不可达」的交互：Escape 关闭、点外部关闭、滚动显隐
- 教训：把「测试里观察不到」直接当成「jsdom 能力不足」会写出错误的不可迁移结论。先验证运行时解析条件，再下判断

**第 8 个（2026-09-05）：`homeFloatingActions.test.ts` 的滚动断言原地改成行为（`375900b`）**

- 回到顶部按钮在页面顶部不渲染、越过偏移后出现、滚回顶部再次收起、点击把窗口滚到 0、`prefers-reduced-motion` 下从 `smooth` 换成 `auto`
- 删掉一条假装检查监听清理的用例：把 `removeEventListener` 删掉它照样绿——组件销毁后 DOM 本来就没了，而 jsdom 不提供枚举监听器的 API

**第 9 个（2026-09-05）：`confirmationFlow.test.ts` 的弹层断言 → `confirmDialogBehavior.test.ts`（`a340b20`）**

- 原断言把函数体连缩进一起钉进 `toContain`，改个格式就红，却证明不了禁用态行为。8 条真 DOM 断言覆盖：关闭态不渲染、`alertdialog` 同时接入标题与后果说明、确认/取消各自只触发自己的回调、Enter/Escape 等价于两个按钮、处理中两个按钮都禁用且点击与键盘都不再触发、确认被禁用时取消仍可用、点遮罩等于取消、关闭态不响应 Enter
- 反向对照：摘掉 loading 守卫、绕过 `confirmDisabled`、关闭态仍响应键盘、把取消与确认一起禁用，四个变异各自精确失败

**注记（2026-09-05，`3367674`）**：13 个仍保留源码文本断言的文件在开头写明断言对象与不迁移的理由，分三类——jsdom 不做布局/不评估媒体查询的样式契约；没有可挂载对象的目标（`scripts/*.mjs`、`public/sw.js`、`worker/index.ts`、模块导出面）；接线与语句顺序断言（需要先挂载约 1100 行的 `App.svelte`，属 PROB-24 的拆分前置）。`chromeRegressionCleanup.test.ts` 刻意保留：它用 `not.toContain` 禁掉按进程名批量结束浏览器的写法，脚本源码文本正是恰当的证据面

**进度**：本轮迁 7 个文件（累计 9 个），并修掉一个让所有 `onMount` 监听在测试中失效的解析条件缺陷。当前 111 个测试文件 / 812 条断言，其中 11 个是 jsdom 组件测试；仍有 24 个文件含 `readFileSync`，全部已注明保留理由

---

## 5. D 类：安全与稳定性风险

### PROB-19（P1，已完成 a/b，c 未开工）跨 isolate 登出撤销存在生效延迟与失败静默

- 来源映射：`S1`；`docs/plans/PLATFORM_OPTIMIZATION_PLAN.md` 的 S1 小节；`docs/guides/TROUBLESHOOTING.md` 的会话与登录小节
- 源码事实：`worker/routes/auth.ts` 的 `authRoutes.post('/logout')` 写 KV 撤销；`worker/middleware/auth.ts` 的 `validateSession` 只在内存缓存未命中时查撤销名单；`worker/lib/bootstrap.ts` 的 `ensureAdminBootstrap` 不要求 `SESSION` 绑定
- 残余语义：撤销最长约 15 秒才在其他 isolate 生效；KV 写失败时登出**仍返回成功**；JWT 在 `exp` 之前仍可验签
- 处理动作：a) KV 写失败时不再返回纯成功，向调用方暴露可辨识状态；b) 在 `API_CONTRACT.md` 写明登出的最终一致语义与生效窗口；c) 缩短 token 有效期或引入版本号校验属架构决策，需单独评估
- 验证：`scripts/smoke-test.mjs` 的「登出」小节覆盖同 isolate 路径；跨 isolate 与真实 KV 故障注入需部署环境
- 处理结果（a）：`POST /api/logout` 的返回从 `null` 改为 `shared/types.ts` 的 `LogoutResp` 判别联合 —— `{ revoked: true }`、`{ revoked: false, reason: 'store_unavailable' }`（KV 写入抛错）、`{ revoked: false, reason: 'store_unconfigured' }`（请求进来时没有 `SESSION` 绑定）。**三种都保持 HTTP 200 + `code=0`**：退出登录不能失败，返回错误会把用户留在登录态里，这与「暴露可辨识状态」并不冲突——状态放在 `data` 里而不是 `code` 里。同时把原先 `if (token)` 的静默兜底改成显式 401（`authRequired` 已保证 token 存在，静默成功会谎称做了撤销）
- 处理结果（前端消费）：`src/lib/appAuthController.ts` 新增纯函数 `logoutRevocationWarning`，把 `LogoutResp` 映射成用户可读警告并给出可执行补救动作（改密码走 `rotateJwtSecret`，一次性作废全部会话）；`authStore.logout()` 现在返回 `LogoutResp | null`（`null` = 本地无会话可退或请求本身失败，此时无从判断服务端状态，不凭空警告）；`src/App.svelte` 的 `handleLogout` 在视图切换之后弹 12 秒 error Toast。不改 API client 的错误路径
- 处理结果（b）：`API_CONTRACT.md` 的鉴权规则与认证接口两处改写 —— 端点表返回类型改 `LogoutResp`，新增三态表（含每种结果下 token 的实际状态）、`reason` 的可扩展约定、以及未知 `reason` 必须仍警告的客户端要求。原有的 15 秒窗口与 KV 写失败描述保留并指向新表
- 未做（c）：缩短 token 有效期或引入 token 版本号校验属架构决策，未评估、未实现
- 验证结果（实测，非推断）：本地隔离实例双实例探针。① 有 `SESSION` 绑定时 `POST /api/logout` 实际返回 `{"code":0,"msg":"ok","data":{"revoked":true}}`，随后同一 token 调 `/api/me` 得 401。② 用一份去掉 `[[kv_namespaces]]` 的临时配置、指向**同一个** D1（因此 `jwt_secret` 相同、旧 token 仍验签通过）启第二个实例，模拟「令牌签发后绑定被移除」：`/api/me` 先返回 200 证明 token 有效 → `POST /api/logout` 返回 `{"revoked":false,"reason":"store_unconfigured"}` → 同一 token 再调 `/api/me` **仍是 200**。这条直接证明了本条目所说的「静默失败」后果确实存在，且现在会被报告。③ 清空 D1 后 `node scripts/smoke-test.mjs` 仍 **75/75 全绿**，`登出 code=0` 未被返回值变更破坏。单测：`tests/unit/sessionRevocation.test.ts` 三态各一条（`store_unavailable` 用抛错的 KV 假实现，真实 KV 故障本地无法注入），`tests/unit/appAuthController.test.ts` 5 条覆盖 `logoutRevocationWarning`（含未知 `reason` 不退化成 `undefined` 文案）。`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 708 passed；`npm run build` 成功
- 验证结果（L2 真实浏览器，隔离临时 Chrome）：headless Chrome + 独立 `cf-navs-chrome-profile-l2probe-*` profile，通过 CDP `Input.dispatchMouseEvent` / `Input.insertText` 做真实点击与键盘输入，不用 `dispatchEvent` 代替。① `SESSION` 在位时点「退出登录」→ 回到访客态，**不弹**任何撤销警告（Toast 容器为空）。② 同一浏览器会话不刷新、后端从有绑定实例换成无绑定实例（同端口、同 D1）后点「退出登录」→ 回到访客态并弹出 `toast-item toast-error`，文案为「已退出登录，但服务端未能作废旧的登录令牌（部署缺少 SESSION 绑定）。这台设备上的登录态已清除；如果担心令牌被别人复用，请修改密码——改密码会立即作废全部会话。」，实测尺寸 380×107 且完整在视口内（`getBoundingClientRect` 采样）。换后端后旧 token 调 `/api/me` 先返回 200，证明「令牌仍然有效」这一后果真实存在。全程 console error 0、pageException 0、failedRequest 0，唯一 4xx 是刻意探测无 token 的 `/api/me` 401。清理：只关本次创建的 target，`Browser.close` 仅对 manifest 标记 `browserStartedByTest=true` 的实例执行，按命令行精确匹配确认残留进程数为 0 后删除临时 profile，未按进程名批量清理、未触碰用户自有 Chrome
- 顺带查实（**已由下方 PROB-31 修复**）：完全没有 `SESSION` 绑定的部署**连登录都做不到** —— `worker/middleware/rateLimit.ts` 的 `loginRateLimit` 无条件读 `env.SESSION`，实测 `POST /api/login` 返回 `code=1500`。而 `validateSession` 与 logout 都把该绑定当可选，`worker/types.ts` 的 `Env.SESSION` 却是必填类型，三处口径不一致。这也是为什么 `store_unconfigured` 只在「令牌签发后绑定被移除」时可达；PROB-31 收紧 `validateSession` 后该窗口进一步收窄到「内存缓存命中的 15 秒内」
- 仍未验证：跨 isolate 的 ≤15 秒撤销窗口，以及真实 Cloudflare KV 写入故障下的 `store_unavailable`。本地 `wrangler dev` 的 KV 是单进程模拟，两者都需要部署实例，属 PROB-19v

#### PROB-31（P3，已完成）`SESSION` 绑定的必选性三处口径不一致

- 来源：PROB-19 实测时顺带查出并登记
- 冲突（三处口径）：`worker/middleware/rateLimit.ts` 的 `loginRateLimit` **无条件**读 `env.SESSION`（缺绑定时 `env.SESSION.get` 抛 TypeError，被全局 `onError` 兜成 `code=1500 internal server error`，运维看不出是绑定问题）；`worker/middleware/auth.ts` 的 `validateSession` 把它当**可选**并**静默跳过撤销名单检查**；`worker/types.ts` 的 `Env.SESSION` 又是**必填**类型。此外 logout、点击计数、`/install` 三处各写了一套内联 `if`，判定条件还不一样（`!env.SESSION` vs `typeof env.SESSION.get !== 'function'`）
- 裁定的口径：绑定缺失是**确定性的配置错误**（`/install` 本来就以 `bindings_missing` 拒绝安装），所以按「正确性是否依赖它」分两类 —— 鉴权与登录路径 **fail-closed**，best-effort 计数路径**降级继续**
- 处理结果：新增 `worker/lib/sessionStore.ts` 的 `hasSessionBinding`，五个读取点统一走它，不再各写内联判定。判定检查 `get` / `put` / `delete` 三个方法而不是只看 `get`：撤销名单要写、限流要删，少任何一个都会在半路抛错而不是在入口被挡住
  - `validateSession`：缺绑定时**拒绝会话**（原先静默跳过 = 「撤销名单不存在」而调用方无从得知，logout 会显得成功而 token 一直有效到 `exp`）
  - `loginRateLimit`：缺绑定时返回 `code=1500` + `required SESSION binding is unavailable`，替代 TypeError 兜出来的通用文案。登录限流的整个意义就是那个 KV，没有它不能假装限流成功
  - logout、点击计数、`/install` 的三处内联判定改用同一个 guard；点击计数**刻意保持 best-effort**（限流失效只是计数偏高，拒绝匿名点击会让公开首页坏掉）
- `LogoutResp` 的 `store_unconfigured` 仍然可达但窗口更窄：`validateSession` 的 isolate 内存缓存命中时提前返回、不复查绑定，所以「绑定存在时验过并缓存 → 绑定被移除 → 15 秒内 logout」这条路径还在；缓存过期后 `authRequired` 直接 401。代码与测试都写明了这一点
- 验证结果（本地隔离实例，双实例对照，均为实测）：用去掉 `[[kv_namespaces]]` 但指向**同一 D1**（`jwt_secret` 相同、旧 token 签名照样验得过）的临时配置起第二个实例 ——
  - `POST /api/login` → `code=1500` / `msg="required SESSION binding is unavailable"`（改造前是 `"internal server error"`）
  - `GET /api/me`（旧 token）→ **401 / code=1001**（改造前返回 200 + username）
  - `GET /api/admin/data` → 401
  - `GET /api/public/data`（匿名）→ 200，40 个分类正常返回：公开读取不受影响
  - `POST /api/public/bookmarks/:id/click`（匿名，真实 id）连打 5 次 → 全部 200 / `code=0`：best-effort 路径确实降级继续，未被限流也未被拒绝
  - 绑定恢复后 login / me / logout / logout 后 401 全部正常，无回归
- 单测：新增 `tests/unit/sessionBinding.test.ts` 5 条 —— `hasSessionBinding` 要求三个方法（半个假 KV 会被正确判成缺绑定）、`validateSession` 缺绑定时拒绝会话、受保护端点因此 401、登录给出可定位错误且**不等于** `'internal server error'`、点击计数缺绑定时仍 200。两次反向对照：把 `validateSession` 改回静默跳过 → 前两条精确失败；删掉 `loginRateLimit` 的入口判定 → 登录那条精确失败
- 顺带修掉一个**假通过的测试夹具**：`sessionRevocation.test.ts` 里模拟「KV 写失败」的假实现只有 `get` / `put`，收紧判定后被当成缺绑定，测出的是 `store_unconfigured` 而不是它要测的 `store_unavailable`。补上 `delete` 并加注释说明为什么必须三个方法都有
- 验证：`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 105 files / 736 passed；`npm run build` 成功；`npm run smoke` 75/75

### PROB-20（P1，已完成方案 1）图标代理匿名可枚举，私密对象存在信息泄漏面

- 来源映射：`S2`；`docs/plans/PR7_MERGE_REVIEW_PLAN.md:167-173`、`:209-214`
- 源码事实：`worker/routes/icon.ts` 图标端点匿名可访问并按 ID 取用；`worker/lib/iconResponses.ts` 走公共缓存；`public/sw.js:1-8` 明确图标代理不入 Cache Storage
- 风险：书签/分类图标可被按 ID 枚举，私密书签与私密分类的图标不在鉴权边界内
- 处理动作：三条候选（签名 URL、HttpOnly 会话校验、私密对象内联图标 + 缓存隔离）需先定架构，再实现。**改动会触及缓存契约与性能预算（`C-5` 图标请求 ≤ 260），不可顺手改**
- 验证：匿名枚举探针 + `npm run perf:audit` 的图标请求数与 Cache Storage 阈值
- 补充核实（2026-09-04）：`worker/index.ts:60-62` 确认两个端点注册为公开路由；`worker/middleware/auth.ts:105` 的 `authRequired` 只读 `Authorization` 头，全仓库无任何 Cookie 读写；`worker/lib/db/sql.ts:14,18,20` 的三条聚合 SQL 都是 `NULL AS icon_blob`，即后台聚合也刻意不下发图标字节（这是 `PERFORMANCE_CONTRACT.md:22` 的 ~38KB 目标与 `:39` 的 1.5MB 快照上限的前提）；`public/sw.js` 对 `/api/category-icon/*` 是 cache-first 写入访客 Cache Storage，比书签图标多漏一层。据此「私密对象内联图标」方案与现有性能契约方向相反，已排除
- 用户裁定（2026-09-04）：先做**方案 1「服务端拒绝 + 接受后台降级」**，方案 2「签名 URL」列为后续待办；不采用 HttpOnly Cookie（为一个 `<img>` 场景引入全站第二凭据通道与 CSRF 面），不采用内联图标
- 处理结果：`worker/lib/db/aggregates.ts` 新增纯函数 `isBookmarkIconAnonymouslyVisible`，复用 `getPublicCategoryIds` 的祖先链结果，不重复实现层级规则；`worker/lib/db/bookmarks.ts` 的 `getBookmarkIconData` 补选 `category_id`、`is_private`；`worker/routes/icon.ts` 两个端点在返回真实图标前判定可见性，被拒绝时返回**传空标题与空 URL** 的兜底 SVG（兜底会渲染标题前 4 字或 hostname，不传空就等于换个形式泄露），使「私密」与「ID 不存在」表现完全一致。分类端点改为一次 `listCategories` 同时得到可见集合与目标分类，比原先的 `getCategory` 少一次查询
- 缓存投毒的处理：判定发生在 edge cache 命中查询之后，而旧条目是在没有判定的情况下按不含身份的键写入的、`s-maxage` 为 6 天，所以只加过滤不会让它们失效。`worker/lib/iconResponses.ts` 新增 `ICON_CACHE_NAMESPACE = '2'` 并写进缓存键的 `ns` 参数，旧条目立即不可达；文档已写明收紧判定口径时必须同时递增该值
- 验证结果：`tests/unit/publicVisibility.test.ts` 新增用例覆盖公开书签、`0`/`false` 公开、`true`/`1` 私密、公开书签挂私密根、公开书签挂私密后代、分类已删除六种情形；`tests/unit/iconResponses.test.ts` 新增缓存键命名空间断言与路由门禁断言（含「三条拒绝路径都必须传空标题空 URL」的计数断言）。`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 101 files / 689 passed；`npm run build` 成功。**未做匿名枚举探针实测**（需可达部署实例，`AGENTS.md` 禁止未经要求启动服务/部署），也未跑 `npm run perf:audit`
- 已知残余风险：① ~~后台预览私密书签/私密分类的真实图标现在只得到兜底图标，恢复需要方案 2~~ **已由 PROB-20b 解决（见下）**；② 访客 Cache Storage 里此前缓存的私密分类图标仍在其本机，未做 SW 缓存版本递增清理——该访客此前已经能看到这些图标，不构成新增泄漏面，但要彻底清掉需要递增 `public/sw.js` 的缓存版本（会连带丢弃全部预缓存资源，未做）；③ 匿名枚举面只关到「对匿名可见」这条线，公开对象的图标仍可按 ID 枚举，这是设计如此

#### PROB-20b（P1，已完成）签名 URL 恢复后台私密对象的图标预览

- 缺口：方案 1 让后台预览私密书签/私密分类时也只拿到兜底图标。`<img>` 不发 `Authorization` 头，恢复预览必须有一条能放进 URL 的凭据
- 密钥与失效：直接复用 `settings.jwt_secret`，不引入第二个密钥——改密码走的 `rotateJwtSecret` 会顺带作废全部已签发授权，不需要额外失效通道。签名内容带域分隔前缀 `icon-access:`，所以授权串不可能被当成 JWT，反之亦然（授权是两段点分、首段是纯数字时间戳；JWT 是三段）
- **过期策略与 BACKLOG 原建议不同（有意）**：原「下一步」写「建议 `exp` 与会话 `exp` 对齐」。**未采用**——会话默认 30 天，而授权是放在 URL 里的能力凭据，会进浏览器历史、Referer 与访问日志；它又不查 KV 撤销名单（每张私密图标一次 KV 读会把 `C-5` 的图标请求预算打穿），登出后无法立即失效。改为 30 分钟短寿命，把「登出后仍可用」的窗口从 30 天压到 ≤30 分钟，前端在临近过期前 2 分钟续签
- 实现：新增 `worker/lib/iconSignature.ts`（`createIconAccessGrant` / `verifyIconAccessGrant`，`ICON_ACCESS_TTL_MS = 30 分钟`）。校验**先看形状与过期再算 HMAC**：不做这一步的话任意长度的 `key=` 都会换来一次 HMAC 运算，等于给匿名请求开一条计算放大路径。新增 `GET /api/icon-access`（`worker/index.ts` 上挂 `authRequired`）签发授权，响应 `private, no-store`
- **判定位置**：`resolveIconAccess` 在两个端点里于 **edge cache 命中查询之前**执行。命中查询用的键不含身份，先查就会把之前写给匿名访客的兜底图标返回给管理员；授权路径因此全程 `cacheKey === null`（不读也不写 edge cache）。`cacheResponse` / `cachedFallbackIconResponse` 的 `request` 参数改为可空，`null` 即「本次响应不得进共享缓存」
- **缓存策略拆成两条**：`ICON_PRIVATE_CACHE = 'private, no-store'` 用于授权路径；同时把原先混用的单一 `cacheControl` 拆成 `successCache` / `fallbackCache`。这一步是必要的——匿名兜底图标刻意只存 5 分钟（`ICON_FALLBACK_CACHE`），好让后来补上的真实图标很快生效；把它按 7 天的成功策略缓存等于把「暂时没有图标」钉死一周
- **Service Worker**：`public/sw.js` 的 `cacheIconResponse` 新增 `no-store` 拒收。Cache Storage **不会自己遵守 `Cache-Control`**，`/api/category-icon/*` 又是 cache-first，不显式拒收就等于把私密图标留在本机、并让同一浏览器 profile 下的后续访客态 cache-first 命中它
- 前端：新增 `src/lib/iconAccessKey.ts`（`iconAccessKey` store + `ensureIconAccessKey` + `withIconAccessKey`）。`refreshLoggedInData` 取一次授权（失败只降级成兜底图标，不影响数据刷新）；`authStore.applySession(null)` 一处漏斗清掉授权，覆盖登出与 401 两条路径。只有后台三处消费（`CategoryListPanel`、`BookmarkListPanel`、`AnalyticsPanel`）——**首页公开卡片不带 key**，否则公开图标响应会变成 `private, no-store`，白丢 edge cache 与 SW 缓存
- 验证结果（本地隔离实例 + 隔离临时 headless Chrome，均为实测）：
  - 服务端探针：匿名请求私密书签/私密分类图标与「id 不存在」**响应字节完全相同**（sha1 一致、326 B 兜底 SVG、渲染文本为 `NAV` 不含标题）；带合法授权时同一端点返回 `image/png` 33270 B、`Cache-Control: private, no-store`；伪造 `key` 与过期 `key` 都退回匿名口径、字节与匿名一致；匿名请求 `GET /api/icon-access` 返回 **401**
  - 兜底 TTL：用**全新 id**（避开改策略前写入的旧 edge cache 条目）实测匿名兜底为 `public, max-age=300, s-maxage=300`，不是 7 天
  - 浏览器端：后台分类管理里私密分类的 `<img src>` 实际带 `key=`，图片 `complete && naturalWidth > 0`、`naturalWidth×naturalHeight = 512×512`，真实图标已渲染；同页面 `fetch` 对比同一端点「不带 key → 326 B 兜底 + `x-icon-fallback: 1`」与「带 key → 33270 B PNG + `private, no-store`」
  - Cache Storage 审计：4 个缓存里图标条目共 1 条，是**不带 key** 的公开条目；**带 `key=` 的条目数为 0**，证明 SW 拒收生效
  - 单测：新增 `tests/unit/iconAccessGrant.test.ts`（16 条，含跨密钥拒绝、过期边界、畸形输入、与 JWT 不可混淆、授权/匿名两条路径的响应差异、私密响应不进共享缓存、归一化键丢弃随机参数、兜底 TTL）与 `tests/unit/serviceWorkerIconCache.test.ts`（3 条，在 VM 里跑真实 `public/sw.js` 并派发 fetch 事件）。后者做过**反向对照**：删掉 `no-store` 拒收那一行，`never writes a no-store category icon to Cache Storage` 精确失败
  - `npm run type-check` 0 errors / 0 warnings；`npx vitest run` 103 files / 722 passed；`npm run build` 成功
- 顺带退役两条源码文本断言（`CONTRIBUTING.md` 第 4 节：源码文本断言只用于「接线是否存在」，不用于证明行为）：`iconResponses.test.ts` 里数 `cachedFallbackIconResponse(c, cacheKey, '', '')` 出现次数和数 `iconCacheKey(c.req.raw)` 调用点的两条，以及 `serviceWorkerClient.test.ts` 里靠 `not.toContain("'/api/icon/'")` 反推 SW 不缓存的那条。它们钉的都是调用写法，本轮重构后要么失败要么变成假通过；取代它们的是上面那些直接观察响应与 Cache Storage 的行为断言
- 仍未验证：真实 Cloudflare edge cache 下「授权路径确实没有污染共享条目」只有代码层与本地模拟证据；`npm run perf:audit` 的图标请求数与 Cache Storage 阈值未跑（需可达部署实例）。这两项并入 PROB-20c

### PROB-21（P2，已完成）`isValidNavigationSetting` 是带副作用的类型谓词

| 项 | 内容 |
| --- | --- |
| 源码事实 | `worker/lib/settingsData.ts:128-136`：签名为 `value is Settings['navigation']` 的类型守卫，却在 `:133-134` **就地写入** `value.top_layout`（缺失或非法一律改 `'scroll'`），然后返回 `true` |
| 正确性依赖 | 调用方 `normalizeNavigationSetting`（`:119-126`）在守卫返回后读取被改写的对象；换成任何「先校验后另取原值」的调用方式即静默错误 |
| 测试固化 | `tests/unit/settingsData.test.ts:151-159`（用例 `validates complete navigation payloads for settings updates`）在 `:156` 断言 `top_layout: 'grid'` → `true`，把这一副作用语义写进了契约 |
| 影响 | 该函数是 `export` 的，任何新调用点都会被这个隐式改写影响 |
| 处理动作 | 拆成纯守卫（只判断 `position`/`always_expanded`，不看 `top_layout`）+ `normalizeNavigationSetting` 内部归一化 `top_layout`；同步改测试断言为「归一化结果」而非「守卫返回值」 |
| 验证 | 更新后的 `tests/unit/settingsData.test.ts` 覆盖 `undefined`/非法/合法三态；确认无其他调用点（改前先 `lsp references`） |
| 处理结果 | `worker/lib/settingsData.ts` 的 `isValidNavigationSetting` 改为纯谓词：只判断 `position` 与 `always_expanded`，不再读取或就地改写 `top_layout`；谓词类型收窄到 `Pick<Settings['navigation'], 'position' \| 'always_expanded'> & { top_layout?: unknown }`，因此它不再谎称 `top_layout` 已合法。`top_layout` 的降级改由 `normalizeNavigationSetting` 在构造返回值时完成（`value.top_layout === 'wrap' ? 'wrap' : 'scroll'`），缺失与非法两种输入的结果与改造前一致 |
| 验证结果 | `lsp references` 确认该导出只有 `normalizeNavigationSetting` 一个调用点（外加测试导入），无其他调用点受影响。`tests/unit/settingsData.test.ts` 原先断言谓词返回值的用例改为「校验且不改写入参」：保留 `left`/`top` 合法、`bottom` 与缺 `always_expanded` 非法的返回值断言，新增对传入对象的 `toEqual` 断言，证明缺失和非法 `top_layout` 都不会被补写；归一化三态（缺失 → `scroll`、`wrap` → `wrap`、`grid` → `scroll`）仍由既有的 `settingsFromRows` 用例覆盖。`npx vitest run tests/unit/settingsData.test.ts` 通过 |

### PROB-22（P2，已完成）安装与绑定类已知问题仍可复现

- 来源映射：`docs/guides/TROUBLESHOOTING.md:13-58`；关联已关闭 Issue #5（Invalid JSON response）
- 源码事实：`worker/routes/install.ts:209-253`、`:256-369` 明确保留三条失败路径 —— 缺 `SETUP_TOKEN` → `configuration_required`；缺 `DB`/`SESSION` → `bindings_missing`；数据库不可达 → `unavailable`
- 定性：这是部署配置类条件性问题，不是已修复缺陷。#5 云端已 CLOSED COMPLETED，但根因与复现未验证（报告者仅回「ok 了」）
- 处理动作：保留排障文档；核对三种状态码的用户可见文案是否都能定位到 `TROUBLESHOOTING.md` 对应小节
- 核对结果：三态**原先都不能靠用户可见文案定位**。页面标题分别是「还缺少部署密钥」「还缺少存储绑定」「数据库暂时不可用」「会话存储暂时不可用」（`src/views/Install.svelte:28-62`，前端模式映射在 `src/lib/appInstall.ts`），而排障文档的小节标题是「`/install` 提示安装令牌无效」「Missing binding」「`/install` 提示数据库初始化失败」——用词不重合；`unavailable` / `session_store_unreachable` 在 `TROUBLESHOOTING.md` 里**完全没有对应小节**；`database_unreachable` 只能概念性地落到讲 schema 恢复的「数据库初始化失败」小节
- 处理结果：`docs/guides/TROUBLESHOOTING.md` 新增「`/install` 配置提示与对应小节」对照表，按页面标题 + `data.state` / `data.reason` + 触发条件指向具体小节（含前端 `status_error`「无法检查安装状态」）；三个既有小节标题补上用户可见文案；「数据库初始化失败」小节补一段区分 `database_unreachable` 与 schema 缺失（并说明手动跑 `schema.sql` 修不好它）；新增「`/install` 提示会话存储暂时不可用」小节。排障文档按原处理动作保留，未改运行代码

### PROB-23（P2）旧 Service Worker / 缓存膨胀 / 外站图标失败无法本地判定

- 来源映射：`docs/guides/TROUBLESHOOTING.md:102-182`
- 源码防线：`public/sw.js:31-43`（跳过 opaque 与 512KB 以上响应）、`:91-119`（预缓存资源）、`:133-170`（Iconify/分类缓存与 API network-only）、`:176+`（导航 SWR）；`worker/routes/icon.ts:70-165` 与 `src/lib/bookmarkIconDisplay.ts:55-83` 提供降级
- 定性：源码有防线，是否线上仍复现取决于运行环境（旧 SW 版本、外站可用性、浏览器缓存），本地不可判定
- 处理动作：并入 PROB-13 的部署后真机验收；`npm run perf:audit` 复核 Cache Storage ≤ 5 MiB 与图标请求 ≤ 260

### PROB-24（P3）`App.svelte` 编排职责待按 use case 收敛

- 来源映射：`docs/reference/PROJECT_OVERVIEW.md:364`
- 事实：`src/App.svelte` 仍集中编排认证、CRUD、弹窗、Admin 懒加载与备份接线（约 1100 行）
- 约束（来自待办原文）：每次拆分必须先接入真实调用链并保留现有缓存、路由和回滚行为
- 处理动作：不做一次性大重构。仅在后续修改认证/CRUD/弹窗流程时顺带按 use case 抽出，且每次都有对应验证

---

## 6. E 类：信息不足需澄清

### PROB-25（P2）Issue #15 的 EdgeOne 兼容范围未定义

- 云端事实：#15 OPEN / `enhancement`，标题为未替换的模板占位「简短描述你的新功能想法」，正文诉求「开发兼容 EdgeOne 部署版本」；维护者已评论「目前没计划…下一个大版本纳入排期」
- 缺口：兼容边界未定义 —— Workers 运行时 API 差异、D1/KV 等价存储、部署配置、`wrangler.toml` 之外的构建产物、CI、文档，都不知道要不要覆盖
- 处理动作：向 #15 报告者澄清目标形态与最小可用范围后再决定立项。需求侧占位见 `REQ-12`。**向 Issue 回帖需单独授权**

### PROB-26（P2）已关闭 #8 的「顶部导航分行」缺本地编号，R-08 来源未列 #8

- 云端事实：#8 CLOSED COMPLETED / `bug`+`bug-fixed`。正文两条诉求是**部分导出备份**与**顶部导航分行**；评论另报 Chrome 侧栏白色原生滚动条，维护者称该 bug 已修复，导出与顶部导航属独立后续建议
- 本地事实：`GITHUB_ISSUES_REQUIREMENTS.md:28` 明确排除 Closed #8/#5；`:91` 的 R-08 来源只列 #9。两项功能实际都已实现（部分导出见 PROB-14 证据；顶部导航分行见 `src/components/Sidebar.svelte:63-65,682-718,1212-1242`）
- 缺口：已实现的功能缺少到原始 Issue 的追溯链，`bug-fixed` 标签实际只对应侧栏滚动条这一条
- 处理动作：裁定追溯口径 —— 在 R-08 来源补 #8，并为顶部导航分行补一条追溯记录（指向 `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md`），或明确「Closed Issue 不建立追溯」并接受该缺口

### PROB-27（P2，已完成）R-04 的「当前项焦点」是验收标准还是建议

- 关联：PROB-03
- 缺口：`GITHUB_ISSUES_REQUIREMENTS.md:167-188` 的 R-04 把 PC 键盘可达列为验收，但未逐字要求「当前项自动获得焦点」。修不修取决于这句话的效力
- 处理动作：裁定后按 PROB-03 的 a/b 分支执行
- 裁定结果：用户 2026-09-04 定为**建议而非验收标准**。R-04 验收标准已明确写成「定位只保证当前项滚动可见，不要求当前项自动获得焦点」，实现不改。详见 PROB-03

### PROB-28（P3，已完成）R-07 卡片最小宽度是否已满足诉求未确认

- 云端事实：#13 只问「最小宽度能否下调 / 为何限制 80」，**没给目标值**
- 源码事实：`shared/settings.ts:33-51` 现为 `min 44 / max 400` 归一化；`src/lib/bookmarkCardLayout.ts:1-12` 另有移动端安全下限 150；`src/components/settings/AdvancedSettingsSection.svelte:121-130` 在低值时给出信息提示
- 缺口：下限已从 80 降到 44，但原作者是否认为诉求已满足未确认。云端 #13 仍 Open
- 处理动作：确认后决定是回帖说明现状还是继续下调。**回帖需单独授权**
- 裁定结果：用户 2026-09-04 选**继续下调，最小值 40**。#13 原文只问「能否下调」、未给目标值，因此不回帖征询，直接按 40 落地
- 处理结果：`shared/settings.ts` 的 `CARD_SIZE_LIMITS.width.min`、`src/lib/bookmarkCardLayout.ts` 的 `INFO_CARD_MIN_TRACK_WIDTH`、`AdvancedSettingsSection.svelte` 的控件 `min` 与 Tooltip 文案、低值提示的判定阈值全部由 44 改为 40。移动端网格的 150 px 安全下限**不变**。`shared/settings.ts` 就地加注释记录这是用户裁定值且低于 44 px 触控建议
- 已知取舍（用户明示接受）：40 px 低于 44 px 触控目标建议值，点击区域小于无障碍推荐尺寸，换来更密的列数。Tooltip 与 API 契约都写明了这一点
- 验证结果：`tests/unit/bookmarkCardLayout.test.ts` 断言 39→40、40→40、44→44、401→400 及移动端 40/44 仍回落 150；`settingsForm` / `settingsData` 归一化断言与 `adminSettingsLayout` 控件契约同步到 40。`npm run type-check` 0 errors / 0 warnings；`npx vitest run` 102 files / 695 passed；`npm run build` 成功。**40 px 下的真机卡片渲染、触控与列数未验证**，属 L3 欠账
- 文档同步：`API_CONTRACT.md` 的 `card_size` 行、`GITHUB_ISSUES_REQUIREMENTS.md` 的 R-07 全段与汇总表、`guides/TEST_CASES.md` 的 TC-R07-01 边界值都已改到 40
- PROB-28v 真实浏览器验证（2026-09-05，已闭环）：隔离临时 headless Chrome，`card_style='info'`、`card_show_description=true`、`card_size.width=40`，两轮实测。
  - **桌面 1280×900**：`grid-template-columns` 实测被求解成 21 个 `40px` 轨道，但**实际每行只放 3 张卡**（种子数据一行 3 张 + 一张换行），卡片盒 40×60。横向溢出 `scrollWidth - clientWidth = 0`。
  - **可读性（这是本条真正的发现）**：40 px 下详情卡**只剩图标**——`.bookmark-text` / `.bookmark-title` / `.bookmark-description` 的 `clientWidth` 全是 **0**，标题 `scrollWidth=52`、描述 `scrollWidth=92`，即文字节点存在但可用宽度为零，一个字都看不到。截图确认桌面只显示 `G` / `M` / `C` 三个圆形图标。
  - **阈值扫描**（在同一页面上逐档改写 `--card-min-width` 后读 computed 值）：≤68 px 时标题/描述 `clientWidth` 恒为 0；72 px 起 `clientWidth=5`；80 px 时 12；96 px 时 33；**120 px 时 `titleClientW=63 === titleScrollW=63`，标题才首次完整显示**（本例标题 `GitHub`）。描述到 150 px 仍被截断（`clientW=85 < scrollW=92`）。
  - **移动端 390×844**：`--mobile-card-min-width` 实测为 `150px`，`grid-template-columns` 求解为 `171px 171px`（每行 2 张），卡片盒 171×60，标题与描述都完整显示且未截断，横向溢出 0。即 `INFO_CARD_MOBILE_SAFE_MIN_TRACK_WIDTH = 150` 的安全下限真的生效，移动端不受 40 影响。
  - **触控**：移动端点击区域 171×60，满足 44 px；桌面 40×60 的**宽度方向 40 < 44**，与已接受的取舍一致。
  - console error 0、pageException 0、failedRequest 0、4xx/5xx 0。
- 由该验证产生的修正（本轮已改）：原提示「当前宽度低于 80 px，可能无法保证页面美观」把「文字完全消失」说成了「可能不美观」，与实测严重不符。改为两档：`40–68 px` → 「当前宽度下详情卡只显示图标：标题与描述的可用宽度为 0。标题约需 120 px 才完整显示。移动端仍按 150 px 安全下限渲染。」；`69–79 px` → 「当前宽度低于 80 px，标题与描述会被截断，只显示开头几个字符。」Tooltip 同步补入实测阈值与「移动端另有 150 px 安全下限」。分档已在真实后台逐档输入验证：40/68 命中第一档，69/72/79 命中第二档，80/120 无提示
- 顺带退役一条测试断言：`tests/unit/adminSettingsLayout.test.ts` 里 `expect(advanced).toContain('可能无法保证页面美观')` 钉的是提示文案字面量，属 `CONTRIBUTING.md` 第 4 节禁止的「源码文本断言当行为证明」。文案本轮被证明是错的，重新钉新文案只会重复同一个错误，故删除；控件契约仍由同用例的 `min={40}` 与 `disabled={form.card_style !== 'info'}` 覆盖
- 未做：40 px 下「只显示图标」是否应当直接改用极简卡片风格（或在该档自动切换），属产品决策，未擅自改行为

### PROB-29（P2，已完成）R-05 的「禁用非法目标」表述与数据模型不符，尚未改写

- 来源：PROB-01 完成时自登记的遗留。
- 冲突：`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md:205`、`:209`、`:218` 仍写「禁用非法目标（不存在、越权、跨层级违规）并说明原因」，但 `worker/routes/bookmarks.ts:133-143` 只校验 `category_id` 是正整数、`worker/lib/db/bookmarks.ts:207-213` 只校验「分类存在」；分类最多两层且两层都能挂书签，管理员登录后可见全部分类 —— 三个理由都不成立。
- 现状：实现已按用户 2026-09-03 决策改为「可选 + 逐项后果警告」，文档未同步。
- 处理动作：把这三处改写为「无非法目标；对会让公开书签从公开首页消失的目标给出逐项后果提示」，并说明服务端只校验分类存在。与 PROB-11、PROB-12 的口径回写一起做，避免多次改同一段。
- 处理结果：用户 2026-09-04 选**改写为「无非法目标 + 逐项后果提示」**。`GITHUB_ISSUES_REQUIREMENTS.md` 的 R-05 已改五处：建议交互方案的「排除无效目标」改为「对会产生副作用的目标逐项标注后果」；「目标分类不存在、越权或跨层级非法时拒绝整批请求」改为写明服务端只校验 `category_id` 是正整数且分类存在、不存在「非法目标」这一类；验收标准的「禁用项原因」改为「后果提示且仍然可选」；「已确认决策」补 2026-09-04 改写说明；最佳实践段的「禁用非法目标（不存在、越权、跨层级违规）」改为「不禁用任何目标」。与 PROB-11、PROB-12 的回写在同一轮完成，同一段只改一次

### PROB-30（P3）无预设时 accent 回退仍是旧的共用冷蓝

- 源码事实：`src/lib/appData.ts:253-255` —— 有 `activePreset` 时读预设的 accent，**没有**预设（自定义背景）时回退 `theme === 'dark' ? '#7dd3fc' : '#2563eb'`，正是 REQ-08 从 13 套毛玻璃预设里清掉的那一对旧值。
- 定性：不是缺陷，自定义背景没有预设色相可依。但这对取值现在只以「无预设兜底」的形式存活，语义已经和 REQ-08 脱节。
- 处理动作：裁定回退策略 —— a) 保留并加注释说明它与预设 accent 无关；b) 改为跟随 `--font`/中性色而非蓝色；c) 让自定义背景也能配置 accent（属 `FR-4.5` 已驳回范围，需重新决策）。**本轮未改动**，因为 REQ-08 授权范围只含 13 套毛玻璃预设。

---

## 7. 处理这些问题时必须继续遵守的硬约束

来自既有计划与需求文档，改动时不得推翻。

### 7.1 技术栈与设计令牌

| 编号 | 约束 | 依据 |
| --- | --- | --- |
| `C-1` | Svelte **4.2.19**，无 runes；只能用 `export let` / `$:` / `class:` / `use:` / `bind:` | `package.json:40` |
| `C-2` | 无 Tailwind / PostCSS 工具类管道，一律 scoped `<style>` + CSS 自定义属性 | `package.json` 无相关依赖 |
| `C-3` | 引入 token 本身不得产生视觉变化；新 token 取现有最高频取值 | `src/app.css:5-9` |
| `C-4` | 不得绕过设置契约；卡片几何、分类字号图标、搜索框显隐是用户可配项，只能改默认值与归一化 | `shared/types.ts:103-113,147-149,279-280` |
| `C-10` | 新增 `transition:` 声明不得出现字面时长，不得 `transition: all` | `tests/unit/designTokens.test.ts:5-19,47-69` |
| `C-11` | 新增弹层圆角走 `var(--radius-xl)`；控件 `font-size` 不得带 `!important`（触摸设备 16px 护栏需能覆盖） | `tests/unit/designTokens.test.ts:72-116`、`src/app.css:82-87` |

### 7.2 权限、性能与滚动

| 编号 | 约束 | 依据 |
| --- | --- | --- |
| `C-5` | 性能审计保持 9 项：失败请求 `0`、破图 `0`、启动 splash `0`、快速搜索 settle 前 mutations `0`、后台搜索 rows `>0`、图标请求 ≤ `260`、Cache Storage ≤ `5 MiB`、`/api/admin/data` ≤ `60000` B、首页卡片 ≥ `300` | `scripts/perf-audit.mjs:28-32,489-545` |
| `C-7` | 所有编辑入口继续由 `isAuthenticated` 门禁，不得因「自用」放宽 | `src/views/Home.svelte:475,495,561,588` |
| `C-8` | 新增遮罩层落进首页 z-index 阶梯，不得盖住 Toast(9999) / Tooltip(1000)；后台层级树不可与首页混写 | `FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` §2.1 |
| `C-9` | 不得新增未合并的 `window` 滚动监听 | `Home.svelte:288-293,382-393`、`HomeFloatingActions.svelte:50-63`、`ui/Tooltip.svelte:65-79` |

### 7.3 移动端与后台布局

- 页头不用 `fixed` / z-index 覆盖解决遮挡；底部菜单不覆盖内容；移动端统计保持三列（`ADMIN_MOBILE_LAYOUT_PLAN.md:46-71`）。
- 书签列表移动端无横向滚动；标题按 Unicode 字素簇截断 12 字符，完整 `title`/`aria` 必须保留；禁止复制出不一致的截断实现（`:75-93`；实现见 `src/lib/truncateUnicodeText.ts`）。
- 零访问条目标题/URL 各 20 字符，完整 `href` 必须可访问（`:99-116`）。
- 导入控件移动端 grid：来源独占首行，模式与按钮同行，且不得改回调语义（`:126-147`）。
- Tooltip 只承载系统逻辑与权限说明；公开模式与导航联动使用 `disabled` 置灰且置灰保值；iOS coarse pointer 的 16px 字号规则不得被 `.ui-input` 覆盖（`UI_UX_Plan.md:16-22,62-63`、`PLATFORM_OPTIMIZATION_PLAN.md:769`）。

### 7.4 验证与工程纪律

- 常规本地检查：`npm run type-check`、`npm test`、`npm run build`、`git diff --check`。
- API 端到端：`npm run smoke`（75 项，脚本自管隔离实例与临时 D1；CI 已覆盖）。真实浏览器回归：`node scripts/chrome-regression.mjs`（25 项）。性能：`npm run perf:audit`。
- 浏览器验证默认用专用临时 Chrome profile；只开专用 target，结束只关该 target 并清理该 profile；**禁止**按进程名清理，也不得关闭用户自有 Chrome。
- 云端 Issue 状态只能由 GitHub 实时查询确认，不得由本地源码或提交推断（`docs/README.md:31`）。
- 本清单的任何 GitHub 写操作（回帖、关闭、Project 卡片）与部署操作都需单独授权。

---

## 8. 未验证事项

- 2026-09-03 核对轮未运行 `npm run type-check`、`npm test`、`npm run build`、`npm run perf:audit`、`scripts/smoke-test.mjs`、`scripts/chrome-regression.mjs`，也未启动任何浏览器；该轮所有「已实现」结论均为静态源码证据。2026-09-04 两轮实现都跑过 `type-check` / `vitest` / `npm run build` / `git diff --check`，仍未运行 `perf:audit`、两个套件与浏览器。
- PROB-20 方案 1 的**匿名枚举探针未实测**：新增的可见性判定只由纯函数单测与路由源码断言覆盖，没有对可达实例发过真实的 `/api/icon/:id` / `/api/category-icon/:id` 请求。`ICON_CACHE_NAMESPACE` 递增后旧 edge cache 条目确实不可达这一点，同样只有代码层证据。两者都需部署后验收。
- 生产部署版本、Worker 绑定、Custom Domain/DNS、线上实际行为均未验证。
- `gh auth status` 未执行；云端 Issue 状态通过 `issue://` 只读读取，未做任何写操作。
- PROB-13 / PROB-14 / PROB-15 / PROB-17 / PROB-19 / PROB-23 的闭环都依赖部署环境或真机，无法在只读核对或本地单测中完成；PROB-20 的方案 1 已落地，但其运行时验收（枚举探针、缓存条目失效）同样属于这一类。
