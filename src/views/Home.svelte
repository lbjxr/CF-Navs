<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import Sidebar from '../components/Sidebar.svelte'
  import CategorySection from '../components/CategorySection.svelte'
  import HomeContentSummary from '../components/HomeContentSummary.svelte'
  import HomeEmptyPanel from '../components/HomeEmptyPanel.svelte'
  import HomeFloatingActions from '../components/HomeFloatingActions.svelte'
  import HomeHeroSearch from '../components/HomeHeroSearch.svelte'
  import type { NavigationSetting, PublicBookmark, PublicCategory, PublicSettings, ThemeMode } from '../../shared/types'
  import {
    bookmarkMatchesSearch,
    clampTitleFontSize,
    createHomeDataMemo,
    getHomeSections,
    getHomeSectionsKey,
    getHomeScrollTarget,
    getNearestIntersectingSectionId,
    getVisibleCategoryIds,
    groupBookmarksByCategory,
    normalizeSearchQuery,
    resolveHomeActiveSectionId,
  } from '../lib/homeData'

  type AsyncVoid<T = void> = T | Promise<T>
  const SEARCH_FILTER_DEBOUNCE_MS = 120
  const LEFT_NAV_SCROLL_TOP_OFFSET = 80
  const TOP_NAV_SCROLL_TOP_OFFSET = 88
  const NAV_SCROLL_RELEASE_DELAY_MS = 900
  const homeData = createHomeDataMemo()

  export let categories: PublicCategory[] = []
  export let bookmarks: PublicBookmark[] = []
  export let settings: PublicSettings | null = null
  export let title = ''
  export let isAuthenticated = false
  export let authLoading = false
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined
  export let onSortBookmarksInCategory: ((categoryId: number, orderedIds: number[]) => AsyncVoid) | undefined = undefined
  export let onSwitchToAdmin: (() => AsyncVoid) | undefined = undefined
  export let onLogout: (() => AsyncVoid) | undefined = undefined
  export let onOpenLogin: (() => AsyncVoid) | undefined = undefined
  export let activeTheme: 'light' | 'dark' = 'light'
  export let activeThemeMode: ThemeMode = 'auto'
  export let onToggleTheme: (() => AsyncVoid) | undefined = undefined

  let categoryBookmarks = new Map<number, PublicBookmark[]>()
  let categoryTitleById = new Map<number, string>()
  let searchTextByBookmarkId = new Map<number, string>()
  let sectionElements: HTMLElement[] = []
  let activeId = ''
  let isScrolling = false
  let navigationLayoutReady = false
  let navigationRequestId = 0
  let searchQuery = ''
  let sectionsKey = ''
  let isMounted = false
  let sectionObserver: IntersectionObserver | null = null
  let fallbackScrollTimer: ReturnType<typeof setTimeout> | null = null
  let searchFilterTimer: ReturnType<typeof setTimeout> | null = null
  let navigationReleaseTimer: ReturnType<typeof setTimeout> | null = null
  let usingFallbackScroll = false
  let intersectingSectionTops = new Map<string, number>()
  let deferredSearchQuery = ''
  let trackedNavigationOffset = 0
  let persistentLeftExpanded = true

  $: sortedCategories = homeData.getSortedCategories(categories)
  $: sortedBookmarks = homeData.getSortedBookmarks(bookmarks)
  $: if (searchQuery !== deferredSearchQuery) {
    scheduleSearchFilterUpdate(searchQuery)
  }
  $: normalizedSearchQuery = normalizeSearchQuery(deferredSearchQuery)
  $: hasSearchQuery = normalizedSearchQuery.length > 0
  $: categoryTitleById = homeData.getCategoryTitleMap(sortedCategories)
  $: searchTextByBookmarkId = homeData.getSearchIndex(sortedBookmarks, sortedCategories, categoryTitleById)
  $: visibleBookmarks = hasSearchQuery
    ? sortedBookmarks.filter((bookmark) => bookmarkMatchesSearch(bookmark, normalizedSearchQuery, searchTextByBookmarkId))
    : sortedBookmarks
  $: visibleCategoryIds = hasSearchQuery ? getVisibleCategoryIds(visibleBookmarks) : null
  $: visibleCategories = hasSearchQuery
    ? sortedCategories.filter((category) => visibleCategoryIds?.has(category.id))
    : sortedCategories

  $: categoryBookmarks = groupBookmarksByCategory(visibleBookmarks)
  $: sections = getHomeSections(visibleCategories, categoryBookmarks)
  $: nextSectionsKey = getHomeSectionsKey(sections)
  $: if (nextSectionsKey !== sectionsKey) {
    sectionsKey = nextSectionsKey
    navigationLayoutReady = false
    void refreshSectionElementsAfterRender()
  }

  $: totalBookmarks = sortedBookmarks.length
  $: visibleBookmarkCount = visibleBookmarks.length
  $: pageTitle = title || settings?.site_title || '导航首页'
  $: siteTitleColor = settings?.site_title_color?.trim() || 'inherit'
  $: siteTitleFontSize = clampTitleFontSize(settings?.site_title_font_size)
  $: contentLayout = settings?.content_layout ?? {
    max_width: 1200,
    max_width_unit: 'px',
    margin_x: 0,
    margin_top: 0,
    margin_bottom: 0,
  }
  $: contentMaxWidth = `${contentLayout.max_width}${contentLayout.max_width_unit}`
  $: navigation = settings?.navigation ?? { position: 'left', always_expanded: false } satisfies NavigationSetting
  $: isTopNavigation = navigation.position === 'top'
  $: navigationScrollOffset = isTopNavigation ? TOP_NAV_SCROLL_TOP_OFFSET : LEFT_NAV_SCROLL_TOP_OFFSET
  $: cardTextColor = settings?.card_text_color?.trim() ?? ''
  $: homeShellStyle = [
    `--content-max-width: ${contentMaxWidth}`,
    `--content-margin-x: ${contentLayout.margin_x}px`,
    `--content-margin-top: ${contentLayout.margin_top}%`,
    `--content-margin-bottom: ${contentLayout.margin_bottom}%`,
    cardTextColor ? `--card-text-color: ${cardTextColor}` : '',
  ].filter(Boolean).join('; ')
  $: pageDescription =
    totalBookmarks > 0
      ? `已整理 ${sortedCategories.length} 个分类，收录 ${totalBookmarks} 个站点。`
      : '一个简洁的公开导航首页。'

  $: activeId = resolveHomeActiveSectionId(sections, activeId)
  $: if (isMounted && navigationScrollOffset !== trackedNavigationOffset) {
    setupSectionTracking()
  }

  function scheduleSearchFilterUpdate(value: string) {
    if (typeof window === 'undefined') {
      deferredSearchQuery = value
      return
    }

    if (searchFilterTimer) {
      window.clearTimeout(searchFilterTimer)
    }

    searchFilterTimer = window.setTimeout(() => {
      searchFilterTimer = null
      deferredSearchQuery = value
    }, SEARCH_FILTER_DEBOUNCE_MS)
  }

  function refreshSectionElements() {
    sectionElements = Array.from(document.querySelectorAll<HTMLElement>('[data-section-id]'))
    if (isMounted) setupSectionTracking()
  }

  async function refreshSectionElementsAfterRender() {
    if (typeof document === 'undefined') return
    await tick()
    refreshSectionElements()
  }

  function getSectionId(sectionElement: Element): string {
    return (sectionElement as HTMLElement).dataset.sectionId ?? ''
  }

  function disconnectSectionTracking() {
    sectionObserver?.disconnect()
    sectionObserver = null
    intersectingSectionTops.clear()

    if (typeof window !== 'undefined' && usingFallbackScroll) {
      window.removeEventListener('scroll', handleMainScroll)
      usingFallbackScroll = false
    }

    if (typeof window !== 'undefined' && fallbackScrollTimer) {
      window.clearTimeout(fallbackScrollTimer)
      fallbackScrollTimer = null
    }
  }

  function clearNavigationTimers() {
    if (typeof window === 'undefined') return

    if (navigationReleaseTimer) {
      window.clearTimeout(navigationReleaseTimer)
      navigationReleaseTimer = null
    }
  }

  function setupSectionTracking() {
    if (typeof window === 'undefined') return

    const browserWindow = window
    disconnectSectionTracking()
    trackedNavigationOffset = navigationScrollOffset
    if (sectionElements.length === 0) return

    if (typeof IntersectionObserver !== 'undefined') {
      sectionObserver = new IntersectionObserver(handleSectionIntersections, {
        root: null,
        rootMargin: `-${navigationScrollOffset + 40}px 0px -55% 0px`,
        threshold: [0, 0.01],
      })

      for (const sectionElement of sectionElements) {
        sectionObserver.observe(sectionElement)
      }
      return
    }

    usingFallbackScroll = true
    browserWindow.addEventListener('scroll', handleMainScroll, { passive: true })
    updateActiveSectionFromLayout()
  }

  function handleSectionIntersections(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const sectionId = getSectionId(entry.target)
      if (!sectionId) continue

      if (entry.isIntersecting) {
        intersectingSectionTops.set(sectionId, Math.abs(entry.boundingClientRect.top - navigationScrollOffset))
      } else {
        intersectingSectionTops.delete(sectionId)
      }
    }

    updateActiveSectionFromIntersections()
  }

  function updateActiveSectionFromIntersections() {
    const nextActiveId = getNearestIntersectingSectionId(intersectingSectionTops)
    if (nextActiveId && nextActiveId !== activeId) {
      activeId = nextActiveId
    }
  }

  function updateActiveSectionFromLayout() {
    const threshold = navigationScrollOffset + 60
    let nextActiveId = sectionElements[0]?.dataset.sectionId ?? ''

    for (const sectionElement of sectionElements) {
      if (sectionElement.getBoundingClientRect().top <= threshold) {
        nextActiveId = sectionElement.dataset.sectionId ?? nextActiveId
      }
    }

    activeId = nextActiveId
  }

  function handleMainScroll() {
    if (isScrolling || fallbackScrollTimer) return

    fallbackScrollTimer = window.setTimeout(() => {
      fallbackScrollTimer = null
      updateActiveSectionFromLayout()
    }, 140)
  }

  onMount(() => {
    isMounted = true
    refreshSectionElements()
  })

  onDestroy(() => {
    isMounted = false
    disconnectSectionTracking()
    if (typeof window !== 'undefined' && searchFilterTimer) {
      window.clearTimeout(searchFilterTimer)
      searchFilterTimer = null
    }
    clearNavigationTimers()
  })

  function waitForNextFrame(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }

  async function ensureNavigationLayoutReady(): Promise<void> {
    if (navigationLayoutReady) return

    navigationLayoutReady = true
    await tick()
    await waitForNextFrame()
  }

  function scrollToSection(sectionElement: HTMLElement, behavior: ScrollBehavior): void {
    const targetRect = sectionElement.getBoundingClientRect()
    const finalScroll = getHomeScrollTarget({
      currentScroll: window.scrollY,
      targetTop: targetRect.top,
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      desiredTopDistance: navigationScrollOffset,
    })

    window.scrollTo({
      top: finalScroll,
      behavior,
    })
  }

  async function handleNavigate(id: string | number) {
    clearNavigationTimers()
    const requestId = ++navigationRequestId
    const targetId = String(id)

    isScrolling = true
    activeId = targetId

    await ensureNavigationLayoutReady()
    if (requestId !== navigationRequestId) return

    const targetElement =
      sectionElements.find((sectionElement) => sectionElement.dataset.sectionId === targetId) ??
      document.querySelector<HTMLElement>(`[data-section-id="${targetId}"]`)

    if (!targetElement) {
      isScrolling = false
      return
    }

    scrollToSection(targetElement, 'smooth')

    navigationReleaseTimer = setTimeout(() => {
      navigationReleaseTimer = null
      isScrolling = false
    }, NAV_SCROLL_RELEASE_DELAY_MS)
  }

</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={pageDescription} />
</svelte:head>

<div
  class="home-shell"
  class:top-navigation-layout={isTopNavigation}
  class:persistent-left-navigation={navigation.position === 'left' && navigation.always_expanded && persistentLeftExpanded}
  style={homeShellStyle}
>
  <HomeFloatingActions
    {isAuthenticated}
    {authLoading}
    {activeTheme}
    {activeThemeMode}
    {onToggleTheme}
    {onSwitchToAdmin}
    {onLogout}
    {onOpenLogin}
    topNavigation={isTopNavigation}
  />

  <HomeHeroSearch
    {pageTitle}
    {siteTitleColor}
    {siteTitleFontSize}
    {settings}
    topNavigation={isTopNavigation}
    bind:query={searchQuery}
  />

  <Sidebar
    items={sections}
    {activeId}
    {navigation}
    onNavigate={handleNavigate}
    onPersistentExpansionChange={(expanded) => (persistentLeftExpanded = expanded)}
  />

  <div class="content-layout">
    <main class="content-panel">
      <HomeContentSummary
        {hasSearchQuery}
        visibleCategoriesCount={visibleCategories.length}
        {visibleBookmarkCount}
        totalCategories={sortedCategories.length}
        {totalBookmarks}
      />

      {#if visibleCategories.length > 0}
        <div class="section-list" class:is-navigation-layout-ready={navigationLayoutReady}>
          {#each visibleCategories as category (category.id)}
            <div class="section-shell" data-section-id={`category-${category.id}`}>
              <CategorySection
                category={category}
                bookmarks={categoryBookmarks.get(category.id) ?? []}
                canAddBookmark={isAuthenticated}
                cardWidth={settings?.card_size?.width ?? 80}
                cardHeight={settings?.card_size?.height ?? 60}
                cardStyle={settings?.card_style ?? 'info'}
                cardIconSize={settings?.card_icon_size ?? 60}
                cardShowDescription={settings?.card_show_description ?? true}
                cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                cardIconShowTitle={settings?.card_icon_show_title ?? true}
                canSort={isAuthenticated && !hasSearchQuery}
                onAddBookmark={onOpenCreateBookmark}
                onEditBookmark={onEditBookmark}
                onSortBookmarks={onSortBookmarksInCategory}
              />
            </div>
          {/each}
        </div>
      {:else}
        <HomeEmptyPanel {hasSearchQuery} />
      {/if}
    </main>
  </div>

  {#if settings?.footer_html}
    <footer class="home-footer">
      {@html settings.footer_html}
    </footer>
  {/if}
</div>

<style>
  .home-shell {
    position: relative;
    min-height: 100vh;
    padding: 1.5rem calc(1.5rem + var(--content-margin-x, 0px)) var(--content-margin-bottom, 0%);
    --home-text-color: var(--card-text-color, #0f172a);
    --home-muted-opacity: 0.72;
    --home-stat-bg: rgba(255, 255, 255, 0.5);
    --home-stat-chip-bg: rgba(255, 255, 255, 0.34);
    --home-stat-border: rgba(148, 163, 184, 0.24);
    --home-stat-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
    --home-accent-color: #2563eb;
    color: var(--home-text-color);
    isolation: isolate;
  }

  .home-shell.top-navigation-layout {
    padding-top: 5.25rem;
  }

  @media (min-width: 800px) {
    .home-shell.persistent-left-navigation {
      padding-left: calc(212px + var(--content-margin-x, 0px));
    }
  }

  .home-shell::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -2;
    background: var(--home-background, transparent);
    filter: var(--home-background-filter, none);
    transform: var(--home-background-transform, none);
  }

  .home-shell::after {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: var(--home-background-mask-color, #000000);
    opacity: var(--home-background-mask, 0.3);
  }

  :global([data-theme='dark']) .home-shell {
    --home-text-color: var(--card-text-color, #e5eefb);
    --home-muted-opacity: 0.76;
    --home-stat-bg: rgba(15, 23, 42, 0.38);
    --home-stat-chip-bg: rgba(15, 23, 42, 0.32);
    --home-stat-border: rgba(148, 163, 184, 0.22);
    --home-stat-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
    --home-accent-color: #7dd3fc;
    color: var(--home-text-color);
  }

  :global([data-theme='dark']) .home-shell::after {
    background: var(--home-background-mask-color, #000000);
    opacity: var(--home-background-mask, 0.3);
  }

  .content-panel {
    border-radius: 1.5rem;
    border: none;
    background: transparent;
    backdrop-filter: none;
  }

  :global([data-theme='dark']) .content-panel {
    border-color: transparent;
    background: transparent;
  }

  .content-layout {
    position: relative;
    max-width: var(--content-max-width, 1200px);
    margin: 0 auto;
  }

  .content-panel {
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
    padding: 0;
  }

  .section-list {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .section-shell {
    content-visibility: auto;
    contain-intrinsic-size: auto 420px;
  }

  .section-list.is-navigation-layout-ready .section-shell {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }

  .home-footer {
    max-width: var(--content-max-width, 1200px);
    margin: 2rem auto 0;
    color: inherit;
  }

  @media (max-width: 720px) {
    .home-shell {
      padding: 1rem max(1rem, var(--content-margin-x, 0px)) var(--content-margin-bottom, 0%);
    }

    .home-shell.top-navigation-layout {
      padding-top: 4.5rem;
    }
  }
</style>
