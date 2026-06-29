// Icon candidate helpers for bookmark URL + title.

import type { IconSource } from '../../shared/types'

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

export function directIcon(url: string): string {
  return `/api/fetch-favicon?url=${encodeURIComponent(url)}`
}

export function faviconImIcon(url: string): string {
  const hostname = getHostname(url)
  return hostname ? `https://favicon.im/${hostname}?larger=true` : ''
}

export function normalizeIconifyName(value: string): string {
  const trimmed = value.trim().toLowerCase()
  const withoutUrl = iconifyNameFromUrl(trimmed) ?? trimmed
  const normalized = withoutUrl.replace(/\s+/g, '').replace(/\//g, ':')
  return /^[a-z0-9-]+:[a-z0-9-]+$/.test(normalized) ? normalized : ''
}

export function iconifyIcon(value: string): string {
  const normalized = normalizeIconifyName(value)
  if (!normalized) return ''

  const [prefix, name] = normalized.split(':')
  return `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`
}

export function iconifyProxyIcon(value: string): string {
  const normalized = normalizeIconifyName(value)
  if (!normalized) return ''

  const [prefix, name] = normalized.split(':')
  return `/api/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`
}

export function iconifyNameFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname !== 'api.iconify.design') return null

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null

    const prefix = decodeURIComponent(parts[0]).toLowerCase()
    const name = decodeURIComponent(parts[1]).replace(/\.svg$/i, '').toLowerCase()
    const normalized = `${prefix}:${name}`
    return /^[a-z0-9-]+:[a-z0-9-]+$/.test(normalized) ? normalized : null
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

export function logoSurfIcon(title: string, url: string, scheme: LogoSurfColorScheme = DEFAULT_LOGO_SURF_SCHEME): string {
  const hostname = getHostname(url) || 'NAV'
  const text = title.trim() || hostname
  const size = 512
  const radius = 80
  const fontSize = getLogoTextFontSize(text, size)
  const safeText = escapeSvgText(text)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${scheme.bgColor}"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${scheme.textColor}" font-size="${fontSize.toFixed(2)}" font-weight="normal" font-family="Impact,ImpactFallback,Arial Black,Arial,Helvetica,sans-serif">${safeText}</text>
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

export function googleIcon(url: string, size = 64): string {
  const hostname = getHostname(url)
  return hostname ? `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(hostname)}` : ''
}

export function getIconCandidates(url: string, title: string): IconCandidate[] {
  const hostname = getHostname(url)
  if (!hostname) return []

  const iconify = defaultIconifyIcon(url)
  const candidates: IconCandidate[] = [
    {
      source: 'direct',
      label: '\u81ea\u52a8\u83b7\u53d6',
      url: directIcon(url),
    },
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
