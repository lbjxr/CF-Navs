# CF-Navs 文档

项目文档按用途分为以下几类，避免用户指南、技术契约和开发过程记录混在同一目录。

## 使用与部署指南

- [快速开始](guides/QUICKSTART.md)
- [完整部署指南](guides/DEPLOYMENT.md)
- [常见问题排查](guides/TROUBLESHOOTING.md)
- [Sun-Panel 数据导入](guides/SUNPANEL_IMPORT.md)
- [浏览器书签 HTML 导入](guides/BROWSER_BOOKMARK_IMPORT.md)

## 技术参考

- [项目概览](reference/PROJECT_OVERVIEW.md)
- [API 契约](reference/API_CONTRACT.md)
- [技术说明](reference/TECHNICAL_NOTES.md)
- [分类层级设计提案（尚未实现）](reference/CATEGORY_HIERARCHY_DESIGN.md)
- [性能契约](reference/PERFORMANCE_CONTRACT.md)
- [性能测试](reference/PERFORMANCE_TESTING.md)

## 图片

- `screenshots/`：README 当前使用的产品截图。

本地历史记录、草稿和浏览器验证资料应放在已忽略的 `docs/history/`、`docs/local/`、`docs/drafts/` 或根目录 `_archive/`，不会进入构建、部署或 Git 提交。

`PROJECT_OVERVIEW.md` 中的维护待办只记录当前源码能够确认的未完成事项；已完成阶段计划和没有产品契约的设想不继续作为当前路线图维护。

## 项目目录

- `src/`：Svelte 前端页面、组件和浏览器端逻辑。
- `worker/`：Cloudflare Worker 路由、中间件和 D1 数据访问。
- `shared/`：前后端共享类型与设置定义。
- `public/`：PWA、Service Worker 和静态资源。
- `scripts/`：开发、部署、测试、审计和数据转换脚本，详见 [脚本说明](../scripts/README.md)。
- `tests/`：Vitest 单元与源码回归测试。
- `schema.sql`：D1 数据库结构，是部署必需文件。
