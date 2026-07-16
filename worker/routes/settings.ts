import { Hono } from 'hono'
import type { Context } from 'hono'
import { BUILTIN_BACKGROUND_PRESET_IDS, ErrCode, type Settings, type SettingsUpdateReq } from '../../shared/types'
import { SETTINGS_KEYS } from '../../shared/settings'
import { invalidatePublicDataCache, invalidateSiteConfigCache } from '../lib/cache'
import { getSettings, settingsFromPatchDefaults, touchDataVersion, updateSettings, writeSettingsPatch } from '../lib/db'
import { fail, ok } from '../lib/response'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

const COMPLETE_PUBLIC_SETTINGS_KEYS: readonly (keyof Settings)[] = SETTINGS_KEYS

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

async function readJson<T>(c: AppContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

function isCompletePublicSettingsPatch(body: SettingsUpdateReq): body is Partial<Settings> {
  return COMPLETE_PUBLIC_SETTINGS_KEYS.every((key) => body[key] !== undefined)
}

function isValidBackgroundPayload(value: unknown): value is Partial<Settings['background']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const background = value as Partial<Settings['background']>
  return (
    (background.type === undefined || ['image', 'color', 'gradient'].includes(background.type)) &&
    (background.value === undefined || typeof background.value === 'string') &&
    (background.blur === undefined || typeof background.blur === 'number') &&
    (background.mask === undefined || typeof background.mask === 'number') &&
    (background.maskColor === undefined || typeof background.maskColor === 'string')
  )
}

export const settingsRoutes = new Hono<HonoEnv>()

settingsRoutes.get('/', async (c) => {
  try {
    return c.json(ok(await getSettings(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to get settings'))
  }
})

settingsRoutes.put('/', async (c) => {
  const body = await readJson<SettingsUpdateReq>(c)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(c, 'invalid settings payload')
  }

  if (body.theme !== undefined && !['light', 'dark', 'auto'].includes(body.theme)) {
    return badRequest(c, 'invalid theme')
  }
  if (
    body.background_preset_id !== undefined &&
    body.background_preset_id !== 'custom' &&
    !BUILTIN_BACKGROUND_PRESET_IDS.includes(body.background_preset_id)
  ) {
    return badRequest(c, 'invalid background_preset_id')
  }
  if (body.public_mode !== undefined && typeof body.public_mode !== 'boolean') {
    return badRequest(c, 'invalid public_mode')
  }
  if (body.site_title !== undefined && typeof body.site_title !== 'string') {
    return badRequest(c, 'invalid site_title')
  }
  if (body.site_title_color !== undefined && typeof body.site_title_color !== 'string') {
    return badRequest(c, 'invalid site_title_color')
  }
  if (body.site_title_font_size !== undefined && typeof body.site_title_font_size !== 'number') {
    return badRequest(c, 'invalid site_title_font_size')
  }
  if (body.custom_css !== undefined && typeof body.custom_css !== 'string') {
    return badRequest(c, 'invalid custom_css')
  }
  if (body.custom_js !== undefined && typeof body.custom_js !== 'string') {
    return badRequest(c, 'invalid custom_js')
  }
  if (body.image_host_url !== undefined && typeof body.image_host_url !== 'string') {
    return badRequest(c, 'invalid image_host_url')
  }
  if (body.background !== undefined) {
    if (!isValidBackgroundPayload(body.background)) {
      return badRequest(c, 'invalid background')
    }
  }
  if (body.backgrounds !== undefined) {
    const backgrounds = body.backgrounds
    if (!backgrounds || typeof backgrounds !== 'object' || Array.isArray(backgrounds)) {
      return badRequest(c, 'invalid backgrounds')
    }
    if (!isValidBackgroundPayload(backgrounds.light)) {
      return badRequest(c, 'invalid backgrounds.light')
    }
    if (!isValidBackgroundPayload(backgrounds.dark)) {
      return badRequest(c, 'invalid backgrounds.dark')
    }
  }
  if (
    body.search_engine !== undefined &&
    (!body.search_engine || typeof body.search_engine !== 'object' || Array.isArray(body.search_engine))
  ) {
    return badRequest(c, 'invalid search_engine')
  }
  if (body.card_background_color !== undefined && typeof body.card_background_color !== 'string') {
    return badRequest(c, 'invalid card_background_color')
  }
  if (body.card_show_description !== undefined && typeof body.card_show_description !== 'boolean') {
    return badRequest(c, 'invalid card_show_description')
  }
  if (body.card_description_mode !== undefined && !['always', 'hover', 'hidden'].includes(body.card_description_mode)) {
    return badRequest(c, 'invalid card_description_mode')
  }
  if (body.card_background_opacity !== undefined && typeof body.card_background_opacity !== 'number') {
    return badRequest(c, 'invalid card_background_opacity')
  }
  if (body.card_icon_show_title !== undefined && typeof body.card_icon_show_title !== 'boolean') {
    return badRequest(c, 'invalid card_icon_show_title')
  }
  if (body.card_text_color !== undefined && typeof body.card_text_color !== 'string') {
    return badRequest(c, 'invalid card_text_color')
  }
  if (body.search_box_show !== undefined && typeof body.search_box_show !== 'boolean') {
    return badRequest(c, 'invalid search_box_show')
  }
  if (body.search_engine_selector_show !== undefined && typeof body.search_engine_selector_show !== 'boolean') {
    return badRequest(c, 'invalid search_engine_selector_show')
  }
  if (body.content_layout !== undefined) {
    const layout = body.content_layout
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
      return badRequest(c, 'invalid content_layout')
    }
    if ('max_width' in layout && typeof layout.max_width !== 'number') {
      return badRequest(c, 'invalid content_layout.max_width')
    }
    if ('max_width_unit' in layout && !['px', '%'].includes(layout.max_width_unit)) {
      return badRequest(c, 'invalid content_layout.max_width_unit')
    }
    if ('margin_x' in layout && typeof layout.margin_x !== 'number') {
      return badRequest(c, 'invalid content_layout.margin_x')
    }
    if ('margin_top' in layout && typeof layout.margin_top !== 'number') {
      return badRequest(c, 'invalid content_layout.margin_top')
    }
    if ('margin_bottom' in layout && typeof layout.margin_bottom !== 'number') {
      return badRequest(c, 'invalid content_layout.margin_bottom')
    }
  }
  if (body.navigation !== undefined) {
    if (!body.navigation || typeof body.navigation !== 'object' || Array.isArray(body.navigation)) {
      return badRequest(c, 'invalid navigation')
    }
    if (!['left', 'top'].includes(body.navigation.position)) {
      return badRequest(c, 'invalid navigation.position')
    }
    if (typeof body.navigation.always_expanded !== 'boolean') {
      return badRequest(c, 'invalid navigation.always_expanded')
    }
  }
  if (body.footer_html !== undefined && typeof body.footer_html !== 'string') {
    return badRequest(c, 'invalid footer_html')
  }

  try {
    const settingsPatch: SettingsUpdateReq = { ...body }
    if (body.card_description_mode !== undefined) {
      settingsPatch.card_show_description = body.card_description_mode === 'always'
    } else if (body.card_show_description !== undefined) {
      settingsPatch.card_description_mode = body.card_show_description ? 'always' : 'hidden'
    }
    const hasCompletePublicSettings = isCompletePublicSettingsPatch(settingsPatch)
    let settings: Settings
    if (hasCompletePublicSettings) {
      await writeSettingsPatch(c.env.DB, settingsPatch)
      settings = settingsFromPatchDefaults(settingsPatch)
    } else {
      settings = await updateSettings(c.env.DB, settingsPatch)
    }
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    invalidateSiteConfigCache(c, c.req.url)
    return c.json(ok(settings))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to update settings'))
  }
})

export default settingsRoutes
