# 待办事项清单

> **状态：本清单是索引，不是事实来源。** 每条只给「做什么 / 什么阻塞它 / 详情在哪」，证据与判断保留在来源文档里，避免出现第三份互相矛盾的记录。
>
> - 更新日期：2026-09-03；基线：`develop` 分支当前工作树。
> - 详情：问题类看 [问题处理任务清单](PROBLEM_HANDLING_TASK_LIST.md)（`PROB-NN`），需求类看 [需求开发任务清单](REQUIREMENT_DEVELOPMENT_TASK_LIST.md)（`REQ-NN`）。
> - 编号不重新分配。本清单只做筛选和排序。
> - 勾选一条时，必须同时在来源文档的对应条目里追加「处理结果」行，否则两处会失同步。

---

## 1. 立即可做（无阻塞，结论已定）

这些不需要再决策，只等开工授权。

- [ ] **PROB-02**（P2）批量移动默认目标改为「多数书签所在分类」。现在取首个选中项（`src/components/admin/BookmarkListPanel.svelte:152`），与 `GITHUB_ISSUES_REQUIREMENTS.md:218` 不符。抽 `pickMajorityCategoryId` 纯函数，并列时取排序最靠前的分类。
- [ ] **PROB-21**（P2）拆掉 `isValidNavigationSetting` 的副作用。它是 `value is …` 类型谓词，却在 `worker/lib/settingsData.ts:133-134` 就地改写 `value.top_layout`；改前先 `lsp references` 确认调用点，同步改 `tests/unit/settingsData.test.ts:151-159` 的断言口径。
- [ ] **PROB-08**（P2）给设置字段建字段名级契约表。`shared/settings.ts:45-92` 的 `SETTINGS_KEYS` 有约 30 个键，`API_CONTRACT.md:185-188` 只以聚合类型名 `Settings` 概称；11 个键在 `reference/`、`guides/` 里逐字检索无命中。
- [ ] **PROB-16**（P2）把设置页/导航/导出的数值型断点断言补进 `scripts/chrome-regression.mjs`，或在台账明确标为一次性人工证据。
- [ ] **PROB-22**（P2）核对安装失败三态（`configuration_required` / `bindings_missing` / `unavailable`）的用户可见文案能否定位到 `TROUBLESHOOTING.md:13-58` 的对应小节。
- [ ] **PROB-24**（P3）后续修改认证 / CRUD / 弹窗流程时，顺带按 use case 收敛 `src/App.svelte` 的编排职责。**不要**单独开一轮大重构。

## 2. 需要你裁定后才能动

- [ ] **PROB-29**（P2）改写 `GITHUB_ISSUES_REQUIREMENTS.md:205`、`:209`、`:218` 的「禁用非法目标」表述 —— 三个理由在当前数据模型都不成立。建议与 PROB-11、PROB-12 一起改，避免多次改同一段。
- [ ] **PROB-11**（P2）R-02 首页新建子分类：移动端要收进「更多操作」菜单（计划 T6 的要求），还是保留现在的直显图标按钮并回写文档？
- [ ] **PROB-12**（P3）R-03 入口位置：文档建议「经常访问」标题右侧，实现是全局浮动操作行。低风险，只需回写文档确认现状。
- [ ] **PROB-03 / PROB-27**（P2）R-04 分类树打开时当前项要不要自动获得焦点？先裁定 `:167-188` 的键盘可达是否包含「自动聚焦」，再决定改实现还是改文档。
- [ ] **PROB-04**（P3）`GradientPresetSelector.svelte:25-26` 的模块顶层大段说明算不算 `FR-B1` 范围？分组名要不要从「毛玻璃氛围」收敛成 `FR-B2` 写的「毛玻璃」？
- [ ] **PROB-26**（P2）已关闭 #8 的追溯口径：在 R-08 来源补 #8 并给顶部导航分行补追溯，还是明确「Closed Issue 不建立追溯」？
- [ ] **PROB-28**（P3）R-07 卡片最小宽度已从 80 降到 44，是否算满足 #13 的诉求？决定后才知道要不要回帖或继续下调。
- [ ] **PROB-30**（P3）自定义背景（无预设）时 accent 回退仍是 `#2563eb` / `#7dd3fc`（`src/lib/appData.ts:253-255`）。保留加注释、改中性色，还是让自定义背景也能配 accent？
- [ ] **PROB-18**（P2）要不要引入 e2e 层？现在 100 个测试文件全是 `tests/unit/*.test.ts`，交互只能靠人工浏览器闸门。
- [ ] **PROB-20**（P1）图标代理匿名可枚举的修法需要先定架构：签名 URL、HttpOnly 会话校验，还是私密对象内联图标 + 缓存隔离？三条都会动缓存契约与 `C-5` 的图标请求预算。

## 3. 需要运行环境或部署后才能闭环

- [ ] **PROB-07**（P1）跑一次 `node scripts/smoke-test.mjs`（需可用本地 D1），确认「登出后 token 失效 → 401」断言的真实结果，再回写 `PLATFORM_OPTIMIZATION_PLAN.md:868`（该处还把行号写成 `:347`，实际在 `scripts/smoke-test.mjs:365`）。
- [ ] **PROB-13**（P1）部署后完成剩余 7 组真机验收：`L1`、`L3`、`L4`、`S3`、`S3 导入提示`、`S4`、`U1–U4`。`U1–U4` 的 iOS 放大项必须真实 iOS Safari，隔离 Chrome 不能替代。
- [ ] **PROB-14**（P1）部署后在生产自定义域实测一次部分导出下载与 replace/merge 导入，再决定是否向 #9 征询原作者确认。**回帖需单独授权。**
- [ ] **PROB-15**（P1）隔离临时 Chrome 直接导航 `/admin`，确认首页不会短暂挂载，采集 console / pageException / failedRequests（`PROJECT_OVERVIEW.md:363`）。
- [ ] **PROB-17**（P2）补后台移动端三档视觉截图：备份/导入页移动端、`430x932`、`768x1024`，以及桌面补充截图。
- [ ] **PROB-19**（P1）跨 isolate 登出撤销的生效窗口与 KV 写失败静默，需要真实环境做故障注入验证；同时决定失败时是否还返回纯成功。
- [ ] **PROB-23**（P2）旧 Service Worker、Cache Storage 膨胀、外站图标失败都是运行时条件，本地判定不了。并入 PROB-13 的部署后验收，并跑 `npm run perf:audit` 复核 `C-5` 阈值。
- [ ] **REQ-08 后续**（P3）部署后逐套切换 13 个毛玻璃预设做真机视觉确认。合成对比度目前是解析式估算（最低浅色 4.58），不是渲染采样。

## 4. 需要向报告者澄清

- [ ] **PROB-25 / REQ-12**（P2）Issue #15 的 EdgeOne 兼容边界：Workers 运行时 API 差异、D1/KV 等价存储、部署配置、构建产物、CI、文档范围，哪些要覆盖？维护者已回复「下个大版本纳入排期」，未承诺实现。澄清前不排期。**向 Issue 回帖需单独授权。**

## 5. 未获批准的需求开发

`REQ-01`～`REQ-07`、`REQ-09`～`REQ-11` 全部来自 `FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md`，该文档状态是「需求评估，尚未实现」（`docs/README.md:15`），**逐项都需要明确批准才可开工**。

- [ ] **REQ-01**（P1）离屏搜索按钮 + 居中 Spotlight 命令面板（`FR-1.1`~`FR-1.6`）。改 `HomeFloatingActions.svelte`，与顶部导航按钮对齐必须串行。
- [ ] **REQ-04**（P1）弹窗打开信号 token + 用户手势读剪贴板预填 URL（`FR-3.1`、`FR-3.2`）。
- [ ] **REQ-05**（P1）预填后自动触发标题解析，3 秒节流 + 竞态保护；会使 `API_CONTRACT.md:132` 的「仅 blur 触发」过期，需同步。
- [ ] **REQ-02**（P2）PC 操作胶囊 hover/focus 渐显，排序态恒显。
- [ ] **REQ-03**（P2）空分类固定显示「新增书签」按钮，访客不显示。
- [ ] **REQ-06**（P2）新增书签时默认分类取视口中央分类。
- [ ] **REQ-07**（P2）新增 `accent-border` / `accent-glow` token；需先决定是否与已存在的 `--confirm-accent-border` 并轨。
- [ ] **REQ-10**（P2）书签图标属性契约补齐；需先裁定 `CachedBookmarkIcon` 是否属于「书签网络图标路径」。
- [ ] **REQ-11**（P2）字母头像按 hostname/title 派生稳定高对比色。
- [ ] **REQ-09**（P3）信息卡标题/描述换字号 token；标题 14.4px → 14px 有 0.4px 偏差，须先按 `C-3` 视觉回归确认。

`OQ-1`～`OQ-8` 默认结论都是「不做 / 不改」，只有显式推翻才转为 `REQ` 条目，见 [需求开发任务清单](REQUIREMENT_DEVELOPMENT_TASK_LIST.md) §4。

## 6. 本轮已完成（2026-09-03）

- [x] **PROB-01**（P1）批量移动目标树逐项后果提示。核对推翻了 R-05 的三个禁用理由，按「可选 + 逐项后果警告」实现，未硬禁用服务端允许的操作。
- [x] **REQ-08**（P2）13 套毛玻璃预设逐套强调色，浅/深各 13 个取值互不重复，按最坏合成背景断言对比度 ≥ 4.5:1。
- [x] **PROB-05**（P1）`API_CONTRACT.md` 补 `POST /api/bookmarks/reorganize` 端点行、请求形状、全量覆盖约束与 `1002/1006/1500` 语义。
- [x] **PROB-06**（P1）`GITHUB_ISSUES_REQUIREMENTS.md` 快照更新到 2026-09-03，Open 5 → 6，补入 #15。
- [x] **PROB-09**（P2）`UI_UX_Plan.md` 补文首状态块，标为已被取代的原始草案。
- [x] **PROB-10**（P2）`docs/README.md` 计划清单补 `DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md` 与 `UI_UX_Plan.md`。

验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 100 files / 680 passed；`npm run build` 成功；`git diff --check` 通过。未运行部署、`smoke-test.mjs`、`chrome-regression.mjs` 与浏览器套件。

---

## 7. 开工前必看

- 工程规则先遵守 `AGENTS.md`：默认分支 `develop`，未经明确要求不提交 / 不推送 / 不部署 / 不启动本地服务。
- 硬约束清单在 [问题处理任务清单 §7](PROBLEM_HANDLING_TASK_LIST.md#7-处理这些问题时必须继续遵守的硬约束)：`C-1`~`C-12`、移动端与后台布局护栏、验证纪律。其中最容易踩的是 `C-3`（引入 token 不得改变视觉）、`C-6`/`C-12`（要测行为必须先抽纯函数）、`C-7`（编辑入口不得放宽鉴权）。
- 固定闸门：`npm run type-check` → `npm test` → `npm run build` → `git diff --check`；涉及 API 加 `node scripts/smoke-test.mjs`；涉及渲染加 `node scripts/chrome-regression.mjs`；涉及图标或缓存加 `npm run perf:audit`。
- 云端 Issue 状态只能由 GitHub 实时查询确认，不得由本地源码或提交推断。
