# 本地待办清单

> **这是内部工作项的唯一状态源。** 云端已有编号的缺陷与功能需求以 GitHub Issue 的开闭状态为准；本地发起的问题与需求不新开 Issue，状态就在本表。安全问题按 [SECURITY.md](../SECURITY.md) 处理，不开公开 Issue。规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
>
> - 更新日期：2026-09-05；基线：`develop`。
> - 只列**未完成**条目。完成后从本表删除，成果记入 `CHANGELOG.md`，证据与判断留在 `plans/` 的决策记录里。
> - 编号沿用既有 `PROB-NN` / `REQ-NN`，不重新分配。`PROB-18c`、`PROB-20c` 这类后缀表示同一编号的后续阶段。
> - 「详情」列指向决策记录：`PH` = [问题处理任务清单](plans/PROBLEM_HANDLING_TASK_LIST.md)，`RD` = [需求开发任务清单](plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md)。那两份文档**不再维护状态**，只保留证据。

## 1. 无阻塞，可直接开工

| ID | 类型 | 优先 | 事项 | 下一步 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-26 | 追溯 | P2 | 为已关闭 #8 的两项已实现诉求建立追溯 | 已裁定（2026-09-05，建立追溯）。改 `GITHUB_ISSUES_REQUIREMENTS.md` 三处（按小节定位，行号已漂移）：§1.2 的排除句改为「Closed Issue 不新立 R 编号，但已实现的诉求要在 §8 建立追溯」、§3 总表 R-08 来源列补 #8、§8 新增 #8 追溯（部分导出 → R-08；顶部导航分行 → `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md` + `src/components/Sidebar.svelte`），并注明 #8 的 `bug-fixed` 只对应侧栏滚动条那一条。**只改本地文档，不动云端 #8** | PH PROB-26 |
| PROB-04 | 需求对齐 | P3 | 配色分区去掉模块顶层说明，分组名收敛 | 已裁定（2026-09-05，方案 a）。改 `src/components/settings/GradientPresetSelector.svelte`（按内容定位）：删 `.gradient-preset-header` 里的 `内置配色方案` 标题与紧随的说明段落；`presetGroups` 的 `毛玻璃氛围` → `毛玻璃`（`护眼纯色` 不变）；两组 `hint` 从 `.gradient-preset-group-title` 的内联 `<span>` 移进 hover 的 `title`；header 右侧「自定义 / 已选方案」是选中态反馈，保留。验证挂载组件写行为断言，**不新增源码文本断言** | PH PROB-04 |
| REQ-13 | 需求 | P2 | 自定义背景可配置强调色（承接 PROB-30 方案 c） | 已裁定并批准（2026-09-05，方案 c）。生效口径：**只在 `background_preset_id === 'custom'` 时生效**，有预设仍走预设 accent，因此不构成「两套真源」。需要浅/深成对两个字段。实现必须同时覆盖三处回退：`appData.ts` 的 `buildHomeBackground`、`Home.svelte` 的 `--home-accent-color` 两个档、`SettingsHomePreview.svelte` 的 6 处 `color-mix` 内联回退（后者深浅色都用浅色值，属既有不一致，一并对齐）。改动面含 `shared/types.ts`、`shared/settings.ts`（归一化 + `SETTINGS_KEYS` + 公开白名单）、`worker/lib/settingsData.ts`、`worker/routes/settings.ts`、`schema.sql`、设置面板 UI、`API_CONTRACT.md` 设置键表与其「30 个」计数。UI 落点与 `PROB-04` 争用 `GradientPresetSelector.svelte`，须串行 | RD REQ-13 |
| PROB-24 | 技术债 | P3 | `src/App.svelte` 按 use case 收敛编排职责 | **只在后续修改认证 / CRUD / 弹窗流程时顺带做**，不单独开一轮重构 | PH PROB-24 |

## 2. 需要裁定

当前没有待裁定条目。

> 2026-09-04 已裁定并落地：PROB-03 / PROB-27（保持现状，回写文档）、PROB-11（移动端收进「更多操作」菜单）、PROB-12（回写文档，确认浮动操作行）、PROB-28（下限继续下调到 40 px）、PROB-29（改写为「无非法目标 + 逐项后果提示」）。
>
> 2026-09-05 已裁定、**待实现**（见第 1 节）：PROB-26（建立追溯）、PROB-04（方案 a：删模块顶层说明 + 分组名收敛成「毛玻璃」）、PROB-30（**方案 c**：让自定义背景也能配 accent，承接编号 `REQ-13`，同时推翻 `FR-4.5` 第二条与 `D-10`）。各条的裁定依据与待实现动作见 PH / RD 对应条目。

## 3. 需要运行环境或部署后才能闭环（L1 / L3）

> 部署来源是 `develop`：推送后 Cloudflare 自动构建并更新站点，没有手动 deploy 步骤。
> 推送生效后跑 `npm run accept:prod`（只读，无任何写入）能自动闭环下表大部分条目——
> 每条的「自动化」列写明覆盖到哪、剩下什么必须人工。流程、分层与排障见
> [部署后验收](guides/PRODUCTION_ACCEPTANCE.md)。

| ID | 类型 | 优先 | 事项 | 自动化 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-19v | 安全 | P1 | 登出撤销的跨 isolate 生效窗口（≤15 秒）与真实 KV 写入故障下的 `store_unavailable` 分支 | **生效窗口已自动化**（`logout-accepted` + `revoked-token-rejected-within-window`，报告里带实际毫秒数）。KV 故障注入仍需人工：生产上没有安全的注入手段 | PH PROB-19 |
| PROB-13 | 验证欠账 | P1 | 剩余 7 组真机验收（`L1`/`L3`/`L4`/`S3`/`S3 导入提示`/`S4`/`U1–U4`） | **`L1`/`L3` 全覆盖**，`L4` 覆盖离线可打开，`U1–U4` 覆盖桌面与 390x844 的弹窗尺寸与操作栏。仍需人工：iOS Safari 输入放大（iOS 独有行为）、`L4` 的「已检测到新版本」（要两次真实部署）、`S3`（属 Tier 1 写设置）、`S3 导入提示`（要人工选文件）、`S4`（要可嵌入站点作书签） | PH PROB-13 |
| PROB-14 | 验证欠账 | P1 | 部署后实测部分导出下载与 replace/merge 导入 | **导出子集已自动化**（`partial-export-builds-subset-with-parent`，含父分类补齐）。导入是 Tier 2：`replace` 会清库，**只在本地实例验证** | PH PROB-14 |
| PROB-20c | 安全 | P1 | 匿名枚举探针、缓存命名空间递增后旧 edge cache 条目不可达、PROB-20b 授权路径未污染 edge cache | **匿名探针已自动化**（管理数据 + 私密书签图标 + 私密分类图标三条；实例上没有私密对象时记 skip 并说明）。edge cache 条目不可达与污染判定仍需人工：要能观察 Cloudflare edge 的缓存键 | PH PROB-20 |
| PROB-18c | 技术债 | P2 | 真实浏览器验证层 | **基础设施已建成**：`scripts/lib/cdpSession.mjs` 提供视口仿真、`getComputedStyle` 采样、真实 `Input` 事件、离线仿真与精确清理。剩下的是逐项补场景，以及 `100dvh`/虚拟键盘、剪贴板 transient activation、iOS 放大这些真机独有项 | PH PROB-18 |
| PROB-23 | 验证欠账 | P2 | 旧 Service Worker、Cache Storage 膨胀、外站图标失败 | **Cache Storage 预算与图标破图已自动化**（`cache-storage-within-budget`、`home-images-not-broken`）。旧 SW 版本残留取决于访客浏览器历史状态，无法在干净 profile 里复现 | PH PROB-23 |
| PROB-17 | 验证欠账 | P2 | 后台移动端三档视觉截图 | **首页三档截图已自动化**（430x932 / 768x1024 / 1440x900，落 `tmp/acceptance/`）。后台备份/导入页截图待补场景 | PH PROB-17 |
| REQ-08b | 验证欠账 | P3 | 逐套切换 13 个毛玻璃预设做真机视觉确认 | 属 Tier 1（要写 `background_preset_id`）且「好不好看」需要人眼，不自动化 | RD REQ-08 |

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
