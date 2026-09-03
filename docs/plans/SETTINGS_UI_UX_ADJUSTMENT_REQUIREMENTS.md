# 后台设置页面 UI/UX 调整需求文档

> **状态：已完成，集成验收通过。**
>
> - 来源：`docs/plans/UI_UX_Plan.md`（设置页 UI/UX 改造规范）。本文将该规范转化为可执行、可验收的需求，并逐条对齐当前 `develop` 分支真实源码。
> - 本文定义需求、范围、验收标准与约束；主体实现已完成，实际改动与验证记录见 `docs/plans/DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §12。
> - 现状勘察与实现后的源码路径均已核对。
> - **已定决策（2026-08-29）**：4 个基础组件一次性建立（OQ-0）；浏览器书签同步开关说明转 Tooltip（OQ-A）；FR-B4 保留现有「极简时替换为极简标题开关」交互、不改置灰（OQ-B）；Tooltip 移动端采用点按切换（OQ-C 方案 1）。

---

## 1. 背景与现状

### 1.1 目标

依据 `UI_UX_Plan.md` 的两条核心原则改造后台设置页：

1. **结构减负**：释放横向宽度；浅/深色背景配置用内部 Tab 切换，消除纵向重复堆叠。
2. **文案四级收敛**：删同义反复；规则/格式内置到 placeholder 或控件数值；系统逻辑/权限保留为 Tooltip `(?)`；大卡片 Checkbox 统一改为紧凑 Switch 并建立置灰联动。

### 1.2 设置页架构现状

设置页容器 `src/components/SettingsPanel.svelte`：

- 左侧竖向功能菜单 `.settings-submenu`（`SettingsPanel.svelte:134-140`），6 个分区（`settingsSections`，`SettingsPanel.svelte:33-40`）：`basic` 站点设置、`appearance` 外观与卡片、`layout` 布局与导航、`search` 搜索设置、`footer` 自定义样式/脚本、`account` 账号安全。
- 右侧实时预览 `SettingsHomePreview`（`SettingsPanel.svelte:171-173`）。
- 分区与组件映射（`SettingsPanel.svelte:144-168`）：
  - `basic` → `BasicSettingsSection`（站点信息）+ `HeroSettingsSection`（首页显示）
  - `appearance` → `BackgroundSettingsSection`（配色方案）+ `CardSettingsSection`（卡片风格）+ `AdvancedSettingsSection`（高级：背景/尺寸/表面）
  - `layout` → `NavigationSettingsSection`
  - `search` → `SearchEngineSettingsSection`
  - `footer` → `FooterSettingsSection`
  - `account` → `PasswordChangePanel`

> **重要映射修正**：`UI_UX_Plan.md`「站点设置」表里的「公开模式/默认主题」在 `BasicSettingsSection`，而「显示站点标题/显示搜索框/显示引擎选择器/经常访问展示数」实际在 `HeroSettingsSection`（`SettingsPanel.svelte:145-146` 同屏渲染）。「高级设置」的背景字段不在 `BackgroundSettingsSection`，而在 `AdvancedSettingsSection` 展开后委托的 `ThemeBackgroundCard`。

### 1.3 复用基线与缺失组件（关键约束）

调查确认仓库**没有**统一的 Switch / Tooltip / InputGroup / Slider 组件：

| 计划要求的组件 | 现状 | 结论 |
| --- | --- | --- |
| **Switch 开关** | 无 `Switch.svelte`；所有开关是原生 `checkbox` + `.toggle-field`/`.toggle-copy`（`settingsSections.css:189-220`，18px `accent-color`） | **需新建**统一 Switch 组件 |
| **Tooltip `(?)`** | 无 `Tooltip.svelte`；仅 `bookmarkCardTooltip.css`（`.bookmark-tooltip-anchor` + `::after attr(data-tooltip)`，hover/focus-visible 显示，触屏隐藏）；其余为原生 `title` 属性 | **需新建**可访问的统一 Tooltip（现有 `title`/`data-tooltip` 不满足统一 `(?)` 图标交互） |
| **InputGroup（数值+单位后缀）** | 无组件；现成模式为 `.inline-input` + number + unit `select`（`NavigationSettingsSection.svelte:76-103`，`settingsSections.css:162-186`，`unit-select` flex-basis 84px） | **需新建**通用 InputGroup（或抽象现有 `.inline-input`） |
| **Slider 数值预览** | 无组件；数值在 label 内 `<em>`（如 `BasicSettingsSection` 字号、`NavigationSettingsSection` 边距）；计划要求数值移到滑块右侧 | **需新建** Slider 封装并迁移格式化策略（px / % / `0 隐藏`） |
| **颜色选择器** | **已有可复用** `src/components/ColorAlphaInput.svelte`（文本框 + 38px 色块弹窗，含颜色/alpha；`ColorAlphaInput.svelte:92-125`，样式 `:133+`） | **复用**，无需新建 |

`ColorAlphaInput` 现有调用点：`BasicSettingsSection.svelte:41`、`AdvancedSettingsSection.svelte:122,142`、`ThemeBackgroundCard.svelte:92,143`、`GradientBackgroundInput.svelte:113,125`、`BookmarkEditModal.svelte:362`。其 props：`value/alpha/placeholder/inputLabel/swatchTitle/alphaText`（`ColorAlphaInput.svelte:12-17`）。

---

## 2. 需求 0：基础组件（前置依赖）

计划中多处依赖统一控件，须先建立，供各分区复用。这是 §3~§7 的前置条件。

- **FR-0.1 Switch 组件**：新建可访问的行内开关（`role="switch"` / `aria-checked`、键盘可操作、`disabled` 态），替换设置页所有原生 checkbox 卡片。API 至少含 `checked`（可 `bind`）、`disabled`、`label`（或 slot）、可选 `tooltip`。视觉紧凑，取代当前 `.toggle-field` 大卡片。
- **FR-0.2 Tooltip 组件**：新建 `(?)` 图标 + 浮层的可访问 Tooltip。`(?)` 为 `button`，桌面 hover + 键盘聚焦触发；移动端触屏**点按切换（Tap to toggle）**，用 `aria-expanded` 表达展开态，同一时刻仅一个 Tooltip 展开（互斥），点浮层外区域关闭（OQ-C 方案 1）。可复用 `bookmarkCardTooltip.css` 的显示时机策略，但需独立为通用组件。用于承载「系统逻辑/权限」类说明。
- **FR-0.3 InputGroup 组件**：新建数值/文本 + 后缀（单位或操作按钮）的一体化输入组，支持常驻单位后缀（`px`/`%`）与「输入框内部后缀按钮」（Input Suffix Button），替换分散的 `.inline-input` + 外置按钮写法。
- **FR-0.4 Slider 组件（带右侧数值）**：新建 range 封装，数值显示在滑块右侧，内置格式化策略：`N px`、`N%`、`0` 时显示 `0 (隐藏)` / `已禁用` 等语义文案。迁移现有 `<em>` 数值逻辑。
- **FR-0.5 一致性**：以上组件样式基线沿用 `settingsSections.css`，保证与现有栅格（`.group`/`.field`/12 列 `settings-grid`）协调；不得破坏右侧 `SettingsHomePreview` 的实时联动（各 section `bind:form` + `on:input/change` 同步）。

> **已定（OQ-0）**：本轮一次性建立全部 4 个基础组件（Switch/Tooltip/InputGroup/Slider），避免分区替换期出现新旧双标准。

---

## 3. 需求 A：站点设置分区（basic）

覆盖 `BasicSettingsSection.svelte` 与 `HeroSettingsSection.svelte`。

### 3.1 BasicSettingsSection（站点信息）

- **FR-A1 站点标题**（`BasicSettingsSection.svelte:26-37`，单行 text + 说明 `small:36`）：删除下方独立说明，仅保留必填红星；`placeholder="请输入站点标题"`。与颜色、字号同逻辑行、双列栅格。
- **FR-A2 首页标题颜色**（`:39-50`，已是 `ColorAlphaInput`）：说明（`:49`）转 placeholder `留空跟随主题文字色`；保持色块弹窗组合（已满足计划的「带颜色选择器弹窗输入框」）。
- **FR-A3 首页标题字号**（`:52-63`，range slider，`<em>` 显示 `Npx`）：删说明（`:63`），改用 FR-0.4 Slider，数值 `42 px` 显示在滑块右侧。
- **FR-A4 公开模式**（`:65-77`，`.toggle-field` + checkbox，说明 `:68`）：弃用大卡片，改行内 Switch（FR-0.1）；说明转 Tooltip（FR-0.2）：`开启后无需登录即可浏览；关闭后仅管理员登录可见。`
- **FR-A5 默认主题模式**（`:91-110`，segmented-control 三选一）：保持分段选择器，移除下方动态长说明（`:110`）；改为 Tooltip：`设置新访客首次访问时的默认主题，访客仍可在首页手动切换。`（原 `themeOptions` 各项 hint，`settingsForm.ts:12-15`，可并入 Tooltip 或 option title）。
- **FR-A6 图床服务地址**（`:113-124`，url text，说明 `:123`）：placeholder `https://your-domain.com`，说明转 Tooltip `(?)`：`用于背景图、分类与书签图标的上传接口。留空则仅支持填写外链。`
- **FR-A7 浏览器书签同步**（`:78-90`，`.toggle-field` + checkbox）：改行内 Switch（FR-0.1）；说明**转 Tooltip**（FR-0.2，已定 OQ-A），保留其语义说明（原 checkbox 下方文案）。

### 3.2 HeroSettingsSection（首页显示）

- **FR-A8 经常访问展示数**（`HeroSettingsSection.svelte:19-30`，range 0-20，`<em>` 0 显示「已禁用」）：删说明（`:29`）；用 FR-0.4 Slider，`0` 显示 `0 (隐藏)`、其余 `N 个`。
- **FR-A9 显示站点标题**（`:32-43`）、**显示搜索框**（`:44-55`）、**显示引擎选择器**（`:56-67`）：三个 `.toggle-field` + checkbox 全部改行内 Switch，可横向并排/紧凑排列，消除文案截断。
  - 显示站点标题：直接删说明，仅保留标题。
  - 显示搜索框：直接删说明。
  - 显示引擎选择器：说明转 Tooltip：`关闭后固定使用默认搜索引擎，不展示切换下拉框。`
- **FR-A10 联动（新增）**：当「显示搜索框」关闭时，「显示引擎选择器」**自动置灰 Disabled**。当前源码无此联动（`HeroSettingsSection.svelte:44-67`），需新增：置灰时 Switch `disabled`，并保持数据值不丢失。

---

## 4. 需求 B：外观与卡片分区（appearance）

覆盖 `BackgroundSettingsSection`（配色方案）、`CardSettingsSection`（卡片风格）、`AdvancedSettingsSection` + `ThemeBackgroundCard`（高级）。

### 4.1 配色与展示

- **FR-B1 模块顶层说明**：删除 `BackgroundSettingsSection.svelte:34` 的大段副标「选择一套内置方案…」。
- **FR-B2 内置配色方案**（`GradientPresetSelector.svelte`，色块卡片 `:44-66`，每套含 `small` 描述 + title/aria-label）：保留精简分组名（如「毛玻璃」「护眼纯色」），单套方案文学性描述移到卡片 hover 浮层（Tooltip 或 title），色块内文案精简为方案名，缩小卡片体积。
- **FR-B3 卡片风格**（`CardSettingsSection.svelte:27-45`，radio 两卡：详情/极简）：保持两栏，精简文字为副标（详情=图文横排、极简=纯图标网格），选中态用品牌蓝边框高亮。
- **FR-B4 描述显示策略**（`CardSettingsSection.svelte:47-56`，仅 `card_style==='info'` 渲染，radio 三选一）：说明（`:55`）转 Tooltip：`仅在「详情风格」下生效；单个书签单独配置时优先级更高。`
  - **联动（保持现状）**：**保留现有「极简风格时整块替换为『显示极简卡片标题』开关」交互**（`CardSettingsSection.svelte:57-66`），不改为计划的「置灰」。即详情风格显示描述策略 radio 组；极简风格隐藏描述策略、显示极简标题 Switch。此为已定决策（OQ-B），不引入行为变更。
- **FR-B5 高级设置折叠**（`AdvancedSettingsSection.svelte:47-65`，`.advanced-toggle`）：保留折叠，文案 `高级样式设置（背景、尺寸与表面）`；减少深色边框/阴影，用简洁展开/收起箭头（`.advanced-chevron`）。

### 4.2 高级设置（核心结构优化）

- **FR-B6 浅/深背景内部 Tab（核心）**：当前浅色、深色背景是**纵向堆叠两套 `ThemeBackgroundCard`**（`.theme-background-grid` 单列，`AdvancedSettingsSection.svelte:225-229`，`:70-96` 渲染两张卡）。改为 `[ 浅色模式 | 深色模式 ]` 内部 Tab，一套表单控件配置两套模式，表单高度减半。须保证切 Tab 不丢失另一模式的已填值，且与右侧预览 `previewTheme` 协调。
- **FR-B7 背景类型**（`ThemeBackgroundCard.svelte:70-88`，分段 纯色/渐变/图片）：删下方动态说明（`:88`）；保持「选纯色/渐变→背景值为颜色选择器；选图片→URL 输入框」的现有切换（`:90-140`）。
- **FR-B8 背景值 + 图床上传**（`ThemeBackgroundCard.svelte:90-140`，image 分支为 `.inline-input` + 外置 `ghost-button`「打开图床上传 ↗」）：改用 FR-0.3 InputGroup，把上传按钮做成输入框**内部后缀按钮**；placeholder `请输入图片 URL 或点击右侧上传`。
- **FR-B9 遮罩颜色**（`ThemeBackgroundCard.svelte:141-153`，`ColorAlphaInput`）：说明转 Tooltip：`覆盖在背景图上的蒙层颜色，浅色模式推荐白/浅灰，深色推荐黑/深蓝。`；与模糊度、透明度整合为一行栅格。
- **FR-B10 模糊度**（`:157-161`，range 0-40，`<em>` px）：删说明，FR-0.4 Slider 右侧 `0 px`。
- **FR-B11 遮罩透明度**（`:163-167`，range 0-1，`<em>` toFixed(2)）：删说明，Slider 右侧百分比 `10%`。
- **FR-B12 卡片最小宽度**（`AdvancedSettingsSection.svelte:98-103`，number）：常驻单位后缀 `px`（InputGroup），`placeholder="默认 80"`，加 Tooltip：`控制一行能容纳的卡片数量，支持自适应换行`。
- **FR-B13 详情卡片最小高度**（`:104-108`，number，已随 `card_style!=='info'` 置灰）：删说明，单位后缀 `px`，`placeholder="0 为自适应"`；保留现有置灰联动。
- **FR-B14 极简卡片图标大小**（`:109-112`，number，已随 `card_style!=='icon'` 置灰）：单位后缀 `px`，`placeholder="默认 60"`；保留现有置灰联动。
- **FR-B15 卡片表面颜色**（`:117-130`，`ColorAlphaInput`）：说明转 Tooltip：`书签卡片的背景底色，配合不透明度实现毛玻璃质感。`；与不透明度、文字颜色并排 3 列栅格。
- **FR-B16 卡片不透明度**（`:133-140`，range 0-1，`<em>` toFixed(2)）：删说明，Slider 右侧 `65%`。
- **FR-B17 卡片文字颜色**（`:141-153`，`ColorAlphaInput`）：说明转 placeholder `留空跟随系统高对比色`，删下方两行小字。

---

## 5. 需求 C：布局与导航分区（layout）

覆盖 `NavigationSettingsSection.svelte`。

> **与既有需求文档的重叠提醒**：`PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md`（需求 B）已计划在本分区新增 `top_layout` 分行开关。两份文档改同一文件，实现时须协调，避免冲突（见 §9）。

- **FR-C1 分类导航位置**（`NavigationSettingsSection.svelte:21-43`，segmented 左侧/顶部）：保持分段选择器，移除下方两行说明（`:42`），说明转 Tooltip：`左侧：侧边悬浮展开；顶部：顶部吸顶横向滚动条。`
- **FR-C2 左侧导航始终展开**（`:45-58`，`.toggle-field` + checkbox，已随 `position!=='left'` 置灰）：改行内 Switch，说明转 Tooltip：`在大屏下常驻展开分类列表。仅在「左侧悬浮」模式下生效。`；保留顶部模式置灰联动。
- **FR-C3 内容区域最大宽度**（`:65-87`，number + unit select px/%，`.inline-input`）：说明转 Tooltip：`限制首页内容主体最大宽度，超宽屏下两边将自动留白居中。`；数字框与单位组合为 FR-0.3 InputGroup。
- **FR-C4 桌面左右边距**（`:89-100`，range 0-100，`<em>` px）：删说明，Slider 右侧 `15 px`；与顶部/底部边距整合为「间距设置」3 列子网格。
- **FR-C5 顶部/底部边距**（`:102-126`，range 0-50，`<em>` %）：删说明，Slider 右侧 `0%` / `3%`。

---

## 6. 需求 D：搜索设置分区（search）

覆盖 `SearchEngineSettingsSection.svelte`。

- **FR-D1 默认引擎**（`SearchEngineSettingsSection.svelte:60-77`，label + native select，说明 `:74-76`）：删除整段说明，顶栏仅保留 `默认搜索引擎` label + 下拉。
- **FR-D2 引擎名称**（`:84-88`，text）：`placeholder="引擎名称 (如 Google)"`；引擎列表整体改 Table 或紧凑 Flex 栅格卡片，列头固定。
- **FR-D3 图标 URL + 获取**（`:85-103`，text + 36px 预览 + 独立 `ghost-button`「Favicon.im」）：`placeholder="图标链接"`；把 `Favicon.im`（`applyFaviconImIcon`）做成输入框**内部操作图标**（FR-0.3 后缀按钮），点击自动抓取；保留「模板无有效 URL 时禁用」逻辑与 title 提示。
- **FR-D4 查询模板**（`:106-114`，text）：label 保持 `搜索 URL 模板 (关键词用 {q} 代替)`；placeholder `https://www.google.com/search?q={q}`，消除多余文字。
- **FR-D5 删除操作**（`:115-122`，红色文字 `danger-button`，`engines.length<=1` 时禁用）：改为垃圾桶图标 `TrashIcon`（hover 危险红），保留禁用逻辑。
- **FR-D6 新增搜索引擎**（`:126-127`，`ghost-button` 文案「+ 新增搜索引擎」）：标准按钮化，文案统一为 `+ 添加搜索引擎`，列表底部居左。

---

## 7. 范围外

- 不改设置项的**数据契约**（`Settings` 类型、`shared/settings.ts` key 白名单、后端校验/持久化）；本文只调整控件形态、文案、联动与布局。
  - 例外：若 §9 与分行需求合并实现，`top_layout` 字段属那份文档，不在本文数据改动内。
- 不改 `footer`（自定义样式/脚本）与 `account`（账号安全）分区。
- 不改右侧 `SettingsHomePreview` 的预览逻辑，仅需保证表单联动不被破坏。
- 不做设置项的新增/删除（除文案与控件形态外，配置能力不变）。
- FR-A10（显示搜索框→引擎选择器置灰）属**新增联动**，为已确认的实现内容；FR-B4 已定保留现状、不引入行为变更。

---
## 8. 已确认决策

- **OQ-0 → 已定**：本轮一次性建立 Switch/Tooltip/InputGroup/Slider 四个基础组件。
- **OQ-A → 已定**：浏览器书签同步开关说明转 Tooltip，保留原有语义。
- **OQ-B → 已定**：FR-B4 保留现有「极简风格时替换为极简标题开关」交互，不改为置灰。
- **OQ-C → 已定（方案 1）**：Tooltip 移动端 `(?)` 采用点按切换；再次点按或点浮层外区域关闭；桌面保持 hover + 键盘聚焦触发；同一时刻仅一个 Tooltip 展开。

---

## 9. 与「顶部导航」需求的协同：冲突清单与解决

两份需求同时改动，必须合并到同一轮、按统一顺序实现。对方文档：`PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md`（需求 B 顶部分行、需求 C 右上角对齐）。以下逐条给出重叠点与已定解决方案。

### 9.1 冲突清单与解决

| # | 冲突点 | 本文（UI/UX） | 对方（顶部导航 B/C） | 已定解决方案 |
| --- | --- | --- | --- | --- |
| 1 | **`NavigationSettingsSection.svelte` 同文件改动** | FR-C1~C5：位置说明转 Tooltip、始终展开 checkbox→Switch、最大宽度→InputGroup、边距→Slider | 需求 B FR-B1/§3.3：**新增** `top_layout`「横向滚动 / 分行显示」控件 | 合并同轮改这一个文件；本文负责既有控件改造，对方负责新增 `top_layout` 控件，二者在同一 fieldset 内协调布局。 |
| 2 | **新控件的控件形态标准** | 引入统一 Switch / segmented（FR-0.1） | 对方 FR-B1 原文「参考现有 `always_expanded` 的 disabled 联动写法」（即旧 `.toggle-field` checkbox） | **以本文新组件为准**：`top_layout` 用新的 Switch 或 segmented-control 实现，**不得**再用旧 `.toggle-field` 原生 checkbox。对方文档该措辞作废（见 §9.2）。 |
| 3 | **说明文字承载方式** | 说明统一转 Tooltip `(?)`（FR-C1/FR-0.2） | 对方 §3.3「说明文案需注明『分行仅桌面生效』」 | `top_layout` 的「仅桌面生效、移动端仍横向滑动」说明用**新 Tooltip 组件**承载，与位置/始终展开的 Tooltip 风格一致。 |
| 4 | **两个条件互斥控件同区** | FR-C2 始终展开：**仅 `position='left'` 可用**（否则置灰） | 对方 `top_layout`：**仅 `position='top'` 可用**（否则置灰） | 布局与导航 fieldset 内并存两个随 `position` 互斥启用的控件。实现时在「分类导航位置」下方分别渲染：left 时启用「始终展开」、top 时启用「分行显示」；另一者置灰。置灰须保数据值不丢。 |
| 5 | **`Sidebar.svelte` / `Home.svelte` / `HomeFloatingActions.svelte`** | 本文**不涉及** | 对方 FR-B2/B5/B7（分行 CSS、留白、移动端）、需求 C（按钮对齐、z-index） | 无重叠，全部归对方文档所有；本文不动这三个文件。 |
| 6 | **`Settings` 数据契约 / `top_layout` 字段** | 本文明确**不改**数据契约（§7） | 对方 §3.4 新增 `top_layout` 并同步 6 处 | `top_layout` 字段与其 6 处同步**完全归对方文档**；本文只在 UI 层复用其字段渲染控件，不重复定义。 |

### 9.2 对方文档需同步的措辞修正

- `PARTIAL_EXPORT_AND_TOP_NAV_WRAP_REQUIREMENTS.md` 的 FR-B1/§3.3 中「参考现有 `always_expanded` 的 disabled 联动写法」应更新为「使用本轮新建的 Switch/segmented 组件，并复用 `position` 条件置灰逻辑」，避免与本文 FR-C2 的 Switch 改造产生新旧双标准。该修正已在对方文档登记（见其协同小节）。

### 9.3 实现顺序与文件所有权

1. **阶段一（前置）**：建立 4 个基础组件（FR-0.1~0.4）并独立验证。两份需求都依赖，必须先做。
2. **阶段二（合流点：`NavigationSettingsSection.svelte`）**：由**同一人一次性**改这一个文件——既有控件改造（本文 FR-C1~C5）+ 新增 `top_layout` 控件（对方 FR-B1），按冲突 #4 的互斥布局落地。`top_layout` 字段的类型/后端/schema 同步（对方 §3.4）作为该阶段前置。
3. **阶段三（并行、无重叠）**：本文其余分区（basic/appearance/search）与对方的 `Sidebar.svelte`/`Home.svelte`/`HomeFloatingActions.svelte` 改动可并行，互不碰同一文件。

### 9.4 其余风险

- **基础组件是最大风险**：Switch/Tooltip/InputGroup/Slider 全设置页共用，任一可访问性或 `bind` 双向绑定缺陷会波及所有分区。须先独立验证组件，再逐分区替换。
- **联动正确性**：FR-A10（搜索框→引擎选择器置灰）、FR-C2（左侧→始终展开置灰）、以及冲突 #4 的 `top_layout`（顶部→分行置灰）须保证置灰时**数据值不丢失**、切回时恢复。
- **预览联动**：各 section 依赖 `bind:form` + `on:input/change` 驱动 `SettingsHomePreview` 与 `isDirty`/`canSave`（`SettingsPanel.svelte:57-91`）。替换控件后须保持同一事件流，否则「有未保存更改」判定与保存按钮可用性会失效。
- **验证方式**：
  - 单元/组件测试：新建的 Switch/Tooltip/InputGroup/Slider 的受控值、disabled、键盘可访问性；联动置灰的取值保持。
- **本轮验证证据（2026-08-30）**：`npx svelte-check --tsconfig ./tsconfig.json` 0 errors；`npm run build` 成功；`npx vitest run` 95 files / 649 passed。隔离 headless Chrome + CDP 本地验证设置页 6 个分区、Switch/Tooltip/Slider 渲染、`position` 互斥置灰、FR-A10（关闭搜索框后引擎选择器 Disabled）、备份页和顶部导航；控制台错误、页面异常、失败请求均为 0。
- **仓库自带套件补跑（2026-08-30）**：`scripts/chrome-regression.mjs`（隔离临时 Chrome）**25 / 25 全部通过**，其中 `settings tab rendered`、`backup tab rendered`、`admin bookmark search works`、`bookmark context edit modal works` 直接覆盖本文改造的设置页与后台面板，consoleErrors/pageExceptions/failedRequests 全 0；`scripts/smoke-test.mjs` **75 / 75 全部通过**（含 `PUT /api/settings` 读写与非法值拒绝）。详见 `DEV_TASK_BREAKDOWN_UI_NAV_EXPORT.md` §9.2bis。
- 遵循仓库 `AGENTS.md`：默认在 `develop` 开发，不擅自 `git add/commit/push`、不部署、不写入真实生产域名或凭据。

### 9.5 设置卡片高度与滚动边界（实现记录）

- 桌面宽度（>1320px）的 `.settings-panel` 使用 `height: clamp(0px, calc(100dvh - 180px), 960px)` 与 `min-height: min(560px, calc(100dvh - 180px))`；`180px` 为后台外层可用高度预留，包含设置包装器底部 `24px` 间距，不代表单一 margin。
- `AdminTabContent.svelte` 的 `.admin-content` 保持 `height: 100%` 与 `overflow: auto`；设置表单内容在 `.settings-section-content` 的 `overflow-y: auto` 区域内滚动，避免卡片撑出后台内容轨道。
- ≤1320px 时移除设置卡片固定高度，工作区改为单列自然高度并将内部溢出设为 `visible`，避免窄屏出现固定高度与页面滚动竞争。
- 以上契约由 `tests/unit/adminSettingsLayout.test.ts` 覆盖；宽屏、断点和窄屏实际行为通过隔离浏览器验证。
