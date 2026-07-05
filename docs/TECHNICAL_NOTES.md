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

### 站点外观与主题

后台站点设置中的背景使用 `backgrounds.light` / `backgrounds.dark` 保存浅色和深色配置，并用 `background_preset_id` 记录当前背景方案。内置「清透蓝绿」和「晨雾石青」会持久化为预设 ID，保存时同步写入浅色/深色 `gradient` 背景、遮罩参数、`0.40` 卡片背景透明度，并把首页标题色与卡片文字色留空以跟随当前主题。用户继续手动修改浅色/深色背景值后，界面会切换为 `custom`；旧数据只要背景值匹配内置方案，后台仍会自动显示对应预设。

首页内容统计条和分类下的站点数量徽标使用首页级 CSS 变量继承当前主题与 `card_text_color`，避免固定灰色在渐变背景或深色模式下对比度不足。

前台分类快速选择栏（PC 侧边栏、移动端触发按钮和抽屉）复用书签卡片的 `--card-bg-rgb` / `--card-bg-opacity` 玻璃背景公式，并通过 `data-theme='dark'` 覆盖暗色模式下的边框、阴影、文字和激活态颜色。后台管理侧边栏则使用 `--admin-*` surface 变量集中控制浅色/深色背景、导航项和徽标状态，避免侧栏颜色与当前主题脱节。

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
- 未登录用户点击管理入口时只加载轻量登录弹窗。
- 首页搜索会预计算书签索引，数据变化时才重建。
- 滚动高亮使用缓存的分区 DOM 和 `IntersectionObserver`，不支持时才回退到节流后的布局读取。
- 分类分区使用 `content-visibility: auto` 降低离屏渲染成本。
- 首页图标使用共享 `IntersectionObserver` 接近视口后才设置图片 `src`，并继续启用浏览器原生懒加载和异步解码。
- 前台主题快速切换只写浏览器本地偏好，不触发 Worker 请求。

## Sun-Panel 导入相关

Sun-Panel 导入会转换分类、书签、打开方式和图标字段。Iconify 图标会尽量规范化为 CF-Navs 的标准保存格式；后台预览使用 `/api/iconify/*` 代理，首页展示优先复用浏览器本地缓存的 Iconify SVG。

更完整的迁移步骤见 [SUNPANEL_IMPORT.md](SUNPANEL_IMPORT.md)。
