import { describe, expect, it } from 'vitest'
import { withAssetCacheHeaders, buildStaticHtmlHeaderRules } from '../../worker/lib/assetHeaders'

function applyHeaders(pathname: string, response: Response): Response {
  return withAssetCacheHeaders(new Request(`https://example.com${pathname}`), response)
}

describe('asset response headers', () => {
  it('adds no-cache and security headers to html responses', async () => {
    const response = applyHeaders('/', new Response('<!doctype html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    expect(response.headers.get('Cache-Control')).toBe('public, no-cache, max-age=0, must-revalidate, no-transform')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(await response.text()).toBe('<!doctype html>')
  })

  it('keeps immutable cache headers on hashed assets', () => {
    const response = applyHeaders('/assets/app.js', new Response('console.log(1)'))

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('Content-Security-Policy')).toBeNull()
  })

  it('adds short cache headers to browser icon assets', () => {
    expect(applyHeaders('/icon.ico', new Response('ico')).headers.get('Cache-Control')).toBe('public, max-age=86400')
    expect(applyHeaders('/icon.png', new Response('png')).headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  it('does not override cache headers on failed asset responses', () => {
    const response = applyHeaders('/assets/missing.js', new Response('missing', {
      status: 404,
      headers: { 'Cache-Control': 'private' },
    }))

    expect(response.headers.get('Cache-Control')).toBe('private')
  })
  it('ships static asset header rules for Cloudflare asset uploads', async () => {
    const headersFile = await import('node:fs/promises').then(({ readFile }) => readFile('public/_headers', 'utf8'))

    expect(headersFile).toContain('/assets/*')
    expect(headersFile).toContain('Cache-Control: public, max-age=31536000, immutable')
    expect(headersFile).toContain('/icon.ico')
    expect(headersFile).toContain('/icon.png')
    expect(headersFile).toContain('/sw.js')
    expect(headersFile).toContain('Cache-Control: no-cache, max-age=0, must-revalidate')
  })
})

describe('content security policy', () => {
  function csp(): string {
    return applyHeaders('/', new Response('<!doctype html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })).headers.get('Content-Security-Policy') ?? ''
  }

  it('allows cross-origin iframes for the in-page bookmark modal', () => {
    // 不声明 frame-src 会回落到 default-src 'self'，
    // 「当前页弹层」打开方式点开就只有空白弹层。
    expect(csp()).toContain('frame-src https:')
  })

  it('allows blob scripts but never inline ones', () => {
    // 自定义 JS 走 blob URL + script.src，不是 script.textContent，
    // 所以不需要 'unsafe-inline'。要拿到 blob URL 必须先能执行脚本，
    // 只能注入 HTML 的攻击者（例如通过 footer_html）用不上 blob:。
    const value = csp()

    expect(value).toContain("script-src 'self' blob:")
    expect(value).not.toContain("'unsafe-inline' blob:")
    expect(value.match(/script-src[^;]*/)?.[0]).not.toContain('unsafe-inline')
  })

  it('keeps inline event handlers and javascript: urls blocked', () => {
    // footer_html 走 {@html}，里面的 onerror= / javascript: 只能靠 script-src 拦。
    // 这条断言的存在是为了让「顺手加个 unsafe-inline」立刻失败。
    const scriptSrc = csp().match(/script-src[^;]*/)?.[0] ?? ''

    expect(scriptSrc).toBe("script-src 'self' blob:")
  })

  it('closes the form-submission exfiltration channel', () => {
    // form-action 不回落到 default-src，不声明等于不限制。
    expect(csp()).toContain("form-action 'self'")
  })

  it('keeps the directives that scripts do not affect', () => {
    const value = csp()

    expect(value).toContain("default-src 'self'")
    expect(value).toContain("object-src 'none'")
    expect(value).toContain("base-uri 'self'")
    expect(value).toContain("frame-ancestors 'none'")
    expect(value).toContain("connect-src 'self'")
  })

  it('keeps the bookmark url allowlist as defence in depth', async () => {
    const { isAllowedBookmarkUrl } = await import('../../shared/urlPolicy')

    expect(isAllowedBookmarkUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedBookmarkUrl('https://example.com')).toBe(true)
  })
})

it('generates the same strict policy for HTML assets without changing script assets',()=>{
  const rules=buildStaticHtmlHeaderRules()
  const response=applyHeaders('/',new Response('<html>',{headers:{'content-type':'text/html'}}))
  expect(rules).toContain('content-security-policy: '+response.headers.get('Content-Security-Policy'))
  expect(rules).toContain('cache-control: '+response.headers.get('Cache-Control'))
  expect(rules).toContain('/admin\n')
  expect(rules).not.toContain('/sw.js')
  expect(rules).not.toContain('/assets/')
  expect(applyHeaders('/sw.js',new Response('code')).headers.get('Cache-Control')).toBe('no-cache, max-age=0, must-revalidate')
})
