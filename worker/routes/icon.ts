import { Hono } from 'hono'
import type { IconAccessResp } from '../../shared/types'
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
  ICON_FALLBACK_CACHE,
  ICON_PRIVATE_CACHE,
  ICON_SUCCESS_CACHE,
} from '../lib/iconResponses'
import { createIconAccessGrant, verifyIconAccessGrant } from '../lib/iconSignature'
import { getJwtSecret } from '../lib/jwt'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const iconRoutes = new Hono<HonoEnv>()

// 后台预览私密对象图标用的短期授权。签名密钥复用 settings.jwt_secret，因此改密码
// （rotateJwtSecret）会顺带作废全部已签发授权。该端点在 worker/index.ts 上挂
// authRequired，只有登录态能取到。
iconRoutes.get('/icon-access', async (c) => {
  const grant = await createIconAccessGrant(await getJwtSecret(c.env.DB))
  const data: IconAccessResp = { key: grant.grant, expires_at: grant.expires_at }
  const response = c.json(ok(data))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
})

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

// 私密对象的图标预览：带合法 `key` 时跳过匿名可见性判定，返回真实图标。
//
// 判定必须发生在 edge cache 命中查询**之前**：命中查询用的键不含身份，先查就会把之前
// 写给匿名访客的兜底图标返回给管理员；而私密响应也绝不能写回那个共享键。因此授权路径
// 全程 cacheKey 为 null（不读不写 edge cache）并带 `private, no-store`，同时挡住
// Service Worker 对 `/api/category-icon/*` 的 cache-first 写入。
type IconAccessMode = {
  authorized: boolean
  cacheKey: Request | null
  // 真实图标与兜底图标的缓存策略必须分开：兜底刻意只存 5 分钟，这样后来补上的图标能很快
  // 生效；把它按 7 天的成功策略缓存等于把「暂时没有图标」钉死一周。
  successCache: string
  fallbackCache: string
}

const ANONYMOUS_ACCESS = (request: Request): IconAccessMode => ({
  authorized: false,
  cacheKey: iconCacheKey(request),
  successCache: ICON_SUCCESS_CACHE,
  fallbackCache: ICON_FALLBACK_CACHE,
})

async function resolveIconAccess(
  c: { env: HonoEnv['Bindings']; req: { raw: Request; query(name: string): string | undefined } },
): Promise<IconAccessMode> {
  const key = c.req.query('key')
  // 非法或过期的 key 一律退回匿名路径。缓存键归一化会丢掉 `key`，所以伪造的 key 既不会
  // 让缓存条目碎片化，也拿不到与匿名不同的响应。
  if (!key) return ANONYMOUS_ACCESS(c.req.raw)
  if (!(await verifyIconAccessGrant(await getJwtSecret(c.env.DB), key))) return ANONYMOUS_ACCESS(c.req.raw)

  return {
    authorized: true,
    cacheKey: null,
    successCache: ICON_PRIVATE_CACHE,
    fallbackCache: ICON_PRIVATE_CACHE,
  }
}

iconRoutes.get('/icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorIconResponse('invalid id', 400)
  }

  try {
    const { authorized, cacheKey, successCache, fallbackCache } = await resolveIconAccess(c)
    if (cacheKey) {
      const cached = await getCachedResponse(cacheKey)
      if (cached) {
        return cached
      }
    }

    const bookmark = await getBookmarkIconData(c.env.DB, id)
    // 端点匿名可访问：先判定这条书签对访客是否可见。私密书签、以及挂在私密分类（或其
    // 后代）下的公开书签，一律返回不含标题与域名的兜底图标，表现与「id 不存在」完全
    // 一致，不泄露存在性或内容线索（PROB-20 方案 1）。带合法授权时跳过该判定。
    if (!bookmark) {
      return cachedFallbackIconResponse(c, cacheKey, '', '', fallbackCache)
    }

    if (!authorized) {
      const visibleCategoryIds = getPublicCategoryIds(await listCategories(c.env.DB))
      if (!isBookmarkIconAnonymouslyVisible(bookmark, visibleCategoryIds)) {
        return cachedFallbackIconResponse(c, cacheKey, '', '', fallbackCache)
      }
    }

    if (bookmark.icon_blob) {
      const response = dataUriToResponse(bookmark.icon_blob, successCache)
      if (!response) {
        await setIconBlob(c.env.DB, id, null)
      } else {
        cacheResponse(c, cacheKey, response)
        return response
      }
    }

    if (!bookmark.icon) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon)
      const response = dataUriToResponse(bookmark.icon, successCache)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
    }

    const fetchedIcon = await fetchCacheableIcon(bookmark.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
    }

    if (isIconifyIconUrl(bookmark.icon)) {
      const response = iconBytesToResponse(fetchedIcon, successCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    await setIconBlob(c.env.DB, id, iconBytesToDataUri(fetchedIcon))
    const response = iconBytesToResponse(fetchedIcon, successCache)
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
    const { authorized, cacheKey, successCache, fallbackCache } = await resolveIconAccess(c)
    if (cacheKey) {
      const cached = await getCachedResponse(cacheKey)
      if (cached) {
        return cached
      }
    }

    // 分类图标同样匿名可访问：一次读全部分类，既算出可见集合又拿到目标分类。
    // 私密分类及其后代一律走不含标题的兜底图标（PROB-20 方案 1）。带合法授权时跳过判定。
    const categories = await listCategories(c.env.DB)
    if (!authorized && !getPublicCategoryIds(categories).has(id)) {
      return cachedFallbackIconResponse(c, cacheKey, '', '', fallbackCache)
    }

    const category = categories.find((item) => item.id === id)
    if (!category) {
      // 授权路径也不能泄露「id 不存在」与「id 存在但无图标」的区别之外的信息，
      // 因此这里与匿名路径同样传空标题。
      return cachedFallbackIconResponse(c, cacheKey, '', '', fallbackCache)
    }
    if (!category.icon) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
    }

    if (category.icon.startsWith('data:image/')) {
      const response = dataUriToResponse(category.icon, successCache)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(category.icon)) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
    }

    const fetchedIcon = await fetchCacheableIcon(category.icon)
    if (!fetchedIcon) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, category.icon, fallbackCache)
    }

    const response = iconBytesToResponse(fetchedIcon, successCache)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    return fallbackIconResponse('', '')
  }
})
