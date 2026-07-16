# CF-Navs 快速开始指南

这是一份简化的部署指南，适合快速上手。完整文档请查看 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 部署方式选择

- **Wrangler CLI 部署**：适合本地可运行命令行的用户，完整控制 D1/KV 创建和部署，并通过 `/install` 完成 schema 与管理员初始化。
- **Cloudflare 控制台在线部署**：适合先 Fork 项目，再通过 Cloudflare 关联 GitHub 自动构建部署的用户。

## 方式一：Wrangler CLI 部署

### 1. 克隆项目并安装依赖

```bash
git clone https://github.com/lbjxr/CF-Navs.git
cd CF-Navs
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

### 4. 设置一次性安装令牌

```bash
npx wrangler secret put SETUP_TOKEN
# 输入足够长的随机值，并安全保存到完成安装
```

### 5. 部署

```bash
npm run deploy
```

### 6. 完成安装

访问返回的 Workers URL 并打开 `/install`，输入 `SETUP_TOKEN`，再创建管理员用户名和密码。安装器会初始化数据库 schema；确认登录成功后，建议删除或轮换 `SETUP_TOKEN`。

`npm run db:init:remote` 仅作为安装器无法初始化 schema 时的恢复命令，不是全新 CLI 部署的正常步骤。

部署新版后建议强制刷新一次页面，让新版 Service Worker 接管。验证首页搜索时，输入关键词应直接筛选书签区域；打开浏览器 Network 面板时，刷新首页、上下滚动、搜索筛选和后台切回首页不应让已缓存的普通书签图标重复请求 `/api/icon/*`，分类图标可显示为 `/api/category-icon/*`，后台预览和新增/编辑弹窗中的 Iconify 图标应显示为 `/api/iconify/*`。编辑书签时弹窗应立即显示，随后可在后台调用 `/api/bookmarks/:id/icon-cache/refresh` 刷新普通书签图标缓存；保存书签后也会显式刷新。该请求遇到慢速外站图标时不应长时间卡住保存流程；如果缓存失败但保存的是 `https://favicon.im/...`、Google favicon 或自定义 HTTP(S) 图标，首页仍应使用已保存 URL 显示图标，而不是退成标题首字。首页展示已保存的 Iconify 图标时可直接请求 `api.iconify.design` 并依赖浏览器 HTTP 缓存，但新增/编辑弹窗中的 Iconify 候选、手动预览和从 `icon-sets.iconify.design` 粘贴的页面链接应走 `/api/iconify/*`。

## 方式二：Cloudflare 控制台在线部署

1. 在 GitHub 上 Fork 本仓库。
2. 进入 Cloudflare 控制台的 **Workers & Pages → Create application → Import a repository**，关联 GitHub 并选择你的 fork。已有 Fork 不能使用通用 Deploy Button：该按钮会创建新 GitHub 仓库，不能指定现有 Fork。
3. 生产分支选择 `main`，根目录填写 `/`，Build command 填写 `npm run build`，Deploy command 填写：

```bash
npx wrangler deploy
```

4. 保存并部署。Cloudflare 的 Git 引导流程会根据 `wrangler.toml` 中不带 ID 的声明创建并绑定 `DB` D1 数据库与 `SESSION` KV 命名空间。待部署完成后，进入该 Worker 的 **设置 → 变量和密钥**，添加一个类型为**密钥**的变量，变量名填写 `SETUP_TOKEN`，值填写一段足够长且随机的字符串。

<p align="center">
  <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-deploy3.jpg" alt="在 Cloudflare Worker 中添加 SETUP_TOKEN 密钥" width="100%">
</p>

5. 打开部署后的 Workers URL，并访问 `/install`。输入 `SETUP_TOKEN`，再设置管理员用户名和密码；安装器会初始化数据库 schema 和管理员账号。
6. 进入该 Worker 的 **域和路由** 页面，关闭两个 Workers URL，然后添加并启用你的自定义域名。

正常路径无需 Cloudflare API Token、GitHub Actions 或手动 SQL；只有安装器报 schema 初始化错误时，才在 D1 SQL Console 执行 [schema.sql](../../schema.sql) 进行恢复。首次部署请从生产分支 `main` 触发，资源创建完成前不要使用预览分支自动部署。

## 🔑 首次登录

### Cloudflare Git 或 Wrangler CLI 新安装

1. 访问 `https://你的站点/install`
2. 输入部署时保存的 `SETUP_TOKEN`
3. 设置管理员用户名和密码
4. 安装完成后按页面提示登录
5. 确认登录成功后，建议进入该 Worker 的 **设置 → 变量和密钥** 删除或轮换 `SETUP_TOKEN`

### 旧数据库升级 / 凭据恢复

`INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 和 `RESET_ADMIN_CREDENTIALS` 仅用于已有旧数据库的升级或凭据恢复，不是全新 Wrangler CLI 安装入口。旧数据库首次升级时，可设置一个新的 `RESET_ADMIN_CREDENTIALS` 标记后重新部署一次。

登录成功后会回到前台首页，需要进入后台时再次点击右上角管理入口。

## 📝 下一步

- 修改站点标题
- 设置首页标题颜色和文字大小
- 添加书签和分类
- 新增书签时选择文字图标配色方案
- 登录后在首页右键书签进行快捷编辑
- 自定义背景和主题
- 配置搜索引擎

完整功能说明请查看 [README.md](../../README.md)。

## ❓ 遇到问题？

1. 检查 [DEPLOYMENT.md](DEPLOYMENT.md) 中的故障排查部分
2. 查看 Worker 日志：`npx wrangler tail`
3. 提交 Issue 到 GitHub

---

祝你使用愉快！🎉
