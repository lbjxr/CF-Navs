<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createIconRetry } from '../lib/iconRetry'
  import { createNativeImageWatchdog } from '../lib/nativeImageWatchdog'
  import type { CategoryIconValue } from '../lib/categoryIconDisplay'
  import {
    getCategoryIconFallbackText,
    createCategoryRetryUrl,
    getCategoryImageIconUrl,
    getCategoryTextIcon,
    normalizeCategoryIcon,
  } from '../lib/categoryIconDisplay'
  import { withIconAccessKey } from '../lib/iconAccessKey'
  import { createTrustedIconView, emptyTrustedIcon, type TrustedIconState } from '../lib/trustedIconView'

  export let category: CategoryIconValue
  export let size: number | string = 36
  export let className = ''
  export let label = ''
  export let iconAccessKey = ''
  export let imageLoading: 'lazy' | 'eager' = 'lazy'
  export let preview = false

  let trustedState: TrustedIconState = emptyTrustedIcon
  const trustedView = createTrustedIconView(value => { trustedState = value })

  // One native source owns its retry budget. Blob failures remain with the
  // trusted-copy owner; native fallbacks also need recovery while it is active.
  let sourceUrl = ''
  let retryUrl = ''
  let failedUrl = ''
  let retryAttempt = 0
  const nativeRetry = createIconRetry(() => {
    retryAttempt += 1
    retryUrl = createCategoryRetryUrl(sourceUrl, retryAttempt, performance.timeOrigin)
  })

  $: iconValue = normalizeCategoryIcon(category) || category.icon_display === 'image'
  $: trustedView.set({ object_type: 'category', id: Number(category.id), icon: category.icon, icon_blob: category.icon_blob,
    icon_revision: category.icon_revision, icon_write_epoch: category.icon_write_epoch, icon_display: category.icon_display,
    visible: true, preview, online_url: nextImageUrl })
  $: previewValue = normalizeCategoryIcon(category)
  $: previewSource = /^data:image\//i.test(previewValue) ? previewValue : /^https?:\/\//i.test(previewValue) ? previewValue : ''
  $: nextImageUrl = preview ? previewSource : withIconAccessKey(getCategoryImageIconUrl(category), iconAccessKey)
  $: selectedUrl = trustedState.active ? trustedState.url : nextImageUrl
  $: if (selectedUrl !== sourceUrl) {
    sourceUrl = selectedUrl
    retryUrl = ''
    failedUrl = ''
    retryAttempt = 0
    nativeRetry.reset()
  }
  $: nativeSource = !preview && sourceUrl.startsWith('/api/category-icon/')
  $: isTrustedBlob = trustedState.active && sourceUrl.startsWith('blob:')
  $: imageUrl = nativeSource ? retryUrl || sourceUrl : sourceUrl
  $: textIcon = getCategoryTextIcon(category)

  function handleImageError(): void {
    if (isTrustedBlob) { trustedView.failed(); return }
    failedUrl = imageUrl
    if (nativeSource) nativeRetry.failed()
  }

  function handleImageLoad(): void {
    if (nativeSource) nativeRetry.reset()
    // Keep retryUrl: reverting to the stalled original would restart the failure.
  }

  function watchNativeImage(node: HTMLImageElement, url: string) {
    let watchdog: ReturnType<typeof createNativeImageWatchdog> | null = null
    const update = (nextUrl: string) => {
      const enabled = !preview && nextUrl.startsWith('/api/category-icon/')
      if (!enabled) { watchdog?.destroy(); watchdog = null; return }
      watchdog ??= createNativeImageWatchdog(node, expiredUrl => {
        if (imageUrl === expiredUrl && nativeSource) handleImageError()
      })
      watchdog.update({ url: nextUrl, enabled: true })
    }
    update(url)
    return { update, destroy: () => watchdog?.destroy() }
  }

  onDestroy(() => { nativeRetry.dispose(); trustedView.destroy() })
</script>

{#if iconValue}
  <span
    class={`category-icon ${className}`.trim()}
    style={`--category-icon-size: ${typeof size === 'number' ? `${size}px` : size}`}
    data-category-icon
    aria-hidden={label ? undefined : 'true'}
    aria-label={label || undefined}
  >
    {#if imageUrl && (isTrustedBlob || imageUrl !== failedUrl)}
      <img src={imageUrl} alt="" loading={imageLoading} decoding="async" use:watchNativeImage={imageUrl} on:load={handleImageLoad} on:error={handleImageError} />
    {:else if textIcon}
      <span class="category-icon-text">{textIcon}</span>
    {:else}
      <span class="category-icon-text category-icon-fallback">{getCategoryIconFallbackText(category)}</span>
    {/if}
  </span>
{/if}

<style>
  .category-icon {
    width: var(--category-icon-size, 36px);
    height: var(--category-icon-size, 36px);
    min-width: var(--category-icon-size, 36px);
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--home-text-color, #0f172a) 14%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--home-stat-bg, rgba(255, 255, 255, 0.5)) 84%, transparent);
    color: var(--home-text-color, #0f172a);
    line-height: 1;
  }

  .category-icon img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
  :global(.admin-icon-badge.category-icon) {
    border: 0;
    border-radius: 8px;
    background: var(--admin-icon-badge-bg, var(--home-stat-bg, rgba(255, 255, 255, 0.5)));
    color: var(--admin-subtle, var(--home-text-color, #0f172a));
  }

  :global(.admin-icon-badge.category-icon) img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }

  .category-icon-text {
    max-width: 100%;
    padding: 0.15em;
    overflow: hidden;
    font-size: min(1.35rem, calc(var(--category-icon-size, 36px) * 0.55));
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-icon-fallback {
    font-size: min(1rem, calc(var(--category-icon-size, 36px) * 0.42));
    opacity: 0.68;
  }
</style>
