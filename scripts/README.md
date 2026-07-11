# Scripts

项目脚本统一保留在此目录，按用途如下：

## 开发与部署

- `create-wrangler-local.mjs`：根据项目配置生成本地 `wrangler.local.toml`。
- `wrangler-config.mjs`：为开发、数据库初始化和部署命令选择正确的 Wrangler 配置。
- `pre-deploy-check.sh`：部署前的 Shell 检查清单。

## 测试与审计

- `smoke-test.mjs`：本地 Worker 启动后的 API 冒烟测试。
- `chrome-regression.mjs`：基于 Chrome DevTools Protocol 的生产回归测试。
- `perf-audit.mjs`：生产性能与资源加载审计。

## 数据工具

- `convert-sunpanel.cjs`：将 Sun-Panel 导出数据转换为 CF-Navs 导入格式。

日常入口优先使用 `package.json` 中定义的 npm scripts，避免直接拼接部署参数。
