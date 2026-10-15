<script lang="ts">
  // range 封装，数值显示在滑块右侧；格式化策略集中在 src/lib/sliderFormat.ts。
  // runes 试点：$props + $bindable(value) + $derived(display)，输入经 oninput 回调通知。
  import { formatSliderValue, type SliderFormatOptions } from '../../lib/sliderFormat'

  interface SliderProps {
    value?: number
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    label?: string
    ariaLabel?: string
    inputId?: string
    /** 数值显示格式；默认 raw */
    format?: SliderFormatOptions['format']
    zeroLabel?: string
    countUnit?: string
    percentDigits?: number
    /** 输入回调，参数为解析后的数值 */
    oninput?: (value: number) => void
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    label = '',
    ariaLabel = undefined,
    inputId = undefined,
    format = 'raw',
    zeroLabel = undefined,
    countUnit = undefined,
    percentDigits = 0,
    oninput,
  }: SliderProps = $props()

  let display = $derived(formatSliderValue(value, { format, zeroLabel, countUnit, percentDigits }))

  function handleInput(event: Event) {
    value = Number((event.currentTarget as HTMLInputElement).value)
    oninput?.(value)
  }
</script>

<div class="ui-slider" class:disabled>
  {#if label}
    <span class="ui-slider-label">
      {label}
      <em class="ui-slider-value">{display}</em>
    </span>
  {/if}
  <input
    id={inputId}
    type="range"
    {min}
    {max}
    {step}
    {disabled}
    value={value}
    aria-label={ariaLabel ?? (label || undefined)}
    aria-valuetext={display}
    oninput={handleInput}
  />
</div>

<style>
  .ui-slider {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .ui-slider.disabled {
    opacity: 0.6;
  }

  .ui-slider-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    color: var(--sp-label, #334155);
    font-size: 14px;
    font-weight: 600;
  }

  .ui-slider-value {
    font-style: normal;
    color: var(--sp-accent, #2563eb);
    font-weight: 600;
  }

  .ui-slider input[type='range'] {
    width: 100%;
    box-sizing: border-box;
    padding: 0;
    accent-color: var(--sp-accent, #2563eb);
  }
</style>
