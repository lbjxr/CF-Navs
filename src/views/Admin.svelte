<script module lang="ts">
  import type { AdminBookmarkSummary, AdminCategorySummary } from '../lib/appData'
  import type {
    BookmarkFormValue as BookmarkFormValueType,
    CategoryFormValue as CategoryFormValueType,
  } from '../lib/adminTypes'

  export type AdminCategory = AdminCategorySummary
  export type AdminBookmark = AdminBookmarkSummary
  export type CategoryFormValue = CategoryFormValueType
  export type BookmarkFormValue = BookmarkFormValueType
</script>

<script lang="ts">
  import type { AsyncVoid, BookmarkBatchMoveReq, ChangePasswordReq } from '../../shared/types'
  import AdminSidebar from '../components/AdminSidebar.svelte'
  import AdminPageHeader from '../components/admin/AdminPageHeader.svelte'
  import AdminTabContent from '../components/admin/AdminTabContent.svelte'
  import type { BackupSelection } from '../lib/appBackup'
  import type { ImportSource } from '../lib/importData'
  import type { SettingsFormValue } from '../lib/appData'
  import type { AdminTab, CategorySortHandler } from '../lib/adminTypes'
  import type { SortHandler } from '../lib/sortableList'
  import { createLazyComponentLoader } from '../lib/appLazyComponent'

  interface AdminProps {
    isAuthenticated?: boolean
    authLoading?: boolean
    categories?: AdminCategory[]
    bookmarks?: AdminBookmark[]
    categoriesLoading?: boolean
    bookmarksLoading?: boolean
    savingCategory?: boolean
    deletingCategoryId?: string | number | null
    deletingBookmarkId?: string | number | null
    categoryError?: string
    categoryModalOpen?: boolean
    settingsLoading?: boolean
    settingsSaving?: boolean
    settingsError?: string
    settingsValue?: Partial<SettingsFormValue> | null
    categoryModalMode?: 'create' | 'edit'
    activeCategory?: Partial<CategoryFormValue> | null
    canSeeHome?: boolean
    importing?: boolean
    exporting?: boolean
    backupError?: string
    backupMessage?: string
    onOpenLogin?: (() => AsyncVoid) | undefined
    onLogout?: (() => AsyncVoid) | undefined
    onSwitchToHome?: (() => AsyncVoid) | undefined
    onOpenCreateCategory?: (() => AsyncVoid) | undefined
    onEditCategory?: ((category: AdminCategory) => AsyncVoid) | undefined
    onDeleteCategory?: ((category: AdminCategory) => AsyncVoid) | undefined
    onBatchDeleteCategories?: ((ids: number[]) => AsyncVoid) | undefined
    onCloseCategoryModal?: (() => AsyncVoid) | undefined
    onSubmitCategory?: ((payload: CategoryFormValue) => AsyncVoid) | undefined
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
    /** 切换后台标签时通知外层：访问分析需要强制拉取最新点击数据。 */
    onSelectTab?: ((tab: AdminTab) => AsyncVoid) | undefined
    onExportData?: ((selection: BackupSelection) => AsyncVoid) | undefined
    onImportData?: ((file: File, source: ImportSource, mode: 'replace' | 'merge') => AsyncVoid) | undefined
  }

  let {
    isAuthenticated = false,
    authLoading = false,
    categories = [],
    bookmarks = [],
    categoriesLoading = false,
    bookmarksLoading = false,
    savingCategory = false,
    deletingCategoryId = null,
    deletingBookmarkId = null,
    categoryError = '',
    categoryModalOpen = false,
    settingsLoading = false,
    settingsSaving = false,
    settingsError = '',
    settingsValue = null,
    categoryModalMode = 'create',
    activeCategory = null,
    canSeeHome = false,
    importing = false,
    exporting = false,
    backupError = '',
    backupMessage = '',
    onOpenLogin = undefined,
    onLogout = undefined,
    onSwitchToHome = undefined,
    onOpenCreateCategory = undefined,
    onEditCategory = undefined,
    onDeleteCategory = undefined,
    onBatchDeleteCategories = undefined,
    onCloseCategoryModal = undefined,
    onSubmitCategory = undefined,
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
    onSelectTab = undefined,
    onExportData = undefined,
    onImportData = undefined,
  }: AdminProps = $props()

  let activeTab = $state<AdminTab>('categories')

  let imageHostUrl = $derived(settingsValue?.image_host_url ?? '')
  let CategoryEditModalComponent = $state<typeof import('../components/CategoryEditModal.svelte').default | null>(null)
  let SettingsPanelComponent = $state<typeof import('../components/SettingsPanel.svelte').default | null>(null)
  const ensureCategoryEditModal = createLazyComponentLoader({
    load: () => import('../components/CategoryEditModal.svelte'),
    getCurrent: () => CategoryEditModalComponent,
    setCurrent: (component) => {
      CategoryEditModalComponent = component
    },
  })
  const ensureSettingsPanel = createLazyComponentLoader({
    load: () => import('../components/SettingsPanel.svelte'),
    getCurrent: () => SettingsPanelComponent,
    setCurrent: (component) => {
      SettingsPanelComponent = component
    },
  })
  $effect.pre(() => {
    if (categoryModalOpen) {
      void ensureCategoryEditModal()
    }
  })
  $effect.pre(() => {
    if (activeTab === 'settings') {
      void ensureSettingsPanel()
    }
  })

  let importSource = $state<ImportSource>('cf-navs')

  function handleSelectTab(tab: AdminTab): void {
    activeTab = tab
    void onSelectTab?.(tab)
  }

</script>

<svelte:head>
  <title>管理后台</title>
  <meta name="description" content="CF-Navs 管理后台 MVP" />
</svelte:head>

<a class="admin-skip-link" href="#admin-main">跳到主内容</a>
<div class="admin-page">
  <AdminPageHeader
    {isAuthenticated}
    {authLoading}
    {canSeeHome}
    {onOpenLogin}
    {onLogout}
    {onSwitchToHome}
  />

  <!-- 左侧菜单 + 右侧内容布局 -->
  <div class="admin-layout">
    <AdminSidebar
      {activeTab}
      categoriesCount={categories.length}
      bookmarksCount={bookmarks.length}
      onSelect={handleSelectTab}
    />

    <AdminTabContent
      {activeTab}
      {isAuthenticated}
      {authLoading}
      {categories}
      {bookmarks}
      {categoriesLoading}
      {bookmarksLoading}
      {deletingCategoryId}
      {deletingBookmarkId}
      settingsPanelComponent={SettingsPanelComponent}
      {settingsLoading}
      {settingsSaving}
      {settingsError}
      {settingsValue}
      {importing}
      {exporting}
      {backupError}
      {backupMessage}
      bind:importSource
      {onOpenCreateCategory}
      {onEditCategory}
      {onDeleteCategory}
      {onBatchDeleteCategories}
      {onOpenCreateBookmark}
      {onEditBookmark}
      {onDeleteBookmark}
      {onBatchDeleteBookmarks}
      {onBatchMoveBookmarks}
      {onSubmitSettings}
      {onVerifyDevice}
      {onChangePassword}
      {onSortCategories}
      {onSortBookmarks}
      {onExportData}
      {onImportData}
    />
  </div>

</div>

{#if CategoryEditModalComponent}
  <CategoryEditModalComponent
    open={categoryModalOpen}
    loading={savingCategory}
    error={categoryError}
    mode={categoryModalMode}
    value={activeCategory}
    {categories}
    onSubmit={onSubmitCategory}
    onCancel={onCloseCategoryModal}
    imageHostUrl={imageHostUrl}
  />
{/if}

<style>
  .admin-skip-link {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 1000;
    padding: 8px 14px;
    border-radius: 10px;
    background: var(--admin-accent, #2563eb);
    color: var(--admin-accent-ink, #ffffff);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    transform: translateY(-150%);
    transition: transform var(--transition-fast);
  }

  .admin-skip-link:focus {
    transform: translateY(0);
    outline: 2px solid var(--admin-accent-strong, #1e40af);
    outline-offset: 2px;
  }

  :global(body) {
    margin: 0;
    background: #f8fafc;
    color: #0f172a;
    font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }

  :global(html[data-theme='dark'] body) {
    background: #08111f;
    color: #e5eefb;
  }

  .admin-page {
    --admin-page-bg: #f8fafc;
    --admin-page-ambient: rgba(59, 130, 246, 0.12);
    --admin-text: #0f172a;
    --admin-muted: #475569;
    --admin-subtle: #64748b;
    --admin-surface: rgba(255, 255, 255, 0.92);
    --admin-surface-strong: rgba(255, 255, 255, 1);
    --admin-border: rgba(148, 163, 184, 0.22);
    --admin-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
    --admin-control-bg: rgba(255, 255, 255, 0.92);
    --admin-control-hover-bg: rgba(255, 255, 255, 1);
    --admin-sidebar-bg: rgba(255, 255, 255, 0.58);
    --admin-sidebar-border: rgba(148, 163, 184, 0.24);
    --admin-sidebar-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
    --admin-nav-bg: rgba(255, 255, 255, 0.74);
    --admin-nav-hover-bg: rgba(255, 255, 255, 0.96);
    --admin-nav-active-bg: rgba(37, 99, 235, 0.11);
    --admin-nav-badge-bg: rgba(148, 163, 184, 0.12);
    --admin-nav-active-badge-bg: rgba(59, 130, 246, 0.15);
    --admin-accent: #2563eb;
    --admin-accent-ink: #ffffff;
    --admin-accent-strong: #1e40af;
    --admin-divider: #e2e8f0;
    --admin-sticky-bg: rgba(255, 255, 255, 0.98);
    --admin-card-bg: #ffffff;
    --admin-card-border: #e2e8f0;
    --admin-card-hover-border: #cbd5e1;
    --admin-badge-bg: #f1f5f9;
    --admin-badge-text: #475569;
    --admin-icon-badge-bg: #eff6ff;
    --admin-input-bg: #ffffff;
    --admin-input-border: #cbd5e1;
    --admin-input-hover-border: #94a3b8;
    --admin-input-placeholder: #64748b;
    --admin-th-bg: #ffffff;
    --admin-sort-highlight-bg: #f8fbff;
    --admin-sort-highlight-border: #bfdbfe;
    --admin-link: #2563eb;
    --admin-danger: #b91c1c;
    --admin-danger-bg: #fef2f2;
    --admin-danger-border: #fecaca;
    --admin-danger-hover-bg: #fee2e2;
    --admin-ok: #15803d;
    --admin-ok-bg: #f0fdf4;
    --admin-ok-border: #bbf7d0;
    position: relative;
    min-height: 100dvh;
    height: 100dvh;
    box-sizing: border-box;
    padding: 24px;
    display: grid;
    grid-template-rows: auto 1fr; /* header自动高度，内容占满剩余空间 */
    gap: 16px;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, var(--admin-page-ambient), transparent 28%),
      var(--admin-page-bg);
    color: var(--admin-text);
  }

  :global([data-theme='dark']) .admin-page {
    --admin-page-bg: #08111f;
    --admin-page-ambient: rgba(125, 211, 252, 0.14);
    --admin-text: #e5eefb;
    --admin-muted: #cbd5e1;
    --admin-subtle: #94a3b8;
    --admin-surface: rgba(15, 23, 42, 0.78);
    --admin-surface-strong: rgba(15, 23, 42, 0.92);
    --admin-border: rgba(148, 163, 184, 0.26);
    --admin-shadow: 0 22px 48px rgba(0, 0, 0, 0.26);
    --admin-control-bg: rgba(15, 23, 42, 0.72);
    --admin-control-hover-bg: rgba(30, 41, 59, 0.86);
    --admin-sidebar-bg: rgba(15, 23, 42, 0.58);
    --admin-sidebar-border: rgba(148, 163, 184, 0.22);
    --admin-sidebar-shadow: 0 22px 50px rgba(0, 0, 0, 0.3);
    --admin-nav-bg: rgba(15, 23, 42, 0.5);
    --admin-nav-hover-bg: rgba(30, 41, 59, 0.72);
    --admin-nav-active-bg: rgba(125, 211, 252, 0.13);
    --admin-nav-badge-bg: rgba(148, 163, 184, 0.16);
    --admin-nav-active-badge-bg: rgba(125, 211, 252, 0.18);
    --admin-accent: #7dd3fc;
    --admin-accent-ink: #0f172a;
    --admin-accent-strong: #bae6fd;
    --admin-divider: rgba(148, 163, 184, 0.2);
    --admin-sticky-bg: rgba(15, 23, 42, 0.92);
    --admin-card-bg: #141f33;
    --admin-card-border: rgba(148, 163, 184, 0.26);
    --admin-card-hover-border: rgba(148, 163, 184, 0.38);
    --admin-badge-bg: rgba(148, 163, 184, 0.16);
    --admin-badge-text: #94a3b8;
    --admin-icon-badge-bg: rgba(125, 211, 252, 0.14);
    --admin-input-bg: rgba(15, 23, 42, 0.72);
    --admin-input-border: rgba(148, 163, 184, 0.32);
    --admin-input-hover-border: rgba(148, 163, 184, 0.5);
    --admin-input-placeholder: #94a3b8;
    --admin-th-bg: #0f1c30;
    --admin-sort-highlight-bg: rgba(125, 211, 252, 0.08);
    --admin-sort-highlight-border: rgba(125, 211, 252, 0.32);
    --admin-link: #7dd3fc;
    --admin-danger: #f87171;
    --admin-danger-bg: rgba(248, 113, 113, 0.12);
    --admin-danger-border: rgba(248, 113, 113, 0.32);
    --admin-danger-hover-bg: rgba(248, 113, 113, 0.2);
    --admin-ok: #4ade80;
    --admin-ok-bg: rgba(74, 222, 128, 0.12);
    --admin-ok-border: rgba(74, 222, 128, 0.32);
  }

  /* 左侧菜单 + 右侧内容布局 */
  .admin-layout {
    display: flex;
    gap: 18px;
    align-items: flex-start;
    min-height: 0;
    overflow: hidden;
  }

  @media (max-width: 960px) {
    .admin-page {
      padding: 20px;
    }

    .admin-layout {
      gap: 16px;
    }
  }

  @media (max-width: 700px) {
    .admin-page {
      padding: 12px;
      padding-bottom: calc(76px + env(safe-area-inset-bottom));
      height: 100dvh;
      grid-template-rows: auto 1fr;
    }

    .admin-layout {
      flex-direction: column;
      align-items: stretch;
      height: 100%;
    }
  }

  @media (max-width: 720px) {
    .admin-page {
      height: auto;
      min-height: 100dvh;
      padding: 12px;
      padding-bottom: calc(76px + env(safe-area-inset-bottom));
      overflow: visible;
    }

    .admin-layout {
      flex-direction: column;
      align-items: stretch;
      overflow: visible;
    }
  }
</style>
