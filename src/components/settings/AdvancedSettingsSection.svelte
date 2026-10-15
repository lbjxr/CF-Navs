<script lang="ts">
  import { tick } from 'svelte'
  import {
    CARD_ICON_SIZE_LIMITS,
    CARD_SIZE_LIMITS,
  } from '../../../shared/settings'
  import type { BackgroundSetting } from '../../../shared/types'
  import {
    applyCustomThemeBackground,
    cloneSettingsForm,
    normalizeSettingsForm,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
  import ThemeBackgroundCard from './ThemeBackgroundCard.svelte'
  import CategoryDisplaySettingsSection from './CategoryDisplaySettingsSection.svelte'
  import InputGroup from '../ui/InputGroup.svelte'
  import Slider from '../ui/Slider.svelte'
  import Tooltip from '../ui/Tooltip.svelte'

  interface AdvancedSettingsSectionProps {
    /** 双向绑定：设置表单模型 */
    form: SettingsFormModel
    saving?: boolean
  }

  let { form = $bindable(), saving = false }: AdvancedSettingsSectionProps = $props()

  let normalizedForm = $derived(normalizeSettingsForm(form))
  let lightBackgroundValid = $derived(normalizedForm.backgrounds.light.value.length > 0)
  let darkBackgroundValid = $derived(normalizedForm.backgrounds.dark.value.length > 0)
  let uploadHost = $derived(form.image_host_url.trim())

  let activeTheme = $state<'light' | 'dark'>('light')
  let activeBackground = $derived(activeTheme === 'light' ? form.backgrounds.light : form.backgrounds.dark)
  let activeBackgroundValid = $derived(activeTheme === 'light' ? lightBackgroundValid : darkBackgroundValid)

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function updateThemeBackground(theme: 'light' | 'dark', background: BackgroundSetting): void {
    form = applyCustomThemeBackground(form, theme, background)
  }

  function openUpload(): void {
    if (!uploadHost) return
    const base = uploadHost.endsWith('/') ? uploadHost.slice(0, -1) : uploadHost
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }
</script>

<fieldset
  id="settings-section-advanced"
  class="advanced-settings-section"
  aria-label="高级设置"
  disabled={saving}
  oninput={() => void syncForm()}
  onchange={() => void syncForm()}
>
  <div id="settings-appearance-advanced" class="advanced-content" data-testid="appearance-advanced">
    <div class="settings-subsection">
      <div class="advanced-heading">
        <h3>背景设置</h3>
        <p>修改任一背景内容时，当前配色方案会自动切换为自定义。</p>
      </div>

      <div class="theme-tab-switcher segmented-control" role="tablist" aria-label="背景模式">
        <label class:active={activeTheme === 'light'}>
          <input type="radio" name="advanced-theme-tab" value="light" bind:group={activeTheme} />
          <span>浅色模式</span>
        </label>
        <label class:active={activeTheme === 'dark'}>
          <input type="radio" name="advanced-theme-tab" value="dark" bind:group={activeTheme} />
          <span>深色模式</span>
        </label>
      </div>

      <div class="theme-background-grid">
        {#key activeTheme}
          <ThemeBackgroundCard
            theme={activeTheme}
            background={activeBackground}
            valid={activeBackgroundValid}
            {uploadHost}
            onchange={(next) => updateThemeBackground(activeTheme, next)}
            onupload={openUpload}
          />
        {/key}
      </div>
    </div>

    <div class="settings-subsection">
      <h3>尺寸与密度</h3>
      <div class="settings-grid card-size-grid">
        <label class="field field-number" class:disabled={form.card_style !== 'info'} for="settings-card-width">
          <span>详情卡片列宽下限 <Tooltip text="控制一行能容纳的卡片数量；实际宽度会自动伸缩。最小值为 {CARD_SIZE_LIMITS.width.min} px。实测：约 68 px 以下详情卡只显示图标，标题与描述的可用宽度为 0；标题要到约 120 px 才完整显示。低于 44 px 时点击区域也会小于触控推荐尺寸。移动端另有 150 px 安全下限，不受此值影响。" /></span>
          <InputGroup
            inputId="settings-card-width"
            type="number"
            min={CARD_SIZE_LIMITS.width.min}
            max={CARD_SIZE_LIMITS.width.max}
            step={1}
            suffixUnit="px"
            placeholder="默认 160"
            disabled={form.card_style !== 'info'}
            bind:value={form.card_size.width}
            ariaLabel="详情卡片列宽下限"
            oninput={() => void syncForm()}
          />
          {#if form.card_style === 'info' && form.card_size.width >= CARD_SIZE_LIMITS.width.min && form.card_size.width <= 68}
            <small class="warn">当前宽度下详情卡只显示图标：标题与描述的可用宽度为 0。标题约需 120 px 才完整显示。移动端仍按 150 px 安全下限渲染。</small>
          {:else if form.card_style === 'info' && form.card_size.width < 80}
            <small class="warn">当前宽度低于 80 px，标题与描述会被截断，只显示开头几个字符。</small>
          {:else if form.card_style === 'icon'}
            <small>极简风格下卡片大小由图标尺寸决定。</small>
          {/if}
        </label>
        <label class="field field-number" class:disabled={form.card_style !== 'info'} for="settings-card-height">
          <span>详情卡片最小高度</span>
          <InputGroup
            inputId="settings-card-height"
            type="number"
            min={CARD_SIZE_LIMITS.height.min}
            max={CARD_SIZE_LIMITS.height.max}
            step={10}
            suffixUnit="px"
            placeholder="0 为自适应"
            disabled={form.card_style !== 'info'}
            bind:value={form.card_size.height}
            ariaLabel="详情卡片最小高度"
            oninput={() => void syncForm()}
          />
        </label>
        <label class="field field-number" class:disabled={form.card_style !== 'icon'} for="settings-card-icon">
          <span>极简卡片图标大小</span>
          <InputGroup
            inputId="settings-card-icon"
            type="number"
            min={CARD_ICON_SIZE_LIMITS.min}
            max={CARD_ICON_SIZE_LIMITS.max}
            step={5}
            suffixUnit="px"
            placeholder="默认 60"
            disabled={form.card_style !== 'icon'}
            bind:value={form.card_icon_size}
            ariaLabel="极简卡片图标大小"
            oninput={() => void syncForm()}
          />
        </label>
      </div>
    </div>

    <div class="settings-subsection">
      <h3>卡片表面</h3>
      <div class="settings-grid card-appearance-grid">
        <div class="field field-color">
          <span>卡片表面颜色 <Tooltip text="书签卡片的背景底色，配合不透明度实现毛玻璃质感。" /></span>
          <ColorAlphaInput
            bind:value={form.card_background_color}
            bind:alpha={form.card_background_opacity}
            onchange={() => void syncForm()}
            placeholder="#ffffff"
            inputLabel="卡片表面颜色值"
            swatchTitle="选择卡片表面颜色"
            alphaText="卡片表面透明度"
          />
        </div>

        <div class="field field-range">
          <Slider
            label="卡片不透明度"
            format="ratio-percent"
            min={0}
            max={1}
            step={0.05}
            bind:value={form.card_background_opacity}
            oninput={() => void syncForm()}
          />
        </div>

        <div class="field field-color">
          <span>卡片文字颜色</span>
          <ColorAlphaInput
            bind:value={form.card_text_color}
            onchange={() => void syncForm()}
            placeholder="留空跟随系统高对比色"
            inputLabel="卡片文字颜色值"
            swatchTitle="选择卡片文字颜色"
            alphaText="卡片文字透明度"
          />
        </div>
      </div>
    </div>

    <CategoryDisplaySettingsSection bind:form {saving} />
  </div>
</fieldset>

<style>
  .advanced-settings-section {
    display: grid;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .advanced-content {
    display: grid;
    gap: 18px;
  }

  .advanced-heading {
    display: grid;
    gap: 5px;
  }

  .advanced-heading h3,
  .advanced-heading p {
    margin: 0;
  }

  .advanced-heading h3 {
    color: var(--sp-strong);
    font-size: 14px;
  }

  .advanced-heading p {
    max-width: 72ch;
    color: var(--sp-muted);
    font-size: 12px;
    line-height: 1.55;
  }

  .field.disabled {
    opacity: 0.58;
  }

  .field-number,
  .card-size-grid .field-number,
  .field-color,
  .card-appearance-grid .field-color,
  .card-appearance-grid .field-range {
    grid-column: span 4;
  }

  .theme-background-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .theme-tab-switcher {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 12px;
  }

  @media (max-width: 960px) {
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 640px) {
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }
</style>
