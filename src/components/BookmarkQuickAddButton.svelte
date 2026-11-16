<svelte:options runes />

<script lang="ts">
  interface Props {
    onCreate?: () => void | Promise<void>
  }

  let { onCreate }: Props = $props()
</script>

<button type="button" class="primary-button" onclick={() => void onCreate?.()}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    <path d="M12 7v6M9 10h6" />
  </svg>
  新增书签
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: var(--control-padding-sm);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: #2563eb;
    color: #ffffff;
    font-size: var(--font-size-base);
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base);
  }

  button:hover {
    background: #1d4ed8;
  }

  button:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 3px;
  }

  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global([data-theme='dark']) button {
    border-color: rgba(147, 197, 253, 0.45);
  }

  :global([data-theme='dark']) button:focus-visible {
    outline-color: #93c5fd;
  }

  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
  }
</style>
