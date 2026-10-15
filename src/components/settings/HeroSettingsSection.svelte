<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import Switch from '../ui/Switch.svelte'
  import Tooltip from '../ui/Tooltip.svelte'
  import Slider from '../ui/Slider.svelte'

  interface HeroSettingsSectionProps {
    form: SettingsFormModel
    saving?: boolean
  }

  let { form = $bindable(), saving = false }: HeroSettingsSectionProps = $props()

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function setField(key: 'site_title_show' | 'search_box_show' | 'search_engine_selector_show', value: boolean): void {
    form[key] = value
    void syncForm()
  }
</script>

<fieldset id="settings-section-search-display" class="group group-wide" disabled={saving}>
  <legend>首页显示</legend>
  <p class="group-desc">控制首页标题、搜索入口和「经常访问」区域的显示方式。</p>

  <div class="form-grid search-display-grid">
    <div class="field field-range">
      <Slider
        label="经常访问展示数量"
        format="count"
        zeroLabel="0 (隐藏)"
        countUnit="个"
        min={0}
        max={20}
        step={1}
        bind:value={form.most_visited_count}
        oninput={() => void syncForm()}
      />
    </div>

    <div class="field-switch field-toggle">
      <span class="switch-copy">显示站点标题</span>
      <Switch
        checked={form.site_title_show}
        ariaLabel="显示站点标题"
        onchange={(next) => setField('site_title_show', next)}
      />
    </div>

    <div class="field-switch field-toggle">
      <span class="switch-copy">显示搜索框</span>
      <Switch
        checked={form.search_box_show}
        ariaLabel="显示搜索框"
        onchange={(next) => setField('search_box_show', next)}
      />
    </div>

    <div class="field-switch field-toggle" class:disabled={!form.search_box_show}>
      <span class="switch-copy">显示引擎选择器 <Tooltip text="关闭后固定使用默认搜索引擎，不展示切换下拉框。" /></span>
      <Switch
        checked={form.search_engine_selector_show}
        disabled={saving || !form.search_box_show}
        ariaLabel="显示引擎选择器"
        onchange={(next) => setField('search_engine_selector_show', next)}
      />
    </div>
  </div>
</fieldset>

<style>
  .field-range {
    grid-column: 1 / -1;
  }

  .field-toggle {
    grid-column: span 4;
  }

  .field-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 12px;
    padding: 13px 15px;
    background: var(--sp-toggle-bg);
  }

  .field-switch.disabled {
    opacity: 0.58;
  }

  .switch-copy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
  }

  @media (max-width: 960px) {
    .field-toggle {
      grid-column: 1 / -1;
    }
  }
</style>
