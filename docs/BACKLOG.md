# 本地待办清单

> **这是内部工作项的唯一状态源。** 用户可见的缺陷与功能需求以 GitHub Issue 的开闭状态为准，安全问题按 [SECURITY.md](../SECURITY.md) 处理，不开公开 Issue。规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
>
> - 更新日期：2026-09-04；基线：`develop`。
> - 只列**未完成**条目。完成后从本表删除，成果记入 `CHANGELOG.md`，证据与判断留在 `plans/` 的决策记录里。
> - 编号沿用既有 `PROB-NN` / `REQ-NN`，不重新分配。`PROB-18b`、`PROB-20b` 这类后缀表示同一编号的后续阶段。
> - 「详情」列指向决策记录：`PH` = [问题处理任务清单](plans/PROBLEM_HANDLING_TASK_LIST.md)，`RD` = [需求开发任务清单](plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md)。那两份文档**不再维护状态**，只保留证据。

## 1. 无阻塞，可直接开工

| ID | 类型 | 优先 | 事项 | 下一步 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-20b | 安全 | P1 | 签名 URL 恢复后台私密对象的图标预览 | 先定签名密钥与过期策略（建议 `exp` 与会话 `exp` 对齐，改密码触发 `rotateJwtSecret` 时顺带失效）；先验签再查缓存，私密响应改 `private, no-store` 并跳过 edge cache 与 Service Worker 的分类图标 cache-first 分支 | PH PROB-20 |
| CI-01 | 技术债 | P2 | 让 L1 验证进 CI | 在 CI 里起本地 D1（`npm run db:init`）与本地服务后跑 `scripts/smoke-test.mjs`。现在 CI 只跑 L0，导致「哪些验证做过」只能靠文档记 | 本条 |
| PROB-18b | 技术债 | P2 | 24 个源码文本断言文件迁到组件层 | 增量做：每次迁一个文件，删掉被真实 DOM 断言取代的那几条 | PH PROB-18 |
| PROB-24 | 技术债 | P3 | `src/App.svelte` 按 use case 收敛编排职责 | **只在后续修改认证 / CRUD / 弹窗流程时顺带做**，不单独开一轮重构 | PH PROB-24 |

## 2. 需要裁定

| ID | 类型 | 优先 | 待裁定的问题 | 详情 |
| --- | --- | --- | --- | --- |
| PROB-26 | 需裁定 | P2 | 已关闭的 #8 要不要建立追溯，还是明确「Closed Issue 不建立追溯」？ | PH PROB-26 |
| PROB-04 | 需裁定 | P3 | 配色分区的模块顶层说明算不算 `FR-B1` 范围？分组名要不要收敛成 `FR-B2` 写的「毛玻璃」？ | PH PROB-04 |
| PROB-30 | 需裁定 | P3 | 自定义背景（无预设）时 accent 仍回退为固定冷蓝。保留并加注释、改中性色，还是让自定义背景也能配 accent？ | PH PROB-30 |

> 2026-09-04 已裁定并落地：PROB-03 / PROB-27（保持现状，回写文档）、PROB-11（移动端收进「更多操作」菜单）、PROB-12（回写文档，确认浮动操作行）、PROB-28（下限继续下调到 40 px）、PROB-29（改写为「无非法目标 + 逐项后果提示」）。各条的裁定与处理结果见 PH 对应条目，遗留的真机验证见下一节。

## 3. 需要运行环境或部署后才能闭环（L1 / L3）

| ID | 类型 | 优先 | 事项 | 详情 |
| --- | --- | --- | --- | --- |
| PROB-19 | 安全 | P1 | 跨 isolate 登出撤销的生效窗口与 KV 写失败静默，需真实环境故障注入；同时决定失败时是否还返回纯成功 | PH PROB-19 |
| PROB-07 | 验证欠账 | P1 | 跑一次 `scripts/smoke-test.mjs` 确认「登出后 token 失效 → 401」的真实结果，并修正计划文档里过期的引用 | PH PROB-07 |
| PROB-13 | 验证欠账 | P1 | 部署后完成剩余 7 组真机验收（`L1`/`L3`/`L4`/`S3`/`S3 导入提示`/`S4`/`U1–U4`）。iOS 输入放大项必须真实 iOS Safari，隔离 Chrome 不能替代 | PH PROB-13 |
| PROB-14 | 验证欠账 | P1 | 部署后在生产自定义域实测部分导出下载与 replace/merge 导入，再决定是否向 #9 征询原作者确认（**回帖需单独授权**） | PH PROB-14 |
| PROB-15 | 验证欠账 | P1 | 隔离临时 Chrome 直接导航 `/admin`，确认首页不会短暂挂载，采集 console / pageException / failedRequests | PH PROB-15 |
| PROB-20c | 安全 | P1 | 部署后做匿名枚举探针，确认图标端点确实拒绝私密对象；并确认缓存命名空间递增后旧 edge cache 条目不可达 | PH PROB-20 |
| PROB-18c | 技术债 | P2 | 真实浏览器验证层：复用本地已有 Chrome 或走 `real-chrome-cdp-testing` 流程，覆盖 computed style、`100dvh`/安全区/虚拟键盘、剪贴板用户手势、`prefers-reduced-motion` 实际时长、iOS 输入放大，以及 PROB-16 的数值断点。**不引入 Playwright** | PH PROB-18 |
| PROB-23 | 验证欠账 | P2 | 旧 Service Worker、Cache Storage 膨胀、外站图标失败都是运行时条件，并入 PROB-13 的部署后验收，并跑 `npm run perf:audit` | PH PROB-23 |
| PROB-17 | 验证欠账 | P2 | 补后台移动端三档视觉截图（备份/导入页移动端、`430x932`、`768x1024`）与桌面补充截图 | PH PROB-17 |
| REQ-08b | 验证欠账 | P3 | 部署后逐套切换 13 个毛玻璃预设做真机视觉确认。合成对比度目前是解析式估算，不是渲染采样 | RD REQ-08 |
| PROB-11v | 验证欠账 | P2 | 移动端（≤720px）「更多操作」菜单的真机验证：实际只显示菜单入口而非直显按钮、菜单在视口内不被导航遮挡、触控可点、Esc/外部点击行为一致。jsdom 不应用媒体查询，组件测试证明不了可见性 | PH PROB-11 |
| PROB-28v | 验证欠账 | P3 | 卡片最小宽度 40 px 的真机验证：详情卡片在 40 px 下的实际列数、标题/描述可读性、点击区域与横向溢出；桌面与 `390×844` 各一轮。40 px 低于 44 px 触控建议值，属已接受取舍但需实测确认可用 | PH PROB-28 |

## 4. 需要向报告者澄清

| ID | 类型 | 优先 | 事项 | 详情 |
| --- | --- | --- | --- | --- |
| PROB-25 | 需求 | P2 | #15 的 EdgeOne 兼容边界未定义（运行时 API 差异、D1/KV 等价存储、部署配置、构建产物、CI、文档范围）。澄清前不排期。**向 Issue 回帖需单独授权** | PH PROB-25 / RD REQ-12 |

## 5. 未获批准的功能需求

这些来自 `plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md`（状态为「需求评估，尚未实现」），**逐项都需要明确批准才可开工**。批准后应开一个 GitHub Issue 承载状态，并从本表移除。

| ID | 优先 | 事项 | 前置 | 详情 |
| --- | --- | --- | --- | --- |
| REQ-01 | P1 | 离屏搜索按钮 + 居中 Spotlight 命令面板 | 与顶部导航按钮对齐的改动必须串行；验收含焦点陷阱与键盘导航，需要 PROB-18c 的真实浏览器层 | RD REQ-01 |
| REQ-04 | P1 | 弹窗打开信号 token + 用户手势读剪贴板预填 URL | 剪贴板必须在 transient activation 链路内，需 PROB-18c | RD REQ-04 |
| REQ-05 | P1 | 预填后自动触发标题解析，3 秒节流 + 竞态保护 | 会使 API 契约里「仅 blur 触发」的描述过期，需同步 | RD REQ-05 |
| REQ-02 | P2 | PC 操作胶囊 hover/focus 渐显，排序态恒显 | hover 与 reduced-motion 需 PROB-18c | RD REQ-02 |
| REQ-03 | P2 | 空分类固定显示「新增书签」按钮，访客不显示 | — | RD REQ-03 |
| REQ-06 | P2 | 新增书签时默认分类取视口中央分类 | — | RD REQ-06 |
| REQ-07 | P2 | 新增 `accent-border` / `accent-glow` token | 先决定是否与已存在的 `--confirm-accent-border` 并轨 | RD REQ-07 |
| REQ-10 | P2 | 书签图标属性契约补齐 | 先裁定 `CachedBookmarkIcon` 是否属于「书签网络图标路径」 | RD REQ-10 |
| REQ-11 | P2 | 字母头像按 hostname/title 派生稳定高对比色 | — | RD REQ-11 |
| REQ-09 | P3 | 信息卡标题/描述换字号 token | 有 0.4px 偏差，须先按视觉回归约束确认 | RD REQ-09 |

`OQ-1`～`OQ-8` 的默认结论都是「不做 / 不改」，只有显式推翻才转为 `REQ` 条目，见 RD §4。

## 6. 发版待办

| ID | 事项 | 说明 |
| --- | --- | --- |
| REL-01 | 分三批按版本制发版 | 已定方案（2026-09-04）：不追认 `v0.1.0`，直接从 `v0.2.0` 开始；tag 打在 `develop` 上，**部署来源是 `develop`，不合并 `main`**（合并只在维护者主动要求时做）。批次边界必须落在自洽可发布的提交上——`8eeac6b → 925c698 → a8fb0e6` 三个提交不可分割，中间那个点的文档链接是悬空的。<br>· `v0.2.0` = `3929d11`…`f3c425f`：R-01~R-08 实现 + 三轮部署后验收修复 + 移动端长按菜单与分类树滚动隔离<br>· `v0.3.0` = `5a06fb3`…`a8fb0e6`：批量移动逐项后果提示、13 套毛玻璃预设强调色、API 契约与 Issue 快照修正<br>· `v0.4.0` = `1b119d4` 起：图标代理关闭匿名枚举（安全）、组件测试层、交付流程规范，以及本轮五条裁定的落地<br>每批都要真部署并跑 L3；**打 tag、推送、部署、关闭 Issue 都需要单独授权**，流程见 CONTRIBUTING.md §6 |
| REL-02 | Issue 关闭需手动执行 | 部署走 `develop` 而默认分支是 `main`，因此提交里的关闭关键字不会生效。每批 L3 通过后手动关闭对应 Issue 并在评论引用版本 tag。当前 6 个 Open：#10 在 `v0.2.0` 验证后即可关；#11 / #12 / #13 待本轮裁定项落地后可关；#9 是聚合反馈，需等其覆盖的 R-01~R-08 全部闭环；#15（EdgeOne）未实现，见 PROB-25 |
