<script lang="ts">
  import type { CategoryFormValue } from '../lib/adminTypes'

  const emptyForm: CategoryFormValue = {
    title: '',
    icon: '',
  }

  export let open = false
  export let loading = false
  export let error = ''
  export let mode: 'create' | 'edit' = 'create'
  export let value: Partial<CategoryFormValue> | null = null
  export let onSubmit: ((payload: CategoryFormValue) => void | Promise<void>) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let imageHostUrl = ''

  let form: CategoryFormValue = { ...emptyForm }
  let formKey = ''

  $: nextKey = JSON.stringify({ open, mode, value })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    form = {
      ...emptyForm,
      ...(value ?? {}),
      title: value?.title ?? '',
      icon: value?.icon ?? '',
    }
  }

  function openImageHost() {
    if (!imageHostUrl) return
    const base = imageHostUrl.endsWith('/') ? imageHostUrl.slice(0, -1) : imageHostUrl
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit() {
    await onSubmit?.({
      ...form,
      title: form.title.trim(),
      icon: form.icon.trim(),
    })
  }

  function handleCancel() {
    if (loading) {
      return
    }

    onCancel?.()
  }
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
      <div class="modal-header">
        <div>
          <p class="modal-eyebrow">分类管理</p>
          <h2 id="category-modal-title">{mode === 'create' ? '新增分类' : '编辑分类'}</h2>
        </div>
        <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading}>取消</button>
      </div>

      <form class="modal-form" on:submit|preventDefault={handleSubmit}>
        <label>
          <span>分类名称</span>
          <input bind:value={form.title} type="text" placeholder="例如：常用工具" required />
        </label>

        <label>
          <span>图标</span>
          <div class="icon-row">
            <input bind:value={form.icon} type="text" placeholder="例如：🧰 或 icon-tools" />
            {#if imageHostUrl}
              <button
                type="button"
                class="ghost-button upload-button"
                on:click={openImageHost}
                disabled={loading}
                title="打开图床上传图标"
              >
                打开图床 ↗
              </button>
            {/if}
          </div>
        </label>

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <div class="modal-actions">
          <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading}>取消</button>
          <button type="submit" class="primary-button" disabled={loading || !form.title.trim()}>
            {#if loading}保存中...{:else}保存{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.56);
  }

  .modal-backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
  }

  .modal-card {
    position: relative;
    width: min(100%, 480px);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    padding: 20px;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .modal-eyebrow {
    margin: 0 0 6px;
    font-size: 12px;
    color: #64748b;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    color: #0f172a;
  }

  .modal-form {
    display: grid;
    gap: 14px;
  }

  label {
    display: grid;
    gap: 8px;
    color: #334155;
    font-size: 14px;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
  }

  input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .error-text {
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .icon-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .icon-row input {
    flex: 1 1 auto;
  }

  .upload-button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
  }

  .primary-button,
  .ghost-button {
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: 0.18s ease;
  }

  .primary-button {
    border: none;
    background: #2563eb;
    color: #ffffff;
  }

  .ghost-button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .primary-button:disabled,
  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
</style>
