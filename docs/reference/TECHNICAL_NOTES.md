# CF-Navs 技术细节

本文档收纳 README 中不适合放在首页的实现细节，方便需要维护或调优项目时查阅。

## 图标处理

CF-Navs 支持多种图标来源：

- Favicon.im
- Google favicon
- Iconify
- 自定义 HTTP(S) 图标 URL
- 自定义文字或表情
- 基于完整书签标题生成的本地 SVG 文字图标，长标题按字符宽度自动换行到最多 4 行

新增或编辑书签时，普通 HTTP(S) 图标会通过刷新接口写入书签图标缓存。刷新接口使用短超时抓取外站图标，避免保存流程被慢速 favicon 服务长时间阻塞；抓取失败时保留已有 `icon_blob`，没有缓存则返回 `null`。首页普通渲染优先使用聚合接口返回的 `icon_blob`，只有聚合数据没有可用图标时才读取浏览器本地图标缓存；两者都缺失时再回退到已保存的普通 HTTP(S) 图标 URL，避免可直连的 favicon 保存后变成文字图标。后台列表仍可使用同源图标代理作为管理预览入口。

相关接口：

- `POST /api/bookmarks/:id/icon-cache/refresh`
- `GET /api/icon/:id`
- `GET /api/category-icon/:id`
- `GET /api/iconify/:set/:name.svg`

`/api/icon/:id` 主要保留为后台预览、兼容和兜底代理。它会优先读取 Cloudflare edge cache 和 D1 中的 `icon_blob`，cache miss 时再尝试抓取外站图标。首页普通书签卡片不会把 `/api/icon/:id` 按书签数量挂到 `<img>` 上；它优先使用聚合 `icon_blob`，再读本地图标缓存，缺失时直接回退已保存的 HTTP(S) 图标 URL，原始 URL 也加载失败后才显示文字 fallback。分类图标和 Iconify 图标失败时会返回短 TTL 的临时 SVG fallback。

图标相关 worker 逻辑按职责拆分：

- `worker/routes/icon.ts`：Hono 路由和请求编排。
- `worker/lib/iconResponses.ts`：通用图标响应、fallback SVG 和 edge cache 写入。
- `worker/lib/iconifySearch.ts`：Iconify 查询归一化、搜索 API、候选检查、排序和代理缓存预热。
- `worker/lib/svgColor.ts`：SVG 文本提取和颜色识别。

## Iconify 规范化

Iconify 图标会统一保存为：

```text
https://api.iconify.design/{set}/{name}.svg
```

前端展示和预览时会规范化为同源代理：

```text
/api/iconify/{set}/{name}.svg
```

新增、编辑和 Sun-Panel 导入会识别以下形式：

- `mdi:home`
- `simple-icons:github`
- `iconify:...`
- `@iconify-json/*`
- `@iconify-icons/*`
- `https://icon-sets.iconify.design/...`

新增/编辑弹窗和后台预览会使用同源 `/api/iconify/*` 代理，便于 Cloudflare edge cache 和同源 Service Worker 缓存复用同一份图标资源。首页展示持久化 Iconify 图标时可直接使用 `https://api.iconify.design/*.svg`，依赖浏览器 HTTP 缓存复用，避免把每个 Iconify 书签都变成 Worker 请求。Service Worker 不持久化跨域 `opaque` 响应，避免小 SVG 在 Cache Storage 中被浏览器按大配额填充。

## 描述显示策略

全局设置 `card_description_mode` 是描述展示的权威值（`always`、`hover`、`hidden`）；`card_show_description` 仅作为旧客户端兼容字段派生输出。书签的 `description_mode` 为可空覆盖值，`NULL` 表示跟随全局。描述模式解析位于 `src/lib/descriptionMode.ts`。

详情卡片的悬停模式不渲染内联描述，因此标题布局与隐藏模式一致；悬停或键盘聚焦时通过卡片的 `data-tooltip` 和 `::after` 在卡片上方显示提示。详情与极简卡片共用 `src/components/bookmarkCardTooltip.css`，统一定位、层级、动画、触屏隐藏和减少动态效果行为。

## 管理批量操作与字段排序

批量删除接口使用单次 D1 batch，服务端限制 500 个正整数 ID 并按幂等方式忽略不存在的记录。后台字段排序只作用于前端展示：先按原始顺序过滤，再对完整搜索结果排序，最后分页，不写入书签 `sort` 字段，也不使用浏览器持久化存储。

## 浏览器书签导入

标准 Netscape Bookmark HTML 在浏览器内转换为共享 `ImportReq`。只导入 HTTP(S) 链接，忽略导出文件第一层 H3 容器，从第二层开始映射为独立分类，嵌套分类使用“父级 / 子级”完整路径命名；容器或根目录直属书签进入“浏览器书签”。合并模式由 Worker 生成完整目标数据后复用覆盖式事务重建，因而不会留下半次导入状态。

## 首页数据读取

公开首页优先请求：

```text
GET /api/public/data
```

该接口返回首页实际需要的轻量 settings、分类和书签字段。未携带 no-cache 指令的匿名访问可以命中 Cloudflare edge cache；公开模式关闭时，匿名响应会携带轻量站点配置，供登录页展示使用。

如果浏览器里已有公开或后台聚合数据快照，启动时会先请求轻量版本接口：

```text
GET /api/data/version
```

版本相同则继续使用本地快照，不再拉完整聚合数据；版本不同或本地没有可用快照时，才请求 `/api/public/data` 或 `/api/admin/data`。这样手动刷新和首次打开都会做一次远端确认，但常见的“数据未变化”路径只消耗一次轻量请求。

后台进入或首页管理操作需要完整数据时，再请求：

```text
GET /api/admin/data
```

后台聚合接口一次返回分类、书签和完整设置。前端会按当前登录态写入浏览器本地快照，刷新页面时可以先用快照恢复界面，但不会因此短路版本确认。当前不做 focus、visibility 或定时轮询；只有启动/手动刷新这类重新初始化路径会做远端确认。

完整数据返回后，前端会按 `id` 对分类和书签做引用级合并：字段未变化的对象继续复用原引用，只替换新增、删除、排序变化或字段变化的项。settings 内容相同也复用原引用，避免完整拉取后造成无意义的页面抖动。

## 设置与数据写入

### settings 数据归一化

`worker/lib/settingsData.ts` 集中维护 settings 默认值、旧数据兼容和 JSON 行解析。`worker/lib/db.ts` 继续作为路由层使用的数据库入口，避免所有 route 直接依赖 settings 内部细节。

该模块负责：

- 补齐缺失 settings 字段，保证 API 返回完整 `Settings`。
- 规范化 `background_preset_id`，非法值回退到 `custom`。
- 兼容旧版单一 `background` 字段，并生成浅色/深色 `backgrounds`。
- 容错处理无法 JSON.parse 的旧 settings 值。

对应测试：`tests/unit/settingsData.test.ts`。

### 站点外观与主题

后台站点设置中的背景使用 `backgrounds.light` / `backgrounds.dark` 保存浅色和深色配置，并用 `background_preset_id` 记录当前背景方案。22 套内置方案（见 `src/lib/themePresets.ts`）分为 13 套 `glass` 毛玻璃渐变和 9 套 `flat` 护眼纯色，均会持久化为预设 ID。保存方案时会同步写入浅色/深色背景、遮罩参数、推荐的卡片背景透明度，并把首页标题色与卡片文字色留空以跟随当前主题；护眼纯色的浅色页底使用比近白色更明确的低饱和综合色相，例如「深海墨蓝」为 `#dbeaff`，卡片使用更浅的同色系 `#edf4ff`，强调色不随页底加深。用户继续手动修改浅色/深色背景后，界面会切换为 `custom`；缺少预设字段的数据只有在背景类型、值、模糊度和遮罩均完整匹配时才会识别为内置方案，显式保存的 `custom` 会保持自定义状态。

后台设置面板拆分为「站点信息、外观与卡片、布局与导航、搜索设置、页脚内容、账号安全」六个二级子菜单。左侧子菜单只负责切换当前展示区，表单状态、规范化、脏状态和保存流程仍由 `SettingsPanel` 统一持有；提交 payload 与子菜单顺序无关。「外观与卡片」默认只显示配色方案、卡片风格和描述策略，自定义方案会自动展开标题、背景、图床、尺寸和卡片表面参数。背景类型、值、模糊度或遮罩发生变化时，纯表单转换函数会把方案标记为 `custom`，标题字号与卡片尺寸等独立参数不会改写预设 ID。

设置工作区在宽屏中分为参数编辑和首页预览两列，窄屏时预览移动到参数之后。预览只接收规范化后的当前表单，使用固定的示例分类和书签，并复用 `HomeHeroSearch` 与 `BookmarkCard`；导航由无监听、无存储的预览表现层渲染。预览容器使用局部 `data-theme`、`data-background-preset` 和 `buildHomeBackground` 生成的 CSS 变量，浅色/深色切换不会修改文档根节点。预览内容通过 `inert` 禁止操作，不加载真实分类或书签数据，也不执行页脚 HTML、公开访问控制或保存副作用。

毛玻璃方案的书签卡片在背景之上使用 `blur(20px) saturate(160%)` 的半透明表面。亮色模式由用户卡片色按 `0.72 → 0.28` 的对角渐变叠加约 `0.4` 倍基底组成；深色模式不再用白色半透明底，而是以 `rgb(15 23 42)` 深色玻璃为基底（约 `0.55` 倍透明度）、叠加低透明度的用户色高光，让深色背景的彩色光斑透过模糊层可见。护眼纯色方案默认卡片透明度为 `0.9`，浅色模式使用与页底同色相但更浅的卡片色，深色模式由当前预设的 `darkCardBackgroundColor` 提供深色卡片表面；书签卡片、搜索框和分类导航都直接消费用户保存的 `card_background_opacity`。每套护眼预设分别定义亮暗标题与备注颜色，并用单元测试保证标题至少达到 `7:1`、备注至少达到 `4.5:1`；自定义 `card_text_color` 仍优先覆盖这些默认值。旧版护眼配置保存的白色卡片会在运行时映射到当前预设的新卡片色，用户手动设置的非白卡片色保持不变。

首页内容统计条、分类下的站点数量徽标、排序提示和空分类占位卡片使用首页级 CSS 变量继承当前主题与 `card_text_color`，避免固定灰色在渐变背景或深色模式下对比度不足。

前台分类导航支持 `navigation.position = left | top`。左侧模式在桌面保留悬停展开，可通过 `navigation.always_expanded` 开启固定占位；用户手动收缩偏好由浏览器版本化 `localStorage` 键持有，移动端和顶部模式不读取该偏好。顶部模式固定悬浮，最大宽度复用 `content_layout.max_width`，桌面溢出时提供箭头和鼠标拖动，移动端使用原生触摸横向滑动。各模式复用书签卡片的 `--card-bg-rgb` / `--card-bg-opacity` 玻璃背景变量，并通过 `data-theme='dark'` 覆盖暗色状态。

顶部拖动有两个必须保留的实现约束：DOM 的 `scrollLeft` 和拖动期样式通过局部元素引用修改，避免 Svelte 将绑定节点误判为引用变化并重新触发激活项自动滚动；`setPointerCapture` 只在超过拖动阈值后执行，普通分类点击不得提前捕获指针。顶部溢出状态由 `ResizeObserver` 在下一动画帧合并更新，组件销毁时同时释放 observer、animation frame、resize 定时器和点击抑制定时器。

设置保存、导入恢复和排序接口尽量减少 D1 statement 数：

- 后台完整 settings 保存使用批量 upsert。
- 导入恢复复用本次导入时已经规范化的分类和书签结果。
- 分类和书签排序使用分块 `UPDATE ... CASE id ... WHERE id IN (...)`。
- 新增和更新接口尽量用 `RETURNING` 返回写入后的行，减少写后再读。

写入成功后，前端优先使用接口返回值增量更新本地 store，而不是立即重新拉取全量公开数据。

## 缓存策略

Worker 和前端共同承担缓存：

- `/api/config` 和 `/api/public/data` 使用短 TTL edge cache。
- `/api/data/version` 始终 `no-store`，只读取轻量版本号和公开模式信息。
- 前端已有本地快照时优先请求 `/api/data/version`；版本不同才发送完整聚合请求。完整聚合请求默认发送 no-cache 指令，服务端收到后会跳过 `/api/config`、`/api/public/data` edge cache 和 `/api/admin/data` 运行时聚合缓存，用于保证手动刷新时跨设备可见。
- 设置保存、数据导入和管理端写入会主动失效相关缓存。
- `/assets/*` 构建产物设置一年 immutable 缓存。
- HTML 和 `sw.js` 使用 no-cache 重验证。
- Service Worker 预缓存 `/index.html` 作为离线导航回退。
- Service Worker 对同源图标代理和构建资源采用 cache-first 策略；跨域 Iconify SVG 只在响应可读且不超过 512KB 时写入 Cache Storage，不缓存 `opaque` 响应。

浏览器本地存储只保留必要副本：后台聚合数据快照会清理旧登录态对应的同源快照；后台书签列表已有 `icon_blob` 时直接展示并删除同 key 的本地图标副本，不在翻页预览时把 data URI 再复制到 `cf-navs-bookmark-icons-v1`。

部署新版后，如果浏览器仍使用旧逻辑，可以强制刷新一次页面，让新版 Service Worker 接管。

## 安装与部署边界

- `wrangler.toml` 保留不带真实 ID 的 `DB` D1 和 `SESSION` KV 声明，供 Cloudflare Git 引导流程自动创建并绑定资源；本地 CLI 的真实 ID 写入 Git 忽略的 `wrangler.local.toml`。
- `schema.sql` 通过 Wrangler `Text` 模块规则打包，供 `/install` 首次安装时执行。
- Cloudflare Git 和 Wrangler CLI 全新安装都只要求一个加密 `SETUP_TOKEN`。用户部署后访问 `/install`，`POST /api/install` 校验令牌后由安装器初始化 schema 并创建管理员；公开的 `GET /api/install/status` 不要求令牌。
- 确认安装成功后建议删除或轮换 `SETUP_TOKEN`。已安装判定来自 D1 中的管理员凭据和完成标记，删除 Secret 不影响运行；即使保留，后续安装请求也会被永久拒绝。
- `INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 与 `RESET_ADMIN_CREDENTIALS` 仅保留给旧数据库升级和凭据恢复，不是任何全新部署的正常入口。
- 正常流程不要求 Cloudflare API Token、GitHub Actions 或手动 SQL；D1 SQL Console 执行 `schema.sql` 只用于安装器失败后的恢复。

## 登录与会话

- 管理员密码使用 WebCrypto PBKDF2 哈希存储。
- Session token 随机生成并写入 KV。
- 登录限流复用同一次请求已读取的 KV 状态。
- Worker 认证中间件会在单个 isolate 内短时复用已验证 session，减少后台连续操作时的 KV 读取。
- 前端 API 客户端会在内存中复用已解析的有效登录态，并监听跨标签页 storage 变更。

## 安全响应头与自定义 HTML

Worker 对 HTML 响应设置基础安全头：

- `Content-Security-Policy`：脚本仅允许同源构建产物，禁止内联脚本、事件处理器、插件对象和被第三方页面嵌入。
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` 关闭摄像头、麦克风和地理位置权限。

后台的自定义页脚通过 `footer_html` 渲染到首页底部。该字段用于可信管理员自定义少量展示 HTML；CSP 会保留必要的内联样式能力，但不会允许 `<script>` 或 `onerror` / `onclick` 等内联事件处理器执行。不要把不可信用户提交的内容写入 `footer_html`。

## 前端性能策略

- 首页主包、登录弹窗、后台管理和书签编辑弹窗按需分包。
- 首页展示层进一步拆为 `HomeFloatingActions.svelte` 与 `HomeHeroSearch.svelte`，Home 视图只保留搜索过滤、滚动高亮和分类渲染编排。
- 后台分类/书签列表拆为独立面板组件，Admin 视图只保留 tab、弹窗和设置/备份编排。
- 书签卡片的图标、右键菜单和当前页弹层拆为独立组件，父组件集中维护图标状态和打开方式。
- 书签编辑弹窗的图标候选区、自定义图标输入和预览拆为独立组件，父组件集中维护表单和 Iconify 搜索状态。
- 未登录用户点击管理入口时只加载轻量登录弹窗。
- 首页搜索会预计算书签索引，数据变化时才重建。
- 滚动高亮使用缓存的分区 DOM 和 `IntersectionObserver`，不支持时才回退到节流后的布局读取。
- 分类分区使用 `content-visibility: auto` 降低离屏渲染成本。
- 首页图标使用共享 `IntersectionObserver` 接近视口后才设置图片 `src`，并继续启用浏览器原生懒加载和异步解码。
- 前台主题快速切换只写浏览器本地偏好，不触发 Worker 请求。

## Sun-Panel 导入相关

Sun-Panel 导入会转换分类、书签、打开方式和图标字段。Iconify 图标会尽量规范化为 CF-Navs 的标准保存格式；后台预览使用 `/api/iconify/*` 代理，首页展示优先复用浏览器本地缓存的 Iconify SVG。

更完整的迁移步骤见 [SUNPANEL_IMPORT.md](../guides/SUNPANEL_IMPORT.md)。
