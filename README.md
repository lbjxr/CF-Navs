# CF-Navs

> 🚀 一个运行在 Cloudflare Workers 上的轻量个人导航面板——前台展示常用站点，后台管理分类、书签、主题、搜索引擎和数据备份。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)
![Svelte](https://img.shields.io/badge/Svelte-4-ff3e00.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)

[![Fork on GitHub](https://img.shields.io/badge/Fork%20on%20GitHub-181717?logo=github&logoColor=white)](https://github.com/lbjxr/CF-Navs/fork)

[核心特性](#-核心特性) • [效果预览](#-效果预览) • [快速部署](#-快速部署) • [项目文档](docs/README.md) • [本地开发](#-本地开发) • [环境变量说明](#-环境变量说明) • [贡献](#-贡献) • [致谢](#-致谢)

---

## ✨ 核心特性

<table>
  <colgroup>
    <col width="190">
    <col>
  </colgroup>
  <thead>
    <tr>
      <th align="left">特性</th>
      <th align="left">说明</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td width="190">☁️ <strong>轻量部署</strong></td>
      <td>全栈运行在 Cloudflare Workers + D1 + KV，无需自建服务器</td>
    </tr>
    <tr>
      <td width="190">🧭 <strong>清爽首页</strong></td>
      <td>分类分区、响应式布局；导航可配置为左侧或顶部，支持桌面常显、横向滚动和移动端触摸滑动；详情/极简两种卡片样式</td>
    </tr>
    <tr>
      <td width="190">🛠️ <strong>顺手管理</strong></td>
      <td>分类和书签支持新增、编辑、删除、搜索、分页和拖拽排序</td>
    </tr>
    <tr>
      <td width="190">🎨 <strong>图标省心</strong></td>
      <td>支持 favicon、文字图标、Iconify、自定义图片 URL、文字或表情；首页优先使用聚合数据和浏览器本地缓存展示图标</td>
    </tr>
    <tr>
      <td width="190">🌓 <strong>主题完整</strong></td>
      <td>亮色、暗色、跟随系统；内置 13 套跨色系配色方案，保存选中状态；书签卡片为真实毛玻璃质感——亮色透出背景色彩，暗色使用深色玻璃提亮，背景、遮罩、卡片尺寸和图标大小都可配置</td>
    </tr>
    <tr>
      <td width="190">🔎 <strong>搜索实用</strong></td>
      <td>首页输入直接筛选本地书签（匹配标题、描述、URL 和分类），也可切换外部搜索引擎</td>
    </tr>
    <tr>
      <td width="190">💾 <strong>数据可控</strong></td>
      <td>支持 JSON 导出、导入、恢复；兼容 Sun-Panel 数据迁移</td>
    </tr>
    <tr>
      <td width="190">🔐 <strong>安全可靠</strong></td>
      <td>密码 PBKDF2 哈希存储、HttpOnly Session Cookie、CSRF 防护；登录失败限流、默认 7 天会话有效期</td>
    </tr>
    <tr>
      <td width="190">📱 <strong>PWA 支持</strong></td>
      <td>生产构建提供基础 PWA app shell，Service Worker 离线回退</td>
    </tr>
    <tr>
      <td width="190">⚡ <strong>极致加载</strong></td>
      <td>边缘缓存、图标懒加载、代码分割、聚合数据批量读取、浏览器本地快照增量更新，畅享本地化的速度感</td>
    </tr>
  </tbody>
</table>

---

## 🖼️ 效果预览

<table>
  <tr>
    <td align="center" width="50%">
      <strong>桌面端亮色</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-light.jpg" alt="桌面端亮色" width="420">
    </td>
    <td align="center" width="50%">
      <strong>桌面端暗色</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-dark.jpg" alt="桌面端暗色" width="420">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>分类视图</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-tag.jpg" alt="分类视图" width="420">
    </td>
    <td align="center" width="50%">
      <strong>小卡片样式</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-bookmark-small.jpg" alt="小卡片样式" width="420">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>移动端亮色</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-light-mobile.jpg" alt="移动端亮色" width="260">
    </td>
    <td align="center" width="50%">
      <strong>移动端暗色</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-dark-mobile.jpg" alt="移动端暗色" width="260">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>浏览器网络耗时</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-loadtime.jpg" alt="浏览器网络耗时" width="420">
    </td>
    <td align="center" width="50%">
      <strong>首次加载过渡动画</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-loading.jpg" alt="首次加载过渡动画" width="420">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>书签编辑弹窗</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-bookmarkedit.jpg" alt="书签编辑弹窗" width="420">
    </td>
    <td align="center" width="50%">
      <strong>后台分类管理</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-admin-tag.jpg" alt="后台分类管理" width="420">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>后台书签管理</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-admin-bookmark.jpg" alt="后台书签管理" width="420">
    </td>
    <td align="center" width="50%">
      <strong>后台设置</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-admin-setting.jpg" alt="后台设置" width="420">
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <strong>后台备份</strong><br>
      <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-navs-backup.jpg" alt="后台备份" width="420">
    </td>
  </tr>
</table>

> 💡 支持亮色/暗色/跟随系统三种主题模式，桌面端和移动端自适应。
>
> 🧭 后台「站点设置 → 布局与导航」可选择左侧或顶部布局。桌面左侧模式可开启常显并手动收缩；顶部模式固定悬浮，分类溢出时支持箭头、鼠标拖动和移动端触摸滑动。

---

## 🚀 快速部署

### 方式一：Wrangler CLI 部署

**前置要求**：Node.js 18+、npm、Cloudflare 账号

```bash
# 1. 克隆并安装依赖
git clone https://github.com/lbjxr/CF-Navs.git
cd CF-Navs
npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 创建 D1 数据库
npx wrangler d1 create cf-navs-db

# 4. 创建 KV 命名空间
npx wrangler kv namespace create SESSION

# 5. 生成本地 Wrangler 配置（保存真实资源 ID）
npm run setup:wrangler

# 6. 设置一次性安装令牌
npx wrangler secret put SETUP_TOKEN

# 7. 构建并部署
npm run deploy
```

部署成功后，访问 Wrangler 返回的 Workers URL 并打开 `/install`，输入刚设置的 `SETUP_TOKEN`，再创建管理员用户名和密码。安装器会初始化数据库 schema 和管理员账号。确认登录成功后，可删除或轮换 `SETUP_TOKEN`。`npm run db:init:remote` 仅用于安装器无法初始化 schema 时的恢复，不是全新 CLI 部署的正常步骤。

### 方式二：Fork 后通过 Cloudflare 部署（推荐）

适合不想在本地运行 CLI、希望从自己的 GitHub 仓库完成在线部署的用户。

[![Fork on GitHub](https://img.shields.io/badge/Fork%20on%20GitHub-181717?logo=github&logoColor=white)](https://github.com/lbjxr/CF-Navs/fork)

1. 点击上方按钮，在 GitHub 中 Fork 本项目。请确认 Fork 后的仓库归属于你的 GitHub 账号。
2. 进入 Cloudflare 控制台的 **Workers & Pages → Create application → Import a repository**，关联 GitHub 并选择你 Fork 后的 `CF-Navs` 仓库。不要选择上游仓库，也不要使用会自动创建新 GitHub 项目的 Cloudflare Deploy Button。
3. 保持生产分支为 `main`，构建命令填写 `npm run build`，部署命令填写：

```bash
npx wrangler deploy
```

4. 保存并部署。Cloudflare 的 Git 引导流程会根据 `wrangler.toml` 中不带 ID 的声明创建并绑定 `DB` D1 数据库与 `SESSION` KV 命名空间。待部署完成后，进入该 Worker 的 **设置 → 变量和机密**，添加一个类型为**密钥**的变量，变量名填写 `SETUP_TOKEN`，值填写一段足够长且随机的字符串。

<p align="center">
  <img src="https://raw.githubusercontent.com/lbjxr/CF-Navs/main/docs/screenshots/cf-deploy3.jpg" alt="在 Cloudflare Worker 中添加 SETUP_TOKEN 密钥" width="100%">
</p>

6. 打开部署后的 Workers URL，并访问 `/install`。输入 `SETUP_TOKEN`，再设置管理员用户名和密码；安装器会初始化数据库 schema 和管理员账号。
7. 进入该 Worker 的 **域和路由** 页面，关闭两个 Workers URL，然后添加并启用你的自定义域名。

> 如果 `/install` 无法完成 schema 初始化，才使用 D1 SQL Console 手动执行 [schema.sql](schema.sql) 作为恢复手段；不要把手动 SQL 当作正常安装步骤。

首次部署请从生产分支 `main` 触发。不要在资源尚未创建前使用预览分支自动部署；预览分支可能走 `wrangler versions upload` 流程。

资源绑定名必须保持如下配置：

| 类型 | 绑定名 | 选择 |
|---|---|---|
| D1 database | `DB` | `cf-navs-db` |
| KV namespace | `SESSION` | 你的会话 KV 命名空间 |

> ⚠️ 这个部署方式必须使用你 Fork 后的仓库。Cloudflare 的通用 Deploy Button 会新建 GitHub 仓库，不能部署到已有 Fork；已有 Fork 必须在 Dashboard 选择 **Import a repository**。控制台中 Worker 名称需与 `wrangler.toml` 的 `name` 一致（默认 `cf-navs`），并确保绑定名为 `DB` 和 `SESSION`。

---

## 🧪 本地开发

> 首次使用请先 `npm install`。本地开发依赖 `wrangler.toml` 公开模板配置；真实资源 ID 通过 `npm run setup:wrangler` 写入 Git 忽略的 `wrangler.local.toml`。

```bash
# 终端 1：启动 Worker 开发服务
npm run dev

# 终端 2：启动前端开发服务器
npm run dev:web
```

访问 `http://localhost:5173`。验证完成后在对应终端按 `Ctrl+C` 停止服务。

```bash
npm run type-check      # TypeScript 与 Svelte 类型检查
npm test                # Vitest 单元测试
npm run build           # 生产构建
npm run db:init         # 初始化本地 D1
npx wrangler tail       # 查看 Worker 日志
```

---

## 🔑 环境变量说明

### Secrets（通过 Dashboard 加密 Secret 或 `wrangler secret put` 设置）

| 变量名 | 说明 |
|---|---|
| `SETUP_TOKEN` | Cloudflare Git 和 Wrangler CLI 新部署必需的一次性安装令牌。部署后访问 `/install`，用它授权 schema 与管理员初始化；应使用足够长的随机值并保存为加密 Secret。确认安装成功后建议删除或轮换；公开安装状态检查不需要它，删除后不影响运行，保留也不会解除永久安装锁 |
| `INIT_ADMIN_PASSWORD` | 仅用于旧数据库升级或凭据恢复的兼容 Secret。全新的 Cloudflare Git 和 Wrangler CLI 安装不要设置它，而是在 `/install` 中创建管理员密码 |

### 必需绑定

| 绑定名 | 类型 | 说明 |
|---|---|---|
| `DB` | D1 database | 数据库，存储分类、书签、设置 |
| `SESSION` | KV namespace | 会话存储，保存登录 Token |

### 可选变量（`wrangler.toml` vars 或 Dashboard Variables）

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `INIT_ADMIN_USER` | `admin` | 旧数据库升级或凭据恢复时使用的兼容管理员用户名；全新安装在 `/install` 中设置 |
| `RESET_ADMIN_CREDENTIALS` | 空 | 旧数据库首次升级或需要强制重置时使用一次性标记，例如 `reset-2026-07-12`；每次强制重置请更换标记值 |
| `SESSION_TTL` | `604800` | 会话有效期（秒），默认 7 天 |

`INIT_ADMIN_USER`、`INIT_ADMIN_PASSWORD` 和 `RESET_ADMIN_CREDENTIALS` 仅保留给旧数据库升级与凭据恢复。全新的 Cloudflare Git 或 Wrangler CLI 部署都应使用 `SETUP_TOKEN` + `/install` 设置管理员，日常修改密码请使用后台「账号安全」。升级已有旧数据库时，如果数据库还没有初始化标记，可设置新的 `RESET_ADMIN_CREDENTIALS` 值并重新部署，成功登录后移除该变量。

---

## 🌟 贡献

欢迎通过 Issue 或 Pull Request 为本项目贡献代码。

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add some amazing feature'`
4. 推送到分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

---

## 🙏 致谢

本项目参考了 [Sun-Panel](https://github.com/hslr-s/sun-panel) 的设计思路，部分图标获取逻辑受 [iori-nav](https://github.com/jy02739244/iori-nav) 启发。

---

## ⭐ Star 趋势

<a href="https://www.star-history.com/?repos=lbjxr%2FCF-Navs&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=lbjxr/CF-Navs&type=date&theme=dark&legend=top-left&sealed_token=Bf0GixdoBy-NMTywqMqPjVOrUUv5wDjqFB3rty7IYwn3OWau-UR3vdmWDYXDWQW1IkKWhzCs3IdPJZSTzqzcLlYyj1O4-effSpu5AUbhdCU-IbGV378MUn1OG5wkDgP-PGjyaVTEZBtzdp0P_CrCf5ZzZwmcEBDnnUIL-bX1PhN3Mc0vMlATyNrA-TRa" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=lbjxr/CF-Navs&type=date&legend=top-left&sealed_token=Bf0GixdoBy-NMTywqMqPjVOrUUv5wDjqFB3rty7IYwn3OWau-UR3vdmWDYXDWQW1IkKWhzCs3IdPJZSTzqzcLlYyj1O4-effSpu5AUbhdCU-IbGV378MUn1OG5wkDgP-PGjyaVTEZBtzdp0P_CrCf5ZzZwmcEBDnnUIL-bX1PhN3Mc0vMlATyNrA-TRa" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=lbjxr/CF-Navs&type=date&legend=top-left&sealed_token=Bf0GixdoBy-NMTywqMqPjVOrUUv5wDjqFB3rty7IYwn3OWau-UR3vdmWDYXDWQW1IkKWhzCs3IdPJZSTzqzcLlYyj1O4-effSpu5AUbhdCU-IbGV378MUn1OG5wkDgP-PGjyaVTEZBtzdp0P_CrCf5ZzZwmcEBDnnUIL-bX1PhN3Mc0vMlATyNrA-TRa" />
 </picture>
</a>

---

## 📄 许可证

[MIT](LICENSE)
