# 本地待办清单

> **这是内部工作项的唯一状态源。** 云端已有编号的缺陷与功能需求以 GitHub Issue 的开闭状态为准；本地发起的问题与需求不新开 Issue，状态就在本表。安全问题按 [SECURITY.md](../SECURITY.md) 处理，不开公开 Issue。规则见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
>
> - 更新日期：2026-10-04；基线：`develop`。
> - 只列**未完成**条目。完成后从本表删除，成果记入 `CHANGELOG.md`，证据与判断留在 `plans/` 的决策记录里。
> - 编号沿用既有 `PROB-NN` / `REQ-NN`，不重新分配。`PROB-18c`、`PROB-20c` 这类后缀表示同一编号的后续阶段。
> - 「详情」列指向决策记录：`PH` = [问题处理任务清单](plans/PROBLEM_HANDLING_TASK_LIST.md)，`RD` = [需求开发任务清单](plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md)。那两份文档**不再维护状态**，只保留证据。

## 1. 无阻塞，可直接开工

| ID | 优先 | 事项 | 当前边界 | 详情 |
| --- | --- | --- | --- | --- |
| REQ-15 | P1 | 可信设备图标本地优先：一期书签、二期分类 | IC-P02～P05 本地实现与验证完成；P05 接通完整书签展示、编辑与快照投影。剩余 P06 迁移/兼容回滚、P07 全量审计、规模数据及测试站点/生产部署后验证；分类 Q01～Q04 待 P07 安全门通过并另获授权启动 | [需求](plans/BOOKMARK_ICON_LOCAL_FIRST_REQUIREMENTS.md) / [开发计划](plans/BOOKMARK_ICON_LOCAL_FIRST_DEVELOPMENT.md) |

## 2. 需要裁定

当前没有待裁定条目。

> 2026-09-04 已裁定并落地：PROB-03 / PROB-27（保持现状，回写文档）、PROB-11（移动端收进「更多操作」菜单）、PROB-12（回写文档，确认浮动操作行）、PROB-28（下限继续下调到 40 px）、PROB-29（改写为「无非法目标 + 逐项后果提示」）。
>
> 2026-09-05 已裁定并在后续轮次完成：PROB-26（建立追溯）、PROB-04（配色分区文案收敛）、PROB-30（让自定义背景也能配置 accent，承接 `REQ-13`）。处理证据见 PH / RD；实现与验证摘要见 `CHANGELOG.md` 对应段落。
>
> 2026-09-06 用户给出 PROB-32 方案；后续已完成实现：删除「本分类」tab、根分类/首个子分类回退以及一级分类选中态调整。实现与验证摘要见 `CHANGELOG.md` 的「PROB-32：优化一级分类空态选择」。

## 3. 需要运行环境或部署后才能闭环（L1 / L3 / L4）

> 部署来源是 `develop`：推送后 Cloudflare 自动构建并更新站点，没有手动 deploy 步骤。
> **首次生产验收已完成（2026-09-05）**：`npm run accept:prod` 27/27 通过、`npm run perf:audit` 9/9 通过，
> 被测构建 `assets/index-E5e6ANTt.js`。流程、分层与排障见 [部署后验收](guides/PRODUCTION_ACCEPTANCE.md)。
> 下表「剩余」列写的是这次**没能**闭环的部分，其余已由脚本证明。

| ID | 类型 | 优先 | 已验证（2026-09-05 生产） | 剩余 | 详情 |
| --- | --- | --- | --- | --- | --- |
| PROB-13 | 验证欠账 | P1 | `L1` 首访探测一次/二访零次；`L3` Service Worker 接管 + 预缓存含 `index-*.js`/`.css`；`L4` 离线可打开；**2026-09-19 L3 复验**：首访/二访、Service Worker、预缓存、离线均通过；Tier 1 自定义 JS 临时写入/恢复已执行 | 仅 `L4`「已检测到新版本」需**两次真实部署**——并入下次真实发版清单，不单独安排；`S3` 自定义 JS 的 CSP 断言与导入提示需 Tier 1 写 + 含自定义 JS 的备份文件，可按需授权在测试实例做；另 2026-09-19 L3 观测到 `accept:prod` 移动端弹窗动作栏选择器与线上标记不匹配，属**测试脚本欠账**（非产品缺陷） | PH PROB-13 |
| PROB-23 | 验证欠账 | P2 | Cache Storage ≤ 5 MiB、首页 0 破图；**2026-09-19 L3 复验** `accept:prod` 0.90 MiB / `perf:audit` 1.20 MiB，均无破图、低于预算 | 旧 SW 版本残留取决于访客浏览器历史，干净 profile **不可控复现**；SW 按构建指纹命名缓存的机制已由单测 + L3 二访 SW 接管覆盖，**不刻意追真实陈旧态** | PH PROB-23 |
| REQ-08b | 验证欠账 | P3 | — | 逐套切换 13 个毛玻璃预设：Tier 1（写 `background_preset_id`）+ 纯人眼审美，**随外观/背景轮次人工过一遍**，无自动化价值 | RD REQ-08 |

## 4. 需要向报告者澄清

| ID | 类型 | 优先 | 事项 | 详情 |
| --- | --- | --- | --- | --- |
| PROB-25 | 需求 | P2 | #15 的 EdgeOne 兼容边界未定义（运行时 API 差异、D1/KV 等价存储、部署配置、构建产物、CI、文档范围）。**由维护者直接在 GitHub 回帖澄清，不占用代理任务**；澄清结果回写后再决定 `REQ-12` 是否排期 | PH PROB-25 / RD REQ-12 |

## 5. 未获批准的功能需求

这些来自 `plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md`（状态为「需求评估，尚未实现」），**逐项都需要明确批准才可开工**。批准后从本表移到第 1 节，状态继续由本表承载。

> **不为本地发起的条目新开 Issue。** GitHub Issue 只承接**云端已有**的报告：由使用者提出、已经存在编号的缺陷与需求。本地开发中发现的问题、自己提出的改进和新增功能，状态一律记在本表，成果记在 `CHANGELOG.md`，决策依据留在 `plans/`。只有当某个本地条目确实对应一个已存在的 Issue 时，才在「详情」列回指那个编号。

| ID | 优先 | 事项 | 前置 | 详情 |
| --- | --- | --- | --- | --- |
| REQ-04 | P1 | 弹窗打开信号 token + 用户手势读剪贴板预填 URL | 剪贴板必须在 transient activation 链路内，需 PROB-18c | RD REQ-04 |
| REQ-05 | P1 | 预填后自动触发标题解析，3 秒节流 + 竞态保护 | 会使 API 契约里「仅 blur 触发」的描述过期，需同步 | RD REQ-05 |
| REQ-02 | P2 | PC 操作胶囊 hover/focus 渐显，排序态恒显 | hover 与 reduced-motion 需 PROB-18c | RD REQ-02 |
| REQ-03 | P2 | 空分类固定显示「新增书签」按钮，访客不显示 | — | RD REQ-03 |
| REQ-06 | P2 | 新增书签时默认分类取视口中央分类 | — | RD REQ-06 |
| REQ-07 | P2 | 新增 `accent-border` / `accent-glow` token | `REQ-13` 已完成；实现本项时需复验现有 accent 定义与预览回退不被覆盖 | RD REQ-07 |
| REQ-10 | P2 | 书签图标属性契约补齐 | 先裁定 `CachedBookmarkIcon` 是否属于「书签网络图标路径」 | RD REQ-10 |
| REQ-11 | P2 | 字母头像按 hostname/title 派生稳定高对比色 | — | RD REQ-11 |
| REQ-09 | P3 | 信息卡标题/描述换字号 token | 有 0.4px 偏差，须先按视觉回归约束确认 | RD REQ-09 |

`OQ-1`～`OQ-8` 的默认结论都是「不做 / 不改」，只有显式推翻才转为 `REQ` 条目，见 RD §4。

## 6. 发版待办

当前没有发版待办。
