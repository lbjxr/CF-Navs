> **STATUS: 已完成**（判定于 2026-10-15）——REQ-16 已发版（CHANGELOG），分类标题颜色已实现。

# REQ-16 开发文档：分类标题字体颜色自定义（Issue #31 第 1 点）

> 配套需求：`docs/plans/ISSUE_31_CATEGORY_VISUAL_AND_HOT_AGGREGATION_REQUIREMENTS.md`（REQ-16 节；验收/风险/已裁定决策以需求文档为准）。
> 本文件是**实现契约**：数据模型扩展、消费链路、设置 UI、改动文件清单、分阶段落地顺序与验证门。
> 基线：`develop` @ `9dbd913`（2026-10-11）；行号可能漂移，以符号名为准。
> §4 各 OQ 已裁定（见需求文档），本文不重开产品决策；开工仍需维护者显式批准。

## 0. 交付范围一句话

后台新增「一级分类标题颜色 / 二级分类标题颜色」两项全局视觉设置；非空时首页、全页搜索分组、设置预览的对应层级标题按该色渲染，空值跟随主题（`--home-text-color`），刷新后保持。

## 1. 关键实现决策

**DEV-16-A：颜色作为 `CategoryDisplaySetting` 的新子字段，不新增顶层设置键。**

理由：`category_display` 已是完整贯通的公开设置键——已在 `SETTINGS_KEYS`（`shared/settings.ts:81`）、`PUBLIC_SETTINGS_KEYS`（`:112`）、`toPublicSettings`（`:151`）、Worker PUT 归一化（`worker/routes/settings.ts:186` 调 `normalizeCategoryDisplaySetting`）、表单 clone/create/normalize（`src/lib/settingsForm.ts:83,125,231,311`）里统一流转。把两个颜色字段并入该对象，**复用全部已有链路**，把需求 §2「设置新字段必须贯通的链路」的遗漏风险降到最低；若另开两个顶层键，则要同步 8 处以上、极易漏改。

新增字段（`string`，空串 = 跟随主题）：
- `CategoryDisplaySetting.root_title_color`
- `CategoryDisplaySetting.child_title_color`

与 OQ-16.1（按层级全局，不做每分类覆盖）、OQ-16.3（单值 + 空值跟随主题）、OQ-16.4（独立于 `card_text_color`，允许 alpha，复用 `ColorAlphaInput`）、OQ-16.5（沿用现有「字符串+长度」弱校验）一致。

## 2. 改动文件清单

### 2.1 数据层（阶段 1）

| 文件 | 改动 | 关键契约 |
| --- | --- | --- |
| `shared/types.ts` | `CategoryDisplaySetting`（`:118-123`）追加 `root_title_color: string`、`child_title_color: string` | 字符串，空串表示「未设置/跟随主题」 |
| `shared/settings.ts` | `CATEGORY_DISPLAY_DEFAULTS`（`:3-8`）两色默认 `''`；`normalizeCategoryDisplaySetting`（`:22-32`）追加两色归一化：非字符串 → `''`，否则 `trim()` 并按 `CATEGORY_TITLE_COLOR_MAX`（新常量，建议 32）截断 | 颜色走**字符串归一化**，不走 `normalizeInteger`；归一化即校验（OQ-16.5） |
| `worker/lib/settingsData.ts` | `DEFAULT_SETTINGS.category_display` 字面补两色 `''`；`settingsFromRawMap` 已调 `normalizeCategoryDisplaySetting`，自动继承颜色归一化（无需另加分支） | 旧库 D1 中缺两色 → 归一化回退 `''`（向后兼容） |
| `schema.sql` | 第 `79` 行 `category_display` seed JSON 补 `"root_title_color":"","child_title_color":""` | 新库 seed 与 `DEFAULT_SETTINGS` 对齐 |

**显式不改**（已贯通，改了反而制造双写）：`SETTINGS_KEYS` / `PUBLIC_SETTINGS_KEYS` / `toPublicSettings` / `worker/routes/settings.ts` 的 PUT 校验分支（`category_display` 已由 `:186` 统一归一化，颜色随对象一并校验/落库，**不新增顶层 `badRequest` 分支**）/ `worker/lib/settingsLimits.ts`（长度在 `normalizeCategoryDisplaySetting` 内截断，不进 `findSettingsLengthError` 顶层表）。

### 2.2 消费层（阶段 2）

| 文件 | 改动 |
| --- | --- |
| `src/views/Home.svelte` | `homeShellStyle`（`:156-169`）在非空时追加 `--category-root-title-color: <root_title_color>`、`--category-child-title-color: <child_title_color>`（空值不输出该行，沿用 `cardTextColor` 的 `? : ''` + `filter(Boolean)` 写法）；派生源 `categoryDisplay`（`:150`）已含两色 |
| `src/components/CategorySection.svelte` | 一级标题 `h3`（`:254-307`）`color` 由 `level` 取 `var(--category-root-title-color, var(--home-text-color))` / `var(--category-child-title-color, var(--home-text-color))`；只改 `color`，不动字号/图标/徽标 |
| `src/components/HomeCategoryScope.svelte` | 一级标题（`:350-355`）与二级 tab 文字（`:503-506`）`color` 同上按层级取变量，fallback `--home-text-color`；激活/焦点仍用 `--home-accent-color`（OQ-16.2） |
| `src/components/settings/SettingsHomePreview.svelte` | ① 注入两个颜色变量（对齐 `:68-79` 现有 `--category-*-base` 注入）；② `previewSections`（`:12-16`）补一个带**二级子分类样本**的根，使一级/二级颜色差异在预览可见（当前预览无二级样本，是需求 §2 记录的已知缺口） |

**显式不改**（OQ-16.2 裁定首版不覆盖）：`Sidebar.svelte` 导航、计数徽标、空态文案、操作按钮、`SearchSpotlight.svelte`、卡片标题/描述色（`card_text_color` / `--card-title-color` / `--card-description-color` 保持原样）、accent 相关。全页搜索分组标题由 `CategorySection level={2}` 复用，随 2.2 自动覆盖，无需单独改。

### 2.3 设置 UI（阶段 3）

| 文件 | 改动 |
| --- | --- |
| `src/components/settings/CategoryDisplaySettingsSection.svelte` | 现有一级/二级字号+图标滑块下方，新增两个 `ColorAlphaInput`：「一级分类标题颜色」「二级分类标题颜色」，`bind` 到 `form.category_display.root_title_color` / `.child_title_color`；每个控件有可访问名称 + 「清空（跟随主题）」入口（置 `''`） |
| `src/lib/settingsForm.ts` | 多数自动继承（`emptySettingsForm` `{...CATEGORY_DISPLAY_DEFAULTS}`、clone `{...source.category_display}`、normalize `normalizeCategoryDisplaySetting`）；仅需确认 `SettingsFormValue`（`appData.ts`）的 `category_display` 类型含两色（由 `CategoryDisplaySetting` 推导，通常零改动，type-check 兜底） |

### 2.4 文档（阶段 4）

`docs/reference/API_CONTRACT.md`：`category_display` 字段说明补两色子字段（字符串、空=跟随主题、长度上限）。`docs/BACKLOG.md` §5 REQ-16 转状态、`CHANGELOG.md` 回写。

## 3. 新符号契约

```ts
// shared/settings.ts
export const CATEGORY_TITLE_COLOR_MAX = 32 // CSS 颜色串安全上限（hex/rgb/rgba/named 均 < 32）

export interface CategoryDisplaySetting {
  root_font_size: number
  root_icon_size: number
  child_font_size: number
  child_icon_size: number
  root_title_color: string   // '' = 跟随主题
  child_title_color: string  // '' = 跟随主题
}
```

`normalizeCategoryDisplaySetting` 两色分支：
```ts
root_title_color: typeof source.root_title_color === 'string'
  ? source.root_title_color.trim().slice(0, CATEGORY_TITLE_COLOR_MAX)
  : '',
// child_title_color 同
```

## 4. 分阶段实施与验证门

| 阶段 | 内容 | 验证门 |
| --- | --- | --- |
| **1 数据层** | type + defaults + normalize + seed + Worker default | L0；新增单测：`normalizeCategoryDisplaySetting` 两色（非字符串→`''`、trim、超长截断、合法透传）、`toPublicSettings` 带两色、旧库缺字段回退 `''`（扩充 `tests/unit/settingsData.test.ts` / `settingsForm.test.ts`） |
| **2 消费层** | Home 变量 + CategorySection + HomeCategoryScope + 预览注入 | L0；断言 Home `homeShellStyle` 空值不输出颜色行、非空输出；CategorySection/HomeCategoryScope 标题 `color` 用对应变量且 fallback 为 `--home-text-color`（源码/jsdom 断言，参考 `homeResponsiveLayout.test.ts` 的变量断言手法） |
| **3 设置 UI + 预览** | 两个 `ColorAlphaInput` + 预览二级样本 | L0：`CategoryDisplaySettingsSection` 控件渲染/绑定/清空回退、`adminSettingsLayout.test.ts` 归属扩充；**L2 真机**：改一级/二级色 → 首页标题、全页搜索分组、预览同步；清空 → 回主题色；亮/暗切换对比度人工确认 |
| **4 收尾** | API_CONTRACT / BACKLOG / CHANGELOG | 链接可达；L0 全绿 |

每阶段独立提交。

## 5. 测试计划

### 5.1 单元（jsdom / 纯函数）
- `normalizeCategoryDisplaySetting`：两色非字符串回退 `''`、trim、超 `CATEGORY_TITLE_COLOR_MAX` 截断、合法 `#rrggbb`/`rgba()` 透传；既有四个尺寸断言不回归。
- `toPublicSettings` / `settingsFromRawMap`：公开投影含两色；旧 JSON 缺两色 → `''`。
- 表单：`emptySettingsForm`/clone/`normalizeSettingsForm` 带两色往返一致；清空（`''`）保存不被改写成默认非空。
- 消费：Home 变量输出条件；CategorySection/HomeCategoryScope 标题 `color` 变量与 fallback。
- 控件：`CategoryDisplaySettingsSection` 两 `ColorAlphaInput` 存在、绑定正确、清空置 `''`。

### 5.2 L2（真实 Chrome，`real-chrome-cdp-testing`）
隔离临时 Chrome + 精确 profile 清理。场景：设一级色 A、二级色 B → 首页一级标题=A、二级 tab/二级分组标题=B；全页搜索分组标题按层级着色；设置预览二级样本显示差异；清空 → 回 `--home-text-color`；浅/深主题各截图确认对比度与可读性；控制台/页面异常/4xx-5xx 为 0。设置改动仅在**本地临时库**或授权测试站的 Tier 1 还原流程进行。

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| R16-1 单固定色在深/浅主题下对比度失效 | 空值跟随主题；L2 两主题人工对比度确认；不强制自动对比（OQ-16.3 单值） |
| R16-2 链路遗漏 | DEV-16-A 复用 `category_display` 既有链路，改动面最小；阶段 1 单测锁 public 投影 + 旧库回退 |
| R16-3 颜色串注入/异常值 | `normalizeCategoryDisplaySetting` trim + 长度截断；非字符串回退 `''`；CSS 变量注入是值位置，非选择器，无 CSS 注入面 |
| 预览无二级样本导致二级色改了看不出 | 阶段 3 预览补二级子分类样本（需求 §2 已记录缺口） |

## 7. 实现陷阱（仓库特有，必须遵守）

- **Svelte 5 组件测试解析条件**：组件/`onMount` 行为测试依赖 `vite.config.ts` test 模式 `resolve.conditions:['browser']`（`CONTRIBUTING.md` §4）。观察不到行为先查解析条件与缺失浏览器 API，再下「jsdom 不行」结论。
- **写入后缩进自检**：本仓库 `write`/`edit` 可能把新/改文件缩进减半（JS/TS 不报错）。每次改后 `git diff --numstat`（只加几行却大量删行=缩进被重排）+ 前导空格宽度直方图应全偶（出现 1/3/5 即异常），异常按 `n→n*2` 修复复验。
- **颜色归一化单一出处**：颜色长度/类型在 `normalizeCategoryDisplaySetting` 内处理，**不要**在 `worker/routes/settings.ts` 另加顶层 `badRequest` 分支，也不要进 `settingsLimits` 顶层长度表——否则 `category_display` 出现两套校验。
- **只改 `color`**：消费层仅改标题 `color`，不动字号/图标/布局，避免回归 R-06 的尺寸契约测试。

## 8. 独立复核与提交安全门

- REQ-16 属**多文件 + 行为/公共视觉 + 数据契约**改动，阶段完成并直接自验后走独立 `workflow-reviewer`：输入原始目标、需求 §6 验收、实际 diff、L0/L2 证据；`PASS` 才交付。
- 每阶段独立提交（`feat:` 主题，本地条目无 Issue 则不带关闭关键字、成果记 `CHANGELOG.md`）。提交前过 `CONTRIBUTING.md` §7 / `AGENTS.md` 安全门：精确路径 `git add --`、`--name-only/--stat/--check`、完整暂存差异 + 敏感内容扫描、大文件门、分支/身份/远端分叉检查。
- 开工与提交推送均需维护者在当轮显式授权；默认只留本地 worktree。

## 9. 完成定义（DoD）

1. §2 清单落地，§4 四阶段门逐项通过；
2. 需求 §6 验收 A16-1~A16-5 达成或显式豁免；
3. L2 两主题截图 + 控制台/网络无异常记录；
4. API_CONTRACT / BACKLOG（§5 转状态）/ CHANGELOG 回写；
5. 无新增顶层设置键、无与既有颜色字段并行的第二套校验、无 R-06 尺寸契约回归。
