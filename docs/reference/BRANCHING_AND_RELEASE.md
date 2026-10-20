# 分支与发版流程

本文是 `CONTRIBUTING.md` 第 1 节（分支模型）与第 6 节（发版流程）的展开
说明；规则冲突时以 `CONTRIBUTING.md` 为准。

## 三条分支

```
develop ──发版 tag v0.x.y──▶ docker ──CI──▶ GHCR 镜像（自托管用户）
   │
   └──维护者要求时合并──▶ main（归档快照，fork 用户跟随）
```

| 分支 | 角色 | 说明 |
| --- | --- | --- |
| `develop` | 集成分支、发版与部署来源 | 所有应用开发在这里落地，版本 tag 打在这里（见 `CONTRIBUTING.md` 第 1、6 节） |
| `main` | 已审阅归档快照 | 只接受来自 `develop` 的合并，只在维护者明确要求时执行；不直接提交 |
| `docker` | 自托管独立版本线（Node + SQLite + Docker） | `develop` 的下游派生：应用代码与 `develop` 相同，另加 Node 运行时与容器部署层 |

代码只向下流：`develop → main`、`develop → docker`，**永不反向合并**
（`docker → develop/main`、`main → develop` 均禁止；`main` 出现独有内容时
按 `CONTRIBUTING.md` 第 1 节先回流 `develop`）。

## 发版时同步 docker

`develop` 每次发版（`CONTRIBUTING.md` 第 6 节步骤 1–9）完成后，把该
版本同步进 `docker`：

```bash
git checkout docker
git merge v0.x.y        # 只合并已发版的 tag，不追踪未发版的 develop 尖端
# 处理接缝文件冲突后验证（本地 L0 或推送后由 docker 分支 CI 把关）
git push origin docker  # 触发 CI：verify 通过后发布 GHCR 镜像
git tag -a docker-v0.x.y -m "docker-v0.x.y"
git push origin docker-v0.x.y
```

同步锚点是版本 tag 而不是 `develop` 最新提交，保证 `docker` 产出的镜像
永远只含已发布代码。同步用 merge、不用 rebase：`docker` 是自托管用户
直接拉取的公开分支，改写历史会破坏他们的克隆，也会让 GHCR 的
`sha-` 标签对不上提交。

## 标签与镜像对照

| 动作 | 产物 |
| --- | --- |
| `develop` 打 tag `v0.x.y` | 正式发行版本（Cloudflare 路径） |
| `docker` 推送任意提交 | 镜像 `ghcr.io/lbjxr/cf-navs:docker` 更新到最新验证通过的构建，并新增 `sha-<短哈希>` 标签 |
| `docker` 打 tag `docker-v0.x.y` | 额外产出版本镜像 `ghcr.io/lbjxr/cf-navs:0.x.y`，与 `v0.x.y` 同版应用代码 |

## 日常规则

- **应用层问题回 `develop` 修**：哪怕是在自托管部署里发现的 bug，也在
  `develop` 修复、发版后随同步进入 `docker`，不在 `docker` 上单独打补丁。
- **`docker` 只承载专属改动**：Node 运行时（`server/`）、`Dockerfile`、
  `compose.yaml`、`docker.yml`、自托管部署文档。
- **热修复走主干道**：`develop` 修复 → 补丁版发版 → 同步 `docker` →
  补丁号 `docker-v` 标签。
- **cherry-pick 只救急**：某个修复必须立即进 `docker` 时可用，但要在
  下一次发版同步时留意重复应用的冲突；不作为日常同步手段。
- **冲突高发区是接缝文件**：运行时入口、`package.json` 的 scripts、
  README、部署文档；应用层代码走同一套接口，大多自动合并。

使用方视角：fork 用户跟随 `main`，流程不变；自托管用户直接拉 GHCR
镜像（或克隆 `docker` 分支），见
[Docker 自托管部署](../guides/DOCKER_DEPLOY.md)。
