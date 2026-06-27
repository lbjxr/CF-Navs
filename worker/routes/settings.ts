import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type SettingsUpdateReq } from '../../shared/types'
import { getSettings, updateSettings } from '../lib/db'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

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
    const background = body.background
    if (!background || typeof background !== 'object' || Array.isArray(background)) {
      return badRequest(c, 'invalid background')
    }
    if ('type' in background && !['image', 'color', 'gradient'].includes(background.type)) {
      return badRequest(c, 'invalid background.type')
    }
    if ('value' in background && typeof background.value !== 'string') {
      return badRequest(c, 'invalid background.value')
    }
    if ('blur' in background && typeof background.blur !== 'number') {
      return badRequest(c, 'invalid background.blur')
    }
    if ('mask' in background && typeof background.mask !== 'number') {
      return badRequest(c, 'invalid background.mask')
    }
    if ('maskColor' in background && typeof background.maskColor !== 'string') {
      return badRequest(c, 'invalid background.maskColor')
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
  if (body.card_background_opacity !== undefined && typeof body.card_background_opacity !== 'number') {
    return badRequest(c, 'invalid card_background_opacity')
  }

  try {
    return c.json(ok(await updateSettings(c.env.DB, body)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to update settings'))
  }
})

export default settingsRoutes
