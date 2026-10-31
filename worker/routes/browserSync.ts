import { Hono } from 'hono'
import { ErrCode, type BrowserSyncReq } from '../../shared/types'
import { getSettings, syncBrowserBookmarks } from '../lib/db'
import { createMutationReceipt } from '../lib/db/mutation'
import { mutationJson } from '../lib/mutationResponse'
import { fail } from '../lib/response'
import { badRequest, readJson, serverError } from '../lib/routeHelpers'
import type { HonoEnv } from '../types'

const MAX_BATCH_SIZE = 100

export const browserSyncRoutes = new Hono<HonoEnv>()

browserSyncRoutes.post('/bookmarks', async (c) => {
  const settings = await getSettings(c.env.DB)
  if (!settings.browser_sync_enabled) {
    return c.json(fail(ErrCode.CONFLICT, 'browser bookmark sync is disabled'))
  }

  const body = await readJson<BrowserSyncReq>(c)
  if (
    !body ||
    !Array.isArray(body.bookmarks) ||
    body.bookmarks.length > MAX_BATCH_SIZE ||
    !body.bookmarks.every((bookmark) => bookmark && typeof bookmark === 'object') ||
    (body.category_id !== undefined &&
      (!Number.isInteger(body.category_id) || (body.category_id as number) <= 0))
  ) {
    return badRequest(c, 'invalid browser sync payload')
  }

  try {
    const receipt = createMutationReceipt()
    const result = await syncBrowserBookmarks(c.env.DB, body.bookmarks, receipt, body.category_id)
    if (!result) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    return mutationJson(c, result, receipt)
  } catch (error) {
    return serverError(c, 'failed to sync browser bookmarks', error)
  }
})

export default browserSyncRoutes
