<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-hero" class="group group-wide" disabled={saving}>
  <legend>标题与搜索</legend>
  <p class="group-desc">首页顶部大标题的展示效果，以及搜索区域的显示开关。</p>

  <div class="form-grid hero-grid">
    <div class="field field-color">
      <span>标题颜色</span>
      <ColorAlphaInput
        bind:value={form.site_title_color}
        on:change={() => void syncForm()}
        placeholder="留空则跟随主题"
        inputLabel="标题颜色值"
        swatchTitle="选择标题颜色"
        alphaText="标题透明度"
      />
      <small>留空时自动跟随当前主题的文字颜色，切换亮暗模式都能保持清晰。</small>
    </div>

    <label class="field field-range">
      <span>标题文字大小 <em>{form.site_title_font_size}px</em></span>
      <input
        bind:value={form.site_title_font_size}
        type="range"
        min="16"
        max="72"
        step="1"
        on:input={() => void syncForm()}
      />
      <small>首页大标题字号，建议 28-44px。</small>
    </label>

    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示搜索框</span>
        <p>关闭后首页只保留标题和书签列表。</p>
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
        <p>关闭后搜索框固定使用默认搜索引擎。</p>
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
  .field-color,
  .field-range,
  .field-toggle {
    grid-column: span 3;
  }

  @media (max-width: 960px) {
    .field-color,
    .field-range,
    .field-toggle {
      grid-column: 1 / -1;
    }
  }
</style>
