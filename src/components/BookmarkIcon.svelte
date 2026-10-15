<script lang="ts">
  import { createNativeImageWatchdog } from '../lib/nativeImageWatchdog'
  import type { AsyncVoid } from '../../shared/types'

  interface BookmarkIconProps {
    title?: string
    iconUrl?: string
    iconText?: string
    size?: number
    iconStyle?: string
    hasCustomBackground?: boolean
    variant?: 'info' | 'compact'
    themeOverride?: 'light' | 'dark' | null
    /** 图片加载失败回调 */
    onError?: () => AsyncVoid
    /** 图片加载成功回调 */
    onLoad?: () => AsyncVoid
  }

  let {
    title = '',
    iconUrl = '',
    iconText = '',
    size = 0,
    iconStyle = '',
    hasCustomBackground = false,
    variant = 'info',
    themeOverride = null,
    onError,
    onLoad,
  }: BookmarkIconProps = $props()

  function handleError() {
    void onError?.()
  }

  function handleLoad() {
    void onLoad?.()
  }
  function watchObjectImage(node: HTMLImageElement, url: string) {
    const watchdog = createNativeImageWatchdog(node, expired => { if (expired === iconUrl) handleError() })
    const update = (next: string) => watchdog.update({ url: next, enabled: next.startsWith('/api/icon/') })
    update(url)
    return { update, destroy: () => watchdog.destroy() }
  }
</script>

<div
  class="bookmark-icon"
  class:has-custom-background={hasCustomBackground}
  class:is-info={variant === 'info'}
  class:preview-light={themeOverride === 'light'}
  style={iconStyle}
>
  {#if iconUrl}
    <img
      src={iconUrl}
      alt={title}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      use:watchObjectImage={iconUrl}
      onerror={handleError}
      onload={handleLoad}
    />
  {:else}
    <span class="icon-text">{iconText}</span>
  {/if}
</div>

<style>
  .bookmark-icon {
    box-sizing: border-box;
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: var(--bookmark-icon-radius, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.62)),
      rgba(255, 255, 255, 0.52);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 1px 4px rgba(15, 23, 42, 0.06);
  }

  .bookmark-icon.has-custom-background {
    border-color: rgba(15, 23, 42, 0.08);
  }

  .bookmark-icon.is-info {
    align-self: center;
  }

  .bookmark-icon img {
    display: block;
    width: calc(100% - (var(--bookmark-icon-padding, 8px) * 2));
    height: calc(100% - (var(--bookmark-icon-padding, 8px) * 2));
    border-radius: var(--bookmark-icon-image-radius, 8px);
    object-fit: contain;
  }

  .bookmark-icon .icon-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
    font-size: var(--bookmark-icon-font-size, 1.75rem);
    font-weight: 600;
    color: #475569;
  }

  :global([data-theme='dark']) .bookmark-icon {
    border-color: rgba(148, 163, 184, 0.16);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(15, 23, 42, 0.2)),
      rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.14);
  }

  :global([data-theme='dark']) .bookmark-icon .icon-text {
    color: #cbd5e1;
  }

  .bookmark-icon.preview-light {
    border-color: rgba(148, 163, 184, 0.18);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.62)),
      rgba(255, 255, 255, 0.52);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 1px 4px rgba(15, 23, 42, 0.06);
  }

  .bookmark-icon.preview-light .icon-text {
    color: #475569;
  }
</style>
