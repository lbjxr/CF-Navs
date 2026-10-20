# 分支与发版流程

本文是 `CONTRIBUTING.md` 第 1 节（分支模型）与第 6 节（发版流程）的展开
说明；规则冲突时以 `CONTRIBUTING.md` 为准。

## 两条分支，两种运行时同仓

```
topic 分支 ──▶ develop ──发版 tag v0.x.y──┬──▶ main（归档快照，fork 用户跟随）
（feat/fix，短命）                        └──▶ GHCR 镜像（自托管用户）
```

| 对象 | 角色 | 说明 |
| --- | --- | --- |
| `develop` | 集成分支、发版与部署来源 | 所有开发在这里落地，版本 tag 打在这里（见 `CONTRIBUTING.md` 第 1、6 节） |
| `main` | 已审阅归档快照 | 只接受来自 `develop` 的合并，只在维护者明确要求时执行；不直接提交 |
| GHCR 镜像 | 自托管发布产物 | 不是分支：由版本 tag 触发 CI 构建发布，见下文 |

Cloudflare 与自托管（Node + Docker）共用同一套应用代码：Worker 入口在
`worker/`，Node 运行时在 `server/`（经 `worker/app.ts` 的 createApp
工厂复用同一套应用装配），部署资产在 `docker/`。历史上自托管曾是独立
的 `docker` 分支，2026-10 已并入主仓、该分支冻结存档；此后不再有跨
分支同步，任何修复一次落地、两个运行时同时生效。

## 发版与镜像

发版按 `CONTRIBUTING.md` 第 6 节在 `develop` 完成（版本 tag `v0.x.y`
打在 develop 的发版提交上）。与镜像相关的只有两条自动行为：

- **版本 tag 推送**：触发镜像工作流，verify（lint、双类型检查、全量
  测试、双构建）通过后发布 `ghcr.io/lbjxr/cf-navs` 的 `0.x.y` 与
  `latest` 标签（amd64 / arm64 双架构），另带 `sha-<短哈希>` 标签。
- **`develop` 日常推送**：只产出 `sha-<短哈希>` 预览镜像，不动
  `latest`；自托管生产环境应锁定版本标签，不用预览镜像。

`main` 的归档合并仍按维护者要求单独执行（第 6 节第 9 步），与镜像
发布互不依赖。

## 日常规则

- **一切改动只落 `develop`**（或短命 topic 分支再合回）：应用功能、
  修复、Node 运行时（`server/`）、部署资产（`docker/`）、镜像工作流，
  无一例外。在自托管部署里发现的问题也在这里修，同仓同验证。
- **验证是一套**：提交前通过 L0；测试套件同时覆盖 Worker 与 Node
  两条运行时路径（`tests/unit/node*.test.ts` 等），接缝文件
  （`worker/app.ts`、`worker/types.ts`、IP 信任边界）改动时两边都要过。
- **热修复走主干道**：`develop` 修复 → 补丁版发版 → `main` 归档与
  镜像发布随之发生；不再有向任何分支单独打补丁的路径。
- **topic 分支短命**：合回 `develop` 后删除。

使用方视角：fork 用户跟随 `main`；自托管用户直接拉 GHCR 镜像（或用
`docker/` 里的 compose 从源码构建），见
[Docker 自托管部署](../guides/DOCKER_DEPLOY.md)。
