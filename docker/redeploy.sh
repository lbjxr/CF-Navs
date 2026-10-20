#!/usr/bin/env bash
# CF-Navs 自托管（单仓 docker/ 布局）一键更新脚本：
#   拉最新代码 → 重建并重启容器 → 等健康检查通过 → 跑一轮只读冒烟 → 汇总报告。
#
# 用法：在 git 检出目录任意位置执行 docker/redeploy.sh。
#   可选环境变量：
#     SMOKE_USER / SMOKE_PASSWORD  设置后额外验证登录、管理列表与图标接口；
#                                  不设置时只验健康与公开数据。
#   若部署在 docker/ 里放了 compose.override.yaml（例如改了宿主端口），
#   compose 会自动加载，冒烟地址按容器实际发布端口探测，无需改脚本。
set -uo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "== CF-Navs redeploy @ $ROOT"

command -v docker >/dev/null || { echo "FAIL: docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "FAIL: docker compose v2 not available"; exit 1; }
[ -d .git ] || { echo "FAIL: not a git checkout"; exit 1; }

BEFORE="$(git rev-parse --short HEAD)"
if ! git pull --ff-only; then
  echo "FAIL: git pull --ff-only failed (local changes or diverged branch) — aborting, nothing rebuilt."
  exit 1
fi
AFTER="$(git rev-parse --short HEAD)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "code: already at $AFTER (rebuild anyway to pick up local compose/env changes)"
else
  echo "code: $BEFORE -> $AFTER"
fi

cd "$ROOT/docker"

if ! docker compose up -d --build; then
  echo "FAIL: docker compose up failed"
  exit 1
fi

echo "-- waiting for container health (up to 120s)"
HEALTH=""
for i in $(seq 1 60); do
  HEALTH="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' cf-navs 2>/dev/null || echo missing)"
  [ "$HEALTH" = "healthy" ] && break
  if [ "$HEALTH" = "exited" ] || [ "$HEALTH" = "dead" ] || [ "$HEALTH" = "missing" ]; then
    echo "FAIL: container state=$HEALTH; last logs:"
    docker logs --tail 30 cf-navs 2>&1 | tail -30
    exit 1
  fi
  sleep 2
done
[ "$HEALTH" = "healthy" ] || { echo "FAIL: not healthy after 120s (state=$HEALTH)"; docker logs --tail 30 cf-navs 2>&1 | tail -30; exit 1; }
echo "container: healthy"

PUBLISHED="$(docker compose port cf-navs 3000 2>/dev/null | tail -1)"
[ -n "$PUBLISHED" ] || { echo "FAIL: cannot discover published port for cf-navs:3000"; exit 1; }
BASE="http://${PUBLISHED}"
echo "smoke base: $BASE"

PASS=0
FAIL=0
check() { # check <name> <0|1>
  if [ "$2" = "0" ]; then echo "PASS  $1"; PASS=$((PASS + 1)); else echo "FAIL  $1"; FAIL=$((FAIL + 1)); fi
}

BODY="$(curl -s --max-time 10 "$BASE/api/health" || true)"
echo "$BODY" | grep -q '"code":0' ; check "GET /api/health" $?

BODY="$(curl -s --max-time 10 "$BASE/api/public/data" || true)"
echo "$BODY" | grep -q '"code":0' ; check "GET /api/public/data" $?

if [ -n "${SMOKE_USER:-}" ] && [ -n "${SMOKE_PASSWORD:-}" ]; then
  LOGIN="$(curl -s --max-time 10 -X POST "$BASE/api/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$SMOKE_USER\",\"password\":\"$SMOKE_PASSWORD\"}" || true)"
  TOKEN="$(printf '%s' "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$TOKEN" ] ; check "POST /api/login (smoke account)" $?
  if [ -n "$TOKEN" ]; then
    LIST="$(curl -s --max-time 10 "$BASE/api/bookmarks" -H "Authorization: Bearer $TOKEN" || true)"
    echo "$LIST" | grep -q '"code":0' ; check "GET /api/bookmarks (authed)" $?
    FIRST_ID="$(printf '%s' "$LIST" | sed -n 's/.*"id":\([0-9][0-9]*\).*/\1/p' | head -1)"
    if [ -n "$FIRST_ID" ]; then
      CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/api/icon/$FIRST_ID" || true)"
      [ "$CODE" = "200" ] ; check "GET /api/icon/$FIRST_ID" $?
    fi
  fi
else
  echo "SKIP  login/icon smoke (set SMOKE_USER and SMOKE_PASSWORD to enable)"
fi

echo "== redeploy done: $PASS passed, $FAIL failed (commit $AFTER)"
[ "$FAIL" = "0" ]
