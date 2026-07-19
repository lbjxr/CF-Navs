<script lang="ts">
  import {
    applyBackgroundPreset,
    getActiveGradientPresetId,
    markBackgroundPresetCustom,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import type { ThemeGradientPreset } from '../../lib/themePresets'
  import GradientPresetSelector from './GradientPresetSelector.svelte'

  export let form: SettingsFormModel
  export let saving = false
  export let onAdvancedChange: ((open: boolean) => void) | undefined = undefined

  $: activeGradientPresetId = getActiveGradientPresetId(form)

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
</script>

<fieldset id="settings-section-appearance" class="group group-wide group-background" disabled={saving}>
  <legend>配色方案</legend>
  <p class="group-desc">选择一套内置方案可同时配置浅色与深色背景，并匹配卡片表面和文字颜色。</p>

  <GradientPresetSelector
    {activeGradientPresetId}
    on:custom={selectCustomPreset}
    on:select={(event) => selectPreset(event.detail)}
  />
</fieldset>
