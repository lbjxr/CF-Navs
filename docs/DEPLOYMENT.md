# Cloudflare 部署检查清单

在部署到 Cloudflare Workers 之前，请按照此清单逐项检查。

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
   - 用户名：`admin`
   - 密码：你设置的 `INIT_ADMIN_PASSWORD`

- [ ] 登录成功
- [ ] 能够进入管理界面

### 3. 测试基本功能

- [ ] 创建分类成功
- [ ] 创建书签成功
- [ ] 创建书签时能看到四种图标候选（自动获取 / Favicon.im / 完整标题文字图标 / Google）
- [ ] 选择"文字图标"后能看到内置配色方案，并可切换保存 logo.surf 风格 SVG 图标
- [ ] 新增/编辑书签弹窗内容过高时可在弹窗内滚动，保存按钮始终可见
- [ ] 选中一种图标后保存，图标显示正常
- [ ] 拖拽排序成功
- [ ] 刷新后数据保持
- [ ] 退出登录成功
- [ ] 登录后可在首页右键书签，编辑按钮浮在当前卡片上且不挤动右侧卡片
- [ ] 通过右键编辑进入编辑弹窗，删除需二次确认
- [ ] 部署新版后强制刷新一次页面，确认新版 Service Worker 已激活
- [ ] 首页搜索框输入关键词时，书签区域直接筛选，不出现本地书签下拉列表
- [ ] 打开浏览器 Network 面板，上下滚动、搜索筛选、保存设置后，图标请求优先命中 `/api/icon/*` 或 `/api/category-icon/*`
- [ ] Network 面板中不应出现前台直接请求 `https://favicon.im/*` 或 `https://a.favicon.im/*`
- [ ] 第三方图标服务失败或限流时，浏览器控制台不应出现 favicon.im 429；失败图标应显示文字 fallback

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
- [ ] 设置背景（纯色/渐变/图片）
- [ ] 配置遮罩颜色与透明度
- [ ] 选择主题模式
- [ ] 配置搜索引擎
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
- 重新设置密码：`npx wrangler secret put INIT_ADMIN_PASSWORD`
- 等待几分钟让 secret 生效

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
- 用户名：`admin`
- 密码：你设置的 `INIT_ADMIN_PASSWORD`

**下一步建议：**
1. 修改站点标题
2. 添加常用网站书签
3. 自定义背景和主题
4. 配置搜索引擎
5. 开启公开模式（如需要）

---

有问题？查看 [README.md](../README.md) 或提交 Issue。
