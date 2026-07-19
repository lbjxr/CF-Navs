<script lang="ts">
  export let open = false
  export let title = ''
  export let message = ''
  export let itemTitle = ''
  export let confirmLabel = '确认'
  export let cancelLabel = '取消'
  export let loading = false
  export let variant: 'default' | 'danger' = 'default'
  export let confirmDisabled = false
  export let onConfirm: (() => void | Promise<void>) | undefined = undefined
  export let onCancel: (() => void | Promise<void>) | undefined = undefined

  $: isDanger = variant === 'danger'

  function handleCancel() {
    if (loading) return
    void onCancel?.()
  }

  function handleConfirm() {
    if (loading || confirmDisabled) return
    void onConfirm?.()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!open || loading) return

    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      handleConfirm()
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="confirm-backdrop">
    <button
      type="button"
      class="confirm-scrim"
      aria-label="取消确认"
      on:click={handleCancel}
      disabled={loading}
    ></button>

    <section
      class="confirm-dialog"
      class:is-danger={isDanger}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <div class="confirm-mark" aria-hidden="true">
        <span>!</span>
      </div>

      <div class="confirm-copy">
        <p class="confirm-eyebrow">二次确认</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{message}</p>

        {#if itemTitle}
          <div class="confirm-target">
            <span>目标</span>
            <strong>{itemTitle}</strong>
          </div>
        {/if}
      </div>

      <div class="confirm-actions">
        <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading}>
          {cancelLabel}
        </button>
        <button type="button" class="confirm-button" on:click={handleConfirm} disabled={loading || confirmDisabled}>
          {#if loading}处理中...{:else}{confirmLabel}{/if}
        </button>
      </div>
    </section>
  </div>
{/if}

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: grid;
    place-items: center;
    padding: 16px;
    background:
      radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.16), transparent 34%),
      rgba(15, 23, 42, 0.54);
    backdrop-filter: blur(10px) saturate(1.08);
    -webkit-backdrop-filter: blur(10px) saturate(1.08);
    overscroll-behavior: contain;
  }

  .confirm-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    border-radius: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }

  .confirm-dialog {
    --confirm-accent: #2563eb;
    --confirm-accent-soft: rgba(37, 99, 235, 0.1);
    --confirm-accent-border: rgba(37, 99, 235, 0.24);
    --confirm-surface: rgba(255, 255, 255, 0.96);
    --confirm-surface-strong: #ffffff;
    --confirm-border: rgba(226, 232, 240, 0.9);
    --confirm-text: #0f172a;
    --confirm-muted: #64748b;
    --confirm-shadow: 0 28px 72px rgba(15, 23, 42, 0.28);
    width: min(440px, 100%);
    box-sizing: border-box;
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 16px;
    border: 1px solid var(--confirm-border);
    border-radius: 22px;
    padding: 20px;
    background: var(--confirm-surface);
    box-shadow: var(--confirm-shadow);
    color: var(--confirm-text);
    animation: confirm-pop 0.18s ease-out;
  }

  .confirm-dialog.is-danger {
    --confirm-accent: #dc2626;
    --confirm-accent-soft: rgba(220, 38, 38, 0.1);
    --confirm-accent-border: rgba(220, 38, 38, 0.24);
  }

  :global([data-theme='dark']) .confirm-dialog {
    --confirm-accent: #7dd3fc;
    --confirm-accent-soft: rgba(125, 211, 252, 0.12);
    --confirm-accent-border: rgba(125, 211, 252, 0.26);
    --confirm-surface: rgba(15, 23, 42, 0.94);
    --confirm-surface-strong: rgba(30, 41, 59, 0.7);
    --confirm-border: rgba(148, 163, 184, 0.22);
    --confirm-text: #e5eefb;
    --confirm-muted: #94a3b8;
    --confirm-shadow: 0 30px 82px rgba(0, 0, 0, 0.44);
  }

  :global([data-theme='dark']) .confirm-dialog.is-danger {
    --confirm-accent: #f87171;
    --confirm-accent-soft: rgba(248, 113, 113, 0.13);
    --confirm-accent-border: rgba(248, 113, 113, 0.3);
  }

  .confirm-mark {
    width: 44px;
    height: 44px;
    border: 1px solid var(--confirm-accent-border);
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--confirm-accent-soft);
    color: var(--confirm-accent);
    font-size: 22px;
    font-weight: 800;
    line-height: 1;
  }

  .confirm-copy {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .confirm-eyebrow {
    margin: 0;
    color: var(--confirm-accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--confirm-text);
    font-size: 20px;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--confirm-muted);
    font-size: 14px;
    line-height: 1.6;
  }

  .confirm-target {
    display: grid;
    gap: 4px;
    margin-top: 4px;
    border: 1px solid var(--confirm-border);
    border-radius: 14px;
    padding: 10px 12px;
    background: var(--confirm-surface-strong);
  }

  .confirm-target span {
    color: var(--confirm-muted);
    font-size: 12px;
  }

  .confirm-target strong {
    min-width: 0;
    color: var(--confirm-text);
    font-size: 14px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .confirm-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
  }

  button {
    min-width: 86px;
    min-height: 38px;
    border-radius: 12px;
    padding: 8px 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.16s ease,
      background 0.16s ease,
      color 0.16s ease,
      transform 0.12s ease,
      box-shadow 0.16s ease;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.64;
  }

  button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .ghost-button {
    border: 1px solid var(--confirm-border);
    background: var(--confirm-surface-strong);
    color: var(--confirm-text);
  }

  .ghost-button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--confirm-accent) 26%, var(--confirm-border));
    background: var(--confirm-accent-soft);
  }

  .confirm-button {
    border: 1px solid var(--confirm-accent);
    background: var(--confirm-accent);
    color: #ffffff;
    box-shadow: 0 10px 24px color-mix(in srgb, var(--confirm-accent) 28%, transparent);
  }

  .confirm-button:hover:not(:disabled) {
    box-shadow: 0 14px 28px color-mix(in srgb, var(--confirm-accent) 34%, transparent);
  }

  @keyframes confirm-pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 520px) {
    .confirm-dialog {
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      padding: 18px;
    }

    .confirm-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    button {
      width: 100%;
      min-width: 0;
    }
  }
</style>
