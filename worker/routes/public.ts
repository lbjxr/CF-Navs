import { Hono } from 'hono'
import {
  ErrCode,
  type ApiResponse,
  type PublicData,
  type PublicSettings,
  type Settings,
  type SiteConfig,
} from '../../shared/types'
import {
  cachePrivatePublicDataResponse,
  cachePublicDataResponse,
  cacheSiteConfigResponse,
  matchPublicDataCache,
  matchSiteConfigCache,
} from '../lib/cache'
import { getPublicDataSource, getSiteConfig } from '../lib/db'
import { fail } from '../lib/response'
import { ok } from '../lib/response'
import { extractBearerToken, validateSession } from '../middleware/auth'
import type { HonoEnv } from '../types'

function toPublicSettings(settings: Settings): PublicSettings {
  return {
    site_title: settings.site_title,
    site_title_color: settings.site_title_color,
    site_title_font_size: settings.site_title_font_size,
    theme: settings.theme,
    background: settings.background,
    search_engine: settings.search_engine,
    image_host_url: settings.image_host_url,
    card_size: settings.card_size,
    card_style: settings.card_style,
    card_icon_size: settings.card_icon_size,
    card_show_description: settings.card_show_description,
    card_background_color: settings.card_background_color,
    card_background_opacity: settings.card_background_opacity,
    card_icon_show_title: settings.card_icon_show_title,
    card_text_color: settings.card_text_color,
    search_box_show: settings.search_box_show,
    search_engine_selector_show: settings.search_engine_selector_show,
    content_layout: settings.content_layout,
    footer_html: settings.footer_html,
  }
}

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
  const cached = await matchSiteConfigCache(c.req.url)
  if (cached) return cached

  const data: SiteConfig = await getSiteConfig(c.env.DB)
  const response = c.json(ok(data), 200, {
    'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
  })
  cacheSiteConfigResponse(c, c.req.url, response)
  return response
})

publicRoutes.get('/public/data', async (c) => {
  const token = extractBearerToken(c.req.header('Authorization'))
  let privateAccessAllowed = false
  if (!token) {
    const cached = await matchPublicDataCache(c.req.url)
    if (cached) return cached
  }

  const cachedSiteConfig = await readCachedSiteConfig(c.req.url)
  const siteConfig = cachedSiteConfig ?? await getSiteConfig(c.env.DB)
  if (!cachedSiteConfig) {
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
      cachePrivatePublicDataResponse(c, c.req.url, response)
      return response
    }

    const session = await validateSession(c.env, token)
    if (!session) {
      return unauthorizedResponse()
    }

    c.set('username', session.username)
    privateAccessAllowed = true
  }

  const publicDataSource = await getPublicDataSource(c.env.DB, cachedSiteConfig ? undefined : siteConfig)
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
      cachePrivatePublicDataResponse(c, c.req.url, response)
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
  }

  const response = c.json(ok(data), 200, {
    'Cache-Control': canUsePublicCache ? 'public, max-age=30, s-maxage=120, stale-while-revalidate=300' : 'no-store',
  })

  if (canUsePublicCache) {
    cachePublicDataResponse(c, c.req.url, response)
  }

  return response
})

export default publicRoutes
