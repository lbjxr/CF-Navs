<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { gradientPresets, type ThemeGradientPreset } from '../../lib/themePresets'

  export let activeGradientPresetId = 'custom'

  const dispatch = createEventDispatcher<{
    custom: void
    select: ThemeGradientPreset
  }>()

  $: glassPresets = gradientPresets.filter((preset) => preset.surface === 'glass')
  $: flatPresets = gradientPresets.filter((preset) => preset.surface === 'flat')
  $: presetGroups = [
    { label: '毛玻璃氛围', hint: '渐变背景、半透明卡片与柔和光晕', items: glassPresets },
    { label: '护眼纯色', hint: '低饱和纯色背景与不透明卡片', items: flatPresets },
  ]

  let presetsExpanded = false
</script>

<div class="gradient-preset-panel">
  <div class="gradient-preset-header">
    <div>
      <strong>内置配色方案</strong>
      <p>每套方案包含浅色/深色两种背景，选中后会一并套用遮罩和推荐的卡片透明度、文字颜色。</p>
    </div>
    {#if activeGradientPresetId === 'custom'}
      <span>自定义</span>
    {:else}
      <span>已选方案</span>
    {/if}
  </div>

  <div id="builtin-preset-groups" class="builtin-preset-groups">
  {#each presetGroups as group (group.label)}
    <div class="gradient-preset-group" class:collapsed={!presetsExpanded}>
      <div class="gradient-preset-group-title"><strong>{group.label}</strong><span>{group.hint}</span></div>
      <div class="gradient-preset-grid">
      {#each group.items as preset (preset.id)}
      <label
        class="gradient-preset-option"
        class:active={activeGradientPresetId === preset.id}
        style={`--preset-light-bg: ${preset.light.value}; --preset-dark-bg: ${preset.dark.value};`}
        title={`${preset.label}：${preset.description}`}
        aria-label={`${preset.label}：${preset.description}`}
      >
        <input
          type="radio"
          name="gradient-preset"
          checked={activeGradientPresetId === preset.id}
          on:change={() => dispatch('select', preset)}
        />
        <span class="preset-preview" aria-hidden="true">
          <span class="preset-swatch light"></span>
          <span class="preset-swatch dark"></span>
        </span>
        <span class="preset-copy">
          <strong>{preset.label}</strong>
          <small>{preset.description}</small>
        </span>
      </label>
      {/each}
      </div>
    </div>
  {/each}
  </div>

  <button
    type="button"
    class="preset-expand-toggle"
    aria-expanded={presetsExpanded}
    aria-controls="builtin-preset-groups"
    data-testid="gradient-preset-toggle"
    on:click={() => presetsExpanded = !presetsExpanded}
  >
    <span>{presetsExpanded ? '收起其他方案' : '查看更多方案'}</span>
    <span aria-hidden="true">{presetsExpanded ? '⌃' : '⌄'}</span>
  </button>

  <div class="gradient-preset-group">
    <div class="gradient-preset-group-title"><strong>自定义</strong><span>手动维护浅色/深色背景与卡片参数</span></div>
    <label class="gradient-preset-option custom" class:active={activeGradientPresetId === 'custom'}>
      <input
        type="radio"
        name="gradient-preset"
        checked={activeGradientPresetId === 'custom'}
        on:change={() => dispatch('custom')}
      />
      <span class="preset-preview custom-preview" aria-hidden="true">
        <span></span>
        <span></span>
      </span>
      <span class="preset-copy">
        <strong>自定义背景</strong>
        <small>分别设置浅色和深色背景，可使用纯色、渐变或图片。</small>
      </span>
    </label>
  </div>
</div>

<style>
  .gradient-preset-panel {
    display: grid;
    gap: 10px;
    min-width: 0;
    border: 1px solid var(--sp-gradient-panel-border);
    border-radius: 16px;
    padding: 12px;
    background: var(--sp-gradient-panel-bg);
  }

  .gradient-preset-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .gradient-preset-header strong {
    display: block;
    color: var(--sp-heading);
    font-size: 14px;
  }

  .gradient-preset-header p {
    margin: 4px 0 0;
    color: var(--sp-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .gradient-preset-header > span {
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--sp-chip-bg);
    color: var(--sp-chip-text);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }

  .gradient-preset-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .gradient-preset-group { display: grid; gap: 8px; }
  .builtin-preset-groups { display: grid; gap: 10px; }
  .gradient-preset-group.collapsed .gradient-preset-option:nth-child(n + 5) { display: none; }
  .gradient-preset-group-title { display: flex; align-items: baseline; gap: 10px; }
  .gradient-preset-group-title strong { color: var(--sp-heading); font-size: 13px; }
  .gradient-preset-group-title span { color: var(--sp-muted); font-size: 12px; }

  .gradient-preset-option {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    min-width: 0;
    min-height: 84px;
    border: 1px solid var(--sp-option-border);
    border-radius: 12px;
    padding: 8px 10px;
    background: var(--sp-option-bg);
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease,
      background 0.18s ease;
  }

  .preset-expand-toggle {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    padding: 2px 0;
    background: transparent;
    color: var(--sp-accent);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    cursor: pointer;
  }

  .preset-expand-toggle:focus-visible {
    outline: 2px solid var(--sp-accent);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .gradient-preset-option:hover {
    border-color: rgba(37, 99, 235, 0.42);
    box-shadow: 0 12px 26px rgba(30, 64, 175, 0.1);
    transform: translateY(-1px);
  }

  .gradient-preset-option.active {
    border-color: rgba(37, 99, 235, 0.72);
    background: var(--sp-option-bg-active);
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.1),
      0 14px 28px rgba(15, 23, 42, 0.1);
  }

  .gradient-preset-option.active::after {
    content: '';
    position: absolute;
    top: 9px;
    right: 9px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--sp-accent);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  }

  .gradient-preset-option:focus-within {
    border-color: rgba(37, 99, 235, 0.72);
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.13),
      0 10px 22px rgba(15, 23, 42, 0.08);
  }

  .gradient-preset-option input[type='radio'] {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .preset-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    height: 28px;
  }

  .preset-swatch,
  .custom-preview span {
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 10px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  }

  .preset-swatch.light {
    background: var(--preset-light-bg);
  }

  .preset-swatch.dark {
    background: var(--preset-dark-bg);
  }

  .custom-preview span:first-child {
    background:
      linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
      linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px;
  }

  .custom-preview span:last-child {
    background:
      linear-gradient(45deg, rgba(148, 163, 184, 0.22) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(148, 163, 184, 0.22) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.22) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.22) 75%);
    background-color: #0f172a;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px;
  }

  .preset-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .preset-copy strong {
    color: var(--sp-heading);
    font-size: 13px;
    line-height: 1.25;
  }

  .preset-copy small {
    color: var(--sp-muted);
    font-size: 12px;
    line-height: 1.35;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .gradient-preset-option:hover .preset-copy small,
  .gradient-preset-option:focus-within .preset-copy small {
    overflow: visible;
    display: block;
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  @media (max-width: 720px) {
    .gradient-preset-header {
      flex-direction: column;
    }

    .gradient-preset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .gradient-preset-group.collapsed .gradient-preset-option:nth-child(n + 3) {
      display: none;
    }
  }

  @media (max-width: 960px) and (min-width: 721px) {
    .gradient-preset-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .gradient-preset-group.collapsed .gradient-preset-option:nth-child(n + 4) { display: none; }
  }

  @media (max-width: 480px) {
    .gradient-preset-grid { grid-template-columns: 1fr; }
    .gradient-preset-group.collapsed .gradient-preset-option:nth-child(n + 2) { display: none; }
  }
</style>
