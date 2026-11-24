<svelte:options runes />

<script lang="ts">
  import { onMount } from 'svelte'
  import type { PublicBookmark } from '../../shared/types'

  interface Props {
    bookmark: PublicBookmark
    sourceCategoryTitle?: string
    onClose?: () => void
  }

  let { bookmark, sourceCategoryTitle = '', onClose }: Props = $props()
  let dialog: HTMLDialogElement | null = $state(null)
  const titleId = $props.id()
  let disposed = false
  let notified = false

  onMount(() => {
    const element = dialog!
    element.showModal()
    return () => {
      disposed = true
      if (element.open) element.close()
    }
  })

  function handleClose() {
    if (!dialog) return
    dialog.returnValue = ''
    if (disposed || notified || dialog.open) return
    notified = true
    onClose?.()
  }
</script>

<dialog bind:this={dialog} class="bookmark-details-dialog" data-testid="bookmark-details-dialog" aria-labelledby={titleId} onclose={handleClose}>
  <header>
    <h1 id={titleId}>书签详情</h1>
    <form method="dialog">
      <!-- svelte-ignore a11y_autofocus (首个关闭控件位于顶部，原生初始焦点不会跳过长正文) -->
      <button type="submit" autofocus>关闭详情</button>
    </form>
  </header>
  <h2 class="details-title">{bookmark.title}</h2>
  <p class="details-description">{bookmark.description || '暂无说明'}</p>
  <dl>
    <dt>网址</dt>
    <dd class="details-url">{bookmark.url}</dd>
    {#if sourceCategoryTitle}
      <dt>来源分类</dt>
      <dd class="details-source">{sourceCategoryTitle}</dd>
    {/if}
  </dl>
</dialog>

<style>
  .bookmark-details-dialog {
    width: min(560px, calc(100vw - 24px));
    max-width: none;
    max-height: calc(100dvh - 24px);
    margin: auto;
    padding: 16px;
    border: 1px solid GrayText;
    border-radius: var(--radius-xl);
    background: Canvas;
    color: CanvasText;
    font-size: var(--font-size-base);
    line-height: 1.6;
    overflow-y: auto;
    overflow-wrap: anywhere;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
  }
  .bookmark-details-dialog:modal { overscroll-behavior: contain; }
  .bookmark-details-dialog::backdrop {
    background: rgba(15, 23, 42, 0.56);
    overflow: hidden;
    overscroll-behavior: contain;
  }
  header {
    position: sticky;
    top: -16px;
    margin: -16px -16px 0;
    padding: 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: Canvas;
  }
  h1, h2 { margin: 0; font-size: var(--font-size-lg); }
  h2 { margin-top: 16px; }
  p { white-space: pre-wrap; }
  dl { margin-bottom: 0; }
  dt { font-weight: 600; }
  dd { margin: 0 0 12px; }
  button {
    padding: var(--control-padding-sm);
    border: 1px solid GrayText;
    border-radius: var(--radius-md);
    background: ButtonFace;
    color: ButtonText;
    cursor: pointer;
  }
</style>
