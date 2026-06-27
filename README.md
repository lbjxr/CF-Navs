# CF-Navs

一个部署在 **Cloudflare Workers** 上的轻量级个人导航面板。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)

## ✨ 特性

- 🚀 **全栈 Serverless**：基于 Cloudflare Workers + D1 + KV
- 🎨 **现代化界面**：Svelte + Vite 构建，响应式设计
- 🔐 **单用户管理**：简单的管理员模式，支持公开访问
- 📱 **移动端适配**：完美支持桌面和移动设备
- 🎯 **拖拽排序**：直观的分类和书签排序
- 🌓 **主题切换**：支持亮色/暗色/自动主题
- 🔍 **多搜索引擎**：内置多个搜索引擎快速切换
- 📦 **卡片样式**：支持详情风格和极简风格两种展示
- 🎨 **自定义背景**：支持纯色、渐变、图片背景
- 🔖 **四源图标获取**：自动解析 / Favicon.im / 文字图标 / Google 四种方式
- 💾 **图标本地缓存**：后台自动缓存图标，前台逐层降级保障显示
- 🎨 **卡片背景配置**：卡片背景颜色和透明度后台可调
- ✏️ **前台快捷编辑**：管理员登录后可在首页右键编辑书签，弹窗内可保存或二次确认删除

## 🛠️ 技术栈

- **前端**：Svelte + TypeScript + Vite
- **后端**：Hono (Cloudflare Workers)
- **数据库**：Cloudflare D1 (SQLite)
- **会话存储**：Cloudflare KV
- **部署平台**：Cloudflare Workers

## 📦 项目结构

```
CF-Navs/
├── src/                    # 前端源码
│   ├── components/         # Svelte 组件
│   ├── views/              # 页面视图
│   ├── lib/                # API 和状态管理
│   └── App.svelte          # 主应用
├── worker/                 # Worker 后端
│   ├── routes/             # API 路由
│   ├── middleware/         # 中间件
│   └── lib/                # 工具函数
├── shared/                 # 前后端共享类型
├── public/                 # 静态资源
├── docs/                   # 文档和截图
├── schema.sql              # 数据库结构
├── wrangler.toml           # Cloudflare 配置
└── package.json

```

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 pnpm
- Cloudflare 账号
- Wrangler CLI（已包含在依赖中）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cloudflare 资源

#### 创建 D1 数据库

```bash
npx wrangler d1 create cf-navs-db
```

将返回的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cf-navs-db"
database_id = "你的数据库ID"
```

#### 创建 KV 命名空间

```bash
npx wrangler kv namespace create SESSION
```

将返回的 `id` 填入 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "SESSION"
id = "你的KV命名空间ID"
```

#### 设置管理员密码

```bash
npx wrangler secret put INIT_ADMIN_PASSWORD
```

输入你的管理员密码（建议使用强密码）。

### 3. 初始化数据库

**本地开发：**
```bash
npm run db:init
```

**生产环境：**
```bash
npm run db:init:remote
```

### 4. 本地开发

开启两个终端：

**终端 1 - 启动 Worker 后端：**
```bash
npm run dev
```

**终端 2 - 启动前端开发服务器：**
```bash
npm run dev:web
```

访问 `http://localhost:5173` 查看效果。

### 5. 部署到 Cloudflare

确保已完成上述所有配置步骤，然后执行：

```bash
npm run deploy
```

部署成功后，访问你的 Workers 域名即可使用。

## 🔑 首次登录

1. 访问你的导航站点
2. 点击右上角的 **⚙️** 图标
3. 使用以下凭据登录：
   - **用户名**：`admin`（在 `wrangler.toml` 中配置）
   - **密码**：你设置的 `INIT_ADMIN_PASSWORD`

登录后即可进入后台管理界面。

## 📖 功能说明

### 分类管理

- ✅ 创建、编辑、删除分类
- ✅ 拖拽排序
- ✅ 折叠/展开控制

### 书签管理

- ✅ 创建、编辑、删除书签
- ✅ 前台右键编辑书签，编辑弹窗支持二次确认删除
- ✅ 自动获取网站图标
- ✅ 拖拽排序
- ✅ 支持新窗口打开设置

### 站点设置

- ✅ 站点标题自定义
- ✅ 首页标题颜色和文字大小可配置
- ✅ 公开模式（开启后未登录用户可访问）
- ✅ 主题模式（亮色/暗色/跟随系统）
- ✅ 图床地址配置
- ✅ 背景设置（纯色/渐变/图片）
- ✅ 搜索引擎管理
- ✅ 卡片样式（详情/极简）
- ✅ 卡片尺寸自定义
- ✅ 图标大小自定义
- ✅ 描述显示开关

### 数据管理

- ✅ 导出备份（JSON）
- ✅ 导入恢复
- ✅ 一键清空数据

## 🎨 自定义样式

### 卡片样式

支持两种卡片风格：

1. **详情风格**：显示图标、标题和描述，横向布局
2. **极简风格**：仅显示图标和标题，纵向布局

### 首页标题

首页标题显示在搜索栏上方，可在后台配置文案、颜色和文字大小。管理员入口和退出按钮作为右上角悬浮图标单独显示。

### 背景设置

支持三种背景类型：

1. **纯色**：使用 CSS 颜色值，如 `#0f172a`
2. **渐变**：使用 CSS 渐变，如 `linear-gradient(135deg, #667eea, #764ba2)`
3. **图片**：使用图片 URL，支持模糊和遮罩效果

## 📝 环境变量

本地开发时，复制 `.dev.vars.example` 为 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars` 填入你的配置：

```env
INIT_ADMIN_PASSWORD=你的管理员密码
```

## 🔧 常用命令

```bash
# 开发
npm run dev              # 启动 Worker 后端
npm run dev:web          # 启动前端开发服务器

# 构建
npm run build            # 构建前端
npm run type-check       # TypeScript 类型检查

# 数据库
npm run db:init          # 初始化本地 D1
npm run db:init:remote   # 初始化远程 D1

# 部署
npm run deploy           # 构建并部署到 Cloudflare
```

## 📄 API 文档

### 公开接口

- `GET /api/config` - 获取站点配置
- `GET /api/public/data` - 获取公开数据（分类和书签）

### 认证接口

- `POST /api/login` - 管理员登录
- `POST /api/logout` - 退出登录
- `GET /api/me` - 获取当前用户信息

### 分类管理

- `GET /api/categories` - 获取所有分类
- `POST /api/categories` - 创建分类
- `PUT /api/categories/:id` - 更新分类
- `DELETE /api/categories/:id` - 删除分类
- `POST /api/categories/sort` - 排序分类

### 书签管理

- `GET /api/bookmarks` - 获取所有书签
- `POST /api/bookmarks` - 创建书签
- `PUT /api/bookmarks/:id` - 更新书签
- `DELETE /api/bookmarks/:id` - 删除书签
- `POST /api/bookmarks/sort` - 排序书签
- `GET /api/fetch-favicon?url=` - 获取网站图标

### 设置管理

- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置

详细 API 文档请查看 [docs/development/API_CONTRACT.md](docs/development/API_CONTRACT.md)

## 🔒 安全建议

1. **使用强密码**：设置 `INIT_ADMIN_PASSWORD` 时使用强密码
2. **保护 Secret**：不要将密码提交到 Git 仓库
3. **HTTPS**：Cloudflare Workers 默认强制 HTTPS
4. **会话过期**：默认会话有效期 7 天，可在 `wrangler.toml` 中调整

## 🐛 问题排查

### 登录失败

1. 检查 `INIT_ADMIN_PASSWORD` 是否正确设置
2. 检查 KV 命名空间是否正确绑定
3. 查看浏览器控制台错误信息

### 数据无法保存

1. 检查 D1 数据库是否正确绑定
2. 确认已执行数据库初始化脚本
3. 查看 Worker 日志：`npx wrangler tail`

### 部署失败

1. 确认 `wrangler.toml` 配置正确
2. 确认已登录 Cloudflare：`npx wrangler login`
3. 检查 D1 和 KV 资源是否已创建

## 📚 更多文档

- [快速开始](docs/QUICKSTART.md) - 快速部署和首次使用
- [部署检查清单](docs/DEPLOYMENT.md) - Cloudflare Workers 部署流程
- [项目概览](docs/PROJECT_OVERVIEW.md) - 代码结构、功能和架构
- [Sun-Panel 导入说明](docs/SUNPANEL_IMPORT.md) - Sun-Panel 数据迁移指南

## 🙏 致谢

本项目参考了 [Sun-Panel](https://github.com/hslr-s/sun-panel) 的设计思路。

## 📝 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受你的个人导航面板！** 🎉
