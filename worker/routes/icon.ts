import { Hono } from 'hono'
import { ErrCode } from '../../shared/types'
import {
  getBookmarkIconData,
  getPublicCategoryIds,
  isBookmarkIconAnonymouslyVisible,
  listCategories,
  setIconBlob,
} from '../lib/db'
import {
  dataUriToResponse,
  fetchCacheableIcon,
  iconBytesToDataUri,
  iconBytesToResponse,
  isIconifyIconUrl,
} from '../lib/iconData'
import { iconifyUrlFromParams, normalizeIconifySearchQuery, searchIconifyIcons } from '../lib/iconifySearch'
import {
  cachedFallbackIconResponse,
  cacheResponse,
  errorIconResponse,
  fallbackIconResponse,
  getCachedResponse,
  iconCacheKey,
  ICON_SUCCESS_CACHE,
} from '../lib/iconResponses'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const iconRoutes = new Hono<HonoEnv>()

iconRoutes.get('/iconify-search', async (c) => {
  const query = normalizeIconifySearchQuery(c.req.query('query') ?? '')
  if (!query) {
    return c.json(fail(ErrCode.BAD_REQUEST, 'invalid iconify query'), 400)
  }

  const data = await searchIconifyIcons(query, c.req.url, (request, response) => {
    cacheResponse(c, request, response)
  })
  if (!data) {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to search iconify icons'), 502)
  }

  const response = c.json(ok(data))
  response.headers.set('Cache-Control', 'private, max-age=300')
  return response
})

iconRoutes.get('/iconify/:prefix/:name', async (c) => {
  const iconUrl = iconifyUrlFromParams(c.req.param('prefix'), c.req.param('name'))
  if (!iconUrl) {
    return errorIconResponse('invalid iconify icon', 400)
  }

  try {
    const cacheKey = iconCacheKey(c.req.raw)
    const cached = await getCachedResponse(cacheKey)
    if (cached) {
      return cached
    }

    const icon = await fetchCacheableIcon(iconUrl)
    if (!icon) {
      return cachedFallbackIconResponse(c, cacheKey, c.req.param('name').replace(/\.svg$/i, ''), iconUrl)
    }

    const response = iconBytesToResponse(icon, ICON_SUCCESS_CACHE)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    return fallbackIconResponse(c.req.param('name').replace(/\.svg$/i, ''), iconUrl)
  }
})

iconRoutes.get('/icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorIconResponse('invalid id', 400)
  }

  try {
    const cacheKey = iconCacheKey(c.req.raw)
    const cached = await getCachedResponse(cacheKey)
    if (cached) {
      return cached
    }

    const bookmark = await getBookmarkIconData(c.env.DB, id)
    // 端点匿名可访问：先判定这条书签对访客是否可见。私密书签、以及挂在私密分类（或其
    // 后代）下的公开书签，一律返回不含标题与域名的兜底图标，表现与「id 不存在」完全
    // 一致，不泄露存在性或内容线索（PROB-20 方案 1）。
    if (!bookmark) {
      return cachedFallbackIconResponse(c, cacheKey, '', '')
    }

    const visibleCategoryIds = getPublicCategoryIds(await listCategories(c.env.DB))
    if (!isBookmarkIconAnonymouslyVisible(bookmark, visibleCategoryIds)) {
      return cachedFallbackIconResponse(c, cacheKey, '', '')
    }

    if (bookmark.icon_blob) {
      const response = dataUriToResponse(bookmark.icon_blob, ICON_SUCCESS_CACHE)
      if (!response) {
        await setIconBlob(c.env.DB, id, null)
      } else {
        cacheResponse(c, cacheKey, response)
        return response
      }
    }

    if (!bookmark.icon) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url)
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon)
      const response = dataUriToResponse(bookmark.icon, ICON_SUCCESS_CACHE)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url)
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url)
    }

    const fetchedIcon = await fetchCacheableIcon(bookmark.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url)
    }

    if (isIconifyIconUrl(bookmark.icon)) {
      const response = iconBytesToResponse(fetchedIcon, ICON_SUCCESS_CACHE)
      cacheResponse(c, cacheKey, response)
      return response
    }

    await setIconBlob(c.env.DB, id, iconBytesToDataUri(fetchedIcon))
    const response = iconBytesToResponse(fetchedIcon, ICON_SUCCESS_CACHE)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})

iconRoutes.get('/category-icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorIconResponse('invalid id', 400)
  }

  try {
    const cacheKey = iconCacheKey(c.req.raw)
    const cached = await getCachedResponse(cacheKey)
    if (cached) {
      return cached
    }

    // 分类图标同样匿名可访问：一次读全部分类，既算出可见集合又拿到目标分类。
    // 私密分类及其后代一律走不含标题的兜底图标（PROB-20 方案 1）。
    const categories = await listCategories(c.env.DB)
    if (!getPublicCategoryIds(categories).has(id)) {
      return cachedFallbackIconResponse(c, cacheKey, '', '')
    }

    const category = categories.find((item) => item.id === id)
    if (!category?.icon) {
      return cachedFallbackIconResponse(c, cacheKey, category?.title ?? '', '')
    }

    if (category.icon.startsWith('data:image/')) {
      const response = dataUriToResponse(category.icon, ICON_SUCCESS_CACHE)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, category.title, '')
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(category.icon)) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '')
    }

    const fetchedIcon = await fetchCacheableIcon(category.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, category.icon)
    }

    const response = iconBytesToResponse(fetchedIcon, ICON_SUCCESS_CACHE)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})
