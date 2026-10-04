<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { IconifyCandidate as IconifySearchCandidate } from '../../shared/types'
  import { getErrorMessage, iconifyApi } from '../lib/api'
  import type { CategoryFormValue } from '../lib/adminTypes'
  import {
    createBookmarkIconifySearchState,
    deriveBookmarkIconifyInput,
    initializeBookmarkIconifySelection,
    isBookmarkIconifySelected,
    resolveBookmarkIconifySearchError,
    resolveBookmarkIconifySearchSuccess,
    scheduleBookmarkIconifyCandidateSearch,
    selectBookmarkIconifyIcon,
    selectBookmarkIconifySearchCandidate,
    shouldResetBookmarkIconifyConfirmation,
    type BookmarkIconifySearchState,
  } from '../lib/bookmarkIconifyController'
  import { iconifyIcon, iconifyNameFromUrl } from '../lib/icons'
  import { buildParentCategoryOptions } from '../lib/categorySelect'
  import CategoryTreeSelect from './CategoryTreeSelect.svelte'
  import IconifySelector from './IconifySelector.svelte'
  import CategoryIcon from './CategoryIcon.svelte'

  const emptyForm: CategoryFormValue = {
    parent_id: null,
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
  export let categories: Array<{ id: string | number; parent_id: string | number | null; title: string }> = []

  let form: CategoryFormValue = { ...emptyForm }
  let formKey = ''
  let iconifyName = ''
  let iconifyUseConfirmed = false
  let confirmedIconifyName = ''
  let iconifySearchState: BookmarkIconifySearchState = createBookmarkIconifySearchState()
  let iconifySearchTimer: ReturnType<typeof setTimeout> | null = null
  let iconifySearchAbortController: AbortController | null = null
  let iconifyError = ''

  $: nextKey = JSON.stringify({ open, mode, value })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    iconifyError = ''
    form = {
      ...emptyForm,
      ...(value ?? {}),
      parent_id: value?.parent_id ?? null,
      title: value?.title ?? '',
      icon: value?.icon ?? '',
    }
    const iconifySelection = initializeBookmarkIconifySelection({
      mode,
      iconSource: iconifyNameFromUrl(form.icon) ? 'iconify' : '',
      icon: form.icon,
    })
    iconifyName = iconifySelection.iconifyName
    iconifyUseConfirmed = iconifySelection.iconifyUseConfirmed
    confirmedIconifyName = iconifySelection.confirmedIconifyName
    iconifySearchState = createBookmarkIconifySearchState(iconifySearchState.requestId)
    clearIconifySearchTimer()
  }

  $: iconifyInput = deriveBookmarkIconifyInput(iconifyName)
  $: normalizedIconifyName = iconifyInput.normalizedIconifyName
  $: categoryHasChildren = form.id != null && categories.some((category) => Number(category.parent_id) === Number(form.id))
  $: parentCategoryOptions = categoryHasChildren ? [] : buildParentCategoryOptions(categories, form.id)
  $: iconifyPreviewUrl = iconifyInput.iconifyPreviewUrl
  $: iconifySelected = isBookmarkIconifySelected({
    iconifyUseConfirmed,
    normalizedIconifyName,
    confirmedIconifyName,
  })
  $: scheduleIconifyCandidateSearch(open, iconifyName)
  $: if (shouldResetBookmarkIconifyConfirmation({
    iconifyUseConfirmed,
    normalizedIconifyName,
    confirmedIconifyName,
  })) {
    iconifyUseConfirmed = false
  }

  function clearIconifySearchTimer() {
    if (iconifySearchTimer) {
      clearTimeout(iconifySearchTimer)
      iconifySearchTimer = null
    }
    iconifySearchAbortController?.abort()
    iconifySearchAbortController = null
  }

  function scheduleIconifyCandidateSearch(enabled: boolean, value: string) {
    const result = scheduleBookmarkIconifyCandidateSearch(iconifySearchState, { enabled, value })
    if (!result.changed) return

    clearIconifySearchTimer()
    iconifySearchState = result.state
    if (!result.task) return

    const { query, requestId, delayMs } = result.task
    iconifySearchTimer = setTimeout(() => {
      void loadIconifyCandidates(query, requestId)
    }, delayMs)
  }

  async function loadIconifyCandidates(query: string, requestId: number) {
    const controller = new AbortController()
    iconifySearchAbortController = controller
    try {
      const result = await iconifyApi.search(query, controller.signal)
      iconifySearchState = resolveBookmarkIconifySearchSuccess(iconifySearchState, {
        requestId,
        candidates: result.candidates,
      })
    } catch (searchError) {
      if (controller.signal.aborted) return
      iconifySearchState = resolveBookmarkIconifySearchError(iconifySearchState, {
        requestId,
        error: getErrorMessage(searchError),
      })
    } finally {
      if (iconifySearchAbortController === controller) iconifySearchAbortController = null
    }
  }

  function openImageHost() {
    if (!imageHostUrl) return
    const base = imageHostUrl.endsWith('/') ? imageHostUrl.slice(0, -1) : imageHostUrl
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }

  function openIconifyLibrary() {
    window.open('https://icon-sets.iconify.design/', '_blank', 'noopener,noreferrer')
  }

  function syncManualIconInput() {
    const nextIconifyName = iconifyNameFromUrl(form.icon)
    if (nextIconifyName) {
      iconifyName = nextIconifyName
      iconifyUseConfirmed = true
      confirmedIconifyName = nextIconifyName
      iconifyError = ''
      return
    }

    iconifyName = ''
    iconifyUseConfirmed = false
    confirmedIconifyName = ''
    iconifyError = ''
    iconifySearchState = createBookmarkIconifySearchState(iconifySearchState.requestId)
    clearIconifySearchTimer()
  }

  function selectIconifyIcon() {
    const result = selectBookmarkIconifyIcon(iconifyName)
    if (!result.ok) {
      iconifyError = result.error
      return
    }

    form.icon = result.icon
    iconifyName = result.iconifyName
    iconifyUseConfirmed = result.iconifyUseConfirmed
    confirmedIconifyName = result.confirmedIconifyName
    iconifyError = ''
  }

  function selectIconifySearchCandidate(candidate: IconifySearchCandidate) {
    const result = selectBookmarkIconifySearchCandidate(candidate)
    form.icon = result.icon
    iconifyName = result.iconifyName
    iconifyUseConfirmed = result.iconifyUseConfirmed
    confirmedIconifyName = result.confirmedIconifyName
    iconifyError = ''
  }

  async function handleSubmit() {
    await onSubmit?.({
      ...form,
      title: form.title.trim(),
      icon: (iconifySelected ? iconifyIcon(iconifyName) : form.icon).trim(),
    })
  }

  function handleCancel() {
    if (loading) {
      return
    }

    onCancel?.()
  }

  onDestroy(() => {
    clearIconifySearchTimer()
  })
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

        <div class="field-label">
          <span>上级分类</span>
          <CategoryTreeSelect
            bind:value={form.parent_id}
            items={parentCategoryOptions}
            rootOptionLabel="无上级分类"
            disabled={loading || categoryHasChildren}
            ariaLabel="选择上级分类"
            testId="category-parent-tree-select"
          />
          {#if categoryHasChildren}<small>该分类包含子分类，需先移动或删除子分类后才能设置上级分类。</small>{/if}
        </div>

        <label>
          <span>图标</span>
          <div class="icon-row">
            <input bind:value={form.icon} type="text" placeholder="例如：🧰 或 icon-tools" on:input={syncManualIconInput} />
            {#if form.icon.trim() && !iconifySelected}
              <CategoryIcon category={{ id: Number(form.id) || 0, title: form.title, icon: form.icon }} preview size={32} />
            {/if}
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

        <label class="visibility-toggle">
          <input bind:checked={form.is_private} type="checkbox" />
          <span>
            <strong>访客不可见（仅登录可见）</strong>
            <small>开启后，未登录访客看不到此分类、子分类及其中的书签。</small>
          </span>
        </label>

        <IconifySelector
          bind:iconifyName
          {iconifyPreviewUrl}
          {iconifySelected}
          {iconifyUseConfirmed}
          {confirmedIconifyName}
          iconifySearchCandidates={iconifySearchState.candidates}
          iconifySearchLoading={iconifySearchState.loading}
          iconifySearchError={iconifySearchState.error}
          candidateError={iconifyError}
          {loading}
          onOpenLibrary={openIconifyLibrary}
          onSelectIcon={selectIconifyIcon}
          onSelectCandidate={selectIconifySearchCandidate}
        />

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
    max-height: calc(100vh - 40px);
    max-height: calc(100dvh - 40px);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: var(--radius-xl);
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

  .field-label {
    display: grid;
    gap: 8px;
    color: #334155;
    font-size: 14px;
  }

  input {
    width: 100%;
    min-height: 42px;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: var(--radius-lg);
    padding: var(--control-padding-input);
    font-size: var(--font-size-base);
    color: #0f172a;
    background: #ffffff;
  }

  input:focus-visible {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .error-text {
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .visibility-toggle {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border: 1px solid #dbe4ef;
    border-radius: var(--radius-lg);
    background: #f8fafc;
  }

  .visibility-toggle input {
    width: 18px;
    min-height: 18px;
    margin: 2px 0 0;
    accent-color: #2563eb;
  }

  .visibility-toggle span {
    display: grid;
    gap: 4px;
  }

  .visibility-toggle strong {
    color: #0f172a;
    font-size: 14px;
  }

  .visibility-toggle small {
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
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
    border-radius: var(--radius-lg);
    padding: var(--control-padding-md);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: var(--transition-base);
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
