<script lang="ts">
  type AsyncVoid<T = void> = T | Promise<T>

  export let title = ''
  export let url = ''
  export let onClose: (() => AsyncVoid) | undefined = undefined

  function handleClose() {
    void onClose?.()
  }
</script>

<div class="link-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
  <div class="link-modal">
    <div class="link-modal-header">
      <strong>{title}</strong>
      <div class="link-modal-actions">
        <a href={url} target="_blank" rel="noopener noreferrer">新窗口打开</a>
        <button type="button" on:click={handleClose}>关闭</button>
      </div>
    </div>
    <iframe src={url} title={title}></iframe>
  </div>
</div>

<style>
  .link-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(15, 23, 42, 0.62);
    backdrop-filter: blur(4px);
  }

  .link-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(1120px, 100%);
    height: min(760px, calc(100vh - 36px));
    overflow: hidden;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.32);
  }

  .link-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #e2e8f0;
    color: #0f172a;
  }

  .link-modal-header strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link-modal-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .link-modal-actions a,
  .link-modal-actions button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 7px 10px;
    text-decoration: none;
  }

  .link-modal iframe {
    width: 100%;
    height: 100%;
    border: 0;
    background: #ffffff;
  }

  :global([data-theme='dark']) .link-modal {
    background: #0f172a;
  }

  :global([data-theme='dark']) .link-modal-header {
    border-color: rgba(148, 163, 184, 0.24);
    color: #e5eefb;
  }
</style>
