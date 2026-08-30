<script lang="ts">
  import { tick } from 'svelte'
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

  export let form: SettingsFormModel
  export let saving = false
  export let advancedOpen = false
  export let onAdvancedChange: ((open: boolean) => void) | undefined = undefined

  $: normalizedForm = normalizeSettingsForm(form)
  $: lightBackgroundValid = normalizedForm.backgrounds.light.value.length > 0
  $: darkBackgroundValid = normalizedForm.backgrounds.dark.value.length > 0
  $: uploadHost = form.image_host_url.trim()

  let activeTheme: 'light' | 'dark' = 'light'
  $: activeBackground = activeTheme === 'light' ? form.backgrounds.light : form.backgrounds.dark
  $: activeBackgroundValid = activeTheme === 'light' ? lightBackgroundValid : darkBackgroundValid

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function setAdvancedOpen(open: boolean): void {
    onAdvancedChange?.(open)
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

<fieldset
  id="settings-section-advanced"
  class="advanced-settings-section"
  aria-label="高级设置"
  disabled={saving}
  on:input={() => void syncForm()}
  on:change={() => void syncForm()}
>
  <button
    type="button"
    class="advanced-toggle"
    aria-expanded={advancedOpen}
    aria-controls="settings-appearance-advanced"
    data-testid="appearance-advanced-toggle"
    on:click={() => setAdvancedOpen(!advancedOpen)}
  >
    <span>
      <strong>{advancedOpen ? '收起高级设置' : '展开高级设置'}</strong>
      <small>背景、尺寸、卡片与分类视觉</small>
    </span>
    <span class="advanced-chevron" class:open={advancedOpen} aria-hidden="true">›</span>
  </button>

  {#if advancedOpen}
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
              on:change={(event) => updateThemeBackground(activeTheme, event.detail)}
              on:upload={openUpload}
            />
          {/key}
        </div>
      </div>

      <div class="settings-subsection">
        <h3>尺寸与密度</h3>
        <div class="settings-grid card-size-grid">
          <label class="field field-number" class:disabled={form.card_style !== 'info'} for="settings-card-width">
            <span>卡片最小宽度 <Tooltip text="控制一行能容纳的卡片数量，最小安全值为 44 px。" /></span>
            <InputGroup
              inputId="settings-card-width"
              type="number"
              min={44}
              max={400}
              step={1}
              suffixUnit="px"
              placeholder="默认 80"
              disabled={form.card_style !== 'info'}
              bind:value={form.card_size.width}
              ariaLabel="卡片最小宽度"
              on:input={() => void syncForm()}
            />
            {#if form.card_style === 'info' && form.card_size.width >= 44 && form.card_size.width < 80}
              <small class="warn">当前宽度低于 80 px，可能无法保证页面美观。</small>
            {:else if form.card_style === 'icon'}
              <small>极简风格下卡片大小由图标尺寸决定。</small>
            {/if}
          </label>
          <label class="field field-number" class:disabled={form.card_style !== 'info'} for="settings-card-height">
            <span>详情卡片最小高度</span>
            <InputGroup
              inputId="settings-card-height"
              type="number"
              min={0}
              max={300}
              step={10}
              suffixUnit="px"
              placeholder="0 为自适应"
              disabled={form.card_style !== 'info'}
              bind:value={form.card_size.height}
              ariaLabel="详情卡片最小高度"
              on:input={() => void syncForm()}
            />
          </label>
          <label class="field field-number" class:disabled={form.card_style !== 'icon'} for="settings-card-icon">
            <span>极简卡片图标大小</span>
            <InputGroup
              inputId="settings-card-icon"
              type="number"
              min={40}
              max={100}
              step={5}
              suffixUnit="px"
              placeholder="默认 60"
              disabled={form.card_style !== 'icon'}
              bind:value={form.card_icon_size}
              ariaLabel="极简卡片图标大小"
              on:input={() => void syncForm()}
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
              on:change={() => void syncForm()}
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
              on:input={() => void syncForm()}
            />
          </div>

          <div class="field field-color">
            <span>卡片文字颜色</span>
            <ColorAlphaInput
              bind:value={form.card_text_color}
              on:change={() => void syncForm()}
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
  {/if}
</fieldset>

<style>
  .advanced-settings-section {
    display: grid;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .advanced-toggle {
    width: 100%;
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid var(--sp-subsection-border);
    border-radius: 12px;
    padding: 10px 13px;
    background: var(--sp-toggle-bg);
    color: var(--sp-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color var(--transition-base), background var(--transition-base);
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
    transition: transform var(--transition-base);
  }

  .advanced-chevron.open {
    transform: rotate(-90deg);
  }

  .advanced-content {
    display: grid;
    gap: 18px;
    margin-top: 12px;
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
