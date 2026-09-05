# 参与开发

本文是 CF-Navs 的工程规则，适用于所有代码、文档和发布改动。与本机环境相关的私有配置（SSH 别名、本地验证目标、浏览器路径、代理端口等）不写在这里。

## 1. 分支模型

| 分支 | 角色 | 规则 |
| --- | --- | --- |
| `develop` | 集成分支、默认工作分支，**也是发版与部署来源** | 所有开发在这里落地；提交前必须通过 L0 验证；版本 tag 打在这里的对应提交上 |
| `main` | 已审阅归档快照 | **只接受来自 `develop` 的合并**，禁止直接提交、禁止在 main 上改文件；**只在维护者明确要求时才合并**，不作为部署来源 |

- 开始任何改动前确认当前分支是 `develop`。
- 部署来自 `develop`，因此 `main` 不代表线上代码；「线上是哪个版本」看 `develop` 上最新的版本 tag，不看 `main`。
- 合并 `develop` → `main` 是一个独立的归档动作，需要维护者主动要求；不要为了发版而自动合并。
- 因为 `main` 是默认分支而部署走 `develop`，**推送到 `develop` 的关闭关键字不会关闭 Issue**。Issue 需要在部署验证通过后手动关闭，并在评论里引用对应的版本 tag。
- `main` 上出现过只存在于 main 的内容（如 Issue 模板），这类单向缺失会让 `develop` 不再是 `main` 的超集，后续合并必然冲突。**发现 main 独有内容时，先回流到 `develop`，再继续开发。**
- 禁止 `git push --force` / `--force-with-lease` / `reset --hard` / 分支删除，除非明确针对某次事故且已确认要覆盖哪些提交。

## 2. 一次改动一个主题

- **一个 commit 只闭环一个编号**（一个 Issue，或本地 backlog 的一条）。文档同步、测试、变更记录属于该改动的一部分，放在同一个 commit；不同编号不要合并进同一个 commit。
- 把多轮工作打包进一个 commit 会让回滚、追溯和复核都失效，也无法回答"这个修复上线了吗"。
- **做完一个编号就立刻提交，不要攒着。** 这是硬要求，不是建议：`docs/reference/GITHUB_ISSUES_REQUIREMENTS.md`、`docs/plans/PROBLEM_HANDLING_TASK_LIST.md`、`docs/BACKLOG.md`、`CHANGELOG.md` 这几份文件会被**多个编号同时改**，一旦累积成一堆再想按编号拆开，就只能做行级/章节级的索引手术——零上下文补丁在这些文件里会定位错行（`---`、空行这类锚点重复出现），把表格行插到表格外，甚至重复插入同一行。攒着改的代价远高于多提交几次。
- 一轮里做多个编号时，顺序是「改第一个编号 → 跑该级别验证 → 提交 → 再改第二个」。中途需要临时保存进度时用未提交的工作区，不要把第二个编号的改动叠到第一个之上。
- 提交信息格式（沿用仓库既有风格）：

  ```
  <type>: <英文单行主题，不超过 70 字符>

  <中文正文：为什么改、核对推翻了什么假设、关键实现取舍、已知降级>

  Verified: L0,L1
  refs #<编号>
  ```

- `type` 取 `fix` / `feat` / `docs` / `chore` / `refactor` / `test` / `perf`。
- Issue 关联：Bug 用 `fixes #N`，功能用 `closes #N`，仅引用用 `refs #N`。**关闭关键字只有在提交进入默认分支 `main` 后才生效**；由于部署走 `develop`、`main` 只在维护者要求时才合并，日常提交请一律用 `refs #N`，把实际关闭留到部署验证之后手动执行，不要据此宣称已关闭。
- 一个改动同时牵涉多个 Issue 且没有单一主责 Issue 时，用 `refs`，不要用关闭关键字。

## 3. 证据引用不写裸行号

计划、台账和提交信息里指向源码时：

- **推荐**：文件路径 + 符号名，例如 `worker/routes/icon.ts` 的 `iconRoutes.get('/icon/:id')`、`shared/settings.ts` 的 `SETTINGS_KEYS`。
- 需要精确到行时用带 commit SHA 的 GitHub permalink，SHA 固定后行号不会腐烂。
- **禁止**只写 `file.ts:123`。一次重构就会让它指向无关代码，而读者无法察觉。

## 4. 验证分级

每个 commit 在信息尾部声明达到的最高级别（`Verified: L0` / `Verified: L0,L1` …）。未达到的级别不是"可以忽略"，而是自动进入发版前清单。

| 级别 | 内容 | 命令 | 前置条件 |
| --- | --- | --- | --- |
| **L0** 静态 | 类型、单元测试、构建、空白字符 | `npm run type-check`、`npm test`、`npm run build`、`git diff --check` | 无。CI 已覆盖前三项 |
| **L1** API 端到端 | 鉴权、CRUD、排序、设置、导入导出、登出失效 | `npm run smoke` | 需先 `npm run build`（`ASSETS` 绑定要 `./dist`）。脚本自己起隔离实例、造临时 D1 与一次性凭据并拆除，**CI 已覆盖** |
| **L2** 浏览器 | 渲染、交互、后台流程 | `npm run regression:chrome`；组件测试随 `npm test` 一起跑 | 回归套件需可达目标地址与管理员凭据；组件测试无前置 |
| **L3** 真机 / 部署后 | 视口数值、iOS Safari 输入放大、Service Worker 与缓存、性能预算 | 人工 CDP 验证 + `npm run perf:audit` | 需已部署实例；部分项必须真实 iOS Safari |

按改动范围决定必须达到哪一级：

| 改动范围 | 最低要求 |
| --- | --- |
| 纯文档 | L0（`git diff --check` + 相关链接可达） |
| 纯函数 / 类型 / 共享定义 | L0 |
| `worker/routes/`、`worker/lib/db/`、`schema.sql` | L0 + L1 |
| Svelte 组件、样式、交互 | L0 + L2 |
| 缓存策略、Service Worker、图标链路、性能相关 | L0 + L2，并把 L3 项登记到发版清单 |

补充纪律：

- 要测行为**先抽纯函数**再单测。组件的 DOM 行为（焦点、ARIA、键盘、禁用联动）用 `@testing-library/svelte` + jsdom 写组件测试，文件首行加 `// @vitest-environment jsdom`，不改全局测试环境。
- 计算样式、`dvh` 与安全区、虚拟键盘、剪贴板用户手势、iOS 输入放大 **jsdom 证明不了**，只能进 L3。不要用源码文本断言假装覆盖了它们。
- 源码文本断言（`readFileSync` + `toContain`）只用于"接线是否存在"，不用于证明行为。
- 组件测试依赖 `vite.config.ts` 在 test 模式下的 `resolve.conditions: ['browser']`。Svelte 4 的 `exports["."]` 只在 `browser` 条件下给出真实运行时，否则落到 SSR 版本，那里的 `onMount` 是空实现——组件在 `onMount` 里注册的 `window` / `document` 监听器会**静默不存在**。不要删掉这项配置。
- 断言「观察不到某个行为」时，先确认不是运行时解析或缺失的浏览器 API（`scrollIntoView`、`matchMedia`、`scrollTo` 在 jsdom 里都需要自己补），再下「jsdom 做不到」的结论。把环境问题写成不可迁移结论会留下错误的判断记录。
- 新写的组件测试要做一次反向对照：改坏被测行为，确认对应用例精确失败。若两道防线互为兜底（去掉任一条都不红），在文件里注明这是 defense-in-depth，不要因此删掉断言。

## 5. 任务状态放在哪里

只有一个地方记录某件事的状态，避免同一事实手写多份。

| 类型 | 状态源 | 说明 |
| --- | --- | --- |
| 用户可见的缺陷与功能需求 | **GitHub Issue** | open/closed 就是状态，label 就是分类，milestone 就是发版批次。一个 Issue 只聊一件事 |
| 内部技术债、文档债、验证欠账、待裁定事项 | **`docs/BACKLOG.md`** | 单一勾选清单，一行一条，含阻塞原因 |
| 安全问题 | **不开公开 Issue** | 见 [SECURITY.md](SECURITY.md)；修复落地后再在变更记录中公开描述 |

- 本地 backlog 条目一旦变成用户能观察到的问题或需求，就开 Issue 并在 backlog 里标注指向；反之不要把内部技术债搬到公开 Issue。
- `docs/plans/` 下的文档是**决策记录**：说明当初为什么这么改、哪些约束必须继续遵守。它们**不维护状态**，写完就不再改勾选和进度表。状态一律看 `docs/BACKLOG.md` 或 Issue。
- 云端 Issue 状态只能通过实时查询确认，不得由本地提交或实现推断。

## 6. 发版流程

版本号用 `v<major>.<minor>.<patch>`，与 `package.json` 的 `version` 保持一致。

1. 在 `develop` 上确认目标改动已达到对应验证级别，`CHANGELOG.md` 的 `[Unreleased]` 段落内容完整。
2. 把 `[Unreleased]` 改成 `## v0.x.y — YYYY-MM-DD`，在其上留一个新的空 `[Unreleased]`。
3. 同步 `package.json` 的 `version`。
4. 提交 `chore(release): v0.x.y`。
5. 在 `develop` 的该提交上打 tag：`git tag -a v0.x.y -m "v0.x.y"`，推送分支与 tag。
6. 部署（`npm run deploy`），随后验证**生产自定义域**而不只是默认域名。
7. 执行该版本的 L3 清单，结果回写到 `CHANGELOG.md` 对应版本段或 `docs/BACKLOG.md`。
8. L3 通过后，手动关闭该版本闭环的 Issue，并在评论里写明版本 tag。关闭前先 `gh auth status` 确认活动账号；**写 Issue 需要单独授权**。
9. （可选，需维护者主动要求）把该版本合并到 `main` 归档：`git checkout main && git merge --no-ff v0.x.y -m "merge: archive v0.x.y into main"`。

这样「线上是哪个版本」= `develop` 上最新的版本 tag；「某个修复上线了吗」= `git tag --contains <sha>`。每一步都需要单独授权：打 tag、推送、部署、关闭 Issue、合并 `main` 都不由一次「发版」指令一并授权。

## 7. 提交前的安全边界

- 不把真实生产域名、演示地址、私有端点、账号标识、Token、凭据写进代码、文档、测试、截图或提交信息。示例统一用占位域名。
- `git add` 只用精确路径，禁止 `git add .`；提交前检查 `git diff --cached --name-only`、`--stat`、`--check` 和完整暂存差异。
- 不提交本地验证配置、临时浏览器 profile、验证产物和本机专属的 agent 指令文件。
- 浏览器验证默认使用专用临时 profile，只创建和关闭本次测试自己的标签页；禁止按进程名批量结束浏览器进程，禁止关闭使用者自己的浏览器。
- 新增依赖优先选活跃维护的知名包；名称可疑或与常见包高度相似时先核对来源。
