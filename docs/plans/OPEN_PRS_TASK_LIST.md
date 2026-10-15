> **STATUS: 进行中**（判定于 2026-10-15）——开放 PR 清单（PR #14 待处理），以 GitHub 云端实时状态为准，本地快照会过期。

# 开启 PR 审查任务清单

> **性质：** PR 内容分析、合并门禁与建议任务快照，不是批准合并或开发的决定。
> **内容采集：** 2026-09-13 09:34:37 UTC；合并状态与检查结果采集于 09:37:05 UTC。
> **范围：** `lbjxr/CF-Navs` 全部 Open PR，共 **1 个：#14**；已读正文、9 个提交、22 个文件的完整补丁、评论/审查记录及 CI 失败日志。
> **本轮边界：** 只读 GitHub 和源码、整理文档；未 checkout 或执行 PR 代码，未修改源码、重跑 CI、提交审查意见、改目标分支或合并。
> **配套文档：** [开启 Issue 任务清单](OPEN_ISSUES_TASK_LIST.md)。Issue 与 PR 共用编号，但不混入同一任务表。

## 1. PR 总览与结论

| 项目 | 本次查询事实 |
| --- | --- |
| PR | [#14：整理核心功能并同步上游主分支](https://github.com/lbjxr/CF-Navs/pull/14) |
| 云端状态 | Open，非 Draft；创建及最后更新时间均为 2026-08-30 05:02:44 UTC |
| 目标 / 来源分支 | `main` ← fork 的 `整理核心功能-同步上游` |
| 固定 head | `42ac8fa0f20e2df9dcc555095933aef32731e834` |
| 查询时 base | `main`：`1b3d9ea5ec49fdd91ff7a4e509c6d76dd828733d` |
| 本次对照基线 | 本地与远端 `develop` 一致：`4f4391c3e4234275fcb2edc2235f029f3c3c9cb6` |
| 变更规模 | 9 commits，22 files，+216 / -51；22 个文件均已取得文本 patch |
| 合并条件 | GitHub GraphQL 返回 `mergeable=CONFLICTING`、`mergeStateStatus=DIRTY` |
| 审查与关联 | 普通评论 0、正式 reviews 0、行内 review comments 0、review requests 0；无自动关闭关联 Issue、无 label/milestone。零审查不代表获批 |
| 检查 | `CI / verify` 为 `FAILURE`；类型检查失败，Unit tests 与 Build 均 skipped |

**建议：当前不要直接合并。** 已有云端冲突、CI 失败及声明功能未闭环的静态证据；同时目标 `main` 不符合项目以 `develop` 集成、`main` 仅归档的交付规则。应先裁定范围与目标，再处理下面的具体任务；本轮没有执行这些变更。

快照会过期。正式接纳前必须重新读取 PR 状态、head SHA 和检查结果，不能沿用本表作最终批准。

## 2. 正文承诺与实际内容

| 正文内容 | 实际差异 / 当前证据 | 审查结论 |
| --- | --- | --- |
| 内网地址字段及优先访问所需的数据、校验、导入和查询链路 | 加入 `internal_url` 的部分表结构、载荷、映射和 SQL；共享类型缺字段，前端输入与访问消费未同步 | 不是完整可用能力；需先补齐契约并确认安全边界 |
| 移动端平时隐藏编辑入口，排序/拖动时显示，PC 右键不变 | `Home.svelte` 在排序展示分支传编辑回调；新增测试期待编辑按钮与控制属性，但对应组件没有这些实现 | 不能把传递回调等同于移动端入口已经实现；需核对真实交互 |
| 排序模式展开主分类与子分类并跨分类拖动 | 主要改动集中在旧版 `Home.svelte` 的排序分支；当前 `develop` 已有统一跨分类草稿、完整顺序提交及移动端替代操作 | 先与已交付能力去重，不整块移植旧首页逻辑 |
| 扩展自定义新标签页 | `popup.html` 新增开关、URL 输入和保存按钮；没有相应 `popup.js` 处理或 manifest 新标签页接管声明 | 本次 head 只有控件，缺少可运行闭环 |
| README / CHANGELOG / 版本出处说明 | 三份说明文件与 popup 署名有修改；说明中部分功能超出实际实现 | 文档需跟随最终接纳范围，不能保留未实现能力的肯定描述 |
| 不带 ZIP、截图、依赖目录、构建产物或临时发布文件 | 本次最终 22 文件变更清单没有上述文件 | 仅能证明本次文件差异范围，不据此判断整个 fork 历史 |
| 作者声称 93 files / 632 tests、tsc、svelte-check、vite build 全通过 | 当前 head 的 GitHub CI 在 `tsc --noEmit` 失败，后续检查未执行 | 原文保留为作者说明，不能当成本次验证结论 |

### 2.1 CI：已确认的阻断，不是推测

来源：[CI run 33293817323](https://github.com/lbjxr/CF-Navs/actions/runs/33293817323)、[verify job](https://github.com/lbjxr/CF-Navs/actions/runs/33293817323/job/99209945772)。运行关联 head 与本次 PR head 相同。

- `npm run type-check` 执行 `tsc --noEmit && svelte-check --tsconfig ./tsconfig.json`；tsc 退出码 **2**，因此 svelte-check 没有执行。
- 原始日志有 **13 条 TypeScript 错误**，全部涉及 `internal_url` 与 `Bookmark`、`PublicBookmark`、`BookmarkUpsertReq` 的类型不匹配，分布于 `adminFormAdapters.ts`、`appData.ts`、`bookmarkPayload.ts`、`db/bookmarks.ts`、`db/import.ts`、`db/importHelpers.ts`。
- GitHub check annotations 仅收录其中 **10 条 failure**，另有 1 条 Actions Node.js 20 弃用 warning。错误总数以完整日志为准；该 warning 不是此次退出的原因。
- 固定 head 的 [shared/types.ts](https://github.com/lbjxr/CF-Navs/blob/42ac8fa0f20e2df9dcc555095933aef32731e834/shared/types.ts) 中，`Bookmark`、`BookmarkUpsertReq` 没有 `internal_url`；`PublicBookmark` 派生自 `Bookmark`。这是与 CI 一致的源码证据。
- Unit tests 和 Build 的 job step 为 **skipped**，不能写成失败，也不能写成通过。本轮仅读取历史运行结果，未重跑任何项目检查。

### 2.2 固定 head 的静态缺口

以下均针对上述 SHA，不是当前线上缺陷的断言，也不替代后续运行验证。

1. **内网字段只接入部分链路。** `BookmarkBaseFields.svelte` / `BookmarkEditModal.svelte` 未增加内网输入；卡片的地址消费仍使用 `bookmark.url`。`Home.svelte` 只增加站点级 `data-cf-navs-site` 标记，未形成文档所述每书签地址标记与内网优先访问闭环。是否由站点或扩展负责访问选择，仍须明确。
2. **导入与公开字段需要独立裁定。** `normalizeImportBookmark` 以类型转换原样复制 `internal_url`，而 `importValidation.ts` 未同步该字段规则；`PUBLIC_BOOKMARK_LIST_SQL` 与 `toPublicBookmark` 又把该字段纳入公开数据链路。必须明确允许的协议、空值/旧数据处理及匿名可见性，不能只补 TypeScript 字段就宣称安全完整。**本轮未确认可利用漏洞，也没有做攻击或网络探测。**
3. **新标签页缺实际接线。** [popup.html](https://github.com/lbjxr/CF-Navs/blob/42ac8fa0f20e2df9dcc555095933aef32731e834/browser-extension/popup.html) 增加 `newtab-enabled`、`newtab-url`、`save-newtab`；[popup.js](https://github.com/lbjxr/CF-Navs/blob/42ac8fa0f20e2df9dcc555095933aef32731e834/browser-extension/popup.js) 只有原有登录、密码显隐和暂停同步处理，没有这些控件的存取/监听；[manifest.json](https://github.com/lbjxr/CF-Navs/blob/42ac8fa0f20e2df9dcc555095933aef32731e834/browser-extension/manifest.json) 没有 `chrome_url_overrides`。
4. **移动编辑的测试与实现不对应。** [categoryCollapseMarkup.test.ts](https://github.com/lbjxr/CF-Navs/blob/42ac8fa0f20e2df9dcc555095933aef32731e834/tests/unit/categoryCollapseMarkup.test.ts) 新增了 `showEditButton`、`showSortSessionLabel` 和 `.bookmark-edit-button` 等源码字符串期待，但固定 head 的 `CategorySection.svelte` / `BookmarkCard.svelte` 未提供对应实现。这里只记录静态不一致；测试本轮未运行，且不能用字符串匹配替代真实移动交互验收。
5. **历史并非已整理成最终接纳提交。** 9 个提交中有同题的逻辑整理与后端载荷提交；`89ee5d41f724fc911487531837177d00375dace6` 与父提交 `4bd82dbd4cbfa8c58efd89148524589efd2b99ab` 的 tree 同为 `a4bed8985d9b509ba2b86c9fa1b9c800bd46c8db`，为不改变文件树的空提交。不能把“便于最终 Squash”理解成已经完成整理，更不能据此擅自改写作者分支历史。

### 2.3 与当前 develop 的重叠

- 当前 `Home.svelte` / `src/lib/homeSort.ts` 已使用 `buildHomeSortCategoryOrders`、`moveBookmarkToCategory` 及完整排序草稿；`CategorySection.svelte` / `BookmarkCard.svelte` 已有移动目标和移动端菜单链路。
- [R-01～R-08 需求记录](../reference/GITHUB_ISSUES_REQUIREMENTS.md) 保存已发布的跨分类、取消、冲突及移动端非拖动方案。PR 的同名能力不应重新当成全新开发任务。
- #9 评论中的移动端前台编辑、内网/NAS 协同和新标签页扩展原属候选贡献，并非 R-01～R-08 的正式验收承诺。PR 已提交不等于这些范围已获接纳。
- 当前 [CHANGELOG](../../CHANGELOG.md) 已记录 v0.5.0 的 Svelte 5 / Vite 7 等工具链迁移。旧 PR 的作者测试数字不能证明在当前开发基线兼容。

## 3. 独立 PR 任务清单

`PR14-A` 等仅是本文审查项标记，不新建 Issue 或本地 backlog。表内验收为未来接纳条件，均未在本轮执行。

| 标记 | 建议任务 | 阻塞 / 依赖 | 未来完成条件 |
| --- | --- | --- | --- |
| PR14-A | 由维护者裁定接纳哪些功能、目标分支及拆分方式 | 目前面向 `main`，而 [CONTRIBUTING](../../CONTRIBUTING.md) 要求先在 `develop` 集成；候选功能未获批准 | 明确内网地址、移动编辑、排序增量和扩展是否接纳；可由贡献者改投或按批准范围重新提交，不直接合并到 `main`，不擅自强推 |
| PR14-B | 基于当前 `develop` 处理冲突并剔除已实现的重叠 | 云端为 `CONFLICTING / DIRTY`；依赖 A | 新候选差异只保留批准的增量，保存现有权限、排序冲突处理及工具链；对新的目标/head 重新检查，不把本次状态当永久结果 |
| PR14-C | 补齐或撤回 `internal_url` 共享数据契约，先解除实际类型错误 | 已有 13 条 CI 错误；依赖 A/B，公开字段设计与 F 联动 | `Bookmark` / 请求类型及相关派生类型与真实读写一致，不用宽泛类型转换掩盖遗漏；当前候选 head 的 type-check 通过，公开类型按 F 的可见性决定 |
| PR14-D | 补齐内网地址的端到端功能，或删掉未接纳的功能声明 | 当前缺输入、卡片/扩展消费闭环；依赖 A/C/F | 明确字段录入、修改、清空、保存、读取和实际访问的责任方；按批准规则验证内网可达/不可达时的地址选择，保留 PC/移动及打开方式语义，不由服务端擅自探测部署者内网 |
| PR14-E | 统一新装/升级、CRUD、导入导出中的字段规则 | schema、SQL 和导入 helper 已改，但共享/导入校验不完整；依赖 C/F | 空值、旧记录、合法/非法协议、追加与覆盖导入规则一致；旧备份兼容、不丢私密标记和分类引用；迁移与重复启动可用。同步 [API 契约](../reference/API_CONTRACT.md) |
| PR14-F | 决定内网地址能否对匿名公开，以及优先访问的安全/权限边界 | PR 已向公开 SQL/映射加入该字段；这是待决策事项，不是已批准策略 | 形成字段可见性规则；公开/私密书签及私密父分类、聚合响应、缓存和导出都遵守同一规则；任何探测/跳转的发起端、协议和权限明确，真实私网地址不进入示例或日志 |
| PR14-G | 补齐获准的移动端编辑入口并核对 PC 右键行为 | 正文、组件和新增字符串断言不一致；依赖 A/B | 普通移动浏览状态不误露编辑入口；排序状态通过真实触控进入编辑，保存/取消、滚动与拖拽互不干扰；匿名无管理操作；PC 右键按约定保留 |
| PR14-H | 仅审查跨分类排序的新增差异，不重建现有会话 | 当前 develop 已覆盖大量同类能力；依赖 B | 核对一级/二级/空分类、取消零写入、完整顺序保存、过期数据冲突反馈与移动端非拖动替代路径；不得回退当前已交付行为 |
| PR14-I | 完成获准的新标签页功能，或移除无效控件与过度说明 | 只有 popup HTML；依赖 A | 配置能保存与恢复，manifest/接管页面/跳转逻辑完整；开关开启、关闭、空地址、非法地址和默认行为明确；真实扩展安装后验证且不破坏原单向书签同步 |
| PR14-J | 用真实行为验证替代脆弱的功能字符串期待 | 当前 CI 跳过测试；旧 PR 测试与当前组件约定不同；依赖对应功能任务 | 针对内网字段、导入、匿名边界、移动编辑和排序保留能失败于真实缺陷的用例；交互由组件/浏览器验证，不用属性字符串存在证明功能完成；当前 head 的全部既有测试通过 |
| PR14-K | 整理最终提交与 README / CHANGELOG / 扩展说明 | 文档承诺领先实现，存在重复题目与空提交；依赖 A 及功能裁定 | 说明只覆盖实际接纳能力，普通版/其他版本说法有对应产物；遵守扩展独立版本与项目发布规则，保留贡献出处；不带二进制/临时文件，不擅自改写历史 |
| PR14-L | 在批准的最终候选上完成验证和维护者审查 | A–K 中所有适用项已处理 | 达到下节对应验证门，关联准确 head SHA；CI 成功不替代人工范围/安全审查。合并、推送、部署、Issue/PR 状态操作分别获得授权后才执行 |

**建议顺序：** A → B；内网功能按 F/C → D/E，移动编辑与排序按 G/H，扩展按 I；对应行为完成后进入 J/K → L。未接纳的功能应明确排除并清理其无效改动/说明，不静默缩小正文承诺。

## 4. 22 个变更文件覆盖表

按唯一主归属计数；测试另列，不在功能组重复计数。完整路径方便后续审查定位，不用易失效的裸行号。

| 主归属 | 文件 | 对应任务 |
| --- | --- | --- |
| 内网数据（1/12） | `schema.sql` | C/E/F |
| 内网数据（2/12） | `src/lib/adminFormAdapters.ts` | C/D |
| 内网数据（3/12） | `src/lib/adminTypes.ts` | C/D |
| 内网数据（4/12） | `src/lib/appData.ts` | C/F |
| 内网数据（5/12） | `src/lib/appModalState.ts` | C/D |
| 内网数据（6/12） | `src/lib/bookmarkFormIcons.ts` | C/D |
| 内网数据（7/12） | `worker/lib/bookmarkPayload.ts` | C/E/F |
| 内网数据（8/12） | `worker/lib/db/bookmarks.ts` | C/E |
| 内网数据（9/12） | `worker/lib/db/import.ts` | C/E |
| 内网数据（10/12） | `worker/lib/db/importHelpers.ts` | C/E/F |
| 内网数据（11/12） | `worker/lib/db/schema.ts` | E |
| 内网数据（12/12） | `worker/lib/db/sql.ts` | C/E/F |
| 首页排序（1） | `src/views/Home.svelte` | B/G/H |
| 扩展（1/2） | `browser-extension/popup.html` | I/K |
| 扩展（2/2） | `browser-extension/README.md` | I/K |
| 项目文档（1/2） | `README.md` | D/K |
| 项目文档（2/2） | `CHANGELOG.md` | K |
| 测试（1/5） | `tests/unit/appModalState.test.ts` | C/D/J |
| 测试（2/5） | `tests/unit/bookmarkPayload.test.ts` | C/E/J |
| 测试（3/5） | `tests/unit/categoryCollapseMarkup.test.ts` | G/H/J |
| 测试（4/5） | `tests/unit/importHelpers.test.ts` | E/J |
| 测试（5/5） | `tests/unit/urlPolicy.test.ts` | E/F/J |

`shared/types.ts`、书签输入/卡片组件、扩展 `popup.js` / `manifest.json`、`worker/lib/importValidation.ts` 等是审查发现的关联缺口，**不是本次 PR 已修改文件**，不能加入上述 22 文件的统计。

## 5. 未来验证门与本轮证据边界

| 场景 | 未来最低证据 |
| --- | --- |
| 全部接纳改动 | 当前受支持 Node.js / Svelte 工具链上的 L0：type-check、单元测试、build、空白字符检查；GitHub CI 与候选 head 对齐 |
| schema / Worker / 导入与数据契约 | L0 + L1；新装、旧库升级、CRUD、追加/覆盖导入、权限与错误边界，在隔离环境验证 |
| 首页、移动编辑、排序 | L0 + L2；真实 PC 与移动视口操作、取消/保存/冲突及匿名边界 |
| 扩展新标签页 / 内网访问 | 专用测试 profile 安装真实扩展，验证开关、跳转与原书签同步；网络环境与访问目标先取得授权，不探测无关地址 |
| 若修改缓存、图标或性能链路 | 按 CONTRIBUTING 补 L3 及适用 L4；不把本轮静态分析当部署后验收 |

采集方法：Open PR、commits、files、普通评论、reviews、review comments 和检查注解均通过 GitHub API 完整分页读取；另取 GraphQL 合并/检查汇总与 Actions 原始失败日志。零评论/审查是已成功读取的空结果，不是接口失败后的默认值。

本轮形成 **12 条审查任务**，没有修复其中任何一项。当前部署行为、修复后的 CI、真实移动交互、新标签页及内网可达性均未在本轮验证；是否接纳和如何落地仍由维护者决定。
