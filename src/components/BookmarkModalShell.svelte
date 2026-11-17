<svelte:options runes />

<script lang="ts">
  import { onMount, type Snippet } from 'svelte'
  import { setPageScrollLocked } from '../lib/pageScrollLock'
  import BookmarkModalHeader from './BookmarkModalHeader.svelte'

  interface Props {
    mode?: 'create' | 'edit'
    loading?: boolean
    deleting?: boolean
    reading?: boolean
    readError?: string
    onCancel?: () => void
    onRetry?: () => void | Promise<void>
    children?: Snippet
  }

  let { mode = 'edit', loading = false, deleting = false, reading = false, readError = '', onCancel, onRetry, children }: Props = $props()
  let dialog: HTMLDivElement

  onMount(() => {
    const previousFocus = document.activeElement
    setPageScrollLocked(true)
    dialog.focus({ preventScroll: true })
    return () => {
      setPageScrollLocked(false)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  })

  function handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    if (event.key === 'Escape' && !loading && !deleting) {
      event.preventDefault()
      event.stopPropagation()
      onCancel?.()
    } else if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.hidden)
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        ;(last ?? dialog).focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
</script>

<div class="modal-backdrop">
  <div bind:this={dialog} class="modal-card" data-testid="bookmark-modal" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title" aria-busy={reading} tabindex="-1" onkeydown={handleKeydown}>
    <BookmarkModalHeader {mode} {loading} {deleting} {onCancel} />
    {#if reading || readError}
      <div class="read-state" data-testid="bookmark-edit-read-state">
        {#if reading}
          <p role="status">正在读取书签…</p>
        {:else}
          <p role="alert">{readError}</p>
          <button type="button" class="retry-button" onclick={() => onRetry?.()}>重试</button>
        {/if}
      </div>
    {:else if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    padding: 14px;
    background: rgba(15, 23, 42, 0.56);
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .modal-backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }

  .modal-card {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(100%, 680px);
    height: min(720px, calc(100vh - 28px));
    height: min(720px, calc(100dvh - 28px));
    max-height: calc(100vh - 28px);
    max-height: calc(100dvh - 28px);
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
    border-radius: var(--radius-xl);
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    padding: 0;
    scrollbar-gutter: stable;
    outline: none;
  }

  .read-state {
    flex: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 24px;
    overflow-y: auto;
    color: #334155;
    text-align: center;
  }

  .read-state p { margin: 0; }
  .read-state [role='alert'] { color: #dc2626; }
  .retry-button {
    border: none;
    border-radius: var(--radius-lg);
    padding: var(--control-padding-sm);
    font-size: var(--font-size-md);
    background: #2563eb;
    color: #ffffff;
    cursor: pointer;
  }

  @media (max-width: 500px) {
    .modal-backdrop { padding: 10px; }
    .modal-card {
      width: min(100%, 600px);
      height: calc(100vh - 20px);
      height: calc(100dvh - 20px);
      max-height: calc(100vh - 20px);
      max-height: calc(100dvh - 20px);
    }
  }
</style>
