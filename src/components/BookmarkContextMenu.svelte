<script lang="ts">
  type AsyncVoid<T = void> = T | Promise<T>

  export let onEdit: (() => AsyncVoid) | undefined = undefined

  function handleEditClick() {
    void onEdit?.()
  }
</script>

<div class="bookmark-context-menu">
  <button type="button" on:click={handleEditClick}>编辑</button>
</div>

<style>
  .bookmark-context-menu {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 80;
    min-width: 88px;
    padding: 6px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(10px);
  }

  .bookmark-context-menu button {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    padding: 7px 12px;
    text-align: left;
  }

  .bookmark-context-menu button:hover {
    background: #eff6ff;
    color: #1d4ed8;
  }

  :global([data-theme='dark']) .bookmark-context-menu {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.94);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.32);
  }

  :global([data-theme='dark']) .bookmark-context-menu button {
    color: #e5eefb;
  }

  :global([data-theme='dark']) .bookmark-context-menu button:hover {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
  }
</style>
