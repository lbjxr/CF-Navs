<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import type { PublicBookmark, PublicCategory } from '../../shared/types'
  import {
    bookmarkMatchesSearch,
    buildSearchIndex,
    getMostVisitedBookmarks,
    normalizeSearchQuery,
  } from '../lib/homeData'
  import { setPageScrollLocked } from '../lib/pageScrollLock'
  import { publicStore } from '../lib/stores'
  import { api } from '../lib/api'
  import SpotlightBookmarkIcon from './SpotlightBookmarkIcon.svelte'

  export let open = false
  export let bookmarks: PublicBookmark[] = []
  export let categories: PublicCategory[] = []
  export let onClose: (() => void) | undefined = undefined
  export let onViewBookmark: ((bookmark: PublicBookmark) => void) | undefined = undefined

  const RESULT_LIMIT = 50
  const MOST_VISITED_LIMIT = 8

  let query = ''
  let activeIndex = 0
  let inputEl: HTMLInputElement | null = null
  let dialogEl: HTMLElement | null = null
  let previousActiveElement: HTMLElement | null = null
  let wasOpen = false

  // 索引只随 bookmarks/categories 变化重建，不随每次输入（即时过滤，不防抖：面板 ≤50 行开销极小）。
  $: categoryTitles = new Map(categories.map((category) => [category.id, category.title]))
  $: searchIndex = buildSearchIndex(bookmarks, categoryTitles)
  $: normalizedQuery = normalizeSearchQuery(query)
  $: isEmptyQuery = normalizedQuery.length === 0
  $: matched = isEmptyQuery
    ? []
    : bookmarks.filter((bookmark) => bookmarkMatchesSearch(bookmark, normalizedQuery, searchIndex))
  $: results = isEmptyQuery
    ? getMostVisitedBookmarks(bookmarks, MOST_VISITED_LIMIT)
    : matched.slice(0, RESULT_LIMIT)
  $: overflowCount = isEmptyQuery ? 0 : Math.max(0, matched.length - RESULT_LIMIT)
  // 结果变化后把高亮夹回有效范围，避免 aria-activedescendant 指向已消失项。
  $: if (activeIndex >= results.length) activeIndex = 0

  // 只在 open 状态翻转时执行副作用，避免响应式重复触发。
  $: if (open !== wasOpen) {
    wasOpen = open
    if (open) void handleOpened()
    else handleClosed()
  }

  async function handleOpened(): Promise<void> {
    previousActiveElement = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    query = ''
    activeIndex = 0
    setPageScrollLocked(true)
    await tick()
    inputEl?.focus()
  }

  function handleClosed(): void {
    setPageScrollLocked(false)
    query = ''
    activeIndex = 0
    previousActiveElement?.focus?.()
    previousActiveElement = null
  }

  onDestroy(() => setPageScrollLocked(false))

  function openBookmarkFromSearch(bookmark: PublicBookmark): void {
    // 与首页卡片一致地登记访问计数，否则 Spotlight 打开会漏计。
    publicStore.incrementClick(bookmark.id)
    void api.public.registerClick(bookmark.id).catch(() => undefined)

    // open_method: 1=新窗口 2=当前页 3=当前页弹层（复用 App 持有的 BookmarkLinkModal）
    if (bookmark.open_method === 3) {
      onClose?.()
      onViewBookmark?.(bookmark)
      return
    }
    if (bookmark.open_method === 2) {
      onClose?.()
      if (typeof window !== 'undefined') window.location.assign(bookmark.url)
      return
    }
    if (typeof window !== 'undefined') window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    onClose?.()
  }

  function focusableElements(): HTMLElement[] {
    if (!dialogEl) return []
    const nodes = dialogEl.querySelectorAll<HTMLElement>(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    )
    return Array.from(nodes).filter((node) => !node.hasAttribute('disabled'))
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.key === 'Process') return

    if (event.key === 'Escape') {
      event.preventDefault()
      onClose?.()
      return
    }

    if (event.key === 'Tab') {
      const list = focusableElements()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      return
    }

    if (results.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeIndex = (activeIndex + 1) % results.length
      void scrollActiveOptionIntoView()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeIndex = (activeIndex - 1 + results.length) % results.length
      void scrollActiveOptionIntoView()
    } else if (event.key === 'Home') {
      event.preventDefault()
      activeIndex = 0
      void scrollActiveOptionIntoView()
    } else if (event.key === 'End') {
      event.preventDefault()
      activeIndex = results.length - 1
      void scrollActiveOptionIntoView()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const bookmark = results[activeIndex]
      if (bookmark) openBookmarkFromSearch(bookmark)
    }
  }

  function categoryTitle(categoryId: number): string {
    return categoryTitles.get(categoryId) ?? ''
  }

  // 键盘导航把高亮项滚入可视区（对齐 Sidebar/CategoryTreeSelect 的 scrollIntoView 用法）。
  // aria-activedescendant 模式下焦点始终在输入框，浏览器不会自动跟随高亮，需手动滚动。
  async function scrollActiveOptionIntoView(): Promise<void> {
    await tick()
    const option = dialogEl?.querySelector<HTMLElement>(`#spotlight-opt-${activeIndex}`)
    option?.scrollIntoView({ block: 'nearest' })
  }

</script>

{#if open}
  <!-- scrim：点击遮罩关闭；对齐 ConfirmDialog 的居中+模糊形态 -->
  <div class="spotlight-scrim">
    <button type="button" class="spotlight-backdrop" aria-label="关闭搜索" on:click={() => onClose?.()}></button>
    <div
      class="spotlight-panel"
      role="dialog"
      aria-modal="true"
      aria-label="搜索书签"
      tabindex="-1"
      bind:this={dialogEl}
      on:keydown={handleKeydown}
    >
      <div class="spotlight-input-row">
        <svg class="spotlight-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          class="spotlight-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="spotlight-listbox"
          aria-activedescendant={results.length ? `spotlight-opt-${activeIndex}` : undefined}
          aria-label="搜索书签关键词"
          placeholder="搜索书签…"
          autocomplete="off"
          spellcheck="false"
        />
        {#if isEmptyQuery}
          <span class="spotlight-scope">常用书签</span>
        {/if}
      </div>

      <ul class="spotlight-results" id="spotlight-listbox" role="listbox" aria-label="搜索结果">
        {#each results as bookmark, index (bookmark.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- 键盘导航走 combobox（输入框）的 aria-activedescendant + ↑↓/Enter；option 的点击只是鼠标快捷方式 -->
          <li
            id={`spotlight-opt-${index}`}
            class="spotlight-option"
            class:active={index === activeIndex}
            role="option"
            aria-selected={index === activeIndex}
            on:click={() => openBookmarkFromSearch(bookmark)}
            on:mouseenter={() => (activeIndex = index)}
          >
            <SpotlightBookmarkIcon {bookmark} />
            <span class="spotlight-option-main">
              <span class="spotlight-option-title">{bookmark.title}</span>
              <span class="spotlight-option-sub">{categoryTitle(bookmark.category_id) || bookmark.url}</span>
            </span>
          </li>
        {/each}
        {#if results.length === 0}
          <li class="spotlight-empty" role="option" aria-selected="false" aria-disabled="true">
            {isEmptyQuery ? '输入关键词以搜索书签' : '没有匹配的书签'}
          </li>
        {/if}
        {#if overflowCount > 0}
          <li class="spotlight-more" aria-hidden="true">— 还有 {overflowCount} 条 · 上限 {RESULT_LIMIT} —</li>
        {/if}
      </ul>

      <div class="spotlight-footer">
        <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .spotlight-scrim {
    position: fixed;
    inset: 0;
    z-index: 240;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 15vh 16px 16px;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(10px) saturate(1.08);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    overscroll-behavior: contain;
  }

  .spotlight-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .spotlight-panel {
    /* 默认亮色；深色由 [data-theme='dark'] 覆盖（对齐 ConfirmDialog 的变量主题模式）。 */
    --spotlight-surface: rgba(255, 255, 255, 0.97);
    --spotlight-text: #0f172a;
    --spotlight-muted: #64748b;
    --spotlight-border: rgba(226, 232, 240, 0.9);
    --spotlight-divider: rgba(148, 163, 184, 0.24);
    --spotlight-accent: #2563eb;
    --spotlight-placeholder: #94a3b8;
    --spotlight-active-bg: rgba(37, 99, 235, 0.12);
    --spotlight-active-outline: rgba(37, 99, 235, 0.42);
    --spotlight-scope-bg: rgba(37, 99, 235, 0.1);
    --spotlight-scope-border: rgba(37, 99, 235, 0.28);
    --spotlight-shadow: 0 28px 70px rgba(15, 23, 42, 0.28);
    position: relative;
    width: min(560px, 100%);
    max-height: min(70vh, 560px);
    display: flex;
    flex-direction: column;
    background: var(--spotlight-surface);
    color: var(--spotlight-text);
    border: 1px solid var(--spotlight-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--spotlight-shadow);
    overflow: hidden;
  }

  :global([data-theme='dark']) .spotlight-panel {
    --spotlight-surface: #1e293b;
    --spotlight-text: #e5eefb;
    --spotlight-muted: #8fa1bd;
    --spotlight-border: rgba(148, 163, 184, 0.25);
    --spotlight-divider: rgba(148, 163, 184, 0.18);
    --spotlight-accent: #93c5fd;
    --spotlight-placeholder: #7d8ca6;
    --spotlight-active-bg: rgba(37, 99, 235, 0.28);
    --spotlight-active-outline: rgba(96, 165, 250, 0.55);
    --spotlight-scope-bg: rgba(96, 165, 250, 0.16);
    --spotlight-scope-border: rgba(96, 165, 250, 0.35);
    --spotlight-shadow: 0 28px 70px rgba(15, 23, 42, 0.5);
  }

  .spotlight-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 15px 16px 13px;
    border-bottom: 1px solid var(--spotlight-divider);
  }

  .spotlight-search-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    fill: none;
    stroke: var(--spotlight-accent);
    stroke-width: 2;
    stroke-linecap: round;
  }

  .spotlight-input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--spotlight-text);
    font-size: 15px;
  }

  .spotlight-input::placeholder {
    color: var(--spotlight-placeholder);
  }

  .spotlight-scope {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--spotlight-accent);
    background: var(--spotlight-scope-bg);
    border: 1px solid var(--spotlight-scope-border);
    border-radius: var(--radius-pill);
    padding: 2px 9px;
  }

  .spotlight-results {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow-y: auto;
  }

  .spotlight-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 10px;
    border-radius: var(--radius-lg);
    cursor: pointer;
  }

  .spotlight-option.active {
    background: var(--spotlight-active-bg);
    outline: 1px solid var(--spotlight-active-outline);
  }


  .spotlight-option-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .spotlight-option-title,
  .spotlight-option-sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .spotlight-option-title {
    font-size: 13.5px;
    font-weight: 500;
  }

  .spotlight-option-sub {
    font-size: 11px;
    color: var(--spotlight-muted);
  }

  .spotlight-empty {
    list-style: none;
    padding: 18px 10px;
    text-align: center;
    color: var(--spotlight-muted);
    font-size: 13px;
  }

  .spotlight-more {
    list-style: none;
    padding: 8px 0 6px;
    text-align: center;
    color: var(--spotlight-muted);
    font-size: 11px;
  }

  .spotlight-footer {
    border-top: 1px solid var(--spotlight-divider);
    padding: 9px 14px;
    font-size: 11px;
    color: var(--spotlight-muted);
  }
</style>
