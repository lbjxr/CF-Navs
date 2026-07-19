<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte'
  import type { BackgroundSetting } from '../../../shared/types'
  import {
    backgroundTypeOptions,
    defaultDarkBackground,
    defaultDarkGradient,
    defaultLightBackground,
    defaultLightGradient,
    normalizeBackgroundValueForType,
  } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
  import GradientBackgroundInput from '../GradientBackgroundInput.svelte'

  export let theme: 'light' | 'dark'
  export let background: BackgroundSetting
  export let valid = true
  export let uploadHost = ''

  const dispatch = createEventDispatcher<{
    change: BackgroundSetting
    upload: void
  }>()

  $: isLight = theme === 'light'
  $: title = isLight ? '浅色模式背景' : '深色模式背景'
  $: badge = isLight ? 'Light' : 'Dark'
  $: hint = backgroundTypeOptions.find((option) => option.value === background.type)?.hint ?? ''
  $: colorPlaceholder = isLight ? '#f8fafc' : '#0f172a'
  $: imagePlaceholder = isLight
    ? 'https://img.example.com/light-bg.png'
    : 'https://img.example.com/dark-bg.png'
  $: imageInputLabel = isLight ? '浅色背景图片地址' : '深色背景图片地址'
  $: gradientDefaults = isLight ? defaultLightGradient : defaultDarkGradient
  $: defaults = isLight
    ? {
        color: defaultLightBackground.value,
        gradientStart: defaultLightGradient.start,
        gradientEnd: defaultLightGradient.end,
      }
    : {
        color: defaultDarkBackground.value,
        gradientStart: defaultDarkGradient.start,
        gradientEnd: defaultDarkGradient.end,
      }

  async function syncBackground(): Promise<void> {
    await tick()
    dispatch('change', { ...background })
  }

  function updateBackgroundType(nextType: BackgroundSetting['type']): void {
    background = {
      ...background,
      type: nextType,
      value: normalizeBackgroundValueForType(background.value, nextType, defaults),
    }
    dispatch('change', { ...background })
  }
</script>

<section class="theme-background-card">
  <div class="theme-background-header">
    <strong>{title}</strong>
    <span>{badge}</span>
  </div>

  <div class="background-form">
    <div class="background-main-row">
      <div class="field background-type-field">
        <span>背景类型</span>
        <div class="background-type-options" role="radiogroup" aria-label={`${title}背景类型`}>
          {#each backgroundTypeOptions as option}
            <label class:active={background.type === option.value} title={option.hint}>
              <input
                type="radio"
                name={`${theme}-background-type`}
                value={option.value}
                checked={background.type === option.value}
                on:change={() => updateBackgroundType(option.value)}
              />
              <span>{option.label}</span>
            </label>
          {/each}
        </div>
        <small class="background-type-hint">{hint}</small>
      </div>

      <div class="field background-value-field">
        <span>背景值</span>
        {#if background.type === 'color'}
          <ColorAlphaInput
            bind:value={background.value}
            on:change={() => void syncBackground()}
            placeholder={colorPlaceholder}
            inputLabel={`${title}颜色值`}
            swatchTitle={`选择${title}颜色`}
            alphaText={`${title}透明度`}
          />
        {:else if background.type === 'gradient'}
          <GradientBackgroundInput
            bind:value={background.value}
            on:change={() => void syncBackground()}
            defaultStart={gradientDefaults.start}
            defaultEnd={gradientDefaults.end}
            startLabel="起始颜色"
            endLabel="结束颜色"
          />
        {:else}
          <div class="inline-input">
            <input
              bind:value={background.value}
              type="text"
              on:input={() => void syncBackground()}
              placeholder={imagePlaceholder}
              aria-label={imageInputLabel}
            />
            {#if uploadHost}
              <button type="button" class="ghost-button" on:click={() => dispatch('upload')}>
                打开图床上传 ↗
              </button>
            {/if}
          </div>
        {/if}
        {#if background.type === 'color'}
          <small>支持 #hex、rgb() 和 rgba()，也可点击色块选择颜色。</small>
        {:else if background.type === 'gradient'}
          <small>使用两端颜色生成 CSS 渐变。</small>
        {:else}
          {#if uploadHost}
            <small>填写图片外链 URL，或打开已配置图床上传。</small>
          {:else}
            <small>填写图片外链 URL；配置图床地址后可快速打开上传页。</small>
          {/if}
        {/if}
        {#if !valid}
          <small class="warn">请填写{isLight ? '浅色' : '深色'}模式背景值。</small>
        {/if}
      </div>

      <div class="field background-mask-field">
        <span>遮罩颜色</span>
        <ColorAlphaInput
          bind:value={background.maskColor}
          bind:alpha={background.mask}
          on:change={() => void syncBackground()}
          placeholder={isLight ? '#ffffff' : '#000000'}
          inputLabel={`${title}遮罩颜色值`}
          swatchTitle={`选择${title}遮罩颜色`}
          alphaText={`${title}遮罩透明度`}
        />
        <small>{isLight ? '浅色模式通常使用白色或浅灰。' : '深色模式通常使用黑色或深蓝。'}</small>
      </div>
    </div>

    <div class="background-range-grid">
      <label class="field">
        <span>模糊度 <em>{background.blur}px</em></span>
        <input bind:value={background.blur} type="range" min="0" max="40" step="1" on:input={() => void syncBackground()} />
        <small>对图片/渐变背景应用模糊，0 表示不模糊。</small>
      </label>

      <label class="field">
        <span>遮罩透明度 <em>{background.mask.toFixed(2)}</em></span>
        <input bind:value={background.mask} type="range" min="0" max="1" step="0.05" on:input={() => void syncBackground()} />
        <small>叠加在背景上的遮罩，数值越大背景越淡。</small>
      </label>
    </div>
  </div>
</section>

<style>
  .theme-background-card {
    display: grid;
    gap: 10px;
    min-width: 0;
    border: 1px solid var(--sp-theme-card-border);
    border-radius: 14px;
    padding: 12px;
    background: var(--sp-theme-card-bg);
  }

  .theme-background-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .theme-background-header strong {
    color: var(--sp-heading);
    font-size: 14px;
  }

  .theme-background-header span {
    border-radius: 999px;
    background: var(--sp-chip-sky-bg);
    color: var(--sp-chip-sky-text);
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
  }

  .background-form {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .background-main-row {
    display: grid;
    grid-template-columns: minmax(120px, 0.55fr) minmax(220px, 1.45fr) minmax(190px, 1fr);
    gap: 10px;
    min-width: 0;
    align-items: start;
  }

  .background-range-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    min-width: 0;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .background-type-field,
  .background-value-field {
    min-width: 0;
    align-content: start;
  }

  .background-value-field {
    min-width: 0;
  }

  .background-type-hint {
    display: block;
    min-width: 0;
    font-size: 12px;
    line-height: 1.35;
  }

  .background-type-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    padding: 3px;
    background: var(--sp-input-bg);
  }

  .background-type-options label {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 32px;
    border-radius: 7px;
    color: var(--sp-muted);
    font-size: 12px;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }

  .background-type-options label.active {
    background: var(--sp-chip-bg);
    color: var(--sp-chip-text);
    font-weight: 650;
  }

  .background-type-options label span {
    color: inherit;
    font-size: 12px;
    font-weight: inherit;
  }

  .background-type-options input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .background-type-options label:focus-within {
    outline: 2px solid var(--sp-accent);
    outline-offset: 1px;
  }

  .background-mask-field {
    min-width: 0;
  }

  .background-value-field .inline-input {
    min-width: 0;
  }

  .background-value-field .ghost-button {
    flex: 0 0 auto;
    padding-inline: 12px;
  }

  .field span {
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
  }

  .field span em {
    font-style: normal;
    color: var(--sp-accent);
    font-weight: 600;
  }

  small {
    color: var(--sp-muted);
    line-height: 1.55;
  }

  small.warn {
    color: var(--sp-warn);
  }

  input:not([type='radio']):not([type='checkbox']) {
    --select-hover-border: var(--sp-input-hover-border);
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    padding: 9px 11px;
    font-size: 14px;
    color: var(--sp-input-text);
    background-color: var(--sp-input-bg);
    font-family: inherit;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }

  input[type='range'] {
    padding: 0;
    accent-color: var(--sp-accent);
  }

  input:focus {
    outline: none;
    border-color: var(--sp-accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .inline-input {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .inline-input input {
    flex: 1 1 0;
    min-width: 0;
  }

  .ghost-button {
    border: 1px solid var(--sp-input-border);
    border-radius: 10px;
    background: var(--sp-input-bg);
    color: var(--sp-text);
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
    white-space: nowrap;
  }

  .ghost-button:hover:not(:disabled) {
    border-color: var(--sp-input-hover-border);
    background: var(--sp-toggle-hover-bg);
  }

  .ghost-button:disabled,
  input:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 720px) {
    .background-main-row,
    .background-range-grid {
      grid-template-columns: 1fr;
    }

    .background-type-field,
    .background-type-options {
      width: 100%;
      min-width: 0;
    }

    .background-value-field .inline-input {
      align-items: stretch;
      flex-direction: column;
    }

    .background-value-field .ghost-button {
      width: 100%;
    }
  }

  @container settings-editor (max-width: 660px) {
    .background-main-row,
    .background-range-grid {
      grid-template-columns: 1fr;
    }

    .background-value-field .inline-input {
      align-items: stretch;
      flex-direction: column;
    }

    .background-value-field .ghost-button {
      width: 100%;
    }
  }
</style>
