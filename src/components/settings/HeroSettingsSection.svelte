<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-search-display" class="group group-wide" disabled={saving}>
  <legend>搜索显示</legend>
  <p class="group-desc">控制首页搜索区域及默认引擎入口是否向访客显示。</p>

  <div class="form-grid search-display-grid">
    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示搜索框</span>
        <p>关闭后首页隐藏整个搜索区域，只显示标题、导航与书签内容。</p>
      </div>
      <input
        bind:checked={form.search_box_show}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </label>

    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示引擎选择器</span>
        <p>关闭后搜索框直接使用下方设置的默认搜索引擎。</p>
      </div>
      <input
        bind:checked={form.search_engine_selector_show}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </label>
  </div>
</fieldset>

<style>
  .field-toggle {
    grid-column: span 6;
  }

  @media (max-width: 960px) {
    .field-toggle {
      grid-column: 1 / -1;
    }
  }
</style>
