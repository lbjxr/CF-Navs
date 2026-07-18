<script lang="ts">
  import { tick } from 'svelte'
  import { faviconImIcon } from '../../lib/icons'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  export let form: SettingsFormModel
  export let saving = false
  export let enginesValid = true

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function addEngine(): void {
    form.search_engine.engines = [
      ...form.search_engine.engines,
      { name: '', icon: '', url_template: 'https://example.com/search?q={q}' },
    ]
    form = cloneSettingsForm(form)
  }

  function removeEngine(index: number): void {
    const removed = form.search_engine.engines[index]
    const next = form.search_engine.engines.filter((_, i) => i !== index)
    form.search_engine.engines = next
    if (removed && removed.name === form.search_engine.current) {
      form.search_engine.current = next[0]?.name ?? ''
    }
    form = cloneSettingsForm(form)
  }

  function applyFaviconImIcon(index: number): void {
    const engine = form.search_engine.engines[index]
    if (!engine) return

    const icon = faviconImIcon(engine.url_template)
    if (!icon) return

    engine.icon = icon
    form = cloneSettingsForm(form)
  }

  function canPreviewIcon(icon: string): boolean {
    return /^(https?:\/\/|data:image\/)/i.test(icon.trim())
  }
</script>

<fieldset
  id="settings-section-search"
  class="group group-wide group-search"
  disabled={saving}
  on:input={() => void syncForm()}
  on:change={() => void syncForm()}
>
  <legend>搜索引擎</legend>
  <p class="group-desc">维护首页搜索框可切换的外部搜索引擎，查询模板中用 {'{q}'} 代表关键词。</p>

  <div class="settings-grid search-controls-grid">
    <label class="field field-select">
      <span>默认引擎</span>
      <select class="native-select" bind:value={form.search_engine.current} disabled={form.search_engine.engines.length === 0}>
        {#if form.search_engine.engines.length === 0}
          <option value="">无可用引擎</option>
        {:else}
          {#each form.search_engine.engines as engine (engine)}
            {#if engine.name.trim()}
              <option value={engine.name}>{engine.name}</option>
            {/if}
          {/each}
        {/if}
      </select>
      <small>首页搜索框默认选中的引擎；上方可控制搜索框和引擎选择器是否显示。</small>
    </label>
  </div>

  <div class="engine-list">
    {#each form.search_engine.engines as engine, index (index)}
      <div class="engine-row">
        <label class="engine-cell">
          <span>名称</span>
          <input bind:value={engine.name} type="text" placeholder="Google" />
        </label>
        <label class="engine-cell">
          <span>图标 URL（可选）</span>
          <div class="engine-icon-control">
            <input bind:value={engine.icon} type="text" placeholder="留空显示首字母" />
            {#if canPreviewIcon(engine.icon)}
              <span class="engine-icon-preview" title="搜索引擎图标预览">
                <img src={engine.icon} alt="" loading="lazy" decoding="async" />
              </span>
            {/if}
            <button
              type="button"
              class="ghost-button favicon-button"
              on:click={() => applyFaviconImIcon(index)}
              disabled={!faviconImIcon(engine.url_template)}
              title={faviconImIcon(engine.url_template)
                ? '根据查询模板域名生成 Favicon.im 图标 URL'
                : '请先填写有效的查询模板 URL'}
            >
              Favicon.im
            </button>
          </div>
        </label>
        <label class="engine-cell grow">
          <span>查询模板（含 {'{q}'} 占位符）</span>
          <input
            bind:value={engine.url_template}
            type="text"
            placeholder="https://www.google.com/search?q={'{q}'}"
          />
        </label>
        <button
          type="button"
          class="danger-button"
          on:click={() => removeEngine(index)}
          disabled={form.search_engine.engines.length <= 1}
          aria-label="删除引擎"
        >
          删除
        </button>
      </div>
    {/each}
  </div>

  <button type="button" class="ghost-button add-engine" on:click={addEngine}>+ 新增搜索引擎</button>

  {#if !enginesValid}
    <small class="warn">每个引擎都需填写名称，且查询模板必须包含 {'{q}'} 占位符。</small>
  {/if}
</fieldset>

<style>
  .search-controls-grid .field-select {
    grid-column: span 5;
  }

  .engine-list {
    display: grid;
    gap: 10px;
  }

  .engine-row {
    display: grid;
    grid-template-columns: minmax(130px, 0.65fr) minmax(260px, 1.15fr) minmax(240px, 1.5fr) auto;
    gap: 10px;
    align-items: end;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 12px;
    padding: 10px;
    background: var(--sp-toggle-bg);
  }

  .engine-cell.grow {
    min-width: 0;
  }

  .engine-icon-control {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px auto;
    gap: 7px;
    align-items: center;
    min-width: 0;
  }

  .engine-icon-control input {
    grid-column: 1;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    padding: 9px 11px;
    background: var(--sp-input-bg);
    color: var(--sp-input-text);
    font: inherit;
    font-size: 14px;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }

  .engine-icon-control input:focus {
    outline: none;
    border-color: var(--sp-accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .engine-icon-preview {
    grid-column: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    background: var(--sp-input-bg);
  }

  .engine-icon-preview img {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    object-fit: contain;
  }

  .favicon-button {
    grid-column: 3;
    min-height: 36px;
    padding: 8px 11px;
  }

  .add-engine {
    justify-self: start;
  }

  @media (max-width: 960px) {
    .search-controls-grid .field-select {
      grid-column: 1 / -1;
    }

    .engine-row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .engine-cell.grow,
    .engine-row .danger-button {
      width: 100%;
    }
  }

  @media (max-width: 560px) {
    .engine-icon-control {
      grid-template-columns: minmax(0, 1fr) 36px;
    }

    .favicon-button {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  @container settings-editor (max-width: 760px) {
    .search-controls-grid .field-select {
      grid-column: 1 / -1;
    }

    .engine-row {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .engine-cell.grow,
    .engine-row .danger-button {
      width: 100%;
    }
  }
</style>
