<script lang="ts">
  import { fly } from 'svelte/transition'
  import { toastStore } from '../lib/toast'

  let toasts = $derived($toastStore)

  function dismiss(id: string) {
    toastStore.dismissToast(id)
  }
</script>

{#if toasts.length > 0}
  <div class="toast-container" role="region" aria-label="通知">
    {#each toasts as toast (toast.id)}
      <div
        class="toast-item"
        class:toast-success={toast.type === 'success'}
        class:toast-error={toast.type === 'error'}
        class:toast-info={toast.type === 'info'}
        transition:fly={{ y: 16, duration: 220 }}
        role="status"
        aria-live="polite"
      >
        <span class="toast-message">{toast.message}</span>
        <button
          class="toast-dismiss"
          onclick={() => dismiss(toast.id)}
          aria-label="关闭通知"
        >×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 88px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 380px;
    pointer-events: none;
    width: auto;
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.45;
    box-shadow:
      0 4px 16px rgba(15, 23, 42, 0.12),
      0 1px 3px rgba(15, 23, 42, 0.06);
    pointer-events: auto;
    backdrop-filter: blur(8px);
  }

  .toast-success {
    color: #065f46;
    background: rgba(209, 250, 229, 0.92);
    border: 1px solid rgba(52, 211, 153, 0.4);
  }

  .toast-error {
    color: #991b1b;
    background: rgba(254, 226, 226, 0.92);
    border: 1px solid rgba(248, 113, 113, 0.4);
  }

  .toast-info {
    color: #1e40af;
    background: rgba(219, 234, 254, 0.92);
    border: 1px solid rgba(96, 165, 250, 0.4);
  }

  :global([data-theme='dark']) .toast-success {
    color: #6ee7b7;
    background: rgba(6, 78, 59, 0.9);
    border-color: rgba(52, 211, 153, 0.25);
  }

  :global([data-theme='dark']) .toast-error {
    color: #fca5a5;
    background: rgba(127, 29, 29, 0.9);
    border-color: rgba(248, 113, 113, 0.25);
  }

  :global([data-theme='dark']) .toast-info {
    color: #93c5fd;
    background: rgba(30, 58, 138, 0.9);
    border-color: rgba(96, 165, 250, 0.25);
  }

  .toast-message {
    flex: 1 1 0;
    min-width: 0;
  }

  .toast-dismiss {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.08);
    color: inherit;
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  .toast-dismiss:hover {
    background: rgba(0, 0, 0, 0.14);
  }

  :global([data-theme='dark']) .toast-dismiss {
    background: rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .toast-dismiss:hover {
    background: rgba(255, 255, 255, 0.18);
  }
</style>
