import { Hono } from 'hono'
import {
  ErrCode,
  type ApiResponse,
  type DataVersionResp,
  type PublicData,
  type SiteConfig,
} from '../../shared/types'
import { toPublicSettings } from '../../shared/settings'
import {
  cachePrivatePublicDataResponse,
  cachePublicDataResponse,
  cacheSiteConfigResponse,
  matchPublicDataCache,
  matchSiteConfigCache,
} from '../lib/cache'
import { getDataVersion, getPublicDataSource, getSiteConfig, getSiteConfigWithDataVersion, incrementBookmarkClick } from '../lib/db'
import { shouldBypassRequestCache } from '../lib/requestCache'
import { fail } from '../lib/response'
import { ok } from '../lib/response'
import { hasSessionBinding } from '../lib/sessionStore'
import { extractBearerToken, validateSession } from '../middleware/auth'
import type { HonoEnv } from '../types'

function isSiteConfig(value: unknown): value is SiteConfig {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SiteConfig>
  return typeof candidate.site_title === 'string' && typeof candidate.public_mode === 'boolean'
}

async function readCachedSiteConfig(requestUrl: string): Promise<SiteConfig | null> {
  const cached = await matchSiteConfigCache(requestUrl)
  if (!cached) return null

  try {
    const payload = await cached.clone().json<ApiResponse<SiteConfig>>()
    return isSiteConfig(payload.data) ? payload.data : null
  } catch {
    return null
  }
}

function cacheSiteConfigData(c: Parameters<typeof cacheSiteConfigResponse>[0], requestUrl: string, data: SiteConfig): void {
  const response = Response.json(ok(data), {
    headers: {
      'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
    },
  })
  cacheSiteConfigResponse(c, requestUrl, response)
}

function unauthorizedResponse() {
  return Response.json(fail(ErrCode.UNAUTHORIZED, 'unauthorized'), {
    status: 401,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export const publicRoutes = new Hono<HonoEnv>()

publicRoutes.get('/config', async (c) => {
  const bypassCache = shouldBypassRequestCache(c.req.header('Cache-Control'), c.req.header('Pragma'))
  if (!bypassCache) {
    const cached = await matchSiteConfigCache(c.req.url)
    if (cached) return cached
  }

  const data: SiteConfig = await getSiteConfig(c.env.DB)
  const response = c.json(ok(data), 200, {
    'Cache-Control': bypassCache ? 'no-store' : 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
  })
  if (!bypassCache) {
    cacheSiteConfigResponse(c, c.req.url, response)
  }
  return response
})

publicRoutes.get('/data/version', async (c) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  // 每次页面加载都会走这里，所以站点配置和数据版本合并成一条 D1 查询。
  const { config: siteConfig, version } = await getSiteConfigWithDataVersion(c.env.DB)

  if (!siteConfig.public_mode) {
    if (!token) {
      return c.json({
        ...fail(ErrCode.FORBIDDEN, 'forbidden'),
        data: {
          site_title: siteConfig.site_title,
          public_mode: false,
        },
      }, 200, {
        'Cache-Control': 'no-store',
      })
    }

    const session = await validateSession(c.env, token)
    if (!session) {
      return unauthorizedResponse()
    }

    c.set('username', session.username)
  }

  const data: DataVersionResp = {
    version,
    site_title: siteConfig.site_title,
    public_mode: siteConfig.public_mode,
  }

  return c.json(ok(data), 200, {
    'Cache-Control': 'no-store',
  })
})

publicRoutes.get('/public/data', async (c) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  const bypassCache = shouldBypassRequestCache(c.req.header('Cache-Control'), c.req.header('Pragma'))
  let privateAccessAllowed = false
  if (!token && !bypassCache) {
    const cached = await matchPublicDataCache(c.req.url)
    if (cached) return cached
  }

  const cachedSiteConfig = bypassCache ? null : await readCachedSiteConfig(c.req.url)
  const siteConfig = cachedSiteConfig ?? await getSiteConfig(c.env.DB)
  if (!cachedSiteConfig && !bypassCache) {
    cacheSiteConfigData(c, c.req.url, siteConfig)
  }
  if (!siteConfig.public_mode) {
    if (!token) {
      const response = c.json({
        ...fail(ErrCode.FORBIDDEN, 'forbidden'),
        data: {
          site_title: siteConfig.site_title,
          public_mode: false,
        },
      }, 200, {
        'Cache-Control': 'no-store',
      })
      if (!bypassCache) {
        cachePrivatePublicDataResponse(c, c.req.url, response)
      }
      return response
    }

    const session = await validateSession(c.env, token)
    if (!session) {
      return unauthorizedResponse()
    }

    c.set('username', session.username)
    privateAccessAllowed = true
  } else if (token) {
    // 公开模式下，普通访客无需登录；但携带有效管理员会话时，额外返回私密书签。
    // 无效 token 不应被当作管理员会话使用，避免旧会话或伪造请求混淆权限。
    const session = await validateSession(c.env, token)
    if (!session) return unauthorizedResponse()
    c.set('username', session.username)
    privateAccessAllowed = true
  }

  const publicDataSource = await getPublicDataSource(
    c.env.DB,
    cachedSiteConfig ? undefined : siteConfig,
    privateAccessAllowed,
  )
  const publicSettings = publicDataSource.settings
  if (!publicSettings.public_mode && !privateAccessAllowed) {
    if (!token) {
      const response = c.json({
        ...fail(ErrCode.FORBIDDEN, 'forbidden'),
        data: {
          site_title: publicSettings.site_title,
          public_mode: false,
        },
      }, 200, {
        'Cache-Control': 'no-store',
      })
      if (!bypassCache) {
        cachePrivatePublicDataResponse(c, c.req.url, response)
      }
      return response
    }

    const session = await validateSession(c.env, token)
    if (!session) {
      return unauthorizedResponse()
    }

    c.set('username', session.username)
    privateAccessAllowed = true
  }

  const canUsePublicCache = publicSettings.public_mode && !token

  const data: PublicData = {
    categories: publicDataSource.categories,
    bookmarks: publicDataSource.bookmarks,
    settings: toPublicSettings(publicSettings),
    version: await getDataVersion(c.env.DB),
  }

  const response = c.json(ok(data), 200, {
    'Cache-Control': canUsePublicCache && !bypassCache
      ? 'public, max-age=30, s-maxage=120, stale-while-revalidate=300'
      : 'no-store',
  })

  if (canUsePublicCache && !bypassCache) {
    cachePublicDataResponse(c, c.req.url, response)
  }

  return response
})

import { getClientIp } from '../middleware/rateLimit'

publicRoutes.post('/public/bookmarks/:id/click', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid id'), 400)
  }

  // 点击计数限流（每 IP + 书签 10 分钟最多 3 次）。这是 best-effort：缺 `SESSION` 绑定或
  // KV 抛错时**继续计数**，不像鉴权路径那样 fail-closed——限流失效只是计数偏高，而拒绝
  // 匿名点击会让公开首页的正常功能坏掉（PROB-31 的口径区分）。
  if (hasSessionBinding(c.env)) {
    try {
      const ip = getClientIp(c)
      const rateLimitKey = `rl:click:${ip}:${id}`
      const now = Date.now()
      const raw = await c.env.SESSION.get(rateLimitKey)
      let state = raw ? JSON.parse(raw) : null

      if (state && state.resetAt > now) {
        if (state.count >= 3) {
          // Silent ignore, return success
          return c.json(ok(null))
        }
        state.count++
      } else {
        state = { count: 1, resetAt: now + 600000 }
      }

      const ttl = Math.max(1, Math.ceil((state.resetAt - now) / 1000))
      await c.env.SESSION.put(rateLimitKey, JSON.stringify(state), { expirationTtl: ttl })
    } catch (err) {
      console.error('Failed to apply click count rate limiting:', err)
    }
  }

  try {
    const success = await incrementBookmarkClick(c.env.DB, id)
    if (!success) {
      return c.json(fail(ErrCode.NOT_FOUND, 'bookmark not found'), 404)
    }
    // 点击计数不提升 data_version：每次点击都提升会让所有访客的公开数据缓存整体失效。
    // 后台「访问分析」在打开时强制拉取最新聚合数据，因此这里无需破坏缓存。
    return c.json(ok(null))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to increment click count'), 500)
  }
})

export default publicRoutes
