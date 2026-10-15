// 前后端共享的图标 URL 构造（单一事实来源）。
// 收敛前：favicon.im 构造散落 5 处且编码不一致；Iconify URL 拼接与 host 白名单
// 前后端各写一份，口径漂移会导致一端放行一端拦截。

// ========== favicon.im ==========

export const FAVICON_IM_BASE = 'https://favicon.im'

/** 由 hostname 构造 favicon.im URL（hostname 会 encodeURIComponent）。空 hostname 返回 ''。 */
export function faviconImUrl(hostname: string, larger = true): string {
  const host = hostname.trim().toLowerCase()
  if (!host) return ''
  return `${FAVICON_IM_BASE}/${encodeURIComponent(host)}${larger ? '?larger=true' : ''}`
}

// ========== Iconify ==========

export const ICONIFY_KNOWN_HOSTS = ['api.iconify.design', 'icon-sets.iconify.design'] as const
export const ICONIFY_API_BASE = 'https://api.iconify.design'

const ICONIFY_NAME_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+$/

/** "prefix:name" 形式是否合法。 */
export function isIconifyName(value: string): boolean {
  return ICONIFY_NAME_PATTERN.test(value)
}

export function isKnownIconifyHost(host: string): boolean {
  if (typeof host !== 'string') return false
  return (ICONIFY_KNOWN_HOSTS as readonly string[]).includes(host.trim().toLowerCase())
}

/** 规范化 "prefix:name"（去 .svg 后缀、小写、去空格），非法返回 null。 */
export function normalizeIconifyPair(prefix: string, name: string): string | null {
  const normalized = `${prefix.trim().toLowerCase()}:${name.trim().toLowerCase().replace(/\.svg$/i, '')}`
  return ICONIFY_NAME_PATTERN.test(normalized) ? normalized : null
}

/** 由 prefix/name 构造 Iconify SVG URL，非法返回 null。 */
export function iconifySvgUrl(prefix: string, name: string): string | null {
  const pair = normalizeIconifyPair(prefix, name)
  if (!pair) return null
  const [p, n] = pair.split(':')
  return `${ICONIFY_API_BASE}/${encodeURIComponent(p)}/${encodeURIComponent(n)}.svg`
}

/** 由 "prefix:name" 构造 Iconify SVG URL，非法返回 null。 */
export function iconifySvgUrlFromName(name: string): string | null {
  const parts = name.split(':')
  if (parts.length !== 2) return null
  return iconifySvgUrl(parts[0], parts[1])
}
