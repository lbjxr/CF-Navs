<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import Sidebar from '../components/Sidebar.svelte'
  import CategorySection from '../components/CategorySection.svelte'
  import CategoryIcon from '../components/CategoryIcon.svelte'
  import HomeCategoryScope from '../components/HomeCategoryScope.svelte'
  import HomeContentSummary from '../components/HomeContentSummary.svelte'
  import HomeEmptyPanel from '../components/HomeEmptyPanel.svelte'
  import HomeFloatingActions from '../components/HomeFloatingActions.svelte'
  import HomeHeroSearch from '../components/HomeHeroSearch.svelte'
  import type { NavigationSetting, PublicBookmark, PublicCategory, PublicSettings, ThemeMode } from '../../shared/types'
  import {
    bookmarkMatchesSearch,
    clampTitleFontSize,
    createHomeDataMemo,
    getCategoryTreeBookmarkCount,
    getHomeCategoryGroups,
    getHomeScrollTarget,
    getHomeSections,
    getVisibleCategoryIds,
    getVisibleCategoryForest,
    groupBookmarksByCategory,
    normalizeSearchQuery,
    resolveActiveHomeRootId,
    resolveHomeCategoryForRoot,
    resolveHomeActiveSectionId,
    resolveHomeCategorySelection,
  } from '../lib/homeData'

  type AsyncVoid<T = void> = T | Promise<T>
  const SEARCH_FILTER_DEBOUNCE_MS = 120
  const LEFT_NAV_SCROLL_TOP_OFFSET = 80
  const TOP_NAV_SCROLL_TOP_OFFSET = 88
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

  let searchQuery = ''
  let deferredSearchQuery = ''
  let searchFilterTimer: ReturnType<typeof setTimeout> | null = null
  let activeId = ''
  let selectedCategoryIds = new Map<number, number>()
  let persistentLeftExpanded = true
  let contentAnchor: HTMLElement | null = null
  let rootSectionNodes = new Map<number, HTMLElement>()
  let scrollFrame: number | null = null
  let scrollSpySuppressedUntil = 0

  $: sortedCategories = homeData.getSortedCategories(categories)
  $: categoryForest = homeData.getCategoryForest(categories)
  $: sortedBookmarks = homeData.getSortedBookmarks(bookmarks)
  $: allCategoryBookmarks = groupBookmarksByCategory(sortedBookmarks)
  $: navigationSections = getHomeSections(categoryForest, allCategoryBookmarks)
  $: categoryGroups = getHomeCategoryGroups(categoryForest, selectedCategoryIds)
  $: activeId = resolveHomeActiveSectionId(navigationSections, activeId)

  $: if (searchQuery !== deferredSearchQuery) scheduleSearchFilterUpdate(searchQuery)
  $: normalizedSearchQuery = normalizeSearchQuery(deferredSearchQuery)
  $: hasSearchQuery = normalizedSearchQuery.length > 0
  $: categoryTitleById = homeData.getCategoryTitleMap(sortedCategories)
  $: searchTextByBookmarkId = homeData.getSearchIndex(sortedBookmarks, sortedCategories, categoryTitleById)
  $: visibleBookmarks = hasSearchQuery
    ? sortedBookmarks.filter((bookmark) => bookmarkMatchesSearch(bookmark, normalizedSearchQuery, searchTextByBookmarkId))
    : sortedBookmarks
  $: visibleCategoryIds = hasSearchQuery ? getVisibleCategoryIds(visibleBookmarks) : null
  $: visibleCategoryForest = getVisibleCategoryForest(categoryForest, visibleCategoryIds)
  $: visibleCategories = visibleCategoryForest.flatMap((category) => [category, ...category.children])
  $: visibleCategoryBookmarks = groupBookmarksByCategory(visibleBookmarks)

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
  $: pageDescription = totalBookmarks > 0
    ? `已整理 ${sortedCategories.length} 个分类，收录 ${totalBookmarks} 个站点。`
    : '一个简洁的公开导航首页。'

  function scheduleSearchFilterUpdate(value: string): void {
    if (typeof window === 'undefined') {
      deferredSearchQuery = value
      return
    }

    if (searchFilterTimer) window.clearTimeout(searchFilterTimer)
    searchFilterTimer = window.setTimeout(() => {
      searchFilterTimer = null
      deferredSearchQuery = value
    }, SEARCH_FILTER_DEBOUNCE_MS)
  }

  function clearSearchImmediately(): void {
    if (typeof window !== 'undefined' && searchFilterTimer) {
      window.clearTimeout(searchFilterTimer)
      searchFilterTimer = null
    }
    searchQuery = ''
    deferredSearchQuery = ''
  }

  function normalizeSectionId(id: string | number): string {
    const value = String(id)
    return value.startsWith('category-') ? value : `category-${value}`
  }

  function setSelectedCategory(rootId: number, categoryId: string | number): void {
    const next = new Map(selectedCategoryIds)
    next.set(rootId, Number(String(categoryId).replace(/^category-/, '')))
    selectedCategoryIds = next
  }

  function registerRootSection(node: HTMLElement, rootId: number) {
    rootSectionNodes.set(rootId, node)
    scheduleActiveRootUpdate()

    return {
      update(nextRootId: number) {
        if (nextRootId === rootId) return
        rootSectionNodes.delete(rootId)
        rootId = nextRootId
        rootSectionNodes.set(rootId, node)
      },
      destroy() {
        rootSectionNodes.delete(rootId)
      },
    }
  }

  function scheduleActiveRootUpdate(): void {
    if (typeof window === 'undefined' || scrollFrame != null) return
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null
      updateActiveRootFromScroll()
    })
  }

  function updateActiveRootFromScroll(): void {
    if (hasSearchQuery || performance.now() < scrollSpySuppressedUntil || rootSectionNodes.size === 0) return

    const threshold = navigationScrollOffset + 36
    const sectionTops = new Map(
      [...rootSectionNodes].map(([rootId, node]) => [rootId, node.getBoundingClientRect().top]),
    )
    const nextRootId = resolveActiveHomeRootId(sectionTops, threshold)
    if (nextRootId == null) return
    const root = categoryForest.find((category) => category.id === nextRootId)
    if (!root) return
    const selected = resolveHomeCategoryForRoot(root, selectedCategoryIds.get(root.id))
    const nextId = `category-${selected.id}`
    if (nextId !== activeId) activeId = nextId
  }

  async function scrollContentIntoView(): Promise<void> {
    await tick()
    if (!contentAnchor || typeof window === 'undefined') return

    const targetRect = contentAnchor.getBoundingClientRect()
    const finalScroll = getHomeScrollTarget({
      currentScroll: window.scrollY,
      targetTop: targetRect.top,
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      desiredTopDistance: navigationScrollOffset,
    })

    window.scrollTo({ top: finalScroll, behavior: 'smooth' })
  }

  async function handleNavigate(id: string | number): Promise<void> {
    clearSearchImmediately()
    const selection = resolveHomeCategorySelection(categoryForest, normalizeSectionId(id))
    if (!selection.root) return

    const selectedId = selection.child?.id ?? selection.root.id
    setSelectedCategory(selection.root.id, selectedId)
    activeId = `category-${selectedId}`
    scrollSpySuppressedUntil = performance.now() + 900
    await tick()

    const targetNode = rootSectionNodes.get(selection.root.id)
    if (!targetNode || typeof window === 'undefined') {
      await scrollContentIntoView()
      return
    }

    const targetRect = targetNode.getBoundingClientRect()
    const finalScroll = getHomeScrollTarget({
      currentScroll: window.scrollY,
      targetTop: targetRect.top,
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      desiredTopDistance: navigationScrollOffset,
    })
    window.scrollTo({ top: finalScroll, behavior: 'smooth' })
  }

  function handleScopeSelect(rootId: number, categoryId: string | number): void {
    setSelectedCategory(rootId, categoryId)
    activeId = normalizeSectionId(categoryId)
    scrollSpySuppressedUntil = performance.now() + 600
  }

  onMount(() => {
    window.addEventListener('scroll', scheduleActiveRootUpdate, { passive: true })
    scheduleActiveRootUpdate()
  })

  onDestroy(() => {
    if (typeof window !== 'undefined' && searchFilterTimer) {
      window.clearTimeout(searchFilterTimer)
      searchFilterTimer = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', scheduleActiveRootUpdate)
      if (scrollFrame != null) window.cancelAnimationFrame(scrollFrame)
    }
  })
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
    items={navigationSections}
    {activeId}
    {navigation}
    onNavigate={handleNavigate}
    onPersistentExpansionChange={(expanded) => (persistentLeftExpanded = expanded)}
  />

  <div class="content-layout" bind:this={contentAnchor}>
    <main class="content-panel">
      {#if hasSearchQuery}
        <HomeContentSummary
          {hasSearchQuery}
          visibleCategoriesCount={visibleCategories.length}
          {visibleBookmarkCount}
          totalCategories={sortedCategories.length}
          {totalBookmarks}
        />

        {#if visibleCategoryForest.length > 0}
          <div class="search-results" aria-label="搜索结果">
            {#each visibleCategoryForest as category (category.id)}
              <section class="search-category-group" aria-labelledby={`search-category-${category.id}`}>
                <header class="search-group-header">
                  <div class="search-group-title">
                    {#if category.icon}
                      <CategoryIcon category={category} size={38} className="search-category-icon" />
                    {/if}
                    <h2 id={`search-category-${category.id}`}>{category.title}</h2>
                  </div>
                  <span>{getCategoryTreeBookmarkCount(category, visibleCategoryBookmarks)} 个匹配站点</span>
                </header>

                <div class="search-section-list">
                  {#if (visibleCategoryBookmarks.get(category.id)?.length ?? 0) > 0}
                    <CategorySection
                      category={category}
                      bookmarks={visibleCategoryBookmarks.get(category.id) ?? []}
                      level={2}
                      displayTitle="本分类"
                      showCategoryIcon={false}
                      showEmpty={false}
                      canAddBookmark={isAuthenticated}
                      cardWidth={settings?.card_size?.width ?? 80}
                      cardHeight={settings?.card_size?.height ?? 60}
                      cardStyle={settings?.card_style ?? 'info'}
                      cardIconSize={settings?.card_icon_size ?? 60}
                      cardShowDescription={settings?.card_show_description ?? true}
                      cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                      cardIconShowTitle={settings?.card_icon_show_title ?? true}
                      canSort={false}
                      onAddBookmark={onOpenCreateBookmark}
                      onEditBookmark={onEditBookmark}
                      onSortBookmarks={onSortBookmarksInCategory}
                    />
                  {/if}

                  {#each category.children as child (child.id)}
                    <CategorySection
                      category={child}
                      bookmarks={visibleCategoryBookmarks.get(child.id) ?? []}
                      level={2}
                      showEmpty={false}
                      canAddBookmark={isAuthenticated}
                      cardWidth={settings?.card_size?.width ?? 80}
                      cardHeight={settings?.card_size?.height ?? 60}
                      cardStyle={settings?.card_style ?? 'info'}
                      cardIconSize={settings?.card_icon_size ?? 60}
                      cardShowDescription={settings?.card_show_description ?? true}
                      cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                      cardIconShowTitle={settings?.card_icon_show_title ?? true}
                      canSort={false}
                      onAddBookmark={onOpenCreateBookmark}
                      onEditBookmark={onEditBookmark}
                      onSortBookmarks={onSortBookmarksInCategory}
                    />
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else}
          <HomeEmptyPanel {hasSearchQuery} />
        {/if}
      {:else if categoryGroups.length > 0}
        <div class="root-category-list" aria-label="书签分类">
          {#each categoryGroups as group (group.root.id)}
            {@const category = group.root}
            {@const selectedCategory = group.selected}
            {@const selectedBookmarks = allCategoryBookmarks.get(selectedCategory.id) ?? []}
            {@const panelId = `home-category-panel-${category.id}`}
            <section
              class="root-category-group"
              class:has-inline-actions={isAuthenticated}
              data-home-root-id={category.id}
              use:registerRootSection={category.id}
              aria-labelledby={`home-category-heading-${category.id}`}
            >
              <HomeCategoryScope
                rootId={category.id}
                title={category.title}
                icon={category.icon}
                directCount={allCategoryBookmarks.get(category.id)?.length ?? 0}
                totalCount={getCategoryTreeBookmarkCount(category, allCategoryBookmarks)}
                children={category.children.map((child) => ({
                  id: child.id,
                  title: child.title,
                  icon: child.icon,
                  count: allCategoryBookmarks.get(child.id)?.length ?? 0,
                }))}
                activeId={selectedCategory.id}
                {panelId}
                reserveActions={isAuthenticated}
                onSelect={(id) => handleScopeSelect(category.id, id)}
              />

              <div
                id={panelId}
                class="scope-section-list"
                role={category.children.length > 0 ? 'tabpanel' : undefined}
                aria-labelledby={category.children.length > 0 ? `home-category-tab-${selectedCategory.id}` : undefined}
              >
                <CategorySection
                  category={selectedCategory}
                  bookmarks={selectedBookmarks}
                  level={2}
                  showHeading={false}
                  inlineActions={true}
                  showEmpty={true}
                  canAddBookmark={isAuthenticated}
                  cardWidth={settings?.card_size?.width ?? 80}
                  cardHeight={settings?.card_size?.height ?? 60}
                  cardStyle={settings?.card_style ?? 'info'}
                  cardIconSize={settings?.card_icon_size ?? 60}
                  cardShowDescription={settings?.card_show_description ?? true}
                  cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                  cardIconShowTitle={settings?.card_icon_show_title ?? true}
                  canSort={isAuthenticated}
                  onAddBookmark={onOpenCreateBookmark}
                  onEditBookmark={onEditBookmark}
                  onSortBookmarks={onSortBookmarksInCategory}
                />
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <HomeEmptyPanel />
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
    min-height: 100dvh;
    padding: 1.5rem calc(1.5rem + var(--content-margin-x, 0px)) var(--content-margin-bottom, 0%);
    --home-text-color: var(--card-text-color, #0f172a);
    --home-muted-opacity: 0.72;
    --home-stat-bg: rgba(255, 255, 255, 0.5);
    --home-stat-chip-bg: rgba(255, 255, 255, 0.34);
    --home-stat-border: rgba(148, 163, 184, 0.24);
    --home-stat-shadow: 0 3px 10px rgba(15, 23, 42, 0.06);
    --home-accent-color: var(--theme-accent-color, #2563eb);
    --toc-expanded-width: 232px;
    color: var(--home-text-color);
    isolation: isolate;
  }

  .home-shell.top-navigation-layout {
    padding-top: 5.25rem;
  }

  @media (min-width: 800px) {
    .home-shell.persistent-left-navigation {
      padding-left: calc(var(--toc-expanded-width) + 12px + var(--content-margin-x, 0px));
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
    --home-accent-color: var(--theme-accent-color, #7dd3fc);
    color: var(--home-text-color);
  }

  .content-layout {
    position: relative;
    max-width: var(--content-max-width, 1200px);
    margin: 0 auto;
    scroll-margin-top: 6rem;
  }

  .content-panel {
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .scope-section-list,
  .search-results,
  .search-section-list {
    display: flex;
    flex-direction: column;
  }

  .root-category-list {
    display: flex;
    flex-direction: column;
    gap: 2.1rem;
  }

  .root-category-group {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scroll-margin-top: 6rem;
  }

  .scope-section-list {
    gap: 0.95rem;
    outline: none;
  }

  .scope-section-list:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--home-accent-color) 46%, transparent);
    outline-offset: 6px;
    border-radius: 4px;
  }

  .search-results {
    gap: 1.9rem;
  }

  .search-category-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    content-visibility: auto;
    contain-intrinsic-size: auto 420px;
  }

  .search-category-group:hover,
  .search-category-group:focus-within {
    content-visibility: visible;
    contain-intrinsic-size: none;
  }

  .search-group-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.55rem;
    border-bottom: 1px solid color-mix(in srgb, var(--home-text-color) 14%, transparent);
  }

  .search-group-header h2,
  .search-group-header span {
    margin: 0;
    color: var(--home-text-color);
  }

  .search-group-header h2 {
    min-width: 0;
    font-size: 1.28rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .search-group-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
  }

  .search-group-title :global(.search-category-icon) {
    width: 38px;
    height: 38px;
    min-width: 38px;
    border-radius: 9px;
  }

  .search-group-header span {
    flex: 0 0 auto;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    opacity: var(--home-muted-opacity);
  }

  .search-section-list {
    gap: 1.2rem;
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

    .scope-section-list {
      gap: 0.86rem;
    }

    .root-category-list {
      gap: 1.8rem;
    }

    .search-results {
      gap: 1.5rem;
    }

    .search-group-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.3rem;
    }
  }
</style>
