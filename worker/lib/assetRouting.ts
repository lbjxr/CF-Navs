const APP_SHELL_PATH = '/index.html'
const ASSET_PATH_PREFIX = '/assets/'

type AssetFetcher = {
  fetch: (request: Request) => Promise<Response>
}

export function isStaticAssetRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname
  return pathname === '/assets' || pathname.startsWith(ASSET_PATH_PREFIX)
}

export function shouldFallbackToAppShell(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false

  const pathname = new URL(request.url).pathname
  if (pathname.startsWith('/api/')) return false
  if (isStaticAssetRequest(request)) return false

  const acceptsHtml = (request.headers.get('Accept') ?? '').toLowerCase().includes('text/html')
  if (acceptsHtml || pathname === '/') return true

  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1)
  return lastSegment.length > 0 && !lastSegment.includes('.')
}

function missingAssetResponse(): Response {
  return new Response(null, {
    status: 404,
    statusText: 'Not Found',
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function fetchAssetResponse(request: Request, assets: AssetFetcher): Promise<Response> {
  const response = await assets.fetch(request)

  // A global SPA fallback can turn a missing hashed module into index.html (200).
  // Never let HTML cross the /assets boundary, even if a deployment still has
  // the old `single-page-application` asset setting.
  if (isStaticAssetRequest(request) && (response.headers.get('Content-Type') ?? '').toLowerCase().includes('text/html')) {
    return missingAssetResponse()
  }

  if (response.status !== 404 || !shouldFallbackToAppShell(request)) return response

  const shellRequest = new Request(new URL(APP_SHELL_PATH, request.url), request)
  return assets.fetch(shellRequest)
}
