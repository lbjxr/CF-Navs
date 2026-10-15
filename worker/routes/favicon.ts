import { Hono } from 'hono'
import type { FaviconResp, SiteMetaResp } from '../../shared/types'
import {
  extractIconCandidates,
  fetchPageHtml,
  fetchWithRedirectLimit,
  FETCH_TIMEOUT_MS,
  hostnameFallbackTitle,
  parseTargetUrl,
  pickBookmarkTitle,
} from '../lib/pageMetadata'
import { extractManifestIcons, extractManifestUrl, fetchManifestJson } from '../lib/webManifest'
import { cacheResponse, getCachedResponse } from '../lib/iconResponses'
import { ok } from '../lib/response'
import { badRequest } from '../lib/routeHelpers'
import { authRequired } from '../middleware/auth'
import type { HonoEnv } from '../types'

const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.1'
const OVERALL_DEADLINE_MS = 6000
// 站点名称只需要一次页面抓取，不用像图标那样逐个探测候选，deadline 相应更短。
const SITE_META_DEADLINE_MS = 4000
const SITE_META_CACHE_SECONDS = 6 * 60 * 60

async function canFetchIcon(url: string): Promise<boolean> {
  // 重定向手动跟随：每一跳都做 SSRF 主机名校验，不用 redirect:'follow'。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    try {
      const headResponse = await fetchWithRedirectLimit(url, {
        method: 'HEAD',
        headers: {
          Accept: ICON_ACCEPT,
        },
        signal: controller.signal,
      })

      if (headResponse.ok) return true
    } catch {
      // Some hosts reject or mishandle HEAD; always fall through to a tiny GET probe.
    }

    try {
      const getResponse = await fetchWithRedirectLimit(url, {
        method: 'GET',
        headers: {
          Accept: ICON_ACCEPT,
          Range: 'bytes=0-0',
        },
        signal: controller.signal,
      })

      return getResponse.ok
    } catch {
      return false
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildFaviconImFallback(hostname: string): string {
  return `https://favicon.im/${encodeURIComponent(hostname)}?larger=true`
}

export const faviconRoutes = new Hono<HonoEnv>()

// 整个子路由统一鉴权：新增路由自动被保护，不再依赖 worker/index.ts 逐行注册
// （漏一行即公开）。index.ts 的精确路径 app.use 保留，作为双保险。
faviconRoutes.use(authRequired)

faviconRoutes.get('/fetch-favicon', async (c) => {
  const targetUrl = parseTargetUrl(new URL(c.req.url).searchParams.get('url'))
  if (!targetUrl) {
    return badRequest(c, 'invalid url')
  }

  // 解析逻辑：站内 <link> → manifest.icons → /favicon.ico → favicon.im 兜底。
  async function resolveIcon(): Promise<string> {
    let fallbackOrigin = targetUrl!.origin
    let fallbackHostname = targetUrl!.hostname

    const page = await fetchPageHtml(targetUrl!.toString())
    if (page) {
      const finalUrl = new URL(page.finalUrl)
      fallbackOrigin = finalUrl.origin
      fallbackHostname = finalUrl.hostname

      if (page.html) {
        const candidates = extractIconCandidates(page.html, page.finalUrl).slice(0, 6)
        for (const candidate of candidates) {
          if (await canFetchIcon(candidate)) {
            return candidate
          }
        }

        // 页面没有可用 <link rel=icon> 时，再解析站点 manifest 里声明的图标。
        const manifestUrl = extractManifestUrl(page.html, page.finalUrl)
        if (manifestUrl) {
          const manifest = await fetchManifestJson(manifestUrl)
          const icons = manifest ? extractManifestIcons(manifest, manifestUrl) : []
          for (const icon of icons) {
            if (await canFetchIcon(icon.url)) {
              return icon.url
            }
          }
        }
      }
    }

    const originFavicon = `${fallbackOrigin}/favicon.ico`
    if (await canFetchIcon(originFavicon)) {
      return originFavicon
    }

    return buildFaviconImFallback(fallbackHostname)
  }

  try {
    // 整体兜底：无论解析链多慢，最多 OVERALL_DEADLINE_MS 后返回 favicon.im 兜底，
    // 避免前端「一键获取」按钮长时间转圈。
    const deadline = new Promise<string>((resolve) =>
      setTimeout(() => resolve(buildFaviconImFallback(targetUrl!.hostname)), OVERALL_DEADLINE_MS),
    )
    const icon = await Promise.race([resolveIcon(), deadline])
    return c.json(ok<FaviconResp>({ icon }))
  } catch {
    // 任何异常也回退到 favicon.im 兜底，保证总能给出一个可用图标
    return c.json(ok<FaviconResp>({ icon: buildFaviconImFallback(targetUrl.hostname) }))
  }
})

// 新增书签时解析站点名称。这是便利功能，任何失败都回退到域名，不向前端报错。
faviconRoutes.get('/fetch-site-meta', async (c) => {
  const targetUrl = parseTargetUrl(new URL(c.req.url).searchParams.get('url'))
  if (!targetUrl) {
    return badRequest(c, 'invalid url')
  }

  const requestedUrl = targetUrl.toString()
  // 用合成的 key 命中 edge cache：不带 Authorization，且按目标地址区分。
  const cacheKey = new Request(
    `https://cf-navs.internal/site-meta?url=${encodeURIComponent(requestedUrl)}`,
    { method: 'GET' },
  )

  const cached = await getCachedResponse(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  const fallback: SiteMetaResp = {
    title: hostnameFallbackTitle(requestedUrl),
    final_url: requestedUrl,
  }

  async function resolveSiteMeta(): Promise<SiteMetaResp> {
    const page = await fetchPageHtml(requestedUrl)
    if (!page) {
      return fallback
    }

    return {
      title: pickBookmarkTitle({ html: page.html, finalUrl: page.finalUrl, requestedUrl }),
      final_url: page.finalUrl || requestedUrl,
    }
  }

  let meta = fallback
  try {
    const deadline = new Promise<SiteMetaResp>((resolve) =>
      setTimeout(() => resolve(fallback), SITE_META_DEADLINE_MS),
    )
    meta = await Promise.race([resolveSiteMeta(), deadline])
  } catch {
    meta = fallback
  }

  // 只缓存真正解析出内容的结果：域名兜底通常意味着这次抓取失败或被拦，
  // 缓存它会让用户重试时一直拿到同一个坏结果。
  if (meta.title && meta.title !== fallback.title) {
    cacheResponse(
      c,
      cacheKey,
      new Response(JSON.stringify(ok<SiteMetaResp>(meta)), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${SITE_META_CACHE_SECONDS}`,
        },
      }),
    )
  }

  return c.json(ok<SiteMetaResp>(meta))
})

export default faviconRoutes
