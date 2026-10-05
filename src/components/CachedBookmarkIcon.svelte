<script lang="ts">
  import { observeIconVisibility } from '../lib/iconVisibility'
  import { createTrustedIconView, emptyTrustedIcon } from '../lib/trustedIconView'
  let trustedImage = emptyTrustedIcon
  const trustedView = createTrustedIconView(value => { trustedImage = value })
  let anchor: HTMLSpanElement
  let inView = false
  let stopVisibility: (() => void) | undefined
  import { onDestroy, onMount } from 'svelte'
  import {
    createBookmarkIconCacheKey,
    deleteCachedBookmarkIcon,
    fetchCachedBookmarkIconUrl,
    isDataImage,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'
  import { resolveCachedBookmarkIconDisplaySrc } from '../lib/cachedBookmarkIconDisplay'

  export let id: string | number
  export let icon = ''
  export let iconSource: string | null | undefined = null
  export let iconCached: boolean | number | null | undefined = undefined
  export let iconRevision: string | null | undefined = undefined
  export let iconWriteEpoch: number | undefined = undefined
  export let iconDisplay: 'image' | 'text' | 'empty' | undefined = undefined
  export let iconBlob = ''
  export let src = ''
  export let alt = ''
  export let fallback = ''
  export let className = ''
  export let style = ''

  let localUrl = ''
  let syncLocalUrl = ''
  let cachePending = false
  let failed = false
  let stateKey = ''
  const requestSequence = { current: 0 }

  $: trimmedIcon = icon.trim()
  $: trimmedIconBlob = iconBlob.trim()
  $: trustedView.set({ id: Number(id), icon: trimmedIcon, icon_blob: trimmedIconBlob, icon_revision: iconRevision, icon_cached: iconCached, icon_write_epoch: iconWriteEpoch, icon_display: iconDisplay, visible: inView, online_url: src })
  $: cacheKey = createBookmarkIconCacheKey({
    id,
    icon: trimmedIcon,
    iconSource,
  })
  $: syncLocalUrl = readCachedBookmarkIconDataUri(cacheKey) ?? ''
  $: shouldWaitForLocalCache = src.startsWith('/api/icon/') && !isDataImage(trimmedIconBlob)
  $: nextStateKey = `${cacheKey}:${trimmedIconBlob}:${src}:${trustedImage.active}`
  $: if (nextStateKey !== stateKey) {
    stateKey = nextStateKey
    failed = false
    resetLocalUrl()
    void loadCachedIcon(cacheKey, trimmedIconBlob, shouldWaitForLocalCache)
  }
  $: legacyDisplaySrc = resolveCachedBookmarkIconDisplaySrc({
    syncLocalUrl,
    localUrl,
    failed,
    iconBlob: trimmedIconBlob,
    shouldWaitForLocalCache,
    cachePending,
    src,
  })

  $: displaySrc = trustedImage.active ? trustedImage.url : legacyDisplaySrc

  onMount(() => { stopVisibility = observeIconVisibility(anchor, () => { inView = true }) })

  function resetLocalUrl() {
    if (localUrl) {
      revokeLocalIconUrl(localUrl)
      localUrl = ''
    }
  }

  async function loadCachedIcon(key: string, dataUri: string, waitForLocalCache: boolean) {
    if (trustedImage.active) return
    if (isDataImage(dataUri)) {
      requestSequence.current += 1
      cachePending = false
      await deleteCachedBookmarkIcon(key)
      return
    }

    if (waitForLocalCache) {
      cachePending = true
    }

    const result = await fetchCachedBookmarkIconUrl(key, requestSequence)
    if (result.stale) return
    if (result.url) {
      resetLocalUrl()
      localUrl = result.url
      cachePending = false
      return
    }

    cachePending = false
  }

  function handleError() {
    if (trustedImage.active) { trustedView.failed(); return }
    if (localUrl) {
      resetLocalUrl()
      return
    }
    failed = true
  }

  onDestroy(() => {
    trustedView.destroy()
    stopVisibility?.()
    requestSequence.current += 1
    resetLocalUrl()
  })
</script>

<span class="cached-icon-frame" bind:this={anchor}>
{#if displaySrc}
  <img
    class={className}
    style={style}
    src={displaySrc}
    alt={alt}
    loading="lazy"
    decoding="async"
    on:error={handleError}
  />
{/if}
{#if !displaySrc && fallback}
  {fallback}
{/if}

</span>
<style>.cached-icon-frame { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; }</style>
