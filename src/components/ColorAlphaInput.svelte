<script lang="ts">
  // runes 试点：$props + $bindable(value/alpha) + $derived + $effect.pre，
  // 颜色变更经 onchange 回调通知（替代 createEventDispatcher）。
  import {
    clampAlpha,
    cssColorIncludesAlpha,
    formatAlpha,
    formatCssColor,
    hsvToRgb,
    parseCssColor,
    rgbToHex,
    rgbToHsv,
  } from '../lib/color'

  interface ColorAlphaInputProps {
    value?: string
    /** 独立透明度绑定；null 表示透明度内嵌在 value 里 */
    alpha?: number | null
    placeholder?: string
    inputLabel?: string
    swatchTitle?: string
    hueText?: string
    alphaText?: string
    /** 颜色变更回调，参数为新的颜色值 */
    onchange?: (value: string) => void
  }

  let {
    value = $bindable('#ffffff'),
    alpha = $bindable<number | null>(null),
    placeholder = '#ffffff',
    inputLabel = '颜色值',
    swatchTitle = '打开颜色选择器',
    hueText = '色相',
    alphaText = '透明度',
    onchange,
  }: ColorAlphaInputProps = $props()

  type DragKind = 'area' | 'hue' | 'alpha'

  let shellEl: HTMLDivElement
  let pickerOpen = $state(false)
  let dragging: DragKind | null = null

  // 组件内 HSV 是唯一真值源，避免 hsv→rgb→hex→reparse→hsv 的回灌漂移与灰度丢色相。
  let hue = $state(0)
  let saturation = $state(0)
  let brightness = $state(100)
  let internalAlpha = $state(1)
  let hasParsedValue = $state(false)
  let lastEmitted = ''
  let lastParsedAlphaMode: boolean | null = null

  let effectiveAlpha = $derived(alpha ?? internalAlpha)

  // Sync external value or alpha-mode changes; ignore values emitted by this component.
  // $effect.pre 保留 legacy $: 的"DOM 更新前同步"时序。
  $effect.pre(() => {
    if (value !== lastEmitted || (alpha === null) !== lastParsedAlphaMode) {
      lastEmitted = value
      lastParsedAlphaMode = alpha === null
      const parsed = parseCssColor(value)
      hasParsedValue = Boolean(parsed)
      if (parsed) {
        const next = rgbToHsv(parsed.red, parsed.green, parsed.blue)
        // 灰度/黑色（s=0）时 rgbToHsv 的色相无意义，保留上一次色相避免指针跳回 0。
        if (next.s !== 0) hue = next.h
        saturation = next.s
        brightness = next.v
        if (alpha === null) {
          internalAlpha = parsed.alpha
        } else if (cssColorIncludesAlpha(value)) {
          alpha = parsed.alpha
          value = parsed.hex
          lastEmitted = parsed.hex
        }
      }
    }
  })

  let areaRgb = $derived(hsvToRgb(hue, 100, 100))
  let solidRgb = $derived(hsvToRgb(hue, saturation, brightness))
  let areaBackground = $derived(`rgb(${areaRgb.red}, ${areaRgb.green}, ${areaRgb.blue})`)
  let previewColor = $derived(hasParsedValue ? `rgba(${solidRgb.red}, ${solidRgb.green}, ${solidRgb.blue}, ${effectiveAlpha})` : 'transparent')
  let alphaFill = $derived(`linear-gradient(to right, rgba(${solidRgb.red}, ${solidRgb.green}, ${solidRgb.blue}, 0), rgb(${solidRgb.red}, ${solidRgb.green}, ${solidRgb.blue}))`)
  let pointerLeft = $derived(saturation)
  let pointerTop = $derived(100 - brightness)
  let hueLeft = $derived((hue / 360) * 100)
  let alphaLeft = $derived(effectiveAlpha * 100)

  function emit() {
    const rgb = hsvToRgb(hue, saturation, brightness)
    const hex = rgbToHex(rgb.red, rgb.green, rgb.blue)
    if (alpha === null) {
      internalAlpha = clampAlpha(internalAlpha)
      value = formatCssColor(hex, internalAlpha)
    } else {
      alpha = clampAlpha(alpha)
      value = hex
    }
    hasParsedValue = true
    lastEmitted = value
    onchange?.(value)
  }

  function setSaturationBrightness(nextS: number, nextV: number) {
    saturation = Math.min(100, Math.max(0, nextS))
    brightness = Math.min(100, Math.max(0, nextV))
    emit()
  }

  function setHue(nextH: number) {
    hue = Math.min(360, Math.max(0, nextH))
    emit()
  }

  function setAlpha(nextA: number) {
    const clamped = clampAlpha(nextA)
    if (alpha === null) {
      internalAlpha = clamped
    } else {
      alpha = clamped
    }
    emit()
  }

  function clamp01(input: number): number {
    return Math.min(1, Math.max(0, input))
  }

  function fractionOf(el: HTMLElement, clientX: number, clientY: number) {
    const rect = el.getBoundingClientRect()
    return {
      x: rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0,
      y: rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0,
    }
  }

  function applyDrag(kind: DragKind, el: HTMLElement, clientX: number, clientY: number) {
    const { x, y } = fractionOf(el, clientX, clientY)
    if (kind === 'area') {
      setSaturationBrightness(x * 100, (1 - y) * 100)
    } else if (kind === 'hue') {
      setHue(x * 360)
    } else {
      setAlpha(x)
    }
  }

  function handlePointerDown(kind: DragKind, event: PointerEvent) {
    event.preventDefault()
    const el = event.currentTarget as HTMLElement
    el.setPointerCapture?.(event.pointerId)
    el.focus()
    dragging = kind
    applyDrag(kind, el, event.clientX, event.clientY)
  }

  function handlePointerMove(kind: DragKind, event: PointerEvent) {
    if (dragging !== kind) return
    applyDrag(kind, event.currentTarget as HTMLElement, event.clientX, event.clientY)
  }

  function clearDrag() {
    dragging = null
  }

  function handlePointerUp(event: PointerEvent) {
    const el = event.currentTarget as HTMLElement
    el.releasePointerCapture?.(event.pointerId)
    clearDrag()
  }

  function handleTextInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const nextValue = input.value
    const parsed = parseCssColor(nextValue)

    if (parsed && alpha !== null) {
      // 独立 alpha 模式的 value 始终保持不带透明度的六位 hex；透明度另行绑定。
      if (cssColorIncludesAlpha(nextValue)) alpha = parsed.alpha
      value = parsed.hex
      // 当前 value 已相同时，Svelte 不会重写 input DOM，需覆盖用户刚输入的原文。
      input.value = parsed.hex
    } else {
      value = nextValue
    }
    onchange?.(value)
  }

  function handleAreaKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2
    if (event.key === 'ArrowLeft') setSaturationBrightness(saturation - step, brightness)
    else if (event.key === 'ArrowRight') setSaturationBrightness(saturation + step, brightness)
    else if (event.key === 'ArrowUp') setSaturationBrightness(saturation, brightness + step)
    else if (event.key === 'ArrowDown') setSaturationBrightness(saturation, brightness - step)
    else return
    event.preventDefault()
  }

  function handleHueKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 15 : 3
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setHue(hue - step)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setHue(hue + step)
    else return
    event.preventDefault()
  }

  function handleAlphaKeydown(event: KeyboardEvent) {
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setAlpha(effectiveAlpha - step)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setAlpha(effectiveAlpha + step)
    else return
    event.preventDefault()
  }

  function handlePointerCancel() {
    clearDrag()
  }

  function togglePicker() {
    pickerOpen = !pickerOpen
  }

  function closePicker() {
    clearDrag()
    pickerOpen = false
  }

  function handleWindowPointerDown(event: PointerEvent) {
    if (!pickerOpen || dragging) return
    if (shellEl && !shellEl.contains(event.target as Node)) {
      closePicker()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && pickerOpen) {
      closePicker()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onpointerdown={handleWindowPointerDown} />

<div class="color-input-shell" bind:this={shellEl}>
  <div class="color-picker-row">
    <input
      value={value}
      type="text"
      {placeholder}
      maxlength="40"
      aria-label={inputLabel}
      oninput={handleTextInput}
    />
    <button
      type="button"
      class="color-swatch"
      style="--swatch-color: {previewColor};"
      title={swatchTitle}
      aria-label={swatchTitle}
      aria-expanded={pickerOpen}
      onclick={togglePicker}
    ></button>
  </div>

  {#if pickerOpen}
    <div class="picker-popover">
      <div
        class="color-area"
        role="slider"
        tabindex="0"
        aria-label="饱和度与明度"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(saturation)}
        aria-valuetext="饱和度 {Math.round(saturation)}% 明度 {Math.round(brightness)}%"
        style="background-color: {areaBackground};"
        onpointerdown={(event) => handlePointerDown('area', event)}
        onpointermove={(event) => handlePointerMove('area', event)}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerCancel}
        onlostpointercapture={handlePointerCancel}
        onkeydown={handleAreaKeydown}
      >
        <div class="color-white-grad"></div>
        <div class="color-black-grad"></div>
        <div class="color-pointer" style="left: {pointerLeft}%; top: {pointerTop}%;"></div>
      </div>

      <div class="sliders-container">
        <div class="slider-row">
          <span>{hueText}</span>
          <div
            class="slider-track hue-track"
            role="slider"
            tabindex="0"
            aria-label={hueText}
            aria-valuemin="0"
            aria-valuemax="360"
            aria-valuenow={Math.round(hue)}
            onpointerdown={(event) => handlePointerDown('hue', event)}
            onpointermove={(event) => handlePointerMove('hue', event)}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerCancel}
            onlostpointercapture={handlePointerCancel}
            onkeydown={handleHueKeydown}
          >
            <div class="slider-thumb" style="left: {hueLeft}%;"></div>
          </div>
        </div>

        <div class="slider-row">
          <span>{alphaText} <em>{formatAlpha(effectiveAlpha)}</em></span>
          <div
            class="slider-track alpha-track"
            role="slider"
            tabindex="0"
            aria-label={alphaText}
            aria-valuemin="0"
            aria-valuemax="1"
            aria-valuenow={Number(effectiveAlpha.toFixed(2))}
            onpointerdown={(event) => handlePointerDown('alpha', event)}
            onpointermove={(event) => handlePointerMove('alpha', event)}
            onpointerup={handlePointerUp}
            onpointercancel={handlePointerCancel}
            onlostpointercapture={handlePointerCancel}
            onkeydown={handleAlphaKeydown}
          >
            <div class="alpha-checkerboard"></div>
            <div class="alpha-fill" style="background-image: {alphaFill};"></div>
            <div class="slider-thumb" style="left: {alphaLeft}%;"></div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .color-input-shell {
    position: relative;
    min-width: 0;
  }

  .color-picker-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .color-picker-row input[type='text'] {
    width: 100%;
    box-sizing: border-box;
    flex: 1;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  .color-picker-row input[type='text']:focus-visible {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .color-swatch {
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background:
      linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
      linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
    box-shadow: inset 0 0 0 3px #ffffff;
  }

  .color-swatch::after {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background: var(--swatch-color);
  }

  .color-swatch:hover,
  .color-swatch:focus-visible {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring), inset 0 0 0 3px #ffffff;
    outline: none;
  }

  .picker-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    width: min(240px, 86vw);
    box-sizing: border-box;
    display: grid;
    gap: 12px;
    border: 1px solid #dbe3ef;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
    padding: 14px;
  }

  .color-area {
    position: relative;
    height: 130px;
    border-radius: 8px;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }

  .color-area:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .color-white-grad {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #ffffff, rgba(255, 255, 255, 0));
  }

  .color-black-grad {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #000000, rgba(0, 0, 0, 0));
  }

  .color-pointer {
    position: absolute;
    width: 14px;
    height: 14px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .sliders-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #334155;
    font-weight: 600;
  }

  .slider-row > span {
    flex: 0 0 44px;
  }

  .slider-row span em {
    color: #2563eb;
    font-style: normal;
    font-variant-numeric: tabular-nums;
  }

  .slider-track {
    flex: 1;
    height: 12px;
    border-radius: 6px;
    position: relative;
    cursor: pointer;
    touch-action: none;
  }

  .slider-track:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .hue-track {
    background: linear-gradient(
      to right,
      #ff0000,
      #ffff00,
      #00ff00,
      #00ffff,
      #0000ff,
      #ff00ff,
      #ff0000
    );
  }

  .alpha-track {
    overflow: hidden;
  }

  .alpha-checkerboard {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
      linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0;
    background-size: 8px 8px;
  }

  .alpha-fill {
    position: absolute;
    inset: 0;
  }

  .slider-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    background: #ffffff;
    border: 1px solid #94a3b8;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
</style>
