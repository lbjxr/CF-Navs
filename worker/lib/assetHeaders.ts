const IMMUTABLE_ASSET_CACHE = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE = 'no-cache, max-age=0, must-revalidate'
const HTML_CACHE = 'public, ' + REVALIDATE_CACHE + ', no-transform'
const SHORT_STATIC_CACHE = 'public, max-age=86400'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // blob: 是为了让后台的「自定义 JS」能跑：注入方式是 blob URL + script.src，
  // 而不是 script.textContent（那按规范算内联脚本，需要 'unsafe-inline'）。
  //
  // 为什么 blob: 远比 'unsafe-inline' 安全：要拿到一个 blob URL 必须先调用
  // URL.createObjectURL，也就是已经能执行脚本了。只能注入 HTML 的攻击者
  // （例如通过 footer_html）没有这个能力——blob 的 UUID 不可猜测、只在创建它的
  // 文档上下文里有效，而且加载完立刻 revoke。所以放开 blob: 不会给他们任何收益。
  //
  // 保持没有 'unsafe-inline' 的直接效果：footer_html 里的 onerror= 之类内联事件
  // 处理器、javascript: 链接、任意内联 <script> 全部仍然被阻断。
  "script-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // 书签的「当前页弹层」打开方式要嵌入外站。不声明 frame-src 会回落到
  // default-src 'self'，跨源 iframe 全被拦掉，那个打开方式点开只有空白弹层。
  // 只放开 iframe，不影响脚本；能不能嵌仍由目标站点自己的 X-Frame-Options 决定。
  'frame-src https:',
  // form-action 不会回落到 default-src，不显式声明等于不限制。
  // 这是脚本执行后最省事的一条外泄通道，顺手堵上。
  "form-action 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ')

export function setSecurityHeaders(headers: Headers): void {
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

/** Assets may bypass the Worker. Generate identical HTML policy at build time.
 * no-transform also prevents automatic beacon injection incompatible with the
 * deliberately strict script policy; it does not grant third-party execution. */
export function buildStaticHtmlHeaderRules(): string {
  const headers = new Headers()
  setSecurityHeaders(headers)
  headers.set('Cache-Control', HTML_CACHE)
  const lines = [...headers].map(([name, value]) => `  ${name}: ${value}`).join('\n')
  return ['/', '/index.html', '/admin', '/admin/', '/install', '/install/'].map(route => `${route}\n${lines}`).join('\n\n')
}

export function withAssetCacheHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url)
  const headers = new Headers(response.headers)
  const contentType = headers.get('Content-Type') ?? ''
  const isHtml =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    contentType.includes('text/html')

  if (response.ok) {
    if (isHtml || url.pathname === '/sw.js') {
      headers.set('Cache-Control', isHtml ? HTML_CACHE : REVALIDATE_CACHE)
    } else if (url.pathname.startsWith('/assets/')) {
      headers.set('Cache-Control', IMMUTABLE_ASSET_CACHE)
    } else if (
      url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/icon.ico' ||
      url.pathname === '/icon.png'
    ) {
      headers.set('Cache-Control', SHORT_STATIC_CACHE)
    }

    if (isHtml) {
      setSecurityHeaders(headers)
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
