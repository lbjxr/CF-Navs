<script lang="ts">
  // 统一行内开关。替换设置页原来的 .toggle-field + 原生 checkbox 大卡片。
  // 可访问：role="switch" / aria-checked，键盘 Space/Enter 可切换，支持 disabled。
  //
  // runes 试点：纯受控组件——父组件单向传入 checked，状态变更经 onchange 回调
  // 交给父组件更新；组件内部不再改写 checked。
  import type { Snippet } from 'svelte'

  interface SwitchProps {
    checked?: boolean
    disabled?: boolean
    label?: string
    /** 可选 id，便于外部 <label for> 或测试定位 */
    id?: string
    ariaLabel?: string
    /** 状态切换回调，参数为切换后的新值 */
    onchange?: (checked: boolean) => void
    children?: Snippet
  }

  let {
    checked = false,
    disabled = false,
    label = '',
    id = undefined,
    ariaLabel = undefined,
    onchange,
    children,
  }: SwitchProps = $props()

  function toggle() {
    if (disabled) return
    onchange?.(!checked)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (disabled) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      toggle()
    }
  }
</script>

<button
  {id}
  type="button"
  role="switch"
  class="ui-switch"
  class:checked
  aria-checked={checked}
  aria-label={ariaLabel ?? (label || undefined)}
  {disabled}
  onclick={toggle}
  onkeydown={handleKeydown}
>
  <span class="ui-switch-track" aria-hidden="true">
    <span class="ui-switch-thumb"></span>
  </span>
  {#if label}<span class="ui-switch-label">{label}</span>{/if}
  {@render children?.()}
</button>

<style>
  .ui-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .ui-switch:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .ui-switch-track {
    position: relative;
    flex: 0 0 auto;
    width: 40px;
    height: 22px;
    border-radius: 999px;
    background: var(--sp-input-border, #cbd5e1);
    transition: background var(--transition-base);
  }

  .ui-switch.checked .ui-switch-track {
    background: var(--sp-accent, #2563eb);
  }

  .ui-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
    transition: transform var(--transition-base);
  }

  .ui-switch.checked .ui-switch-thumb {
    transform: translateX(18px);
  }

  .ui-switch:focus-visible {
    outline: none;
  }

  .ui-switch:focus-visible .ui-switch-track {
    outline: 2px solid var(--sp-accent, #2563eb);
    outline-offset: 2px;
  }

  .ui-switch-label {
    font-size: 14px;
    color: var(--sp-label, #334155);
  }
</style>
