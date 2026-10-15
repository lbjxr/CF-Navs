<script lang="ts">
  import { tick } from 'svelte'
  import { faviconImIcon } from '../../lib/icons'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import InputGroup from '../ui/InputGroup.svelte'

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

  function handleEngineSelection(event: Event): void {
    // 原生 select 先派发 input 再派发 change；Svelte 的 bind:value 只在 change 时提交，
    // 而 fieldset 的 on:input 会先 cloneSettingsForm（此刻 current 仍是旧值），把用户刚
    // 选中的选项在 change 到达前重置回旧值——表现为「选了没选中、保存按钮仍禁用」。
    // 在 select 自身（目标阶段，早于 fieldset 冒泡）于 input 阶段立即提交选择。
    const select = event.currentTarget as HTMLSelectElement
    form.search_engine.current = select.value
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
  oninput={() => void syncForm()}
  onchange={() => void syncForm()}
>
  <legend>搜索引擎</legend>
  <p class="group-desc">维护首页搜索框可切换的外部搜索引擎，查询模板中用 {'{q}'} 代表关键词。</p>

  <div class="settings-grid search-controls-grid">
    <label class="field field-select">
      <span>默认搜索引擎</span>
      <select
        class="native-select"
        bind:value={form.search_engine.current}
        disabled={form.search_engine.engines.length === 0}
        oninput={handleEngineSelection}
      >
        {#if form.search_engine.engines.length === 0}
          <option value="">无可用引擎</option>
        {:else}
          {#each form.search_engine.engines as engine, index (index)}
            {#if engine.name.trim()}
              <option value={engine.name}>{engine.name}</option>
            {/if}
          {/each}
        {/if}
      </select>
    </label>
  </div>

  <div class="engine-list">
    {#each form.search_engine.engines as engine, index (index)}
      <div class="engine-row">
        <label class="engine-cell">
          <span>名称</span>
          <input bind:value={engine.name} type="text" placeholder="引擎名称 (如 Google)" />
        </label>
        <label class="engine-cell">
          <span>图标 URL（可选）</span>
          <div class="engine-icon-control">
            <InputGroup
              type="url"
              bind:value={engine.icon}
              placeholder="图标链接"
              ariaLabel="图标链接"
              oninput={() => void syncForm()}
            >
              {#snippet suffix()}
              <button
                type="button"
                class="favicon-suffix-button"
                onclick={() => applyFaviconImIcon(index)}
                disabled={!faviconImIcon(engine.url_template)}
                aria-label="根据查询模板域名生成图标"
                title={faviconImIcon(engine.url_template)
                  ? '根据查询模板域名生成 Favicon.im 图标 URL'
                  : '请先填写有效的查询模板 URL'}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              {/snippet}
            </InputGroup>
            {#if canPreviewIcon(engine.icon)}
              <span class="engine-icon-preview" title="搜索引擎图标预览">
                <img src={engine.icon} alt="" loading="lazy" decoding="async" />
              </span>
            {/if}
          </div>
        </label>
        <label class="engine-cell grow">
          <span>搜索 URL 模板 (关键词用 {'{q}'} 代替)</span>
          <input
            bind:value={engine.url_template}
            type="text"
            placeholder="https://www.google.com/search?q={'{q}'}"
          />
        </label>
        <button
          type="button"
          class="engine-delete-button"
          onclick={() => removeEngine(index)}
          disabled={form.search_engine.engines.length <= 1}
          aria-label="删除"
          title="删除"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    {/each}
  </div>

  <button type="button" class="ghost-button add-engine" onclick={addEngine}>+ 添加搜索引擎</button>

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
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 7px;
    align-items: center;
    min-width: 0;
  }

  .engine-icon-control :global(.ui-input-group) {
    grid-column: 1;
  }

  .favicon-suffix-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--sp-muted, #64748b);
    transition: color var(--transition-base);
  }

  .favicon-suffix-button:hover:not(:disabled) {
    color: var(--sp-accent);
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

  .engine-delete-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    background: var(--sp-input-bg);
    color: var(--sp-muted, #64748b);
    cursor: pointer;
    transition:
      color var(--transition-base),
      border-color var(--transition-base),
      background var(--transition-base);
  }

  .engine-delete-button:hover:not(:disabled) {
    color: #dc2626;
    border-color: #dc2626;
    background: rgba(220, 38, 38, 0.08);
  }

  .engine-delete-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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
    .engine-delete-button {
      width: 100%;
    }
  }

  @media (max-width: 560px) {
    .engine-icon-control {
      grid-template-columns: minmax(0, 1fr) 36px;
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
    .engine-delete-button {
      width: 100%;
    }
  }
</style>
