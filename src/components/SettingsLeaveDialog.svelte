<svelte:options runes />

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import type { SettingsLeaveChoice } from '../lib/settingsLeave'

  interface Props {
    open?: boolean
    saving?: boolean
    canSave?: boolean
    error?: string
    onChoose?: (choice: SettingsLeaveChoice) => void
  }

  let { open = false, saving = false, canSave = false, error = '', onChoose }: Props = $props()
  let dialog: HTMLDialogElement | null = $state(null)
  let parentCloseEvents = 0

  function closeFromParent(element: HTMLDialogElement): void {
    if (!element.open) return
    parentCloseEvents += 1
    element.close()
  }

  $effect(() => {
    const shouldOpen = open
    const element = dialog
    if (!element) return
    untrack(() => {
      if (shouldOpen) {
        if (!element.open) element.showModal()
      } else closeFromParent(element)
    })
  })

  onDestroy(() => { if (dialog) closeFromParent(dialog) })

  function choose(choice: SettingsLeaveChoice): void {
    if (!open || saving || choice === 'save' && !canSave) return
    onChoose?.(choice)
  }

  function handleCancel(event: Event): void {
    event.preventDefault()
    choose('stay')
  }

  function handleClose(event: Event): void {
    const element = event.currentTarget as HTMLDialogElement
    element.returnValue = ''
    if (parentCloseEvents > 0) {
      parentCloseEvents -= 1
      return
    }
    if (!open || element.open) return
    choose('stay')
    void tick().then(() => {
      if (open && element.isConnected && !element.open) element.showModal()
    })
  }
</script>

<dialog
  bind:this={dialog}
  class="settings-leave-dialog"
  data-testid="settings-leave-dialog"
  aria-labelledby="settings-leave-title"
  aria-describedby="settings-leave-description"
  closedby={saving ? 'none' : 'closerequest'}
  oncancel={handleCancel}
  onclose={handleClose}
>
  <h1 id="settings-leave-title">离开设置前保存更改？</h1>
  <p id="settings-leave-description" role="status">
    {#if saving}正在保存设置，请稍候，完成后再离开。
    {:else if canSave}有未保存的设置。你可以保存后离开、放弃更改或继续编辑。
    {:else}有未保存的设置。请先继续编辑并完善设置，或放弃更改。{/if}
  </p>
  <p class="leave-error" class:unavailable={!error} role={error ? 'alert' : undefined}>{error || '保存失败后可以重试，或继续编辑。'}</p>
  <div class="leave-actions">
    <button type="button" class="save-button" disabled={saving || !canSave} onclick={() => choose('save')}>保存并离开</button>
    <button type="button" class="discard-button" disabled={saving} onclick={() => choose('discard')}>放弃更改</button>
    <!-- svelte-ignore a11y_autofocus (未保存设置确认的安全默认操作是继续编辑) -->
    <button type="button" class="stay-button" disabled={saving} autofocus onclick={() => choose('stay')}>继续编辑</button>
  </div>
</dialog>

<style>
  .settings-leave-dialog {
    width: min(calc(100vw - 32px), 460px);
    max-width: none;
    max-height: calc(100dvh - 32px);
    padding: 20px;
    border: 1px solid var(--admin-border, #e2e8f0);
    border-radius: var(--radius-xl);
    background: var(--admin-surface, #ffffff);
    color: var(--admin-text, #0f172a);
    overflow-y: auto;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  }

  .settings-leave-dialog:modal { overscroll-behavior: contain; }
  .settings-leave-dialog::backdrop {
    background: rgba(15, 23, 42, 0.56);
    overflow: hidden;
    overscroll-behavior: contain;
  }

  h1 { margin: 0 0 12px; font-size: 20px; line-height: 1.3; }
  p { margin: 0; font-size: var(--font-size-base); line-height: 1.5; }
  #settings-leave-description { min-height: 4.5em; }
  .leave-error { min-height: 3em; margin-top: 12px; color: var(--admin-danger, #dc2626); }
  .leave-error.unavailable { visibility: hidden; }
  .leave-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  button {
    border: 1px solid var(--admin-border, #cbd5e1);
    border-radius: var(--radius-lg);
    padding: var(--control-padding-md);
    background: var(--admin-surface, #ffffff);
    color: inherit;
    font-size: var(--font-size-base);
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid var(--admin-accent-strong, #2563eb); outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: 0.55; }
  .save-button { background: var(--admin-accent-strong, #2563eb); color: var(--admin-accent-ink, #ffffff); }
  .discard-button { color: var(--admin-danger, #dc2626); }
  button:hover:not(:disabled) { box-shadow: 0 0 0 2px var(--focus-ring); }
</style>
