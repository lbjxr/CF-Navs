<script lang="ts">
  import type { Bookmark, CardStyle } from '../../shared/types'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: Bookmark
  export let style: CardStyle = 'info'
  export let iconSize: number = 100
  export let showDescription: boolean = true
  export let width: number = 200
  export let height: number = 0
  export let canEdit = false
  export let onEdit: ((bookmark: Bookmark) => AsyncVoid) | undefined = undefined

  let useFallbackIcon = false
  let fallbackFailed = false
  let contextMenuOpen = false
  let contextMenuX = 0
  let contextMenuY = 0

  $: openInNewTab = bookmark.open_method === 1
  $: iconText = bookmark.title.trim().slice(0, 1) || '书'
  $: infoIconSize = Math.max(0, Math.min(height > 0 ? height : 70, width))
  $: compactIconSize = Math.max(0, iconSize)
  $: tooltipText = bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title

  // 图标来源：有 URL 时优先加载；失败时尝试缓存；再失败用首字母
  $: iconUrl = (() => {
    if (!bookmark.icon) return ''
    if (useFallbackIcon) return `/api/icon/${bookmark.id}`
    return bookmark.icon
  })()

  function handleIconError() {
    if (useFallbackIcon) {
      // 缓存也失败了 → 显示首字母
      fallbackFailed = true
      useFallbackIcon = false
    } else if (bookmark.icon) {
      // 外部图标失败 → 尝试本地缓存
      useFallbackIcon = true
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
    contextMenuX = Math.min(event.clientX, window.innerWidth - 132)
    contextMenuY = Math.min(event.clientY, window.innerHeight - 52)
    contextMenuOpen = true
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }


  function handleWindowClick() {
    if (contextMenuOpen) closeContextMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (contextMenuOpen && event.key === 'Escape') closeContextMenu()
  }

</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleDocumentKeydown} />

{#if style === 'info'}
  <!-- 详情风格：水平布局 -->
  <a
    class="bookmark-card bookmark-card-info"
    href={bookmark.url}
    target={openInNewTab ? '_blank' : undefined}
    rel={openInNewTab ? 'noopener noreferrer' : undefined}
    style="min-width: {width}px; {height > 0 ? `height: ${height}px;` : ''}"
    on:contextmenu={handleContextMenu}
  >
    <div class="bookmark-icon" style="width: {infoIconSize}px; height: {infoIconSize}px; max-width: 100%;">
      {#if bookmark.icon && !fallbackFailed}
        <img src={iconUrl} alt={bookmark.title} loading="lazy" on:error={handleIconError} on:load={handleIconLoad} />
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
    on:contextmenu={handleContextMenu}
  >
    <div class="bookmark-icon">
      {#if bookmark.icon && !fallbackFailed}
        <img src={iconUrl} alt={bookmark.title} loading="lazy" on:error={handleIconError} on:load={handleIconLoad} />
      {:else}
        <span class="icon-text">{iconText}</span>
      {/if}
    </div>
  </a>
{/if}

{#if contextMenuOpen}
  <div
    class="bookmark-context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px;"
  >
    <button type="button" on:click={handleEditClick}>编辑</button>
  </div>
{/if}

<style>
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
    text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-info .bookmark-description {
    font-size: 0.75rem;
    color: rgba(71, 85, 105, 0.92);
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
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .bookmark-card-info:hover,
  :global([data-theme='dark']) .bookmark-card-icon:hover {
    box-shadow: 0 0 20px 10px rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: rgba(203, 213, 225, 0.92);
  }

  :global([data-theme='dark']) .bookmark-icon {
    background: rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .bookmark-icon .icon-text {
    color: #cbd5e1;
  }
</style>
