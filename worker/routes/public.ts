import { Hono } from 'hono'
import { ErrCode, type PublicData, type PublicSettings, type Settings, type SiteConfig } from '../../shared/types'
import {
  cachePublicDataResponse,
  cacheSiteConfigResponse,
  matchPublicDataCache,
  matchSiteConfigCache,
} from '../lib/cache'
import { getSettings, getSiteConfig, listCategoriesAndBookmarks } from '../lib/db'
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
  if (!token) {
    const cached = await matchPublicDataCache(c.req.url)
    if (cached) return cached
  }

  const publicSettings = await getSettings(c.env.DB)
  if (!publicSettings.public_mode) {
    if (!token) {
      return c.json(fail(ErrCode.FORBIDDEN, 'forbidden'))
    }

    const session = await validateSession(c.env, token)
    if (!session) {
      return c.json(fail(ErrCode.FORBIDDEN, 'forbidden'))
    }

    c.set('username', session.username)
  }

  const canUsePublicCache = publicSettings.public_mode && !token
  const { categories, bookmarks } = await listCategoriesAndBookmarks(c.env.DB)

  const data: PublicData = {
    categories,
    bookmarks,
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
