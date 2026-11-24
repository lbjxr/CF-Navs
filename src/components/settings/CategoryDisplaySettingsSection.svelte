<svelte:options runes />

<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import Slider from '../ui/Slider.svelte'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
  import { assessTextContrast } from '../../lib/colorContrast'

  interface Props {
    /** SettingsPanel 以 `bind:form` 传入；写回字段或整体替换都经 bindable setter 通知父组件。 */
    form: SettingsFormModel
    saving?: boolean
  }

  let { form = $bindable(), saving = false }: Props = $props()
  const hintId = $props.id()

  function contrastHint(color: string): string {
    if (!color.trim()) return ''
    if (form.custom_css.trim()) return '已配置自定义 CSS，可能改变文字与背景；无法自动确认实际对比，请在首页检查。可留空跟随主题。'
    let low = false
    const readings = (['light', 'dark'] as const).map((theme) => {
      const label = theme === 'light' ? '浅色' : '深色'
      const reading = assessTextContrast(color, form.backgrounds[theme])
      if (reading.ratio === null) {
        const background = reading.reason === 'image' ? '图片背景' : reading.reason === 'gradient' ? '渐变背景' : '当前颜色或透明背景'
        return `${label}：${background}无法自动确认，请在实际首页检查`
      }
      low ||= reading.ratio < 4.5
      return `${label}首页背景（含遮罩）：${reading.ratio.toFixed(2)}:1`
    })
    return `${readings.join('；')}。${low ? '对比度不足（目标 4.5:1），可留空跟随主题，或调整文字颜色后复查。' : '普通文字目标为 4.5:1；比值仅适用于已知的背景与遮罩。'}自定义 CSS 可能改变实际背景，请在首页复查。`
  }

  const rootHint = $derived(contrastHint(form.category_display.root_title_color))
  const childHint = $derived(contrastHint(form.category_display.child_title_color))

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset class="group group-wide category-display-settings" disabled={saving} oninput={() => void syncForm()}>
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
      <div class="category-color-field">
        <span>标题颜色</span>
        <ColorAlphaInput
          bind:value={form.category_display.root_title_color}
          onchange={() => void syncForm()}
          placeholder="留空跟随主题色"
          inputLabel="一级分类标题颜色值"
          ariaDescribedby={rootHint ? `${hintId}-root` : undefined}
        />
        {#if rootHint}<p id={`${hintId}-root`} class="contrast-hint" data-testid="category-root-contrast">{rootHint}</p>{/if}
      </div>
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
      <div class="category-color-field">
        <span>标题颜色</span>
        <ColorAlphaInput
          bind:value={form.category_display.child_title_color}
          onchange={() => void syncForm()}
          placeholder="留空跟随主题色"
          inputLabel="二级分类标题颜色值"
          ariaDescribedby={childHint ? `${hintId}-child` : undefined}
        />
        {#if childHint}<p id={`${hintId}-child`} class="contrast-hint" data-testid="category-child-contrast">{childHint}</p>{/if}
      </div>
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

  .category-color-field {
    display: grid;
    gap: 6px;
  }

  .category-color-field span {
    color: var(--sp-strong);
    font-size: 12px;
    font-weight: 600;
  }

  .contrast-hint {
    margin: 0;
    color: var(--sp-muted);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  @media (max-width: 620px) {
    .category-display-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
