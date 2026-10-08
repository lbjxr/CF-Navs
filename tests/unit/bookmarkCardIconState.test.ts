import { describe, expect, it } from 'vitest'
import type { IconSource, PublicBookmark } from '../../shared/types'
import { getBookmarkIconUrl } from '../../src/lib/bookmarkIconDisplay'
import {
  deriveBookmarkCardIconBase,
  createBookmarkCardIconStateKey,
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
  iconAccessKey?: string
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
    iconAccessKey: input.iconAccessKey,
  })
}

describe('bookmark card icon state', () => {
  it.each([{icon:null,icon_display:'image' as const},{icon:'https://example.com/icon.svg',icon_cached:true}])('changes ordinary proxy identity on content-only updates: %j', source => {
    const previous=bookmark({...source,icon_revision:'sha256-'+'a'.repeat(64),icon_write_epoch:1})
    const changed={...previous,icon_revision:'sha256-'+'b'.repeat(64)}
    const proxy=(value:PublicBookmark)=>deriveBookmarkCardIconBase({bookmark:value,iconInView:true}).proxiedHttpIconUrl
    expect(proxy(changed)).not.toBe(proxy(previous))
    expect(getBookmarkIconUrl(changed)).not.toBe(getBookmarkIconUrl(previous))
    expect(createBookmarkCardIconStateKey(changed,true)).not.toBe(createBookmarkCardIconStateKey(previous,true))
    // A write fence alone is not a changed image when content identity is known.
    expect(proxy({...previous,icon_write_epoch:2})).toBe(proxy(previous))
    expect(getBookmarkIconUrl({...previous,icon_write_epoch:2})).toBe(getBookmarkIconUrl(previous))
  })
  it('versions an unknown projected image with its write epoch', () => {
    const previous=bookmark({icon_display:'image',icon_revision:null,icon_write_epoch:1})
    const changed={...previous,icon_write_epoch:2}
    expect(state(changed).proxiedHttpIconUrl).not.toBe(state(previous).proxiedHttpIconUrl)
    expect(getBookmarkIconUrl(changed)).not.toBe(getBookmarkIconUrl(previous))
  })
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

  it('uses the original URL when a saved remote icon has no persisted cache', () => {
    const result = state({
      icon: 'https://favicon.im/example.com?larger=true',
      icon_source: 'logo_surf',
    })

    expect(result.iconUrl).toBe('https://favicon.im/example.com?larger=true')
    expect(result.canUseRawHttpIconFallback).toBe(true)
    expect(result.shouldReadLocalIconCache).toBe(true)
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

  it('uses the bookmark proxy when D1 reports a persisted icon cache', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    })

    expect(result.iconUrl).toContain('/api/icon/42?v=')
    expect(result.shouldUseIconProxy).toBe(true)
  })

  it('restores images omitted from snapshots through the ordinary bookmark proxy', () => {
    const result = state({
      icon: null,
      icon_blob: null,
      icon_cached: false,
      icon_display: 'image',
    })

    expect(result.hasProjectedImageIcon).toBe(true)
    expect(result.shouldUseIconProxy).toBe(true)
    expect(result.iconUrl).toBe(result.proxiedHttpIconUrl)
    expect(result.iconUrl).toContain('/api/icon/42?v=')
    expect(result.shouldReadLocalIconCache).toBe(false)
    expect(result.canUseRawHttpIconFallback).toBe(false)
  })


  it('falls back to the saved HTTP icon after the bookmark proxy fails', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      cachedIconFailed: true,
    })

    expect(result.iconUrl).toBe('https://example.com/icon.png')
    expect(result.hasRenderableIcon).toBe(true)
  })

  it('waits for the persistent cache lookup before using the remote proxy', () => {
    const result = state({
      icon: 'https://example.com/icon.png',
      icon_source: 'custom',
      icon_cached: true,
    }, {
      localCachePending: true,
      shouldWaitForLocalIconCache: true,
    })

    expect(result.shouldWaitForLocalIconCache).toBe(true)
    expect(result.iconUrl).toBe('')
  })

  it('proxies Iconify names and Iconify URLs through the Iconify endpoint', () => {
    expect(state({ icon: 'mdi:home', icon_source: 'iconify' }).iconUrl).toBe('/api/iconify/mdi/home.svg')
    expect(state({
      icon: 'https://api.iconify.design/logos/github-icon.svg?color=black',
      icon_source: 'custom',
    }).iconUrl).toBe('/api/iconify/logos/github-icon.svg')
  })

  it('uses ordinary HTTP icons directly when no persisted cache exists', () => {
    const result = state({ icon: 'https://cdn.example.com/icon.png', icon_source: 'custom' })

    expect(result.iconUrl).toBe('https://cdn.example.com/icon.png')
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

    expect(result.iconUrl).toBe('https://cdn.example.com/icon.png')
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
    expect(base.shouldReadLocalIconCache).toBe(false)
  })

  it('appends the access key to a private bookmark proxy URL', () => {
    const result = state(
      { icon: 'https://cdn.example.com/icon.png', icon_cached: true, is_private: 1 },
      { iconAccessKey: 'GRANT123' },
    )

    expect(result.proxiedHttpIconUrl).toMatch(/^\/api\/icon\/42\?v=[^&]+&cv=4&key=GRANT123$/)
    expect(result.iconUrl).toBe(result.proxiedHttpIconUrl)
  })

  it('leaves the proxy URL anonymous when no access key is supplied', () => {
    // 公开对象必须拿到匿名 URL（可命中共享缓存）；key 的取舍由调用方按隐私判定决定。
    const result = state({ icon: 'https://cdn.example.com/icon.png', icon_cached: true, is_private: 0 })

    expect(result.proxiedHttpIconUrl).toMatch(/^\/api\/icon\/42\?v=[^&]+&cv=4$/)
    expect(result.proxiedHttpIconUrl).not.toContain('key=')
  })

  it('changes the icon state key when the access key arrives so the fallback state resets', () => {
    const input = { icon: 'https://cdn.example.com/icon.png', icon_cached: true, is_private: 1 }

    const anonymous = state(input, { iconInView: true })
    const granted = state(input, { iconInView: true, iconAccessKey: 'GRANT123' })

    expect(anonymous.nextIconStateKey).not.toBe(granted.nextIconStateKey)
    expect(granted.nextIconStateKey.endsWith(':GRANT123')).toBe(true)
  })
  it('keeps a direct HTTP icon but exposes an authorized recovery URL before persistence', () => {
    const result = state({ icon: 'https://example.test/icon.png', icon_cached: false }, { iconAccessKey: 'test-grant' })
    expect(result.iconUrl).toBe('https://example.test/icon.png')
    expect(result.shouldUseIconProxy).toBe(false)
    expect(result.proxiedHttpIconUrl).toMatch(/^\/api\/icon\/42\?v=.*&cv=4&key=test-grant$/)
    expect(state({ icon: 'https://example.test/icon.png', icon_cached: false }).proxiedHttpIconUrl).not.toContain('key=')
  })

  it('invalidates the icon state only when cache availability actually changes', () => {
    const original = bookmark({ icon: 'https://example.test/icon.png', icon_cached: 0 })
    const key = createBookmarkCardIconStateKey(original, true)
    expect(createBookmarkCardIconStateKey({ ...original, icon_cached: false }, true)).toBe(key)
    expect(createBookmarkCardIconStateKey({ ...original, icon_cached: null }, true)).toBe(key)
    expect(createBookmarkCardIconStateKey({ ...original, icon_cached: true }, true)).not.toBe(key)
    expect(createBookmarkCardIconStateKey({ ...original, icon_display: 'image' }, true)).not.toBe(key)
    expect(createBookmarkCardIconStateKey({ ...original, icon_cached: 1 }, true)).toBe(
      createBookmarkCardIconStateKey({ ...original, icon_cached: true }, true),
    )
  })

  it.each([
    { id: 0, icon: 'https://example.test/icon.png' },
    { id: -1, icon: 'https://example.test/icon.png' },
    { icon: 'ABC', icon_source: 'custom' as const },
    { icon: 'data:image/svg+xml,<svg/>' },
    { icon: 'mdi:home', icon_source: 'iconify' as const },
  ])('does not send non-object icons through object recovery: %o', (overrides) => {
    expect(state({ ...overrides, icon_cached: false }).proxiedHttpIconUrl).toBe('')
  })

})
