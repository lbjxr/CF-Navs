<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import { parseCssColor } from '../lib/color'

  export let value = ''
  export let defaultStart = '#1e3a8a'
  export let defaultEnd = '#0f172a'
  export let startLabel = '起始颜色'
  export let endLabel = '结束颜色'
  export let manualLabel = '完整渐变值'
  export let gradientPlaceholder = 'linear-gradient(135deg, #1e3a8a, #0f172a)'

  let startColor = defaultStart
  let endColor = defaultEnd
  let lastValue = ''
  const dispatch = createEventDispatcher<{ change: string }>()

  $: if (value !== lastValue) {
    syncStopsFromValue(value)
  }

  function syncStopsFromValue(nextValue: string) {
    const stops = parseGradientStops(nextValue)
    const directColor = parseCssColor(nextValue.trim()) ? nextValue.trim() : ''

    startColor = stops?.[0] ?? (directColor || defaultStart)
    endColor = stops?.[1] ?? defaultEnd
    lastValue = nextValue
  }

  function handleManualInput(event: Event) {
    const nextValue = (event.currentTarget as HTMLInputElement).value
    value = nextValue
    syncStopsFromValue(nextValue)
    dispatch('change', value)
  }

  function handleStartChange(event: CustomEvent<string>) {
    startColor = event.detail
    updateGradientFromStops()
  }

  function handleEndChange(event: CustomEvent<string>) {
    endColor = event.detail
    updateGradientFromStops()
  }

  function updateGradientFromStops() {
    const nextValue = `linear-gradient(135deg, ${startColor.trim() || defaultStart}, ${endColor.trim() || defaultEnd})`
    value = nextValue
    lastValue = nextValue
    dispatch('change', value)
  }

  function parseGradientStops(input: string): [string, string] | null {
    const trimmed = input.trim()
    const openIndex = trimmed.indexOf('(')
    const closeIndex = trimmed.lastIndexOf(')')
    if (openIndex < 0 || closeIndex <= openIndex || !/gradient$/i.test(trimmed.slice(0, openIndex).trim())) {
      return null
    }

    const args = splitTopLevelArgs(trimmed.slice(openIndex + 1, closeIndex))
    const colors = args
      .map((arg) => extractColorToken(arg))
      .filter((color): color is string => Boolean(color))

    if (colors.length < 2) return null
    return [colors[0], colors[colors.length - 1]]
  }

  function splitTopLevelArgs(input: string): string[] {
    const args: string[] = []
    let depth = 0
    let current = ''

    for (const char of input) {
      if (char === '(') depth += 1
      if (char === ')') depth = Math.max(0, depth - 1)

      if (char === ',' && depth === 0) {
        args.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    if (current.trim()) args.push(current.trim())
    return args
  }

  function extractColorToken(input: string): string | null {
    const trimmed = input.trim()
    const hexMatch = trimmed.match(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i)
    if (hexMatch && parseCssColor(hexMatch[0])) return hexMatch[0]

    const rgbPrefix = trimmed.match(/^rgba?\(/i)
    if (!rgbPrefix) return null

    let depth = 0
    for (let index = 0; index < trimmed.length; index += 1) {
      const char = trimmed[index]
      if (char === '(') depth += 1
      if (char === ')') {
        depth -= 1
        if (depth === 0) {
          const token = trimmed.slice(0, index + 1)
          return parseCssColor(token) ? token : null
        }
      }
    }

    return null
  }
</script>

<div class="gradient-input-shell">
  <div class="gradient-color-grid">
    <div class="gradient-color-field">
      <span>{startLabel}</span>
      <ColorAlphaInput
        bind:value={startColor}
        placeholder={defaultStart}
        inputLabel={startLabel}
        swatchTitle={`选择${startLabel}`}
        alphaText={`${startLabel}透明度`}
        on:change={handleStartChange}
      />
    </div>

    <div class="gradient-color-field">
      <span>{endLabel}</span>
      <ColorAlphaInput
        bind:value={endColor}
        placeholder={defaultEnd}
        inputLabel={endLabel}
        swatchTitle={`选择${endLabel}`}
        alphaText={`${endLabel}透明度`}
        on:change={handleEndChange}
      />
    </div>
  </div>

  <label class="gradient-manual-field">
    <span>{manualLabel}</span>
    <input value={value} type="text" placeholder={gradientPlaceholder} on:input={handleManualInput} />
  </label>
</div>

<style>
  .gradient-input-shell {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .gradient-color-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .gradient-color-field,
  .gradient-manual-field {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .gradient-color-field span,
  .gradient-manual-field span {
    color: #334155;
    font-size: 13px;
    font-weight: 600;
  }

  .gradient-manual-field input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  .gradient-manual-field input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  @media (max-width: 720px) {
    .gradient-color-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
