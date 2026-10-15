<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { observeIconVisibility } from '../lib/iconVisibility'
  import { createTrustedIconView, emptyTrustedIcon } from '../lib/trustedIconView'
  import {
    createBookmarkIconCacheKey,
    deleteCachedBookmarkIcon,
    fetchCachedBookmarkIconUrl,
    isDataImage,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'
  import { resolveCachedBookmarkIconDisplaySrc } from '../lib/cachedBookmarkIconDisplay'

  interface CachedBookmarkIconProps {
    id: string | number
    icon?: string
    iconSource?: string | null | undefined
    iconCached?: boolean | number | null | undefined
    iconRevision?: string | null | undefined
    iconWriteEpoch?: number | undefined
    iconDisplay?: 'image' | 'text' | 'empty' | undefined
    iconBlob?: string
    src?: string
    alt?: string
    fallback?: string
    className?: string
    style?: string
  }

  let {
    id,
    icon = '',
    iconSource = null,
    iconCached = undefined,
    iconRevision = undefined,
    iconWriteEpoch = undefined,
    iconDisplay = undefined,
    iconBlob = '',
    src = '',
    alt = '',
    fallback = '',
    className = '',
    style = '',
  }: CachedBookmarkIconProps = $props()

  let trustedImage = $state(emptyTrustedIcon)
  const trustedView = createTrustedIconView(value => { trustedImage = value })
  let anchor = $state<HTMLSpanElement>()
  let inView = $state(false)
  let stopVisibility: (() => void) | undefined

  let localUrl = $state('')
  let cachePending = $state(false)
  let failed = $state(false)
  let stateKey = $state('')
  const requestSequence = { current: 0 }

  let trimmedIcon = $derived(icon.trim())
  let trimmedIconBlob = $derived(iconBlob.trim())
  let cacheKey = $derived(createBookmarkIconCacheKey({
    id,
    icon: trimmedIcon,
    iconSource,
  }))
  let syncLocalUrl = $derived(readCachedBookmarkIconDataUri(cacheKey) ?? '')
  let shouldWaitForLocalCache = $derived(src.startsWith('/api/icon/') && !isDataImage(trimmedIconBlob))
  let nextStateKey = $derived(`${cacheKey}:${trimmedIconBlob}:${src}:${trustedImage.active}`)

  // 可信图标视图输入与可见性联动（副作用，pre-render 时序贴近 legacy $:）
  $effect.pre(() => {
    trustedView.set({ id: Number(id), icon: trimmedIcon, icon_blob: trimmedIconBlob, icon_revision: iconRevision, icon_cached: iconCached, icon_write_epoch: iconWriteEpoch, icon_display: iconDisplay, visible: inView, online_url: src })
  })

  // 状态键变化时重置本地 URL 并重新加载缓存图标
  $effect.pre(() => {
    if (nextStateKey !== stateKey) {
      stateKey = nextStateKey
      failed = false
      resetLocalUrl()
      void loadCachedIcon(cacheKey, trimmedIconBlob, shouldWaitForLocalCache)
    }
  })

  let legacyDisplaySrc = $derived(resolveCachedBookmarkIconDisplaySrc({
    syncLocalUrl,
    localUrl,
    failed,
    iconBlob: trimmedIconBlob,
    shouldWaitForLocalCache,
    cachePending,
    src,
  }))
  let displaySrc = $derived(trustedImage.active ? trustedImage.url : legacyDisplaySrc)

  onMount(() => {
    if (anchor) stopVisibility = observeIconVisibility(anchor, () => { inView = true })
  })

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
    onerror={handleError}
  />
{/if}
{#if !displaySrc && fallback}
  {fallback}
{/if}

</span>
<style>.cached-icon-frame { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 100%; }</style>
