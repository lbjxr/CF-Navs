import type { Bookmark, DescriptionDisplayMode, Settings } from '../../shared/types'

export function normalizeDescriptionDisplayMode(value: unknown, fallback: DescriptionDisplayMode = 'always'): DescriptionDisplayMode {
  return value === 'always' || value === 'hover' || value === 'hidden' ? value : fallback
}

export function resolveGlobalDescriptionMode(settings: Pick<Settings, 'card_description_mode' | 'card_show_description'>): DescriptionDisplayMode {
  if (settings.card_description_mode === 'hover' || settings.card_description_mode === 'hidden' || settings.card_description_mode === 'always') {
    return settings.card_description_mode
  }
  return settings.card_show_description ? 'always' : 'hidden'
}

export function resolveBookmarkDescriptionMode(
  bookmark: Pick<Bookmark, 'description_mode'>,
  globalMode: DescriptionDisplayMode,
): DescriptionDisplayMode {
  return normalizeDescriptionDisplayMode(bookmark.description_mode, globalMode)
}

export function shouldRenderDescription(mode: DescriptionDisplayMode, hasDescription: boolean): boolean {
  return hasDescription && mode !== 'hidden'
}
