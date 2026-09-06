<script lang="ts">
  import {
    applyBackgroundPreset,
    cloneSettingsForm,
    getActiveGradientPresetId,
    markBackgroundPresetCustom,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import type { ThemeGradientPreset } from '../../lib/themePresets'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
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

<fieldset id="settings-section-appearance" class="group group-wide group-background" disabled={saving} on:change={() => form = cloneSettingsForm(form)}>
  <legend>配色方案</legend>
  <GradientPresetSelector
    {activeGradientPresetId}
    on:custom={selectCustomPreset}
    on:select={(event) => selectPreset(event.detail)}
  />
  {#if activeGradientPresetId === 'custom'}
    <div class="custom-accent-fields settings-grid">
      <div class="field field-color">
        <span>自定义浅色强调色</span>
        <ColorAlphaInput
          bind:value={form.custom_accent_color}
          placeholder="#2563eb"
          inputLabel="自定义浅色强调色值"
          swatchTitle="选择自定义浅色强调色"
          alphaText="自定义浅色强调色透明度"
        />
      </div>
      <div class="field field-color">
        <span>自定义深色强调色</span>
        <ColorAlphaInput
          bind:value={form.custom_dark_accent_color}
          placeholder="#7dd3fc"
          inputLabel="自定义深色强调色值"
          swatchTitle="选择自定义深色强调色"
          alphaText="自定义深色强调色透明度"
        />
      </div>
    </div>
  {/if}
</fieldset>

<style>
  .custom-accent-fields {
    margin-top: 10px;
  }
</style>
