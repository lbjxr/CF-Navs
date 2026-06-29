const PUBLIC_DATA_CACHE_PATH = '/api/public/data'
const PUBLIC_DATA_BROWSER_TTL = 30
const PUBLIC_DATA_EDGE_TTL = 120
const SITE_CONFIG_CACHE_PATH = '/api/config'
const SITE_CONFIG_BROWSER_TTL = 15
const SITE_CONFIG_EDGE_TTL = 60

function normalizedCacheRequest(urlLike: string, pathname: string): Request {
  const url = new URL(urlLike)
  url.pathname = pathname
  url.search = ''
  return new Request(url.toString(), { method: 'GET' })
}

function publicDataCacheRequest(urlLike: string): Request {
  return normalizedCacheRequest(urlLike, PUBLIC_DATA_CACHE_PATH)
}

function siteConfigCacheRequest(urlLike: string): Request {
  return normalizedCacheRequest(urlLike, SITE_CONFIG_CACHE_PATH)
}

function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default
}

function waitUntil(c: unknown, promise: Promise<unknown>): void {
  const executionCtx = (c as { executionCtx?: ExecutionContext }).executionCtx
  if (executionCtx) {
    executionCtx.waitUntil(promise)
  }
}

export async function matchPublicDataCache(requestUrl: string): Promise<Response | undefined> {
  return await edgeCache().match(publicDataCacheRequest(requestUrl))
}

export async function matchSiteConfigCache(requestUrl: string): Promise<Response | undefined> {
  return await edgeCache().match(siteConfigCacheRequest(requestUrl))
}

export function cachePublicDataResponse(c: unknown, requestUrl: string, response: Response): void {
  const cached = response.clone()
  cached.headers.set(
    'Cache-Control',
    `public, max-age=${PUBLIC_DATA_BROWSER_TTL}, s-maxage=${PUBLIC_DATA_EDGE_TTL}, stale-while-revalidate=300`,
  )
  waitUntil(c, edgeCache().put(publicDataCacheRequest(requestUrl), cached))
}

export function cacheSiteConfigResponse(c: unknown, requestUrl: string, response: Response): void {
  const cached = response.clone()
  cached.headers.set(
    'Cache-Control',
    `public, max-age=${SITE_CONFIG_BROWSER_TTL}, s-maxage=${SITE_CONFIG_EDGE_TTL}, stale-while-revalidate=300`,
  )
  waitUntil(c, edgeCache().put(siteConfigCacheRequest(requestUrl), cached))
}

export function invalidatePublicDataCache(c: unknown, requestUrl: string): void {
  waitUntil(c, edgeCache().delete(publicDataCacheRequest(requestUrl)))
}

export function invalidateSiteConfigCache(c: unknown, requestUrl: string): void {
  waitUntil(c, edgeCache().delete(siteConfigCacheRequest(requestUrl)))
}
