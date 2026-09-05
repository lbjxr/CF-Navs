# Scripts

项目脚本统一保留在此目录，按用途如下：

## 开发与部署

- `create-wrangler-local.mjs`：根据项目配置生成本地 `wrangler.local.toml`。
- `wrangler-config.mjs`：为开发、数据库初始化和部署命令选择正确的 Wrangler 配置。
- `pre-deploy-check.sh`：部署前的 Shell 检查清单。

## 测试与审计

- `smoke-local.mjs`：**L1 一键闸门（`npm run smoke`）**。用独立的 `.wrangler/state-smoke` 起一个隔离本地 Worker，自动选空闲端口、造一次性管理员密码，跑完 `smoke-test.mjs` 再拆掉。不碰开发者日常的 `.wrangler/state`，也不与 `npm run dev` 抢 8787。CI 在 Build 之后跑这一步。
- `smoke-test.mjs`：API 冒烟断言本体（75 项），需要一个已运行的实例与**干净**数据库。直接跑它要自己准备环境，日常用 `npm run smoke`。
- `prod-acceptance.mjs`：**L3 部署后验收（`npm run accept:prod`）**。零写入的只读探针，覆盖首访/二访安装探测、Service Worker 与预缓存、离线可打开、匿名边界、导出子集、桌面与移动弹窗尺寸、三档截图、登出撤销生效窗口。报告与截图落 `tmp/acceptance/`（已忽略），落盘前脱敏。流程与分层见 [部署后验收](../docs/guides/PRODUCTION_ACCEPTANCE.md)。
- `chrome-regression.mjs`：基于 Chrome DevTools Protocol 的生产回归测试；默认启动隔离 Chrome，复用现有 DevTools 端点必须显式授权且只用于专用测试浏览器，用户浏览器只关闭专用测试 tab，自启浏览器按精确 profile 清理并验证进程归零。**密码轮换场景默认关闭**——它会真实改写再还原管理员密码，进程中途被打断就会把实例锁在只存在于内存里的临时密码上；需要时用 `REGRESSION_ALLOW_PASSWORD_ROTATION=1` 显式开启。
- `perf-audit.mjs`：生产性能与资源加载审计；始终创建并关闭专用测试 tab，不复用或关闭用户已有页面。
- `lib/cdpSession.mjs`：`prod-acceptance.mjs` 用的 CDP 会话层——启动/连接、页面上下文执行、视口仿真、真实 `Input` 事件、离线仿真、证据采集与精确清理。调试端口被占用时**默认拒绝**复用未知浏览器；只按精确 profile 路径匹配进程，绝不按进程名。`chrome-regression.mjs` 仍带着自己那份同源的内联实现，两份尚未合并。
- `lib/verifyTarget.mjs`：从环境变量或 Git 忽略的根目录 `verify.local.json` 读取验证目标与浏览器参数；真实域名不进入脚本和文档。首次使用复制 `verify.local.example.json`。
- `lib/verifyCredentials.mjs`：解析管理员凭据（环境变量优先，其次 `verify.local.json` 的 `adminUser` / `adminPass`），并在每次运行时用 `git ls-files` 复核该文件未被跟踪。另提供 `redactCredentials()`，报告与错误输出落盘前一律先过它。

## 数据工具

- `convert-sunpanel.cjs`：将 Sun-Panel 导出数据转换为 CF-Navs 导入格式。

日常入口优先使用 `package.json` 中定义的 npm scripts，避免直接拼接部署参数。
