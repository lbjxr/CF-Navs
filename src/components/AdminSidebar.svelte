<script lang="ts">
  import type { AdminTab } from '../lib/adminTypes'

  interface AdminSidebarProps {
    activeTab?: AdminTab
    categoriesCount?: number
    bookmarksCount?: number
    onSelect?: ((tab: AdminTab) => void) | undefined
  }

  let {
    activeTab = 'categories',
    categoriesCount = 0,
    bookmarksCount = 0,
    onSelect = undefined,
  }: AdminSidebarProps = $props()

  const items: Array<{ tab: AdminTab; icon: string; label: string }> = [
    { tab: 'categories', icon: '📁', label: '分类管理' },
    { tab: 'bookmarks', icon: '🔖', label: '书签管理' },
    { tab: 'analytics', icon: '📊', label: '访问分析' },
    { tab: 'settings', icon: '⚙️', label: '站点设置' },
    { tab: 'backup', icon: '💾', label: '数据备份与导入' },
  ]
</script>

<nav class="admin-sidebar">
  {#each items as item}
    <button
      type="button"
      class="nav-item"
      class:active={activeTab === item.tab}
      data-testid={`admin-tab-${item.tab}`}
      onclick={() => onSelect?.(item.tab)}
    >
      <span class="nav-icon">
        {#if item.tab === 'categories'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
          </svg>
        {:else if item.tab === 'bookmarks'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
        {:else if item.tab === 'analytics'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        {:else if item.tab === 'settings'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        {:else if item.tab === 'backup'}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        {/if}
      </span>
      <span class="nav-label">{item.label}</span>
      {#if item.tab === 'categories'}
        <span class="nav-badge">{categoriesCount}</span>
      {:else if item.tab === 'bookmarks'}
        <span class="nav-badge">{bookmarksCount}</span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  .admin-sidebar {
    flex-shrink: 0;
    width: 198px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: sticky;
    top: 24px;
    padding: 8px;
    border: 1px solid var(--admin-sidebar-border);
    border-radius: 16px;
    background: var(--admin-sidebar-bg);
    box-shadow: var(--admin-sidebar-shadow);
    backdrop-filter: blur(18px) saturate(1.08);
    -webkit-backdrop-filter: blur(18px) saturate(1.08);
  }

  .nav-item {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--admin-border);
    border-radius: 10px;
    background: var(--admin-nav-bg);
    color: var(--admin-muted);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition:
      border-color var(--transition-base),
      background var(--transition-base),
      color var(--transition-base),
      box-shadow var(--transition-base),
      transform var(--transition-base);
    text-align: left;
  }

  .nav-item:hover {
    background: var(--admin-nav-hover-bg);
    border-color: color-mix(in srgb, var(--admin-accent) 44%, var(--admin-border));
    color: var(--admin-text);
  }

  .nav-item.active {
    background: var(--admin-nav-active-bg);
    border-color: color-mix(in srgb, var(--admin-accent) 56%, var(--admin-border));
    color: var(--admin-accent-strong);
  }

  .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 999px;
    background: var(--admin-accent);
  }

  .nav-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--admin-card-border);
    border-radius: 8px;
    background: var(--admin-icon-badge-bg);
    font-size: 15px;
  }

  .nav-label {
    flex: 1;
  }

  .nav-badge {
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--admin-nav-badge-bg);
    color: var(--admin-subtle);
    font-size: 12px;
    font-weight: 600;
  }

  .nav-item.active .nav-badge {
    background: var(--admin-nav-active-badge-bg);
    color: var(--admin-accent-strong);
  }

  @media (max-width: 960px) {
    .admin-sidebar {
      width: 178px;
      padding: 8px;
    }
  }

  @media (max-width: 700px) {
    .admin-sidebar {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100% !important;
      height: 60px;
      box-sizing: border-box;
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
      z-index: 999;
      padding: 4px 8px max(4px, env(safe-area-inset-bottom));
      margin: 0;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
    }
    .nav-item {
      flex: 1;
      flex-direction: column;
      gap: 2px;
      padding: 4px;
      border: none;
      background: transparent !important;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }
    .nav-item::before {
      display: none !important;
    }
    .nav-label {
      font-size: 10px;
    }
    .nav-badge {
      display: none !important;
    }
    .nav-icon {
      border: none;
      background: transparent;
      width: 22px;
      height: 22px;
      font-size: 14px;
    }
  }
</style>
