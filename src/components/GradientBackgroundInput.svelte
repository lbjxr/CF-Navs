<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import { parseCssColor } from '../lib/color'

  export let value = ''
  export let defaultStart = '#1e3a8a'
  export let defaultEnd = '#0f172a'
  export let startLabel = '起始颜色'
  export let endLabel = '结束颜色'

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
      <ColorAlphaInput
        bind:value={startColor}
        placeholder={defaultStart}
        inputLabel={startLabel}
        swatchTitle={`选择${startLabel}`}
        alphaText={`${startLabel}透明度`}
        on:change={handleStartChange}
      />
      <span class="gradient-color-label">{startLabel}</span>
    </div>

    <div class="gradient-color-field">
      <ColorAlphaInput
        bind:value={endColor}
        placeholder={defaultEnd}
        inputLabel={endLabel}
        swatchTitle={`选择${endLabel}`}
        alphaText={`${endLabel}透明度`}
        on:change={handleEndChange}
      />
      <span class="gradient-color-label">{endLabel}</span>
    </div>
  </div>

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

  .gradient-color-field {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .gradient-color-label {
    color: var(--sp-muted, #64748b);
    font-size: 12px;
    line-height: 1.4;
  }

  @media (max-width: 720px) {
    .gradient-color-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
