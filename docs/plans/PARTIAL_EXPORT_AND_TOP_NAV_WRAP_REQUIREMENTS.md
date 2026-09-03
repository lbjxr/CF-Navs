# 部分导出备份 / 顶部导航分行显示 / 顶部导航右上角按钮对齐 需求文档

> **状态：已完成，集成验收通过。**
>
> - 来源：GitHub Issue [#8](https://github.com/lbjxr/CF-Navs/issues/8)（@pycc169）中的两条独立功能建议，已在
>   [评论](https://github.com/lbjxr/CF-Navs/issues/8#issuecomment-5461173702) 中确认「等后续评估处理」。
> - 本文定义需求、范围、验收标准与约束；主体实现已完成，实际改动与验证记录见 `docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §12。
> - 现状勘察与实现后的源码路径均已核对。
> - **已定决策（2026-08-29）**：`settings` 导出开关默认**勾选**（OQ-A1）；顶部导航分行采用**方案①**——新增设置开关，保留现有横向滚动模式（OQ-B1）；分行仅桌面生效、移动端强制横向滚动（FR-B7）；顶部模式下右上角浮动按钮与导航栏同高对齐（需求 C）。

---

## 1. 背景与现状

### 1.1 需求来源

Issue #8 正文提出两条建议：

1. **部分导出备份**：现在只能「一键导出所有」，希望能只导出选中的部分数据。
2. **顶部导航分行显示**：导航栏设为「顶部固定」时，分类较多只能横向滚动，希望能分行（换行）显示，便于按分类查找。
3. **顶部导航右上角按钮对齐**（本轮追加）：导航栏为顶部固定时，右上角主题切换 / 设置 / 退出按钮当前被挤到导航栏下一行，需调整为与导航栏同一高度对齐。

（同一 Issue 中的「Chrome 展开子分类出现白色滚动条」已单独修复，不在本文范围。）

### 1.2 部分导出：现状

导出流程完全在浏览器端完成，**没有后端导出端点**：

| 环节 | 位置 | 现状 |
| --- | --- | --- |
| 触发按钮 | `src/components/BackupPanel.svelte:59-68` | 仅一个「导出备份」按钮，无任何选择控件 |
| 回调 | `src/App.svelte:894-897`（`handleExportData`） | 把完整 `adminData` 交给导出函数 |
| 导出实现 | `src/lib/appImportExport.ts:33-71`（`exportDataToFile`） | 参数是完整 `AdminData`，无范围 / ID / 过滤参数；不请求 API |
| 组装 payload | `src/lib/appBackup.ts:12-24`（`createBackupPayload`） | 直接复制 `data.categories`、`data.bookmarks`、`data.settings` |
| 下载 artifact | `src/lib/appBackup.ts:34-45`（`createBackupExportArtifact`） | `JSON.stringify` 完整 payload，文件名 `cf-navs-backup-YYYY-MM-DD.json` |
| 数据来源 | `worker/routes/admin.ts` `GET /api/admin/data` | 全量聚合 `AdminData`，无筛选参数 |

导出文件契约 `BackupData`（`shared/types.ts:375-381`）：

```ts
interface BackupData {
  version: number          // 当前 BACKUP_VERSION = 2
  exported_at: number
  categories: Category[]
  bookmarks: Bookmark[]
  settings: Settings | null
}
```

数据模型约束：

- 分类最多两级——一级 `parent_id = null`，二级 `parent_id` 指向一级；`shared/categoryHierarchy.ts` 的 `validateCategoryHierarchy` 拒绝三级（`worker/lib/importValidation.ts` 复用同一校验）。
- 书签通过 `category_id` 归属某个分类（`shared/types.ts` `Bookmark`）。
- 后台聚合导出的 `Bookmark.icon_blob` 恒为 `null`，另带 `icon_cached` 标志（`worker/lib/db/sql.ts` `BOOKMARK_AGGREGATE_LIST_SQL`）——导出只含图标引用，不含二进制图标。
- 导入侧 `POST /api/import`（`worker/routes/data.ts:14-56`）已支持 `mode: 'replace' | 'merge'`，校验上限 `MAX_IMPORT_CATEGORIES = 2000`、`MAX_IMPORT_BOOKMARKS = 20000`（`worker/lib/importValidation.ts:16-17`），并做 ID / 引用 / 层级 / URL / settings 校验。

### 1.3 顶部导航：现状

导航位置由 `Settings.navigation`（`shared/types.ts:116-119,151`）控制：

```ts
interface NavigationSetting {
  position: 'left' | 'top'
  always_expanded: boolean   // 目前仅 left 模式生效
}
```

默认值 `{ position: 'left', always_expanded: false }`（`schema.sql:80-82`、`worker/lib/settingsData.ts:67-70`）。

顶部模式渲染（`src/components/Sidebar.svelte:398-497`）：

- 一级分类逐项渲染为 `.top-item-group` / `.top-item`，二级分类**不平铺**，通过父项旁 `.top-submenu-toggle` 打开绝对定位的 `.top-submenu` 弹出菜单（`Sidebar.svelte:465-496`）。
- 关键 CSS（`Sidebar.svelte:656-731`）强制**单行**：
  - `.top-navigation`：`position:fixed`、固定 `height:52px`、`grid-template-columns: auto minmax(0,1fr) auto`（左箭头 / 轨道 / 右箭头）。
  - `.top-track`：`display:flex`、`overflow-x:auto`、`overflow-y:hidden`、**无 `flex-wrap` 声明**（默认 `nowrap`）、`touch-action:pan-x`、隐藏滚动条。
  - `.top-item-group`：`flex:0 0 auto`（不可收缩、不可换行）。
  - `.top-item`：`white-space:nowrap`。
- 溢出时靠左右箭头（`scrollTopTrack`）和指针拖拽滚动（`handlePointerDown/Move`）。移动端（`Sidebar.svelte:1159-1183`）沿用横向滚动 + `scroll-snap`。

设置 UI：`src/components/settings/NavigationSettingsSection.svelte:18-58` 提供「左侧悬浮 / 顶部固定」二选一单选框；说明文案「顶部：固定悬浮条，分类较多时可横向滚动」。

**单行结论的证据**：`.top-track` 是 flex 容器且未设 `flex-wrap`，子项 `flex:0 0 auto` + `white-space:nowrap`，容器固定 52px 高度并配横向滚动箭头/拖拽——共同保证内容只在一行内横向排列。

### 1.4 顶部导航右上角按钮：现状

右上角主题切换 / 后台设置 / 退出等操作由 `src/components/HomeFloatingActions.svelte` 渲染，容器 `.floating-actions`（`HomeFloatingActions.svelte:62-109`）为 `position:fixed`，默认 `top:1.25rem; right:1.25rem`（`HomeFloatingActions.svelte:127-134`）。

顶部导航模式下，`Home.svelte:358-368` 以 `topNavigation={isTopNavigation}` 传入，组件据此加 `.below-top-navigation` 类（`HomeFloatingActions.svelte:62`），将 `top` 下压为 `4.75rem`（桌面，`:136-138`）/ `4rem`（≤720px，`:231-233`）。

**问题**：`.top-navigation` 固定在 `top:12px`、高 `52px`（`Sidebar.svelte:657-665`），其右缘为 `max-width: var(--content-max-width)` 居中容器的右边界；而浮动按钮被下压到 `4.75rem`（约 76px），落在导航栏**下方一行**，与导航栏不在同一水平线上。图标按钮尺寸为 `2.5rem`（桌面）/ `2.2rem`（移动，`:159-161,235-238`），与导航栏 52px 高度也不一致。

---

## 2. 需求 A：部分导出备份

### 2.1 目标

允许管理员在导出前选择要导出的**分类子集**（连带其下书签），生成的备份文件仍与现有 `BackupData` 结构和 `POST /api/import` 完全兼容，可被本项目重新导入。

### 2.2 功能需求

- **FR-A1 选择粒度**：以**分类**为选择单位。勾选一个一级分类时，默认连带其全部二级子分类与所有归属书签。二级分类可单独勾选/取消。
  - 理由：书签通过 `category_id` 归属分类，按分类选择能天然保证「导出的书签一定有对应分类」，避免产生引用悬空的备份。
- **FR-A2 层级完整性**：若导出的书签或二级分类被选中，其所属的一级分类**必须**一并写入导出文件（即使一级分类本身未被显式勾选），否则重新导入会因 `parent_id` / `category_id` 找不到父级而被 `validateImportPayload` 拒绝。
- **FR-A3 设置项开关**：提供独立开关决定是否导出 `settings`。**默认勾选**（导出完整 `Settings`，与当前全量导出一致）；取消勾选时导出文件的 `settings` 字段为 `null`（`BackupData.settings` 已允许 `null`）。
- **FR-A4 全选 / 全不选**：提供「全选」「清空」快捷操作；默认进入面板时为「全选」，以保证**不改变现有一键全量导出的默认体验**。
- **FR-A5 导出结果契约不变**：导出文件仍是 `BackupData`（`version = BACKUP_VERSION`、`exported_at`、`categories[]`、`bookmarks[]`、`settings|null`），字段语义与全量导出一致；只是 `categories` / `bookmarks` 为选中子集。文件名维持 `cf-navs-backup-YYYY-MM-DD.json`（`appBackup.ts:25-28`）。
- **FR-A6 计数反馈**：导出成功提示需反映**实际导出**的分类数与书签数（复用 `createBackupExportMessage` 的口径，`appBackup.ts:30-32`），而非全库总数。
- **FR-A7 空选择保护**：当有效选择为空（0 分类 0 书签）时禁止导出，并给出明确提示，不生成空文件。
- **FR-A8 纯前端实现优先**：导出数据已由 `GET /api/admin/data` 全量提供给前端，筛选应在浏览器端完成，**不新增后端导出端点**，与现有架构一致。

### 2.3 UI 需求

- 在 `BackupPanel.svelte` 的「导出当前数据」区域（`59-68` 行）增加分类选择器（如可折叠的分类树 + 复选框），保持与现有 `.backup-operation` 布局风格一致。
- 选择器需体现两级层级：一级分类可展开显示其二级分类；勾选父级联动子级（三态复选框：全选 / 部分选 / 未选）。
- 保留顶部「导出备份」主按钮语义；当处于「全选」时等价于当前的一键全量导出。
- 需覆盖移动端布局（参考 `docs/plans/ADMIN_MOBILE_LAYOUT_PLAN.md` 的后台面板约束），选择器在窄屏不溢出、不依赖横向滚动。

### 2.4 非功能需求

- **NFR-A1 往返兼容**：部分导出文件重新导入（`replace` 与 `merge` 两种模式）必须成功，且导入后数据与所选子集一致。
- **NFR-A2 上限意识**：选择器不需要强制上限，但当选中书签数逼近 `MAX_IMPORT_BOOKMARKS` 时可提示用户注意导入侧限制（可选增强，非阻塞）。
- **NFR-A3 无敏感数据泄漏**：导出内容维持现有边界——不含 `admin_*` 凭据类设置（`shared/settings.ts` 白名单之外的 key），不含 `icon_blob` 二进制。

### 2.5 范围外

- 不做「按单个书签」的细粒度勾选（以分类为单位；如后续需要可另行评估）。
- 不改动 `POST /api/import` 的请求契约与校验上限。
- 不引入后端导出端点、不改 `BackupData` / `ImportReq` 结构。
- 不做导出内容的加密或密码保护。

### 2.6 已确认决策（原 Open Questions）

- **OQ-A1 → 已定**：`settings` 导出开关默认**勾选**。见 FR-A3。
- **OQ-A2 → 已定**：勾选某二级分类但未勾选其一级父类时，**隐式补入父分类记录**（仅补该父分类本身，不导出其下未选中的其它书签），以保证导入侧 `parent_id` 可解析。见 FR-A2。

---

## 3. 需求 B：顶部导航分行显示

### 3.1 目标

当导航栏 `position = 'top'` 时，允许一级分类在超出单行宽度后**换行显示**（多行平铺），作为现有「单行横向滚动」之外的可选展示方式，便于分类较多时快速扫描。

### 3.2 功能需求

- **FR-B1 新增展示模式（方案①）**：为顶部导航新增设置开关，用户可在「横向滚动（现状，默认）」与「分行显示」之间选择。**保留现有横向滚动行为为默认**，不影响已选「顶部固定」的存量用户。
- **FR-B2 分行渲染（桌面/宽屏）**：分行模式下，桌面/宽屏的 `.top-track` 允许 `flex-wrap: wrap`，一级分类按行自然排列；容器高度从固定 `52px`（`Sidebar.svelte:665`）改为按内容自适应（`min-height` + 随行数增长）。移动端不适用，见 FR-B7。
- **FR-B3 滚动箭头与拖拽**：桌面/宽屏分行模式下横向滚动箭头（`.scroll-arrow`）与指针横向拖拽（`handlePointerDown/Move`、`touch-action:pan-x`）不再适用，应隐藏/禁用，避免出现无意义控件与冲突交互。移动端本就隐藏箭头（`Sidebar.svelte:1181-1183`），维持横向滑动不受影响。
- **FR-B4 二级分类行为**：二级分类维持现有弹出菜单（`.top-submenu`）交互，本需求不改变一级/二级的层级展示模型，仅改变一级分类的排布方式。
- **FR-B5 布局占位**：顶部导航为 `position:fixed`；桌面/宽屏分行后高度随行数增加，需相应调整首页内容区顶部留白，避免遮挡（`Home.svelte` `top-navigation-layout` 相关布局，`Home.svelte:352-357`）。移动端高度维持固定 `48px`，顶部留白不变。
- **FR-B6 定位精度**：`.top-submenu` 弹出位置依赖父项坐标（`topMenuStyle`）；分行后父项分布在多行，需保证弹出菜单仍锚定到正确的父项且不溢出视口。
- **FR-B7 移动端强制横向滚动**：分行模式**只在桌面/宽屏生效**。在移动端断点（`@media (max-width: 799px)`，`Sidebar.svelte:1159-1183`）无论 `top_layout` 取值如何，顶部导航一律沿用现有单行横向滚动（`scroll-snap` + 触摸滑动），**禁止换行**。
  - 理由：移动端屏幕窄、一级分类多，换行会让固定导航条纵向撑高、占据整屏甚至遮挡首屏内容和搜索框；横向滑动是移动端更合适的浏览方式。
  - 实现约束：分行 CSS（`flex-wrap:wrap` + 自适应高度）只挂在桌面/宽屏媒体查询下；移动端断点保持 `flex-wrap:nowrap`、固定 `height:48px`、`overflow-x:auto`，覆盖桌面分行样式。

### 3.3 UI / 交互需求

- 在 `NavigationSettingsSection.svelte:18-58` 顶部导航相关区域新增一个开关/单选（如「分类排布：横向滚动 / 分行显示」），仅在 `position = 'top'` 时可用。**控件形态以设置页 UI/UX 改造为准**：使用本轮新建的 Switch/segmented 组件（见 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` FR-0.1），复用 `position` 条件置灰逻辑；**不再**沿用旧 `.toggle-field` 原生 checkbox。
- 说明文案（「分行显示仅在桌面/宽屏生效，移动端仍为横向滑动」）用新建的 Tooltip 组件承载（该文档 FR-0.2），与本分区其它说明风格统一。

### 3.4 数据模型 / 设置契约

- 扩展导航设置以承载展示模式。新增字段而非复用 `always_expanded`（其语义为「左侧始终展开」，仅 left 生效，`NavigationSettingsSection.svelte:46-49`）：
  - `NavigationSetting` 增加 `top_layout: 'scroll' | 'wrap'`，**默认 `'scroll'`** 以保持现状。
  - 需同步 6 处：`shared/types.ts:116-119`（类型）、`shared/settings.ts`（key 白名单/公开设置透传）、`schema.sql:80-82`（默认值）、`worker/lib/settingsData.ts:67-70,110-122`（默认 + `isValidNavigationSetting` 校验）、`src/lib/settingsForm.ts:233-236`（表单默认/归一化）、`src/components/settings/NavigationSettingsSection.svelte`（UI）。
  - `isValidNavigationSetting`（`settingsData.ts:116-122`）需接受新字段并对非法值回退默认，保证旧数据（无该字段）安全降级为 `'scroll'`。

### 3.5 非功能需求

- **NFR-B1 向后兼容**：现有已选「顶部固定」的存量设置数据在无 `top_layout` 字段时必须正常渲染，默认回退到「横向滚动」。
- **NFR-B2 无回归**：不得破坏左侧模式（`position:'left'`）与 `always_expanded` 行为，也不得破坏顶部二级弹出菜单。
- **NFR-B3 可访问性**：分行后仍保留 `aria-label="分类导航"`、`aria-current`、子菜单 `role="menu"/menuitem`（`Sidebar.svelte:399,429,471-480`）等现有语义。

### 3.6 已确认决策（原 Open Questions）

- **OQ-B1 → 已定**：采用**方案①**——新增设置开关，保留现有横向滚动模式为默认。见 FR-B1、§3.4。
- **OQ-B2 → 已定**：分行**不设最大行数**，按内容自然换行。

---

## 3bis. 需求 C：顶部导航右上角按钮对齐

### C.1 目标

当导航栏 `position = 'top'` 时，右上角浮动操作按钮（主题切换 / 设置 / 退出等）与顶部导航栏**在同一水平高度对齐**，不再被挤到导航栏下一行。左侧模式（`position = 'left'`）行为不变。

### C.2 功能需求

- **FR-C1 垂直对齐**：顶部模式下 `.floating-actions` 的垂直位置应与 `.top-navigation` 对齐——即按钮组的中线（或顶边）与导航栏一致，而非当前下压到 `4.75rem`（`HomeFloatingActions.svelte:136-138`）。
  - 现状导航栏 `top:12px`、高 `52px`（`Sidebar.svelte:657-665`）；浮动按钮应落在 `top:12px` 起、与 52px 导航条垂直居中对齐的位置。
- **FR-C2 按钮高度协调**：按钮组整体高度需与导航栏 52px 协调，不超出导航栏上下边界造成错位；图标按钮尺寸（`2.5rem`，`HomeFloatingActions.svelte:159-161`）如与对齐冲突可微调，但须保持点按目标充足。
- **FR-C3 水平不重叠 / 悬浮避让**：顶部导航为居中定宽容器（`max-width: var(--content-max-width)`），浮动按钮为 `right:1.25rem` 贴视口右缘。当窗口宽度接近 `--content-max-width` 使按钮与导航栏右缘重叠时，采用**悬浮方案**——按钮浮于导航栏之上，须将 `.floating-actions` z-index 提到 `.top-navigation`（z-index=60）之上（当前 50）。见 OQ-C2。
- **FR-C4 仅顶部模式生效**：对齐调整只在顶部模式（`.below-top-navigation`）应用；左侧模式浮动按钮保持现有 `top:1.25rem`（`HomeFloatingActions.svelte:129`）。
- **FR-C5 分行模式协同**：当需求 B 的桌面分行模式使导航栏高度增长（多行）时，右上角按钮对齐到导航栏**首行顶部**，位置不随行数下移（见 OQ-C1），且不被多行导航遮挡。

### C.3 移动端

- **FR-C6 移动端对齐**：移动端顶部导航高 `48px`、`top:8px`（`Sidebar.svelte:1160-1166`），浮动按钮现被下压到 `4rem`（`HomeFloatingActions.svelte:231-233`）、图标 `2.2rem`（`:235-238`）。移动端同样需与 48px 导航栏同高对齐，且不遮挡导航栏可滑动区域与搜索框。
  - 移动端顶部导航为单行横向滑动（FR-B7），按钮对齐后不得压缩导航栏可用横向空间到无法滑动。

### C.4 范围外

- 不改动按钮的功能、图标、点击行为与 `HomeFloatingActions` 的 props 契约（`topNavigation` 等）。
- 不改动「回到顶部」按钮（`.back-to-top-button`，固定在右下角，`HomeFloatingActions.svelte:140-147`）。
- 左侧导航模式下的浮动按钮位置不变。

### C.5 已确认决策（原 Open Questions）

- **OQ-C1 → 已定**：分行模式导航栏变多行时，右上角按钮对齐到导航栏**首行顶部**，位置不随行数下移。
- **OQ-C2 → 已定**：宽视口下按钮与居中导航栏右缘重叠时，采用**「按钮悬浮在导航栏之上」**——需把 `.floating-actions` z-index 提到 `.top-navigation` z-index=60（`Sidebar.svelte:660`）之上（当前为 50，`HomeFloatingActions.svelte:131`）。

---

## 4. 统一验收标准

### 4.1 需求 A（部分导出）

- [x] AC-A1：备份面板可展开两级分类树并逐项勾选；父级勾选联动子级，呈现三态。
- [x] AC-A2：仅勾选部分分类导出后，文件 `categories`/`bookmarks` 仅含所选子集及其必需父分类；结构为合法 `BackupData`（`version`/`exported_at`/`categories`/`bookmarks`/`settings`）。
- [x] AC-A3：该部分导出文件用 `replace` 和 `merge` 两种模式重新导入均成功，导入后数据与所选子集一致（往返一致）。
- [x] AC-A4：`settings` 开关关闭时导出文件 `settings` 为 `null` 且导入不报错；开启时导出完整 `Settings`。
- [x] AC-A5：默认「全选」状态下导出结果与现有全量导出等价（分类/书签集合相同）。
- [x] AC-A6：空选择时导出被阻止并提示，不产生文件。
- [x] AC-A7：成功提示的分类数/书签数等于实际导出数量。
- [x] AC-A8：不新增后端端点；`git diff` 显示改动集中在前端 `BackupPanel.svelte` / `appImportExport.ts` / `appBackup.ts` 及必要类型，`worker/` 导入契约未变。

### 4.2 需求 B（顶部导航分行）

- [x] AC-B1：设置页在顶部模式下可切换「横向滚动 / 分行显示」，且该开关仅在顶部模式可用；默认「横向滚动」。
- [x] AC-B2：桌面/宽屏分行模式下一级分类超出宽度时换行成多行显示，不出现横向滚动条；容器高度随行数自适应。
- [x] AC-B3：分行模式下横向滚动箭头与拖拽被隐藏/禁用，无残留无效控件。
- [x] AC-B4：二级分类弹出菜单在分行布局下仍锚定正确父项、不溢出视口。
- [x] AC-B5：桌面/宽屏首页内容区顶部留白随导航高度调整，导航不遮挡内容。
- [x] AC-B6：左侧模式与 `always_expanded` 行为无回归；旧设置数据（无新字段）安全降级。
- [x] AC-B7：导航设置往返持久化正确——保存后刷新，`top_layout` 保持；`isValidNavigationSetting` 对非法值回退默认。
- [x] AC-B8：移动端（≤799px）无论 `top_layout` 为 `scroll` 还是 `wrap`，顶部导航均保持单行横向滑动、固定 `48px` 高度，不换行、不纵向撑高、不遮挡搜索框与首屏内容。

### 4.3 需求 C（右上角按钮对齐）

- [x] AC-C1：顶部模式下右上角浮动按钮与导航栏在同一水平高度对齐，不再落在导航栏下一行。
- [x] AC-C2：按钮组不超出导航栏上下边界造成错位；点按目标尺寸充足。
- [x] AC-C3：常见桌面视口下按钮与居中导航栏右缘不重叠遮挡；窄接 `--content-max-width` 时按避让策略正确处理（层级或预留空间）。
- [x] AC-C4：左侧模式（`position:'left'`）浮动按钮位置无回归，仍为原 `top:1.25rem`。
- [x] AC-C5：分行模式导航栏变多行时，按钮对齐基准稳定（首行/顶边），不被多行导航遮挡。
- [x] AC-C6：移动端顶部模式按钮与 48px 导航栏同高对齐，不遮挡搜索框，导航栏仍可横向滑动。

### 4.4 验证方式

- 单元测试：
  - 部分导出的选择→payload 组装逻辑（参考 `tests/unit/appBackup.test.ts`），断言子集与必需父分类；
  - 导航设置校验/归一化：扩展 `isValidNavigationSetting` 对 `top_layout` 的接受与非法值回退测试。
- 真实浏览器验证（遵循仓库 `AGENTS.md` 的 `real-chrome-cdp-testing` 约定与专用临时 profile）：
  - 部分导出：勾选子集→下载→重新导入→核对数据；
  - 顶部分行：桌面切换到顶部+分行→窗口变窄→确认换行、无横向滚动、子菜单定位、内容不被遮挡；移动端 390×844 视口确认**不换行**、仍为横向滑动、高度固定、不占整屏。
  - 右上角按钮对齐：桌面顶部模式确认按钮与导航栏同高、无遮挡；分行多行时按钮对齐稳定；移动端 390×844 确认与 48px 导航栏对齐、不遮挡搜索框；切回左侧模式确认按钮位置无回归。
- **本轮验证证据（2026-08-30）**：`npx vitest run` 95 files / 649 passed；`npx svelte-check --tsconfig ./tsconfig.json` 0 errors；`npm run build` 成功。隔离 headless Chrome + CDP（本地 `wrangler dev`）验证：820px 桌面分行 2 行 / 98px、箭头隐藏、子菜单在视口内；390×844 移动端 nowrap / 48px / overflow-x:auto，导航轨道宽 228px 与右上角按钮区分离、可视重叠 0；下载子集 3 分类 / 6 书签 / settings 存在，replace 与 merge 导入均返回 code=0；左侧模式按钮回归 top=20px（原 1.25rem）。控制台错误、页面异常、失败请求均为 0。
- **仓库自带套件补跑（2026-08-30）**：`scripts/smoke-test.mjs` 在干净本地 D1 上 **75 / 75 全部通过**——覆盖 health/config、登录鉴权与越权、`/api/me`、分类与书签 CRUD+排序、设置读写与非法值拒绝、公开数据聚合与公开模式开关、级联删除、`/api/import` 校验与重编号/引用重绑、登出后 token 失效；`scripts/chrome-regression.mjs`（隔离临时 Chrome）**25 / 25 全部通过**，consoleErrors/pageExceptions/failedRequests 全 0。详见 `DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §9.2bis。

---

## 5. 跨需求约束与风险

- 三项需求相互独立，可分轮实现；本文合并记录因同源于 Issue #8（需求 C 为本轮追加）。需求 B 与需求 C 都动顶部导航布局，宜同轮实现以便一次验证对齐与分行的协同。
- **需求 A 风险**：部分导出若漏补父分类会产生「导入即失败」的坏备份——FR-A2/AC-A2 是硬约束，必须在选择逻辑里强制补全父分类。
- **需求 B 风险**：顶部导航为 `position:fixed`，桌面分行改高度必须同步内容区留白，否则遮挡首页首屏；`.top-submenu` 绝对定位需重新校准。
- **需求 C 风险**：右上角按钮与居中定宽导航栏在宽视口下可能水平重叠；已按 OQ-C2 将 `.floating-actions` z-index 调整为 70，高于 `.top-navigation` z-index=60。分行模式下按钮按 OQ-C1 对齐首行顶部；移动端 ≤799 使用统一断点与独立轨道宽度，避免按钮覆盖可视滚动区。
- 三项均不改后端数据库结构（需求 B 仅在 `settings` JSON 内新增 `top_layout` 字段，`schema.sql` 默认值随之更新，不涉及表结构迁移；需求 C 为纯前端 CSS/布局改动）。
- **与设置页 UI/UX 改造的协同**：需求 B 的 `top_layout` 控件与 `SETTINGS_UI_UX_ADJUSTMENT_REQUIREMENTS.md` 同改 `NavigationSettingsSection.svelte`，须**合并同轮**。冲突清单与实现顺序以该文档 §9 为准：`top_layout` 控件用本轮新建的 Switch/segmented 组件（不用旧 `.toggle-field` checkbox），与「始终展开」按 `position` 互斥启用；`top_layout` 字段及其 6 处同步归本文档，UI 层控件形态归该文档。
- 遵循仓库 `AGENTS.md`：默认在 `develop` 开发，不擅自 `git add/commit/push`、不部署、不写入真实生产域名或凭据。
