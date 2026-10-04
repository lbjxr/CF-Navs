import { Hono, type MiddlewareHandler } from 'hono'
import type { IconAccessResp } from '../../shared/types'
import { ErrCode } from '../../shared/types'
import {
  getBookmarkIconData,
  getCategory,
  isBookmarkIconAnonymouslyVisibleById,
  isCategoryIconAnonymouslyVisible,
  setIconBlob,
} from '../lib/db'
import {
  dataUriToResponse,
  fetchIcon,
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
  ICON_FAILURE_CACHE,
  getCachedResponse,
  iconCacheKey,
  iconFetchFallbackResponse,
  ICON_FALLBACK_CACHE,
  ICON_PRIVATE_CACHE,
  ICON_SUCCESS_CACHE,
  transientIconErrorResponse,
} from '../lib/iconResponses'
import { createIconAccessGrant, verifyIconAccessGrant } from '../lib/iconSignature'
import { getJwtSecret } from '../lib/jwt'
import { decodeVersionedIcon } from '../lib/iconRevision'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

export const iconRoutes = new Hono<HonoEnv>()
function normalizeCategoryIconUrl(value: string): string | null {
  const icon = value.trim()
  if (!icon) return null
  if (/^data:image\//i.test(icon) || /^https?:\/\//i.test(icon)) return icon

  const normalized = normalizeIconifySearchQuery(icon)
  const [prefix, name] = normalized.split(':')
  return prefix && name ? iconifyUrlFromParams(prefix, name) : null
}

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

    const outcome = await fetchIcon(iconUrl)
    if (!outcome.ok) {
      return iconFetchFallbackResponse(
        c,
        cacheKey,
        outcome.failure,
        c.req.param('name').replace(/\.svg$/i, ''),
        iconUrl,
      )
    }

    const response = iconBytesToResponse(outcome.icon, ICON_SUCCESS_CACHE)
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
// 全程 cacheKey 为 null（不读不写 edge cache）并带 `private, no-store`；对象代理客户端
// 统一 no-store，Service Worker 不接管这些同源 API。
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

// Only object icons need revocable client caching. Handlers clone the public response into
// caches.default before this boundary; never return its policy (including a Zone TTL override)
// to the browser. Hono's header() wraps finalized responses without copying their body.
const objectIconClientCache: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next()
  c.header('Cache-Control', c.res.headers.get('Cache-Control')?.includes('private')
    ? ICON_PRIVATE_CACHE
    : ICON_FAILURE_CACHE)
}

iconRoutes.get('/icon/:id', objectIconClientCache, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorIconResponse('invalid id', 400)
  }

  // 授权状态要在 catch 里也能用：带合法 key 的请求即使走进异常分支，响应也必须是
  // `private, no-store`，绝不能被浏览器 HTTP 缓存当成公开图标留下。
  let authorized = false
  try {
    const access = await resolveIconAccess(c)
    const cacheKey = access.cacheKey
    const successCache = access.successCache
    const fallbackCache = access.fallbackCache
    authorized = access.authorized
    if (!authorized && !await isBookmarkIconAnonymouslyVisibleById(c.env.DB, id)) {
      // 不可见/未知对象的兜底不能写入共享 cache：公开→私密、分类移动和陈旧 orphan
      // 都必须在下一次请求重新经过权威可见性闸门。
      return fallbackIconResponse('', '', ICON_FAILURE_CACHE)
    }

    if (cacheKey) {
      const cached = await getCachedResponse(cacheKey)
      if (cached) {
        return cached
      }
    }

    let bookmark = await getBookmarkIconData(c.env.DB, id)
    if (!bookmark) {
      return fallbackIconResponse('', '', fallbackCache)
    }

    if (bookmark.icon_blob) {
      const response = dataUriToResponse(bookmark.icon_blob, successCache)
      if (!response) {
        await setIconBlob(c.env.DB, id, null, bookmark)
        bookmark = await getBookmarkIconData(c.env.DB, id)
        if (!bookmark) return fallbackIconResponse('', '', fallbackCache)
      } else {
        cacheResponse(c, cacheKey, response)
        return response
      }
    }

    if (!bookmark.icon) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon, bookmark)
      const response = dataUriToResponse(bookmark.icon, successCache)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return cachedFallbackIconResponse(c, cacheKey, bookmark.title, bookmark.url, fallbackCache)
    }

    const outcome = await fetchIcon(bookmark.icon)
    if (!outcome.ok) {
      return iconFetchFallbackResponse(c, cacheKey, outcome.failure, bookmark.title, bookmark.url, fallbackCache)
    }

    const fetchedIcon = outcome.icon
    if (isIconifyIconUrl(bookmark.icon)) {
      const response = iconBytesToResponse(fetchedIcon, successCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    await setIconBlob(c.env.DB, id, iconBytesToDataUri(fetchedIcon), bookmark)
    const response = iconBytesToResponse(fetchedIcon, successCache)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    // 已解析为 authorized 的请求（合法 key）即便异常也不能回落到公开缓存策略。
    return fallbackIconResponse('', '', authorized ? ICON_PRIVATE_CACHE : ICON_FALLBACK_CACHE)
  }
})

iconRoutes.get('/category-icon/:id', objectIconClientCache, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return errorIconResponse('invalid id', 400)
  }

  // 同 /icon/:id：授权状态需要在 catch 中可见，保证合法 key 的异常响应也是 no-store。
  let authorized = false
  try {
    const access = await resolveIconAccess(c)
    const cacheKey = access.cacheKey
    const successCache = access.successCache
    const fallbackCache = access.fallbackCache
    authorized = access.authorized
    if (!authorized && !await isCategoryIconAnonymouslyVisible(c.env.DB, id)) {
      // 私密、未知或循环分类的匿名兜底不写共享 cache，避免隐私翻转后复用旧正文。
      return fallbackIconResponse('', '', ICON_FAILURE_CACHE)
    }

    if (cacheKey) {
      const cached = await getCachedResponse(cacheKey)
      if (cached) {
        return cached
      }
    }

    const category = await getCategory(c.env.DB, id)
    if (!category) {
      // 授权路径也不能泄露「id 不存在」与「id 存在但无图标」的区别之外的信息，
      // 因此这里与匿名路径同样传空标题。
      return fallbackIconResponse('', '', fallbackCache)
    }
    if (!category.icon && category.icon_blob) {
      const stored = decodeVersionedIcon(category.icon_blob)
      if (stored) {
        const response = iconBytesToResponse(stored, successCache)
        cacheResponse(c, cacheKey, response)
        return response
      }
    }
    if (!category.icon) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
    }
    const categoryIconUrl = normalizeCategoryIconUrl(category.icon)
    if (!categoryIconUrl) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
    }

    if (categoryIconUrl.startsWith('data:image/')) {
      const response = dataUriToResponse(categoryIconUrl, successCache)
      if (!response) return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
      cacheResponse(c, cacheKey, response)
      return response
    }

    if (!/^https?:\/\//i.test(categoryIconUrl)) {
      return cachedFallbackIconResponse(c, cacheKey, category.title, '', fallbackCache)
    }

    const outcome = await fetchIcon(categoryIconUrl)
    if (!outcome.ok) {
      if (outcome.failure === 'transient') {
        return transientIconErrorResponse(
          category.title,
          categoryIconUrl,
          authorized ? fallbackCache : ICON_FAILURE_CACHE,
        )
      }
      return iconFetchFallbackResponse(
        c,
        cacheKey,
        outcome.failure,
        category.title,
        categoryIconUrl,
        fallbackCache,
      )
    }

    const response = iconBytesToResponse(outcome.icon, successCache)
    cacheResponse(c, cacheKey, response)
    return response
  } catch {
    // 与 /icon/:id 同理：合法 key 的异常响应不能回落到公开缓存策略。
    return transientIconErrorResponse('', '', authorized ? ICON_PRIVATE_CACHE : ICON_FAILURE_CACHE)
  }
})
