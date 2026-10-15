<script lang="ts">
  // 数值/文本 + 后缀（单位或操作按钮）的一体化输入组。
  // 取代分散的 .inline-input + 外置按钮写法。
  // 用法：
  //   <InputGroup bind:value type="number" suffixUnit="px" />           常驻单位后缀
  //   <InputGroup bind:value>                                            默认 snippet 放单位下拉
  //     {#snippet suffix()}<select ...>...</select>{/snippet}
  //   </InputGroup>
  //   <InputGroup bind:value>                                            内部后缀按钮
  //     {#snippet suffix()}<button ...>抓取</button>{/snippet}
  //   </InputGroup>
  //
  // runes 试点：$props + $bindable(value)，输入经 oninput 回调通知。
  // suffix 后缀区使用 snippet（替代 legacy 具名 slot）。
  import type { Snippet } from 'svelte'

  interface InputGroupProps {
    value?: string | number
    type?: 'text' | 'number' | 'url'
    placeholder?: string
    disabled?: boolean
    min?: number
    max?: number
    step?: number
    ariaLabel?: string
    inputId?: string
    /** 常驻单位后缀文本（如 px / %）；与 suffix snippet 二选一 */
    suffixUnit?: string
    /** 后缀区 snippet（如单位下拉或操作按钮） */
    suffix?: Snippet
    /** 输入回调，参数为解析后的值 */
    oninput?: (value: string | number) => void
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder = '',
    disabled = false,
    min = undefined,
    max = undefined,
    step = undefined,
    ariaLabel = undefined,
    inputId = undefined,
    suffixUnit = undefined,
    suffix,
    oninput,
  }: InputGroupProps = $props()

  function handleInput(event: Event) {
    const raw = (event.currentTarget as HTMLInputElement).value
    value = type === 'number' ? (raw === '' ? '' : Number(raw)) : raw
    oninput?.(value)
  }
</script>

<div class="ui-input-group" class:disabled>
  <input
    id={inputId}
    class="ui-input-group-field"
    {type}
    {placeholder}
    {disabled}
    {min}
    {max}
    {step}
    value={value === '' ? '' : value}
    aria-label={ariaLabel}
    oninput={handleInput}
  />
  {#if suffixUnit}
    <span class="ui-input-group-unit" aria-hidden="true">{suffixUnit}</span>
  {:else}
    <span class="ui-input-group-suffix">{@render suffix?.()}</span>
  {/if}
</div>

<style>
  .ui-input-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--sp-input-border, #cbd5e1);
    border-radius: 10px;
    background: var(--sp-input-bg, #ffffff);
    overflow: hidden;
    transition:
      border-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .ui-input-group:focus-within {
    border-color: var(--sp-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .ui-input-group.disabled {
    opacity: 0.6;
  }

  .ui-input-group-field {
    flex: 1 1 0;
    min-width: 0;
    border: 0;
    padding: 9px 11px;
    font-size: 14px;
    font-family: inherit;
    color: var(--sp-input-text, #0f172a);
    background: transparent;
  }

  .ui-input-group-field:focus {
    outline: none;
  }

  .ui-input-group-unit {
    display: inline-flex;
    align-items: center;
    padding: 0 11px;
    font-size: 13px;
    color: var(--sp-muted, #64748b);
    border-left: 1px solid var(--sp-input-border, #cbd5e1);
    background: var(--sp-toggle-bg, #f8fafc);
  }

  .ui-input-group-suffix {
    display: inline-flex;
    align-items: center;
  }

  /* 后缀按钮（内部操作按钮）由 slot 提供，这里给它一个贴边样式钩子 */
  .ui-input-group-suffix :global(button),
  .ui-input-group-suffix :global(select) {
    height: 100%;
    border: 0;
    border-left: 1px solid var(--sp-input-border, #cbd5e1);
    border-radius: 0;
    background: var(--sp-toggle-bg, #f8fafc);
    color: var(--sp-text, #0f172a);
    padding: 0 12px;
    font-size: 13px;
    cursor: pointer;
  }

  .ui-input-group-suffix :global(button:disabled) {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
