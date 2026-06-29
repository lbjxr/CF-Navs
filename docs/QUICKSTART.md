# CF-Navs 快速开始指南

这是一份简化的部署指南，适合快速上手。完整文档请查看 [DEPLOYMENT.md](DEPLOYMENT.md)。

## ⚡ 5分钟部署

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/your-username/cf-navs.git
cd cf-navs
npm install
```

### 2. 创建 Cloudflare 资源

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库
npx wrangler d1 create cf-navs-db

# 创建 KV 命名空间
npx wrangler kv namespace create SESSION
```

### 3. 生成本地 Wrangler 配置

不要把真实 Cloudflare 资源 ID 提交到公开的 `wrangler.toml`。运行下面命令生成 Git 忽略的 `wrangler.local.toml`：

```bash
npm run setup:wrangler
```

### 4. 设置管理员密码

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
# 输入你的管理员密码（建议使用强密码）
```

### 5. 初始化数据库

```bash
npm run db:init:remote
```

### 6. 部署

```bash
npm run deploy
```

部署成功后，访问返回的 URL 即可使用！

部署新版后建议强制刷新一次页面，让新版 Service Worker 接管。验证首页搜索时，输入关键词应直接筛选书签区域；打开浏览器 Network 面板时，首页图标请求应优先显示为 `/api/icon/*` 或 `/api/category-icon/*`，新增/编辑弹窗中的 Iconify 候选和手动预览应显示为 `/api/iconify/*`，不应由前台直接请求 `favicon.im` 或 `api.iconify.design`。

## 🔑 首次登录

1. 访问你的导航站点
2. 点击右上角 **⚙️** 图标
3. 输入凭据：
   - 用户名：`admin`
   - 密码：你刚才设置的密码

## 📝 下一步

- 修改站点标题
- 设置首页标题颜色和文字大小
- 添加书签和分类
- 新增书签时选择文字图标配色方案
- 登录后在首页右键书签进行快捷编辑
- 自定义背景和主题
- 配置搜索引擎

完整功能说明请查看 [README.md](../README.md)。

## ❓ 遇到问题？

1. 检查 [DEPLOYMENT.md](DEPLOYMENT.md) 中的故障排查部分
2. 查看 Worker 日志：`npx wrangler tail`
3. 提交 Issue 到 GitHub

---

祝你使用愉快！🎉
