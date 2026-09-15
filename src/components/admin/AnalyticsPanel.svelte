<script lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../../lib/appData'
  import {
    clampAdminListPage,
    createAdminListPage,
    getAdminCategoryPathMap,
    getAdminListTotalPages,
  } from '../../lib/adminListState'
  import { getBookmarkFallbackIcon, getBookmarkIconUrl, hasBookmarkImageIcon } from '../../lib/bookmarkIconDisplay'
  import { iconAccessKey, withIconAccessKey } from '../../lib/iconAccessKey'
  import { truncateUnicodeText } from '../../lib/truncateUnicodeText'
  import CachedBookmarkIcon from '../CachedBookmarkIcon.svelte'
  import './adminListPanels.css'

  type AdminBookmark = AdminBookmarkSummary
  type AdminCategory = AdminCategorySummary

  export let bookmarks: AdminBookmark[] = []
  export let categories: AdminCategory[] = []

  let zeroVisitPage = 1

  $: sortedBookmarks = [...bookmarks]
    .sort((a, b) => (b.click_count ?? 0) - (a.click_count ?? 0))

  $: topBookmarks = sortedBookmarks.slice(0, 20).filter(b => (b.click_count ?? 0) > 0)
  $: zeroVisitBookmarks = bookmarks.filter(b => (b.click_count ?? 0) === 0)
  $: categoryTitleById = getAdminCategoryPathMap(categories)
  $: zeroVisitTotalPages = getAdminListTotalPages(zeroVisitBookmarks.length)
  $: zeroVisitPage = clampAdminListPage(zeroVisitPage, zeroVisitTotalPages)
  $: zeroVisitListPage = createAdminListPage(zeroVisitBookmarks, zeroVisitPage)

  $: totalClicks = bookmarks.reduce((acc, curr) => acc + (curr.click_count ?? 0), 0)
  $: clickedCount = bookmarks.filter(b => (b.click_count ?? 0) > 0).length

  $: maxClicks = topBookmarks[0]?.click_count ?? 1

</script>

<div class="admin-list-view">
  <!-- 统计指标卡片 -->
  <section class="admin-status-panel">
    <div class="admin-status-item">
      <span class="admin-status-label">总点击次数</span>
      <p style="font-size: 28px; font-weight: 700; color: var(--admin-accent); margin: 0;">{totalClicks}</p>
    </div>
    <div class="admin-status-item">
      <span class="admin-status-label">已访问书签数</span>
      <p style="font-size: 28px; font-weight: 700; color: var(--admin-ok); margin: 0;">{clickedCount} <span style="font-size: 14px; font-weight: normal; color: var(--admin-subtle);">/ {bookmarks.length}</span></p>
    </div>
    <div class="admin-status-item">
      <span class="admin-status-label">零访问书签数</span>
      <p style="font-size: 28px; font-weight: 700; color: var(--admin-danger); margin: 0;">{zeroVisitBookmarks.length}</p>
    </div>
  </section>

  <!-- 排行榜与冷门分析 -->
  <div class="analytics-grids">
    <!-- Top 20 热点排行 -->
    <section class="admin-list-panel">
      <div class="admin-list-panel-header">
        <div>
          <p class="admin-panel-eyebrow">排行榜</p>
          <h2>最常访问 Top 20</h2>
        </div>
      </div>
      <div class="admin-panel-scroll-body" style="padding: 16px 20px;">
        {#if topBookmarks.length === 0}
          <div class="admin-empty-state" style="min-height: 150px;">
            <span class="admin-empty-state-icon">🔥</span>
            <h3>暂无点击数据</h3>
            <p>点击首页的书签后，这里将会展示访问排行。</p>
          </div>
        {:else}
          <div class="top-list">
            {#each topBookmarks as bookmark, i}
              <div class="top-item">
                <div class="top-item-rank">{i + 1}</div>
                <span class="admin-icon-badge small" style={bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}>
                  {#if hasBookmarkImageIcon(bookmark)}
                    <CachedBookmarkIcon
                      id={bookmark.id}
                      icon={bookmark.icon ?? ''}
                      iconSource={bookmark.icon_source}
                      iconBlob={bookmark.icon_blob ?? ''}
                      src={withIconAccessKey(getBookmarkIconUrl(bookmark), $iconAccessKey)}
                      alt=""
                      fallback={getBookmarkFallbackIcon(bookmark)}
                      style="width: 100%; height: 100%; object-fit: contain;"
                    />
                  {:else}
                    {getBookmarkFallbackIcon(bookmark)}
                  {/if}
                </span>
                <div class="top-item-info">
                  <div class="top-item-meta">
                    <strong>{bookmark.title}</strong>
                    <span class="top-item-cat">{categoryTitleById.get(bookmark.category_id) ?? '未知分类'}</span>
                  </div>
                  <div class="progress-bar-wrap">
                    <div class="progress-bar" style="width: {((bookmark.click_count ?? 0) / maxClicks) * 100}%;"></div>
                  </div>
                </div>
                <div class="top-item-clicks">{bookmark.click_count} 次点击</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <!-- 零访问冷门书签 -->
    <section class="admin-list-panel zero-visit-panel">
      <div class="admin-list-panel-header">
        <div>
          <p class="admin-panel-eyebrow">冷门分析</p>
          <h2>零访问书签</h2>
        </div>
      </div>
      <div class="admin-panel-scroll-body zero-visit-scroll-body">
        {#if zeroVisitBookmarks.length === 0}
          <div class="admin-empty-state" style="min-height: 150px;">
            <span class="admin-empty-state-icon">🎉</span>
            <h3>非常棒！</h3>
            <p>所有的书签都至少被访问过一次。</p>
          </div>
        {:else}
          <div class="zero-list">
            {#each zeroVisitListPage.items as bookmark}
              <div class="zero-item">
                <span class="admin-icon-badge small" style={bookmark.icon_background_color ? `background: ${bookmark.icon_background_color};` : ''}>
                  {#if hasBookmarkImageIcon(bookmark)}
                    <CachedBookmarkIcon
                      id={bookmark.id}
                      icon={bookmark.icon ?? ''}
                      iconSource={bookmark.icon_source}
                      iconBlob={bookmark.icon_blob ?? ''}
                      src={withIconAccessKey(getBookmarkIconUrl(bookmark), $iconAccessKey)}
                      alt=""
                      fallback={getBookmarkFallbackIcon(bookmark)}
                      style="width: 100%; height: 100%; object-fit: contain;"
                    />
                  {:else}
                    {getBookmarkFallbackIcon(bookmark)}
                  {/if}
                </span>
                <div class="zero-item-info">
                  <strong title={bookmark.title} aria-label={bookmark.title}>{truncateUnicodeText(bookmark.title, 20)}</strong>
                  <span class="zero-item-cat">{categoryTitleById.get(bookmark.category_id) ?? '未知分类'}</span>
                  <a href={bookmark.url} target="_blank" rel="noreferrer" class="zero-item-url" title={bookmark.url} aria-label={`打开 ${bookmark.url}`}>
                    {truncateUnicodeText(bookmark.url, 20)}
                  </a>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
      {#if zeroVisitBookmarks.length > 0}
        <div class="admin-panel-footer">
          <div class="admin-pagination">
            <span>第 {zeroVisitListPage.start}-{zeroVisitListPage.end} 条 / 共 {zeroVisitListPage.total} 条</span>
            <div class="admin-pager-actions">
              <button type="button" class="admin-ghost-button compact" on:click={() => zeroVisitPage -= 1} disabled={zeroVisitPage <= 1}>上一页</button>
              <span>{zeroVisitPage} / {zeroVisitTotalPages}</span>
              <button type="button" class="admin-ghost-button compact" on:click={() => zeroVisitPage += 1} disabled={zeroVisitPage >= zeroVisitTotalPages}>下一页</button>
            </div>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .zero-visit-panel {
    height: min(760px, calc(100vh - 220px));
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
  }

  .zero-visit-scroll-body {
    padding: 16px 20px;
    overflow: auto;
  }

  .analytics-grids {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 1024px) {
    .analytics-grids {
      grid-template-columns: 1fr;
    }
  }

  .top-list, .zero-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .top-item, .zero-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 12px;
    border: 1px solid var(--admin-border);
    background: var(--admin-card-bg);
  }

  .top-item-rank {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    border-radius: 50%;
    background: var(--admin-nav-badge-bg);
    color: var(--admin-subtle);
  }

  .top-item:nth-child(1) .top-item-rank {
    background: rgba(239, 68, 68, 0.15);
    color: rgb(239, 68, 68);
  }
  .top-item:nth-child(2) .top-item-rank {
    background: rgba(249, 115, 22, 0.15);
    color: rgb(249, 115, 22);
  }
  .top-item:nth-child(3) .top-item-rank {
    background: rgba(234, 179, 8, 0.15);
    color: rgb(234, 179, 8);
  }

  .top-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .top-item-meta, .zero-item-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .top-item-meta strong, .zero-item-info strong {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .top-item-cat, .zero-item-cat {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--admin-badge-bg);
    color: var(--admin-badge-text);
  }

  .progress-bar-wrap {
    height: 6px;
    border-radius: 3px;
    background: var(--admin-border);
    overflow: hidden;
    width: 100%;
  }

  .progress-bar {
    height: 100%;
    border-radius: 3px;
    background: var(--admin-accent);
    transition: width var(--transition-base);
  }

  .top-item-clicks {
    font-size: 12px;
    color: var(--admin-subtle);
    white-space: nowrap;
  }

  .zero-item-info {
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    overflow: hidden;
  }

  .zero-item-info strong {
    max-width: 100%;
  }

  .zero-item-url {
    display: block;
    min-width: 0;
    font-size: 12px;
    color: var(--admin-subtle);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .zero-item-url:hover {
    color: var(--admin-accent);
    text-decoration: underline;
  }
</style>
