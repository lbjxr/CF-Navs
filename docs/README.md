# CF-Navs 文档

项目文档按用途分为以下几类，避免用户指南、技术契约和开发过程记录混在同一目录。

## 使用与部署指南

- [快速开始](guides/QUICKSTART.md)
- [完整部署指南](guides/DEPLOYMENT.md)
- [常见问题排查](guides/TROUBLESHOOTING.md)
- [Sun-Panel 数据导入](guides/SUNPANEL_IMPORT.md)

## 技术参考

- [项目概览](reference/PROJECT_OVERVIEW.md)
- [API 契约](reference/API_CONTRACT.md)
- [技术说明](reference/TECHNICAL_NOTES.md)
- [性能契约](reference/PERFORMANCE_CONTRACT.md)
- [性能测试](reference/PERFORMANCE_TESTING.md)

## 开发历史

`history/` 保存已经完成或具有追溯价值的优化计划、性能审计、维护性重构记录、问题分析和浏览器调试记录。这些文件不属于部署必读内容，但可用于理解历史决策。

## 图片与快照

- `screenshots/`：README 当前使用的产品截图。
- `history/screenshots/`：已替换但仍保留用于追溯的旧截图。
- `history/snapshots/`：开发和浏览器验证产生的文本快照。

本地临时开发资料、测试截图和上游参考源码统一存放在根目录 `_archive/`，不会进入构建、部署或 Git 提交。

## 项目目录

- `src/`：Svelte 前端页面、组件和浏览器端逻辑。
- `worker/`：Cloudflare Worker 路由、中间件和 D1 数据访问。
- `shared/`：前后端共享类型与设置定义。
- `public/`：PWA、Service Worker 和静态资源。
- `scripts/`：开发、部署、测试、审计和数据转换脚本，详见 [脚本说明](../scripts/README.md)。
- `tests/`：Vitest 单元与源码回归测试。
- `schema.sql`：D1 数据库结构，是部署必需文件。
