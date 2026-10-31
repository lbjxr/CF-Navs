# CF-Navs 自托管镜像（单仓布局：构建上下文为仓库根，见 docker/compose.yaml）。
# 多阶段：构建阶段装依赖 + 构建前端 + 打包 Node 服务；运行阶段只留产物。
# node:sqlite 内置于 Node 二进制（SQLite 已静态链接），无原生依赖，配 alpine 即可。

# ---- 构建阶段 ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

# ---- 运行阶段 ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=256 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    DIST_DIR=/app/dist \
    SQLITE_PATH=/data/app.db \
    KV_PATH=/data/kv.db
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "dist-server/index.mjs"]
