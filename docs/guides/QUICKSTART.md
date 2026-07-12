# CF-Navs 快速开始指南

这是一份简化的部署指南，适合快速上手。完整文档请查看 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 部署方式选择

- **Wrangler CLI 部署**：适合本地可运行命令行的用户，完整控制 D1/KV 创建、初始化和部署流程。
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

### 4. 设置管理员密码

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
# 输入你的管理员密码（建议使用强密码）
```

管理员用户名默认是 `admin`，也可以在 Worker Variables 中设置 `INIT_ADMIN_USER`。

### 5. 初始化数据库

```bash
npm run db:init:remote
```

### 6. 部署

```bash
npm run deploy
```

部署成功后，访问返回的 URL 即可使用！

部署新版后建议强制刷新一次页面，让新版 Service Worker 接管。验证首页搜索时，输入关键词应直接筛选书签区域；打开浏览器 Network 面板时，刷新首页、上下滚动、搜索筛选和后台切回首页不应让已缓存的普通书签图标重复请求 `/api/icon/*`，分类图标可显示为 `/api/category-icon/*`，后台预览和新增/编辑弹窗中的 Iconify 图标应显示为 `/api/iconify/*`。编辑书签时弹窗应立即显示，随后可在后台调用 `/api/bookmarks/:id/icon-cache/refresh` 刷新普通书签图标缓存；保存书签后也会显式刷新。该请求遇到慢速外站图标时不应长时间卡住保存流程；如果缓存失败但保存的是 `https://favicon.im/...`、Google favicon 或自定义 HTTP(S) 图标，首页仍应使用已保存 URL 显示图标，而不是退成标题首字。首页展示已保存的 Iconify 图标时可直接请求 `api.iconify.design` 并依赖浏览器 HTTP 缓存，但新增/编辑弹窗中的 Iconify 候选、手动预览和从 `icon-sets.iconify.design` 粘贴的页面链接应走 `/api/iconify/*`。

## 方式二：Cloudflare 控制台在线部署

1. 在 GitHub 上 Fork 本仓库。
2. 进入 Cloudflare 控制台的 **Workers & Pages → Create application → Import a repository**，关联 GitHub 并选择你的 fork。
3. 生产分支选择 `main`，根目录填写 `/`。
4. Deploy command 填写：

```bash
npm run build && npx wrangler deploy
```

5. 保存并完成首次部署。
6. 在 Cloudflare 控制台创建 D1 数据库 `cf-navs-db`，打开 SQL Console，执行 [schema.sql](../../schema.sql)。
7. 创建 KV 命名空间 `SESSION`。
8. 在 Worker 的 **Settings → Bindings** 中添加：

| 类型 | 绑定名 | 选择 |
| --- | --- | --- |
| D1 database | `DB` | `cf-navs-db` |
| KV namespace | `SESSION` | 你的会话 KV 命名空间 |

9. 在 Worker 的 **Settings → Variables & Secrets** 中添加运行时 Secret：

```text
INIT_ADMIN_PASSWORD = 你的管理员密码
```

10. 重新部署或重试最近一次部署，然后访问 Workers URL。

## 🔑 首次登录

1. 访问你的导航站点
2. 点击右上角 **⚙️** 图标
3. 输入凭据：
   - 用户名：`INIT_ADMIN_USER` 的值（默认 `admin`）
   - 密码：你刚才设置的密码

如果修改了 `INIT_ADMIN_USER` 或 `INIT_ADMIN_PASSWORD`，重新部署后下一次登录会同步更新 D1 中的管理员凭据。旧数据库首次升级时，可额外设置一个新的 `RESET_ADMIN_CREDENTIALS` 标记后重新部署一次。

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
