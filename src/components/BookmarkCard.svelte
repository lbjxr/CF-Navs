<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { CardStyle, PublicBookmark } from '../../shared/types'
  import BookmarkContextMenu from './BookmarkContextMenu.svelte'
  import BookmarkIcon from './BookmarkIcon.svelte'
  import BookmarkLinkModal from './BookmarkLinkModal.svelte'
  import { buildIconStyle, createIconVersion } from '../lib/bookmarkIconDisplay'
  import { iconifyProxyIcon, isIconifyIconUrl, logoSurfIcon } from '../lib/icons'
  import { observeIconVisibility } from '../lib/iconVisibility'
  import {
    createBookmarkIconCacheKey,
    readCachedBookmarkIconDataUri,
    readCachedBookmarkIconUrl,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'

  type AsyncVoid<T = void> = T | Promise<T>

  const CONTEXT_MENU_OPEN_EVENT = 'cf-navs-bookmark-context-menu-open'

  export let bookmark: PublicBookmark
  export let style: CardStyle = 'info'
  export let iconSize: number = 100
  export let showDescription: boolean = true
  export let showIconTitle: boolean = true
  export let width: number = 200
  export let height: number = 0
  export let canEdit = false
  export let sortMode = false
  export let onEdit: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined

  let cachedIconFailed = false
  let fallbackFailed = false
  let localCachedIconUrl = ''
  let syncLocalCachedIconUrl = ''
  let localCachePending = false
  let localCacheRequestId = 0
  let iconInView = true
  let shellElement: HTMLDivElement | null = null
  let stopIconVisibilityObserver: (() => void) | null = null
  let contextMenuOpen = false
  let modalOpen = false
  let iconStateKey = ''
  let windowListenersAttached = false
  let contextMenuInstanceId = Math.random().toString(36).slice(2)

  $: openInNewTab = bookmark.open_method === 1
  $: openInModal = bookmark.open_method === 3
  $: rawIcon = bookmark.icon?.trim() ?? ''
  $: cachedIcon = bookmark.icon_blob?.trim() ?? ''
  $: customTextIcon =
    rawIcon &&
    bookmark.icon_source !== 'logo_surf' &&
    bookmark.icon_source !== 'iconify' &&
    !isIconifyIconUrl(rawIcon) &&
    !/^data:image\//i.test(rawIcon) &&
    !/^https?:\/\//i.test(rawIcon)
      ? rawIcon
      : ''
  $: iconText = customTextIcon || bookmark.title.trim().slice(0, 1) || '书'
  $: infoCardHeight = height > 0 ? height : 70
  $: infoIconInset = infoCardHeight <= 56 ? 6 : 8
  $: infoIconSize = Math.max(32, Math.min(infoCardHeight - infoIconInset * 2, width - infoIconInset * 2))
  $: compactIconSize = Math.max(0, iconSize)
  $: iconBackgroundColor = bookmark.icon_background_color || ''
  $: hasCustomIconBackground = Boolean(iconBackgroundColor)
  $: infoIconStyle = buildIconStyle(infoIconSize, { customBackground: iconBackgroundColor })
  $: compactIconStyle = buildIconStyle(compactIconSize, {
    compact: true,
    customBackground: iconBackgroundColor,
  })
  $: tooltipText = bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title
  $: nextIconStateKey = `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.icon_blob ?? ''}:${bookmark.title}:${bookmark.url}:${iconInView}`
  $: localCacheKey = createBookmarkIconCacheKey({
    id: bookmark.id,
    icon: rawIcon,
    iconSource: bookmark.icon_source,
  })
  $: hasEmbeddedIcon = /^data:image\//i.test(cachedIcon)
  $: hasCachedRemoteIcon = Boolean(bookmark.icon_cached) && !hasEmbeddedIcon
  $: syncLocalCachedIconUrl = iconInView && !hasEmbeddedIcon
    ? readCachedBookmarkIconDataUri(localCacheKey) ?? ''
    : ''
  $: cardShellStyle =
    style === 'info'
      ? `min-width: ${width}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactIconSize}px; height: ${compactIconSize}px;`
  $: cardLinkStyle = height > 0 ? `height: ${height}px;` : ''
  $: iconifyRemoteUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(rawIcon)
      ? iconifyProxyIcon(rawIcon)
      : ''
  $: canUseRawHttpIconFallback =
    /^https?:\/\//i.test(rawIcon) &&
    !iconifyRemoteUrl &&
    bookmark.icon_source !== 'logo_surf' &&
    !customTextIcon
  $: shouldReadLocalIconCache =
    iconInView &&
    Boolean(rawIcon) &&
    !iconifyRemoteUrl &&
    !hasEmbeddedIcon &&
    bookmark.icon_source !== 'logo_surf' &&
    !customTextIcon
  $: shouldUseIconProxy = canUseRawHttpIconFallback || hasCachedRemoteIcon
  $: shouldWaitForLocalIconCache = false
  $: proxiedHttpIconUrl = shouldUseIconProxy
    ? `/api/icon/${encodeURIComponent(String(bookmark.id))}?v=${createIconVersion(`${bookmark.id}:${rawIcon}:${bookmark.title}:${bookmark.url}`)}`
    : ''
  $: if (nextIconStateKey !== iconStateKey) {
    iconStateKey = nextIconStateKey
    cachedIconFailed = false
    fallbackFailed = false
    resetLocalCachedIconUrl()
    if (shouldReadLocalIconCache) {
      void loadLocalCachedIcon(localCacheKey, shouldWaitForLocalIconCache)
    } else {
      localCachePending = false
    }
  }
  $: syncWindowListeners(contextMenuOpen || modalOpen)

  $: iconUrl = (() => {
    if (!iconInView) return ''
    if (bookmark.icon_source === 'logo_surf') return bookmark.icon || logoSurfIcon(bookmark.title, bookmark.url)
    if (!cachedIconFailed && hasEmbeddedIcon) return cachedIcon
    if (syncLocalCachedIconUrl) return syncLocalCachedIconUrl
    if (localCachedIconUrl) return localCachedIconUrl
    if (localCachePending && shouldWaitForLocalIconCache) return ''
    if ((!rawIcon && !hasCachedRemoteIcon) || customTextIcon) return ''
    if (iconifyRemoteUrl) return iconifyRemoteUrl
    if (/^data:image\//i.test(rawIcon)) return rawIcon
    if (shouldUseIconProxy) return proxiedHttpIconUrl
    return ''
  })()
  $: hasRenderableIcon = Boolean(iconUrl) && !fallbackFailed

  function resetLocalCachedIconUrl() {
    if (localCachedIconUrl) {
      revokeLocalIconUrl(localCachedIconUrl)
      localCachedIconUrl = ''
    }
  }

  async function loadLocalCachedIcon(cacheKey: string, waitForLocalCache: boolean) {
    const requestId = ++localCacheRequestId

    if (waitForLocalCache) {
      localCachePending = true
    }

    const cachedUrl = await readCachedBookmarkIconUrl(cacheKey)
    if (requestId !== localCacheRequestId) {
      if (cachedUrl) revokeLocalIconUrl(cachedUrl)
      return
    }

    if (cachedUrl) {
      resetLocalCachedIconUrl()
      localCachedIconUrl = cachedUrl
    }

    localCachePending = false
  }

  function handleIconError() {
    if (localCachedIconUrl) {
      resetLocalCachedIconUrl()
      return
    }

    if (!cachedIconFailed && /^data:image\//i.test(cachedIcon)) {
      cachedIconFailed = true
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad() {
    localCachePending = false
    fallbackFailed = false
  }

  function closeContextMenu() {
    contextMenuOpen = false
  }

  function notifyContextMenuOpen() {
    window.dispatchEvent(new CustomEvent(CONTEXT_MENU_OPEN_EVENT, {
      detail: contextMenuInstanceId,
    }))
  }

  function handleContextMenuOpenEvent(event: Event) {
    const sourceId = (event as CustomEvent<string>).detail
    if (sourceId !== contextMenuInstanceId) {
      closeContextMenu()
    }
  }

  function handleContextMenu(event: MouseEvent) {
    if (sortMode) {
      event.preventDefault()
      return
    }
    if (!canEdit || !onEdit) return
    event.preventDefault()
    event.stopPropagation()
    notifyContextMenuOpen()
    contextMenuOpen = true
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }

  function handleLinkClick(event: MouseEvent) {
    if (sortMode) {
      event.preventDefault()
      return
    }
    if (!openInModal) return
    event.preventDefault()
    modalOpen = true
  }

  function closeModal() {
    modalOpen = false
  }

  function handleWindowClick() {
    if (contextMenuOpen) closeContextMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (modalOpen && event.key === 'Escape') closeModal()
    if (contextMenuOpen && event.key === 'Escape') closeContextMenu()
  }

  function markIconInView() {
    iconInView = true
    disconnectIconObserver()
  }

  function disconnectIconObserver() {
    stopIconVisibilityObserver?.()
    stopIconVisibilityObserver = null
  }

  function setupIconObserver() {
    disconnectIconObserver()
    if (iconInView) return

    if (shellElement) {
      stopIconVisibilityObserver = observeIconVisibility(shellElement, markIconInView)
    } else {
      iconInView = true
    }
  }

  function syncWindowListeners(active: boolean) {
    if (typeof window === 'undefined') return

    if (active && !windowListenersAttached) {
      window.addEventListener('click', handleWindowClick)
      window.addEventListener('keydown', handleDocumentKeydown)
      window.addEventListener(CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = true
      return
    }

    if (!active && windowListenersAttached) {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleDocumentKeydown)
      window.removeEventListener(CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = false
    }
  }

  onMount(() => {
    setupIconObserver()
  })

  onDestroy(() => {
    localCacheRequestId += 1
    disconnectIconObserver()
    resetLocalCachedIconUrl()
    syncWindowListeners(false)
  })
</script>

<div
  class="bookmark-card-shell"
  class:is-info={style === 'info'}
  class:is-icon={style !== 'info'}
  class:sort-mode={sortMode}
  style={cardShellStyle}
  bind:this={shellElement}
>
  {#if style === 'info'}
    <!-- 详情风格：水平布局 -->
    <a
      class="bookmark-card bookmark-card-info"
      href={bookmark.url}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      style={cardLinkStyle}
      on:click={handleLinkClick}
      on:contextmenu={handleContextMenu}
    >
      <BookmarkIcon
        title={bookmark.title}
        iconUrl={hasRenderableIcon ? iconUrl : ''}
        {iconText}
        size={infoIconSize}
        iconStyle={infoIconStyle}
        hasCustomBackground={hasCustomIconBackground}
        variant="info"
        onError={handleIconError}
        onLoad={handleIconLoad}
      />

      <div class="bookmark-text">
        <h3 class="bookmark-title">{bookmark.title}</h3>
        {#if showDescription && bookmark.description}
          <p class="bookmark-description">{bookmark.description}</p>
        {/if}
      </div>
    </a>
  {:else}
    <!-- 极简风格：垂直布局 -->
    <a
      class="bookmark-card bookmark-card-icon"
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
        iconUrl={hasRenderableIcon ? iconUrl : ''}
        {iconText}
        size={compactIconSize}
        iconStyle={compactIconStyle}
        hasCustomBackground={hasCustomIconBackground}
        variant="compact"
        onError={handleIconError}
        onLoad={handleIconLoad}
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
  {/if}

  {#if contextMenuOpen}
    <BookmarkContextMenu onEdit={handleEditClick} />
  {/if}

  {#if modalOpen}
    <BookmarkLinkModal title={bookmark.title} url={bookmark.url} onClose={closeModal} />
  {/if}
</div>

<style>
  .bookmark-card-shell {
    position: relative;
    min-width: 0;
    contain: layout style;
  }

  .bookmark-card-shell.is-info {
    width: 100%;
  }

  .bookmark-card-shell.is-icon {
    flex: 0 0 auto;
    aspect-ratio: 1 / 1;
  }

  /* 排序模式：整卡可拖动，禁用 hover 位移与点击导航，避免抖动 */
  .bookmark-card-shell.sort-mode .bookmark-card {
    cursor: move;
    transform: none !important;
    transition: none;
    user-select: none;
  }

  .bookmark-card-shell.sort-mode .bookmark-card:hover {
    transform: none !important;
  }

  .bookmark-card-shell.sort-mode .bookmark-card-icon::after {
    display: none;
  }

  /* 通用卡片样式 */
  .bookmark-card {
    box-sizing: border-box;
    text-decoration: none;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.42);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.78)), rgba(255, 255, 255, 0.34)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.62));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.46),
      0 2px 8px rgba(15, 23, 42, 0.08);
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }

  /* 详情风格 */
  .bookmark-card-info {
    display: flex;
    align-items: center;
    gap: 0.82rem;
    width: 100%;
    height: 70px; /* 默认高度，可被内联样式覆盖 */
    padding: 0 0.95rem 0 0.55rem;
    border-radius: 1.2rem;
    overflow: hidden;
  }

  .bookmark-card-info:hover {
    border-color: rgba(255, 255, 255, 0.62);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.58),
      0 6px 16px rgba(15, 23, 42, 0.1);
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
    color: var(--card-text-color, #0f172a);
    text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-info .bookmark-description {
    font-size: 0.75rem;
    color: var(--card-text-color, rgba(71, 85, 105, 0.92));
    opacity: 0.72;
    margin: 0.25rem 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  /* 极简风格 */
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
    border-color: rgba(255, 255, 255, 0.62);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.58),
      0 6px 16px rgba(15, 23, 42, 0.1);
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

  /* 暗色主题适配 */
  :global([data-theme='dark']) .bookmark-card-info,
  :global([data-theme='dark']) .bookmark-card-icon {
    border-color: rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.82)), rgba(15, 23, 42, 0.22)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.7));
    color: var(--card-text-color, #e2e8f0);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 4px 12px rgba(0, 0, 0, 0.18);
  }

  :global([data-theme='dark']) .bookmark-card-info:hover,
  :global([data-theme='dark']) .bookmark-card-icon:hover {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 8px 18px rgba(0, 0, 0, 0.24);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: var(--card-text-color, rgba(203, 213, 225, 0.92));
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-title,
  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-text-color, #e2e8f0);
  }

</style>
