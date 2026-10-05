<script lang="ts">
  import { createTrustedIconView, emptyTrustedIcon } from '../lib/trustedIconView'
  let trustedImage = emptyTrustedIcon
  const trustedView = createTrustedIconView(value => { trustedImage = value })
  import { onDestroy } from 'svelte'
  import type { PublicBookmark } from '../../shared/types'
  import {
    deriveBookmarkCardIconBase,
    deriveBookmarkCardIconUrl,
  } from '../lib/bookmarkCardIconState'
  import { createIconRetry } from '../lib/iconRetry'
  import { buildIconStyle } from '../lib/bookmarkIconDisplay'
  import {
    fetchBookmarkIcon,
    fetchCachedBookmarkIconUrl,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'
  import BookmarkIcon from './BookmarkIcon.svelte'

  const ICON_SIZE = 30

  export let bookmark: PublicBookmark
  /** 私密对象及其私密分类树下的书签需要授权 key；公开对象传空串以保留共享缓存。 */
  export let iconAccessKey = ''

  let cachedIconFailed = false
  let fallbackFailed = false
  let localCachedIconUrl = ''
  let localIconReady = false
  const iconRetry = createIconRetry(() => {
    if (iconBaseState.proxiedHttpIconUrl) {
      void loadLocalCachedIcon(iconBaseState.localCacheKey, false, iconBaseState.proxiedHttpIconUrl)
    }
  })
  let syncLocalCachedIconUrl = ''
  let localCachePending = false
  let iconStateKey = ''
  const localCacheRequest = { current: 0 }

  $: trustedView.set({ ...bookmark, visible: true, online_url: iconBaseState.proxiedHttpIconUrl })
  $: iconBaseState = deriveBookmarkCardIconBase({
    bookmark,
    iconInView: true,
    shouldWaitForLocalIconCache: true,
    iconAccessKey,
  })
  $: iconText = iconBaseState.iconText
  $: localCacheKey = iconBaseState.localCacheKey
  $: syncLocalCachedIconUrl = readCachedBookmarkIconDataUri(localCacheKey) ?? ''
  $: iconUrlState = deriveBookmarkCardIconUrl({
    bookmark,
    baseState: iconBaseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl,
    localCachedIconUrl,
    localCachePending,
  })
  $: iconUrl = trustedImage.active ? trustedImage.url : iconUrlState.hasRenderableIcon ? iconUrlState.iconUrl : ''
  $: iconStyle = buildIconStyle(ICON_SIZE, {
    customBackground: bookmark.icon_background_color ?? '',
  })
  $: nextStateKey = iconBaseState.nextIconStateKey + ':' + trustedImage.active
  $: if (nextStateKey !== iconStateKey) {
    iconStateKey = nextStateKey
    cachedIconFailed = false
    fallbackFailed = false
    localIconReady = false
    iconRetry.reset()
    resetLocalCachedIconUrl()
    if (iconBaseState.shouldReadLocalIconCache && !trustedImage.active) {
      void loadLocalCachedIcon(
        iconBaseState.localCacheKey,
        iconBaseState.shouldWaitForLocalIconCache,
        iconBaseState.shouldUseIconProxy ? iconBaseState.proxiedHttpIconUrl : '',
      )
    } else {
      localCacheRequest.current += 1
      localCachePending = false
    }
  }

  function resetLocalCachedIconUrl(): void {
    if (!localCachedIconUrl) return
    revokeLocalIconUrl(localCachedIconUrl)
    localCachedIconUrl = ''
  }

  async function loadLocalCachedIcon(cacheKey: string, waitForLocalCache: boolean, remoteUrl: string): Promise<void> {
    if (trustedImage.active) return
    if (waitForLocalCache) localCachePending = true

    const result = await fetchCachedBookmarkIconUrl(cacheKey, localCacheRequest)
    if (result.stale) return
    const requestSequence = localCacheRequest.current
    if (result.url) {
      localIconReady = true
      resetLocalCachedIconUrl()
      localCachedIconUrl = result.url
      localCachePending = false
      return
    }

    if (remoteUrl) {
      const remote = await fetchBookmarkIcon(cacheKey, remoteUrl)
      if (requestSequence !== localCacheRequest.current) {
        if (remote.url) revokeLocalIconUrl(remote.url)
        return
      }
      localIconReady = remote.status === 'ready'
      if (remote.url) {
        resetLocalCachedIconUrl()
        localCachedIconUrl = remote.url
        cachedIconFailed = false
        fallbackFailed = false
      } else if (!localCachedIconUrl) {
        cachedIconFailed = true
        fallbackFailed = true
      }
      if (remote.status === 'retryable') iconRetry.failed()
      else if (remote.status === 'unavailable') iconRetry.reset()
    }

    localCachePending = false
  }

  function handleIconError(): void {
    if (trustedImage.active) { trustedView.failed(); return }
    if (localCachedIconUrl) {
      resetLocalCachedIconUrl()
      localIconReady = false
      if (iconBaseState.proxiedHttpIconUrl) {
        cachedIconFailed = true
        fallbackFailed = true
        iconRetry.failed()
      }
      return
    }

    // An uncached HTTP <img> never went through fetchBookmarkIcon. Its error must
    // enter the same recovery path; otherwise only opening the editor can fetch
    // the icon server-side and reset the failed card (Issue #28).
    if (!iconBaseState.hasEmbeddedIcon && iconBaseState.proxiedHttpIconUrl) {
      cachedIconFailed = true
      fallbackFailed = true
      iconRetry.failed()
      return
    }

    if (!cachedIconFailed && (iconBaseState.hasEmbeddedIcon || iconBaseState.shouldUseIconProxy)) {
      cachedIconFailed = true
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad(): void {
    if (localIconReady) iconRetry.reset()
    localCachePending = false
    fallbackFailed = false
  }

  onDestroy(() => {
    trustedView.destroy()
    iconRetry.dispose()
    localCacheRequest.current += 1
    resetLocalCachedIconUrl()
  })
</script>

<span class="spotlight-option-icon" aria-hidden="true">
  <BookmarkIcon
    title={bookmark.title}
    {iconUrl}
    {iconText}
    size={ICON_SIZE}
    {iconStyle}
    hasCustomBackground={Boolean(bookmark.icon_background_color)}
    variant="compact"
    onError={handleIconError}
    onLoad={handleIconLoad}
  />
</span>

<style>
  .spotlight-option-icon {
    display: block;
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    overflow: hidden;
    border-radius: var(--radius-sm);
  }

  .spotlight-option-icon :global(.bookmark-icon) {
    border-radius: var(--radius-sm);
  }
</style>
