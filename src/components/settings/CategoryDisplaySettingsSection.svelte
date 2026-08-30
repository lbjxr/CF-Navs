<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import Slider from '../ui/Slider.svelte'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset class="group group-wide category-display-settings" disabled={saving} on:input={() => void syncForm()}>
  <legend>分类标题字体与图标</legend>
  <p class="group-desc">按分类层级统一调整首页、导航和搜索分组的标题字号与图标尺寸。移动端自动使用 0.88 缩放，不额外增加一套设置。</p>

  <div class="category-display-grid">
    <section class="category-display-level" aria-labelledby="category-display-root-title">
      <h3 id="category-display-root-title">一级分类</h3>
      <Slider
        label="标题字号"
        ariaLabel="一级分类标题字号"
        inputId="settings-category-root-font-size"
        min={12}
        max={28}
        step={1}
        format="px"
        bind:value={form.category_display.root_font_size}
      />
      <Slider
        label="图标尺寸"
        ariaLabel="一级分类图标尺寸"
        inputId="settings-category-root-icon-size"
        min={14}
        max={36}
        step={1}
        format="px"
        bind:value={form.category_display.root_icon_size}
      />
    </section>

    <section class="category-display-level" aria-labelledby="category-display-child-title">
      <h3 id="category-display-child-title">二级分类</h3>
      <Slider
        label="标题字号"
        ariaLabel="二级分类标题字号"
        inputId="settings-category-child-font-size"
        min={11}
        max={24}
        step={1}
        format="px"
        bind:value={form.category_display.child_font_size}
      />
      <Slider
        label="图标尺寸"
        ariaLabel="二级分类图标尺寸"
        inputId="settings-category-child-icon-size"
        min={12}
        max={32}
        step={1}
        format="px"
        bind:value={form.category_display.child_icon_size}
      />
    </section>
  </div>
</fieldset>

<style>
  .category-display-settings {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 18px;
    border: 1px solid var(--sp-group-border);
    border-radius: 16px;
    background: var(--sp-group-bg);
  }

  .category-display-settings legend {
    padding: 0 6px;
    color: var(--sp-strong);
    font-size: 15px;
    font-weight: 700;
  }

  .category-display-settings .group-desc {
    margin: 0;
  }

  .category-display-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
  }

  .category-display-level {
    display: grid;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--sp-subsection-border);
    border-radius: 12px;
    background: var(--sp-group-bg-strong);
  }

  .category-display-level h3 {
    margin: 0;
    color: var(--sp-strong);
    font-size: 13px;
  }

  @media (max-width: 620px) {
    .category-display-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
