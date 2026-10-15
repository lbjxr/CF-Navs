import { Hono } from 'hono'
import { ErrCode, type ImportResp } from '../../shared/types'
import { readBoundedBody } from '../../shared/boundedBody'
import { invalidatePublicDataCache, invalidateSiteConfigCache } from '../lib/cache'
import { getAdminData, getSettings, importData, listBookmarks, listCategories } from '../lib/db'
import { mergeImportData } from '../lib/db/importMerge'
import { validateImportPayload } from '../lib/importValidation'
import { fail, ok } from '../lib/response'
import { badRequest } from '../lib/routeHelpers'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import { findSettingsLengthError } from '../lib/settingsLimits'
import type { HonoEnv } from '../types'

export const dataRoutes = new Hono<HonoEnv>()

// 备份 JSON 可能很大（20000 书签 × 图标 data URI）：无界 c.req.json() 一次
// JSON.parse 就能冲破 Worker 128MB 内存。先流式限长再解析，超限直接 413。
const MAX_IMPORT_BODY_BYTES = 32 * 1024 * 1024

dataRoutes.post('/import', async (c) => {
  const bodyBytes = await readBoundedBody(c.req.raw.body, MAX_IMPORT_BODY_BYTES)
  if (!bodyBytes) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'import payload too large (max 32MB, split the backup and import in parts)'), 413)
  }
  let rawBody: unknown
  try {
    rawBody = JSON.parse(new TextDecoder().decode(bodyBytes))
  } catch {
    return badRequest(c, 'invalid json body')
  }
  const validation = validateImportPayload(rawBody)
  if (!validation.ok) return badRequest(c, validation.message)
  const payload = validation.payload

  // 导入的 settings 走 PUT /api/settings 同一套长度校验：
  // 否则一份被篡改的备份能写入超大 background.value / custom_js，
  // 之后每个访客拉 /api/public/data 都被拖死（存储型 DoS）。
  if (payload.settings) {
    const settingsLengthError = findSettingsLengthError(payload.settings as Record<string, unknown>)
    if (settingsLengthError) {
      return badRequest(c, `${settingsLengthError.field} exceeds the ${settingsLengthError.max} character limit`)
    }
  }

  try {
    const current = payload.mode === 'merge'
      ? await Promise.all([listCategories(c.env.DB), listBookmarks(c.env.DB), getSettings(c.env.DB)]).then(([categories, bookmarks, settings]) => ({ categories, bookmarks, settings }))
      : null
    const merged = current ? mergeImportData(current, payload) : null
    // 合并模式走增量写入：只 INSERT 新行，不全量 DELETE 重插。
    const result = merged
      ? await importData(
          c.env.DB,
          {
            categories: merged.newCategories,
            bookmarks: merged.newBookmarks,
            settings: merged.payload.settings,
          },
          { incremental: true },
        )
      : await importData(c.env.DB, {
          categories: payload.categories,
          bookmarks: payload.bookmarks,
          settings: payload.settings,
        })
    // Import reconstructs IDs (including current merge mode); return its new dataset and versions.
    const data = await getAdminData(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    invalidateSiteConfigCache(c, c.req.url)
    return c.json(ok<ImportResp>({
      categories: payload.mode === 'merge' ? payload.categories.length : result.categories,
      bookmarks: payload.mode === 'merge' ? payload.bookmarks.length - (merged?.skippedBookmarks ?? 0) : result.bookmarks,
      data,
      mode: payload.mode ?? 'replace',
      created_categories: merged?.createdCategories ?? result.categories,
      reused_categories: merged?.reusedCategories ?? 0,
      // 合并模式跳过的重复链接，加上校验阶段因协议不合规被丢弃的条数。
      skipped_bookmarks: (merged?.skippedBookmarks ?? 0) + validation.droppedBookmarks,
    }))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to import data'))
  }
})

export default dataRoutes
