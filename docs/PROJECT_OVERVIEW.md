# CF-Navs 项目概览

## 📊 项目统计

- **项目类型**：个人导航面板
- **技术栈**：Cloudflare Workers + Svelte + D1 + KV
- **代码规模**：约 8000+ 行
- **组件数量**：15+ 个 Svelte 组件
- **API 端点**：22+ 个
- **开发周期**：2024年6月

## 🎯 核心功能

### 用户功能
- ✅ 响应式导航界面（桌面/移动端）
- ✅ 分类和书签浏览
- ✅ 首页标题独立展示，支持颜色和文字大小配置
- ✅ 多搜索引擎快速切换
- ✅ 首页搜索框直接筛选分类书签区域，匹配标题、URL、描述和分类名称
- ✅ 两种卡片风格（详情/极简）
- ✅ 自定义背景（纯色/渐变/图片）
- ✅ 遮罩颜色与透明度后台可调
- ✅ 卡片背景颜色与透明度后台可调
- ✅ 主题切换（亮色/暗色/自动）
- ✅ 公开模式（可选）
- ✅ PWA app shell（生产环境 Service Worker）

### 管理功能
- ✅ 单管理员登录系统
- ✅ 分类 CRUD 操作
- ✅ 书签 CRUD 操作
- ✅ 前台右键编辑书签，编辑入口以卡片浮层显示
- ✅ 新增/编辑书签弹窗内部滚动，保存按钮保持可见
- ✅ 拖拽排序（分类和书签）
- ✅ 五种方式获取图标（自动解析 / Favicon.im / 完整标题文字图标 / Google / Iconify）
- ✅ 文字图标读取完整标题，并支持新增/编辑书签时选择 logo.surf 风格配色
- ✅ 图标代理缓存回退（Worker + D1 + Cloudflare edge cache + Service Worker）
- ✅ 书签列表搜索筛选
- ✅ 站点设置管理
- ✅ 数据导入导出
- ✅ 备份恢复功能

## 🏗️ 技术架构

### 前端
```
src/
├── views/              # 页面视图
│   ├── Home.svelte     # 首页
│   └── Admin.svelte    # 管理界面
├── components/         # 可复用组件
│   ├── Sidebar.svelte  # 侧边栏
│   ├── BookmarkCard.svelte  # 书签卡片
│   ├── BookmarkEditModal.svelte # 书签编辑弹窗
│   ├── CategorySection.svelte   # 分类区块
│   ├── SettingsPanel.svelte # 设置面板
│   ├── ...
├── lib/
│   ├── api.ts          # API 客户端
│   ├── stores.ts       # Svelte stores
│   ├── icons.ts        # 图标获取辅助（五种方式 + 文字图标配色）
│   └── importData.ts   # CF-Navs / SunPanel 导入转换
└── App.svelte          # 主应用
```

### 后端
```
worker/
├── routes/             # API 路由
│   ├── auth.ts         # 认证相关
│   ├── admin.ts        # 后台初始化聚合数据
│   ├── categories.ts   # 分类管理
│   ├── bookmarks.ts    # 书签管理
│   ├── icon.ts         # 缓存图标服务（公开）
│   ├── settings.ts     # 设置管理
│   └── favicon.ts      # 图标自动获取（服务端解析）
├── middleware/
│   └── auth.ts         # 认证中间件
├── lib/
│   ├── db.ts           # 数据库操作（含幂等迁移）
│   └── ...
└── index.ts            # Worker 入口
```

### 数据模型
```sql
-- 设置表
settings (key TEXT PRIMARY KEY, value TEXT)

-- 分类表
categories (id, title, icon, sort, created_at)

-- 书签表
bookmarks (id, category_id, title, url, icon, icon_source, icon_blob,
           description, open_method, sort, created_at)
```

## 📦 主要依赖

### 前端
- `svelte`: ^4.2.19
- `vite`: ^5.4.21
- `typescript`: ^5.5.4
- `sortablejs`: ^1.15.3

### 后端
- `hono`: ^4.6.3
- `@cloudflare/workers-types`: ^4.20240909.0

## 🔧 配置说明

### wrangler.toml
```toml
name = "cf-navs"                    # Worker 名称
main = "worker/index.ts"            # Worker 入口
compatibility_date = "2025-06-01"   # 兼容性日期

[assets]                            # 静态资源配置
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[d1_databases]]                    # D1 数据库
binding = "DB"
database_name = "cf-navs-db"
database_id = "..."

[[kv_namespaces]]                   # KV 命名空间
binding = "SESSION"
id = "..."

[vars]
INIT_ADMIN_USER = "admin"          # 初始管理员用户名
SESSION_TTL = "604800"             # 会话有效期（7天）
```

### package.json 脚本
```json
{
  "dev": "wrangler dev",            # 启动 Worker 开发服务
  "dev:web": "vite",                # 启动前端开发服务
  "build": "vite build",            # 构建前端
  "type-check": "tsc --noEmit && svelte-check",
  "deploy": "npm run build && wrangler deploy",
  "db:init": "wrangler d1 execute cf-navs-db --local --file=./schema.sql",
  "db:init:remote": "wrangler d1 execute cf-navs-db --remote --file=./schema.sql"
}
```

## 🎨 设计特点

### UI 设计
- 现代化圆角设计
- 首页标题置于搜索框上方，管理操作以右上角悬浮图标呈现
- 毛玻璃效果（backdrop-filter）
- 柔和的阴影和过渡动画
- 响应式网格布局
- 移动端优化

### 交互设计
- 拖拽排序
- 平滑过渡动画
- 加载状态反馈
- 错误提示
- 确认对话框
- 前台书签右键菜单复用后台编辑弹窗和 API 流程，菜单浮在当前卡片内，不参与书签网格排版
- 新增/编辑书签弹窗锁定主页面滚动，长表单在弹窗表单区内部滚动，底部操作栏粘住可点

### 可访问性
- 语义化 HTML
- 键盘导航支持
- ARIA 标签
- 响应式字体大小

## 📈 性能优化

### 前端
- Vite 快速构建
- 首页主包、后台管理和书签编辑弹窗代码分割，后台功能按需加载
- CSS 压缩
- 图标代理响应由 Service Worker cache-first 读取，页面滚动、搜索筛选和设置保存后优先命中本地缓存
- 首页搜索预计算书签索引，滚动高亮缓存分区 DOM 并用 `requestAnimationFrame` 节流
- 后台初始化使用 `/api/admin/data` 一次拉取分类、书签和完整设置
- 后台 CRUD、排序和设置保存后使用接口返回值增量更新本地 store，避免额外拉取全量 `/api/public/data`

### 后端
- D1 索引优化
- KV 会话缓存
- Worker 边缘计算
- `/api/config` 使用短 TTL Cloudflare edge cache，设置保存和导入后主动失效
- 匿名 `/api/public/data` 使用 Cloudflare edge cache，写入接口负责失效缓存
- `/api/admin/data` 合并后台进入时的数据读取，减少 Worker 请求数和 settings 重复 D1 查询
- `/api/icon/:id`、`/api/category-icon/:id` 与 `/api/iconify/:set/:name.svg` 统一代理外站图标，失败时返回临时 SVG fallback，不缓存第三方失败结果
- 静态资源 CDN

### 网络
- Cloudflare CDN 全球加速
- HTTPS 强制
- Brotli/Gzip 压缩

## 🔒 安全特性

- 密码使用 WebCrypto PBKDF2 哈希存储
- Session token 随机生成
- CSRF 防护（SameSite cookie）
- XSS 防护（内容转义）
- 管理员操作鉴权
- Secret 管理（Wrangler secrets）

## 📝 开发规范

### 代码风格
- TypeScript 严格模式
- ESLint + Prettier（推荐）
- 组件单一职责
- 类型安全

### Git 提交
- 功能分支开发
- 清晰的提交信息
- Pull Request 审查

### 测试（待完善）
- 单元测试（推荐 Vitest）
- 集成测试
- E2E 测试（推荐 Playwright）

## 🚀 部署流程

### 开发环境
1. `npm install` - 安装依赖
2. `npm run dev` - 启动 Worker
3. `npm run dev:web` - 启动前端
4. 访问 `http://localhost:5173`

### 生产环境
1. 配置 Cloudflare 资源（D1/KV）
2. 设置 Secret（管理员密码）
3. 初始化数据库
4. `npm run deploy` - 部署

## 📚 文档结构

```
docs/
├── QUICKSTART.md       # 快速开始
├── DEPLOYMENT.md       # 部署指南
├── API_CONTRACT.md     # API 契约
├── PROJECT_OVERVIEW.md # 项目概览
└── SUNPANEL_IMPORT.md  # Sun-Panel 数据导入说明
```

## 🎯 未来规划

### 短期计划
- [ ] 完善单元测试
- [ ] 添加 E2E 测试
- [ ] 性能监控
- [ ] 错误日志收集

### 中期计划
- [ ] 浏览器插件
- [ ] API 文档自动生成
- [ ] 多语言支持（i18n）

### 长期计划
- [ ] 多用户支持（可选）
- [ ] 团队协作功能
- [ ] 数据分析面板
- [ ] 第三方集成

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 License

MIT License - 详见 [LICENSE](../LICENSE) 文件

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/) - 提供 Serverless 平台
- [Svelte](https://svelte.dev/) - 提供前端框架
- [Hono](https://hono.dev/) - 提供轻量级 Web 框架
- [Sun-Panel](https://github.com/hslr-s/sun-panel) - 提供设计灵感

---

**CF-Navs** - 让导航更简单 🎉
