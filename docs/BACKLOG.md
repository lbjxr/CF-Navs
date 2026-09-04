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
| PROB-29 | 文档债 | P2 | R-05 文档里「禁用非法目标」的表述在当前数据模型不成立，改写口径。建议与 PROB-11、PROB-12 一并处理，避免多次改同一段 | PH PROB-29 |
| PROB-11 | 需裁定 | P2 | R-02 首页新建子分类：移动端收进「更多操作」菜单，还是保留直显图标按钮并回写文档？ | PH PROB-11 |
| PROB-26 | 需裁定 | P2 | 已关闭的 #8 要不要建立追溯，还是明确「Closed Issue 不建立追溯」？ | PH PROB-26 |
| PROB-03 | 需裁定 | P2 | R-04 分类树打开时当前项要不要自动获得焦点？先裁定「键盘可达」是否包含自动聚焦 | PH PROB-03 / PROB-27 |
| PROB-12 | 文档债 | P3 | R-03 入口位置：文档建议「经常访问」标题右侧，实现是全局浮动操作行。低风险，只需回写文档 | PH PROB-12 |
| PROB-04 | 需裁定 | P3 | 配色分区的模块顶层说明算不算 `FR-B1` 范围？分组名要不要收敛成 `FR-B2` 写的「毛玻璃」？ | PH PROB-04 |
| PROB-28 | 需裁定 | P3 | 卡片最小宽度已从 80 降到 44，是否满足 #13 的诉求？决定后才知道要不要回帖或继续下调 | PH PROB-28 |
| PROB-30 | 需裁定 | P3 | 自定义背景（无预设）时 accent 仍回退为固定冷蓝。保留并加注释、改中性色，还是让自定义背景也能配 accent？ | PH PROB-30 |

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
| REL-01 | 首次按版本制发版 | `CHANGELOG.md` 已转为版本分节，当前全部内容在 `[Unreleased]`。发版需要：定版本号 → 同步 `package.json` → 合并 `develop` → `main` → 打 tag → 部署 → 跑 L3 清单。**每一步都需要明确授权**，流程见 CONTRIBUTING.md §6 |
