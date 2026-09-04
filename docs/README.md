# CF-Navs 文档

项目文档按用途分为以下几类，避免用户指南、技术契约和开发过程记录混在同一目录。

## 文档优先级与使用顺序

后续开发不要把所有文档当作同一种“任务清单”。按以下顺序读取和使用：

1. **先看工程规则**：仓库内 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 规定分支模型、提交粒度、验证分级、发版流程和敏感信息边界；安全问题看 [`SECURITY.md`](../SECURITY.md)。本机专属配置（SSH 别名、本地验证目标、浏览器路径等）留在工作区的 agent 指令文件里，不复制进 `docs/`。
2. **再看当前要做什么**：内部工作项看 [`BACKLOG.md`](BACKLOG.md)，它是本地待办的**唯一状态源**；用户可见的缺陷与功能需求看 GitHub Issue 的开闭状态。`plans/` 下的文档**不维护状态**。
3. **再看当前事实**：以当前 `develop` 分支源码、`package.json`、测试和运行验证为最终事实来源。文档与源码冲突时，先按源码修正文档，再继续开发。
4. **需要背景时看决策记录**：`plans/` 说明当初为什么这么改、哪些约束必须继续遵守。
   - 缺陷 / 验收欠账 / 文档与源码不一致 / 风险的核对证据：`plans/PROBLEM_HANDLING_TASK_LIST.md`（`PROB-NN`）。
   - 尚未实现的功能需求及其来源：`plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md`（`REQ-NN`）。
   - 设置页 / 顶部导航 / 部分导出：`plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md`，需求边界看 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 与 `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md`。
   - R-01～R-08 Issue 需求：`plans/DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md`；云端 Issue 快照看 `reference/GITHUB_ISSUES_REQUIREMENTS.md`（快照会过期，状态以 GitHub 实时查询为准）。
   - 前端体验优化：`plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md` 是需求评估，状态“尚未实现”，不能当作已批准的实现清单。
5. **涉及公共契约时同步查参考文档**：API 看 `reference/API_CONTRACT.md`，性能看 `reference/PERFORMANCE_CONTRACT.md`，架构和当前功能看 `reference/PROJECT_OVERVIEW.md`，实现细节看 `reference/TECHNICAL_NOTES.md`。
6. **开发完成后写发布记录**：`CHANGELOG.md` 按版本分节，只记录已交付的变更；未发版的内容放在 `[Unreleased]`。

### 目录功能边界

| 目录/文件 | 功能 | 使用原则 |
| --- | --- | --- |
| `guides/` | 快速开始、部署、排障和数据导入等可操作流程 | 面向使用者；命令和步骤必须与当前脚本/配置一致 |
| `reference/` | API、性能、架构、分类和 Issue 状态等稳定事实 | 面向维护者；涉及契约或实现变化时必须同步更新 |
| `plans/` | 决策记录：已完成轮次的实施记录、需求评估、核对证据和任务边界 | **不维护待办状态**；历史现状必须标注为历史，行号引用可能已腐烂 |
| `BACKLOG.md` | 内部工作项的唯一状态源 | 只列未完成条目；完成后删除，成果记入 `CHANGELOG.md` |
| `CHANGELOG.md` | 按版本分节的已交付变更记录 | 只记录已完成事项，不提前记录计划功能 |

### 冲突裁决

文档出现冲突时，**工程规则**先遵守 `CONTRIBUTING.md`；**当前待办**以 `BACKLOG.md` 与 GitHub Issue 为准；**实现事实**以当前源码和实际验证结果为准；**契约**以 `API_CONTRACT.md`、`PERFORMANCE_CONTRACT.md` 等参考文档为准；然后参考决策记录、项目概览、指南和变更记录。云端 Issue 状态必须通过 GitHub 实时查询确认，不能由本地提交或本地实现推断。

## 使用与部署指南

- [快速开始](guides/QUICKSTART.md)
- [完整部署指南](guides/DEPLOYMENT.md)
- [常见问题排查](guides/TROUBLESHOOTING.md)
- [Sun-Panel 数据导入](guides/SUNPANEL_IMPORT.md)


## 技术参考

- [项目概览](reference/PROJECT_OVERVIEW.md)
- [Open GitHub Issues 需求与问题汇总](reference/GITHUB_ISSUES_REQUIREMENTS.md)
- [API 契约](reference/API_CONTRACT.md)
- [技术说明](reference/TECHNICAL_NOTES.md)
- [分类层级设计](reference/CATEGORY_HIERARCHY_DESIGN.md)
- [性能契约](reference/PERFORMANCE_CONTRACT.md)
- [性能测试](reference/PERFORMANCE_TESTING.md)

## 发布与变更记录

- [变更记录](../CHANGELOG.md)

## 开发计划与决策记录

`plans/` 保存已完成轮次的计划文档，以及经过源码核对的需求评估记录。它们不是待办清单，而是决策记录——说明当初为什么这么改、哪些约束在后续修改中必须继续遵守，以及哪些验证还没补齐。
每份文档文首都标注了状态和对应的实现提交。

- [平台优化（加载 / 安全 / 冗余 / UI / 结构）](plans/PLATFORM_OPTIMIZATION_PLAN.md)
- [后台管理移动端布局](plans/ADMIN_MOBILE_LAYOUT_PLAN.md)
- [PR #7 合并检查（私密书签 / 跨分类排序 / 浏览器书签同步）](plans/PR7_MERGE_REVIEW_PLAN.md)
- [部分导出备份 / 顶部导航分行显示 / 右上角按钮对齐（需求评估）](plans/PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md)
- [后台设置页面 UI/UX 调整（需求评估）](plans/SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md)
- [开发任务规划（设置页 UI/UX + 顶部导航 + 部分导出）](plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md)
- [开发任务规划（R-01～R-08 Issue 需求）](plans/DEV_TASK_BREAKDOWN_GITHUB_ISSUES.md)
- [前端体验与自用效率优化（需求评估）](plans/FRONTEND_EXPERIENCE_OPTIMIZATION_REQUIREMENTS.md)
- [设置页 UI/UX 改造规范（原始草案，已被 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 取代）](plans/UI_UX_Plan.md)

### 待办与决策记录

待办状态只有两个来源：内部工作项看 [本地待办清单](BACKLOG.md)，用户可见的缺陷与需求看 GitHub Issue。下面两份是**决策记录**，保留核对证据与判断，不维护状态，也不构成开工授权。

- [本地待办清单](BACKLOG.md)：**先看这份。** 按「无阻塞 / 需裁定 / 需运行环境 / 需澄清 / 未获批准 / 发版待办」分组，一行一条，只列未完成项。
- [问题处理任务清单](plans/PROBLEM_HANDLING_TASK_LIST.md)：`PROB-NN` 的完整证据与判断——缺陷、验收未达标、文档与源码不一致、遗留验证欠账、安全与稳定性风险、信息不足需澄清。
- [需求开发任务清单](plans/REQUIREMENT_DEVELOPMENT_TASK_LIST.md)：`REQ-NN` 的需求来源与核对证据、待决策的 `OQ`、已明确不做的条目、实施顺序与冲突协调。

## 图片

- `screenshots/`：README 当前使用的产品截图。

本地历史记录、草稿和浏览器验证资料应放在已忽略的 `docs/history/`、`docs/local/`、`docs/drafts/` 或根目录 `_archive/`，不会进入构建、部署或 Git 提交。

`PROJECT_OVERVIEW.md` 中的维护待办只记录当前源码能够确认的未完成事项；已完成阶段计划和没有产品契约的设想不继续作为当前路线图维护。

## 项目目录

- `src/`：Svelte 前端页面、组件和浏览器端逻辑。
- `worker/`：Cloudflare Worker 路由、中间件和 D1 数据访问。
- `shared/`：前后端共享类型与设置定义。
- `public/`：PWA、Service Worker 和静态资源。
- `scripts/`：开发、部署、测试、审计和数据转换脚本，详见 [脚本说明](../scripts/README.md)。
- `tests/`：Vitest 单元、源码回归与组件测试。组件测试用 `@testing-library/svelte` + jsdom 挂载真实 DOM，通过文件首行 `// @vitest-environment jsdom` 单文件启用，不改全局环境，其余测试仍跑在默认 node 环境。
- `schema.sql`：D1 数据库结构，是部署必需文件。
