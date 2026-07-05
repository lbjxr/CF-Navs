# CF-Navs

> 🚀 一个运行在 **Cloudflare Workers** 上的轻量个人导航面板。前台用于展示常用站点，后台用于管理分类、书签、主题、搜索引擎和数据备份。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)
![Svelte](https://img.shields.io/badge/Svelte-4-ff3e00.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)

## 📚 导航

[⚡ 快速开始](docs/QUICKSTART.md) · [🚢 部署指南](docs/DEPLOYMENT.md) · [🧩 技术细节](docs/TECHNICAL_NOTES.md) · [🧱 重构记录](docs/MAINTENANCE_REFACTOR_LOG.md) · [🔌 API 契约](docs/API_CONTRACT.md) · [🛠️ 问题排查](docs/TROUBLESHOOTING.md)

## ✨ 项目定位

CF-Navs 适合把个人、家庭、小团队或内部系统的常用链接整理成一个干净、快速、可自定义的导航页。它不依赖传统服务器，前端静态资源和后端 API 都部署在 Cloudflare Workers，数据存储使用 D1，登录会话使用 KV。

| 方向 | 说明 |
| --- | --- |
| 🎯 使用场景 | 个人导航、工具入口、内网系统索引、团队链接聚合 |
| ☁️ 部署方式 | Wrangler CLI，或 Cloudflare 控制台导入 GitHub 仓库 |
| 🗄️ 数据存储 | Cloudflare D1 + KV |
| 🔐 管理模式 | 单管理员后台，可开启公开访问 |
| 📦 迁移能力 | 支持 JSON 备份恢复和 Sun-Panel 导入 |

## 🌟 核心亮点

- **☁️ 轻量部署**：Cloudflare Workers + D1 + KV，无需自建服务器。
- **🧭 清爽首页**：分类分区、响应式布局、玻璃质感分类快速选择栏、详情/极简两种卡片样式。
- **🛠️ 顺手管理**：分类和书签支持新增、编辑、删除、搜索、分页和拖拽排序。
- **🎨 图标省心**：支持 favicon、文字图标、Iconify、自定义图片 URL、文字或表情；首页优先使用聚合数据和浏览器本地缓存展示图标。
- **🌓 主题完整**：亮色、暗色、跟随系统；内置渐变方案会保存选中状态，背景、遮罩、卡片尺寸和图标大小都可配置。
- **🔎 搜索实用**：首页输入可筛选本地书签，也可切换外部搜索引擎。
- **💾 数据可控**：支持导入、导出、恢复，方便备份和迁移。

## 🧭 功能概览

### 🏠 首页体验

- 分类和书签分区展示
- 分类快速选择栏在 PC 和移动端使用与书签卡片一致的玻璃背景，并跟随亮色/暗色主题
- 首页标题、背景预设/自定义背景、遮罩、卡片样式可配置
- 关键词直接筛选标题、描述、URL 和分类
- 外部搜索引擎快速切换
- 移动端和桌面端自适应
- 生产构建提供基础 PWA app shell

### 🧑‍💻 后台管理

- 单管理员登录
- 分类和书签 CRUD
- 分类和书签拖拽排序
- 后台列表搜索、分页和内部滚动
- 首页右键快捷编辑书签
- 多来源图标候选和本地图标缓存
- 站点设置按基础、背景、卡片及图标、搜索引擎、自定义页脚分组，另支持数据备份

## 🚢 部署方式

CF-Navs 提供两条部署路线。熟悉命令行时建议使用 **Wrangler CLI 部署**；想全程在 Cloudflare 控制台完成，可以使用 **Cloudflare 控制台在线部署**。

### ⚡ 方式一：Wrangler CLI 部署

前置要求：

- Node.js 18+
- npm
- Cloudflare 账号

安装依赖：

```bash
npm install
```

创建 Cloudflare 资源：

```bash
npx wrangler login
npx wrangler d1 create cf-navs-db
npx wrangler kv namespace create SESSION
```

生成本地 Wrangler 配置：

```bash
npm run setup:wrangler
```

该命令会生成 Git 忽略的 `wrangler.local.toml`，用于保存真实的 D1 和 KV 资源 ID。不要把真实资源 ID 或密钥提交到公开仓库。

设置管理员密码：

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
```

初始化数据库并部署：

```bash
npm run db:init:remote
npm run deploy
```

部署成功后，访问 Wrangler 返回的 Workers URL。首次登录用户名默认为 `admin`，密码为 `INIT_ADMIN_PASSWORD`。

### 🖥️ 方式二：Cloudflare 控制台在线部署

这种方式适合不想在本地运行 Wrangler 的用户。Cloudflare Workers Builds 支持从 GitHub/GitLab 仓库导入项目，并在 push 后自动构建和部署；D1 和 KV 通过控制台手动绑定，不需要在仓库里填写资源 ID。

1. 在 GitHub 上 Fork 本仓库。
2. 登录 Cloudflare 控制台，进入 **Workers & Pages**，选择 **Create application**。
3. 在 **Import a repository** 旁选择 **Get started**，关联 GitHub 账号并选择你的 fork。
4. 创建 Worker 时，项目名建议使用 `cf-navs`。如果使用其他名字，请同步修改 fork 中 `wrangler.toml` 的 `name`。
5. 构建设置建议如下：

| 配置项 | 值 |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | 留空 |
| Deploy command | `npm run build && npx wrangler deploy` |

6. 保存并完成首次部署。首次访问可能会因为还没有绑定数据库和 KV 而不可用，这是正常的。
7. 在 Cloudflare 控制台创建 D1 数据库 `cf-navs-db`，打开 SQL Console，执行 [schema.sql](schema.sql) 初始化表结构。
8. 在 Worker 的 **Settings → Bindings** 中添加绑定：

| 类型 | 绑定名 | 选择 |
| --- | --- | --- |
| D1 database | `DB` | `cf-navs-db` |
| KV namespace | `SESSION` | 你的会话 KV 命名空间 |

9. 在 Worker 的 **Settings → Variables & Secrets** 中添加运行时 Secret：

```text
INIT_ADMIN_PASSWORD = 你的管理员密码
```

10. 重新部署或重试最近一次部署，然后访问 Workers URL。

> ⚠️ 注意：绑定名必须是 `DB` 和 `SESSION`。公开 `wrangler.toml` 不包含 D1/KV 资源 ID，在线部署依赖 Dashboard 绑定；本地 CLI 部署会通过 Git 忽略的 `wrangler.local.toml` 写入 ID。Cloudflare 要求控制台中的 Worker 名称与 Wrangler 配置里的 `name` 保持一致，否则 Git 集成构建会失败。默认项目名是 `cf-navs`。

## 💻 本地开发

开启两个终端：

```bash
npm run dev
```

```bash
npm run dev:web
```

访问 `http://localhost:5173` 查看前端页面。验证完成后，在对应终端按 `Ctrl+C` 停止 Worker 和 Vite 服务。

## 🧰 常用命令

```bash
npm run dev                # 启动 Worker 开发服务
npm run dev:web            # 启动前端开发服务器
npm run build              # 构建前端
npm run type-check         # TypeScript 与 Svelte 类型检查
npm run setup:wrangler     # 生成本地 wrangler.local.toml
npm run db:init            # 初始化本地 D1
npm run db:init:remote     # 初始化远程 D1
npm run deploy             # 本地构建并部署到 Cloudflare
```

## 🧱 技术栈

- **前端**：Svelte + TypeScript + Vite
- **后端**：Hono + Cloudflare Workers
- **数据库**：Cloudflare D1
- **会话存储**：Cloudflare KV
- **排序交互**：SortableJS

## 🗂️ 项目结构

```text
CF-Navs/
├── src/                  # 前端源码
├── worker/               # Cloudflare Worker 后端
├── shared/               # 前后端共享类型
├── public/               # 静态资源与 PWA 文件
├── scripts/              # Wrangler 配置、导入转换和检查脚本
├── docs/                 # 项目文档
├── schema.sql            # D1 数据库结构
├── wrangler.toml         # 公开模板配置
└── package.json
```

## 📖 文档

- [⚡ 快速开始](docs/QUICKSTART.md)：从创建资源到首次部署的最短路径。
- [🚢 部署检查清单](docs/DEPLOYMENT.md)：Cloudflare Workers 部署前后验证。
- [🧭 项目概览](docs/PROJECT_OVERVIEW.md)：模块结构、功能边界和架构说明。
- [🧩 技术细节](docs/TECHNICAL_NOTES.md)：图标缓存、边缘缓存、数据读取和性能策略。
- [🧱 维护性重构记录](docs/MAINTENANCE_REFACTOR_LOG.md)：近期拆分内容、验证方式和后续拆分建议。
- [🔌 API 契约](docs/API_CONTRACT.md)：前后端接口约定。
- [📦 Sun-Panel 导入](docs/SUNPANEL_IMPORT.md)：Sun-Panel 数据迁移指南。
- [🛠️ 问题排查](docs/TROUBLESHOOTING.md)：登录、部署、数据保存和图标显示等常见问题。

## 🔐 安全提示

- 使用强密码设置 `INIT_ADMIN_PASSWORD`。
- 不要提交 `.dev.vars`、`wrangler.local.toml` 或任何真实 Secret。
- 在线部署时，通过 Worker Settings 绑定 D1/KV，把管理员密码放在 Runtime Secret。
- 首次初始化后，管理员密码会以哈希形式存入 D1；后续请在后台 **站点设置 → 账号安全** 修改密码，单独修改 `INIT_ADMIN_PASSWORD` 不会覆盖已有密码。
- 自定义页脚 HTML 仅面向可信管理员编辑；生产 HTML 响应会设置 CSP，允许必要内联样式但不允许内联脚本和事件处理器执行。
- 生产环境建议定期导出备份 JSON。
- 如需额外访问控制，可以叠加 Cloudflare Access。

## 🙏 致谢

本项目参考了 [Sun-Panel](https://github.com/hslr-s/sun-panel) 的设计思路。

## 📄 License

[MIT](LICENSE)
