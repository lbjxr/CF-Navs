# CF-Navs 问题排查

## 部署失败

### Authentication error

重新登录 Cloudflare：

```bash
npx wrangler login
```

### Missing binding

通常是 D1 或 KV 绑定没有写入本地部署配置。

1. 确认已经创建 D1 和 KV。
2. 运行 `npm run setup:wrangler`。
3. 确认本地存在 `wrangler.local.toml`。

### Database not found

确认远程数据库已经初始化：

```bash
npm run db:init:remote
```

如果仍失败，检查 `wrangler.local.toml` 中的 `database_id` 是否对应当前 Cloudflare 账号下的 `cf-navs-db`。

## 登录失败

### 密码错误

如果仍能登录后台，进入 **站点设置 → 账号安全**，输入当前密码后更新管理员密码。修改成功后，现有登录会话会失效，需要使用新密码重新登录。

如果已经无法登录，单独重新设置 `INIT_ADMIN_PASSWORD` 不会覆盖数据库中已经初始化过的管理员密码。需要先确认当前环境和数据库，再用 D1 管理语句清除已保存的 `admin_password`，随后重新部署或访问站点，让系统用新的 `INIT_ADMIN_PASSWORD` 重新初始化密码：

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
npx wrangler d1 execute cf-navs-db --remote --command "DELETE FROM settings WHERE key = 'admin_password'"
```

Cloudflare Secret 生效可能需要等待片刻。执行清除命令前请确认 Wrangler 指向的是正确的 Cloudflare 账号、Worker 和 D1 数据库。

### KV 相关错误

登录会话依赖 `SESSION` KV 命名空间。请检查：

1. `npx wrangler kv namespace create SESSION` 是否已执行。
2. `npm run setup:wrangler` 是否已生成最新绑定。
3. Worker 日志中是否出现 KV binding 错误。

查看日志：

```bash
npx wrangler tail
```

## 数据无法保存

数据保存依赖 D1 数据库。请检查：

1. D1 数据库是否已创建。
2. 是否已执行 `npm run db:init:remote`。
3. `wrangler.local.toml` 中的 D1 `database_id` 是否正确。
4. Worker 日志是否有 SQL 或 binding 错误。

## 页面无法加载

### 静态资源 404

重新构建并部署：

```bash
npm run build
npm run deploy
```

确认 `dist/` 目录存在，并检查 Workers 部署日志是否成功上传 assets。

### 新版本没有生效

浏览器可能仍在使用旧 Service Worker 或旧静态资源缓存。

1. 强制刷新页面。
2. 如仍异常，打开浏览器 DevTools，注销旧 Service Worker 后重新加载。
3. 确认 `sw.js` 返回的是最新版本。

## 图标显示异常

### 普通网站图标为空

部分网站 favicon 不允许 Worker 跨站抓取或返回异常内容。保存普通 HTTP(S) 图标时，刷新接口会短超时尝试生成 `icon_blob`；如果失败，首页会继续尝试使用已保存的图标 URL。可以编辑书签后选择：

- Favicon.im 候选
- Google favicon 候选
- 文字图标
- Iconify 图标
- 自定义图片 URL
- 表情或短文字

如果预览正常但保存后仍显示标题首字，请先强制刷新页面让新版 Service Worker 接管，再检查书签保存的 `icon` 是否仍是可访问的 HTTP(S) 图片地址。首页普通浏览不应出现按书签数量增长的 `/api/icon/:id` 请求；如果网络面板里仍看到这种行为，通常是旧静态资源或旧 Service Worker 还未更新。

### Iconify 图标不显示

检查保存值是否为可识别格式，例如：

```text
mdi:home
simple-icons:github
https://icon-sets.iconify.design/mdi/home/
```

新增/编辑弹窗和后台预览请求应走 `/api/iconify/*`；首页展示已保存的 Iconify 图标时可以直接请求 `api.iconify.design`，并由浏览器 HTTP 缓存复用，避免增加 Worker 请求数。Service Worker 不应把跨域 `opaque` Iconify 响应写入 Cache Storage。

### 部署新版后图标行为仍旧

强制刷新页面，让新版 Service Worker 激活。必要时清理站点缓存后重试。

### 浏览器缓存空间异常变大

如果 DevTools 的 Application -> Storage 显示本站缓存空间明显大于 D1 数据量，先确认当前 Service Worker 已是最新版本，再清理站点数据后复测：首页完整滚动、刷新页面、进入后台书签列表翻页，缓存空间都不应持续线性增长。

常见原因：

- 旧 Service Worker 仍在缓存跨域 `opaque` Iconify 响应，Chrome 会对这类响应按较大配额计入 Cache Storage。
- 后台书签列表预览把聚合数据里的 `icon_blob` 又复制到浏览器本地图标缓存。
- 多次登录留下旧 `AdminData` 快照。

当前实现会跳过跨域 `opaque` 响应、限制图标响应写入体积、清理旧登录态快照，并在后台已有 `icon_blob` 时清理同 key 的本地图标副本。

## 首页公开访问异常

如果未登录访问首页提示需要登录：

1. 登录后台。
2. 进入站点设置。
3. 确认已开启公开模式。
4. 退出登录后刷新首页验证。

如果公开模式已经开启但匿名访问仍异常，检查 Worker 日志中 `/api/public/data` 是否报错。

## Sun-Panel 导入失败

请检查：

1. JSON 文件是否为 Sun-Panel 原始导出或 CF-Navs 备份格式。
2. 文件是否过大导致浏览器或 Worker 超时。
3. 浏览器控制台是否有解析错误。
4. Worker 日志是否有 D1 写入错误。

导入会覆盖现有分类和书签，建议导入前先在后台导出一份 CF-Navs 备份。

## 常用诊断命令

```bash
npx wrangler tail
npm run type-check
npm run build
npx wrangler d1 execute cf-navs-db --remote --command "SELECT key, value FROM settings LIMIT 20"
```

涉及线上数据的命令请先确认当前 Cloudflare 账号和 Wrangler 配置指向正确项目。

## 线上 Chrome 验证异常

如果 Codex/自动化环境中没有暴露 Chrome 插件要求的 Node REPL 工具，可以启动独立 Chrome 调试端口后直接使用 CDP 验证线上站点。

关键注意点：

- `Chrome /json/new` 在新版本中使用 `PUT`，不要用 `GET`。
- `curl` 在 PowerShell 中拼 JSON 登录体容易引号转义失败，建议用 Node `fetch` 或页面上下文 `fetch`。
- 右键菜单验证使用 CDP `Input.dispatchMouseEvent` 的 right button 事件，比直接 `dispatchEvent` 更接近真实操作。
- 验证完成后关闭带 `--user-data-dir=D:\tmp\cf-navs-chrome-profile-*` 的 Chrome 进程，避免残留测试 profile。

常规验收项：

- 首页标题、搜索框、书签卡片正常。
- 输入搜索词后摘要和卡片数量变化符合预期。
- 登录后管理入口、退出按钮、主题按钮可见。
- 后台分类/书签列表、编辑弹窗可打开。
- `/api/config`、`/api/settings`、`/api/admin/data`、`/api/data/version` 返回 `code: 0`。
- 控制台错误、页面异常、失败请求和非预期 HTTP 4xx/5xx 都为 0。
