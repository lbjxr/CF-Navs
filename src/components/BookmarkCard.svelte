<script lang="ts">
  import type { CardStyle, PublicBookmark } from '../../shared/types'
  import { isIconifyIconUrl, logoSurfIcon } from '../lib/icons'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: PublicBookmark
  export let style: CardStyle = 'info'
  export let iconSize: number = 100
  export let showDescription: boolean = true
  export let showIconTitle: boolean = true
  export let width: number = 200
  export let height: number = 0
  export let canEdit = false
  export let onEdit: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined

  let useExternalIcon = false
  let fallbackFailed = false
  let contextMenuOpen = false
  let modalOpen = false
  let iconStateKey = ''

  $: openInNewTab = bookmark.open_method === 1
  $: openInModal = bookmark.open_method === 3
  $: iconText = bookmark.title.trim().slice(0, 1) || '书'
  $: infoIconSize = Math.max(0, Math.min(height > 0 ? height : 70, width))
  $: compactIconSize = Math.max(0, iconSize)
  $: tooltipText = bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title
  $: nextIconStateKey = `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.title}:${bookmark.url}`
  $: iconVersion = createIconVersion(nextIconStateKey)
  $: cardShellStyle =
    style === 'info'
      ? `min-width: ${width}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactIconSize}px; height: ${compactIconSize}px;`
  $: cardLinkStyle = height > 0 ? `height: ${height}px;` : ''
  $: canUseExternalIconFallback =
    bookmark.icon_source === 'custom' &&
    !isFaviconImIconUrl(bookmark.icon ?? '') &&
    !isIconifyIconUrl(bookmark.icon ?? '')
  $: if (nextIconStateKey !== iconStateKey) {
    iconStateKey = nextIconStateKey
    useExternalIcon = false
    fallbackFailed = false
  }

  // 图标来源：外部 URL 默认走 Worker 缓存代理；代理失败时再回退直连外站。
  $: iconUrl = (() => {
    if (bookmark.icon_source === 'logo_surf') return bookmark.icon || logoSurfIcon(bookmark.title, bookmark.url)
    if (!bookmark.icon) return ''
    if (/^data:image\//i.test(bookmark.icon)) return bookmark.icon
    if (/^https?:\/\//i.test(bookmark.icon)) {
      return useExternalIcon ? bookmark.icon : `/api/icon/${bookmark.id}?v=${iconVersion}`
    }
    return bookmark.icon
  })()
  $: hasRenderableIcon = Boolean(iconUrl) && !fallbackFailed

  function createIconVersion(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
      hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
    }
    return Math.abs(hash).toString(36)
  }

  function isFaviconImIconUrl(value: string): boolean {
    try {
      const hostname = new URL(value).hostname.toLowerCase()
      return hostname === 'favicon.im' || hostname.endsWith('.favicon.im')
    } catch {
      return false
    }
  }

  function handleIconError() {
    if (bookmark.icon_source === 'logo_surf' || !bookmark.icon || !/^https?:\/\//i.test(bookmark.icon)) {
      fallbackFailed = true
      useExternalIcon = false
      return
    }

    if (useExternalIcon || !canUseExternalIconFallback) {
      // 外站直连也失败了 → 显示首字母
      fallbackFailed = true
      useExternalIcon = false
    } else {
      // 缓存代理失败时，最后尝试一次直连外站。
      useExternalIcon = true
    }
  }

  function handleIconLoad() {
    fallbackFailed = false
  }

  function closeContextMenu() {
    contextMenuOpen = false
  }

  function handleContextMenu(event: MouseEvent) {
    if (!canEdit || !onEdit) return
    event.preventDefault()
    event.stopPropagation()
    contextMenuOpen = true
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }

  function handleLinkClick(event: MouseEvent) {
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

</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleDocumentKeydown} />

<div
  class="bookmark-card-shell"
  class:is-info={style === 'info'}
  class:is-icon={style !== 'info'}
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
        style="width: {infoIconSize}px; height: {infoIconSize}px; max-width: 100%; {bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}"
      >
        {#if hasRenderableIcon}
          <img src={iconUrl} alt={bookmark.title} on:error={handleIconError} on:load={handleIconLoad} />
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
      <div class="bookmark-icon" style={bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}>
        {#if hasRenderableIcon}
          <img src={iconUrl} alt={bookmark.title} on:error={handleIconError} on:load={handleIconLoad} />
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
  }

  /* 通用卡片样式 */
  .bookmark-card {
    text-decoration: none;
    color: inherit;
    transition: all 0.2s ease;
  }

  /* 详情风格 */
  .bookmark-card-info {
    display: flex;
    align-items: center;
    width: 100%;
    height: 70px; /* 默认高度，可被内联样式覆盖 */
    padding: 0;
    border-radius: 1.2rem;
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }

  .bookmark-card-info:hover {
    box-shadow: 0 0 20px 10px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }

  .bookmark-card-info .bookmark-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0 1rem; /* 添加左右内边距 */
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
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 1.2rem;
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  }

  .bookmark-card-icon:hover {
    box-shadow: 0 0 20px 10px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }

  .bookmark-card-icon .bookmark-icon {
    width: 100%;
    height: 100%;
    border-radius: inherit;
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
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.5);
  }

  /* 详情风格的图标填充整个高度 */
  .bookmark-card-info .bookmark-icon {
    height: 100%; /* 填充整个卡片高度 */
    border-radius: 1.2rem 0 0 1.2rem;
  }

  .bookmark-icon img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .bookmark-icon .icon-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
    font-size: 2.5rem;
    font-weight: 600;
    color: #475569;
  }

  /* 暗色主题适配 */
  :global([data-theme='dark']) .bookmark-card-info,
  :global([data-theme='dark']) .bookmark-card-icon {
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.15));
    color: var(--card-text-color, #e2e8f0);
  }

  :global([data-theme='dark']) .bookmark-card-info:hover,
  :global([data-theme='dark']) .bookmark-card-icon:hover {
    box-shadow: 0 0 20px 10px rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: var(--card-text-color, rgba(203, 213, 225, 0.92));
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-title,
  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-text-color, #e2e8f0);
  }

  :global([data-theme='dark']) .bookmark-icon {
    background: rgba(255, 255, 255, 0.1);
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
