<script lang="ts">
  import type { PublicBookmark } from '../../shared/types'
  import BookmarkIcon from './BookmarkIcon.svelte'

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
  class="bookmark-card bookmark-card-icon"
  class:sort-mode={sortMode}
  href={bookmark.url}
  target={openInNewTab ? '_blank' : undefined}
  rel={openInNewTab ? 'noopener noreferrer' : undefined}
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
    onError={onIconError}
    onLoad={onIconLoad}
  />
</a>
{#if showIconTitle}
  <a
    class="bookmark-icon-title"
    href={bookmark.url}
    target={openInNewTab ? '_blank' : undefined}
    rel={openInNewTab ? 'noopener noreferrer' : undefined}
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

  .bookmark-card-icon::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    z-index: 20;
    width: max-content;
    max-width: 240px;
    padding: 0.45rem 0.65rem;
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.95);
    color: #ffffff;
    font-size: 0.78rem;
    line-height: 1.45;
    text-align: left;
    white-space: pre-line;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.24);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 4px);
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  .bookmark-card-icon:hover::after,
  .bookmark-card-icon:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .bookmark-icon-title {
    display: block;
    width: 100%;
    margin-top: 0.45rem;
    color: var(--card-text-color, #0f172a);
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

  .bookmark-card-icon.sort-mode::after {
    display: none;
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

  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-text-color, #e5eefb);
  }
</style>
