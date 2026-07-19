# CF-Navs 项目概览

## 📊 项目定位

- **项目类型**：个人导航面板
- **技术栈**：Cloudflare Workers + Svelte + D1 + KV
- **运行边界**：单 Worker 承载 API 与静态资源，D1 保存业务数据，KV 保存管理员会话
- **管理模型**：单管理员、可选公开首页、前后台共享设置与书签数据

代码量、组件数、接口数和测试数会随版本持续变化，不在本说明中维护容易失效的静态统计；以当前源码、`package.json` 脚本和测试输出为准。

## 🎯 核心功能

### 用户功能
- ✅ 响应式导航界面：后台可选择左侧或顶部布局
- ✅ 两层分类和书签浏览；一级、二级分类均可直接保存书签
- ✅ 左侧导航支持桌面悬停展开或常显、手动收缩偏好记忆；移动端始终使用按钮和抽屉
- ✅ 顶部导航固定悬浮，受内容区域最大宽度约束；桌面支持箭头和鼠标拖动，移动端支持触摸横向滑动
- ✅ 首页标题独立展示，支持颜色和文字大小配置
- ✅ 多搜索引擎快速切换
- ✅ 首页搜索框按完整分类路径筛选，搜索父级名称可命中后代并保留祖先结构
- ✅ 两种卡片风格（详情/极简）
- ✅ 详情卡片描述支持始终显示、悬停提示和隐藏，单个书签可覆盖全局策略
- ✅ 自定义背景（浅色/深色主题分别配置纯色/渐变/图片），并内置 13 组毛玻璃渐变与 9 组护眼纯色方案；护眼方案使用综合色相更明确的浅色前台背景、同色系卡片和可调透明度
- ✅ 遮罩颜色与透明度后台可调
- ✅ 卡片背景颜色与透明度后台可调
- ✅ 主题切换（亮色/暗色/自动 + 前台本地快速切换）
- ✅ 公开模式（可选）
- ✅ PWA app shell（生产环境 Service Worker）
- ✅ 刷新时优先恢复本地聚合快照，后台校验数据版本；弱网时保留已有内容。直接刷新 `/admin` 时保持启动加载态，认证和后台分包就绪后直接进入后台，不先渲染首页

### 管理功能
- ✅ 单管理员登录系统
- ✅ 两层分类 CRUD、编辑移动、含子分类删除保护
- ✅ 书签 CRUD 操作
- ✅ 前台右键编辑书签，编辑入口以卡片浮层显示
- ✅ 新增/编辑书签弹窗内部滚动，保存按钮保持可见
- ✅ 同级拖拽排序；分类排序请求必须提交指定父级下的完整兄弟集合
- ✅ 分类列表按每页 10 个一级分类分页，子分类默认折叠并按父级展开；书签列表每页 10 条
- ✅ 多种方式获取图标（Favicon.im / 完整标题文字图标 / Google / Iconify / 自定义 URL、文字或表情）
- ✅ 文字图标读取完整标题，长标题最多自动换行 4 行，并支持新增/编辑书签时选择 logo.surf 风格配色
- ✅ 图标代理缓存与本地缓存优先读取（Worker + D1 + Cloudflare edge cache + 浏览器本地缓存）
- ✅ 书签列表搜索筛选
- ✅ 分类和书签跨分页批量选择、批量删除
- ✅ 后台书签列表按标题、分类、链接域名和打开方式进行不落盘排序
- ✅ 站点设置管理（站点信息、外观与卡片、布局与导航、搜索设置、页脚内容、账号安全六个二级子菜单）；标题内容、颜色和字号集中在站点信息，图床服务位于其“外部资源”子区块
- ✅ 数据导入导出，支持 CF-Navs、SunPanel JSON 和浏览器书签 HTML 的合并或覆盖
- ✅ 备份恢复功能

## 🏗️ 技术架构

### 前端
```
src/
├── views/              # 页面视图
│   ├── Home.svelte     # 首页数据过滤、滚动定位和分类渲染编排
│   └── Admin.svelte    # 管理界面 tab、弹窗和设置/备份编排
├── components/         # 可复用组件
│   ├── Sidebar.svelte  # 左侧/顶部分类导航及临时交互状态
│   ├── BookmarkCard.svelte  # 书签卡片状态编排
│   ├── BookmarkIcon.svelte  # 书签图标展示
│   ├── BookmarkContextMenu.svelte # 前台右键编辑菜单
│   ├── BookmarkLinkModal.svelte # 当前页弹层打开链接
│   ├── BookmarkEditModal.svelte # 书签编辑弹窗
│   ├── BookmarkIconCandidatePicker.svelte # 书签图标候选列表
│   ├── BookmarkCustomIconField.svelte # 自定义图标输入和预览
│   ├── CategorySection.svelte   # 分类区块
│   ├── HomeFloatingActions.svelte # 首页右上角浮动操作
│   ├── HomeHeroSearch.svelte # 首页标题和搜索框
│   ├── SettingsPanel.svelte # 设置面板
│   ├── admin/          # 后台列表面板与样式
│   ├── ...
├── lib/
│   ├── api.ts          # API 客户端
│   ├── stores.ts       # Svelte stores
│   ├── icons.ts        # 图标候选辅助（多源候选 + 文字图标配色）
│   ├── adminDataCache.ts # 登录态后台聚合数据浏览器本地快照
│   ├── localBookmarkIconCache.ts # 书签图标浏览器本地缓存
│   ├── appNavigation.ts # 首页访问/启动落点判定
│   ├── appImportExport.ts # 备份导出/导入 controller
│   ├── appSortQueue.ts # 排序保存队列 + 乐观排序编排
│   ├── errorMonitor.ts # 生产错误分类、全局捕获和批量上报
│   ├── sortableList.ts  # 通用拖拽排序 action
│   ├── navigationLayout.ts # 导航收缩偏好与顶部溢出计算
│   ├── themePresets.ts  # 站点背景渐变与外观预设
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
│   ├── errorReport.ts  # 前端运行时错误上报
│   └── favicon.ts      # 图标自动获取（服务端解析）
├── middleware/
│   └── auth.ts         # 认证中间件
├── lib/
│   ├── db.ts           # 数据库操作（含幂等迁移）
│   ├── settingsData.ts # settings 默认值、旧数据兼容和归一化
│   ├── iconResponses.ts # 图标响应、fallback 与 edge cache 写入
│   ├── iconifySearch.ts # Iconify 搜索、候选排序和代理缓存预热
│   ├── svgColor.ts     # SVG 色彩识别
│   ├── bookmarkIconCache.ts # 书签图标 blob 缓存刷新
│   └── ...
└── index.ts            # Worker 入口
```

### 数据模型
```sql
-- 设置表
settings (key TEXT PRIMARY KEY, value TEXT)

-- 分类表
categories (id, parent_id, title, icon, sort, created_at)

-- 书签表
bookmarks (id, category_id, title, url, icon, icon_source, icon_blob,
           description, open_method, sort, created_at)
```

## 📦 主要依赖

### 前端
- `svelte`: ^4.2.19
- `vite`: ^5.4.6
- `typescript`: ^5.5.4
- `sortablejs`: ^1.15.3

### 后端
- `hono`: ^4.12.27
- `@cloudflare/workers-types`: ^4.20260702.1

## 🔧 配置说明

### wrangler.toml
```toml
name = "cf-navs"                    # Worker 名称
main = "worker/index.ts"            # Worker 入口
compatibility_date = "2025-06-01"   # 兼容性日期

[[rules]]                           # 将安装 schema 作为文本模块打包
type = "Text"
globs = ["**/schema.sql"]
fallthrough = true

[assets]                            # 静态资源配置
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"

[[d1_databases]]                    # D1 数据库
binding = "DB"
database_name = "cf-navs-db"
# database_id omitted for Cloudflare Git automatic provisioning

[[kv_namespaces]]                   # KV 命名空间
binding = "SESSION"
# id omitted for Cloudflare Git automatic provisioning

[vars]
INIT_ADMIN_USER = "admin"          # 仅用于旧数据库升级/凭据恢复
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
- 首页内容统计与分类站点统计跟随当前主题和自定义文字色自动适配
- 前台分类快速选择栏复用书签卡片的 `--card-bg-rgb` / `--card-bg-opacity` 玻璃背景变量，PC 折叠栏、展开栏和移动端触发按钮/抽屉保持同一视觉层级
- 后台管理侧边栏使用独立的 admin surface 变量，随 `data-theme` 切换浅色/深色表面、边框、阴影和 active 状态
- 毛玻璃方案的书签卡片使用 `backdrop-filter` 透出渐变背景；护眼纯色方案使用同色系浅卡片、主题化阴影和直接受 `card_background_opacity` 控制的透明度，亮暗模式分别提供高对比标题与备注颜色
- 柔和的阴影和过渡动画
- 响应式网格布局
- 移动端优化

### 交互设计
- 拖拽排序
- 后台分类和书签列表使用每页 10 条分页，普通模式下面板高度跟随当前页内容收紧；排序模式显示全量列表并保留面板内滚动，避免跨页排序错乱
- 平滑过渡动画
- 加载状态反馈
- 错误提示
- 确认对话框
- 前台书签右键菜单复用后台编辑弹窗和 API 流程，菜单浮在当前卡片内，不参与书签网格排版；同一时间只保留一个右键菜单，右键另一张卡片时会关闭前一个菜单
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
- 匿名首页启动优先使用本地公开快照加 `/api/data/version` 做远端确认；本地无快照或版本变化时才请求 `/api/public/data` 派生站点配置。公开关闭时复用 1005 响应中的轻量配置进入登录页，匿名 1005 会短时走 edge cache
- 登录弹窗、后台管理和书签编辑弹窗独立分包；未登录访问管理入口或私有站点登录页时只下载轻量登录弹窗，登录成功后回到前台首页，进入后台时才下载后台管理分包
- 加载提示使用轻量 CSS 动画和进度条，不依赖重型脚本或图片资源
- Worker 为非 HTML 的 `/assets/*` hash 构建产物设置一年 immutable 缓存，为 HTML 和 `sw.js` 设置 no-cache 重验证；Service Worker 预缓存 `/index.html` 做离线回退，避免安装阶段重复预缓存根路径，并且运行时只缓存成功静态资源和成功 HTML 导航响应，避免失败响应污染本地缓存
- CSS 压缩
- 首页普通书签图标优先读取聚合数据 `icon_blob`，没有内嵌图标时才读取浏览器本地图标缓存；仍缺失时回退已保存的普通 HTTP(S) 图标 URL，不主动挂载 `/api/icon/:id`；编辑弹窗先打开，再后台调用短超时刷新接口更新本地图标缓存，保存书签后也会显式刷新；首页图标接近视口后才设置 `src`，并继续使用原生懒加载与异步解码，降低首屏图标解码和请求压力
- 前台右上角主题按钮使用浏览器本地偏好快速切换亮暗模式，不触发 Worker 请求；新增/编辑书签弹窗默认收起文字图标配色和 Iconify 输入区，选中对应图标类型后才展开
- SunPanel 导入会识别 Iconify 图标名和 icon-sets 页面链接，导入后保存为标准 Iconify URL 并标记 `icon_source: iconify`；后台预览走 `/api/iconify/*` 代理，首页展示可直连 `api.iconify.design` 并复用浏览器 HTTP 缓存，避免按书签数量增加 Worker 请求
- 首页搜索预计算书签索引；滚动高亮缓存分区 DOM 并优先使用 `IntersectionObserver`，分类分区通过 `content-visibility: auto` 降低离屏渲染成本
- 顶部导航使用 `ResizeObserver` 合并更新溢出状态，箭头按约 70% 可视宽度滚动；左侧常显的手动收缩偏好仅保存在浏览器版本化 `localStorage` 键中
- 登录态启动会先读取后台聚合本地快照，再用 `/api/data/version` 做远端确认；版本相同时不拉完整数据，版本变化、无快照、后台入口需要完整数据或首页管理操作需要回滚时，才使用 `/api/admin/data` 一次拉取分类、书签和完整设置，并从完整设置派生站点配置。后台直达路径恢复快照时不会提前解除启动遮罩
- 登录响应携带用户名；登录成功和已有登录态启动都无需先请求 `/api/me`
- Worker 认证中间件在单个 isolate 内短时复用已验证 session，后台连续操作不必每个请求都读取 KV，登录成功和退出登录会同步更新该内存缓存
- 前端 API 客户端在内存中复用已解析的有效登录态，认证请求不再反复读取和解析 localStorage，并监听跨标签页 storage 变更
- 登录 bootstrap 与密码校验使用一次 settings 查询同时读取管理员账号和密码
- 登录失败记录复用限流中间件已读取的 KV 状态，避免失败路径重复读取同一个限流 key
- 登录成功时只有当前 IP 确实存在失败状态才删除限流 key，正常首次登录不再产生多余 KV delete
- 导入恢复接口直接返回导入后的后台聚合数据，前端无需导入后再请求 `/api/admin/data`；Worker 复用本次导入时已经规范化的分类和书签结果，只额外读取完整 settings，避免写入后再从 D1 重读刚导入的两张表
- 后台 CRUD、排序和设置保存后使用接口返回值增量更新本地 store，避免额外拉取全量 `/api/public/data`
- 完整聚合数据拉回后，前端按 `id` 合并分类和书签，未变化对象复用原引用，只动态替换变化项，降低手动刷新后的 UI 抖动
- 书签新增、编辑弹窗打开后和保存后通过显式刷新接口更新普通外站图标 blob；编辑打开时刷新在后台执行，不阻塞弹窗显示；刷新接口使用短超时，失败时保留已有 blob，首页可用保存的 HTTP(S) 图标 URL 兜底；普通渲染、搜索筛选和前后台切换不再重复请求外站图标并写 D1
- 后台保存设置和导入恢复的 settings 写入合并为单条多 VALUES upsert，减少完整配置保存时的 D1 statement 数
- 分类和书签排序使用分块 `UPDATE ... CASE id ... WHERE id IN (...)`，大列表拖拽排序时不再为每个 id 生成一条 D1 statement

### 后端
- D1 索引优化
- KV 会话缓存
- Worker 边缘计算
- `/api/config` 使用短 TTL Cloudflare edge cache，设置保存和导入后主动失效
- `/api/data/version` 使用内部 `settings.data_version` 做轻量变更确认；分类、书签、排序、设置、导入和实际变化的显式图标缓存刷新都会更新版本
- 匿名 `/api/public/data` 未携带 no-cache 指令时使用 Cloudflare edge cache，命中时不读取 D1；cache miss 时优先复用 `/api/config` edge cache，没有命中才轻量读取 `site_title/public_mode` 并预热配置缓存，私有模式下的匿名 1005 响应也短时缓存到 edge，写入接口负责失效缓存
- `/api/admin/data` 合并后台进入时的数据读取，分类、书签和 settings 使用 D1 batch 读取，并随响应携带当前数据版本；请求带 no-cache 指令时会绕过 Worker isolate 内的短 TTL 运行时聚合缓存
- `/api/public/data` 确认公开后用一次 D1 batch 合并公开 settings、分类和书签读取，并只读取首页公开字段；书签公开字段保留 `icon_blob` 以支持本地优先图标展示，但不返回 `created_at` 等管理字段；同请求内刚从 D1 读取过的 `site_title/public_mode` 会合并进公开 settings，避免第二次 settings 查询重复读取这两行
- 后台设置面板提交完整 `Settings` 字段时，`PUT /api/settings` 写入 D1 后直接由提交 payload 合成响应；只有兼容性部分更新请求才写后回读完整 settings
- 分类新增用 `INSERT ... SELECT ... RETURNING` 在目标父级作用域计算末尾排序；分类更新先读取当前父级和子分类状态，再用 `UPDATE ... RETURNING` 完成合法移动。书签新增仍在单条语句中判断分类是否存在；书签更新在 SQL 内只于图标变化时清空 `icon_blob`
- 分类删除先查询子分类数量执行保护，无子分类时再按删除语句 `changes` 判断目标是否存在，并显式删除直属书签
- 公开聚合、后台聚合、书签列表和图标详情等读取路径跳过预检查式 schema 迁移，仅在旧库缺列错误时迁移并重试一次
- `/api/icon/:id`、`/api/category-icon/:id` 与 `/api/iconify/:set/:name.svg` 统一提供图标代理能力，普通书签图标 cache miss 时一次 D1 查询同时读取地址和 `icon_blob`，外站抓取成功后直接返回图片字节；首页普通书签卡片优先读取聚合数据中的 `icon_blob`，没有内嵌图标时才读浏览器本地图标缓存，仍缺失时回退保存的 HTTP(S) 图标 URL，避免 favicon.im 等浏览器可直连图标保存后显示文字；首页不把 `/api/icon/:id` 作为普通浏览路径，后台列表仍可使用代理预览；Iconify 图标和 icon-sets 页面链接不写 `icon_blob`，后台预览通过稳定 `/api/iconify/*` 共享 edge cache，首页展示复用浏览器 HTTP 缓存的 Iconify SVG；Service Worker 不缓存跨域 `opaque` 图标响应，后台已有 `icon_blob` 预览不再复制写入本地图标缓存；普通 HTTP(S) 书签图标代理抓取失败时返回错误，图标缺失、非 HTTP(S) 值、分类图标或 Iconify 失败时仍使用短 TTL 临时 SVG fallback
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
- `tsc` 与 `svelte-check` 作为类型和组件诊断基线
- 组件单一职责
- 类型安全

### Git 提交
- 功能分支开发
- 清晰的提交信息
- Pull Request 审查

### 测试
- `npm run type-check`：TypeScript 与 Svelte 诊断，要求 0 error / 0 warning
- `npm test`：Vitest 单元与源码回归测试，覆盖前端 helper、Worker 逻辑、settings 数据归一化、安全权限、缓存、错误监控和排序编排；具体数量以本次命令输出为准
- `npm run build`：生产构建验证
- `git diff --check`：提交前空白检查
- `npm run regression:chrome`：生产 Chrome 回归，覆盖 API smoke、首页、后台、设置/备份、右键编辑、登录退出和安全权限；检查数量以脚本当前实现为准，安全测试中预期的 401 会归入 `network.expectedFailed`

## 🚀 部署流程

### 开发环境
1. `npm install` - 安装依赖
2. `npm run dev` - 启动 Worker
3. `npm run dev:web` - 启动前端
4. 访问 `http://localhost:5173`
5. 本地验证或测试完成后，在对应终端按 `Ctrl+C` 停止 Worker 和 Vite 服务，避免端口被长期占用

### 生产环境

- **Cloudflare Git（推荐新安装）**：Fork 仓库后在 Dashboard 使用 **Import a repository** 选择现有 Fork；通用 Deploy Button 只能创建新仓库。保留无 ID 的 `DB`/`SESSION` 声明，让 Git 引导流程创建绑定；添加加密 `SETUP_TOKEN`，部署后访问 `/install` 初始化 schema 和管理员。确认安装成功后建议删除或轮换该 Secret；公开状态检查不依赖它，安装锁由 D1 中的管理员凭据和完成标记判定。正常路径不需要 API Token、GitHub Actions 或手动 SQL。
- **Wrangler CLI**：创建 D1/KV，运行 `npm run setup:wrangler`，设置加密 Secret `SETUP_TOKEN`，运行 `npm run deploy`，再访问 `/install` 初始化 schema 和管理员。`db:init:remote` 仅用于安装器失败后的恢复。
- `/install` 自动初始化失败时，才在 D1 SQL Console 执行 `schema.sql` 作为恢复手段。

## 📚 文档结构

```
docs/
├── README.md           # 文档索引
├── guides/             # 部署、快速开始、故障排查和数据导入
├── reference/          # API、架构、性能契约和技术说明
└── screenshots/        # README 使用的当前界面截图
```

## 🎯 维护待办

这里只记录已经从当前实现中确认、且尚未完成的维护事项。多语言、多用户、团队协作和数据分析等方向没有当前产品契约，不作为已承诺路线图。

- [ ] 为直接刷新 `/admin` 增加真实 Chrome 回归：确认首页不会短暂挂载，并记录控制台错误、页面异常和失败请求。
- [ ] 下一次生产发布并完成真实浏览器验证后，更新 `docs/screenshots/cf-navs-admin-setting.jpg`；现有截图只作界面示意，不作为当前字段布局契约。
- [ ] 后续修改认证、CRUD 或弹窗流程时，继续按 use case 缩小 `App.svelte` 的编排职责；每次拆分必须先接入真实调用链并保留现有缓存、路由和回滚行为。
- [ ] 只有在接近真实规模的数据证明 DOM 数量或交互耗时成为瓶颈后，才评估长列表虚拟化，并记录改动前后的指标。

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 License

MIT License - 详见 [LICENSE](../../LICENSE) 文件

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/) - 提供 Serverless 平台
- [Svelte](https://svelte.dev/) - 提供前端框架
- [Hono](https://hono.dev/) - 提供轻量级 Web 框架
- [Sun-Panel](https://github.com/hslr-s/sun-panel) - 提供设计灵感

---

**CF-Navs** - 让导航更简单 🎉
