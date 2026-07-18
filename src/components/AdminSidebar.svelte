<script lang="ts">
  import type { AdminTab } from '../lib/adminTypes'

  export let activeTab: AdminTab = 'categories'
  export let categoriesCount = 0
  export let bookmarksCount = 0
  export let onSelect: ((tab: AdminTab) => void) | undefined = undefined

  const items: Array<{ tab: AdminTab; icon: string; label: string }> = [
    { tab: 'categories', icon: '📁', label: '分类管理' },
    { tab: 'bookmarks', icon: '🔖', label: '书签管理' },
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
      on:click={() => onSelect?.(item.tab)}
    >
      <span class="nav-icon">{item.icon}</span>
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
    transition: all 0.2s ease;
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

  @media (max-width: 720px) {
    .admin-sidebar {
      position: static;
      width: 100%;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .nav-item {
      min-width: 0;
    }

    .nav-label {
      overflow-wrap: anywhere;
    }
  }
</style>
