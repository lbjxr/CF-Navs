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
- 🔖 **五源图标获取**：自动解析 / Favicon.im / 完整标题文字图标 / Google / Iconify 五种方式
- 🎛️ **文字图标配色**：新增/编辑书签时可选择 logo.surf 风格的默认配色方案
- 💾 **图标本地缓存**：后台自动缓存图标，前台逐层降级保障显示
- ⚡ **图标缓存代理**：书签和分类图标优先走 Worker + D1 + Cloudflare 边缘缓存，避免页面刷新或筛选时反复请求外站
- 🔎 **本地书签筛选**：搜索栏输入关键词时直接筛选首页分类区域，匹配标题、描述、URL 和分类
- 🎨 **卡片背景配置**：卡片背景颜色和透明度后台可调
- ✏️ **前台快捷编辑**：管理员登录后可在首页右键编辑书签，编辑入口以卡片浮层显示
- 📲 **PWA 支持**：生产构建注册 Service Worker，提供基础离线 app shell

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
├── wrangler.toml           # 公开模板配置（资源 ID 使用占位符）
├── wrangler.local.toml     # 本地私密配置（Git 忽略，需自行生成）
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

创建后无需把真实 ID 提交到 `wrangler.toml`。本项目使用 Git 忽略的 `wrangler.local.toml` 保存本地部署配置。

#### 创建 KV 命名空间

```bash
npx wrangler kv namespace create SESSION
```

#### 生成本地部署配置

```bash
npm run setup:wrangler
```

该命令会从当前 Cloudflare 账号读取 `cf-navs-db` 和 `SESSION`，生成 `wrangler.local.toml`；这个文件不会被 Git 跟踪。

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

### 书签管理

- ✅ 创建、编辑、删除书签
- ✅ 前台右键编辑书签，编辑按钮浮在当前卡片上，不挤占卡片网格
- ✅ 新增/编辑弹窗锁定页面滚动，内容过高时在弹窗内滚动并保持保存按钮可见
- ✅ 自动获取网站图标
- ✅ 文字图标读取完整书签标题，默认使用 #000000 背景与 #FFA31A 文字
- ✅ 新增/编辑书签时可选择 logo.surf 风格默认配色，并保存为本地 SVG data URI
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

## 🎨 自定义样式

### 卡片样式

支持两种卡片风格：

1. **详情风格**：显示图标、标题和描述，横向布局
2. **极简风格**：仅显示图标和标题，纵向布局

### 首页标题

首页标题显示在搜索栏上方，可在后台配置文案、颜色和文字大小。管理员入口和退出按钮作为右上角悬浮图标单独显示。

### 文字图标

选择"文字图标"时，系统会用完整书签标题生成本地 SVG 图标。默认配色是黑色背景 `#000000` 与橙色文字 `#FFA31A`，新增/编辑书签弹窗中也可以选择内置的 logo.surf 风格配色。所选配色会随书签图标一起保存，首页渲染时优先使用保存的 SVG。

### 图标缓存与外站降级

HTTP(S) 书签图标不会在首页直接请求原始外站地址，而是优先通过 `/api/icon/:id` 读取 D1 缓存和 Cloudflare 边缘缓存；代理 cache miss 时会一次性读取书签图标地址、标题和 `icon_blob`，避免每个图标拆成多次 D1 查询。外站图标抓取成功后直接以图片字节返回并写入 edge cache，只有书签图标需要持久化到 D1 时才生成 base64 data URI，减少 Worker CPU 编解码开销。分类图标通过 `/api/category-icon/:id` 代理加载。Favicon.im 或其他第三方图标服务限流、超时、返回错误或书签图标缺失时，后端会返回 `no-store` 的临时 SVG 文字图标，避免前台 `<img>` 产生 404，也不会把失败结果写入浏览器、Service Worker 或 Cloudflare 长期缓存。

Iconify 图标使用 `https://api.iconify.design/{set}/{name}.svg` 作为保存格式，新增/编辑书签时会给出 Iconify 候选，也可以填写 `mdi:home`、`simple-icons:github` 这类图标名；候选、手动输入预览和首页/后台已保存的 Iconify 图标都走 `/api/iconify/:set/:name.svg` 同源代理。Service Worker 会对 `/api/icon/*`、`/api/category-icon/*`、`/api/iconify/*` 和兼容旧版本的 Iconify SVG 使用 cache-first 策略；同一个 Iconify 图标在本地浏览器只缓存一份，后台修改书签、配置或首页搜索筛选导致组件重新渲染时，仍优先读取本地缓存。部署新版后如浏览器仍使用旧逻辑，请强制刷新一次页面，让新版 Service Worker 激活。

### 访问性能

前台轻量配置接口 `/api/config` 和公开聚合接口 `/api/public/data` 都使用短 TTL Cloudflare edge cache，并在设置保存或数据导入后失效；匿名公开聚合命中 edge cache 时直接返回，不再先读取 D1 settings。普通首页启动优先匿名请求 `/api/public/data` 并从响应中派生站点配置，浏览器本地存在登录态也不会让公开首页绕过匿名 edge cache，也不会预加载 `/api/admin/data`；只有公开模式关闭且本地已登录时，前端才会带 token 重试一次以加载私有首页数据。公开模式关闭时，匿名 `/api/public/data` 的 1005 响应会携带轻量站点配置供登录页使用，并以浏览器 `max-age=0`、边缘短 TTL 的方式缓存；cache miss 时会优先复用 `/api/config` edge cache，没有命中时才只读取 `site_title/public_mode` 并顺手预热 `/api/config` 缓存，确认公开后才读取分类和书签，因此私有站点匿名访问不会反复读取 D1 首页数据，首屏也不再额外请求 `/api/config`。公开 settings、分类和书签查询/响应都只保留首页实际使用字段，不读取也不携带 `custom_css/custom_js`、分类/书签 `created_at` 等完整管理字段；公开聚合确认可公开后用一次 D1 batch 同时读取公开 settings、分类和书签，同一请求刚从 D1 读取过的 `site_title/public_mode` 会直接合并进公开 settings，不在第二次 settings 查询里重复读取。后台进入或首页管理操作需要后台数据时，才使用 `/api/admin/data` 一次返回分类、书签和完整设置，并从完整设置派生站点配置，不再额外请求 `/api/config`，减少管理端初始化网络往返和 settings 重复读取，并通过 D1 batch 合并聚合读取。导入恢复接口会直接返回导入后的后台聚合数据，前端用该响应替换本地 store，不再导入后追加请求 `/api/admin/data`。公开聚合、后台聚合、书签列表和图标详情等读取路径正常情况下不再预跑运行时 schema 检查，只有遇到旧库缺列错误时才执行迁移并重试一次，降低 Worker 冷启动 D1 开销。登录初始化和密码校验使用一次 settings 查询同时读取管理员账号与密码，避免登录请求重复读取账号/密码设置。登录响应直接返回用户名，登录成功后不再额外请求 `/api/me`；已有登录态刷新页面不会先请求 `/api/me`，后台入口按需通过 `/api/admin/data` 完成 token 校验；前端 API 客户端会在内存中复用已解析的有效登录态，避免每个认证请求重复读取和解析 localStorage，同时监听跨标签页 storage 变更。后台新增、编辑、删除、排序和保存设置后，前端会用接口返回值增量更新本地 public/admin store，不再额外拉取全量 `/api/public/data`；后台设置面板保存完整设置时，Worker 写入 D1 后直接用本次提交的设置构造响应，不再追加读取 settings 全表。分类删除直接通过删除语句的 `changes` 判断是否存在，不再删除前额外查询分类；分类和书签排序查询配有复合索引，降低 D1 排序扫描成本。

公开首页只加载首页主包，登录弹窗、后台管理和书签编辑弹窗按需分包加载；未登录用户点击管理入口或私有站点打开登录页时，只加载轻量登录弹窗，登录成功后才下载后台管理分包。Worker 对 `/assets/*` 构建产物显式设置一年 immutable 缓存，对 HTML 和 `sw.js` 设置 no-cache 重验证；即使 SPA fallback 在资源缺失时返回 HTML，也不会被当作 `/assets/*` 长缓存，兼顾静态资源复用和新版入口及时生效。Service Worker 预缓存 `/index.html` 作为离线导航回退，不再额外预缓存根路径，减少安装阶段重复 HTML 请求；运行时只缓存成功的静态资源和成功 HTML 导航响应，避免 404/500 或异常页面污染本地缓存。首页书签和分类图标使用浏览器原生懒加载与异步解码，首屏外图标会延后请求；普通外站图标走 `/api/icon/*`、`/api/category-icon/*`，Iconify 图标走稳定的 `/api/iconify/*`，都由 Service Worker cache-first 复用。首页搜索会预计算并缓存书签搜索索引，只有分类/书签数据变化时才重建；滚动高亮使用缓存的分区 DOM 和 `requestAnimationFrame` 节流，减少大量书签场景下的主线程开销。

### 首页搜索

搜索框输入关键词时会直接筛选首页书签区域，不再弹出本地书签下拉列表。匹配字段包括书签标题、URL、描述和分类名称；按 Enter 仍会使用当前选中的搜索引擎进行外部搜索。

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
- `GET /api/admin/data` - 获取后台初始化聚合数据

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
- `GET /api/icon/:id` - 读取书签图标代理缓存
- `GET /api/category-icon/:id` - 读取分类图标代理缓存
- `GET /api/iconify/:set/:name.svg` - 读取 Iconify 图标预览代理缓存

### 设置管理

- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置

详细 API 文档请查看 [docs/API_CONTRACT.md](docs/API_CONTRACT.md)。

## 🔒 安全建议

1. **使用强密码**：设置 `INIT_ADMIN_PASSWORD` 时使用强密码
2. **保护 Secret**：不要将密码提交到 Git 仓库
3. **HTTPS**：Cloudflare Workers 默认强制 HTTPS
4. **会话过期**：默认会话有效期 7 天，可在 `wrangler.local.toml` 中调整

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

1. 确认已运行 `npm run setup:wrangler` 并生成 `wrangler.local.toml`
2. 确认已登录 Cloudflare：`npx wrangler login`
3. 检查 D1 和 KV 资源是否已创建

## 📚 更多文档

- [快速开始](docs/QUICKSTART.md) - 快速部署和首次使用
- [部署检查清单](docs/DEPLOYMENT.md) - Cloudflare Workers 部署流程
- [项目概览](docs/PROJECT_OVERVIEW.md) - 代码结构、功能和架构
- [API 契约](docs/API_CONTRACT.md) - 前后端接口约定
- [Sun-Panel 导入说明](docs/SUNPANEL_IMPORT.md) - Sun-Panel 数据迁移指南

## 🙏 致谢

本项目参考了 [Sun-Panel](https://github.com/hslr-s/sun-panel) 的设计思路。

## 📝 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受你的个人导航面板！** 🎉
