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

  export let form: SettingsFormModel
  export let saving = false
  export let advancedOpen = false
  export let onAdvancedChange: ((open: boolean) => void) | undefined = undefined

  $: normalizedForm = normalizeSettingsForm(form)
  $: lightBackgroundValid = normalizedForm.backgrounds.light.value.length > 0
  $: darkBackgroundValid = normalizedForm.backgrounds.dark.value.length > 0
  $: uploadHost = form.image_host_url.trim()

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
      <small>标题、背景、图床、尺寸与卡片表面</small>
    </span>
    <span class="advanced-chevron" class:open={advancedOpen} aria-hidden="true">›</span>
  </button>

  {#if advancedOpen}
    <div id="settings-appearance-advanced" class="advanced-content" data-testid="appearance-advanced">
      <div class="settings-subsection">
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
            <input bind:value={form.site_title_font_size} type="range" min="16" max="72" step="1" />
            <small>仅调整首页主标题大小，不改变当前配色方案。</small>
          </label>

          <label class="field field-image-host">
            <span>图床地址（可选）</span>
            <input bind:value={form.image_host_url} type="url" placeholder="https://img.example.com" />
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

      <div class="settings-subsection">
        <h3>尺寸与密度</h3>
        <div class="settings-grid card-size-grid">
          <label class="field field-number">
            <span>卡片最小宽度 (px)</span>
            <input bind:value={form.card_size.width} type="number" min="80" max="400" step="10" />
            <small>数值越小，每行可排列的卡片越多。</small>
          </label>
          <label class="field field-number" class:disabled={form.card_style !== 'info'}>
            <span>详情卡片最小高度 (px)</span>
            <input bind:value={form.card_size.height} type="number" min="0" max="300" step="10" disabled={form.card_style !== 'info'} />
            <small>仅影响详情风格；设置为 0 时由内容决定高度。</small>
          </label>
          <label class="field field-number" class:disabled={form.card_style !== 'icon'}>
            <span>极简卡片图标大小 (px)</span>
            <input bind:value={form.card_icon_size} type="number" min="40" max="100" step="5" disabled={form.card_style !== 'icon'} />
            <small>控制极简风格中图标卡片的边长。</small>
          </label>
        </div>
      </div>

      <div class="settings-subsection">
        <h3>卡片表面</h3>
        <div class="settings-grid card-appearance-grid">
          <div class="field field-color">
            <span>卡片表面颜色</span>
            <ColorAlphaInput
              bind:value={form.card_background_color}
              bind:alpha={form.card_background_opacity}
              on:change={() => void syncForm()}
              placeholder="#ffffff"
              inputLabel="卡片表面颜色值"
              swatchTitle="选择卡片表面颜色"
              alphaText="卡片表面透明度"
            />
            <small>作为卡片的基础色；内置方案会提供一组匹配值。</small>
          </div>

          <label class="field field-range">
            <span>卡片不透明度 <em>{form.card_background_opacity.toFixed(2)}</em></span>
            <input bind:value={form.card_background_opacity} type="range" min="0" max="1" step="0.05" />
            <small>数值越低越通透，背景内容会更明显。</small>
          </label>

          <div class="field field-color">
            <span>卡片文字颜色</span>
            <ColorAlphaInput
              bind:value={form.card_text_color}
              on:change={() => void syncForm()}
              placeholder="留空则跟随主题"
              inputLabel="卡片文字颜色值"
              swatchTitle="选择卡片文字颜色"
              alphaText="卡片文字透明度"
            />
            <small>留空时分别使用适合浅色和深色模式的高对比文字。</small>
          </div>
        </div>
      </div>
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

  .field-title-color,
  .field-title-size,
  .field-image-host,
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

  @media (max-width: 960px) {
    .field-title-color,
    .field-title-size,
    .field-image-host,
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 640px) {
    .field-title-color,
    .field-title-size,
    .field-image-host,
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }
</style>
