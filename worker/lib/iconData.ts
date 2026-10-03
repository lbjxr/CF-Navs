import { readBoundedBody } from './boundedBody'
import type { IconSource } from '../../shared/types'

export interface FetchedIcon {
  bytes: Uint8Array
  contentType: string
}

const CACHE_TIMEOUT_MS = 5000
const MAX_ICON_SIZE = 256_000
const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.1'
const BASE64_CHUNK_SIZE = 0x8000

function decodeTextPrefix(bytes: Uint8Array, limit = 2048): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, limit))
  } catch {
    return ''
  }
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = decodeTextPrefix(bytes).replace(/^﻿/, '').trim().toLowerCase()
  if (!head || head.startsWith('<!doctype html') || head.startsWith('<html')) {
    return false
  }
  // A real SVG starts with the <svg> root, optionally preceded by an XML
  // declaration / doctype / comments.
  return head.startsWith('<svg') || (head.startsWith('<?xml') && /<svg[\s>]/.test(head))
}

// Detect the real image type from the byte signature instead of trusting the
// declared Content-Type. Returns null when the payload is not a genuine image
// (e.g. an HTML login/redirect page from an auth-gated host), so the caller can
// refuse to cache garbage as a fake image.
export function sniffImageContentType(bytes: Uint8Array, declaredType: string | null): string | null {
  const b = bytes
  const len = b.length

  // PNG
  if (
    len >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG
  if (len >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF87a / GIF89a
  if (
    len >= 6 &&
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  ) {
    return 'image/gif'
  }
  // BMP
  if (len >= 2 && b[0] === 0x42 && b[1] === 0x4d) {
    return 'image/bmp'
  }
  // ICO (00 00 01 00) / CUR (00 00 02 00)
  if (len >= 4 && b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) {
    return 'image/x-icon'
  }
  // RIFF....WEBP
  if (
    len >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp'
  }
  // ISO-BMFF ('ftyp' at bytes 4..7) → AVIF / HEIF
  if (len >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase()
    if (brand.startsWith('avi')) return 'image/avif'
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf')) return 'image/heif'
  }
  // SVG (text based)
  if (looksLikeSvg(b)) {
    return 'image/svg+xml'
  }

  // Fallback: trust a concrete image/* declared type only when the bytes are
  // not obviously HTML text. Covers exotic-but-valid formats without a known
  // signature, while still rejecting auth walls / error pages.
  const declared = declaredType?.split(';')[0]?.trim().toLowerCase() || ''
  if (declared.startsWith('image/') && declared !== 'image/svg+xml') {
    const head = decodeTextPrefix(b, 512).replace(/^﻿/, '').trim().toLowerCase()
    const looksLikeHtml =
      head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head')
    if (!looksLikeHtml) return declared
  }

  return null
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

// 抓取失败的两种性质，决定兜底图标能不能进缓存：
//   - 'missing'：上游明确说这个图标不存在（404/410），或返回的根本不是图片（认证墙、
//     登录页）。重试没有意义，兜底图沿用 5 分钟短缓存，避免为一个不存在的图标持续打上游。
//   - 'transient'：超时、网络错误、429/5xx 等瞬时故障。实测页面同时渲染一屏图标时上游会
//     成批瞬时失败、随后自行恢复；这类兜底图若被缓存（edge、Service Worker、浏览器都是
//     5 分钟），用户会在整个缓存期内一直看到文字兜底，而网络面板里它是 200 +
//     image/svg+xml，与真实图标完全一样，看起来「请求成功了却回退成文字」。
export type IconFetchFailure = 'missing' | 'transient'

export type IconFetchOutcome =
  | { ok: true; icon: FetchedIcon }
  | { ok: false; failure: IconFetchFailure }

// 纯函数，便于单测：null 表示网络错误或超时。
export function classifyIconFailure(status: number | null): IconFetchFailure {
  return status === 404 || status === 410 ? 'missing' : 'transient'
}

/**
 * 抓取一张可缓存的外站图标。
 *
 * 刻意不在这里做重试：实测瞬时失败集中在并发抓取的限流窗口里，窗口内紧随其后的第二次
 * 尝试同样失败，真正恢复要等到窗口过去；调用方按 `failure` 决定能不能缓存兜底图，
 * 下一个请求（下一次页面加载、下一次渲染）拿到的就是真图标。
 */
export async function fetchIcon(iconUrl: string, timeoutMs = CACHE_TIMEOUT_MS, maxBytes = MAX_ICON_SIZE): Promise<IconFetchOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(iconUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
        'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs/1.0)',
      },
    })

    if (!response.ok) return { ok: false, failure: classifyIconFailure(response.status) }

    if (response.headers.get('X-Icon-Fallback') === '1') return { ok: false, failure: 'transient' }
    const bytes = await readBoundedBody(response.body, maxBytes)
    // 空 body 更像被截断，值得让下一次请求重试；超过上限说明这个资源本身不可用。
    if (bytes?.byteLength === 0) return { ok: false, failure: 'transient' }
    if (!bytes) return { ok: false, failure: 'missing' }

    const contentType = sniffImageContentType(bytes, response.headers.get('content-type'))
    // Reject payloads that are not real images (e.g. an auth-gated host that
    // returns an HTML login page instead of the icon). Caching those would
    // store an undecodable blob that renders as the title's first letter.
    if (!contentType) return { ok: false, failure: 'missing' }

    return {
      ok: true,
      icon: { bytes, contentType },
    }
  } catch {
    return { ok: false, failure: 'transient' }
  } finally {
    clearTimeout(timer)
  }
}

export function iconBytesToResponse(icon: FetchedIcon, cacheControl: string): Response {
  const body = new ArrayBuffer(icon.bytes.byteLength)
  new Uint8Array(body).set(icon.bytes)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': icon.contentType,
      'Content-Length': String(icon.bytes.byteLength),
      'Cache-Control': cacheControl,
    },
  })
}

export function iconBytesToDataUri(icon: FetchedIcon): string {
  return `data:${icon.contentType};base64,${bytesToBase64(icon.bytes)}`
}

export function dataUriToResponse(dataUri: string, cacheControl: string): Response | null {
  const match = dataUri.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null

  try {
    const mime = match[1] || 'image/png'
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': cacheControl,
      },
    })
  } catch {
    return null
  }
}

function normalizeIconifyPair(prefix: string, name: string): boolean {
  const normalizedPrefix = prefix.trim().toLowerCase()
  const normalizedName = name.trim().toLowerCase().replace(/\.svg$/i, '')
  return /^[a-z0-9-]+$/.test(normalizedPrefix) && /^[a-z0-9-]+$/.test(normalizedName)
}

export function isIconifyIconUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return false

    return (
      url.protocol === 'https:' &&
      (url.hostname === 'api.iconify.design' || url.hostname === 'icon-sets.iconify.design') &&
      normalizeIconifyPair(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]))
    )
  } catch {
    return false
  }
}

export function shouldPersistIconBlob(iconUrl: string, iconSource: IconSource | string | null | undefined): boolean {
  return /^https?:\/\//i.test(iconUrl) && iconSource !== 'iconify' && !isIconifyIconUrl(iconUrl)
}
