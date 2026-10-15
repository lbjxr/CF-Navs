<script lang="ts">
  interface BookmarkModalHeaderProps {
    mode?: 'create' | 'edit'
    loading?: boolean
    deleting?: boolean
    onCancel?: () => void
  }

  let {
    mode = 'create',
    loading = false,
    deleting = false,
    onCancel = undefined,
  }: BookmarkModalHeaderProps = $props()
</script>

<div class="modal-header">
  <div>
    <p class="modal-eyebrow">书签管理</p>
    <h2 id="bookmark-modal-title">{mode === 'create' ? '新增书签' : '编辑书签'}</h2>
  </div>
  <button type="button" class="ghost-button" onclick={onCancel} disabled={loading || deleting}>取消</button>
</div>

<style>
  .modal-header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 12px 16px 9px;
    border-bottom: 1px solid #e2e8f0;
  }

  .modal-eyebrow {
    margin: 0 0 4px;
    font-size: 12px;
    color: #64748b;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    color: #0f172a;
  }

  .ghost-button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 7px 12px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    transition: var(--transition-base);
  }

  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
