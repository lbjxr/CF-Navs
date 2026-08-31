# 变更记录

## 2026-08-31（分类树滚动验收）
### 移动端排序分类树滚动穿透修复

- 分类树菜单增加 `overscroll-behavior: contain`、`touch-action: pan-y` 和 iOS 惯性滚动支持，阻止触摸滚动链穿透到首页书签列表。
- 分类树所属书签卡片在菜单打开时提升 stacking context（`z-index: 130`），高于首页排序浮窗，确保树内鼠标/触摸命中并可滚动。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；真实 CDP 鼠标滚轮验证分类树 `treeScrollTop=300`、页面 `windowScrollY=0`；截图确认后续分类项可见、排序浮窗不遮挡；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第五轮验收反馈）
### 部署后验收反馈修复（第五轮）

- 修复移动端长按打开菜单/编辑弹窗后页面偶发无法点击：改用基于时间戳的触摸守卫（`withinTouchGuard`，700ms），长按后随即触发的合成 click 被忽略，不再关闭刚打开的菜单，也不会残留状态吞掉后续点击；移除易卡死的 `suppressNextClick` 标志与全局捕获监听。
- 恢复 PC 侧栏当前锚点的突出色：`.toc-item.active .toc-slip` 使用 `--toc-accent`（主题强调色）并铺满宽度，收缩态可清晰指示当前分类；亮色模式非当前项标记由深灰改为乳白（`rgba(248, 250, 252, 0.9)`）。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；spawned headless Chrome：390px 长按弹菜单→编辑→关闭后分类切换正常、二次长按仍生效（menuOpenAfterLongPress/modalOpen/modalGone/tabActive/secondMenuOpen 全 true）；1440px 亮色收缩侧栏当前项 slip `rgb(37,99,235)` 强调、其余 `rgba(248,250,252,0.9)` 乳白；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第四轮验收反馈）
### 部署后验收反馈修复（第四轮）

- 移动端批量浮层不再遮挡分页：改为在 `.admin-panel-footer` 上追加 104px 底部间距，浮层固定于底部导航上方，分页按钮完整可见。
- 恢复 PC 收缩侧栏的圆柱（slip）标记：`.toc-slip` 默认恢复 `--toc-slip` 底色；仅在展开态隐藏非当前项标记，收缩态所有分类保留圆柱指示。
- 长按弹出的操作菜单改为锚定在卡片下方（`top: calc(100% - 6px)`）并与卡片同宽（`left: 8px; right: 8px`），不再覆盖卡片标题，也不会在左列卡片时向左溢出屏幕。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；spawned headless Chrome 截图视觉审计（390px 批量浮层不遮挡分页、长按菜单在卡片下方不遮标题、亮色移动端抽屉当前项标记、PC 亮色收缩侧栏圆柱标记全显）；console errors/page exceptions/failed requests 均为 0。

## 2026-08-31（第三轮验收反馈）
### 部署后验收反馈修复（第三轮）

- 移动端书签批量浮层压缩高度与留白：字号 12px、按钮 padding 6/10、浮层 padding 8/10，避免遮挡分页按钮。
- 移动端批量选中时列表底部空白修复：`≤700px` 下 `.admin-bookmark-list-panel` 改 `height:auto`、内容和滚动容器 `overflow:visible`，仅保留 `has-batch-selection` 的 84px 底部让位。
- PC/移动端新增书签、排序按钮改用语义化 SVG（书签加号、上下双向箭头）。
- 书签“移动到分类”文案与入口统一改为“移动”。
- 暗色模式下首页“本分类”与二级分类标签文字改为跟随 `--home-text-color`（白色），不再显示黑色。
- 移动端亮色侧边导航去除默认灰色蒙版（`.toc-slip` 默认透明），仅当前锚点分类显示灰色标记。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过；relay Chrome 390px/1440px 复核浮层不遮挡分页、无底部空白、图标/文案/暗色标题/侧栏锚点标记均正确，console errors/page exceptions/failed requests 均为 0。

## 2026-08-31
### 部署后验收反馈修复（第二轮）

- 移动端书签卡片移除常驻三点按钮，普通态仅保留长按/右键编辑；仅排序模式显示“移动到分类”入口，并换用移动图标区分。
- 首页排序浮窗显示时，回到顶部按钮上移避让，PC/移动端不再重叠。
- 新建子分类按钮改用文件夹加号图标，与新增书签图标区分。
- 后台批量操作工具栏移出书签列表容器，改为固定浮层：PC 居中、移动端置于底部导航上方，列表不再被挤压出滚动条或空白。
- PC 二级分类标签保留滚轮与横向滚动条访问完整列表（移除失效的 12rem 预留 padding）。
- 分类标题字体与图标卡片保持在“外观与卡片 → 高级设置”内。
- 移动端导出按钮改为随“导入数据”卡片上方的正常流式全宽布局，取消全屏悬浮固定定位。
- 验证：`npm test` 100 files / 672 passed；`npm run type-check` 0 errors/0 warnings；`npm run build` 成功；`git diff --check` 通过。

## 2026-08-30
### 部署后验收反馈修复

- 移动端默认隐藏“移动到分类”菜单项，进入首页排序模式后才开放移动入口。
- 移动端首页排序浮窗改为左右安全区自适应，说明单独一行，取消/保存按钮第二行并排显示。
- 新建子分类入口补充可见加号图标；PC/移动端后台批量操作工具栏与书签滚动列表分离，并避开移动端底部导航。
- 分类标题字体与图标设置移入“外观与卡片 → 高级设置”；PC 二级分类标签支持滚轮和横向滚动条访问完整列表。
- 移动端导出 CTA 上移至后台底部导航上方并预留安全空间。
- 验证：定向测试 37/37、`npm run type-check` 0 errors/0 warnings、`npm run build` 成功、701px/700px 断点浏览器回归通过，Console errors/page exceptions/failed requests 均为 0。
### Open Issue R-01～R-07 实现与 R-08 核对

- 首页支持一级到二级及空分类目标的跨分类排序；移动端提供“移动到分类”菜单，排序仍使用本地草稿、完整分类顺序和冲突恢复。
- 首页新增管理员可见的新建子分类/新增主分类入口；子分类预填当前一级，主分类默认无上级，成功后回首页定位并高亮新分类。
- 编辑书签分类树打开时自动展开父级、滚动并高亮当前分类；不可用分类显示明确状态且不静默改值。
- 后台新增 `POST /api/bookmarks/batch-move`，支持跨页选择、追加末尾/插入顶部、原子归属与排序更新、快照冲突 `1006`，并提供 PC/移动端批量工具栏。
- 设置页新增按层级的分类字号/图标尺寸设置，移动端统一 0.88 派生；详情卡片宽度下限调整为 44 px，44–80 px 显示提示，极简风格宽度控件置灰。
- R-08 未重复实现导出数据逻辑；已核对二级父分类补全、下载计数、replace/merge 和 PC/移动端布局，部署版本与原作者预期仍待同步。
- 验证：`npm test` 99 files / 666 passed；`npm run type-check` 0 errors / 0 warnings；`npm run build` 成功；干净临时 D1 API 冒烟 75/75；独立临时 Chrome 回归 25/25，console errors、page exceptions、failed requests 均为 0。


### Issue #8 功能建议落地

- 部分导出备份：管理员可按分类树选择导出范围，支持父子分类联动、必需父分类补入、settings 开关、全选/清空和空选择保护；导出文件继续兼容现有 `BackupData` 与导入流程。
- 顶部导航分行：新增顶部导航排布设置，桌面/宽屏支持多行换行，移动端 ≤799px 保持单行横向滑动；导航高度变化自动调整首页留白，二级菜单定位保持可用。
- 顶部操作按钮：主题切换、设置、退出按钮在顶部导航模式下与首行对齐，并在重叠场景浮于导航栏上方；移动端预留可滚动轨道空间，避免遮挡分类。
- 设置页 UI/UX：新增统一 Switch、Tooltip、InputGroup、Slider 基础组件；完成站点、首页显示、外观/卡片、布局/导航和搜索设置分区的控件、文案、联动与布局改造；浅色/深色背景改为内部 Tab。
- 验证：`npm run type-check`、`npx vitest run`（95 files / 649 passed）、`npm run build`、`git diff --check` 均通过；`scripts/smoke-test.mjs` 已按当前分类排序与导入重编号契约修正，API 冒烟 **75/75 全部通过**；`scripts/chrome-regression.mjs` 真实浏览器回归 25/25 全部通过（无控制台错误、页面异常与失败请求）；另用隔离 headless Chrome + CDP 完成桌面、移动断点、导出下载与导入验证。

### 设置页布局与提示修复

- 二级设置菜单改为顶部水平导航，桌面、平板和移动端分别使用 6、3、2 列布局，释放参数编辑区横向空间。
- Tooltip 气泡挂载到页面顶层并按视口定位，滚动或缩放时自动校准，避免被设置面板裁切；保留悬停、聚焦、点按、互斥及关闭交互。
- 验证：`npm run type-check` 0 errors / 0 warnings；`npm test` 96 files / 655 passed；`npm run build` 成功；隔离 Chrome 覆盖六个设置分区、桌面/移动端布局、Tooltip 视口边界、滚动、互斥及关闭行为，未发现控制台或网络错误。


### 设置页详情卡片高度与滚动边界

- 设置详情卡片在桌面宽度（>1320px）按后台可用高度自适应，使用 `calc(100dvh - 180px)` 并保留 `560px` 最小值与 `960px` 最大值；计算中预留设置包装器底部 `24px` 间距，避免撑出外层滚动区域。
- 设置内容区继续在 `.settings-section-content` 内滚动；≤1320px 切换为单列自然高度，避免固定高度与窄屏页面滚动竞争。

## 2026-08-29

### PR #7 功能集成


感谢 @Helenvin 提交以下核心功能：

- 私密书签和私密分类：未登录访客不会收到受限数据，分类隐私会沿祖先链生效。
- 首页跨分类拖拽排序：管理员可以移动书签分类并统一保存归属和顺序。
- Chrome / Edge 浏览器书签单向同步：新增网页书签同步到“浏览器新增收藏”分类。

该功能经过代码审计、安全修复和回归验证后，以干净的 squash 方式集成到 `develop`，随后进入 `main`。由于原 PR 历史包含旧的主分支合并记录及不适合发布的截图，没有直接使用 GitHub 的原始 PR 合并历史；贡献者署名保留在集成提交和 PR 记录中。

审计期间补充的修复包括浏览器同步 CORS、分类私密标记导入、D1 批量排序、过期排序状态恢复、私密书签点击计数保护、默认 favicon.im 图标以及导入参数边界处理。

### Issue #8

修复 Chrome 展开子分类后左侧导航出现白色原生滚动条的问题。侧边栏仍支持滚轮、触控板、触摸和键盘滚动，仅隐藏原生滚动条显示。

Issue #8 正文中提出的部分导出备份和顶部导航分行显示属于独立功能建议，不包含在本次修复中。
