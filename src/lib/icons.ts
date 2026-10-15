// Icon candidate helpers for bookmark URL + title.

import type { IconSource } from '../../shared/types'
import {
  faviconImUrl,
  iconifySvgUrlFromName,
  isIconifyName,
  isKnownIconifyHost,
  normalizeIconifyPair,
} from '../../shared/icons'

export type IconCandidate = {
  source: IconSource
  label: string
  url: string
}

export type LogoSurfColorScheme = {
  name: string
  bgColor: string
  textColor: string
}

export const LOGO_SURF_COLOR_SCHEMES: LogoSurfColorScheme[] = [
  { name: 'Deep Blue', bgColor: '#1a365d', textColor: '#ffffff' },
  { name: 'Dark Gray & Orange', bgColor: '#2D3748', textColor: '#ED8936' },
  { name: 'Brown & Yellow', bgColor: '#744210', textColor: '#F6E05E' },
  { name: 'Almost Black & Sky Blue', bgColor: '#1A202C', textColor: '#63B3ED' },
  { name: 'Purple & Yellow', bgColor: '#702459', textColor: '#FBBF24' },
  { name: 'Dark Green & Light Green', bgColor: '#065F46', textColor: '#6EE7B7' },
  { name: 'Indigo & Light Red', bgColor: '#3730A3', textColor: '#FCA5A5' },
  { name: 'Black & Neon Green', bgColor: '#131516', textColor: '#70e000' },
  { name: 'Red & White', bgColor: '#E53E3E', textColor: '#FFFFFF' },
  { name: 'Blue & Light Blue', bgColor: '#2B6CB0', textColor: '#BEE3F8' },
  { name: 'Dark Gray & Off White', bgColor: '#2D3748', textColor: '#F7FAFC' },
  { name: 'Brown & Pale Yellow', bgColor: '#975A16', textColor: '#FEFCBF' },
  { name: 'Green & Pale Green', bgColor: '#276749', textColor: '#C6F6D5' },
  { name: 'Purple & Lavender', bgColor: '#6B46C1', textColor: '#E9D8FD' },
  { name: 'Teal & Light Teal', bgColor: '#2C7A7B', textColor: '#81E6D9' },
  { name: 'Burnt Orange & Peach', bgColor: '#9C4221', textColor: '#FEEBC8' },
  { name: 'Bold Black & Yellow', bgColor: '#000000', textColor: '#FFA31A' },
]

export const DEFAULT_LOGO_SURF_SCHEME = LOGO_SURF_COLOR_SCHEMES[LOGO_SURF_COLOR_SCHEMES.length - 1]

export function getHostname(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function faviconImIcon(url: string): string {
  const hostname = getHostname(url)
  return faviconImUrl(hostname)
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
  return normalizeIconifyPair(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]))
}

export function normalizeIconifyName(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const withoutUrl = iconifyNameFromUrl(trimmed) ?? trimmed
  const withoutPrefix = withoutUrl
    .replace(/^iconify:/, '')
    .replace(/^@iconify-json\//, '')
    .replace(/^@iconify-icons\//, '')
  const normalized = withoutPrefix.replace(/\s+/g, '').replace(/\/+$/g, '').replace(/\//g, ':')
  return isIconifyName(normalized) ? normalized : ''
}

export function iconifyIcon(value: string): string {
  const normalized = normalizeIconifyName(value)
  if (!normalized) return ''
  return iconifySvgUrlFromName(normalized) ?? ''
}

export function iconifyProxyIcon(value: string): string {
  const normalized = normalizeIconifyName(value)
  if (!normalized) return ''

  const [prefix, name] = normalized.split(':')
  return `/api/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`
}

export function iconifyNameFromUrl(value: string): string | null {
  const knownHostName = iconifyNameFromKnownHost(value)
  if (knownHostName) return knownHostName

  try {
    const url = new URL(value)
    if (!isKnownIconifyHost(url.hostname)) return null

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null

    return normalizeIconifyPair(decodeURIComponent(parts[0]), decodeURIComponent(parts[1]))
  } catch {
    return null
  }
}

export function isIconifyIconUrl(value: string): boolean {
  return iconifyNameFromUrl(value) !== null
}

export function defaultIconifyIcon(url: string): string {
  const hostname = getHostname(url)
  const brand = hostname.split('.')[0]?.replace(/[^a-z0-9-]/gi, '').toLowerCase()
  return brand ? iconifyIcon(`simple-icons:${brand}`) : ''
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function estimateTextUnits(value: string): number {
  let units = 0

  for (const char of value) {
    if (/\s/.test(char)) {
      units += 0.35
    } else if (/^[A-Za-z0-9]$/.test(char)) {
      units += 0.62
    } else if (/^[\u0000-\u00ff]$/.test(char)) {
      units += 0.72
    } else {
      units += 1
    }
  }

  return Math.max(1, units)
}

function getLogoTextFontSize(text: string, size: number): number {
  const units = estimateTextUnits(text)
  const isShort = [...text].length <= 2
  const initialFontSize = isShort ? size * 0.8 : /^[A-Za-z0-9\s]+$/.test(text) ? size * 0.75 : size * 0.6
  const maxWidth = size * 0.9
  const fittedFontSize = maxWidth / units

  return Math.max(1, Math.min(initialFontSize, fittedFontSize))
}

function tokenizeLogoText(value: string): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim()
  const tokens: string[] = []
  let asciiWord = ''

  for (const char of normalized) {
    if (/^[A-Za-z0-9._-]$/.test(char)) {
      asciiWord += char
      continue
    }

    if (asciiWord) {
      tokens.push(asciiWord)
      asciiWord = ''
    }

    tokens.push(char)
  }

  if (asciiWord) {
    tokens.push(asciiWord)
  }

  return tokens
}

function splitLongToken(token: string, maxUnits: number): string[] {
  const parts: string[] = []
  let current = ''

  for (const char of token) {
    const candidate = `${current}${char}`
    if (current && estimateTextUnits(candidate) > maxUnits) {
      parts.push(current)
      current = char
    } else {
      current = candidate
    }
  }

  if (current) {
    parts.push(current)
  }

  return parts
}

function wrapLogoText(text: string, maxLines = 4): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim() || 'NAV'
  const totalUnits = estimateTextUnits(normalized)
  const cjkChars = [...normalized].filter((char) => !/^[\u0000-\u00ff]$/.test(char)).length
  const targetLineUnits = cjkChars >= 2 ? 2 : 4
  const desiredLines = Math.max(1, Math.min(maxLines, Math.ceil(totalUnits / targetLineUnits)))
  const maxUnits = Math.max(targetLineUnits, totalUnits / desiredLines)
  const tokens = tokenizeLogoText(normalized)
  const lines: string[] = []
  let current = ''

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === ' ' && !current) continue

    const tokenParts = estimateTextUnits(token) > maxUnits && token !== ' '
      ? splitLongToken(token, maxUnits)
      : [token]

    for (const part of tokenParts) {
      if (part === ' ' && !current) continue
      const candidate = `${current}${part}`
      const hasRoomForMoreLines = lines.length < maxLines - 1

      if (current && hasRoomForMoreLines && estimateTextUnits(candidate) > maxUnits) {
        lines.push(current.trim())
        current = part.trimStart()
      } else {
        current = candidate
      }
    }
  }

  if (current.trim()) {
    lines.push(current.trim())
  }

  if (lines.length <= maxLines) {
    return lines.length > 0 ? lines : ['NAV']
  }

  const mergedTail = lines.slice(maxLines - 1).join('')
  return [...lines.slice(0, maxLines - 1), mergedTail]
}

function getLogoTextLayout(text: string, size: number): { lines: string[]; fontSize: number; lineHeight: number } {
  const lines = wrapLogoText(text)
  const maxLineUnits = Math.max(...lines.map(estimateTextUnits))
  const maxWidth = size * 0.84
  const maxHeight = size * 0.76
  const lineHeight = lines.length <= 2 ? 1.08 : 1
  const widthFit = maxWidth / maxLineUnits
  const heightFit = maxHeight / (lines.length * lineHeight)
  const singleLineFontSize = getLogoTextFontSize(text, size)
  const preferredFontSize = lines.length === 1 ? singleLineFontSize : size * 0.34

  return {
    lines,
    fontSize: Math.max(1, Math.min(preferredFontSize, widthFit, heightFit)),
    lineHeight,
  }
}

function logoTextElements(
  lines: string[],
  size: number,
  fontSize: number,
  lineHeight: number,
  textColor: string,
): string {
  const lineHeightPx = fontSize * lineHeight
  const firstY = size / 2 - ((lines.length - 1) * lineHeightPx) / 2

  return lines
    .map((line, index) => {
      const y = firstY + index * lineHeightPx
      return `<text x="50%" y="${y.toFixed(2)}" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-size="${fontSize.toFixed(2)}" font-weight="normal" font-family="Impact,ImpactFallback,Arial Black,Arial,Helvetica,sans-serif">${escapeSvgText(line)}</text>`
    })
    .join('')
}

export function logoSurfIcon(title: string, url: string, scheme: LogoSurfColorScheme = DEFAULT_LOGO_SURF_SCHEME): string {
  const hostname = getHostname(url) || 'NAV'
  const text = title.trim() || hostname
  const size = 512
  const radius = 80
  const layout = getLogoTextLayout(text, size)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${scheme.bgColor}"/>
  ${logoTextElements(layout.lines, size, layout.fontSize, layout.lineHeight, scheme.textColor)}
</svg>`

  const encoded = encodeURIComponent(svg)
    .replace(/%20/g, ' ')
    .replace(/%3C/g, '<')
    .replace(/%3E/g, '>')
    .replace(/%22/g, "'")
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
  return `data:image/svg+xml;charset=utf-8,${encoded}`
}

// 名字是历史遗留：早期用 Google s2，现在实际走 favicon.im，所以 size 参数不再有作用。
// @deprecated 与 faviconImIcon 同义，保留仅为兼容旧调用。
export function googleIcon(url: string, _size = 64): string {
  return faviconImIcon(url)
}

export function getIconCandidates(url: string, title: string): IconCandidate[] {
  const hostname = getHostname(url)
  if (!hostname) return []

  const iconify = defaultIconifyIcon(url)
  const candidates: IconCandidate[] = [
    {
      source: 'favicon_im',
      label: 'Favicon.im',
      url: faviconImIcon(url),
    },
    {
      source: 'logo_surf',
      label: '\u6587\u5b57\u56fe\u6807',
      url: logoSurfIcon(title, url),
    },
    {
      source: 'google',
      label: 'Google',
      url: googleIcon(url),
    },
  ]

  if (iconify) {
    candidates.push({
      source: 'iconify',
      label: 'Iconify',
      url: iconify,
    })
  }

  return candidates
}

/** 在新标签页打开 Iconify 图标库（原在 BookmarkEditModal/CategoryEditModal 逐字重复） */
export function openIconifyLibrary(): void {
  window.open('https://icon-sets.iconify.design/', '_blank', 'noopener,noreferrer')
}
