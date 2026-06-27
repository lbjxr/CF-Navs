<script lang="ts">
  import { getIconCandidates, type IconCandidate } from '../lib/icons'

  type BookmarkFormValue = {
    id?: string | number
    category_id?: string | number
    title: string
    url: string
    icon: string
    icon_source: string
    description: string
    open_method: 'same_tab' | 'new_tab'
  }

  type BookmarkCategoryOption = {
    id: string | number
    title: string
  }

  const emptyForm: BookmarkFormValue = {
    title: '',
    url: '',
    icon: '',
    icon_source: '',
    description: '',
    open_method: 'new_tab',
  }

  export let open = false
  export let loading = false
  export let error = ''
  export let mode: 'create' | 'edit' = 'create'
  export let value: Partial<BookmarkFormValue> | null = null
  export let categories: BookmarkCategoryOption[] = []
  export let onSubmit: ((payload: BookmarkFormValue) => void | Promise<void>) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let onFetchFavicon: ((url: string) => Promise<string>) | undefined = undefined
  export let onDelete: ((bookmark: { id: string | number; title: string }) => void | Promise<void>) | undefined = undefined
  export let deleting = false
  export let imageHostUrl = ''

  let form: BookmarkFormValue = { ...emptyForm }
  let formKey = ''
  let fetchingFavicon = false
  let faviconError = ''

  // 当前链接下的图标候选
  let candidates: IconCandidate[] = []
  let candidateError = ''

  $: nextKey = JSON.stringify({ open, mode, value, categoryIds: categories.map((item) => item.id) })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    faviconError = ''
    candidateError = ''
    const fallbackCategoryId = categories[0]?.id
    form = {
      ...emptyForm,
      ...(value ?? {}),
      category_id: value?.category_id ?? fallbackCategoryId,
      title: value?.title ?? '',
      url: value?.url ?? '',
      icon: value?.icon ?? '',
      icon_source: (value as Partial<BookmarkFormValue>)?.icon_source ?? '',
      description: value?.description ?? '',
      open_method: value?.open_method ?? 'new_tab',
    }
    // 编辑模式也重新生成候选
    if (form.url.trim()) {
      candidates = getIconCandidates(form.url.trim(), form.title.trim())
    } else {
      candidates = []
    }
  }

  // 输入 URL 后实时生成候选
  $: if (form.url.trim() && formKey) {
    candidates = getIconCandidates(form.url.trim(), form.title.trim())
    candidateError = ''
  }

  function selectCandidate(candidate: IconCandidate) {
    form.icon = candidate.url
    form.icon_source = candidate.source
    candidateError = ''
    faviconError = ''
  }

  function clearIconSelection() {
    form.icon = ''
    form.icon_source = ''
  }

  async function handleFetchFavicon() {
    faviconError = ''
    const url = form.url.trim()
    if (!url) {
      faviconError = '请先填写链接地址'
      return
    }
    if (!onFetchFavicon) {
      return
    }

    fetchingFavicon = true
    try {
      const icon = await onFetchFavicon(url)
      if (icon) {
        form.icon = icon
        form.icon_source = 'direct'
      } else {
        faviconError = '未能获取到图标'
      }
    } catch (err) {
      faviconError = err instanceof Error ? err.message : '获取图标失败'
    } finally {
      fetchingFavicon = false
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
      url: form.url.trim(),
      icon: form.icon.trim(),
      icon_source: form.icon.trim() ? form.icon_source : '',
      description: form.description.trim(),
    })
  }

  function handleCancel() {
    if (loading || deleting) {
      return
    }
    onCancel?.()
  }

  async function handleDelete() {
    if (!form.id || !onDelete || loading || deleting) return
    await onDelete({ id: form.id, title: form.title.trim() })
  }
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">
      <div class="modal-header">
        <div>
          <p class="modal-eyebrow">书签管理</p>
          <h2 id="bookmark-modal-title">{mode === 'create' ? '新增书签' : '编辑书签'}</h2>
        </div>
        <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading || deleting}>取消</button>
      </div>

      <form class="modal-form" on:submit|preventDefault={handleSubmit}>
        <label>
          <span>所属分类</span>
          <select bind:value={form.category_id} disabled={loading || categories.length === 0} required>
            {#if categories.length === 0}
              <option value="">暂无分类可选</option>
            {:else}
              {#each categories as category}
                <option value={category.id}>{category.title}</option>
              {/each}
            {/if}
          </select>
        </label>

        <label>
          <span>书签标题</span>
          <input bind:value={form.title} type="text" placeholder="例如：Svelte 官方网站" required />
        </label>

        <label>
          <span>链接地址</span>
          <input bind:value={form.url} type="url" placeholder="https://example.com" required />
        </label>

        <!-- 图标候选区 -->
        <div class="icon-picker-section">
          <span class="field-label">选择图标</span>

          {#if candidates.length > 0}
            <div class="icon-candidates">
              {#each candidates as candidate}
                <button
                  type="button"
                  class="candidate-card"
                  class:selected={form.icon === candidate.url}
                  on:click={() => selectCandidate(candidate)}
                  title={candidate.label}
                >
                  <img
                    src={candidate.url}
                    alt={candidate.label}
                    loading="lazy"
                  />
                  <span class="candidate-label">{candidate.label}</span>
                </button>
              {/each}
            </div>
          {:else if form.url.trim()}
            <p class="hint-text">请输入有效链接以生成图标候选</p>
          {:else}
            <p class="hint-text">填写链接地址后将自动生成图标选项</p>
          {/if}
        </div>

        <label>
          <span>自定义图标 / 手动输入</span>
          <div class="icon-row">
            <input
              bind:value={form.icon}
              type="text"
              placeholder="图标 URL / 表情，如 ⭐"
              on:focus={clearIconSelection}
            />
            <button
              type="button"
              class="ghost-button fetch-button"
              on:click={handleFetchFavicon}
              disabled={loading || fetchingFavicon || !form.url.trim() || !onFetchFavicon}
              title="根据链接地址自动获取网站图标（方式1）"
            >
              {#if fetchingFavicon}获取中...{:else}服务端解析{/if}
            </button>
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
          {#if form.icon && /^https?:\/\//i.test(form.icon)}
            <span class="icon-preview">
              <img src={form.icon} alt="图标预览" />
              <small>图标预览</small>
            </span>
          {/if}
          {#if faviconError}
            <small class="field-error">{faviconError}</small>
          {/if}
        </label>

        <label>
          <span>描述</span>
          <textarea bind:value={form.description} rows="3" placeholder="补充说明，可选"></textarea>
        </label>

        <label>
          <span>打开方式</span>
          <select bind:value={form.open_method}>
            <option value="new_tab">新标签页</option>
            <option value="same_tab">当前标签页</option>
          </select>
        </label>

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <div class="modal-actions">
          {#if mode === 'edit' && form.id && onDelete}
            <button type="button" class="danger-button" on:click={handleDelete} disabled={loading || deleting}>
              {#if deleting}删除中...{:else}删除{/if}
            </button>
          {/if}
          <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading}>取消</button>
          <button
            type="submit"
            class="primary-button"
            disabled={loading || deleting || categories.length === 0 || !form.title.trim() || !form.url.trim()}
          >
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

  .modal-card {
    position: relative;
    width: min(100%, 640px);
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

  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 90px;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .field-label {
    color: #334155;
    font-size: 14px;
    font-weight: 600;
  }

  .hint-text {
    margin: 0;
    color: #94a3b8;
    font-size: 13px;
    padding: 4px 0;
  }

  .error-text {
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .icon-picker-section {
    display: grid;
    gap: 8px;
  }

  .icon-candidates {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .candidate-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .candidate-card:hover {
    border-color: #93c5fd;
    background: #f0f5ff;
  }

  .candidate-card.selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .candidate-card img {
    width: 36px;
    height: 36px;
    object-fit: contain;
    border-radius: 6px;
  }

  .candidate-label {
    font-size: 11px;
    color: #475569;
    text-align: center;
    line-height: 1.2;
  }

  .candidate-card.selected .candidate-label {
    color: #1e40af;
    font-weight: 600;
  }

  .icon-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .icon-row input {
    flex: 1 1 auto;
  }

  .fetch-button,
  .upload-button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .icon-preview {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #64748b;
  }

  .icon-preview img {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .field-error {
    color: #dc2626;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 4px;
  }

  .primary-button,
  .ghost-button,
  .danger-button {
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

  .danger-button {
    margin-right: auto;
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .primary-button:disabled,
  .ghost-button:disabled,
  .danger-button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 500px) {
    .icon-candidates {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
