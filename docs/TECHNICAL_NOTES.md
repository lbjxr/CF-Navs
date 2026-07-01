# CF-Navs 技术细节

本文档收纳 README 中不适合放在首页的实现细节，方便需要维护或调优项目时查阅。

## 图标处理

CF-Navs 支持多种图标来源：

- Favicon.im
- Google favicon
- Iconify
- 自定义 HTTP(S) 图标 URL
- 自定义文字或表情
- 基于完整书签标题生成的本地 SVG 文字图标

新增或编辑书签时，普通 HTTP(S) 图标会通过刷新接口写入书签图标缓存。刷新接口使用短超时抓取外站图标，避免保存流程被慢速 favicon 服务长时间阻塞；抓取失败时保留已有 `icon_blob`，没有缓存则返回 `null`。首页和后台列表的普通渲染优先读取浏览器本地缓存、聚合接口返回的 `icon_blob`、data URI 或 Iconify 代理结果，首页在这些缓存都缺失时会回退到已保存的普通 HTTP(S) 图标 URL，避免可直连的 favicon 保存后变成文字图标。

相关接口：

- `POST /api/bookmarks/:id/icon-cache/refresh`
- `GET /api/icon/:id`
- `GET /api/category-icon/:id`
- `GET /api/iconify/:set/:name.svg`

`/api/icon/:id` 主要保留为兼容和兜底代理。它会优先读取 Cloudflare edge cache 和 D1 中的 `icon_blob`，cache miss 时再尝试抓取外站图标。普通 HTTP(S) 图标代理失败时返回错误；首页卡片优先走本地缓存和 `icon_blob`，缺失时直接回退已保存的 HTTP(S) 图标 URL，原始 URL 也加载失败后才显示文字 fallback。分类图标和 Iconify 图标失败时会返回短 TTL 的临时 SVG fallback。

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

这样可以避免浏览器直接请求 Iconify 外站，并让 Service Worker、浏览器本地缓存和 Cloudflare edge cache 复用同一份图标资源。

## 首页数据读取

公开首页优先请求：

```text
GET /api/public/data
```

该接口返回首页实际需要的轻量 settings、分类和书签字段。公开模式开启时，匿名访问可以命中 Cloudflare edge cache；公开模式关闭时，匿名响应会携带轻量站点配置，供登录页展示使用。

后台进入或首页管理操作需要完整数据时，再请求：

```text
GET /api/admin/data
```

后台聚合接口一次返回分类、书签和完整设置。前端会按当前登录态写入浏览器本地快照，刷新页面或前后台切换时优先使用快照，减少重复请求。

## 设置与数据写入

设置保存、导入恢复和排序接口尽量减少 D1 statement 数：

- 后台完整 settings 保存使用批量 upsert。
- 导入恢复复用本次导入时已经规范化的分类和书签结果。
- 分类和书签排序使用分块 `UPDATE ... CASE id ... WHERE id IN (...)`。
- 新增和更新接口尽量用 `RETURNING` 返回写入后的行，减少写后再读。

写入成功后，前端优先使用接口返回值增量更新本地 store，而不是立即重新拉取全量公开数据。

## 缓存策略

Worker 和前端共同承担缓存：

- `/api/config` 和 `/api/public/data` 使用短 TTL edge cache。
- 设置保存、数据导入和管理端写入会主动失效相关缓存。
- `/assets/*` 构建产物设置一年 immutable 缓存。
- HTML 和 `sw.js` 使用 no-cache 重验证。
- Service Worker 预缓存 `/index.html` 作为离线导航回退。
- Service Worker 对图标代理和构建资源采用 cache-first 策略。

部署新版后，如果浏览器仍使用旧逻辑，可以强制刷新一次页面，让新版 Service Worker 接管。

## 登录与会话

- 管理员密码使用 WebCrypto PBKDF2 哈希存储。
- Session token 随机生成并写入 KV。
- 登录限流复用同一次请求已读取的 KV 状态。
- Worker 认证中间件会在单个 isolate 内短时复用已验证 session，减少后台连续操作时的 KV 读取。
- 前端 API 客户端会在内存中复用已解析的有效登录态，并监听跨标签页 storage 变更。

## 前端性能策略

- 首页主包、登录弹窗、后台管理和书签编辑弹窗按需分包。
- 未登录用户点击管理入口时只加载轻量登录弹窗。
- 首页搜索会预计算书签索引，数据变化时才重建。
- 滚动高亮使用缓存的分区 DOM 和 `requestAnimationFrame` 节流。
- 首页图标使用浏览器原生懒加载和异步解码。
- 前台主题快速切换只写浏览器本地偏好，不触发 Worker 请求。

## Sun-Panel 导入相关

Sun-Panel 导入会转换分类、书签、打开方式和图标字段。Iconify 图标会尽量规范化为 CF-Navs 的标准保存格式，并在首页通过 `/api/iconify/*` 代理加载。

更完整的迁移步骤见 [SUNPANEL_IMPORT.md](SUNPANEL_IMPORT.md)。
