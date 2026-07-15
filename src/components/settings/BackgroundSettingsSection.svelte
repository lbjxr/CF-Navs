<script lang="ts">
  import { tick } from 'svelte'
  import type { BackgroundSetting } from '../../../shared/types'
  import {
    cloneBackgroundSetting,
    cloneSettingsForm,
    getActiveGradientPresetId,
    normalizeSettingsForm,
    themeOptions,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import type { ThemeGradientPreset } from '../../lib/themePresets'
  import GradientPresetSelector from './GradientPresetSelector.svelte'
  import ThemeBackgroundCard from './ThemeBackgroundCard.svelte'

  export let form: SettingsFormModel
  export let saving = false

  $: normalizedForm = normalizeSettingsForm(form)
  $: lightBackgroundValid = normalizedForm.backgrounds.light.value.length > 0
  $: darkBackgroundValid = normalizedForm.backgrounds.dark.value.length > 0
  $: activeGradientPresetId = getActiveGradientPresetId(form)
  $: uploadHost = form.image_host_url.trim()
  $: currentThemeHint = themeOptions.find((option) => option.value === form.theme)?.hint ?? ''

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  function markCustomGradientPreset(): void {
    const next = cloneSettingsForm(form)
    next.background_preset_id = 'custom'
    form = next
  }

  function applyGradientPreset(preset: ThemeGradientPreset): void {
    const next = cloneSettingsForm(form)
    next.background_preset_id = preset.id
    next.backgrounds = {
      light: cloneBackgroundSetting(preset.light),
      dark: cloneBackgroundSetting(preset.dark),
    }
    next.background = cloneBackgroundSetting(next.theme === 'dark' ? preset.dark : preset.light)
    next.card_background_color = preset.cardBackgroundColor
    next.card_background_opacity = preset.cardBackgroundOpacity
    next.card_text_color = preset.cardTextColor
    next.site_title_color = preset.siteTitleColor
    form = next
  }

  function applyThemeBackground(theme: 'light' | 'dark', background: BackgroundSetting): void {
    const next = cloneSettingsForm(form)
    next.background_preset_id = 'custom'
    next.backgrounds[theme] = cloneBackgroundSetting(background)
    next.background = cloneBackgroundSetting(next.theme === 'dark' ? next.backgrounds.dark : next.backgrounds.light)
    form = next
  }

  function openUpload(): void {
    if (!uploadHost) return
    const base = uploadHost.endsWith('/') ? uploadHost.slice(0, -1) : uploadHost
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }
</script>

<fieldset id="settings-section-appearance" class="group group-wide group-background" disabled={saving}>
  <legend>外观主题</legend>
  <p class="group-desc">先选主题模式，再挑一套配色方案；也可以分别自定义浅色和深色背景。</p>

  <div class="theme-mode-row">
    <div class="field theme-mode-field">
      <span class="field-label">主题模式</span>
      <div class="segmented-control" role="radiogroup" aria-label="主题模式">
        {#each themeOptions as option (option.value)}
          <label class:active={form.theme === option.value}>
            <input
              type="radio"
              bind:group={form.theme}
              value={option.value}
              on:change={() => void syncForm()}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
      <small>{currentThemeHint}前台右上角仍可随时临时切换亮暗。</small>
    </div>
  </div>

  <GradientPresetSelector
    {activeGradientPresetId}
    on:custom={() => markCustomGradientPreset()}
    on:select={(event) => applyGradientPreset(event.detail)}
  />

  <div class="theme-background-grid">
    <ThemeBackgroundCard
      theme="light"
      background={form.backgrounds.light}
      valid={lightBackgroundValid}
      {uploadHost}
      on:change={(event) => applyThemeBackground('light', event.detail)}
      on:upload={openUpload}
    />

    <ThemeBackgroundCard
      theme="dark"
      background={form.backgrounds.dark}
      valid={darkBackgroundValid}
      {uploadHost}
      on:change={(event) => applyThemeBackground('dark', event.detail)}
      on:upload={openUpload}
    />
  </div>
</fieldset>

<style>
  .theme-mode-row {
    display: grid;
    grid-template-columns: minmax(260px, 420px);
  }

  .segmented-control {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .theme-background-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 12px;
  }

  @media (max-width: 960px) {
    .theme-mode-row {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .theme-background-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
