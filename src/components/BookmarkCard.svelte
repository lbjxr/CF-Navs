<svelte:options runes />

<script lang="ts">
  import { createLocalIconView, emptyLocalIcon } from '../lib/localIconView'
  import { applyIconDisplayOverride, bookmarkIconDisplay } from '../lib/iconDisplayStore'
  // 本地图标视图每次发布新对象；不做深层代理。
  let localImage = $state.raw(emptyLocalIcon)
  const localView = createLocalIconView(value => { localImage = value })
  import { onDestroy, onMount, untrack } from 'svelte'
  import { on } from 'svelte/events'
  import type { Attachment } from 'svelte/attachments'
  import type { CardStyle, DescriptionDisplayMode, PublicBookmark } from '../../shared/types'
  import type { CategoryTreeOption } from '../lib/categorySelect'
  import BookmarkCardCompact from './BookmarkCardCompact.svelte'
  import { recordBookmarkClick } from '../lib/dataService'
  import BookmarkCardInfo from './BookmarkCardInfo.svelte'
  import { getLoadedBookmarkContextMenu, loadBookmarkContextMenu, preloadBookmarkContextMenuWhenIdle } from '../lib/lazyBookmarkContextMenu'
  import BookmarkLinkModal from './BookmarkLinkModal.svelte'
  import { getInfoCardTrackWidth, getIconCardTrackWidth } from '../lib/bookmarkCardLayout'
  import { createIconRetry } from '../lib/iconRetry'
  import { buildIconStyle } from '../lib/bookmarkIconDisplay'
  import {
    BOOKMARK_CONTEXT_MENU_OPEN_EVENT,
    canOpenBookmarkContextMenu,
    createBookmarkContextMenuOpenEvent,
    isExternalContextMenuOpenEvent,
    shouldBlockCardNavigation,
    shouldOpenBookmarkModal,
  } from '../lib/bookmarkCardInteractions'
  import {
    deriveBookmarkCardIconBase,
    deriveBookmarkCardIconUrl,
  } from '../lib/bookmarkCardIconState'
  import { observeIconVisibility } from '../lib/iconVisibility'
  import {
    fetchBookmarkIcon,
    fetchCachedBookmarkIconUrl,
    readCachedBookmarkIconDataUri,
    revokeLocalIconUrl,
  } from '../lib/localBookmarkIconCache'

  type AsyncVoid<T = void> = T | Promise<T>

  interface Props {
    bookmark: PublicBookmark
    style?: CardStyle
    iconSize?: number
    showDescription?: boolean
    descriptionMode?: DescriptionDisplayMode
    showIconTitle?: boolean
    width?: number
    height?: number
    canEdit?: boolean
    sortMode?: boolean
    preview?: boolean
    themeOverride?: 'light' | 'dark' | null
    onEdit?: (bookmark: PublicBookmark) => AsyncVoid
    moveCategories?: CategoryTreeOption[]
    onMoveBookmark?: (bookmark: PublicBookmark, categoryId: number) => AsyncVoid
    /**
     * 私密书签（或位于私密分类树下的书签）的短期图标授权 key。公开书签必须传空串：
     * 带 key 会让 `/api/icon/:id` 返回 `private, no-store`，白丢共享缓存。
     */
    iconAccessKey?: string
    reuseCompletedObject?: boolean
    /** REQ-17 聚合区：卡片来源二级分类名；详情卡显示可见 chip，极简卡经 tooltip/ARIA 承载；空串不显示。 */
    sourceCategoryTitle?: string
  }

  let {
    bookmark,
    style = 'info',
    iconSize = 100,
    showDescription = true,
    descriptionMode = showDescription ? 'always' : 'hidden',
    showIconTitle = true,
    width = 160,
    height = 0,
    canEdit = false,
    sortMode = false,
    preview = false,
    themeOverride = null,
    onEdit = undefined,
    moveCategories = [],
    onMoveBookmark = undefined,
    iconAccessKey = '',
    reuseCompletedObject = false,
    sourceCategoryTitle = '',
  }: Props = $props()

  let cachedIconFailed = $state(false)
  let fallbackFailed = $state(false)
  let localCachedIconUrl = $state('')
  // 只在处理器与加载函数里读写，不进模板。
  let localIconReady = false
  const iconRetry = createIconRetry(() => {
    if (iconBaseState.proxiedHttpIconUrl) {
      void loadLocalCachedIcon(iconBaseState.localCacheKey, false, iconBaseState.proxiedHttpIconUrl)
    }
  })
  let localCachePending = $state(false)
  const localCacheRequest = { current: 0 }
  let iconInView = $state(false)
  let shellElement: HTMLDivElement | null = $state(null)
  let stopIconVisibilityObserver: (() => void) | null = null
  let contextMenuOpen = $state(false)
  let modalOpen = $state(false)
  // 以下只在副作用 / 处理器里比较或读写，不进模板。
  let iconStateKey = ''
  let windowListenersAttached = false
  let contextMenuInstanceId = Math.random().toString(36).slice(2)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let contextMenuOpenedAt = 0
  const TOUCH_CLICK_GUARD_MS = 700
  let touchStartX = 0
  let touchStartY = 0
  const LONG_PRESS_MS = 500

  const openInNewTab = $derived(bookmark.open_method === 1)
  // 菜单组件按需加载：能打开菜单的卡片在空闲时预取，打开时若尚未就绪则等待加载完成再渲染。
  let ContextMenuComponent = $state.raw(getLoadedBookmarkContextMenu())
  const menuAvailable = $derived(!preview && canOpenBookmarkContextMenu({ sortMode, canEdit, hasEditHandler: Boolean(onEdit), hasMoveHandler: Boolean(onMoveBookmark) }))
  $effect.pre(() => {
    if (menuAvailable && !ContextMenuComponent) untrack(preloadBookmarkContextMenuWhenIdle)
  })
  $effect.pre(() => {
    if (contextMenuOpen && !ContextMenuComponent) untrack(() => void ensureContextMenuComponent())
  })
  async function ensureContextMenuComponent(): Promise<void> {
    try {
      ContextMenuComponent = await loadBookmarkContextMenu()
    } catch (error) {
      console.warn('[CF-Navs] failed to load bookmark context menu', error)
      contextMenuOpen = false
    }
  }
  // 图标显示状态来自独立的按 id 订阅表：图标更新只重算这张卡片，不触发首页结构数据重建。
  // watch 对同一 id 返回同一个 store，`$iconDisplayOverride` 不会反复重订阅。
  const iconDisplayOverride = $derived(bookmarkIconDisplay.watch(bookmark.id))
  const iconBookmark = $derived(applyIconDisplayOverride(bookmark, $iconDisplayOverride))
  // 原拓扑顺序：iconBaseState 先于依赖它的 localView.set 计算。
  const iconBaseState = $derived(deriveBookmarkCardIconBase({
    bookmark: iconBookmark,
    iconInView,
    shouldWaitForLocalIconCache: true,
    iconAccessKey,
  }))
  // 与原 `$:` 一样先于 DOM 更新、在状态键判断之前执行；set 内部按签名去重，只在入参依赖变化时调用。
  $effect.pre(() => {
    const input = { ...iconBookmark, visible: iconInView, preview, online_url: iconBaseState.proxiedHttpIconUrl }
    untrack(() => localView.set(input))
  })
  const iconText = $derived(iconBaseState.iconText)
  const nextIconStateKey = $derived(iconBaseState.nextIconStateKey + ':' + localImage.active)
  const localCacheKey = $derived(iconBaseState.localCacheKey)
  const syncLocalCachedIconUrl = $derived(iconInView && !iconBaseState.hasEmbeddedIcon
    ? readCachedBookmarkIconDataUri(localCacheKey) ?? ''
    : '')
  // 状态键变化时复位并重新加载；原语句的语法依赖是 nextIconStateKey 与 iconBaseState / localImage
  // （三者都已含在键里或随键变化），被调用函数里读写的 localCachedIconUrl 等不作为依赖。
  $effect.pre(() => {
    const key = nextIconStateKey
    const baseState = iconBaseState
    const localActive = localImage.active
    untrack(() => {
      if (key === iconStateKey) return
      iconStateKey = key
      cachedIconFailed = false
      fallbackFailed = false
      localIconReady = false
      iconRetry.reset()
      resetLocalCachedIconUrl()
      if (baseState.shouldReadLocalIconCache && !localActive) {
        void loadLocalCachedIcon(
          baseState.localCacheKey,
          baseState.shouldWaitForLocalIconCache,
          baseState.shouldUseIconProxy ? baseState.proxiedHttpIconUrl : '',
        )
      } else {
        localCacheRequest.current += 1
        localCachePending = false
      }
    })
  })
  const iconUrlState = $derived(deriveBookmarkCardIconUrl({
    bookmark: iconBookmark,
    baseState: iconBaseState,
    cachedIconFailed,
    fallbackFailed,
    syncLocalCachedIconUrl,
    localCachedIconUrl,
    localCachePending,
  }))
  const iconUrl = $derived(localImage.active ? localImage.url : iconUrlState.iconUrl)
  const hasRenderableIcon = $derived(localImage.active ? Boolean(localImage.url) : iconUrlState.hasRenderableIcon)
  const infoCardHeight = $derived(height > 0 ? height : 70)
  const safeInfoCardWidth = $derived(getInfoCardTrackWidth(width))
  const infoIconInset = $derived(infoCardHeight <= 56 ? 6 : 8)
  const infoIconSize = $derived(Math.max(32, Math.min(infoCardHeight - infoIconInset * 2, safeInfoCardWidth - infoIconInset * 2)))
  const compactIconSize = $derived(Math.max(0, iconSize))
  const compactShellWidth = $derived(getIconCardTrackWidth(compactIconSize, showIconTitle))
  const iconBackgroundColor = $derived(bookmark.icon_background_color || '')
  const hasCustomIconBackground = $derived(Boolean(iconBackgroundColor))
  const infoIconStyle = $derived(buildIconStyle(infoIconSize, { customBackground: iconBackgroundColor }))
  const compactIconStyle = $derived(buildIconStyle(compactIconSize, {
    compact: true,
    customBackground: iconBackgroundColor,
  }))
  const tooltipText = $derived(bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title)
  const cardShellStyle = $derived(
    style === 'info'
      ? `--card-configured-min-width: ${safeInfoCardWidth}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactShellWidth}px;`)
  const cardLinkStyle = $derived(height > 0 ? `height: ${height}px;` : '')
  $effect.pre(() => {
    const active = contextMenuOpen || modalOpen
    untrack(() => syncWindowListeners(active))
  })
  function resetLocalCachedIconUrl() {
    if (localCachedIconUrl) {
      revokeLocalIconUrl(localCachedIconUrl)
      localCachedIconUrl = ''
    }
  }

  async function loadLocalCachedIcon(cacheKey: string, waitForLocalCache: boolean, remoteUrl: string) {
    if (localImage.active) return
    if (waitForLocalCache) {
      localCachePending = true
    }

    const result = await fetchCachedBookmarkIconUrl(cacheKey, localCacheRequest)
    if (result.stale) return
    const requestSequence = localCacheRequest.current
    if (result.url) {
      localIconReady = true
      resetLocalCachedIconUrl()
      localCachedIconUrl = result.url
      localCachePending = false
      return
    }

    if (remoteUrl) {
      const remote = await fetchBookmarkIcon(cacheKey, remoteUrl, {
        reuseCompletedObject: reuseCompletedObject || iconBaseState.hasProjectedImageIcon,
      })
      if (requestSequence !== localCacheRequest.current) {
        if (remote.url) revokeLocalIconUrl(remote.url)
        return
      }
      localIconReady = remote.status === 'ready'
      if (remote.url) {
        resetLocalCachedIconUrl()
        localCachedIconUrl = remote.url
        cachedIconFailed = false
        fallbackFailed = false
      } else if (!localCachedIconUrl) {
        cachedIconFailed = true
        fallbackFailed = true
      }
      if (remote.status === 'retryable') iconRetry.failed()
      else if (remote.status === 'unavailable') iconRetry.reset()
    }

    localCachePending = false
  }

  function handleIconError() {
    if (localImage.active) { localView.failed(); return }
    if (localCachedIconUrl) {
      resetLocalCachedIconUrl()
      localIconReady = false
      if (iconBaseState.proxiedHttpIconUrl) {
        cachedIconFailed = true
        fallbackFailed = true
        iconRetry.failed()
      }
      return
    }

    // An uncached HTTP <img> never went through fetchBookmarkIcon. Its error must
    // enter the same recovery path; otherwise only opening the editor can fetch
    // the icon server-side and reset the failed card (Issue #28).
    if (!iconBaseState.hasEmbeddedIcon && iconBaseState.proxiedHttpIconUrl) {
      cachedIconFailed = true
      fallbackFailed = true
      iconRetry.failed()
      return
    }

    if (!cachedIconFailed && (iconBaseState.hasEmbeddedIcon || iconBaseState.shouldUseIconProxy)) {
      cachedIconFailed = true
      if (iconBaseState.shouldUseIconProxy) iconRetry.failed()
      return
    }

    fallbackFailed = true
  }

  function handleIconLoad() {
    if (localIconReady) iconRetry.reset()
    localCachePending = false
    fallbackFailed = false
  }

  function closeContextMenu() {
    contextMenuOpen = false
  }

  function notifyContextMenuOpen() {
    window.dispatchEvent(createBookmarkContextMenuOpenEvent(contextMenuInstanceId))
  }

  function handleContextMenuOpenEvent(event: Event) {
    if (isExternalContextMenuOpenEvent(event, contextMenuInstanceId)) {
      closeContextMenu()
    }
  }

  function handleContextMenu(event: MouseEvent) {
    if (shouldBlockCardNavigation(sortMode) && !onMoveBookmark) {
      event.preventDefault()
      return
    }
    if (!canOpenBookmarkContextMenu({
      sortMode,
      canEdit,
      hasEditHandler: Boolean(onEdit),
      hasMoveHandler: Boolean(onMoveBookmark),
    })) return
    event.preventDefault()
    event.stopPropagation()
    notifyContextMenuOpen()
    contextMenuOpen = true
  }
  function handleMobileMenuClick() {
    if (!canOpenBookmarkContextMenu({
      sortMode,
      canEdit,
      hasEditHandler: Boolean(onEdit),
      hasMoveHandler: Boolean(onMoveBookmark),
    })) return
    notifyContextMenuOpen()
    contextMenuOpen = true
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function openContextMenuFromTouch() {
    if (!canOpenBookmarkContextMenu({
      sortMode,
      canEdit,
      hasEditHandler: Boolean(onEdit),
      hasMoveHandler: Boolean(onMoveBookmark),
    })) return
    contextMenuOpenedAt = Date.now()
    notifyContextMenuOpen()
    contextMenuOpen = true
  }

  function handleTouchStart(event: TouchEvent) {
    if (preview || contextMenuOpen) return
    if (!canOpenBookmarkContextMenu({
      sortMode,
      canEdit,
      hasEditHandler: Boolean(onEdit),
      hasMoveHandler: Boolean(onMoveBookmark),
    })) return
    const touch = event.touches[0]
    if (!touch) return
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    clearLongPress()
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      openContextMenuFromTouch()
    }, LONG_PRESS_MS)
  }

  function handleTouchMove(event: TouchEvent) {
    if (!longPressTimer) return
    const touch = event.touches[0]
    if (!touch) return
    if (Math.abs(touch.clientX - touchStartX) > 10 || Math.abs(touch.clientY - touchStartY) > 10) {
      clearLongPress()
    }
  }

  function handleTouchEnd() {
    clearLongPress()
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }
  async function handleMoveBookmark(categoryId: number): Promise<void> {
    closeContextMenu()
    await onMoveBookmark?.(bookmark, categoryId)
  }

  function withinTouchGuard(): boolean {
    return contextMenuOpenedAt > 0 && Date.now() - contextMenuOpenedAt < TOUCH_CLICK_GUARD_MS
  }

  function handleLinkClick(event: MouseEvent) {
    if (withinTouchGuard()) {
      event.preventDefault()
      return
    }
    if (preview) {
      event.preventDefault()
      return
    }
    if (shouldBlockCardNavigation(sortMode)) {
      event.preventDefault()
      return
    }

    // 本地乐观 +1 + 持久化本地快照 + 异步登记服务端（见 dataService.recordBookmarkClick）
    recordBookmarkClick(bookmark.id)

    if (!shouldOpenBookmarkModal({ sortMode, openMethod: bookmark.open_method })) return
    event.preventDefault()
    modalOpen = true
  }

  function closeModal() {
    modalOpen = false
  }

  function handleWindowClick() {
    if (!contextMenuOpen) return
    if (withinTouchGuard()) return
    closeContextMenu()
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
      window.addEventListener(BOOKMARK_CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = true
      return
    }

    if (!active && windowListenersAttached) {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('keydown', handleDocumentKeydown)
      window.removeEventListener(BOOKMARK_CONTEXT_MENU_OPEN_EVENT, handleContextMenuOpenEvent)
      windowListenersAttached = false
    }
  }

  // 移动按钮：pointerdown / touchstart / click 都要在按钮节点上就地 stopPropagation，
  // 挡住祖先（排序容器）的原生监听与窗口点击关闭；事件属性走根节点委托会晚于它们（同 8g BookmarkContextMenu）。
  const attachMoveTriggerListeners: Attachment<HTMLButtonElement> = (node) => {
    const stop = (event: Event) => event.stopPropagation()
    const offs = [
      on(node, 'pointerdown', stop),
      on(node, 'touchstart', stop),
      on(node, 'click', (event) => {
        event.stopPropagation()
        handleMobileMenuClick()
      }),
    ]
    return () => offs.forEach((off) => off())
  }

  onMount(() => {
    setupIconObserver()
  })

  onDestroy(() => {
    localView.destroy()
    iconRetry.dispose()
    localCacheRequest.current += 1
    disconnectIconObserver()
    resetLocalCachedIconUrl()
    syncWindowListeners(false)
    clearLongPress()
  })
</script>

<div
  class="bookmark-card-shell"
  role="group"
  aria-label={bookmark.title}
  class:is-info={style === 'info'}
  class:is-icon={style !== 'info'}
  class:sort-mode={sortMode}
  style={cardShellStyle}
  bind:this={shellElement}
  class:context-menu-open={contextMenuOpen}
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchEnd}
>
  {#if style === 'info'}
    <BookmarkCardInfo
      {bookmark}
      {sourceCategoryTitle}
      {openInNewTab}
      {sortMode}
      {cardLinkStyle}
      {showDescription}
      {descriptionMode}
      {tooltipText}
      iconUrl={hasRenderableIcon ? iconUrl : ''}
      {iconText}
      {infoIconSize}
      {infoIconStyle}
      {hasCustomIconBackground}
      {preview}
      {themeOverride}
      onLinkClick={handleLinkClick}
      onContextMenu={handleContextMenu}
      onIconError={handleIconError}
      onIconLoad={handleIconLoad}
    />
  {:else}
    <BookmarkCardCompact
      {bookmark}
      {openInNewTab}
      {sortMode}
      tooltipText={sourceCategoryTitle ? tooltipText + '\n来自：' + sourceCategoryTitle : tooltipText}
      {compactIconSize}
      {compactIconStyle}
      {showIconTitle}
      iconUrl={hasRenderableIcon ? iconUrl : ''}
      {iconText}
      {hasCustomIconBackground}
      {preview}
      {themeOverride}
      onLinkClick={handleLinkClick}
      onContextMenu={handleContextMenu}
      onIconError={handleIconError}
      onIconLoad={handleIconLoad}
    />
  {/if}

  {#if sortMode && onMoveBookmark}
    <button
      type="button"
      class="bookmark-mobile-menu-trigger"
      aria-label={`移动「${bookmark.title}」`}
      title="移动"
      {@attach attachMoveTriggerListeners}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" class="bookmark-mobile-menu-icon">
        <path d="M4 5h9M4 12h9M4 19h9M17 8l4 4-4 4M21 12h-8" />
      </svg>
    </button>
  {/if}

  {#if contextMenuOpen && ContextMenuComponent}
    <ContextMenuComponent
      categories={moveCategories}
      currentCategoryId={bookmark.category_id}
      canMove={sortMode}
      onEdit={sortMode ? undefined : handleEditClick}
      onMoveBookmark={onMoveBookmark ? handleMoveBookmark : undefined}
    />
  {/if}

  {#if modalOpen}
    <BookmarkLinkModal title={bookmark.title} url={bookmark.url} onClose={closeModal} />
  {/if}
</div>

<style>
  .bookmark-card-shell {
    position: relative;
    z-index: 0;
    min-width: 0;
    contain: layout style;
  }

  .bookmark-card-shell.context-menu-open {
    z-index: 130;
  }
  .bookmark-mobile-menu-trigger {
    display: none;
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 3;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 10px;
    background: rgb(var(--card-bg-rgb, 255 255 255) / 0.86);
    color: var(--card-text-color, currentColor);
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }

  .bookmark-mobile-menu-icon {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .bookmark-mobile-menu-trigger:focus-visible {
    outline: 3px solid rgb(var(--theme-accent-rgb, 37 99 235) / 0.32);
    outline-offset: 2px;
  }

  @media (max-width: 799px) {
    .bookmark-mobile-menu-trigger {
      display: inline-flex;
    }
  }

  /* Empty-corner hover must not recomposite the glass. Only visible tooltips need promotion;
     :where keeps the explicit context-menu-open layer above them. */
  @media (hover: hover) {
    .bookmark-card-shell:has(> :global(:where(.bookmark-tooltip-anchor:not(.sort-mode):hover))),
    .bookmark-card-shell:has(> :global(:where(.bookmark-tooltip-anchor:not(.sort-mode):focus-visible))) {
      z-index: 1;
    }
  }

  .bookmark-card-shell.is-info {
    width: 100%;
    min-width: var(--card-configured-min-width, 160px);
  }

  .bookmark-card-shell.is-icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 auto;
  }

  @media (max-width: 500px) {
    .bookmark-card-shell.is-info {
      min-width: 0;
    }
  }

</style>
