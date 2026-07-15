<script lang="ts">
  import { tick } from 'svelte'
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
      <select bind:value={form.search_engine.current} disabled={form.search_engine.engines.length === 0}>
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
      <small>首页搜索框默认选中的引擎；是否显示引擎选择器可在「标题与搜索」中设置。</small>
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
          <input bind:value={engine.icon} type="text" placeholder="留空显示首字母" />
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
    grid-template-columns: minmax(130px, 0.7fr) minmax(150px, 0.8fr) minmax(240px, 1.6fr) auto;
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
</style>
