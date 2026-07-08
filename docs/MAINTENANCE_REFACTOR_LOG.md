# 维护性重构记录

本文记录 2026-07 的多轮解耦调整、验证方式和后续维护建议。目标是降低大文件职责密度，让前端组件、worker 路由和纯逻辑 helper 更容易维护和扩展。

## 调整范围

### Round 1: Admin 列表面板拆分

- 将 `src/views/Admin.svelte` 中的分类列表和书签列表拆为：
  - `src/components/admin/CategoryListPanel.svelte`
  - `src/components/admin/BookmarkListPanel.svelte`
  - `src/components/admin/adminListPanels.css`
- Admin 视图保留页面布局、tab、弹窗和设置/备份编排。
- 后台列表分页、搜索、排序和表格/卡片展示逻辑从页面层下沉到面板组件。

### Round 2: worker 图标路由拆分

- 将 `worker/routes/icon.ts` 中的纯逻辑拆到：
  - `worker/lib/iconResponses.ts`
  - `worker/lib/iconifySearch.ts`
  - `worker/lib/svgColor.ts`
- 路由文件保留 Hono endpoint 和请求编排。
- 增加 `tests/unit/workerIconifySearch.test.ts` 和 `tests/unit/svgColor.test.ts`。

### Round 3: 书签卡片子组件拆分

- 从 `src/components/BookmarkCard.svelte` 拆出：
  - `src/components/BookmarkIcon.svelte`
  - `src/components/BookmarkContextMenu.svelte`
  - `src/components/BookmarkLinkModal.svelte`
- 父组件继续管理图标状态机、视口懒加载、本地图标缓存和打开方式。
- 图标展示、右键菜单、iframe 弹层变成独立 UI 组件。

### Round 4: 书签编辑弹窗图标字段拆分

- 从 `src/components/BookmarkEditModal.svelte` 拆出：
  - `src/components/BookmarkIconCandidatePicker.svelte`
  - `src/components/BookmarkCustomIconField.svelte`
- 父组件继续管理表单状态、Iconify 搜索状态和提交 payload。
- 候选图标列表、自定义图标输入和预览样式从弹窗主体中隔离。

### Round 5: 首页头部展示拆分

- 从 `src/views/Home.svelte` 拆出：
  - `src/components/HomeFloatingActions.svelte`
  - `src/components/HomeHeroSearch.svelte`
- Home 视图保留搜索过滤、滚动高亮、分类书签渲染和数据派生。
- 顶部搜索区域和右上角浮动操作按钮变成展示组件。

### Round 6: worker settings 数据解析拆分

- 从 `worker/lib/db.ts` 拆出：
  - `worker/lib/settingsData.ts`
- `db.ts` 继续作为 worker 路由的数据库入口，并 re-export `settingsFromPatchDefaults`，避免扩大路由改动面。
- 增加 `tests/unit/settingsData.test.ts` 覆盖默认值、原始 settings 行解析、背景预设与旧数据兼容归一化。

### Round 7: 书签卡片与编辑弹窗状态逻辑下沉

- 从 `src/components/BookmarkCard.svelte` 中抽出图标状态推导：
  - `src/lib/bookmarkCardIconState.ts`
  - `tests/unit/bookmarkCardIconState.test.ts`
- 从 `BookmarkCard.svelte` 中抽出交互决策和右键菜单事件常量：
  - `src/lib/bookmarkCardInteractions.ts`
  - `tests/unit/bookmarkCardInteractions.test.ts`
- 从 `src/components/BookmarkEditModal.svelte` 中抽出 Iconify 搜索、确认和候选选择 controller：
  - `src/lib/bookmarkIconifyController.ts`
  - `tests/unit/bookmarkIconifyController.test.ts`
- 从 `BookmarkEditModal.svelte` 中拆出基础表单字段展示组件：
  - `src/components/BookmarkBaseFields.svelte`
- 为 `src/lib/localBookmarkIconCache.ts` 增加单元测试：
  - `tests/unit/localBookmarkIconCache.test.ts`
- 收敛书签编辑弹窗中的图标候选按钮样式：
  - `src/components/BookmarkIconCandidateButton.svelte`
  - `BookmarkIconCandidatePicker.svelte` 与 `IconifySelector.svelte` 复用同一候选按钮展示组件
- 父组件仍保留浏览器副作用和生命周期边界：本地图标缓存异步读取、observer、窗口事件监听、右键菜单状态、当前页弹层和弹窗提交流程没有迁移到隐藏 controller。

### Round 8: App 状态编排前置 helper

- 从 `src/App.svelte` 中抽出弹窗草稿和编辑查找的纯逻辑：
  - `src/lib/appModalState.ts`
  - `tests/unit/appModalState.test.ts`
- 当前只下沉无副作用逻辑：新建分类草稿、新建书签草稿、按 id 从后台/公开书签集合中查找可编辑书签。
- 从 `src/App.svelte` 中抽出确认框状态与破坏性操作文案：
  - `src/lib/appConfirmDialog.ts`
  - `tests/unit/appConfirmDialog.test.ts`
- `tests/unit/confirmationFlow.test.ts` 继续保护删除和导入流程：不使用 `window.confirm`，导入覆盖确认必须发生在 `importing = true` 和 API 调用之前。
- 从 `src/App.svelte` 中抽出备份导出和导入成功提示的纯逻辑：
  - `src/lib/appBackup.ts`
  - `tests/unit/appBackup.test.ts`
- 当前只下沉导出 payload、备份文件名、导出成功文案和导入成功文案；Blob、临时链接点击、URL 回收、API 导入和 store 持久化仍留在 `App.svelte`。
- 从 `src/App.svelte` 中抽出排序保存队列的可测试逻辑：
  - `src/lib/appSortQueue.ts`
  - `tests/unit/appSortQueue.test.ts`
- 当前只下沉排序 id 规范化、上一轮保存失败后继续串行排队、最新请求判断；分类/书签排序 API 调用、本地乐观更新、缓存持久化和失败刷新仍留在 `App.svelte`。
- 将导入 JSON 文本解析和 source 准备入口收敛到 `src/lib/importData.ts`：
  - `parseImportJsonText`
  - `prepareImportText`
- `App.svelte` 继续动态加载 `importData` 分包，只保留文件读取、覆盖确认、API 导入、store 更新和缓存持久化。
- `App.svelte` 仍保留 API 调用、store 更新、懒加载组件、弹窗开关、确认框 resolver、错误状态和排序副作用编排。

### Round 9: dataService 本地增量更新编排收敛

- 在 `src/lib/dataService.ts` 中新增内部 `applyLocalDataMutation`，统一本地增量更新的重复步骤：
  - 更新后台 store
  - 更新公开 store
  - 公开数据缺失时按登录状态刷新
  - 按调用场景决定是否持久化后台快照
- 分类/书签 upsert、删除和排序继续暴露原有函数名，`App.svelte` 调用面不变。
- 扩展 `tests/unit/dataService.test.ts`，覆盖书签删除同步更新两个 store，以及排序队列路径下 `refreshMissing=false` 时只做乐观排序、不提前持久化。

### Round 10: App 首页访问与启动落点判定下沉

- 从 `src/App.svelte` 中抽出首页可见性与启动/退出落点的纯判定：
  - `src/lib/appNavigation.ts`
  - `tests/unit/appNavigation.test.ts`
- `canSeeHomeView` 覆盖公开模式、私有模式和已登录状态下首页是否可见。
- `getHomeGateView` 保持既有启动行为：仅在明确 `public_mode === false` 且未登录时落到 login；配置未知时仍先落到 home，再由后续 reactive gate 处理。
- `App.svelte` 仍保留 auth 初始化、数据刷新、按需加载登录弹窗和视图切换副作用。

### Round 11: Home 内容展示组件拆分

- 从 `src/views/Home.svelte` 中拆出首页内容统计条：
  - `src/components/HomeContentSummary.svelte`
- 从 `src/views/Home.svelte` 中拆出首页空状态面板：
  - `src/components/HomeEmptyPanel.svelte`
- `Home.svelte` 继续保留搜索 debounce、分类/书签派生、section observer、滚动定位、侧边栏导航和分类列表渲染编排。
- 本轮只迁移无状态展示模板及其 scoped CSS，不改变搜索、排序、滚动或生命周期逻辑。

### Round 12: Admin 页眉与认证操作拆分

- 从 `src/views/Admin.svelte` 中拆出后台页眉、返回首页、登录和退出按钮：
  - `src/components/admin/AdminPageHeader.svelte`
- `Admin.svelte` 继续保留 active tab、SettingsPanel/CategoryEditModal 懒加载、分类/书签/设置/备份内容分发和所有业务回调。
- 顺手清理 `Admin.svelte` 中不再使用的本地类型/函数，并整理 settings 分支缩进与重复 `.panel` 样式。
- 本轮只迁移无状态页眉展示和认证操作按钮，不改变后台 tab、列表面板、设置面板、备份面板或 modal 生命周期。

### Round 13: Admin tab 内容外壳拆分

- 从 `src/views/Admin.svelte` 中拆出后台 tab 内容分发和右侧内容滚动外壳：
  - `src/components/admin/AdminTabContent.svelte`
- `AdminTabContent.svelte` 负责分类、书签、设置、备份四个 tab 的展示分支，并承接 `.admin-content`、settings loading 面板和备份面板的局部样式。
- `Admin.svelte` 继续保留 active tab 切换、SettingsPanel/CategoryEditModal 懒加载、modal 渲染位置和所有业务回调编排。
- 本轮只迁移模板分发与包裹结构，不改变列表面板内部搜索/分页/排序、设置保存、备份导入导出或认证流程。

### Round 14: Admin 列表面板私有样式回迁

- 将只属于分类列表的 compact card、计数徽标和分类操作小按钮样式迁回：
  - `src/components/admin/CategoryListPanel.svelte`
- 将只属于书签列表的表格、搜索框、URL 单元格、书签描述和 compact 操作区样式迁回：
  - `src/components/admin/BookmarkListPanel.svelte`
- `src/components/admin/adminListPanels.css` 保留共享的列表外壳、状态卡片、header/toolbar/footer、分页、排序条、拖拽 handle 和通用按钮样式。
- 本轮不改动面板 DOM、搜索/分页/排序状态或 Sortable 配置，只调整 CSS 所属边界；`svelte-check` 验证 scoped selector 0 warning。

### Round 15: Admin 列表纯逻辑 helper 与测试

- 新增后台列表状态 helper：
  - `src/lib/adminListState.ts`
  - `tests/unit/adminListState.test.ts`
- 从 `CategoryListPanel.svelte` 中下沉分类分页状态、分类书签计数 fallback、排序草稿和保存 id 推导。
- 从 `BookmarkListPanel.svelte` 中下沉书签搜索过滤、分类标题 fallback、分页状态、排序草稿和保存 id 推导。
- 单元测试覆盖：按标题/URL/分类名搜索、空搜索保留原列表、分类标题与计数 fallback、页码 clamp 与显示范围、排序草稿复制、按 id 重排和保存 id 输出。
- 本轮保持 Svelte 组件继续持有 sort mode、search、page、savingSort 等 UI 状态，不抽完整 controller；测试文件数从 29 增至 30，测试数从 141 增至 146。

### Round 16: Home section 导航纯逻辑下沉

- 扩展首页数据 helper：
  - `src/lib/homeData.ts`
  - `tests/unit/homeNavigation.test.ts`
- 从 `Home.svelte` 中下沉 section key 生成、active section fallback、IntersectionObserver 最近 section 选择和 smooth scroll 目标位置计算。
- `Home.svelte` 继续保留搜索 debounce、DOM 查询、IntersectionObserver/fallback scroll 生命周期、`tick()` 后刷新 section elements 和滚动执行。
- 单元测试覆盖：section key 稳定性、active section 可见性回退、最近 intersecting section 选择、滚动目标上下边界 clamp；测试文件数从 30 增至 31，测试数从 146 增至 150。

### Round 17: App 主题状态纯逻辑下沉

- 新增应用主题状态 helper：
  - `src/lib/appThemeState.ts`
  - `tests/unit/appThemeState.test.ts`
- 从 `App.svelte` 中下沉配置主题、用户偏好、系统 dark 偏好到 active theme 的纯推导，以及主题切换按钮的下一目标值。
- `App.svelte` 继续保留 localStorage 读写、`matchMedia` 监听、DOM `data-theme` 写入和主题按钮事件编排。
- 单元测试覆盖：无用户偏好时使用站点配置、用户偏好覆盖站点配置、auto 按系统偏好解析、切换按钮写入显式相反偏好；测试文件数从 31 增至 32，测试数从 150 增至 154。

### Round 18: App 动态组件懒加载入口收敛

- 新增懒加载组件 helper：
  - `src/lib/appLazyComponent.ts`
  - `tests/unit/appLazyComponent.test.ts`
- 将 `App.svelte` 中 Admin、LoginModal、BookmarkEditModal 三个动态 import 的 pending promise 缓存逻辑收敛到同一 helper。
- `App.svelte` 继续持有实际组件引用、弹窗打开状态和视图切换编排；分包路径、加载时机和渲染条件保持不变。
- 单元测试覆盖：并发 ensure 只触发一次加载、组件已存在时不重复加载、加载失败后下一次可重试；测试文件数从 32 增至 33，测试数从 154 增至 157。

### Round 19: worker 排序 SQL 分块 helper 测试

- 从 `worker/lib/db/sort.ts` 中抽出排序 UPDATE SQL 与参数分块生成 helper：
  - `buildSortUpdateChunks`
  - `SORT_UPDATE_CHUNK_SIZE`
- 新增 `tests/unit/dbSort.test.ts`，覆盖单批 SQL/参数顺序、跨 30 条分块时全局 sort 下标延续，以及空 id 列表不生成语句。
- `sortRowsByIds` 继续负责 D1 `prepare/bind/run/batch` 执行，分类/书签路由调用面不变；测试文件数从 33 增至 34，测试数从 157 增至 160。

## 当前大文件分布

截至本轮完成后，主要业务文件行数约为：

```text
816   src/App.svelte
501   src/components/BookmarkEditModal.svelte
459   src/components/SettingsPanel.svelte
444   src/views/Home.svelte
416   src/components/Sidebar.svelte
396   src/app.css
389   src/components/CategorySection.svelte
389   src/lib/dataService.ts
388   src/lib/api.ts
387   src/components/settings/CardSettingsSection.svelte
387   src/components/admin/BookmarkListPanel.svelte
322   src/views/Admin.svelte
310   src/components/admin/adminListPanels.css
302   src/components/admin/CategoryListPanel.svelte
171   src/lib/homeData.ts
148   src/components/admin/AdminTabContent.svelte
93    src/lib/adminListState.ts
36    src/lib/appThemeState.ts
33    src/lib/appLazyComponent.ts
```

`App.svelte` 仍是最大文件，但导入/导出 controller 和乐观排序编排已经下沉到 `appImportExport` 与 `appSortQueue`，当前主要承担登录、缓存、CRUD 后本地增量更新、弹窗协调和视图切换。后续如果继续拆分，应按 auth flow、CRUD/local mutation 或 modal controller 边界单独规划，不建议零散移动函数；当前主题状态推导已有 `appThemeState` 单元测试覆盖，动态组件懒加载缓存已有 `appLazyComponent` 单元测试覆盖。`Home.svelte` 已降到约 444 行，section key、active fallback、intersection 最近项和滚动目标计算已有 `homeData` 单元测试覆盖；继续拆分应避免在缺少浏览器验证时大改 observer 生命周期。`Admin.svelte` 已降到约 322 行，页眉和 tab 内容外壳已拆出；`adminListPanels.css` 已从约 538 行降到约 310 行，剩余内容以共享列表壳、分页、状态卡片和排序样式为主；后台列表搜索、分页、排序 id 推导已有 `adminListState` 单元测试覆盖。`BookmarkCard.svelte` 已降到约 333 行，`BookmarkEditModal.svelte` 已降到约 501 行；二者后续更适合做运行时验证驱动的小步清理，而不是继续无边界拆分。

## 最近部署与生产验证

2026-07-09 已执行 `npm run deploy`，部署到 Cloudflare Worker：

```text
Version ID: 816a7053-f3b1-405a-b928-32e0c995468d
Production domain: https://navs.bjlius.com
```

生产 Chrome/CDP 严格回归验证结果：

- 使用独立 headless Chrome 临时 profile，验证后已清理。
- 首页加载正常，标题为 `CF-Navs`。
- 首页渲染 11 个分类、345 个书签卡片，破损图片数为 0。
- 搜索过滤与清空恢复正常，主题切换正常。
- 登录成功后，管理入口、退出按钮和主题按钮可见。
- 后台分类/书签列表、搜索、设置面板和备份面板均加载正常。
- 书签卡片右键菜单可打开，编辑弹窗可打开并可取消关闭。
- `/api/health`、`/api/config`、`/api/admin/data`、`/api/data/version`、Iconify 搜索均返回 200 且结构完整。
- Chrome console error、page exception、unexpected failed request 均为 0。
- 安全回归中预期的 4 个 401 已归入 `network.expectedFailed`，不再误报为失败网络请求。

近期追加维护轮次：

- `src/lib/appImportExport.ts`：导出下载、导入确认、API 导入和状态反馈从 `App.svelte` 下沉。
- `src/lib/appSortQueue.ts`：新增 `runOptimisticSort`，统一本地乐观排序、远端保存队列、最新请求判定和失败回滚。
- `src/lib/errorMonitor.ts` + `/api/error-report`：前端运行时错误批量上报到 Worker。
- `scripts/chrome-regression.mjs`：区分真正失败请求与安全回归中预期的 401，当前严格回归 25 项 checks 全部通过。

## 每轮验证标准

每轮代码调整后执行：

```powershell
npm run type-check
npm test
npm run build
git diff --check
```

部署到 Cloudflare：

```powershell
npm run deploy
```

线上验证目标域名：

```text
https://navs.bjlius.com
```

线上 Chrome 验证覆盖：

- 首页加载、搜索框筛选、书签卡片图标无损坏。
- 登录后右上角管理入口、退出按钮和主题按钮可见。
- 后台分类/书签列表可加载。
- 书签右键菜单可打开，编辑弹窗可打开和取消。
- Iconify 搜索和 `/api/iconify/*` 代理返回正常。
- `/api/config`、`/api/settings`、`/api/admin/data`、`/api/data/version` 返回结构完整。
- Chrome console error、page error、failed request、非预期 HTTP 4xx/5xx 均为 0。

## 已遇到的问题与处理

- Chrome 插件技能要求的 Node REPL 工具在当前会话没有暴露。处理方式：使用本机 Chrome DevTools Protocol 端口做等价验证。
- Chrome 新版本对 `/json/new` 要求使用 `PUT`，用 `GET` 会返回 unsafe HTTP verb 错误。
- Node 内置 WebSocket 对 CDP 连接不稳定。处理方式：使用项目依赖树中的 `ws` 包连接 `webSocketDebuggerUrl`。
- PowerShell/curl 直接拼 JSON 登录体容易引号转义失败，导致 `invalid request body`。处理方式：在 Node 页面上下文或 Node `fetch` 中发送登录请求。
- 使用 `element.dispatchEvent(new MouseEvent('contextmenu'))` 不能完全代表真实右键。处理方式：用 CDP `Input.dispatchMouseEvent` 发送 `mousePressed/mouseReleased` 的 right button 事件。
- 拆出 Svelte 子组件后，父组件中迁出的 CSS 选择器可能变成 unused warning。处理方式：移动对应 media query 和局部样式到子组件，保证 `svelte-check` 0 warning。
- Svelte reactive 依赖顺序很敏感。抽出 Iconify controller 时如果把 preview URL、selected 状态和确认重置塞进同一个 reactive 对象，可能触发循环依赖；处理方式是把输入 URL 推导和 selected 判断分成独立 helper。
- 拆基础字段组件时，字段相关 scoped CSS 必须随组件一起迁移，否则父组件里的 `input/select/textarea` 选择器不会作用到子组件内部，也可能产生视觉回归。
- 将分页状态组合成一个 reactive 对象后，如果该对象依赖 `page` 又反过来给 `page` 赋值，Svelte 会报告 cyclical dependency。处理方式：先用独立 helper 计算 `totalPages` 和 clamp 后的 `page`，再生成页面视图对象。
- `AGENTS.md` 是本地-only 指令文件，不应加入 Git 提交。公开维护记录写入 `docs/`，本地 agent 操作经验写入 `AGENTS.md`。

## 后续拆分建议

1. `src/views/Admin.svelte` / `src/components/admin/adminListPanels.css`
   - 已拆出后台页眉与认证操作按钮，以及 tab 内容外壳。
   - 已将分类/书签列表的私有样式迁回对应组件，公共 CSS 保留共享外壳、分页、状态卡片和排序样式。
   - 已补后台列表纯逻辑 helper 测试，覆盖搜索过滤、分页 clamp、排序草稿和保存 id 推导。
   - 下一步如继续 Admin，优先做浏览器验证或很小的视觉修正，不建议继续拆列表 controller。

2. `src/views/Home.svelte`
   - 已拆出顶部搜索、浮动操作、内容统计条和空状态面板。
   - 已补 section key、active fallback、intersection 最近项和 smooth scroll 目标计算 helper 测试。
   - 后续如果继续 Home，应优先做浏览器验证；缺少验证时不建议继续大改滚动 observer 行为。

3. `src/App.svelte`
   - 建议按 use-case 拆分：bootstrap/refresh、auth flow、CRUD/local mutations、modal handlers。
   - 已抽出弹窗草稿/查找 helper、确认框状态/文案 helper、备份导出 payload/文件名/成功文案 helper、导入/导出 controller、排序保存队列与乐观排序编排、首页访问判定、主题状态 helper 和动态组件懒加载 helper；dataService 本地增量更新编排也已收敛。
   - 继续拆 App 前应单独规划 modal handler/controller 边界，不建议零散移动事件处理函数；短期更适合继续收敛 auth flow 或 CRUD/local mutation controller。

4. `worker/lib/db.ts`
   - `db.ts` 已是重导出入口，category/bookmark/settings/import 等数据域已拆到 `worker/lib/db/*`。
   - 已补排序 SQL 分块纯 helper 测试；后续如果继续 worker，建议优先补 import/settings 的纯逻辑测试，而不是改路由导入路径。

5. `BookmarkEditModal.svelte` / `BookmarkCard.svelte`
   - 已完成展示子组件、图标状态、交互决策、Iconify 搜索 controller、基础字段组件、本地图标缓存测试和图标候选按钮样式收敛。
   - 后续如果继续清理 CSS，应只做有明确重复或死样式证据的小步调整，并配合浏览器验证；暂不建议把整个组件改成 controller/store 模式。

6. 图标缓存消费者
   - `BookmarkCard.svelte` 与 `CachedBookmarkIcon.svelte` 目前仍是两个场景不同的消费者。
   - 已补 `localBookmarkIconCache` 纯 helper 测试；是否抽 cache reader 应在确认两个消费者实际重复逻辑和运行时行为后再定。
