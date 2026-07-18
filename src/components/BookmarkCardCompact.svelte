<script lang="ts">
  import type { PublicBookmark } from '../../shared/types'
  import BookmarkIcon from './BookmarkIcon.svelte'
  import './bookmarkCardTooltip.css'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: PublicBookmark
  export let openInNewTab = true
  export let sortMode = false
  export let tooltipText = ''
  export let compactIconSize = 80
  export let compactIconStyle = ''
  export let showIconTitle = true
  export let iconUrl = ''
  export let iconText = ''
  export let hasCustomIconBackground = false
  export let preview = false
  export let themeOverride: 'light' | 'dark' | null = null
  export let onLinkClick: ((event: MouseEvent) => AsyncVoid) | undefined = undefined
  export let onContextMenu: ((event: MouseEvent) => AsyncVoid) | undefined = undefined
  export let onIconError: (() => AsyncVoid) | undefined = undefined
  export let onIconLoad: (() => AsyncVoid) | undefined = undefined

  function handleLinkClick(event: MouseEvent) {
    void onLinkClick?.(event)
  }

  function handleContextMenu(event: MouseEvent) {
    void onContextMenu?.(event)
  }
</script>

<a
  class="bookmark-card bookmark-card-icon bookmark-tooltip-anchor"
  class:sort-mode={sortMode}
  class:preview-light={preview && themeOverride === 'light'}
  href={preview ? undefined : bookmark.url}
  target={!preview && openInNewTab ? '_blank' : undefined}
  rel={!preview && openInNewTab ? 'noopener noreferrer' : undefined}
  tabindex={preview ? -1 : undefined}
  aria-disabled={preview ? 'true' : undefined}
  style="width: {compactIconSize}px; height: {compactIconSize}px;"
  title={tooltipText}
  aria-label={tooltipText}
  data-tooltip={tooltipText}
  on:click={handleLinkClick}
  on:contextmenu={handleContextMenu}
>
  <BookmarkIcon
    title={bookmark.title}
    {iconUrl}
    {iconText}
    size={compactIconSize}
    iconStyle={compactIconStyle}
    hasCustomBackground={hasCustomIconBackground}
    variant="compact"
    {themeOverride}
    onError={onIconError}
    onLoad={onIconLoad}
  />
</a>
{#if showIconTitle}
  <a
    class="bookmark-icon-title"
    class:preview-light={preview && themeOverride === 'light'}
    href={preview ? undefined : bookmark.url}
    target={!preview && openInNewTab ? '_blank' : undefined}
    rel={!preview && openInNewTab ? 'noopener noreferrer' : undefined}
    tabindex={preview ? -1 : undefined}
    aria-disabled={preview ? 'true' : undefined}
    on:click={handleLinkClick}
    on:contextmenu={handleContextMenu}
  >
    {bookmark.title}
  </a>
{/if}

<style>
  .bookmark-card {
    box-sizing: border-box;
    text-decoration: none;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.72)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.28))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.4));
    backdrop-filter: blur(20px) saturate(160%);
    -webkit-backdrop-filter: blur(20px) saturate(160%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1),
      0 4px 14px rgba(15, 23, 42, 0.08);
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }

  .bookmark-card-icon {
    position: relative;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border-radius: 1.2rem;
    overflow: visible;
  }

  .bookmark-card-icon:hover {
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      0 8px 20px rgba(15, 23, 42, 0.12);
    transform: translateY(-1px);
  }

  .bookmark-icon-title {
    display: block;
    width: 100%;
    margin-top: 0.45rem;
    color: var(--card-title-color, var(--card-text-color, #0f172a));
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-icon.sort-mode {
    cursor: move;
    transform: none !important;
    transition: none;
    user-select: none;
  }

  .bookmark-card-icon.sort-mode:hover {
    transform: none !important;
  }

  :global([data-theme='dark']) .bookmark-card-icon {
    border-color: rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.2)), rgb(2 6 23 / calc(var(--card-bg-opacity, 0.15) * 0.42))),
      rgb(15 23 42 / calc(var(--card-bg-opacity, 0.15) * 0.55));
    color: var(--card-text-color, #e2e8f0);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 4px 16px rgba(0, 0, 0, 0.28);
  }

  :global([data-theme='dark']) .bookmark-card-icon:hover {
    border-color: rgba(125, 211, 252, 0.32);
  }

  :global([data-background-preset^='paper-']) .bookmark-card-icon {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--home-accent-color) 16%, transparent);
  }

  :global([data-theme='dark'][data-background-preset^='paper-']) .bookmark-card-icon {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
  }

  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-title-color, var(--card-text-color, #e5eefb));
  }

  .bookmark-card-icon.preview-light {
    border-color: rgba(255, 255, 255, 0.55);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.72)), rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.28))),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.4));
    color: var(--card-text-color, #0f172a);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -1px 0 rgba(255, 255, 255, 0.1),
      0 4px 14px rgba(15, 23, 42, 0.08);
  }

  .bookmark-icon-title.preview-light {
    color: var(--card-title-color, var(--card-text-color, #0f172a));
  }

  :global([data-background-preset^='paper-']) .bookmark-card-icon.preview-light {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--home-accent-color) 16%, transparent);
  }
</style>
