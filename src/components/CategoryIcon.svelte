<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { CategoryIconValue } from '../lib/categoryIconDisplay'
  import {
    getCategoryIconFallbackText,
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

  // 分类代理对上游瞬时失败返回 503，避免把文字兜底伪装成成功图片。页面刷新时如果
  // 恰好撞上上游限流，按退避持续重试，直到代理恢复；真正不存在的图标仍由 Worker
  // 返回 200 兜底，不会进入这条循环。
  const ICON_RETRY_DELAYS_MS = [1200, 4000, 10000, 30000]

  let baseUrl = ''
  let retryUrl = ''
  let failedUrl = ''
  let retryAttempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  $: iconValue = normalizeCategoryIcon(category) || category.icon_display === 'image'
  $: trustedView.set({ object_type: 'category', id: Number(category.id), icon: category.icon, icon_blob: category.icon_blob,
    icon_revision: category.icon_revision, icon_write_epoch: category.icon_write_epoch, icon_display: category.icon_display,
    visible: true, preview })
  $: previewValue = normalizeCategoryIcon(category)
  $: previewSource = /^data:image\//i.test(previewValue) ? previewValue : /^https?:\/\//i.test(previewValue) ? previewValue : ''
  $: nextImageUrl = preview ? previewSource : withIconAccessKey(getCategoryImageIconUrl(category), iconAccessKey)
  // 图标或授权 key 变化（换图标、key 续签）时必须重新计数，否则上一条 URL 的失败态
  // 会挡住新图标。
  $: if (nextImageUrl !== baseUrl) {
    baseUrl = nextImageUrl
    retryUrl = ''
    failedUrl = ''
    retryAttempt = 0
    clearRetryTimer()
  }
  $: imageUrl = trustedState.active ? trustedState.url : retryUrl || baseUrl
  $: textIcon = getCategoryTextIcon(category)

  function clearRetryTimer(): void {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function handleImageError(): void {
    if (trustedState.active) { trustedView.failed(); return }
    // 只有同源代理地址值得重试：data URI 加载失败不是网络问题，重试也不会变好。
    if (!baseUrl.startsWith('/api/')) {
      failedUrl = retryUrl || baseUrl
      return
    }

    clearRetryTimer()
    failedUrl = retryUrl || baseUrl
    const delay = ICON_RETRY_DELAYS_MS[Math.min(retryAttempt, ICON_RETRY_DELAYS_MS.length - 1)]
    retryAttempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}retry=${retryAttempt}`
    }, delay)
  }

  // 成功加载后不清空 retryUrl：那会把 src 换回失败过的 baseUrl，形成失败—重试的循环。
  // retryUrl 只在下一次 baseUrl 变化时重置。

  onDestroy(() => { clearRetryTimer(); trustedView.destroy() })
</script>

{#if iconValue}
  <span
    class={`category-icon ${className}`.trim()}
    style={`--category-icon-size: ${typeof size === 'number' ? `${size}px` : size}`}
    data-category-icon
    aria-hidden={label ? undefined : 'true'}
    aria-label={label || undefined}
  >
    {#if imageUrl && (trustedState.active || imageUrl !== failedUrl)}
      <img src={imageUrl} alt="" loading={imageLoading} decoding="async" on:error={handleImageError} />
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
