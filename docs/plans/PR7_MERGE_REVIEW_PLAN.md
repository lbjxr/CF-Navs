# PR #7 合并检查与修改计划（私密书签 / 跨分类排序 / 浏览器书签同步）

> **状态：实现与审计已完成。** 本文件记录实施决策、审计证据、残余风险和验证结果。
>
> - 来源：GitHub PR #7「新增私密书签与跨分类拖拽排序功能」，作者 @Helenvin
> - 合并基线：`d16cc0c`（`origin/develop`）
> - 落地方式：PR7 功能与初次审计文档先以 squash 方式落到 `develop`，之后的同步图标、Issue #8 和文档修订作为后续提交；原始 47 个提交仅保留在本地备份引用
> - 审计时基于合并后工作树逐条核对源码，非仅读 diff
>
> 本文档的 P0 项已全部处理；公开图标代理的兼容性残余风险单独记录在 P2-10。

## 1. 范围与结论

PR #7 引入四组功能：书签级私密标记、分类级私密标记（含祖先链继承）、首页跨分类拖拽排序、Chrome/Edge 单向书签同步扩展。合计 52 个文件、+1142 / -58 行。

合并前在工作树上的历史实测结果（保留作审计证据，不代表当前状态）：

- `npm run type-check`：通过，`tsc --noEmit` 与 `svelte-check` 均 0 error 0 warning。
- `npm test`：**1 failed / 619 passed（90 个文件中 1 个失败）**；失败是随后已同步的旧 markup 断言。
- 当时 PR 新增功能代码 1142 行，新增测试 1 行；本轮后续修复和测试见当前提交记录。

历史结论是：功能设计方向正确，但当时存在 2 个阻断缺陷、4 个正确性/可用性缺陷和若干清理项；这些问题已在后续提交中处理，图标代理兼容性残余风险除外。

## 2. 历史污染与落地方式

PR 的 base 与 head 都是作者 fork 的 `main`，因此 `git fetch` 得到的 47 个提交里混入了本仓库自己的 8 个 `merge: promote ... to main` 提交（`019700b`、`35a2582`、`c6b9c03`、`1f863c2`、`bce3632`、`673d9ce`、`a292b3e`、`0fe8ace`）。这些提交本身是历史上 develop→main 的推进记录，不带新内容，但会让 `develop` 的历史出现无意义的回环。

已核对的事实：

- `git merge-base develop pr-7` = `d16cc0c`，等于 `origin/develop` 的位置。
- `git diff d16cc0c...cbb1762` 恰好是 52 个功能文件，没有夹带其它内容，说明那 8 个 merge 提交没有引入 `d16cc0c` 之外的树差异。

因此采用 squash 落地：以 `d16cc0c` 为父提交，一次性提交 52 个文件的最终内容。选择单个提交而不是按功能拆三个提交，原因是 `shared/types.ts`、`src/App.svelte`、`worker/lib/db/bookmarks.ts`、`worker/routes/bookmarks.ts` 同时被三组功能修改，按文件无法切分，按 hunk 切分会产生中间不可构建的提交。作者署名通过 `Co-authored-by` 保留。

原始历史不销毁：本地 `pr-7` 分支与 `pr7-original-history` 标签仍指向 `cbb1762`，仅作本地回溯，不推送这些备份引用。此前记录中的 `refs/pull/7/head` 并不存在，已更正。

`develop` 后续已完成 squash、浏览器同步图标修复和 Issue #8 侧边栏滚动条修复；当前分支状态以 Git 实际引用为准，不在此处重复硬编码远端 SHA。

## 3. 阻断与正确性缺陷

本节保留 PR7 初次合并审计时发现的问题与当时源码证据，均属于历史记录；当前修复状态和验证结果以第 6、7 节及当前 Git 提交为准。

### P0-1 浏览器同步接口的 CORS 中间件未覆盖真实端点

`worker/index.ts:46` 使用 `app.use('/api/browser-sync', corsHeaders)`。Hono 的 `use(path)` 是精确路径匹配，不是前缀匹配。用仓库依赖的 hono 4.13.0 实测：

```
POST /api/browser-sync/bookmarks  -> 响应头无 Access-Control-Allow-Origin
POST /api/browser-sync            -> 有该头，但此路径没有 handler
```

`app.options('/api/browser-sync/bookmarks', ...)` 能正确返回 204 预检响应，所以预检通过；但真实 POST 的响应缺少 `Access-Control-Allow-Origin`，浏览器会丢弃它。扩展带 `Authorization` 头必然触发预检流程，因此同步在登录成功后仍会静默失败——`browser-extension/background.js:72` 只做 `console.warn`，用户看不到任何提示。

同一处 `app.use('/api/browser-sync', authRequired)`（第 47 行）也是精确匹配，属于死代码；鉴权之所以正常，靠的是第 48 行的 `/api/browser-sync/*`。

修复：`corsHeaders` 注册到 `/api/browser-sync/*`，删除精确路径的 `authRequired` 注册。

### P0-2 覆盖式导入丢失分类私密标记

`worker/lib/db/importHelpers.ts:7-16` 的 `normalizeImportCategory` 返回对象没有 `is_private` 字段（同文件 `normalizeImportBookmark` 第 33 行有）。而 `worker/lib/db/import.ts:24-25` 的 INSERT 语句读取 `category.is_private`。

链路：`remapImportRecords` → `normalizeImportCategory` 抹掉字段 → INSERT 绑定 `undefined` → 落库为 0。

后果是隐私功能的静默数据降级：备份恢复后所有私密分类变为公开，访客立即能看到原本隐藏的分类及其中全部书签。比抛错更危险，因为没有任何信号。`worker/lib/importValidation.ts:28` 已经为该字段写了校验，说明这是漏改而非设计取舍。

修复：`normalizeImportCategory` 补 `is_private` 归一化，与书签侧保持同一写法。

### P1-3 跨分类排序的入口按钮在部分分类不可达

`src/views/Home.svelte:528` 传 `showSortActions={false}`，因此 `CategorySection.svelte:135` 的取消/保存按钮不渲染——这是正确的，全局操作由底部 `home-sort-bar` 承担。

问题在进入排序的按钮：它位于 `{:else if !activeSortMode}` 分支，条件是 `canSort && bookmarks.length > 1`（`CategorySection.svelte:171`）。同时 `showActions = activeSortMode || canAddBookmark || (canSort && bookmarks.length > 1)`（第 54 行），登录态下 `canAddBookmark` 为真，header 会出现，但「排序」按钮不渲染。

结果：书签数为 0 或 1 的分类没有排序入口。PR 描述和 README 写的操作路径「点击分类的『排序』」并不总成立，管理员必须先找到一个书签数 ≥2 的分类才能进入排序会话。而跨分类场景下，把唯一的书签拖到别的分类正是需要的操作。

修复：`canSort` 为真时不再要求 `bookmarks.length > 1`。

### P1-4 reorganize 保存失败没有任何用户可见反馈

`worker/lib/db/bookmarks.ts:163-165` 要求请求覆盖数据库中每一个 bookmark id，否则抛 `bookmark order must include every bookmark`；`category_id` 指向不存在分类时抛 `category not found`。`worker/routes/bookmarks.ts:126-127` 把这些统一转成 `SERVER_ERROR`。

前端 `src/views/Home.svelte` 的 `saveHomeSort` 由 `groupBookmarksByCategory(homeSortDraft)` 构造请求，`homeSortDraft` 来自 `publicData.bookmarks`。两个断裂点：

- 存在 `category_id` 指向已删除分类的孤儿书签时，请求会带上不存在的 `category_id`，服务端报错。
- 排序会话期间有并发写入（例如另一标签页新增书签），全量校验必然失败。

失败后 `saveHomeSort` 的 `finally` 只复位 `homeSortSaving`，异常继续上抛给 `src/App.svelte:881` 的 `handleReorganizeBookmarks`，而该函数没有 try/catch。对比同文件 `handleSortBookmarks`（第 866-879 行）有完整的 `onError` + `restoreOnError`。结果是未捕获的 rejection，`bookmarkError` 永不赋值。

即使赋值也看不到：`bookmarkError` 只渲染在 `BookmarkEditModal` 的 `error` prop 上（`src/App.svelte:1128`），首页排序失败没有显示位置。

修复：`handleReorganizeBookmarks` 对齐 `handleSortBookmarks` 的失败恢复模式，并为首页排序失败提供可见的错误出口。

### P1-5 reorganize 的批量写入违反仓库既有的 D1 约束模式

`worker/lib/db/bookmarks.ts:166-171` 为每个书签生成一条 `UPDATE bookmarks SET category_id = ? WHERE id = ?`，按 50 条一批提交；随后第 172-174 行再对每个分类串行 `await sortRowsByIds`。

同项目 `worker/lib/db/sort.ts:3-5` 已经明确记录了约束：D1 单条预处理语句最多绑定 100 个参数，因此用 `CASE WHEN` 把每 30 个 id 压成一条语句。原 PR 实现是 N 条语句加 N/50 次串行 batch，再叠加分类数次串行往返，与 `docs/reference/PERFORMANCE_CONTRACT.md` 关于避免额外串行往返的约定冲突，也重复造了 `buildSortUpdateChunks` 已有的轮子。

本轮已改为复用白名单列更新分块，并将 `category_id` 与全局 `sort` 的全部语句提交到同一次 D1 batch，避免部分提交。

### P1-7 分类导入分块在新增私密字段后超过 D1 参数上限（已修复）

独立 Reviewer 发现：分类 INSERT 每行绑定 7 个参数，但原实现仍按 16 行分块，单条语句最多绑定 112 个参数，15 个分类时也会超过 D1 的 100 参数上限。已在 `worker/lib/db/import.ts` 定义 `CATEGORY_IMPORT_CHUNK_SIZE = 14`，每条分类 INSERT 最多 98 个参数，并新增边界测试覆盖 15 个分类拆为 `[14, 1]`。

独立 Reviewer 初次结论为 `CHANGES_REQUIRED`（发现分类导入 D1 参数超限）；修复为 14 行分块后重新验证通过，最终 Reviewer 结论为 `PASS`。

### P1-6 功能改动打破既有测试断言，且新功能零测试

`tests/unit/categoryCollapseMarkup.test.ts:20` 断言 `CategorySection.svelte` 包含 `{#if bookmarks.length > 0}`，实际已改为 `{#if bookmarks.length > 0 || activeSortMode}`。该改动本身合理（为空分类提供拖放落点），断言已同步。

PR 原先只在 `tests/unit/settings.test.ts` 补了一行 `browser_sync_enabled`。本轮新增/更新测试覆盖私密书签 most-visited 过滤、私密分类祖先链与环检测、分类私密导入、跨分类 reorganize 的 CASE 批量更新、点击权限、CORS wiring 和排序 markup；当前全套测试通过。

## 4. 清理与文档项

### P2-7 首页「经常访问」需排除私密书签（已决策：排除）

`PUBLIC_BOOKMARK_LIST_SQL` 已加 `WHERE is_private = 0`，服务端对访客的过滤正确。但 `src/views/Home.svelte:98-100` 的 `getMostVisitedBookmarks(sortedBookmarks, ...)` 在管理员登录时会把私密书签混入「经常访问」区块。

这不是访客侧的数据泄露（访客根本收不到这些行），而是三个问题：

- 「经常访问」使用合成的 `MOST_VISITED_CATEGORY`（`Home.svelte:37`），不属于任何真实分类，`canSort={false}`，其中的卡片不参与 `homeSortDraft` 分组，视图与排序模型不一致。
- 私密书签的定位是「不出现在公共视图」。首页顶部的高曝光区块违背该语义，管理员在他人旁边打开首页即暴露。
- 管理员与访客看到的「经常访问」构成不同，站点设置里的实时预览也无法反映真实效果。

**决策：排除。** 私密书签不进入「经常访问」，无论是否登录。

实现落点选择 `getMostVisitedBookmarks`（`src/lib/homeData.ts:88-100`）内部过滤，而不是在 `Home.svelte` 的调用点过滤：

- 该 helper 有两个调用者，另一个是 `src/components/settings/SettingsHomePreview.svelte:74`。放在 helper 内可让后台预览与首页行为一致，避免第二处漏改。
- 已有的 `.filter((bookmark) => (bookmark.click_count ?? 0) > 0)` 就在同一条链上，增加条件不引入额外遍历。
- `shared/types.ts:29` 的 `is_private?: boolean | number` 是可选且双型的，判定必须写成 `bookmark.is_private === true || bookmark.is_private === 1`，与 `worker/lib/db/aggregates.ts` 和 `src/lib/adminFormAdapters.ts` 的既有写法保持一致；不能用真值判断，否则 `0` 与 `undefined` 的语义会和字符串等其它历史值混淆。
- `SettingsHomePreview.svelte:17` 的 `previewBookmarks` 夹具不含 `is_private` 字段（可选字段，`undefined`），过滤后行为不变，无需改夹具。

回归护栏：`tests/unit/homeNavigation.test.ts:120-135` 已覆盖该 helper 的数量与不可变性契约，需在其中补一条私密书签被排除的断言。

### P2-8 分类内排序链路已成死代码

跨分类排序取代了原有的分类内排序，但旧链路仍在：

- `src/App.svelte:891` 的 `handleSortBookmarksInCategory` 与第 1005 行的 prop 传递。
- `src/views/Home.svelte:422,443` 把 `onSortBookmarksInCategory` 挂到 `onSortBookmarks`，但这两处都在搜索结果分支内且 `canSort={false}`，永不触发。
- `CategorySection.svelte` 中整套 `localSortMode` / `localBookmarks` / `onSortBookmarks` 分支在首页已无调用者（该组件仅被 `Home.svelte` 使用）。

按 clean cutover 要求应移除。注意 `tests/unit/appLocalData.test.ts:128` 和 `tests/unit/refactorHelpers.test.ts:113` 仍在测试 `buildOrderedBookmarkIdsForCategory`，需同步处理。

### P2-9 截图与资产问题（已决策：删除 4 张新增截图）

发现的问题：

- 初次审计发现其中一张截图含真实站点名称、分类/书签数量和编辑器内容；用户特定信息不应进入 tracked 文件。
- 另一张扩展截图的地址输入框有测试残留输入。
- 4 张新增截图没有任何 Markdown 引用（README 与 docs 全文检索无命中）。`docs/plans/PLATFORM_OPTIMIZATION_PLAN.md:809` 记录的不变量是「`docs/screenshots/` 下 6 张图片全部被引用，无孤儿文件」，当时变成 10 张 4 个孤儿。
- `browser-extension/icon.png` 与 `public/icon.png` 的 md5 完全相同（`b426fde9951d61d38beee5789f2300e2`），75KB 重复资产。

README 的功能表与既有各行使用一致的 emoji 图标，不存在此前判断的风格不一致；不做无意义改动。扩展图标虽然与 `public/icon.png` 同源，但扩展目录必须自包含，不能删除副本；只补充说明。

**决策：删除这 4 张截图**，不重新脱敏截图、不补文档引用。README 与 `API_CONTRACT.md` 的文字说明已足够描述四项功能，图片没有承载额外信息。删除后 `docs/screenshots/` 仅保留被公开文档引用的现有图片，`PLATFORM_OPTIMIZATION_PLAN.md` 的“无孤儿文件”不变量重新成立，无需写死图片数量。

这些截图已在首次推送前从 `develop` 最终树移除；以下文件名仅保留为历史审计记录，不表示当前仍被跟踪：

- `docs/screenshots/` 下 4 张 PR7 新增 PNG（具体文件名不再重复记录，避免历史审计文档携带截图中的站点信息）。

关于 Git 历史：4 张 PNG 原先存在于本地 squash 提交 `5cb560e`，随后通过重写未推送的 squash 移除，未进入远端 `develop` 历史。原始 PR 备份引用仍仅保留在本地，不应推送。

`browser-extension/icon.png` 的重复资产不与截图一并处理：扩展目录需要自包含（加载已解压扩展时不会带上 `public/`），删除会破坏 `manifest.json` 声明的 16/32/48/128 图标。保留副本，并在 `browser-extension/README.md` 说明它与项目图标同源。

### P2-10 安全审计：匿名点击已收紧，图标代理保留兼容性残余风险

安全审计确认：`POST /api/public/bookmarks/:id/click` 原先只按 ID 更新，攻击者可枚举私密书签 ID 并污染访问统计。实现将 `incrementBookmarkClick` 限制为 `WHERE id = ? AND is_private = 0`，私密书签与不存在书签均不会产生更新；现有公开点击接口和 IP 限流保持不变。

`GET /api/icon/:id` 与 `GET /api/category-icon/:id` 仍是匿名接口，按可猜测 ID 读取图标，并按 URL 写入公共缓存。不能直接加 `authRequired`：后台使用 `<img>` 加载图标，不发送 Bearer Token，简单认证会破坏私密分类/书签的后台预览。彻底收紧需要短期签名 URL、同源 HttpOnly 会话 Cookie 或内联图标数据的独立设计。

本轮明确保留该兼容性例外，不声称图标代理已完成对象级隐私隔离；后续若将图标纳入私密对象硬契约，必须先设计凭证传递和缓存隔离方案，再同时收紧书签与分类图标端点。

## 5. 已核对无问题的部分

以下内容经源码逐条核对确认正确，后续修改不应破坏：

- **私密分类的祖先链过滤**：`worker/lib/db/aggregates.ts:54-77` 的 `getPublicCategoryIds` 自底向上遍历 `parent_id`，任一祖先私密则整支隐藏，并用 `visited` 集合防御数据成环导致的死循环。
- **公开数据接口的 token 分支**：`worker/routes/public.ts:154-160` 对无效 token 返回 401 而不是降级为访客，避免旧会话或伪造请求混淆权限；`canUsePublicCache = publicSettings.public_mode && !token` 保证任何带 token 的响应都是 `no-store`，私密数据不会进入边缘缓存。
- **运行时缓存**：`worker/lib/runtimeCache.ts` 只缓存 `AdminData`，不参与公开数据路径，不存在跨身份污染。
- **设置项可见性**：`browser_sync_enabled` 不在 `shared/settings.ts:35-63` 的 `PUBLIC_SETTINGS_KEYS` 中，不会下发给访客。
- **schema 升级**：`worker/lib/db/schema.ts` 的两条 `ALTER TABLE ... ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0` 有列存在性检查，幂等，旧库升级安全。
- **扩展的跨域前提与凭据处理**：`manifest.json` 的 `host_permissions: ["http://*/*", "https://*/*"]` 满足 MV3 service worker 跨域抓取要求；扩展只持久化会话令牌，不保存密码。

## 6. 任务清单

| # | 阶段 | 任务 | 主要文件 |
| --- | --- | --- | --- |
| 1 | 阻断缺陷 | `corsHeaders` 同时注册到精确路径和 `/api/browser-sync/*`，保留双路径 `authRequired` 防止新增子路由公开 | `worker/index.ts:45-52` |
| 2 | 阻断缺陷 | `normalizeImportCategory` 补 `is_private` 归一化 | `worker/lib/db/importHelpers.ts:7-16` |
| 3 | 阻断缺陷 | 补测试：导入往返保留分类私密标记；CORS 头覆盖真实端点 | `tests/unit/` |
| 4 | 正确性 | `handleReorganizeBookmarks` 补失败恢复，对齐 `handleSortBookmarks`；首页排序失败提供可见错误出口 | `src/App.svelte`、`src/views/Home.svelte` |
| 5 | 正确性 | `reorganizeBookmarks` 改用 `CASE WHEN` 批量写 `category_id`；孤儿书签返回明确错误码 | `worker/lib/db/bookmarks.ts:138-175` |
| 6 | 可用性 | 修排序入口可达性：`canSort` 时不再要求 `bookmarks.length > 1` | `src/components/CategorySection.svelte:54,171` |
| 7 | 测试 | 修 `categoryCollapseMarkup.test.ts:20` 断言；补私密书签过滤、私密分类祖先链、跨分类 reorganize 的单测 | `tests/unit/` |
| 8 | 清理 | 移除已死的分类内排序链路，同步相关测试 | `src/App.svelte`、`src/views/Home.svelte`、`src/components/CategorySection.svelte` |
| 9 | 行为修正 | `getMostVisitedBookmarks` 内部排除私密书签（P2-7），并在 `homeNavigation.test.ts` 补断言 | `src/lib/homeData.ts:88-100`、`tests/unit/homeNavigation.test.ts` |
| 10 | 文档资产 | 删除 4 张新增截图（P2-9），以修补 `5cb560e` 的方式落地；`browser-extension/README.md` 说明图标同源且扩展目录自包含；README 功能表不改动 | `docs/screenshots/`、`browser-extension/README.md` |
| 11 | 安全审计 | 匿名点击只允许更新公开书签；图标代理保留匿名兼容行为并记录需后续设计签名 URL / 会话 Cookie 的残余风险 | `worker/lib/db/bookmarks.ts:203-210`、`worker/routes/icon.ts`、`worker/routes/public.ts:219-262` |
| 12 | 验证 | `npm run type-check`、`npm test`、`npm run build`、`git diff --check` | — |

## 7. 决策记录

- **P2-9 截图处置：删除。** 4 张新增截图含真实站点数据且未被任何文档引用，直接删除，不重新截图脱敏、不补引用。删除通过修补未推送的 `5cb560e` 完成，未进入远端历史。
- **P2-7 「经常访问」私密书签：排除。** 私密书签不进入「经常访问」，登录与未登录一致。过滤放在 `getMostVisitedBookmarks` 内部，使首页与后台设置预览行为一致。
- **落地方式：squash。** 已完成，见第 2 节。原始 47 个提交保留在本地 `pr-7` 分支与 `pr7-original-history` 标签（均指向 `cbb1762`）。

## 8. 当前状态与后续范围

- PR7 的 P0/P1 修复、私密数据过滤、跨分类排序、浏览器同步、默认 favicon.im 图标和 Issue #8 的 Chromium 侧边栏滚动条修复均已落地并通过测试。
- 原始 Issue #8 正文中的“部分导出备份”和“顶部导航分行显示”仍是未实现的独立功能建议，不能因滚动条子问题已修复而宣称完成。
- `/api/icon/:id` 与 `/api/category-icon/:id` 仍保留匿名兼容行为，按可枚举 ID 读取图标的风险见 P2-10；后续需签名 URL、会话 Cookie 或内联数据方案。
- 是否将后续变更推送、合并或部署，按当前用户指令执行；本计划不替代现场 Git 状态。

## 9. 贡献与发布记录

- PR #7 的核心功能由 @Helenvin 提交：私密书签、私密分类、首页跨分类排序和浏览器书签单向同步。
- 这些功能经过安全审计、缺陷修复和回归验证后进入 `develop` 与 `main`；贡献者署名保留在集成提交和 PR 记录中。
- 公开发布/变更说明见根目录 [`CHANGELOG.md`](../../CHANGELOG.md)。
- Issue #8 的 Chrome 侧边栏白色滚动条问题已在后续修复中处理；Issue 正文中的部分导出和顶部导航分行建议仍未实现。
