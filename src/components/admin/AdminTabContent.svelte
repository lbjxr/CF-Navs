<script lang="ts">
  import type { AsyncVoid, BookmarkBatchMoveReq, ChangePasswordReq } from '../../../shared/types'
  import BackupPanel from '../BackupPanel.svelte'
  import BookmarkListPanel from './BookmarkListPanel.svelte'
  import CategoryListPanel from './CategoryListPanel.svelte'
  import AnalyticsPanel from './AnalyticsPanel.svelte'
  import type { BackupSelection } from '../../lib/appBackup'
  import type { AdminBookmarkSummary, AdminCategorySummary, SettingsFormValue } from '../../lib/appData'
  import type { AdminTab, CategorySortHandler } from '../../lib/adminTypes'
  import type { ImportSource } from '../../lib/importData'
  import type { SortHandler } from '../../lib/sortableList'

  type AdminCategory = AdminCategorySummary
  type AdminBookmark = AdminBookmarkSummary
  type SettingsPanelComponent = typeof import('../SettingsPanel.svelte').default

  interface AdminTabContentProps {
    activeTab?: AdminTab
    isAuthenticated?: boolean
    authLoading?: boolean
    categories?: AdminCategory[]
    bookmarks?: AdminBookmark[]
    categoriesLoading?: boolean
    bookmarksLoading?: boolean
    deletingCategoryId?: string | number | null
    deletingBookmarkId?: string | number | null
    settingsPanelComponent?: SettingsPanelComponent | null
    settingsLoading?: boolean
    settingsSaving?: boolean
    settingsError?: string
    settingsValue?: Partial<SettingsFormValue> | null
    importing?: boolean
    exporting?: boolean
    backupError?: string
    backupMessage?: string
    /** 双向绑定：导入来源，由 BackupPanel 经 bind:importSource 回写 */
    importSource?: ImportSource
    onOpenCreateCategory?: (() => AsyncVoid) | undefined
    onEditCategory?: ((category: AdminCategory) => AsyncVoid) | undefined
    onDeleteCategory?: ((category: AdminCategory) => AsyncVoid) | undefined
    onBatchDeleteCategories?: ((ids: number[]) => AsyncVoid) | undefined
    onOpenCreateBookmark?: ((categoryId?: string | number) => AsyncVoid) | undefined
    onEditBookmark?: ((bookmark: AdminBookmark) => AsyncVoid) | undefined
    onDeleteBookmark?: ((bookmark: AdminBookmark) => AsyncVoid) | undefined
    onBatchDeleteBookmarks?: ((ids: number[]) => AsyncVoid) | undefined
    onBatchMoveBookmarks?: ((payload: BookmarkBatchMoveReq) => AsyncVoid) | undefined
    onSubmitSettings?: ((payload: SettingsFormValue) => AsyncVoid) | undefined
    onVerifyDevice?: (() => Promise<void>) | undefined
    onChangePassword?: ((payload: ChangePasswordReq) => AsyncVoid) | undefined
    onSortCategories?: CategorySortHandler | undefined
    onSortBookmarks?: SortHandler | undefined
    onExportData?: ((selection: BackupSelection) => AsyncVoid) | undefined
    onImportData?: ((file: File, source: ImportSource, mode: 'replace' | 'merge') => AsyncVoid) | undefined
  }

  let {
    activeTab = 'categories',
    isAuthenticated = false,
    authLoading = false,
    categories = [],
    bookmarks = [],
    categoriesLoading = false,
    bookmarksLoading = false,
    deletingCategoryId = null,
    deletingBookmarkId = null,
    settingsPanelComponent = null,
    settingsLoading = false,
    settingsSaving = false,
    settingsError = '',
    settingsValue = null,
    importing = false,
    exporting = false,
    backupError = '',
    backupMessage = '',
    importSource = $bindable('cf-navs'),
    onOpenCreateCategory = undefined,
    onEditCategory = undefined,
    onDeleteCategory = undefined,
    onBatchDeleteCategories = undefined,
    onOpenCreateBookmark = undefined,
    onEditBookmark = undefined,
    onDeleteBookmark = undefined,
    onBatchDeleteBookmarks = undefined,
    onBatchMoveBookmarks = undefined,
    onSubmitSettings = undefined,
    onVerifyDevice = undefined,
    onChangePassword = undefined,
    onSortCategories = undefined,
    onSortBookmarks = undefined,
    onExportData = undefined,
    onImportData = undefined,
  }: AdminTabContentProps = $props()
</script>

<div class="admin-content" id="admin-main" tabindex="-1">
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
      {onBatchMoveBookmarks}
      {onSortBookmarks}
    />
  {:else if activeTab === 'analytics'}
    <AnalyticsPanel
      {bookmarks}
      {categories}
    />
  {:else if activeTab === 'settings'}
    <section class="settings-panel-wrap">
      {#if settingsPanelComponent}
        {@const SettingsPanelView = settingsPanelComponent}
        <SettingsPanelView
          value={settingsValue}
          loading={settingsLoading}
          saving={settingsSaving}
          error={settingsError}
          onSubmit={onSubmitSettings}
          onVerifyDevice={onVerifyDevice}
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
      {exporting}
      {backupError}
      {backupMessage}
      {categories}
      {bookmarks}
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

  .admin-content:focus {
    outline: none;
  }

  .settings-panel-wrap {
    min-width: 0;
    width: 100%;
    /* SettingsPanel reserves this gap in its desktop viewport height. */
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

  @media (max-width: 720px) {
    .admin-content {
      height: auto;
      overflow: visible;
      padding-right: 0;
    }
  }
</style>
