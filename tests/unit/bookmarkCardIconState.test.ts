import { describe, expect, it } from 'vitest'
import type { IconSource, PublicBookmark } from '../../shared/types'
import {
  deriveBookmarkCardIconBase,
  deriveBookmarkCardIconState,
  shouldReadBookmarkLocalIconCache,
} from '../../src/lib/bookmarkCardIconState'

function bookmark(overrides: Partial<PublicBookmark> = {}): PublicBookmark {
  return {
    id: 42,
    category_id: 1,
    title: 'Example',
    url: 'https://example.com/path',
    icon: null,
    icon_source: null,
    icon_background_color: null,
    icon_blob: null,
    icon_cached: null,
    description: null,
    open_method: 1,
    sort: 0,
    ...overrides,
  }
}

function state(overrides: Partial<PublicBookmark> = {}, input: {
  iconInView?: boolean
  cachedIconFailed?: boolean
  fallbackFailed?: boolean
  syncLocalCachedIconUrl?: string
  localCachedIconUrl?: string
  localCachePending?: boolean
  shouldWaitForLocalIconCache?: boolean
} = {}) {
  return deriveBookmarkCardIconState({
    bookmark: bookmark(overrides),
    iconInView: input.iconInView ?? true,
    cachedIconFailed: input.cachedIconFailed ?? false,
    fallbackFailed: input.fallbackFailed ?? false,
    syncLocalCachedIconUrl: input.syncLocalCachedIconUrl,
    localCachedIconUrl: input.localCachedIconUrl,
    localCachePending: input.localCachePending,
    shouldWaitForLocalIconCache: input.shouldWaitForLocalIconCache,
  })
}

describe('bookmark card icon state', () => {
  it('does not return an icon URL before the card is in view', () => {
    const result = state({ icon: 'https://example.com/icon.png', icon_source: 'custom' }, { iconInView: false })

    expect(result.iconUrl).toBe('')
    expect(result.hasRenderableIcon).toBe(false)
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('uses saved logo.surf icons before generated logo icons', () => {
    expect(state({
      icon: 'data:image/svg+xml,saved-logo',
      icon_source: 'logo_surf',
    }).iconUrl).toBe('data:image/svg+xml,saved-logo')

    const generated = state({ icon: null, icon_source: 'logo_surf' }).iconUrl
    expect(generated).toContain('data:image/svg+xml')
    expect(generated).toContain('<svg')
  })

  it('uses embedded icon blobs before remote icon URLs', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_blob: 'data:image/png;base64,cached',
      icon_cached: true,
    })

    expect(result.iconUrl).toBe('data:image/png;base64,cached')
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('uses browser local cache before the bookmark icon proxy', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      syncLocalCachedIconUrl: 'data:image/png;base64,local',
    })

    expect(result.iconUrl).toBe('data:image/png;base64,local')
    expect(result.shouldUseIconProxy).toBe(true)
    expect(result.proxiedHttpIconUrl).toContain('/api/icon/42?v=')
  })

  it('proxies Iconify names and Iconify URLs through the Iconify endpoint', () => {
    expect(state({ icon: 'mdi:home', icon_source: 'iconify' }).iconUrl).toBe('/api/iconify/mdi/home.svg')
    expect(state({
      icon: 'https://api.iconify.design/logos/github-icon.svg?color=black',
      icon_source: 'custom',
    }).iconUrl).toBe('/api/iconify/logos/github-icon.svg')
  })

  it('uses the bookmark icon proxy for ordinary HTTP icons when needed', () => {
    const result = state({ icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' })

    expect(result.iconUrl).toContain('/api/icon/42?v=')
    expect(result.canUseRawHttpIconFallback).toBe(true)
    expect(result.shouldReadLocalIconCache).toBe(true)
  })

  it('does not treat custom text icons as image URLs', () => {
    const result = state({ icon: 'TXT', icon_source: 'custom' })

    expect(result.customTextIcon).toBe('TXT')
    expect(result.iconText).toBe('TXT')
    expect(result.iconUrl).toBe('')
    expect(result.shouldReadLocalIconCache).toBe(false)
  })

  it('keeps an icon URL but marks it non-renderable after fallback failure', () => {
    const result = state(
      { icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' },
      { fallbackFailed: true },
    )

    expect(result.iconUrl).toContain('/api/icon/42?v=')
    expect(result.hasRenderableIcon).toBe(false)
  })

  it('exposes local cache read decisions as a pure helper', () => {
    expect(shouldReadBookmarkLocalIconCache({
      bookmark: bookmark({ icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' }),
      iconInView: true,
    })).toBe(true)

    expect(shouldReadBookmarkLocalIconCache({
      bookmark: bookmark({ icon: 'mdi:home', icon_source: 'iconify' }),
      iconInView: true,
    })).toBe(false)

    const base = deriveBookmarkCardIconBase({
      bookmark: bookmark({ icon: 'data:image/png;base64,raw', icon_source: 'custom' as IconSource }),
      iconInView: true,
      shouldWaitForLocalIconCache: true,
    })

    expect(base.shouldWaitForLocalIconCache).toBe(true)
    expect(base.shouldReadLocalIconCache).toBe(true)
  })
})
