import { Hono } from 'hono'
import type { PublicData, PublicSettings, Settings, SiteConfig } from '../../shared/types'
import { listBookmarks, listCategories, getSettings } from '../lib/db'
import { ok } from '../lib/response'
import { publicOrAuth } from '../middleware/publicMode'
import type { HonoEnv } from '../types'

function toPublicSettings(settings: Settings): PublicSettings {
  return {
    site_title: settings.site_title,
    site_title_color: settings.site_title_color,
    site_title_font_size: settings.site_title_font_size,
    theme: settings.theme,
    background: settings.background,
    custom_css: settings.custom_css,
    custom_js: settings.custom_js,
    search_engine: settings.search_engine,
    image_host_url: settings.image_host_url,
    card_size: settings.card_size,
    card_style: settings.card_style,
    card_icon_size: settings.card_icon_size,
    card_show_description: settings.card_show_description,
    card_background_color: settings.card_background_color,
    card_background_opacity: settings.card_background_opacity,
  }
}

export const publicRoutes = new Hono<HonoEnv>()

publicRoutes.get('/config', async (c) => {
  const settings = await getSettings(c.env.DB)
  const data: SiteConfig = {
    site_title: settings.site_title,
    public_mode: settings.public_mode,
  }
  return c.json(ok(data))
})

publicRoutes.get('/public/data', publicOrAuth, async (c) => {
  const [categories, bookmarks, settings] = await Promise.all([
    listCategories(c.env.DB),
    listBookmarks(c.env.DB),
    getSettings(c.env.DB),
  ])

  const data: PublicData = {
    categories,
    bookmarks,
    settings: toPublicSettings(settings),
  }

  return c.json(ok(data))
})

export default publicRoutes
