import type { BookmarkFormValue } from './adminTypes'
import {
  DEFAULT_LOGO_SURF_SCHEME,
  LOGO_SURF_COLOR_SCHEMES,
  iconifyIcon,
  iconifyNameFromUrl,
  iconifyProxyIcon,
  normalizeIconifyName,
  type IconCandidate,
  type LogoSurfColorScheme,
} from './icons'

export const emptyBookmarkForm: BookmarkFormValue = {
  title: '',
  url: '',
  icon: '',
  icon_source: '',
  icon_background_color: '',
  description: '',
  description_mode: 'inherit',
  open_method: 'new_tab',
}

export function createBookmarkFormValue(
  value: Partial<BookmarkFormValue> | null,
  fallbackCategoryId: string | number | undefined,
): BookmarkFormValue {
  return {
    ...emptyBookmarkForm,
    ...(value ?? {}),
    category_id: value?.category_id ?? fallbackCategoryId,
    title: value?.title ?? '',
    url: value?.url ?? '',
    icon: value?.icon ?? '',
    icon_source: value?.icon_source ?? '',
    icon_background_color: value?.icon_background_color ?? '',
    description: value?.description ?? '',
    open_method: value?.open_method ?? 'new_tab',
  }
}

export function getIconifySearchQuery(value: string): string {
  const normalized = normalizeIconifyName(value)
  if (normalized) return normalized

  const plain = value
    .trim()
    .toLowerCase()
    .replace(/^iconify:/, '')
    .replace(/^@iconify-json\//, '')
    .replace(/^@iconify-icons\//, '')
    .replace(/[^a-z0-9-]/g, '')

  return plain.length >= 2 && plain.length <= 80 ? plain : ''
}

export function getLogoSchemeByName(name: string): LogoSurfColorScheme {
  return LOGO_SURF_COLOR_SCHEMES.find((scheme) => scheme.name === name) ?? DEFAULT_LOGO_SURF_SCHEME
}

export function findLogoSchemeName(icon: string): string | null {
  if (!icon.startsWith('data:image/svg+xml')) return null

  let decoded = icon
  try {
    decoded = decodeURIComponent(icon)
  } catch {
    decoded = icon
  }

  const normalized = decoded.toLowerCase()
  const match = LOGO_SURF_COLOR_SCHEMES.find((scheme) => {
    return normalized.includes(scheme.bgColor.toLowerCase()) && normalized.includes(scheme.textColor.toLowerCase())
  })

  return match?.name ?? null
}

export function isCandidateSelected(candidate: IconCandidate, form: BookmarkFormValue): boolean {
  if (candidate.source === 'logo_surf') {
    return form.icon_source === 'logo_surf'
  }

  return form.icon === candidate.url && form.icon_source === candidate.source
}

export function canPreviewIcon(icon: string): boolean {
  return Boolean(icon.trim())
}

export function canPreviewIconAsImage(icon: string): boolean {
  return /^https?:\/\//i.test(icon) || /^data:image\//i.test(icon) || Boolean(iconifyProxyIcon(icon))
}

export function getTextIconPreview(icon: string): string {
  return icon.trim().slice(0, 4)
}

export function getCandidatePreviewUrl(candidate: IconCandidate): string {
  if (candidate.source === 'iconify') {
    return iconifyProxyIcon(candidate.url)
  }

  return candidate.url
}

export function getFormIconPreviewUrl(form: BookmarkFormValue, iconifyName: string): string {
  const iconifyPreview = iconifyProxyIcon(form.icon)
  if (form.icon_source === 'iconify' || iconifyPreview) {
    return iconifyProxyIcon(iconifyNameFromUrl(form.icon) ?? iconifyName) || iconifyPreview
  }

  return form.icon
}

export function buildBookmarkSubmitPayload(form: BookmarkFormValue, iconifyName: string): BookmarkFormValue {
  const trimmedIcon = form.icon.trim()
  const submittedIconifyUrl =
    form.icon_source === 'iconify'
      ? iconifyIcon(iconifyName || trimmedIcon)
      : iconifyIcon(trimmedIcon)
  const submitIcon = submittedIconifyUrl || trimmedIcon
  const submitIconSource = submitIcon
    ? submittedIconifyUrl
      ? 'iconify'
      : form.icon_source || 'custom'
    : ''

  return {
    ...form,
    title: form.title.trim(),
    url: form.url.trim(),
    icon: submitIcon,
    icon_source: submitIconSource,
    icon_background_color: form.icon_background_color.trim(),
    description: form.description.trim(),
  }
}
