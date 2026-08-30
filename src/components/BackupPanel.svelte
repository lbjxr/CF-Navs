<script lang="ts">
  import type { ImportSource } from '../lib/importData'
  import type { BackupSelection } from '../lib/appBackup'

  type AsyncVoid<T = void> = T | Promise<T>
  type CategoryOption = { id: number | string; parent_id: number | string | null; title: string; sort?: number }
  type BookmarkOption = { id: number | string; category_id: number | string; title: string }
  type RootSelectionState = { checked: boolean; indeterminate: boolean }

  export let isAuthenticated = false
  export let importing = false
  export let exporting = false
  export let backupError = ''
  export let backupMessage = ''
  export let importSource: ImportSource = 'cf-navs'
  export let categories: CategoryOption[] = []
  export let bookmarks: BookmarkOption[] = []
  export let onExportData: ((selection: BackupSelection) => AsyncVoid) | undefined = undefined
  export let onImportData: ((file: File, source: ImportSource, mode: 'replace' | 'merge') => AsyncVoid) | undefined = undefined

  let importInput: HTMLInputElement | null = null
  let importMode: 'replace' | 'merge' = 'replace'
  let selectedCategoryIds = new Set<number>()
  let expandedRootIds = new Set<number>()
  let includeSettings = true
  let initializedSelection = false

  $: roots = categories
    .filter((category) => category.parent_id === null || !categories.some((candidate) => Number(candidate.id) === Number(category.parent_id)))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || Number(a.id) - Number(b.id))
  $: childrenByParent = categories.reduce((result, category) => {
    if (category.parent_id === null) return result
    const parentId = Number(category.parent_id)
    const children = result.get(parentId) ?? []
    children.push(category)
    result.set(parentId, children)
    return result
  }, new Map<number, CategoryOption[]>())
  $: childrenByParent.forEach((children) => children.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || Number(a.id) - Number(b.id)))
  $: bookmarkCountByCategory = bookmarks.reduce((result, bookmark) => {
    result.set(Number(bookmark.category_id), (result.get(Number(bookmark.category_id)) ?? 0) + 1)
    return result
  }, new Map<number, number>())
  $: if (!initializedSelection && categories.length > 0) {
    selectedCategoryIds = new Set(categories.map((category) => Number(category.id)))
    expandedRootIds = new Set(roots.map((root) => Number(root.id)))
    initializedSelection = true
  }

  function rootSelectionState(root: CategoryOption, selectedIds: Set<number>): RootSelectionState {
    const ids = [Number(root.id), ...(childrenByParent.get(Number(root.id)) ?? []).map((child) => Number(child.id))]
    const selectedCount = ids.filter((id) => selectedIds.has(id)).length
    return { checked: selectedCount === ids.length, indeterminate: selectedCount > 0 && selectedCount < ids.length }
  }


  function toggleRoot(root: CategoryOption): void {
    const ids = [Number(root.id), ...(childrenByParent.get(Number(root.id)) ?? []).map((child) => Number(child.id))]
    const state = rootSelectionState(root, selectedCategoryIds)
    const next = new Set(selectedCategoryIds)
    for (const id of ids) {
      if (state.checked) next.delete(id)
      else next.add(id)
    }
    selectedCategoryIds = next
  }

  function toggleCategory(category: CategoryOption): void {
    const next = new Set(selectedCategoryIds)
    const id = Number(category.id)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedCategoryIds = next
  }

  function selectAll(): void {
    selectedCategoryIds = new Set(categories.map((category) => Number(category.id)))
  }

  function clearSelection(): void {
    selectedCategoryIds = new Set()
  }

  function toggleRootExpanded(rootId: number): void {
    const next = new Set(expandedRootIds)
    if (next.has(rootId)) next.delete(rootId)
    else next.add(rootId)
    expandedRootIds = next
  }

  function indeterminate(node: HTMLInputElement, value: boolean): { update: (next: boolean) => void } {
    node.indeterminate = value
    return { update: (next) => { node.indeterminate = next } }
  }

  async function handleExport(): Promise<void> {
    if (!onExportData || selectedCategoryIds.size === 0) return
    await onExportData({ categoryIds: new Set(selectedCategoryIds), includeSettings })
  }

  function triggerImport() {
    importInput?.click()
  }

  async function handleImportChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file && onImportData) {
      const source = /\.html?$/i.test(file.name) ? 'browser-html' : importSource
      await onImportData(file, source, source === 'browser-html' && importSource !== 'browser-html' ? 'merge' : importMode)
    }
    input.value = ''
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (!file || !onImportData) return
    const source = /\.html?$/i.test(file.name) ? 'browser-html' : importSource
    await onImportData(file, source, source === 'browser-html' && importSource !== 'browser-html' ? 'merge' : importMode)
  }
</script>
<section class="panel backup-panel">
  <div class="panel-header">
    <div>
      <p class="panel-eyebrow">数据备份与导入</p>
      <h2>导入 / 导出</h2>
    </div>
  </div>
  <p class="backup-desc">
    导出可按分类选择，包含所选分类、书签与站点设置；导入时可选择
    <strong>追加合并</strong>或<strong>覆盖现有数据</strong>，管理员账号不受影响。
  </p>

  {#if backupError}
    <p class="backup-alert error">{backupError}</p>
  {:else if backupMessage}
    <p class="backup-alert ok">{backupMessage}</p>
  {/if}

  <div class="backup-operations">
    <section class="backup-operation export-operation" aria-labelledby="export-backup-title">
      <div class="backup-operation-copy">
        <h3 id="export-backup-title">导出当前数据</h3>
        <p>选择要导出的分类；一级分类会连带其二级分类与归属书签。</p>
        <div class="export-selection-toolbar" aria-label="导出选择快捷操作">
          <button type="button" class="link-button" on:click={selectAll} disabled={categories.length === 0}>全选</button>
          <button type="button" class="link-button" on:click={clearSelection} disabled={selectedCategoryIds.size === 0}>清空</button>
          <label class="settings-toggle">
            <input type="checkbox" bind:checked={includeSettings} />
            <span>导出站点设置</span>
          </label>
        </div>
        <div class="category-tree" aria-label="选择导出分类">
          {#if roots.length === 0}
            <p class="category-tree-empty">暂无分类</p>
          {:else}
            {#each roots as root (root.id)}
              {@const rootId = Number(root.id)}
              {@const rootState = rootSelectionState(root, selectedCategoryIds)}
              {@const children = childrenByParent.get(rootId) ?? []}
              {@const isExpanded = expandedRootIds.has(rootId)}
              <div class="category-tree-root">
                <div class="category-tree-root-header">
                  <label class="category-tree-row category-tree-row-root">
                    <input
                      type="checkbox"
                      checked={rootState.checked}
                      aria-checked={rootState.indeterminate ? 'mixed' : rootState.checked}
                      use:indeterminate={rootState.indeterminate}
                      on:change={() => toggleRoot(root)}
                    />
                    <span class="category-tree-title">{root.title}</span>
                    <span class="category-tree-count">{bookmarkCountByCategory.get(rootId) ?? 0}</span>
                  </label>
                  {#if children.length > 0}
                    <button
                      type="button"
                      class="category-tree-toggle"
                      aria-expanded={isExpanded}
                      aria-controls={`export-category-children-${root.id}`}
                      aria-label={`${isExpanded ? '收起' : '展开'} ${root.title} 子分类`}
                      on:click={() => toggleRootExpanded(rootId)}
                    >
                      <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </button>
                  {/if}
                </div>
                {#if isExpanded && children.length > 0}
                  <div class="category-tree-children" id={`export-category-children-${root.id}`}>
                    {#each children as child (child.id)}
                      <label class="category-tree-row category-tree-row-child">
                        <input
                          type="checkbox"
                          checked={selectedCategoryIds.has(Number(child.id))}
                          on:change={() => toggleCategory(child)}
                        />
                        <span class="category-tree-title">{child.title}</span>
                        <span class="category-tree-count">{bookmarkCountByCategory.get(Number(child.id)) ?? 0}</span>
                      </label>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        {#if categories.length > 0 && selectedCategoryIds.size === 0}
          <p class="category-tree-empty" role="status">至少选择一个分类后才能导出。</p>
        {/if}
        </div>
      </div>
      <button type="button" class="primary-button" on:click={handleExport} disabled={!isAuthenticated || importing || exporting || selectedCategoryIds.size === 0}>
        {#if exporting}获取最新数据...{:else}导出备份{/if}
      </button>
    </section>

    <section class="backup-operation" aria-labelledby="import-backup-title" on:dragover|preventDefault on:drop={handleDrop}>
      <div class="backup-operation-copy">
        <h3 id="import-backup-title">导入数据</h3>
        <p>支持点击或拖放 JSON、HTML、HTM 文件，格式会自动识别。</p>
      </div>
      <div class="import-actions">
        <label class="import-source-field" for="import-source">
          <span>导入来源</span>
          <select class="native-select" id="import-source" bind:value={importSource} on:change={() => { if (importSource === 'browser-html') importMode = 'merge' }} disabled={!isAuthenticated || importing}>
            <option value="cf-navs">CF-Navs 备份</option>
            <option value="sunpanel">SunPanel 导出</option>
            <option value="browser-html">浏览器书签 HTML</option>
          </select>
        </label>
        <label class="import-source-field"><span>导入模式</span><select class="native-select" bind:value={importMode} disabled={!isAuthenticated || importing}><option value="merge">追加合并</option><option value="replace">覆盖现有数据</option></select></label>
        <button type="button" class="ghost-button" on:click={triggerImport} disabled={!isAuthenticated || importing}>
          {#if importing}导入中...{:else}选择文件并导入{/if}
        </button>
        <input
          bind:this={importInput}
          class="import-input"
          type="file"
          accept="application/json,text/html,.json,.html,.htm,.sun-panel.json,.sunpanel.json"
          on:change={handleImportChange}
        />
      </div>
    </section>
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--admin-border);
    border-radius: 18px;
    background: var(--admin-surface);
    box-shadow: var(--admin-shadow);
    padding: 18px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
  }

  .panel-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--admin-subtle);
  }

  h2,
  p {
    margin: 0;
  }

  .export-operation {
    align-items: flex-start;
  }

  .export-operation > .backup-operation-copy {
    flex: 1 1 auto;
    width: auto;
  }

  .export-selection-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-top: 12px;
  }

  .link-button {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--admin-accent, #2563eb);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .link-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .settings-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--admin-muted);
    font-size: 13px;
  }

  .category-tree {
    display: grid;
    gap: 5px;
    max-height: 260px;
    margin-top: 12px;
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--admin-border);
    border-radius: 10px;
    background: var(--admin-input-bg);
  }

  .category-tree-root {
    display: grid;
    gap: 2px;
  }

  .category-tree-root-header {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
  }

  .category-tree-root-header .category-tree-row {
    flex: 1 1 auto;
  }

  .category-tree-toggle {
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--admin-muted);
    font: inherit;
    cursor: pointer;
  }

  .category-tree-toggle:hover,
  .category-tree-toggle:focus-visible {
    border-color: var(--admin-input-hover-border);
    background: var(--admin-control-hover-bg);
    color: var(--admin-text);
    outline: none;
  }

  .category-tree-children {
    display: grid;
    gap: 2px;
  }

  .category-tree-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 7px;
    color: var(--admin-text);
    font-size: 13px;
  }

  .category-tree-row:hover {
    background: var(--admin-control-hover-bg);
  }

  .category-tree-row-child {
    padding-left: 28px;
    color: var(--admin-muted);
  }

  .category-tree-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-tree-count {
    margin-left: auto;
    color: var(--admin-subtle);
    font-size: 12px;
  }

  .category-tree-empty {
    color: var(--admin-muted);
    font-size: 13px;
  }

  h2 {
    font-size: 22px;
  }

  .backup-desc {
    color: var(--admin-muted);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .backup-operations {
    display: grid;
    gap: 12px;
  }

  .backup-operation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px;
    border: 1px solid var(--admin-border);
    border-radius: 14px;
    background: var(--admin-control-bg);
  }

  .backup-operation-copy {
    min-width: 0;
  }

  .backup-operation-copy h3 {
    margin: 0 0 5px;
    font-size: 15px;
  }

  .backup-operation-copy p {
    color: var(--admin-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .import-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 10px;
  }

  .import-source-field {
    display: inline-grid;
    gap: 6px;
    min-width: 180px;
  }

  .import-source-field span {
    color: var(--admin-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .import-source-field select {
    --select-hover-border: var(--admin-input-hover-border);
    min-height: 39px;
    border: 1px solid var(--admin-input-border);
    border-radius: 12px;
    background: var(--admin-input-bg);
    color: var(--admin-text);
    font: inherit;
    padding: 8px 12px;
  }

  .import-input {
    display: none;
  }

  .backup-alert {
    margin: 0 0 14px;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
  }

  .backup-alert.error {
    border: 1px solid var(--admin-danger-border);
    background: var(--admin-danger-bg);
    color: var(--admin-danger);
  }

  .backup-alert.ok {
    border: 1px solid var(--admin-ok-border);
    background: var(--admin-ok-bg);
    color: var(--admin-ok);
  }

  .primary-button,
  .ghost-button {
    min-height: 39px;
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: var(--transition-base);
  }

  .primary-button {
    border: none;
    background: #2563eb;
    color: #ffffff;
  }

  .ghost-button {
    border: 1px solid var(--admin-input-border);
    background: var(--admin-control-bg);
    color: var(--admin-text);
  }

  .ghost-button:hover:not(:disabled) {
    border-color: var(--admin-input-hover-border);
    background: var(--admin-control-hover-bg);
  }

  .primary-button:disabled,
  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 760px) {
    .backup-operation {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }

    .import-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "source source"
        "mode button";
      align-items: end;
      width: 100%;
      flex: none;
      gap: 10px;
    }

    .import-source-field {
      min-width: 0;
      width: 100%;
    }

    .import-source-field:first-child {
      grid-area: source;
    }

    .import-source-field:nth-child(2) {
      grid-area: mode;
    }

    .import-actions > .ghost-button {
      grid-area: button;
      align-self: stretch;
      min-width: 0;
      width: 100%;
      padding-left: 8px;
      padding-right: 8px;
      white-space: nowrap;
    }

    .export-operation {
      padding-bottom: calc(72px + env(safe-area-inset-bottom));
    }

    .export-operation > .primary-button {
      position: fixed;
      left: max(12px, env(safe-area-inset-left));
      right: max(12px, env(safe-area-inset-right));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 100;
      width: auto;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.24);
    }
  }
</style>
