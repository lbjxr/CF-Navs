import type { IconifyCandidate, IconifySearchResp } from '../../shared/types'
import { iconifySvgUrl, iconifySvgUrlFromName, isKnownIconifyHost, normalizeIconifyPair } from '../../shared/icons'
import { fetchIcon, iconBytesToResponse } from './iconData'
import { ICON_SUCCESS_CACHE, iconCacheKey } from './iconResponses'
import { extractSvgText, svgHasColor } from './svgColor'

const ICONIFY_SEARCH_CACHE_MS = 10 * 60 * 1000
const ICONIFY_SEARCH_LIMIT = 64
const ICONIFY_SEARCH_RESULT_LIMIT = 8
const ICONIFY_SVG_INSPECT_LIMIT = 24
const ICONIFY_FETCH_CONCURRENCY = 8
const ICONIFY_SEARCH_TIMEOUT_MS = 4000
const ICONIFY_ICON_FETCH_TIMEOUT_MS = 1800

type IconifyCollectionInfo = {
  name?: string
  palette?: boolean
}

type IconifySearchApiResponse = {
  icons?: unknown
  collections?: Record<string, IconifyCollectionInfo>
}

type CachedIconifySearch = {
  expires: number
  data: IconifySearchResp
}

type IconifySearchWorkItem = {
  name: string
  prefix: string
  icon: string
  palette: boolean
  collection: string
  order: number
}

type IconifyInspectedCandidate = IconifyCandidate & {
  palette: boolean
  order: number
}

type IconCacheWriter = (request: Request, response: Response) => void

const iconifySearchCache = new Map<string, CachedIconifySearch>()

function normalizeIconifyParam(value: string): string {
  return decodeURIComponent(value).replace(/\.svg$/i, '').trim().toLowerCase()
}

export function normalizeIconifyNamePair(prefix: string, name: string): string | null {
  return normalizeIconifyPair(prefix, name)
}

export function normalizeIconifySearchQuery(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ''

  const withoutUrl = iconifyNameFromKnownHost(trimmed) ?? trimmed
  const withoutPrefix = withoutUrl
    .replace(/^iconify:/, '')
    .replace(/^@iconify-json\//, '')
    .replace(/^@iconify-icons\//, '')
    .replace(/\/+$/g, '')

  const compactIconifyName = withoutPrefix.replace(/\s+/g, '').replace(/\//g, ':')
  if (/^[a-z0-9-]+:[a-z0-9-]+$/.test(compactIconifyName)) {
    return compactIconifyName
  }

  const plain = withoutPrefix
    .replace(/[^a-z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return ''

  const words = plain.split(' ')
  const query = words.length > 1 && words.every((word) => word.length === 1) ? words.join('') : plain
  return query.length >= 2 && query.length <= 80 ? query : ''
}

function iconifyNameFromKnownHost(value: string): string | null {
  const withoutScheme = value.trim().toLowerCase().replace(/^https?:\/\//, '')
  const pathOnly = withoutScheme.split(/[?#]/, 1)[0]
  const parts = pathOnly.split('/').filter(Boolean)
  const host = parts[0]

  if (!isKnownIconifyHost(host)) {
    return null
  }

  if (parts.length < 3) return null
  return normalizeIconifyNamePair(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]))
}

function iconifyUrlFromName(name: string): string | null {
  return iconifySvgUrlFromName(name)
}

export function iconifyUrlFromParams(prefixParam: string, nameParam: string): string | null {
  const prefix = normalizeIconifyParam(prefixParam)
  const name = normalizeIconifyParam(nameParam)
  return iconifySvgUrl(prefix, name)
}

export function iconifyProxyPath(prefix: string, icon: string): string {
  return `/api/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(icon)}.svg`
}

function iconifyProxyRequest(baseUrl: string, prefix: string, icon: string): Request {
  const requestUrl = new URL(baseUrl)
  requestUrl.pathname = iconifyProxyPath(prefix, icon)
  requestUrl.search = ''
  // Search prewarm and `/api/iconify/:prefix/:name` lookup must share the exact ns/v key;
  // otherwise prewarm writes an unreachable legacy URL and every preview re-fetches upstream.
  return iconCacheKey(new Request(requestUrl.toString(), { method: 'GET' }))
}

function getCachedIconifySearch(query: string): IconifySearchResp | null {
  const cached = iconifySearchCache.get(query)
  if (!cached) return null

  if (cached.expires <= Date.now()) {
    iconifySearchCache.delete(query)
    return null
  }

  return cached.data
}

function setCachedIconifySearch(query: string, data: IconifySearchResp) {
  if (iconifySearchCache.size > 100) {
    for (const [key, cached] of iconifySearchCache) {
      if (cached.expires <= Date.now() || iconifySearchCache.size > 80) {
        iconifySearchCache.delete(key)
      }
    }
  }

  iconifySearchCache.set(query, {
    expires: Date.now() + ICONIFY_SEARCH_CACHE_MS,
    data,
  })
}

async function fetchIconifySearchApi(query: string): Promise<IconifySearchApiResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ICONIFY_SEARCH_TIMEOUT_MS)

  try {
    const url = new URL('https://api.iconify.design/search')
    url.searchParams.set('query', query)
    url.searchParams.set('limit', String(ICONIFY_SEARCH_LIMIT))

    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })
    if (!response.ok) return null

    return (await response.json()) as IconifySearchApiResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function buildIconifyWorkItems(query: string, payload: IconifySearchApiResponse): IconifySearchWorkItem[] {
  const collections = payload.collections ?? {}
  const seen = new Set<string>()
  const names: string[] = []

  if (/^[a-z0-9-]+:[a-z0-9-]+$/.test(query)) {
    names.push(query)
  }

  if (Array.isArray(payload.icons)) {
    for (const icon of payload.icons) {
      if (typeof icon === 'string') {
        names.push(icon)
      }
    }
  }

  const items: IconifySearchWorkItem[] = []
  for (const rawName of names) {
    const [rawPrefix, rawIcon] = rawName.split(':')
    const normalizedName = normalizeIconifyNamePair(rawPrefix ?? '', rawIcon ?? '')
    if (!normalizedName || seen.has(normalizedName)) continue
    seen.add(normalizedName)

    const [prefix, icon] = normalizedName.split(':')
    const collection = collections[prefix]
    items.push({
      name: normalizedName,
      prefix,
      icon,
      palette: Boolean(collection?.palette),
      collection: collection?.name || prefix,
      order: items.length,
    })
  }

  return items.sort((a, b) => Number(b.palette) - Number(a.palette) || a.order - b.order)
}

function createIconifyCandidate(item: IconifySearchWorkItem, colored: boolean): IconifyCandidate {
  return {
    name: item.name,
    prefix: item.prefix,
    icon: item.icon,
    label: item.name,
    collection: item.collection,
    url: `https://api.iconify.design/${encodeURIComponent(item.prefix)}/${encodeURIComponent(item.icon)}.svg`,
    preview_url: iconifyProxyPath(item.prefix, item.icon),
    colored,
  }
}

async function inspectIconifyCandidate(
  baseUrl: string,
  item: IconifySearchWorkItem,
  writeIconCache: IconCacheWriter,
): Promise<IconifyInspectedCandidate | null> {
  const iconUrl = iconifyUrlFromName(item.name)
  if (!iconUrl) return null

  const outcome = await fetchIcon(iconUrl, ICONIFY_ICON_FETCH_TIMEOUT_MS)
  if (!outcome.ok) return null

  const icon = outcome.icon
  const svg = extractSvgText(icon.bytes, icon.contentType)
  const colored = svg ? svgHasColor(svg) : false
  const response = iconBytesToResponse(icon, ICON_SUCCESS_CACHE)
  writeIconCache(iconifyProxyRequest(baseUrl, item.prefix, item.icon), response)

  return {
    ...createIconifyCandidate(item, colored),
    palette: item.palette,
    order: item.order,
  }
}

async function inspectIconifyCandidates(
  baseUrl: string,
  items: IconifySearchWorkItem[],
  writeIconCache: IconCacheWriter,
): Promise<IconifyInspectedCandidate[]> {
  const results: IconifyInspectedCandidate[] = []

  for (let offset = 0; offset < items.length; offset += ICONIFY_FETCH_CONCURRENCY) {
    const batch = items.slice(offset, offset + ICONIFY_FETCH_CONCURRENCY)
    const inspected = await Promise.all(
      batch.map((item) => inspectIconifyCandidate(baseUrl, item, writeIconCache)),
    )
    for (const candidate of inspected) {
      if (candidate) results.push(candidate)
    }

    if (results.filter((candidate) => candidate.colored).length >= ICONIFY_SEARCH_RESULT_LIMIT) {
      break
    }
  }

  return results
}

export function rankIconifyCandidates(candidates: IconifyInspectedCandidate[]): IconifyCandidate[] {
  return candidates
    .sort((a, b) => {
      return (
        Number(b.colored) - Number(a.colored) ||
        Number(b.palette) - Number(a.palette) ||
        a.order - b.order
      )
    })
    .slice(0, ICONIFY_SEARCH_RESULT_LIMIT)
    .map(({ palette: _palette, order: _order, ...candidate }) => candidate)
}

export async function searchIconifyIcons(
  query: string,
  baseUrl: string,
  writeIconCache: IconCacheWriter,
): Promise<IconifySearchResp | null> {
  const cached = getCachedIconifySearch(query)
  if (cached) return cached

  const payload = await fetchIconifySearchApi(query)
  if (!payload) return null

  const items = buildIconifyWorkItems(query, payload)
  const inspected = await inspectIconifyCandidates(
    baseUrl,
    items.slice(0, ICONIFY_SVG_INSPECT_LIMIT),
    writeIconCache,
  )
  const inspectedByName = new Map(inspected.map((candidate) => [candidate.name, candidate]))
  // Search results are useful even when the optional SVG inspection is rate-limited.
  // Keep the raw Iconify candidates as a fallback, so one inspection burst cannot
  // turn a valid search into a 502 or an empty result.
  const rankedPool = items.slice(0, ICONIFY_SVG_INSPECT_LIMIT).map((item) => (
    inspectedByName.get(item.name) ?? {
      ...createIconifyCandidate(item, false),
      palette: item.palette,
      order: item.order,
    }
  ))
  const candidates = rankIconifyCandidates(rankedPool)

  const data: IconifySearchResp = {
    query,
    candidates,
  }

  // Optional inspection failures must not be cached: the raw fallback keeps this
  // request useful, while a later request gets a chance to recover colored/icon
  // metadata after the upstream rate limit clears.
  const inspectionLimit = Math.min(items.length, ICONIFY_SVG_INSPECT_LIMIT)
  if (inspected.length >= inspectionLimit) {
    setCachedIconifySearch(query, data)
  }
  return data
}
