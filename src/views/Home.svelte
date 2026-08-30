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
  import type { BookmarkReorganizeReq, NavigationSetting, PublicBookmark, PublicCategory, PublicSettings, ThemeMode } from '../../shared/types'
  import {
    bookmarkMatchesSearch,
    clampTitleFontSize,
    createHomeDataMemo,
    getCategoryTreeBookmarkCount,
    getHomeCategoryGroups,
    getHomeScrollTarget,
    getHomeSections,
    getMostVisitedBookmarks,
    getVisibleCategoryIds,
    getVisibleCategoryForest,
    groupBookmarksByCategory,
    normalizeSearchQuery,
    resolveActiveHomeRootId,
    resolveHomeCategoryForRoot,
    resolveHomeActiveSectionId,
    resolveHomeCategorySelection,
  } from '../lib/homeData'
  import { getErrorMessage } from '../lib/api'
  import { reorderByIds } from '../lib/reorder'
  import type { SortTransfer } from '../lib/sortableList'

  type AsyncVoid<T = void> = T | Promise<T>
  const SEARCH_FILTER_DEBOUNCE_MS = 120
  const LEFT_NAV_SCROLL_TOP_OFFSET = 80
  const TOP_NAV_SCROLL_TOP_OFFSET = 88
  const MOST_VISITED_CATEGORY: PublicCategory = {
    id: -1,
    parent_id: null,
    title: '经常访问',
    icon: '🔥',
    sort: -1,
  }
  const homeData = createHomeDataMemo()

  export let categories: PublicCategory[] = []
  export let bookmarks: PublicBookmark[] = []
  export let settings: PublicSettings | null = null
  export let title = ''
  export let isAuthenticated = false
  export let authLoading = false
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: PublicBookmark) => AsyncVoid) | undefined = undefined
  export let onReorganizeBookmarks: ((categoryOrders: BookmarkReorganizeReq['category_orders']) => AsyncVoid) | undefined = undefined
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
  let homeSortMode = false
  let homeSortSaving = false
  let homeSortDraft: PublicBookmark[] = []
  let homeSortError = ''

  $: sortedCategories = homeData.getSortedCategories(categories)
  $: categoryForest = homeData.getCategoryForest(categories)
  $: sortedBookmarks = homeData.getSortedBookmarks(bookmarks)
  $: allCategoryBookmarks = groupBookmarksByCategory(sortedBookmarks)
  $: displayCategoryBookmarks = homeSortMode ? groupBookmarksByCategory(homeSortDraft) : allCategoryBookmarks
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
  $: mostVisitedBookmarks = hasSearchQuery
    ? []
    : getMostVisitedBookmarks(sortedBookmarks, settings?.most_visited_count ?? 8)

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

  function replaceCategoryOrder(
    draft: PublicBookmark[],
    categoryId: number,
    orderedIds: Array<string | number>,
  ): PublicBookmark[] {
    const categoryItems = draft.filter((bookmark) => bookmark.category_id === categoryId)
    const orderedItems = reorderByIds(categoryItems, orderedIds)
    let index = 0
    return draft.map((bookmark) => (
      bookmark.category_id === categoryId ? orderedItems[index++] : bookmark
    ))
  }

  function startHomeSort(): void {
    if (homeSortMode) return
    homeSortError = ''
    homeSortDraft = [...sortedBookmarks]
    homeSortMode = true
  }

  function cancelHomeSort(): void {
    homeSortMode = false
    homeSortDraft = []
    homeSortError = ''
  }

  function handleHomeSortDraft(categoryId: number, orderedIds: number[]): void {
    if (!homeSortMode) return
    homeSortDraft = replaceCategoryOrder(homeSortDraft, categoryId, orderedIds)
  }

  function handleHomeSortTransfer(transfer: SortTransfer): void {
    if (!homeSortMode || transfer.fromCategoryId == null || transfer.toCategoryId == null) return

    const bookmarkId = Number(transfer.itemId)
    const fromCategoryId = Number(transfer.fromCategoryId)
    const toCategoryId = Number(transfer.toCategoryId)
    let nextDraft = homeSortDraft.map((bookmark) => (
      bookmark.id === bookmarkId
        ? { ...bookmark, category_id: toCategoryId }
        : bookmark
    ))

    nextDraft = replaceCategoryOrder(nextDraft, fromCategoryId, transfer.sourceIds)
    nextDraft = replaceCategoryOrder(nextDraft, toCategoryId, transfer.targetIds)
    homeSortDraft = nextDraft
  }

  async function saveHomeSort(): Promise<void> {
    if (!onReorganizeBookmarks || !homeSortMode) {
      cancelHomeSort()
      return
    }

    homeSortSaving = true
    homeSortError = ''
    try {
      const grouped = groupBookmarksByCategory(homeSortDraft)
      const categoryOrders: BookmarkReorganizeReq['category_orders'] = [...grouped].map(([categoryId, items]) => ({
        category_id: categoryId,
        ids: items.map((item) => item.id),
      }))
      await onReorganizeBookmarks(categoryOrders)
      cancelHomeSort()
    } catch (error) {
      // 整理接口是全量提交，失败说明草稿与服务端集合已不一致：
      // 丢弃草稿退出排序会话，但保留工具条用于展示错误，否则错误没有落点。
      homeSortMode = false
      homeSortDraft = []
      homeSortError = getErrorMessage(error)
    } finally {
      homeSortSaving = false
    }
  }

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
  data-cf-navs-site="1"
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
                    />
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else}
          <HomeEmptyPanel {hasSearchQuery} />
        {/if}
      {:else if mostVisitedBookmarks.length > 0 || categoryGroups.length > 0}
        {#if mostVisitedBookmarks.length > 0}
          <CategorySection
            category={MOST_VISITED_CATEGORY}
            bookmarks={mostVisitedBookmarks}
            showEmpty={false}
            cardWidth={settings?.card_size?.width ?? 80}
            cardHeight={settings?.card_size?.height ?? 60}
            cardStyle={settings?.card_style ?? 'info'}
            cardIconSize={settings?.card_icon_size ?? 60}
            cardShowDescription={settings?.card_show_description ?? true}
            cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
            cardIconShowTitle={settings?.card_icon_show_title ?? true}
            canSort={false}
            onEditBookmark={onEditBookmark}
          />
        {/if}
        {#if categoryGroups.length > 0}
          <div class="root-category-list" aria-label="书签分类">
          {#each categoryGroups as group (group.root.id)}
            {@const category = group.root}
            {@const selectedCategory = group.selected}
            {@const selectedBookmarks = displayCategoryBookmarks.get(selectedCategory.id) ?? []}
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
                {#if homeSortMode}
                  <!-- 排序时展开同一主分类下的所有层级，主分类和子分类都成为独立投放区。 -->
                  <div class="sort-category-list" aria-label={`${category.title} 下的分类排序`}>
                    <CategorySection
                      category={category}
                      bookmarks={displayCategoryBookmarks.get(category.id) ?? []}
                      level={1}
                      showEmpty={true}
                      canAddBookmark={false}
                      cardWidth={settings?.card_size?.width ?? 80}
                      cardHeight={settings?.card_size?.height ?? 60}
                      cardStyle={settings?.card_style ?? 'info'}
                      cardIconSize={settings?.card_icon_size ?? 60}
                      cardShowDescription={settings?.card_show_description ?? true}
                      cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                      cardIconShowTitle={settings?.card_icon_show_title ?? true}
                      canSort={false}
                      controlledSortMode={homeSortMode}
                      sortGroup="home-bookmark-categories"
                      sortCategoryId={category.id}
                      showSortActions={false}
                      showSortSessionLabel={false}
                      onEditBookmark={onEditBookmark}
                      onCancelSortSession={cancelHomeSort}
                      onSaveSortSession={saveHomeSort}
                      onSortDraft={handleHomeSortDraft}
                      onSortTransfer={handleHomeSortTransfer}
                    />
                    {#each category.children as child (child.id)}
                      <CategorySection
                        category={child}
                        bookmarks={displayCategoryBookmarks.get(child.id) ?? []}
                        level={2}
                        showEmpty={true}
                        canAddBookmark={false}
                        cardWidth={settings?.card_size?.width ?? 80}
                        cardHeight={settings?.card_size?.height ?? 60}
                        cardStyle={settings?.card_style ?? 'info'}
                        cardIconSize={settings?.card_icon_size ?? 60}
                        cardShowDescription={settings?.card_show_description ?? true}
                        cardDescriptionMode={settings?.card_description_mode ?? (settings?.card_show_description === false ? 'hidden' : 'always')}
                        cardIconShowTitle={settings?.card_icon_show_title ?? true}
                        canSort={false}
                        controlledSortMode={homeSortMode}
                        sortGroup="home-bookmark-categories"
                        sortCategoryId={child.id}
                        showSortActions={false}
                        showSortSessionLabel={false}
                        onEditBookmark={onEditBookmark}
                        onCancelSortSession={cancelHomeSort}
                        onSaveSortSession={saveHomeSort}
                        onSortDraft={handleHomeSortDraft}
                        onSortTransfer={handleHomeSortTransfer}
                      />
                    {/each}
                  </div>
                {:else}
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
                    controlledSortMode={homeSortMode}
                    sortGroup="home-bookmark-categories"
                    sortCategoryId={selectedCategory.id}
                    showSortActions={false}
                    onAddBookmark={onOpenCreateBookmark}
                    onEditBookmark={onEditBookmark}
                    onRequestSort={startHomeSort}
                    onCancelSortSession={cancelHomeSort}
                    onSaveSortSession={saveHomeSort}
                    onSortDraft={handleHomeSortDraft}
                    onSortTransfer={handleHomeSortTransfer}
                  />
                {/if}
              </div>
            </section>
            {/each}
          </div>
        {/if}
      {:else}
        <HomeEmptyPanel />
      {/if}
    </main>
  </div>

  {#if homeSortMode || homeSortError}
    <div class="home-sort-bar" role="toolbar" aria-label="跨分类排序操作">
      {#if homeSortError}
        <span class="home-sort-error" role="alert">保存排序失败：{homeSortError}</span>
        <button type="button" class="home-sort-cancel" on:click={cancelHomeSort}>关闭</button>
      {:else}
        <span>正在排序：可将书签拖到其他分类，完成后保存。</span>
        <button type="button" class="home-sort-cancel" on:click={cancelHomeSort} disabled={homeSortSaving}>取消</button>
        <button type="button" class="home-sort-save" on:click={saveHomeSort} disabled={homeSortSaving}>
          {homeSortSaving ? '保存中…' : '保存排序'}
        </button>
      {/if}
    </div>
  {/if}

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

  .sort-category-list {
    display: flex;
    flex-direction: column;
    gap: 1.45rem;
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

  .home-sort-bar {
    position: fixed;
    z-index: 20;
    left: 50%;
    bottom: 1.1rem;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.55rem;
    max-width: calc(100vw - 2rem);
    padding: 0.55rem 0.65rem 0.55rem 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.62);
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.72);
    color: var(--home-text-color, #0f172a);
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(14px);
    font-size: 0.84rem;
    font-weight: 650;
  }

  .home-sort-bar button {
    min-height: 2rem;
    padding: 0.3rem 0.72rem;
    border: 1px solid rgba(148, 163, 184, 0.38);
    border-radius: 0.6rem;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .home-sort-cancel {
    background: rgba(255, 255, 255, 0.5);
  }

  .home-sort-error {
    color: #b42318;
  }

  :global([data-theme='dark']) .home-sort-error {
    color: #fca5a5;
  }

  .home-sort-save {
    border-color: rgba(14, 165, 233, 0.38) !important;
    background: #0ea5e9;
    color: white !important;
  }

  .home-sort-bar button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  :global([data-theme='dark']) .home-sort-bar {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.86);
  }

  .home-footer {
    max-width: var(--content-max-width, 1200px);
    margin: 2rem auto 0;
    color: inherit;
  }

  @media (max-width: 720px) {
    .home-shell {
      padding: 1rem 1rem var(--content-margin-bottom, 0%);
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
