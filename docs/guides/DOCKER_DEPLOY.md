# CF-Navs 自托管部署指南（Docker）

自托管与 Cloudflare 版同仓维护：Node 运行时在 `server/`，部署资产在
`docker/`，应用代码完全一致（分支与发版关系见
[分支与发版流程](../reference/BRANCHING_AND_RELEASE.md)）。克隆仓库后
进入 `docker/` 目录部署：

```bash
git clone https://github.com/lbjxr/CF-Navs.git
cd CF-Navs/docker
```

## 1. 快速启动

要求：Docker Engine（Compose v2）、1 核 1G 以上机器。以下命令均在仓库
的 `docker/` 目录里执行。

> ⚠️ **安全提示（2026-10-23）**：GHCR 上 2026-10-21 之前构建的镜像
> （含旧 `docker` 标签）内置 Node v24.22.0，含有 Brotli 解码器高危漏洞
> （CVE-2026-111497，可导致远程代码执行；Node 官方已在 v24.22.1 中修复）。
> 在下一个正式版本镜像发布之前，新部署请改用**方式 B 从源码构建**——
> 构建时会自动拉取已修复的基础镜像。已经用旧镜像部署的用户，在部署
> 目录 `git pull` 后执行一次 `docker compose up -d --build` 重新构建即可，
> 数据卷不受影响。

### 方式 A：预构建镜像（推荐，免本地构建）

CI 在版本发布时把镜像发布到 GHCR（`amd64` / `arm64` 双架构），1G 小机器
不用在本地构建：

```bash
cp .env.example .env
# 填 SETUP_TOKEN（openssl rand -hex 24 生成）
docker compose pull
docker compose up -d
```

镜像标签：`latest` 跟踪最新正式版本；形如 `0.9.0` 的标签对应具体版本
（见第 7 节）；`sha-<短哈希>` 对应具体提交（含 develop 的预览构建，
仅供尝鲜，生产勿用）。

### 方式 B：从源码构建

```bash
cp .env.example .env
# 填 SETUP_TOKEN（openssl rand -hex 24 生成）
docker compose up -d --build
```

### 方式 C：面板部署（1Panel / 宝塔）

两个面板都自带 Docker 管理与反向代理，全程不用终端。前提：1Panel 直接
可用；宝塔先在软件商店安装「Docker 管理器」。

把下面这份编排粘贴到面板的容器编排里创建即可（已去掉源码构建行，只拉
预构建镜像）。只需改一处：`SETUP_TOKEN` 换成你自己的令牌
（`openssl rand -hex 24` 生成，或用面板终端/任意密码工具生成）：

```yaml
services:
  cf-navs:
    image: ghcr.io/lbjxr/cf-navs:latest
    container_name: cf-navs
    restart: unless-stopped
    # 只绑宿主机回环：对外服务由面板的反向代理提供，切勿改成 0.0.0.0
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      SETUP_TOKEN: "改成你的安装令牌"
      TRUST_PROXY: "true"
      TRUST_PROXY_CIDRS: ""
      CACHE_MAX_BYTES: "33554432"
    volumes:
      - cf-navs-data:/data
    mem_limit: 512m
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  cf-navs-data:
```

- **1Panel**：容器 → 编排 → 创建编排，粘贴上文并确认，面板会自动拉取
  镜像并启动；然后到「网站」创建一个反向代理网站，代理地址填
  `127.0.0.1:3000`，再在该网站的 HTTPS 里申请证书。
- **宝塔**：Docker → 容器编排 → 添加编排，粘贴上文并创建；然后到
  「网站」添加反向代理，目标 URL 填 `http://127.0.0.1:3000`，再在
  SSL 里一键申请证书。

两个面板的反代模板默认都带 `X-Real-IP` 覆盖写，与第 2 节的要求一致，
一般无需额外配置；升级在面板的编排里执行「拉取新镜像并重新创建」
即可（原理同第 7 节）。完成后通过反代域名访问站点，用 SETUP_TOKEN
完成安装向导。

然后用浏览器打开 `http://<服务器IP>:3000`，用 SETUP_TOKEN 完成安装向导。

容器只监听宿主机回环（`127.0.0.1:3000`），**生产必须套反向代理 + 域名**，
见第 2 节。健康检查：`GET /api/health`。

## 2. 反向代理（Nginx / Caddy）

应用端口默认不暴露公网。反代除了负责 TLS 和域名外，还负责**覆盖式写入
真实客户端 IP**——这是登录限流能正常工作的前提（见第 5 节）。

### Nginx

```nginx
server {
  listen 443 ssl;
  server_name navs.example.com;
  ssl_certificate     /path/to/fullchain.pem;
  ssl_certificate_key /path/to/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    # 覆盖（非追加）写入：应用只信任这一条
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
  }
}
```

### Caddy

```caddy
navs.example.com {
  reverse_proxy 127.0.0.1:3000 {
    # Caddy 默认的 X-Forwarded-For 是追加语义；这里改成覆盖写 X-Real-IP
    header_up X-Real-IP {remote_host}
  }
}
```

compose 默认 `TRUST_PROXY=true` 且不设 `TRUST_PROXY_CIDRS`：表示「直连对端恒为
本机代理链，其转发头可信」——仅在端口只绑定回环（compose 默认配置）时成立。
如果你改了端口绑定或拓扑（比如反代在另一台机器）：

- 把代理的内网 IP 写进 `TRUST_PROXY_CIDRS`（逗号分隔，支持 CIDR，如 `10.0.0.2,192.168.1.0/24`）
- 或在确认直连对端不可信时直接 `TRUST_PROXY=false`（此时所有访客共用一个限流桶，公网部署勿用）

## 3. 从 Cloudflare 迁移数据过来

1. 在 Cloudflare 侧导出：`wrangler d1 export <数据库名> --output d1-export.sql`
2. 在已装好依赖的本机（或构建机）执行导入：

```bash
node --experimental-sqlite dist-server/migrate.mjs d1-export.sql /data/app.db
```

3. 导入报告会确认：完整性校验、行数、安装状态；**旧 jwt_secret 会自动删除，
   应用下次启动时重新生成**，所有人（包括旧 JWT 和图标授权）需要重新登录。
   KV（限流计数/撤销名单）不迁移，重新积累。
4. 把生成的 `app.db` 放到挂载的数据卷 `/data` 下再启动容器。

回滚：停止容器，把切换后新增的数据另行导出；无法无损自动切回 D1。

## 4. 备份与恢复

**在线备份**（不停机，WAL 安全；在 `docker/` 目录执行）：

```bash
docker compose exec cf-navs node --experimental-sqlite dist-server/backup.mjs /data/app.db /data/backups/app-$(date +%F).db
```

也可以停机后直接拷贝数据卷文件。恢复：停容器 → 把备份文件放回
`/data/app.db` → 启动。恢复会覆盖之后产生的新数据，请先评估。

KV 库（`kv.db`）包含限流计数和撤销名单，通常无需备份；真要备份同理拷贝即可。

## 5. 安全边界说明

- **客户端 IP**：见第 2 节配置。转发头伪造攻击已被默认配置挡住：
  直连对端不可信时全部转发头被忽略；对端可信时只采信代理覆盖写入的
  `X-Real-IP`，或从 `X-Forwarded-For` 右端逐跳剥离可信代理。
- **SSRF**：图标/站点元信息抓取对逐跳重定向和私网字面量（IPv4 私网、
  link-local、回环、云元数据地址、IPv6 私网）的拦截与 Cloudflare 路径一致。
  残余风险：DNS 重绑定（域名解析到私网 IP 的时机差）。缓解：在 Docker
  网络层面隔离容器出站访问（例如不将容器接入可访问内网服务的网络）。
- **安装保护**：首次安装需要 `SETUP_TOKEN`；同源校验禁止跨站安装。
- 容器以非 root 运行，应用目录只读，仅 `/data` 可写。

## 6. 资源与限制

- 支持范围：**单机、单容器、单 Node 进程、单 SQLite 写入实例**。
  不支持多副本共用 SQLite、网络文件系统上的 SQLite。
- 1C1G 规格参考：容器内存限制 512MB（compose 默认），应用常驻约 100–200MB。
  **不要在 1G 机器上执行镜像构建**（`npm ci` + Vite 构建可能 OOM）：
  用第 1 节方式 A 的预构建镜像，或先给构建机加约 2G swap 再走方式 B。
- 进程内响应缓存有上限（默认 500 条 / 32MB），重启清空；业务数据与 KV 不受影响。

## 7. 升级

预构建镜像方式（在仓库根目录拉代码，再进 `docker/` 更新）：

```bash
git pull                # 在仓库根目录拉最新代码
cd docker
docker compose pull     # 拉新镜像
docker compose up -d    # 换镜像重启
```

也可以直接运行 `docker/redeploy.sh` 一键完成（拉代码 → 重建 → 健康
检查 → 冒烟）。源码构建方式把 pull 一步换成 `docker compose up -d --build`。

应用启动时会自动跑版本化迁移（与 Cloudflare 路径同一套）。升级前建议先按
第 4 节备份。版本节奏与 Cloudflare 版一致：仓库打 `v0.x.y` 版本 tag 时，
CI 同步发布同号镜像（如 `ghcr.io/lbjxr/cf-navs:0.9.0`）；生产建议把
compose 里的 `image:` 标签从 `latest` 改成具体版本锁定，而不是跟踪
最新发布。
