<script lang="ts">
  import type { ImportSource } from '../lib/importData'

  type AsyncVoid<T = void> = T | Promise<T>

  export let isAuthenticated = false
  export let importing = false
  export let backupError = ''
  export let backupMessage = ''
  export let importSource: ImportSource = 'cf-navs'
  export let onExportData: (() => AsyncVoid) | undefined = undefined
  export let onImportData: ((file: File, source: ImportSource) => AsyncVoid) | undefined = undefined

  let importInput: HTMLInputElement | null = null

  function triggerImport() {
    importInput?.click()
  }

  async function handleImportChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file && onImportData) {
      await onImportData(file, importSource)
    }
    input.value = ''
  }
</script>

<section class="panel backup-panel">
  <div class="panel-header">
    <div>
      <p class="panel-eyebrow">数据备份</p>
      <h2>导入 / 导出</h2>
    </div>
  </div>
  <p class="backup-desc">
    导出会把当前全部分类、书签与站点设置保存为一个 JSON 文件；导入会用所选文件
    <strong>覆盖</strong>现有的分类与书签（管理员账号不受影响）。
  </p>

  {#if backupError}
    <p class="backup-alert error">{backupError}</p>
  {:else if backupMessage}
    <p class="backup-alert ok">{backupMessage}</p>
  {/if}

  <div class="backup-actions">
    <label class="import-source-field" for="import-source">
      <span>导入来源</span>
      <select id="import-source" bind:value={importSource} disabled={!isAuthenticated || importing}>
        <option value="cf-navs">CF-Navs 备份</option>
        <option value="sunpanel">SunPanel 导出</option>
      </select>
    </label>
    <button type="button" class="primary-button" on:click={() => onExportData?.()} disabled={!isAuthenticated}>
      导出备份
    </button>
    <button type="button" class="ghost-button" on:click={triggerImport} disabled={!isAuthenticated || importing}>
      {#if importing}导入中...{:else}导入备份{/if}
    </button>
    <input
      bind:this={importInput}
      class="import-input"
      type="file"
      accept="application/json,.json,.sun-panel.json,.sunpanel.json"
      on:change={handleImportChange}
    />
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

  h2 {
    font-size: 22px;
  }

  .backup-desc {
    color: var(--admin-muted);
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .backup-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
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
    transition: 0.18s ease;
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
</style>
