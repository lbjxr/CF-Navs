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
  import IconifySelector from './IconifySelector.svelte'

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
    iconifySearchState = createBookmarkIconifySearchState()
    clearIconifySearchTimer()
  }

  $: iconifyInput = deriveBookmarkIconifyInput(iconifyName)
  $: normalizedIconifyName = iconifyInput.normalizedIconifyName
  $: categoryHasChildren = form.id != null && categories.some((category) => Number(category.parent_id) === Number(form.id))
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
    try {
      const result = await iconifyApi.search(query)
      iconifySearchState = resolveBookmarkIconifySearchSuccess(iconifySearchState, {
        requestId,
        candidates: result.candidates,
      })
    } catch (searchError) {
      iconifySearchState = resolveBookmarkIconifySearchError(iconifySearchState, {
        requestId,
        error: getErrorMessage(searchError),
      })
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
    iconifySearchState = createBookmarkIconifySearchState()
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

        <label>
          <span>上级分类</span>
          <select bind:value={form.parent_id}>
            <option value={null}>无上级（一级分类）</option>
            {#if !categoryHasChildren}
              {#each categories.filter((category) => category.parent_id == null && Number(category.id) !== Number(form.id)) as category (category.id)}
                <option value={category.id}>{category.title}</option>
              {/each}
            {/if}
          </select>
          {#if categoryHasChildren}<small>该分类包含子分类，需先移动或删除子分类后才能设置上级分类。</small>{/if}
        </label>

        <label>
          <span>图标</span>
          <div class="icon-row">
            <input bind:value={form.icon} type="text" placeholder="例如：🧰 或 icon-tools" on:input={syncManualIconInput} />
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
