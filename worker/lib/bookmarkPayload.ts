// 书签写入 payload 的统一校验与归一化。
//
// 抽出来的直接原因：POST 和 PUT 之前是逐字符相同的两份校验条件和两份字段构造，
// 任何一次单边修改都会让新增和编辑的行为悄悄分叉。这不是美观问题，是正确性问题。

import type { BookmarkUpsertReq, DescriptionDisplayMode, IconSource } from '../../shared/types'
import { isAllowedBookmarkUrl } from '../../shared/urlPolicy'
import { isNonEmptyString, isOptionalString } from './routeHelpers'

const DESCRIPTION_MODES: readonly DescriptionDisplayMode[] = ['always', 'hover', 'hidden']
const ICON_SOURCES: readonly IconSource[] = ['direct', 'favicon_im', 'logo_surf', 'google', 'iconify', 'custom']
const OPEN_METHODS = [1, 2, 3] as const

export interface BookmarkWriteValue {
  category_id: number
  title: string
  url: string
  internal_url: string | null
  icon: string | null
  icon_source: IconSource | null
  icon_background_color: string | null
  description: string | null
  description_mode?: DescriptionDisplayMode | null
  open_method?: 1 | 2 | 3
  is_private?: boolean
}

export type BookmarkPayloadResult =
  | { ok: true; value: BookmarkWriteValue }
  | { ok: false; message: string }

export function parseBookmarkUpsertPayload(body: BookmarkUpsertReq | null): BookmarkPayloadResult {
  if (
    !body ||
    !Number.isInteger(body.category_id) ||
    body.category_id <= 0 ||
    !isNonEmptyString(body.title) ||
    !isNonEmptyString(body.url) ||
    (body.internal_url !== undefined && body.internal_url !== null && !isNonEmptyString(body.internal_url)) ||
    !isOptionalString(body.icon) ||
    !isOptionalString(body.icon_background_color) ||
    !isOptionalString(body.description) ||
    (body.description_mode !== undefined &&
      body.description_mode !== null &&
      !DESCRIPTION_MODES.includes(body.description_mode)) ||
    (body.icon_source !== undefined &&
      body.icon_source !== null &&
      !ICON_SOURCES.includes(body.icon_source)) ||
    (body.open_method !== undefined && !OPEN_METHODS.includes(body.open_method)) ||
    (body.is_private !== undefined && typeof body.is_private !== 'boolean')
  ) {
    return { ok: false, message: 'invalid bookmark payload' }
  }

  const url = body.url.trim()
  if (!isAllowedBookmarkUrl(url)) {
    return { ok: false, message: 'bookmark url must start with http:// or https://' }
  }

  const internalUrl = body.internal_url?.trim() || null
  if (internalUrl !== null && !isAllowedBookmarkUrl(internalUrl)) {
    return { ok: false, message: 'internal bookmark url must start with http:// or https://' }
  }

  return {
    ok: true,
    value: {
      category_id: body.category_id,
      title: body.title.trim(),
      url,
      internal_url: internalUrl,
      icon: body.icon ?? null,
      icon_source: body.icon_source ?? null,
      icon_background_color: body.icon_background_color?.trim() || null,
      description: body.description ?? null,
      // 显式传 null 表示「恢复跟随全局设置」，缺省表示「保留原值」，
      // 所以这里必须区分 own property 与 undefined，不能简单 `?? null`。
      ...(Object.prototype.hasOwnProperty.call(body, 'description_mode')
        ? { description_mode: body.description_mode }
        : {}),
      open_method: body.open_method,
      ...(Object.prototype.hasOwnProperty.call(body, 'is_private')
        ? { is_private: body.is_private === true }
        : {}),
    },
  }
}
