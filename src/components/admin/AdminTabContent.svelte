<script lang="ts">
  import type { ChangePasswordReq } from '../../../shared/types'
  import type { AdminBookmarkSummary, AdminCategorySummary, SettingsFormValue } from '../../lib/appData'
  import type { AdminTab } from '../../lib/adminTypes'
  import type { ImportSource } from '../../lib/importData'
  import type { SortHandler } from '../../lib/sortableList'
  import BackupPanel from '../BackupPanel.svelte'
  import BookmarkListPanel from './BookmarkListPanel.svelte'
  import CategoryListPanel from './CategoryListPanel.svelte'

  type AdminCategory = AdminCategorySummary
  type AdminBookmark = AdminBookmarkSummary
  type AsyncVoid<T = void> = T | Promise<T>
  type SettingsPanelComponent = typeof import('../SettingsPanel.svelte').default

  export let activeTab: AdminTab = 'categories'
  export let isAuthenticated = false
  export let authLoading = false
  export let categories: AdminCategory[] = []
  export let bookmarks: AdminBookmark[] = []
  export let categoriesLoading = false
  export let bookmarksLoading = false
  export let deletingCategoryId: string | number | null = null
  export let deletingBookmarkId: string | number | null = null
  export let settingsPanelComponent: SettingsPanelComponent | null = null
  export let settingsLoading = false
  export let settingsSaving = false
  export let settingsError = ''
  export let settingsValue: Partial<SettingsFormValue> | null = null
  export let importing = false
  export let backupError = ''
  export let backupMessage = ''
  export let importSource: ImportSource = 'cf-navs'

  export let onOpenCreateCategory: (() => AsyncVoid) | undefined = undefined
  export let onEditCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onDeleteCategory: ((category: AdminCategory) => AsyncVoid) | undefined = undefined
  export let onBatchDeleteCategories: ((ids: number[]) => AsyncVoid) | undefined = undefined
  export let onOpenCreateBookmark: ((categoryId?: string | number) => AsyncVoid) | undefined = undefined
  export let onEditBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onDeleteBookmark: ((bookmark: AdminBookmark) => AsyncVoid) | undefined = undefined
  export let onBatchDeleteBookmarks: ((ids: number[]) => AsyncVoid) | undefined = undefined
  export let onSubmitSettings: ((payload: SettingsFormValue) => AsyncVoid) | undefined = undefined
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined
  export let onSortCategories: SortHandler | undefined = undefined
  export let onSortBookmarks: SortHandler | undefined = undefined
  export let onExportData: (() => AsyncVoid) | undefined = undefined
  export let onImportData: ((file: File, source: ImportSource, mode: 'replace' | 'merge') => AsyncVoid) | undefined = undefined
</script>

<div class="admin-content">
  {#if activeTab === 'categories'}
    <CategoryListPanel
      {isAuthenticated}
      {authLoading}
      {categories}
      {bookmarks}
      {categoriesLoading}
      {deletingCategoryId}
      {onOpenCreateCategory}
      {onEditCategory}
      {onDeleteCategory}
      {onBatchDeleteCategories}
      {onOpenCreateBookmark}
      {onSortCategories}
    />
  {:else if activeTab === 'bookmarks'}
    <BookmarkListPanel
      {isAuthenticated}
      {authLoading}
      {categories}
      {bookmarks}
      {bookmarksLoading}
      {deletingBookmarkId}
      {onOpenCreateBookmark}
      {onEditBookmark}
      {onDeleteBookmark}
      {onBatchDeleteBookmarks}
      {onSortBookmarks}
    />
  {:else if activeTab === 'settings'}
    <section class="settings-panel-wrap">
      {#if settingsPanelComponent}
        <svelte:component
          this={settingsPanelComponent}
          value={settingsValue}
          loading={settingsLoading}
          saving={settingsSaving}
          error={settingsError}
          onSubmit={onSubmitSettings}
          onChangePassword={onChangePassword}
        />
      {:else}
        <section class="panel">
          <p class="empty-text">Loading settings...</p>
        </section>
      {/if}
    </section>
  {:else if activeTab === 'backup'}
    <BackupPanel
      {isAuthenticated}
      {importing}
      {backupError}
      {backupMessage}
      bind:importSource
      onExportData={onExportData}
      onImportData={onImportData}
    />
  {/if}
</div>

<style>
  .admin-content {
    flex: 1;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-right: 4px;
  }

  .settings-panel-wrap {
    min-width: 0;
    width: 100%;
    margin: 0 0 24px;
  }

  .panel {
    border: 1px solid var(--admin-border);
    border-radius: 18px;
    padding: 18px;
    background: var(--admin-surface);
    box-shadow: var(--admin-shadow);
  }

  .empty-text {
    margin: 0;
    padding: 24px 0;
    color: var(--admin-subtle);
    line-height: 1.5;
    text-align: center;
  }

  @media (max-width: 960px) {
    .admin-content {
      gap: 16px;
    }
  }
</style>
