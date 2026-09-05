import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// worker/index.ts 用的是精确路径中间件（对比 /api/bookmarks/*），
// faviconRoutes 里新增一条路由却忘记加 app.use，接口就会静默变成公开的。

// 断言对象是 worker/index.ts 的中间件注册顺序、worker/routes/favicon.ts 的内部规则，外加两个 Svelte 文件的跨组件接线，
// 主体跑在 Cloudflare Workers runtime（Hono app）上，不是可挂载的 DOM 组件（PROB-18）：faviconRoutes 每条路径都要有
// 对应 app.use('/api<path>', authRequired)，authRequired 必须先于 app.route 挂载，browser-sync 的 `/*` CORS 要在裸路径之后，
// favicon.ts 的 manifest 图标解析要早于 ${fallbackOrigin}/favicon.ico 回退；末组只查 BookmarkEditModal 是否用 requestId 复位、
// BookmarkBaseFields 是否接了 on:blur。断言的是模块里的「登记/接线次序」，挂组件既看不到 Hono 中间件登记顺序，也测不出这种源码级 wiring。

describe('site meta route wiring', () => {
  const routes = readFileSync('worker/routes/favicon.ts', 'utf8')
  const index = readFileSync('worker/index.ts', 'utf8')

  it('guards every faviconRoutes path with authRequired', () => {
    const paths = Array.from(routes.matchAll(/faviconRoutes\.\w+\(\s*'(\/[^']+)'/g)).map(
      (match) => match[1],
    )

    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(index).toContain(`app.use('/api${path}', authRequired)`)
    }
  })

  it('registers the auth middleware before mounting the routes', () => {
    expect(index.indexOf("app.use('/api/fetch-site-meta', authRequired)")).toBeLessThan(
      index.indexOf("app.route('/api', faviconRoutes)"),
    )
  })

  it('covers the nested browser-sync endpoint with CORS middleware', () => {
    expect(index.indexOf("app.use('/api/browser-sync/*', corsHeaders)")).toBeGreaterThan(
      index.indexOf("app.use('/api/browser-sync', corsHeaders)"),
    )
    expect(index.indexOf("app.use('/api/browser-sync/*', corsHeaders)")).toBeLessThan(
      index.indexOf("app.route('/api/browser-sync', browserSyncRoutes)"),
    )
  })


  it('never fails the site meta request, falling back to the hostname', () => {
    expect(routes).toContain('hostnameFallbackTitle')
    expect(routes).toContain('SITE_META_DEADLINE_MS')
  })

  it('resolves manifest icons between html links and the favicon.ico fallback', () => {
    expect(routes).toContain('extractManifestUrl')
    expect(routes).toContain('fetchManifestJson')
    expect(routes).toContain('extractManifestIcons')
    const manifestAt = routes.indexOf('extractManifestUrl(page.html')
    const originFaviconAt = routes.indexOf('${fallbackOrigin}/favicon.ico')
    expect(manifestAt).toBeGreaterThan(0)
    expect(manifestAt).toBeLessThan(originFaviconAt)
  })

  it('wires the blur trigger and the single-instance requestId reset', () => {
    const baseFields = readFileSync('src/components/BookmarkBaseFields.svelte', 'utf8')
    const modal = readFileSync('src/components/BookmarkEditModal.svelte', 'utf8')

    expect(baseFields).toContain('on:blur={() => onUrlBlur?.()}')
    expect(modal).toContain('createBookmarkTitleState(titleLookupState.requestId)')
    expect(modal).toContain('onUrlBlur={handleUrlBlur}')
  })
})
