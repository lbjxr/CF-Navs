> **STATUS: 已完成**（判定于 2026-10-15）——CHANGELOG 记录 P0/P1/P2 两批交付，BACKLOG 无后续条目。

# CF-Navs 后台管理整改开发文档

- 版本：1.0（2026-09-20）
- 关联交付物：`CF-Navs-后台审计-2026-09-20.html`（审计报告 + 高保真整改 mockup）
- 依据技能：`web-design-guidelines`（Vercel 100+ 条 a11y/UX/性能规则）、`frontend-design`（Anthropic 反模板设计原则）、`brand-guidelines`（品牌视觉一致性）、`extract-design-system`（design token 提取）、`theme-factory`（Modern Minimalist 主题方法）
- 目标分支：`develop`（按仓库 CONTRIBUTING.md，改动用 issue 编号逐个提交；本文档仅作实施说明，本身不提交）

> 阅读约定：本文所有「建议值」均为由审计推导、尚未落地的新 token/样式；落地时以最终实现与实际渲染验收为准。文件行号基于审计当日源码，改前请重读最新文件。

---

## 1. 文档目标与范围

把审计报告的结论转成**可执行的开发规格**：设计 token 体系、对比度修复、组件/布局改动清单、主题与明暗、验收标准、分阶段实施计划。

**范围**：后台管理界面（`src/views/Admin.svelte`、`src/components/admin/*`、`src/components/AdminSidebar.svelte`、`src/components/SettingsPanel.svelte`、`src/components/settings/*`、相关弹窗与 UI 基件、`src/app.css`、`index.html`）。

**不做**：Home 前台页面视觉体系重构、业务逻辑与 API 变更、未授权部署/提交。

---

## 2. 设计原则（5 技能落点为规则）

| 规则 | 出处 | 落地形式 |
|---|---|---|
| 层级用表面亮度差，阴影只给浮层 | frontend-design「SaaS 卡片套件」反模板 + theme-factory 组织层 | 卡片在背景上递增亮度；阴影仅用于弹窗/排序浮条/子菜单展开 |
| 圆角按层级、不全局统一 | frontend-design 模板对抗 + extract（项目已有 30 种 radius 债务） | 用 scale：8/10/12/16/20/999，分层级分配 |
| 焦点必须可见且 `:focus-visible` | web-design-guidelines「Focus States」 | 所有 `outline:none` 必须配可见替代环；`:focus` 改 `:focus-visible` |
| 颜色语义单一来源 | brand-guidelines（一致性）+ web 主题化 | 消灭硬编码 `#2563eb`/`#1d4ed8`/`rgba(37,99,235,.12)`，收敛到 `--admin-*` token |
| 字号刻意分级 | frontend-design「deliberate type scale」 | 收敛 48 种 font-size → 5 档 token；正文与 h1 有一档以上梯队 |
| 动效克制、单点记忆 | frontend-design | hover 只给可交互与当前项；去掉 icon-button 的 `translateY` |
| 对比度 ≥4.5:1（普通文本） | web-design-guidelines | 占位符/徽标/危险色按 §4 换值 |
| 分区信息架构粒度匹配 | 布局审计 L1–L6 | 「外观与卡片」拆分；单滚动；预览联动 |

---

## 3. 设计 Token 体系

### 3.1 现有债务（先量化，后收敛）
- 全项目 48 种 `font-size`、30 种 `border-radius`、25 种 transition 写法（`src/app.css` 顶部注释自证）。
- 主按钮硬编码 `#2563eb`（`src/components/admin/adminListPanels.css:.admin-primary-button`）绕过 `--admin-accent`；多组件硬编码 `#1d4ed8`、`rgba(37,99,235,.12)` 焦点环。
- 无 `color-scheme` 声明（暗色原生滚动条/下拉仍亮色）。

### 3.2 建议 Tile（浅色，增量覆盖 `src/views/Admin.svelte` 顶部 `--admin-*`）

| Token | 现值 | 建议值 | 备注 |
|---|---|---|---|
| `--admin-input-placeholder` | `#94a3b8` | **`#64748b`** | 4.76:1 达标（现 2.56 失败） |
| `--admin-badge-text` | `#64748b` | **`#475569`** | 6.92:1 达标（现 4.34 失败） |
| `--admin-danger` | `#dc2626` | **`#b91c1c`**（深档） | 5.91:1 达标（现 4.41 失败） |
| `--admin-danger-hover-*` | `#fecaca/#fee2e2` | 随 danger 深档同步 | 保持色相 |
| `--admin-subtle` | `#64748b` | 保留（4.76 大字达标） | 不强制 |
| `--admin-primary-btn-bg` | 硬编码 `#2563eb` | **`var(--admin-accent)`** | 消 token 漂移 |

### 3.3 暗色（梯度拉开层次）
| 语义 | 现值 | 建议 | 依据 |
|---|---|---|---|
| 页面背景 | `#08111f` | `#0a0f1a`（略深） | 与卡片拉开 |
| 卡片表面 | `rgba(15,23,42,0.6)` | **`#131c2e`（不透，淘汰靠阴影分层）** | 表面差 > 阴影 |
| 悬浮表面 | `#1e293b` | `#1a2b40` | hover/active 一档抬亮 |
| 边框 | `rgba(148,163,184,0.2)` | `rgba(148,163,184,0.26)` | 容器边界可辨 |
| 桌面正文 | `#e5eefb` | 保留 | 16.38:1 |
| 桌面弱化 | `#94a3b8` | `#b6c4d6` | 提升暗色可读 |

暗色配色仍呼应 theme-factory「Modern Minimalist」灰度底+单一蓝强调，不新增第三跳色。

---

## 4. 对比度修复清单（精确）

| 位置 | 旧值 | 新值 | 复算 | 等级 | 文件 |
|---|---|---|---|---|---|
| 浅占位符 | `#94a3b8` on `#fff` | `#64748b` | 4.76 ✔ | P0 | `Main.svelte` token / `adminListPanels.css` 输入框 |
| 暗占位符 | `#64748b` on `#0f1c30` | `#94a3b8` | 6.66 ✔ | P0 | 同上 |
| 徽标文字 | `#64748b` on `#f1f5f9` | `#475569` | 6.92 ✔ | P0 | `--admin-badge-text` |
| 危险色 | `#dc2626` on `#fef2f2` | `#b91c1c` | 5.91 ✔ | P0 | `--admin-danger` |
| 暗色危险 | — | `#f87171` on `#0f1c30` | 6.18 ✔ | P0 | 暗色 `--admin-danger` 已亮档，保留 |
| 焦点环 | `:focus{outline:none; ring rgba(…2310)}` | `:focus-visible` + 同语义半透明 ring | — | P2 | 见 §7 |

> 验收：高亮每对至少 ≥4.5，暗色 ≥4.5（大字位 ≥3）。

---

## 5. 组件级整改规格

### 5.1 Admin 外壳（`src/views/Admin.svelte`、`src/components/admin/`）
1. **圆角 scale**：容器 `.admin-status-panel/.admin-list-panel/.page-header` → `18px`（保留 `--admin` 原 18），行/小件 → `10px`，输入框 `10px`，按钮 `10px`，徽标 `8px`，全局不再无差别 `12px`。
2. **表面色差**：常规 panel 去 `box-shadow: var(--shadow) 0.06`，改用 `border: 1px solid var(--admin-border)` + 背景略高于页 bg 1 档；仅排序 bar/子菜单展开保留浮层阴影。
3. **hover 收敛**：$el 卡片 hover 保留 `border-color` 变化，**删除** `transform: translateY(-1px)` 全局成员（`AdminPageHeader.svelte .icon-button:hover` 等）；保 → 统一集中。
4. **focus**：所有 `outline:none` 与 ring 改 `:focus-visible`；增 `color-scheme` 声明（见 §7）。
5. 新增 skip-link（键盘直达主内容，`visually-hidden` 聚焦可见）。

### 5.2 adminListPanels.css（共享面板）
- `.admin-primary-button` → `background: var(--admin-accent); color:#fff`；危险按钮 token 化。
- `.admin-badge` → `color: var(--admin-badge-text) /* #475569 */`。
- 搜索输入框 `:focus` → `:focus-visible`。
- `.admin-empty-state` 文案对比度：空态辅助文字用 `--admin-muted`（≥7.5）。

### 5.3 CategoryListPanel / BookmarkListPanel（`admin/`）
- 搜索框加可访问名（`aria-label` 或关联 `<label>`）。
- 列表改动：保持已用 `<table>`（书签）/`<article>`（分类）语义，仅样式换 token；删除按钮红文字按 §4 修。
- 分页「上一页/下一页」保留等宽；禁用状态 `opacity:0.6` 不改 `color` 逻辑。

### 5.4 弹窗 / UI 工具（`BookmarkEditModal`, `CategoryEditModal`, `LoginModal`, `PasswordChangePanel`, `BookmarkBaseFields`, `CustomIconField`, `IconifySelector`, `ColorAlphaInput`, `ThemeBackgroundCard`, `CategoryTreeSelect`）
- 统一把 `input:focus{outline:none; box-shadow:0 0 0 3px rgba(37,99,235,.12)}` 改 `input:focus-visible{outline:none; box-shadow:0 0 0 3px var(--focus-ring)}`，且 `box-shadow` 使用 token。
- 焦点环宽度语义：聚焦 3px `--focus-ring`；`--focus-ring` = `color-mix(in srgb, var(--admin-accent) 34%, transparent)`。

### 5.5 BackupPanel
- `.category-tree-select` `outline:none`（`BackupPanel.svelte:361`）需补 `:focus-visible` 可见替代（border + 3px ring），先复查当前是否已有 visible 替代，无则补。

---

## 6. 站点设置布局整改（L1/L2/L5/L6）

> 对应的「逐分区裁定」见审计报告第二节。以下为实现规格。

### 6.1 L1 三层嵌套滚动 → 单层滚动 + 预览 sticky（`SettingsPanel.svelte`）
- 目标：>1320 视窗下，**整面板单一滚动**，右侧预览 `position: sticky; top: 0` 跟随，编辑与预览同高区域对齐。
- 改动：`.settings-panel` 移除 `overflow:hidden` + `height: clamp(...) 锁高`；`.settings-section-content` 移除内层 `overflow-y:auto`，回退为页传给自然高度；`.settings-preview-column` 由 `overflow:hidden` → 跟随编辑器（内部 preview 模块保留自己的滚动）。
- ≤1320 已有自然流，保持 Hybrid 不动。
- 验收：1440 视口下编辑器整页滚动、预览列 sticky，不再出现并排 2 个滚动条。

### 6.2 L2 外观分区拆分
- 子菜单「外观与卡片」拆为两个二级：
  - **外观与卡片**：`BackgroundSettingsSection`（配色方案）+ `CardSettingsSection`（卡片展示），保持折叠结构。
  - **高级与视觉**：`AdvancedSettingsSection`（背景/尺寸/卡片表面）+ `CategoryDisplaySettingsSection`（分类标题与图标）整体移入，作为独立菜单项（抽屉或标签页）。
- 目的：单分区内容 ≤ 1–1.5 屏，消除 3.5 屏内滚长表单。

### 6.3 L4 预览联动
- `SettingsHomePreview` 暴露「当前编辑项聚焦」回调；编辑某分区时在预览对应区块添加高亮描边（如 `outline`/`box-shadow`）。
- 预览列启用 `scroll-behavior` 或变更抬起；不做首屏动画。

### 6.4 L5 栅格基准（`NavigationSettingsSection`）
- 上 2 列（显示位置 / 始终展开）与下 4 列（最大宽度 / 左右 /上/底边距）统一为 12 列栅格基准（沿用 `.settings-grid`），对齐标签高度与控件宽度。
- 数值控件呈现统一：`InputGroup` 数值区与 `Slider` 数值颜色一致（均走 `--sp-accent` 加粗），消除不一致。
- 收紧「分类导航 + 内容区域」分组底部空白。

### 6.5 L6 样式/脚本（`FooterSettingsSection`）
- `footer_html` / `custom_css` / `custom_js` 三栏高差异化？建议：`footer` 4 行、CSS 7 行、JS 7 行保持，仅加语言徽标标签（HTML/CSS/JS）或折叠说明。低优先。

---

## 7. 主题与明暗（`theme-factory` Modern Minimalist 落地）

- 后台明暗遵循 theme 的 Modern Minimalist：灰度底 + 单一蓝强调（浅 `#2563eb` / 暗 `#7dd3fc`），不引入第二强调色。
- 新增：`App`/`admin` 层加 `html { color-scheme: light }`、`html[data-theme=dark] { color-scheme: dark }`（修复滚动条/原生 select）。
- `index.html` `<meta name="theme-color">` 改为随 `data-theme` 动态（见 App 状态更新）——浅 `#f8fafc`、暗 `#0a0f1a`。
- 暗色层级梯度实现为 3.3 节值表。

---

## 8. 验收标准

### L0（每次必跑，改动后）
```bash
npm run type-check
npm run build
npm run test
git diff --cached --check   # 暂存前
```
对照项目 CONTRIBUTING.md §4，纯样式/布局改动仍应跑起 L0；纯文档改动才豁免。

### L1（浏览器冒烟，回归受影响路径）
以 `real-chrome-cdp-testing` 流程在本地隔离 Chrome（`npm run dev` + `--var`）逐项验证：

- 后台分类/书签/分析/设置/备份 五 tab 在 1440 宽下无水平溢出。
- **设置页**：6 个二级菜单可切换；外观与卡片拆分后各自 ≤2 屏；无 3 层滚动（整页单滚，预览 sticky）。
- 暗色模式：卡片/边框亮度差可见；`color-scheme` 生效（滚动条/select 变暗）。
- 键盘：Tab 顺序完整，焦点环出现在 `:focus-visible` 处且可辨识；BackupPanel 树选择可见焦点。
- 对比：占位符/徽标/危险色 ≥4.5（用整页色板抽检）。
- 无障碍：分类/书签搜索框有可访问名；skip-link 可将焦点跳到主内容。

### L2（截图对比人检）
- 前后各 tab 截图对照（重点：外观展开、布局与导航、分类列表明暗）。
- AE-前端三法：整体感、对齐、暗色层极。

---

## 9. 分阶段实施计划

| 阶段 | 内容 | 文件清单（建议） | 验收 |
|---|---|---|---|
| P0-1 | 对比度 + token 漂移 | `Admin.svelte`（token 值）、`adminListPanels.css`、`app.css`（color-scheme）、`index.html`（theme-color 动态） | L0 + 对比度抽检 |
| P0-2 | 组件标志 → focus-visible（等 × 0 处） | `LoginModal` `PasswordChangePanel` `BookmarkBaseFields` `CustomIconField` `IconifySelector` `ColorAlphaInput` `ThemeBackgroundCard` `CategoryTreeSelect` `AdminSidebar` | L0 + 键盘冒烟 |
| P1-1 | 外观拆分 + 单滚动 + 预览联动 | `SettingsPanel.svelte` + `settings/*` | L1 + 截图 |
| P1-2 | 去卡片-阴影，圆角 scale，hover 收敛 | `admin/` 样式、`AdminPageHeader`、`AdminSidebar` | 截图比对 |
| P2 | skip-link、搜索 aria、小差栅格、textarea 差异 | prefix 各组件 | L1 补漏 |

> **每个阶段一个提交**，按 CONTRIBUTING.md 分支在 develop 上独立进行；不把多个阶段叠在一个 commit（避免 `docs/BACKLOG.md` 等决策文档交叉归属）。

---

## 10. 风险与边界

- 页引发 color-scheme 会改变原生滚动条外观（滚动区域颜色），需在 L1 验收视觉。
- 暗色卡片改不透（`#131a2e`）会改变毛玻璃玻璃透出背景的观感，需 `BackgroundSettingsSection` 用户自定义主题以封面验证（当前 mockup 采用不透）透视简单，但为玻璃预设，需保留 `--card-background-opacity` 作用域（background 预设仍在；面板与卡片表面差异为两层）。
- 本文档不授权提交/部署/合并 `main`。
- 若改动期间仓库工作树包含他人/未提交改动（当前 develop 已有 Admin Recovery 相关未提交工作），整理前先确认隔离，避免 diff 混入。

---

*文档结尾：此开发文档与审计报告一同留存桌面；如需入库到 `docs/plans/`，请告知，我按仓库状态与提交纪律处理。*