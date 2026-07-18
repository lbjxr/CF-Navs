<script lang="ts">
  import { tick } from 'svelte'
  import type { BackgroundSetting } from '../../../shared/types'
  import {
    applyBackgroundPreset,
    applyCustomThemeBackground,
    cloneSettingsForm,
    getActiveGradientPresetId,
    markBackgroundPresetCustom,
    normalizeSettingsForm,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import type { ThemeGradientPreset } from '../../lib/themePresets'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
  import GradientPresetSelector from './GradientPresetSelector.svelte'
  import ThemeBackgroundCard from './ThemeBackgroundCard.svelte'

  export let form: SettingsFormModel
  export let saving = false
  export let advancedOpen = false
  export let onAdvancedChange: ((open: boolean) => void) | undefined = undefined

  $: normalizedForm = normalizeSettingsForm(form)
  $: lightBackgroundValid = normalizedForm.backgrounds.light.value.length > 0
  $: darkBackgroundValid = normalizedForm.backgrounds.dark.value.length > 0
  $: activeGradientPresetId = getActiveGradientPresetId(form)
  $: uploadHost = form.image_host_url.trim()

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function setAdvancedOpen(open: boolean): void {
    onAdvancedChange?.(open)
  }

  function selectCustomPreset(): void {
    form = markBackgroundPresetCustom(form)
    setAdvancedOpen(true)
  }

  function selectPreset(preset: ThemeGradientPreset): void {
    form = applyBackgroundPreset(form, preset)
    setAdvancedOpen(false)
  }

  function updateThemeBackground(theme: 'light' | 'dark', background: BackgroundSetting): void {
    form = applyCustomThemeBackground(form, theme, background)
    setAdvancedOpen(true)
  }

  function openUpload(): void {
    if (!uploadHost) return
    const base = uploadHost.endsWith('/') ? uploadHost.slice(0, -1) : uploadHost
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }
</script>

<fieldset id="settings-section-appearance" class="group group-wide group-background" disabled={saving}>
  <legend>配色方案</legend>
  <p class="group-desc">选择一套内置方案可同时配置浅色与深色背景，并匹配卡片表面和文字颜色。</p>

  <GradientPresetSelector
    {activeGradientPresetId}
    on:custom={selectCustomPreset}
    on:select={(event) => selectPreset(event.detail)}
  />

  <button
    type="button"
    class="advanced-toggle"
    aria-expanded={advancedOpen}
    aria-controls="settings-appearance-advanced settings-card-advanced"
    data-testid="appearance-advanced-toggle"
    on:click={() => setAdvancedOpen(!advancedOpen)}
  >
    <span>
      <strong>高级设置</strong>
      <small>标题、背景、图床、尺寸与卡片表面</small>
    </span>
    <span class="advanced-chevron" class:open={advancedOpen} aria-hidden="true">›</span>
  </button>

  {#if advancedOpen}
    <div id="settings-appearance-advanced" class="appearance-advanced" data-testid="appearance-advanced">
      <div class="advanced-heading">
        <h3>标题与背景</h3>
        <p>标题参数独立于配色方案；修改任一背景内容时，当前方案会自动切换为自定义。</p>
      </div>

      <div class="settings-grid title-settings-grid">
        <div class="field field-title-color">
          <span>首页标题颜色</span>
          <ColorAlphaInput
            bind:value={form.site_title_color}
            on:change={() => void syncForm()}
            placeholder="留空则跟随主题"
            inputLabel="首页标题颜色值"
            swatchTitle="选择首页标题颜色"
            alphaText="首页标题透明度"
          />
          <small>留空时跟随当前主题文字颜色；自定义颜色会同时用于浅色和深色模式。</small>
        </div>

        <label class="field field-title-size">
          <span>首页标题字号 <em>{form.site_title_font_size}px</em></span>
          <input
            bind:value={form.site_title_font_size}
            type="range"
            min="16"
            max="72"
            step="1"
            on:input={() => void syncForm()}
          />
          <small>仅调整首页主标题大小，不改变当前配色方案。</small>
        </label>

        <label class="field field-image-host">
          <span>图床地址（可选）</span>
          <input
            bind:value={form.image_host_url}
            type="url"
            placeholder="https://img.example.com"
            on:input={() => void syncForm()}
          />
          <small>背景类型为图片时，可从下方直接打开该图床的上传入口。</small>
        </label>
      </div>

      <div class="theme-background-grid">
        <ThemeBackgroundCard
          theme="light"
          background={form.backgrounds.light}
          valid={lightBackgroundValid}
          {uploadHost}
          on:change={(event) => updateThemeBackground('light', event.detail)}
          on:upload={openUpload}
        />

        <ThemeBackgroundCard
          theme="dark"
          background={form.backgrounds.dark}
          valid={darkBackgroundValid}
          {uploadHost}
          on:change={(event) => updateThemeBackground('dark', event.detail)}
          on:upload={openUpload}
        />
      </div>
    </div>
  {/if}
</fieldset>

<style>
  .advanced-toggle {
    width: 100%;
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 12px;
    padding: 10px 13px;
    background: var(--sp-toggle-bg);
    color: var(--sp-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .advanced-toggle:hover {
    border-color: color-mix(in srgb, var(--sp-accent) 34%, var(--sp-toggle-border));
    background: var(--sp-toggle-hover-bg);
  }

  .advanced-toggle:focus-visible {
    outline: 2px solid var(--sp-accent);
    outline-offset: 2px;
  }

  .advanced-toggle > span:first-child {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .advanced-toggle strong {
    color: var(--sp-strong);
    font-size: 14px;
  }

  .advanced-toggle small {
    color: var(--sp-muted);
    font-size: 12px;
    line-height: 1.35;
  }

  .advanced-chevron {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--sp-muted);
    font-size: 24px;
    transform: rotate(90deg);
    transition: transform 180ms ease;
  }

  .advanced-chevron.open {
    transform: rotate(-90deg);
  }

  .appearance-advanced {
    display: grid;
    gap: 16px;
    border-top: 1px solid var(--sp-subsection-border);
    padding-top: 18px;
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

  .field-title-color,
  .field-title-size,
  .field-image-host {
    grid-column: span 4;
  }

  .theme-background-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  @media (max-width: 960px) {
    .field-title-color,
    .field-title-size,
    .field-image-host {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 620px) {
    .field-title-color,
    .field-title-size,
    .field-image-host {
      grid-column: 1 / -1;
    }
  }
</style>
