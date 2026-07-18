<script lang="ts">
  import type { DescriptionDisplayMode, PublicBookmark } from '../../shared/types'
  import BookmarkIcon from './BookmarkIcon.svelte'
  import './bookmarkCardTooltip.css'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: PublicBookmark
  export let openInNewTab = true
  export let sortMode = false
  export let cardLinkStyle = ''
  export let showDescription = true
  export let descriptionMode: DescriptionDisplayMode = showDescription ? 'always' : 'hidden'
  export let tooltipText = ''
  export let iconUrl = ''
  export let iconText = ''
  export let infoIconSize = 60
  export let infoIconStyle = ''
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
  class="bookmark-card bookmark-card-info"
  class:bookmark-tooltip-anchor={showDescription && descriptionMode === 'hover' && Boolean(bookmark.description)}
  class:sort-mode={sortMode}
  class:preview-light={preview && themeOverride === 'light'}
  href={preview ? undefined : bookmark.url}
  target={!preview && openInNewTab ? '_blank' : undefined}
  rel={!preview && openInNewTab ? 'noopener noreferrer' : undefined}
  tabindex={preview ? -1 : undefined}
  aria-disabled={preview ? 'true' : undefined}
  style={cardLinkStyle}
  title={showDescription && descriptionMode === 'hover' ? tooltipText : undefined}
  aria-label={showDescription && descriptionMode === 'hover' ? tooltipText : undefined}
  data-tooltip={showDescription && descriptionMode === 'hover' ? tooltipText : ''}
  on:click={handleLinkClick}
  on:contextmenu={handleContextMenu}
>
  <BookmarkIcon
    title={bookmark.title}
    {iconUrl}
    {iconText}
    size={infoIconSize}
    iconStyle={infoIconStyle}
    hasCustomBackground={hasCustomIconBackground}
    variant="info"
    {themeOverride}
    onError={onIconError}
    onLoad={onIconLoad}
  />

  <div class="bookmark-text">
    <h3 class="bookmark-title">{bookmark.title}</h3>
      {#if showDescription && descriptionMode === 'always' && bookmark.description}
      <p class="bookmark-description">{bookmark.description}</p>
    {/if}
  </div>
</a>

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

  .bookmark-card-info {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.82rem;
    width: 100%;
    height: 70px;
    padding: 0 0.95rem 0 0.55rem;
    border-radius: 1.2rem;
    overflow: visible;
  }

  .bookmark-card-info:hover {
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      0 8px 20px rgba(15, 23, 42, 0.12);
    transform: translateY(-1px);
  }

  .bookmark-card-info .bookmark-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .bookmark-card-info .bookmark-title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
    color: var(--card-title-color, var(--card-text-color, #0f172a));
    text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-info .bookmark-description {
    font-size: 0.75rem;
    color: var(--card-description-color, var(--card-text-color, #475569));
    margin: 0.25rem 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
    min-height: 0.9em;
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  .bookmark-card-info.sort-mode {
    cursor: move;
    transform: none !important;
    transition: none;
    user-select: none;
  }

  .bookmark-card-info.sort-mode:hover {
    transform: none !important;
  }

  :global([data-theme='dark']) .bookmark-card-info {
    border-color: rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.2)), rgb(2 6 23 / calc(var(--card-bg-opacity, 0.15) * 0.42))),
      rgb(15 23 42 / calc(var(--card-bg-opacity, 0.15) * 0.55));
    color: var(--card-text-color, #e2e8f0);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 4px 16px rgba(0, 0, 0, 0.28);
  }

  :global([data-theme='dark']) .bookmark-card-info:hover {
    border-color: rgba(125, 211, 252, 0.32);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-title {
    color: var(--card-title-color, var(--card-text-color, #e5eefb));
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: var(--card-description-color, var(--card-text-color, #cbd5e1));
  }

  :global([data-background-preset^='paper-']) .bookmark-card-info {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--home-accent-color) 16%, transparent);
  }

  :global([data-theme='dark'][data-background-preset^='paper-']) .bookmark-card-info {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
  }

  .bookmark-card-info.preview-light {
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

  .bookmark-card-info.preview-light .bookmark-title {
    color: var(--card-title-color, var(--card-text-color, #0f172a));
  }

  .bookmark-card-info.preview-light .bookmark-description {
    color: var(--card-description-color, var(--card-text-color, #475569));
  }

  :global([data-background-preset^='paper-']) .bookmark-card-info.preview-light {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--home-accent-color) 16%, transparent);
  }

</style>
