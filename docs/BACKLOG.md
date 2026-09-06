# 本地待办清单

> **这是内部工作项的唯一状态源。** 云端已有编号的缺陷与功能需求以 GitHub Issue 的开闭状态为准；本地发起的问题与需求不新开 Issue，状态就在本表。安全问题按 [SECURITY.md](../SECURITY.md) 处理，不开公开 Issue。规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
>
> - 更新日期：2026-09-06；基线：`develop`。
> - 只列**未完成**条目。完成后从本表删除，成果记入 `CHANGELOG.md`，证据与判断留在 `plans/` 的决策记录里。
> - 编号沿用既有 `PROB-NN` / `REQ-NN`，不重新分配。`PROB-18c`、`PROB-20c` 这类后缀表示同一编号的后续阶段。
> - 「详情」列指向决策记录：`PH` = [问题处理任务清单](plans/PROBLEM_HANDLING_TASK_LIST.md)，`RD` = [需求开发任务清单](plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md)。那两份文档**不再维护状态**，只保留证据。

## 1. 无阻塞，可直接开工

| ID | 类型 | 优先 | 事项 | 下一步 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-32 | 缺陷/交互 | P1 | 一级分类无直接书签时「本分类」内容区空白 | 2026-09-06 用户报告并给定方案，**本轮只登记不实现**。查实根因不在 `showEmpty`：`homeData.ts:170-179,183-189` 的选中回退在 root 缺已选 id 时只落回 root，`Home.svelte:535-538` 又只渲染 `selectedCategory`，于是 root 直接书签为 0 时 `CategorySection.svelte:156-208` 渲染空态卡（文案 `:207`）；`showEmpty={false}` 只出现在搜索分支 `Home.svelte:467-514`，与正常态无关。三项改动：① 删「本分类」tab（`HomeCategoryScope.svelte:240-250`）；② 默认展示一级分类直接书签，为空则落第一个二级分类（改 `homeData.ts:170-189` 的回退，`resolveHomeCategoryForRoot` 是唯一所有者）；③ 一级分类加边框 + 突出背景选中态（`.category-scope` 在 `HomeCategoryScope.svelte:157-164`，当前无 selected class，`:325-328` 的 `highlighted` 是 focus 态不可复用；可取 `Home.svelte:667-675` 与 `:714-721` 的 `--home-stat-bg`、`--home-stat-border`、`--home-accent-color`，全局无 `--accent-border` / `--accent-glow`）。删 tab 的连带断点：`aria-selected={rootActive}`（`:242`）移除后 tablist 失去唯一选中项与 roving `tabindex`（键盘处理 `:137-153` 只枚举 `[role="tab"]`）；`Home.svelte:572` 的 `aria-labelledby` 指向 `home-category-tab-${selectedCategory.id}`，选中 root 时会悬空；`App.svelte:687-692` 新建 root 后按 tab id 的 click 可能 no-op（已有 `[data-home-category-scope]` 回退）。删 tab 后 root 内容的 ARIA 口径用户未规定，按 WAI-ARIA tabs 模式定即可，不需再裁定。**必须串行**：与 REQ-03 同改 `CategorySection.svelte` 空态、与 REQ-06 同改 `Home.svelte` 选中态与 scroll-spy 及 `homeData.ts`；若同轮动 `Home.svelte` 的 accent 定义点则与 REQ-07 / REQ-13 争用。测试处置：`tests/unit/categoryCollapseMarkup.test.ts:60-62` 断言的是源码文本（`rootActive` 表达式、`aria-selected={rootActive}`、`<span>本分类</span>`），按 `CONTRIBUTING.md` §4 现行纪律**删除而不是改写成新文案**；`tests/unit/homeNavigation.test.ts:94-100` 锁 `resolveHomeCategoryForRoot(undefined)` 回退 root，属行为断言，随新语义更新 | 本表（2026-09-06 报告） |
| PROB-24 | 技术债 | P3 | `src/App.svelte` 按 use case 收敛编排职责 | **只在后续修改认证 / CRUD / 弹窗流程时顺带做**，不单独开一轮重构 | PH PROB-24 |

## 2. 需要裁定

当前没有待裁定条目。

> 2026-09-04 已裁定并落地：PROB-03 / PROB-27（保持现状，回写文档）、PROB-11（移动端收进「更多操作」菜单）、PROB-12（回写文档，确认浮动操作行）、PROB-28（下限继续下调到 40 px）、PROB-29（改写为「无非法目标 + 逐项后果提示」）。
>
> 2026-09-05 已裁定、**待实现**（见第 1 节）：PROB-26（建立追溯）、PROB-04（方案 a：删模块顶层说明 + 分组名收敛成「毛玻璃」）、PROB-30（**方案 c**：让自定义背景也能配 accent，承接编号 `REQ-13`，同时推翻 `FR-4.5` 第二条与 `D-10`）。各条的裁定依据与待实现动作见 PH / RD 对应条目。
>
> 2026-09-06 用户直接给出方案、要求只写进清单不实现：`PROB-32`（删「本分类」tab + 默认落一级分类直接书签、为空则落第一个二级分类 + 一级分类加边框与突出背景选中态）。方案由用户拍板，无待裁定项；根因、落点、连带断点与串行约束见第 1 节。

## 3. 需要运行环境或部署后才能闭环（L1 / L3 / L4）

> 部署来源是 `develop`：推送后 Cloudflare 自动构建并更新站点，没有手动 deploy 步骤。
> **首次生产验收已完成（2026-09-05）**：`npm run accept:prod` 27/27 通过、`npm run perf:audit` 9/9 通过，
> 被测构建 `assets/index-E5e6ANTt.js`。流程、分层与排障见 [部署后验收](guides/PRODUCTION_ACCEPTANCE.md)。
> 下表「剩余」列写的是这次**没能**闭环的部分，其余已由脚本证明。

| ID | 类型 | 优先 | 已验证（2026-09-05 生产） | 剩余 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-19v | 安全 | P1 | 登出后旧 token 被拒，实测 **178 ms**，远低于 15 秒窗口；**2026-09-06 复验 212 ms**，仍远低于 15 秒窗口 | KV 写入故障下的 `store_unavailable` 分支——生产上没有安全的故障注入手段 | PH PROB-19 |
| PROB-13 | 验证欠账 | P1 | `L1` 首访探测一次/二访零次；`L3` Service Worker 接管（9 个响应）+ 预缓存含 `index-*.js`/`.css`；`L4` 离线可打开；**2026-09-06 复验**：首访/二访、Service Worker、预缓存、离线、弹窗尺寸和全程异常检查均通过（27/27） | iOS Safari 输入放大（iOS 独有）；`L4` 的「已检测到新版本」（要两次真实部署）；`S3` 自定义 JS 与 `S3 导入提示`（Tier 1/人工选文件）；`S4` 当前页弹层（要可嵌入站点作书签） | PH PROB-13 |
| PROB-14 | 验证欠账 | P1 | 子集导出含被选分类且补齐父分类；**2026-09-06 复验通过**：生产只读探针完成子集导出检查 | 证据偏弱：生产上第一个根分类没有子分类也没有书签，导出子集只有 1 个分类 0 个书签。replace/merge 导入属 Tier 2，**只在本地实例验证** | PH PROB-14 |
| PROB-20c | 安全 | P1 | **匿名枚举防护确认生效**：匿名取私密书签图标（id=1015）与「不存在的 id」逐字节相同（326/326 B，SHA-256 一致），私密分类同理；带授权 key 时返回不同内容（568 B / 329 B），证明防护不是「本来就没图标」；授权响应 `cache-control: private, no-store`。`perf:audit` 图标请求 235 ≤ 260 | 旧 edge cache 条目不可达——需要能观察 Cloudflare edge 的缓存键 | PH PROB-20 |
| PROB-18c | 技术债 | P2 | 基础设施建成并跑通生产：`scripts/lib/cdpSession.mjs` 提供视口仿真、真实 `Input`、离线仿真、证据采集与精确清理 | `100dvh`/虚拟键盘、剪贴板 transient activation、iOS 放大等真机独有项（归 L4） | PH PROB-18 |
| PROB-23 | 验证欠账 | P2 | Cache Storage **0.74 MiB** ≤ 5 MiB；首页 0 破图；**观测到一例真实外站图标失败**（第三方图片设了 `Cross-Origin-Resource-Policy: same-origin`，被浏览器拒收，前端兜底生效所以用户看不到破图） | 旧 SW 版本残留取决于访客浏览器历史状态，干净 profile 里复现不出来 | PH PROB-23 |
| PROB-17 | 验证欠账 | P2 | 首页三档截图（430x932 / 768x1024 / 1440x900） | 后台备份/导入页移动端截图待补场景 | PH PROB-17 |
| REQ-08b | 验证欠账 | P3 | — | 逐套切换 13 个毛玻璃预设：属 Tier 1（要写 `background_preset_id`）且「好不好看」需要人眼 | RD REQ-08 |

## 4. 需要向报告者澄清

| ID | 类型 | 优先 | 事项 | 详情 |
| --- | --- | --- | --- | --- |
| PROB-25 | 需求 | P2 | #15 的 EdgeOne 兼容边界未定义（运行时 API 差异、D1/KV 等价存储、部署配置、构建产物、CI、文档范围）。**由维护者直接在 GitHub 回帖澄清，不占用代理任务**；澄清结果回写后再决定 `REQ-12` 是否排期 | PH PROB-25 / RD REQ-12 |

## 5. 未获批准的功能需求

这些来自 `plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md`（状态为「需求评估，尚未实现」），**逐项都需要明确批准才可开工**。批准后从本表移到第 1 节，状态继续由本表承载。

> **不为本地发起的条目新开 Issue。** GitHub Issue 只承接**云端已有**的报告：由使用者提出、已经存在编号的缺陷与需求。本地开发中发现的问题、自己提出的改进和新增功能，状态一律记在本表，成果记在 `CHANGELOG.md`，决策依据留在 `plans/`。只有当某个本地条目确实对应一个已存在的 Issue 时，才在「详情」列回指那个编号。

| ID | 优先 | 事项 | 前置 | 详情 |
| --- | --- | --- | --- | --- |
| REQ-01 | P1 | 离屏搜索按钮 + 居中 Spotlight 命令面板 | 与顶部导航按钮对齐的改动必须串行；验收含焦点陷阱与键盘导航，需要 PROB-18c 的真实浏览器层 | RD REQ-01 |
| REQ-04 | P1 | 弹窗打开信号 token + 用户手势读剪贴板预填 URL | 剪贴板必须在 transient activation 链路内，需 PROB-18c | RD REQ-04 |
| REQ-05 | P1 | 预填后自动触发标题解析，3 秒节流 + 竞态保护 | 会使 API 契约里「仅 blur 触发」的描述过期，需同步 | RD REQ-05 |
| REQ-02 | P2 | PC 操作胶囊 hover/focus 渐显，排序态恒显 | hover 与 reduced-motion 需 PROB-18c | RD REQ-02 |
| REQ-03 | P2 | 空分类固定显示「新增书签」按钮，访客不显示 | — | RD REQ-03 |
| REQ-06 | P2 | 新增书签时默认分类取视口中央分类 | — | RD REQ-06 |
| REQ-07 | P2 | 新增 `accent-border` / `accent-glow` token | 先决定是否与已存在的 `--confirm-accent-border` 并轨；与已批准的 `REQ-13` 动同一批 accent 定义点与预览回退，两条必须串行 | RD REQ-07 |
| REQ-10 | P2 | 书签图标属性契约补齐 | 先裁定 `CachedBookmarkIcon` 是否属于「书签网络图标路径」 | RD REQ-10 |
| REQ-11 | P2 | 字母头像按 hostname/title 派生稳定高对比色 | — | RD REQ-11 |
| REQ-09 | P3 | 信息卡标题/描述换字号 token | 有 0.4px 偏差，须先按视觉回归约束确认 | RD REQ-09 |

`OQ-1`～`OQ-8` 的默认结论都是「不做 / 不改」，只有显式推翻才转为 `REQ` 条目，见 RD §4。

## 6. 发版待办

| ID | 事项 | 说明 |
| --- | --- | --- |
| REL-01 | 分三批按版本制发版 | 已定方案（2026-09-04）：不追认 `v0.1.0`，直接从 `v0.2.0` 开始；tag 打在 `develop` 上，**部署来源是 `develop`，不合并 `main`**（合并只在维护者主动要求时做）。批次边界必须落在自洽可发布的提交上——`8eeac6b → 925c698 → a8fb0e6` 三个提交不可分割，中间那个点的文档链接是悬空的。<br>· `v0.2.0` = `3929d11`…`f3c425f`：R-01~R-08 实现 + 三轮部署后验收修复 + 移动端长按菜单与分类树滚动隔离<br>· `v0.3.0` = `5a06fb3`…`a8fb0e6`：批量移动逐项后果提示、13 套毛玻璃预设强调色、API 契约与 Issue 快照修正<br>· `v0.4.0` = `1b119d4` 起：图标代理关闭匿名枚举（安全）、组件测试层、交付流程规范，以及本轮五条裁定的落地<br>每批都要真部署并跑 L3；**打 tag、推送、部署、关闭 Issue 都需要单独授权**，流程见 CONTRIBUTING.md §6 |
| REL-02 | Issue 关闭需手动执行 | 部署走 `develop` 而默认分支是 `main`，因此提交里的关闭关键字不会生效。每批 L3 通过后手动关闭对应 Issue 并在评论引用版本 tag。当前 6 个 Open：#10 在 `v0.2.0` 验证后即可关；#11 / #12 / #13 待本轮裁定项落地后可关；#9 是聚合反馈，需等其覆盖的 R-01~R-08 全部闭环；#15（EdgeOne）未实现，见 PROB-25 |
