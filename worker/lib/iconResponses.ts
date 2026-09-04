export const ICON_BROWSER_CACHE_SECONDS = 7 * 24 * 60 * 60
export const ICON_EDGE_CACHE_SECONDS = 6 * 24 * 60 * 60

// Keep the shared-cache TTL shorter so an edge HIT still has browser freshness
// remaining after the response Age is applied by the client.
export const ICON_SUCCESS_CACHE =
  `public, max-age=${ICON_BROWSER_CACHE_SECONDS}, s-maxage=${ICON_EDGE_CACHE_SECONDS}, immutable`
export const ICON_FAILURE_CACHE = 'no-store'
export const ICON_FALLBACK_CACHE = 'public, max-age=300, s-maxage=300'
// 私密对象的真实图标只允许在发起者的浏览器里短暂存活：不进共享 edge cache，也不进
// Service Worker 的 Cache Storage。`no-store` 是这两者的统一开关。
export const ICON_PRIVATE_CACHE = 'private, no-store'

export function errorIconResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': ICON_FAILURE_CACHE,
    },
  })
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function fallbackIconResponse(title: string, url: string, cacheControl = ICON_FALLBACK_CACHE): Response {
  let hostname = 'NAV'
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '') || hostname
  } catch {
    hostname = 'NAV'
  }

  const text = escapeSvgText((title.trim() || hostname).slice(0, 4))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111827"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#f9fafb" font-size="180" font-weight="700" font-family="Arial,Helvetica,sans-serif">${text}</text>
</svg>`

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Icon-Fallback': '1',
    },
  })
}

// Workers 运行时的 `caches.default` 不在标准 CacheStorage 类型里，这里做一次带说明的
// 断言而不是在每个使用点内联 cast。**必须惰性读取**：`caches` 在 node 测试环境里不存在，
// 模块顶层求值会让所有导入本模块的单测直接 ReferenceError。
function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default
}

// Hono 的 Context 与 @cloudflare/workers-types 各有一套 `ExecutionContext` 定义，两者
// 不互相赋值。这里只声明真正用到的 `waitUntil`，两种上下文都能结构化匹配。
type CacheWritableContext = { executionCtx?: { waitUntil(promise: Promise<unknown>): void } }

// request 为 null 表示这次响应不允许进共享缓存（私密对象的签名授权路径）。
export function cacheResponse(context: CacheWritableContext, request: Request | null, response: Response) {
  if (!request) return

  context.executionCtx?.waitUntil(edgeCache().put(request, response.clone()))
}

// 图标代理是匿名可访问的，而 edge cache 的键是整个请求 URL。不归一化的话
// `/api/icon/1?v=<随机>` 每次都是新键、必然 miss，于是每个请求都要走一次 D1 读取，
// 书签还没有 icon_blob 时还会额外触发一次最长 5 秒的外站抓取——不需要任何凭据
// 就能放大的资源消耗路径。
//
// 前端确实用 `?v=` 做图标更新后的缓存失效，所以不能简单丢掉整个 query：
// 保留形如版本号的 `v`，其余参数（包括超长随机串）一律并到同一个缓存条目上。
const ICON_CACHE_VERSION = /^[A-Za-z0-9_.:-]{1,64}$/

// PROB-20 之前，图标端点不做可见性判定就把响应写进 edge cache，私密书签/私密分类的
// 图标可能已经躺在里面；而命中查询发生在可见性判定之前，只加服务端过滤不会让这些旧
// 条目失效（`s-maxage` 是 6 天）。给缓存键加命名空间版本，旧条目立刻变成不可达，
// 之后写入的每个条目都一定过了可见性判定。收紧判定口径时必须同时递增这个值。
const ICON_CACHE_NAMESPACE = '2'

export function iconCacheKey(request: Request): Request {
  const url = new URL(request.url)
  const version = url.searchParams.get('v')
  url.search = ''
  url.searchParams.set('ns', ICON_CACHE_NAMESPACE)
  if (version && ICON_CACHE_VERSION.test(version)) {
    url.searchParams.set('v', version)
  }
  return new Request(url.toString(), { method: 'GET' })
}

export async function getCachedResponse(request: Request): Promise<Response | undefined> {
  return (await edgeCache().match(request)) ?? undefined
}

export function cachedFallbackIconResponse(
  context: CacheWritableContext,
  request: Request | null,
  title: string,
  url: string,
  cacheControl = ICON_FALLBACK_CACHE,
): Response {
  const response = fallbackIconResponse(title, url, cacheControl)
  cacheResponse(context, request, response)
  return response
}
