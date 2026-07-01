<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { CardStyle, PublicBookmark } from '../../shared/types'
  import { iconifyProxyIcon, isIconifyIconUrl, logoSurfIcon } from '../lib/icons'
  import {
    createBookmarkIconCacheKey,
    readCachedBookmarkIconDataUri,
    readCachedBookmarkIconUrl,
    revokeLocalIconUrl,
    writeBookmarkIconDataUri,
  } from '../lib/localBookmarkIconCache'

  type AsyncVoid<T = void> = T | Promise<T>
  type IconStyleOptions = {
    compact?: boolean
    customBackground?: string
  }

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
  $: nextIconStateKey = `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.icon_blob ?? ''}:${bookmark.title}:${bookmark.url}`
  $: localCacheKey = createBookmarkIconCacheKey({
    id: bookmark.id,
    icon: rawIcon,
    iconSource: bookmark.icon_source,
  })
  $: syncLocalCachedIconUrl = readCachedBookmarkIconDataUri(localCacheKey) ?? ''
  $: cardShellStyle =
    style === 'info'
      ? `min-width: ${width}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactIconSize}px; height: ${compactIconSize}px;`
  $: cardLinkStyle = height > 0 ? `height: ${height}px;` : ''
  $: iconifyProxyUrl =
    bookmark.icon_source === 'iconify' || isIconifyIconUrl(rawIcon)
      ? iconifyProxyIcon(rawIcon)
      : ''
  $: canUseRawHttpIconFallback =
    /^https?:\/\//i.test(rawIcon) &&
    !iconifyProxyUrl &&
    bookmark.icon_source !== 'logo_surf' &&
    !customTextIcon
  $: shouldWaitForLocalIconCache =
    canUseRawHttpIconFallback &&
    !/^data:image\//i.test(cachedIcon)
  $: if (nextIconStateKey !== iconStateKey) {
    iconStateKey = nextIconStateKey
    cachedIconFailed = false
    fallbackFailed = false
    resetLocalCachedIconUrl()
    void loadLocalCachedIcon(localCacheKey, cachedIcon, shouldWaitForLocalIconCache)
  }
  $: syncWindowListeners(contextMenuOpen || modalOpen)

  // 普通渲染只读本地缓存或聚合数据里的 icon_blob；刷新缓存只在编辑/保存动作中触发。
  $: iconUrl = (() => {
    if (bookmark.icon_source === 'logo_surf') return bookmark.icon || logoSurfIcon(bookmark.title, bookmark.url)
    if (syncLocalCachedIconUrl) return syncLocalCachedIconUrl
    if (localCachedIconUrl) return localCachedIconUrl
    if (!cachedIconFailed && /^data:image\//i.test(cachedIcon)) return cachedIcon
    if (localCachePending && shouldWaitForLocalIconCache) return ''
    if (!rawIcon || customTextIcon) return ''
    if (iconifyProxyUrl) return iconifyProxyUrl
    if (/^data:image\//i.test(rawIcon)) return rawIcon
    if (canUseRawHttpIconFallback) return rawIcon
    return ''
  })()
  $: hasRenderableIcon = Boolean(iconUrl) && !fallbackFailed

  function resetLocalCachedIconUrl() {
    if (localCachedIconUrl) {
      revokeLocalIconUrl(localCachedIconUrl)
      localCachedIconUrl = ''
    }
  }

  async function loadLocalCachedIcon(
    cacheKey: string,
    dataUri: string,
    waitForLocalCache: boolean,
  ) {
    const requestId = ++localCacheRequestId

    if (/^data:image\//i.test(dataUri)) {
      localCachePending = false
      await writeBookmarkIconDataUri(cacheKey, dataUri)
      if (requestId !== localCacheRequestId) return
      return
    }

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
      localCachePending = false
      return
    }

    if (!cachedUrl) {
      if (requestId === localCacheRequestId) {
        localCachePending = false
      }
      return
    }
  }

  function iconRadiusFor(size: number): number {
    return Math.round(Math.max(9, Math.min(16, size * 0.22)))
  }

  function iconPaddingFor(size: number, compact = false): number {
    const ratio = compact ? 0.12 : 0.15
    return Math.round(Math.max(compact ? 5 : 6, Math.min(compact ? 12 : 10, size * ratio)))
  }

  function iconFontSizeFor(size: number): number {
    return Math.round(Math.max(18, Math.min(32, size * 0.42)))
  }

  function buildIconStyle(size: number, options: IconStyleOptions = {}): string {
    const radius = iconRadiusFor(size)
    const imageRadius = Math.max(5, radius - 4)
    return [
      `width: ${size}px;`,
      `height: ${size}px;`,
      'max-width: 100%;',
      `--bookmark-icon-radius: ${radius}px;`,
      `--bookmark-icon-image-radius: ${imageRadius}px;`,
      `--bookmark-icon-padding: ${iconPaddingFor(size, options.compact)}px;`,
      `--bookmark-icon-font-size: ${iconFontSizeFor(size)}px;`,
      options.customBackground ? `background: ${options.customBackground};` : '',
    ].join(' ')
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

    if (bookmark.icon_source === 'logo_surf' || !rawIcon || !/^https?:\/\//i.test(rawIcon)) {
      fallbackFailed = true
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad() {
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

  onDestroy(() => {
    localCacheRequestId += 1
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
      <div
        class="bookmark-icon"
        class:has-custom-background={hasCustomIconBackground}
        style={infoIconStyle}
      >
        {#if hasRenderableIcon}
          <img
            src={iconUrl}
            alt={bookmark.title}
            loading="lazy"
            decoding="async"
            on:error={handleIconError}
            on:load={handleIconLoad}
          />
        {:else}
          <span class="icon-text">{iconText}</span>
        {/if}
      </div>

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
      <div
        class="bookmark-icon"
        class:has-custom-background={hasCustomIconBackground}
        style={compactIconStyle}
      >
        {#if hasRenderableIcon}
          <img
            src={iconUrl}
            alt={bookmark.title}
            loading="lazy"
            decoding="async"
            on:error={handleIconError}
            on:load={handleIconLoad}
          />
        {:else}
          <span class="icon-text">{iconText}</span>
        {/if}
      </div>
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
    <div class="bookmark-context-menu">
      <button type="button" on:click={handleEditClick}>编辑</button>
    </div>
  {/if}

  {#if modalOpen}
    <div class="link-modal-backdrop" role="dialog" aria-modal="true" aria-label={bookmark.title}>
      <div class="link-modal">
        <div class="link-modal-header">
          <strong>{bookmark.title}</strong>
          <div class="link-modal-actions">
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer">新窗口打开</a>
            <button type="button" on:click={closeModal}>关闭</button>
          </div>
        </div>
        <iframe src={bookmark.url} title={bookmark.title}></iframe>
      </div>
    </div>
  {/if}
</div>

<style>
  .bookmark-card-shell {
    position: relative;
    min-width: 0;
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
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 10px 26px rgba(15, 23, 42, 0.11);
    backdrop-filter: blur(14px) saturate(1.18);
    -webkit-backdrop-filter: blur(14px) saturate(1.18);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
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
      inset 0 1px 0 rgba(255, 255, 255, 0.64),
      0 16px 34px rgba(15, 23, 42, 0.16);
    transform: translateY(-2px);
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
      inset 0 1px 0 rgba(255, 255, 255, 0.64),
      0 16px 34px rgba(15, 23, 42, 0.16);
    transform: translateY(-2px);
  }

  .bookmark-card-icon .bookmark-icon {
    width: 100%;
    height: 100%;
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

  /* 图标样式 */
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
      inset 0 1px 0 rgba(255, 255, 255, 0.62),
      0 6px 14px rgba(15, 23, 42, 0.08);
  }

  .bookmark-icon.has-custom-background {
    border-color: rgba(15, 23, 42, 0.08);
  }

  /* 详情风格的图标采用内嵌方形底座，避免只在左侧裁切圆角 */
  .bookmark-card-info .bookmark-icon {
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
      0 14px 32px rgba(0, 0, 0, 0.24);
  }

  :global([data-theme='dark']) .bookmark-card-info:hover,
  :global([data-theme='dark']) .bookmark-card-icon:hover {
    border-color: rgba(255, 255, 255, 0.16);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 18px 38px rgba(0, 0, 0, 0.32);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: var(--card-text-color, rgba(203, 213, 225, 0.92));
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-title,
  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-text-color, #e2e8f0);
  }

  :global([data-theme='dark']) .bookmark-icon {
    border-color: rgba(148, 163, 184, 0.16);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(15, 23, 42, 0.2)),
      rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 6px 16px rgba(0, 0, 0, 0.18);
  }

  :global([data-theme='dark']) .bookmark-icon .icon-text {
    color: #cbd5e1;
  }

  .bookmark-context-menu {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 80;
    min-width: 88px;
    padding: 6px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(10px);
  }

  .bookmark-context-menu button {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    padding: 7px 12px;
    text-align: left;
  }

  .bookmark-context-menu button:hover {
    background: #eff6ff;
    color: #1d4ed8;
  }

  .link-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(15, 23, 42, 0.62);
    backdrop-filter: blur(4px);
  }

  .link-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(1120px, 100%);
    height: min(760px, calc(100vh - 36px));
    overflow: hidden;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.32);
  }

  .link-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
  }

  .link-modal-header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-modal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .link-modal-actions a,
  .link-modal-actions button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 7px 10px;
    text-decoration: none;
  }

  .link-modal iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #ffffff;
  }

  :global([data-theme='dark']) .link-modal {
    background: #0f172a;
  }

  :global([data-theme='dark']) .link-modal-header {
    border-color: rgba(148, 163, 184, 0.24);
    color: #e5eefb;
  }

  :global([data-theme='dark']) .bookmark-context-menu {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.94);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.32);
  }

  :global([data-theme='dark']) .bookmark-context-menu button {
    color: #e5eefb;
  }

  :global([data-theme='dark']) .bookmark-context-menu button:hover {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
  }
</style>
