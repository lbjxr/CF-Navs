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

## 当前大文件分布

截至本轮完成后，主要业务文件行数约为：

```text
1116  src/App.svelte
575   src/components/BookmarkEditModal.svelte
521   src/components/BookmarkCard.svelte
506   worker/lib/db.ts
480   src/views/Home.svelte
476   src/views/Admin.svelte
459   src/components/admin/adminListPanels.css
```

`App.svelte` 仍是最大文件。它承担全局状态编排，包括登录、缓存、导入导出、CRUD 后本地增量更新、弹窗协调和排序回写。后续如果继续拆分，应按应用 use-case 或 controller 边界单独规划，不建议零散移动函数。

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
- `AGENTS.md` 是本地-only 指令文件，不应加入 Git 提交。公开维护记录写入 `docs/`，本地 agent 操作经验写入 `AGENTS.md`。

## 后续拆分建议

1. `src/App.svelte`
   - 建议按 use-case 拆分：bootstrap/refresh、local mutations、modal handlers、import/export、sort handlers。
   - 拆分前应补更多针对 `src/lib/appData.ts` 和本地增量更新的单元测试。

2. `worker/lib/db.ts`
   - 可以继续按数据域拆：category repository、bookmark repository、settings repository、import repository。
   - 需要保持现有 `db.ts` re-export 入口，减少 worker route import churn。

3. `BookmarkEditModal.svelte` / `BookmarkCard.svelte`
   - 目前已拆出展示子组件，剩余主要是状态机。
   - 后续可把 Iconify 搜索状态或图标 URL 决策提到单独 hook/helper，并用单元测试覆盖。
