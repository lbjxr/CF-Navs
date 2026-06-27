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

### 3. 配置 wrangler.toml

将上面命令返回的 ID 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cf-navs-db"
database_id = "你的数据库ID"

[[kv_namespaces]]
binding = "SESSION"
id = "你的KV命名空间ID"
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
