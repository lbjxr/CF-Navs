# Scripts

项目脚本统一保留在此目录，按用途如下：

## 开发与部署

- `create-wrangler-local.mjs`：根据项目配置生成本地 `wrangler.local.toml`。
- `wrangler-config.mjs`：为开发、数据库初始化和部署命令选择正确的 Wrangler 配置。
- `pre-deploy-check.sh`：部署前的 Shell 检查清单。

## 测试与审计

- `smoke-local.mjs`：**L1 一键闸门（`npm run smoke`）**。用独立的 `.wrangler/state-smoke` 起一个隔离本地 Worker，自动选空闲端口、造一次性管理员密码，跑完 `smoke-test.mjs` 再拆掉。不碰开发者日常的 `.wrangler/state`，也不与 `npm run dev` 抢 8787。CI 在 Build 之后跑这一步。
- `smoke-test.mjs`：API 冒烟断言本体（75 项），需要一个已运行的实例与**干净**数据库。直接跑它要自己准备环境，日常用 `npm run smoke`。
- `chrome-regression.mjs`：基于 Chrome DevTools Protocol 的生产回归测试；默认启动隔离 Chrome，复用现有 DevTools 端点必须显式授权且只用于专用测试浏览器，用户浏览器只关闭专用测试 tab，自启浏览器按精确 profile 清理并验证进程归零。
- `perf-audit.mjs`：生产性能与资源加载审计；始终创建并关闭专用测试 tab，不复用或关闭用户已有页面。
- `lib/verifyTarget.mjs`：从环境变量或 Git 忽略的根目录 `verify.local.json` 读取验证目标与浏览器参数；真实域名不进入脚本和文档。首次使用复制 `verify.local.example.json`。

## 数据工具

- `convert-sunpanel.cjs`：将 Sun-Panel 导出数据转换为 CF-Navs 导入格式。

日常入口优先使用 `package.json` 中定义的 npm scripts，避免直接拼接部署参数。
