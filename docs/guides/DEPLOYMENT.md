# Cloudflare 部署检查清单

在部署到 Cloudflare Workers 之前，请按照此清单逐项检查。你可以选择 Wrangler CLI 部署，也可以在 Cloudflare 控制台导入 GitHub fork 在线部署。

## 部署方式

### 方式一：Wrangler CLI

适合本地命令行部署。需要创建 D1/KV、生成 `wrangler.local.toml`、设置 Secret、初始化数据库并运行 `npm run deploy`。

### 方式二：Cloudflare 控制台导入 GitHub

适合 Fork 项目后在线部署。

1. 在 GitHub 上 Fork 仓库。
2. 进入 **Workers & Pages → Create application → Import a repository**，关联 GitHub 并选择 fork。
3. 生产分支选择 `main`，Build command 填写 `npm run build`，Deploy command 填写 `npx wrangler deploy`。
4. `wrangler.toml` 只声明 `DB` 和 `SESSION` 绑定，不包含真实资源 ID。首次部署时 Cloudflare 会自动创建并绑定 D1 与 KV 资源。
5. 首次部署完成后，在 Cloudflare 控制台找到绑定到 `DB` 的 D1 数据库，在 SQL Console 执行一次 [schema.sql](../../schema.sql)。
6. 在 Worker 的 **Settings → Bindings** 中确认 D1 绑定名为 `DB`、KV 绑定名为 `SESSION`。
7. 在 Worker 的 **Settings → Variables & Secrets** 中添加 `INIT_ADMIN_USER`（可选，默认 `admin`）和 `INIT_ADMIN_PASSWORD`。
8. 重新部署或重试最近一次部署。

> 在线部署命令不要使用 `npm run deploy`：该命令会在 Wrangler 部署前执行远程 D1 初始化，适用于已经生成 `wrangler.local.toml` 的本地 CLI 部署。Git 自动部署请使用 Build command `npm run build` 和 Deploy command `npx wrangler deploy`，首次部署后再手动执行一次 `schema.sql`。

首次资源创建请从生产分支 `main` 触发。资源创建完成前，建议关闭预览分支自动部署；预览分支可能使用 `wrangler versions upload`，不适合作为首次资源初始化流程。

## 📋 部署前准备

### 1. Cloudflare 账号
- [ ] 已注册 Cloudflare 账号
- [ ] 已登录 Wrangler CLI：`npx wrangler login`

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create cf-navs-db
```

预期输出：
```
✅ Successfully created DB 'cf-navs-db'!

[[d1_databases]]
binding = "DB"
database_name = "cf-navs-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

- [ ] 已创建 D1 数据库
- [ ] 稍后使用 `npm run setup:wrangler` 写入本地 `wrangler.local.toml`

### 3. 创建 KV 命名空间

```bash
npx wrangler kv namespace create SESSION
```

预期输出：
```
🌀 Creating namespace with title "cf-navs-SESSION"
✨ Success!
Add the following to your wrangler.toml:

[[kv_namespaces]]
binding = "SESSION"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

- [ ] 已创建 KV 命名空间
- [ ] 稍后使用 `npm run setup:wrangler` 写入本地 `wrangler.local.toml`

### 4. 生成本地 Wrangler 配置

```bash
npm run setup:wrangler
```

- [ ] 已生成 `wrangler.local.toml`
- [ ] 确认 `wrangler.local.toml` 未被 Git 跟踪

### 5. 设置管理员密码

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
```

- [ ] 已设置管理员密码（建议使用强密码）
- [ ] 密码已安全保存（不要丢失）

### 6. 初始化数据库

```bash
npm run db:init:remote
```

- [ ] 数据库表已创建
- [ ] 无错误信息输出

### 7. 构建前端

```bash
npm run build
```

- [ ] 构建成功
- [ ] `dist/` 目录已生成
- [ ] 无 TypeScript 错误

## 🚀 开始部署

### 执行部署命令

```bash
npm run deploy
```

预期输出：
```
✨ Built successfully!
Total Upload: xx.xx KiB / gzip: xx.xx KiB
Uploaded cf-navs (x.xx sec)
Published cf-navs (x.xx sec)
  https://cf-navs.your-subdomain.workers.dev
```

- [ ] 部署成功
- [ ] 获得访问 URL

## ✅ 部署后验证

### 1. 访问站点

访问你的 Workers URL（如 `https://cf-navs.xxx.workers.dev`）

- [ ] 页面正常加载
- [ ] 无 JavaScript 错误
- [ ] 样式显示正常

### 2. 测试登录

1. 点击右上角 ⚙️ 图标
2. 使用以下凭据登录：
   - 用户名：`INIT_ADMIN_USER` 的值（默认 `admin`）
   - 密码：你设置的 `INIT_ADMIN_PASSWORD`

- [ ] 登录成功
- [ ] 登录成功后回到前台首页，再次点击管理入口能够进入管理界面

### 3. 测试基本功能

- [ ] 创建分类成功
- [ ] 创建书签成功
- [ ] 创建书签时能看到 Favicon.im / 完整标题文字图标 / Google / Iconify 候选；打开方式与链接地址同行，图标背景色与图标候选同行；文字图标配色和 Iconify 输入区默认收起，选中对应类型后展开；Iconify 候选和手动预览请求都走 `/api/iconify/*`
- [ ] 选择"文字图标"后能看到内置配色方案，并可切换保存 logo.surf 风格 SVG 图标；长标题保存后会在图标内最多自动换行 4 行显示
- [ ] 手动输入纯文字或表情图标后保存，首页显示该自定义图标，而不是回退为书签标题首字
- [ ] 新增/编辑书签弹窗内容过高时可在弹窗内滚动，保存按钮始终可见
- [ ] 选中一种图标后保存，图标显示正常；选择 Favicon.im、Google favicon 或自定义 HTTP(S) 图标时，即使 `/api/bookmarks/:id/icon-cache/refresh` 没有生成 `icon_blob`，首页也会回退到已保存图标 URL，而不是显示标题首字
- [ ] 分类和书签列表每页显示 10 条，普通模式下面板高度贴合当前页内容且底部无明显空白；排序模式显示全量列表并可在面板内滚动
- [ ] 首页顶部内容统计和分类下站点数量文字在浅色/深色主题、渐变背景和自定义卡片文字色下对比度正常
- [ ] 首页分类快速选择栏在 PC 端折叠/展开、移动端按钮/抽屉下都呈现与书签卡片一致的玻璃背景，并能随亮色/暗色主题切换
- [ ] 后台「站点设置 → 布局与导航」可切换左侧/顶部；桌面左侧常显可手动收缩并跨刷新保留，移动端左侧仍为抽屉
- [ ] 顶部导航固定悬浮且不遮挡标题、搜索框和分类内容；分类溢出时桌面箭头/鼠标拖动与移动端触摸滑动正常
- [ ] 拖拽排序成功；进入排序模式后显示全量列表，保存/取消后恢复分页
- [ ] 刷新后数据保持
- [ ] 退出登录成功
- [ ] 登录后可在首页右键书签，编辑按钮浮在当前卡片上且不挤动右侧卡片；右键另一个书签时，前一个书签的右键菜单会自动关闭
- [ ] 通过右键编辑进入编辑弹窗，删除需二次确认
- [ ] 部署新版后强制刷新一次页面，确认新版 Service Worker 已激活
- [ ] 首页搜索框输入关键词时，书签区域直接筛选，不出现本地书签下拉列表
- [ ] 打开浏览器 Network 面板，刷新首页、上下滚动、搜索筛选、后台切回首页时，已缓存的普通书签图标不重复请求 `/api/icon/*`；分类图标可命中 `/api/category-icon/*`，后台预览和新增/编辑弹窗中的 Iconify 图标走 `/api/iconify/*`
- [ ] 打开 Application -> Storage，清理站点数据后完整浏览首页并翻页查看后台书签列表，缓存空间应保持在小体量范围内，不应因跨域 Iconify `opaque` 响应或后台 `icon_blob` 预览重复写入而持续增长
- [ ] 编辑弹窗应立即打开；随后可在后台调用 `/api/bookmarks/:id/icon-cache/refresh` 刷新普通书签图标缓存。保存书签后也会显式刷新；该请求遇到慢速 favicon 服务时不应长时间卡住保存流程；新增/编辑弹窗和后台预览不应直连 `https://api.iconify.design/*` 或 `https://icon-sets.iconify.design/*`，首页已保存的 Iconify 图标可直连 `api.iconify.design`
- [ ] 登录后首次进入后台可请求 `/api/admin/data`；之后刷新页面、前后台切换优先读取浏览器本地快照，除新增、后台修改、导入、排序保存失败回滚或认证失败外不重复拉取
- [ ] Iconify 失败时显示文字 fallback；普通 HTTP(S) 书签图标代理失败时可回退原始 URL，若原始 URL 也失败则显示书签文字 fallback

### 4. 测试公开模式

1. 在设置中开启"公开模式"
2. 退出登录
3. 刷新页面

- [ ] 未登录可以查看书签
- [ ] 搜索框正常工作

## 🎨 可选配置

### 1. 自定义域名

如果你有自己的域名：

```bash
npx wrangler deploy --route "nav.yourdomain.com/*"
```

或在 Cloudflare Dashboard 中配置 Workers Route。

- [ ] 域名已解析到 Cloudflare
- [ ] Workers Route 已配置
- [ ] 自定义域名可访问

### 2. 站点个性化

登录后台，在"站点设置"中配置：

- [ ] 修改站点标题
- [ ] 配置首页标题颜色和文字大小
- [ ] 可选择 13 套内置渐变方案（清透蓝绿、晨雾石青、珊瑚晴空、鼠尾草石墨、琥珀晨光、余烬夜航、紫晶破晓、深海蔚蓝、极光苔原、柑橘日落、玫瑰星轨、靛蓝秘境、陶土沙丘），并可继续手动自定义浅色/深色模式背景（纯色/渐变/图片），切换主题后背景随主题变化
- [ ] 保存内置渐变方案后，从前台切回后台仍显示已选择的内置方案，而不是自定义渐变
- [ ] 书签详情卡片在浅色与深色背景下均保持标题、备注和分类统计文字清晰可读，并呈现半透明毛玻璃表面
- [ ] 配置遮罩颜色与透明度
- [ ] 选择主题模式
- [ ] 配置搜索引擎
- [ ] 选择左侧或顶部导航布局；左侧模式可按需开启桌面常显
- [ ] 调整卡片样式
- [ ] 配置卡片背景颜色与透明度

### 3. 数据导入

如果你有现有书签数据：

- [ ] 准备 JSON 格式数据
- [ ] 在"数据管理"中导入
- [ ] 验证数据正确导入

## 🔧 故障排查

### 部署失败

**错误：Authentication error**
```bash
npx wrangler login
```

**错误：Missing binding**
- 检查是否已运行 `npm run setup:wrangler` 生成 `wrangler.local.toml`
- 确认资源已创建

**错误：Database not found**
```bash
npm run db:init:remote
```

### 登录失败

**密码错误**
- 如果仍能登录后台：进入 **站点设置 → 账号安全**，用当前密码更新管理员密码。
- 如果已经无法登录：修改 `INIT_ADMIN_USER` 和 `INIT_ADMIN_PASSWORD` 后重新部署，下一次登录会自动用新值覆盖 D1 中的管理员凭据。确认当前 Wrangler 指向正确的 Worker、D1 和账号后再执行：

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
npx wrangler deploy
```

- 已经存在但升级前创建的旧数据库可能还没有初始化标记。此时再增加一个新的 `RESET_ADMIN_CREDENTIALS` 变量值，例如 `reset-2026-07-12`，重新部署并登录一次。成功登录后可以移除该变量；同一个标记不会重复重置，以后再次强制重置时请使用新的标记值。

重置成功后，已有登录会话会失效，需要重新登录。

**KV 错误**
- 检查 KV 命名空间是否正确绑定
- 查看 Worker 日志：`npx wrangler tail`

### 数据无法保存

**D1 连接失败**
- 确认 D1 数据库已创建
- 确认已执行 `npm run db:init:remote`
- 检查 `wrangler.local.toml` 中的 `database_id`

### 页面无法加载

**静态资源 404**
- 确认已执行 `npm run build`
- 检查 `dist/` 目录是否存在
- 重新部署

## 📊 监控和维护

### 查看 Worker 日志

```bash
npx wrangler tail
```

### 查看数据库内容

```bash
npx wrangler d1 execute cf-navs-db --command "SELECT * FROM settings"
```

### 备份数据

定期在后台管理中导出数据备份：

1. 进入"数据管理"
2. 点击"导出备份"
3. 保存 JSON 文件

## 🔐 安全建议

- [ ] 使用强密码（至少 16 位，包含大小写字母、数字、符号）
- [ ] 定期备份数据
- [ ] 不要将 `.dev.vars` 提交到 Git
- [ ] 生产环境关闭调试模式
- [ ] 考虑启用 Cloudflare Access 进行额外保护

## 📈 性能优化

- [ ] 图标使用 WebP 格式（更小）
- [ ] 背景图片使用 CDN
- [ ] 考虑使用 Cloudflare Images 优化图片
- [ ] 定期清理无用书签

## 🎉 部署成功！

如果所有检查项都已完成，恭喜你成功部署了 CF-Navs！

**首次登录提醒：**
- 用户名：`INIT_ADMIN_USER` 的值（默认 `admin`）
- 密码：你设置的 `INIT_ADMIN_PASSWORD`

**下一步建议：**
1. 修改站点标题
2. 添加常用网站书签
3. 自定义背景和主题
4. 配置搜索引擎
5. 开启公开模式（如需要）

---

有问题？查看 [README.md](../../README.md) 或提交 Issue。
