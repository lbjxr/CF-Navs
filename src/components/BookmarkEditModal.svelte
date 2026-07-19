<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    DEFAULT_LOGO_SURF_SCHEME,
    getIconCandidates,
    iconifyNameFromUrl,
    logoSurfIcon,
    type IconCandidate,
    type LogoSurfColorScheme,
  } from '../lib/icons'
  import { getErrorMessage, iconifyApi } from '../lib/api'
  import type { BookmarkFormValue } from '../lib/adminTypes'
  import type { CategoryTreeOption } from '../lib/categorySelect'
  import {
    buildBookmarkSubmitPayload,
    createBookmarkFormValue,
    emptyBookmarkForm,
    findLogoSchemeName,
    getLogoSchemeByName,
  } from '../lib/bookmarkFormIcons'
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
  import BookmarkBaseFields from './BookmarkBaseFields.svelte'
  import BookmarkCustomIconField from './BookmarkCustomIconField.svelte'
  import BookmarkIconCandidatePicker from './BookmarkIconCandidatePicker.svelte'
  import BookmarkModalActions from './BookmarkModalActions.svelte'
  import BookmarkModalHeader from './BookmarkModalHeader.svelte'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import IconifySelector from './IconifySelector.svelte'
  import LogoSchemeSelector from './LogoSchemeSelector.svelte'
  import type { IconifyCandidate as IconifySearchCandidate } from '../../shared/types'

  export let open = false
  export let loading = false
  export let error = ''
  export let mode: 'create' | 'edit' = 'create'
  export let value: Partial<BookmarkFormValue> | null = null
  export let categories: CategoryTreeOption[] = []
  export let onSubmit: ((payload: BookmarkFormValue) => void | Promise<void>) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let onDelete: ((bookmark: { id: string | number; title: string }) => void | Promise<void>) | undefined = undefined
  export let deleting = false
  export let imageHostUrl = ''

  let form: BookmarkFormValue = { ...emptyBookmarkForm }
  let formKey = ''
  let faviconError = ''
  let selectedLogoSchemeName = DEFAULT_LOGO_SURF_SCHEME.name
  let iconifyName = ''
  let iconifyUseConfirmed = false
  let confirmedIconifyName = ''
  let iconifySearchState: BookmarkIconifySearchState = createBookmarkIconifySearchState()
  let iconifySearchTimer: ReturnType<typeof setTimeout> | null = null
  let previousBodyOverflow: string | null = null
  let previousDocumentOverflow: string | null = null

  // 当前链接下的图标候选
  let candidates: IconCandidate[] = []
  let candidateError = ''

  $: nextKey = JSON.stringify({ open, mode, value, categories })
  $: setPageScrollLocked(open)
  $: if (nextKey !== formKey) {
    formKey = nextKey
    faviconError = ''
    candidateError = ''
    const fallbackCategoryId = categories[0]?.id
    form = createBookmarkFormValue(value, fallbackCategoryId)
    selectedLogoSchemeName = findLogoSchemeName(form.icon) ?? DEFAULT_LOGO_SURF_SCHEME.name
    const iconifySelection = initializeBookmarkIconifySelection({
      mode,
      iconSource: form.icon_source,
      icon: form.icon,
    })
    iconifyName = iconifySelection.iconifyName
    iconifyUseConfirmed = iconifySelection.iconifyUseConfirmed
    confirmedIconifyName = iconifySelection.confirmedIconifyName
    iconifySearchState = createBookmarkIconifySearchState()
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

  $: currentLogoScheme = getLogoSchemeByName(selectedLogoSchemeName)
  $: iconifyInput = deriveBookmarkIconifyInput(iconifyName)
  $: normalizedIconifyName = iconifyInput.normalizedIconifyName
  $: iconifySourceUrl = iconifyInput.iconifySourceUrl
  $: iconifyPreviewUrl = iconifyInput.iconifyPreviewUrl
  $: showLogoSchemes = form.icon_source === 'logo_surf' && Boolean(form.url.trim())
  $: showIconifyOptions = form.icon_source === 'iconify'
  $: iconifySelected = isBookmarkIconifySelected({
    iconifyUseConfirmed,
    normalizedIconifyName,
    confirmedIconifyName,
  })
  $: scheduleIconifyCandidateSearch(showIconifyOptions, iconifyName)
  $: logoPreviewText = (form.title.trim() || 'NAV').slice(0, 4)
  $: if (shouldResetBookmarkIconifyConfirmation({
    iconifyUseConfirmed,
    normalizedIconifyName,
    confirmedIconifyName,
  })) {
    iconifyUseConfirmed = false
  }
  $: if (form.icon_source === 'logo_surf' && form.url.trim()) {
    const nextLogoIcon = logoSurfIcon(form.title.trim(), form.url.trim(), currentLogoScheme)
    if (form.icon !== nextLogoIcon) {
      form.icon = nextLogoIcon
    }
  }
  $: if (form.icon_source === 'iconify' && normalizedIconifyName && form.icon !== iconifySourceUrl) {
    form.icon = iconifySourceUrl
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

  function selectLogoColorScheme(scheme: LogoSurfColorScheme) {
    if (!form.url.trim()) return
    selectedLogoSchemeName = scheme.name
    form.icon = logoSurfIcon(form.title.trim(), form.url.trim(), scheme)
    form.icon_source = 'logo_surf'
    candidateError = ''
    faviconError = ''
  }

  function selectIconifyIcon() {
    const result = selectBookmarkIconifyIcon(iconifyName)
    if (!result.ok) {
      candidateError = result.error
      return
    }

    form.icon = result.icon
    form.icon_source = result.iconSource
    iconifyName = result.iconifyName
    iconifyUseConfirmed = result.iconifyUseConfirmed
    confirmedIconifyName = result.confirmedIconifyName
    candidateError = ''
    faviconError = ''
  }

  function selectIconifySearchCandidate(candidate: IconifySearchCandidate) {
    const result = selectBookmarkIconifySearchCandidate(candidate)
    iconifyName = result.iconifyName
    form.icon = result.icon
    form.icon_source = result.iconSource
    iconifyUseConfirmed = result.iconifyUseConfirmed
    confirmedIconifyName = result.confirmedIconifyName
    candidateError = ''
    faviconError = ''
  }

  function openIconifyLibrary() {
    window.open('https://icon-sets.iconify.design/', '_blank', 'noopener,noreferrer')
  }

  function setPageScrollLocked(locked: boolean) {
    if (typeof document === 'undefined') return

    if (locked && previousBodyOverflow === null) {
      previousBodyOverflow = document.body.style.overflow
      previousDocumentOverflow = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return
    }

    if (!locked && previousBodyOverflow !== null) {
      document.documentElement.style.overflow = previousDocumentOverflow ?? ''
      document.body.style.overflow = previousBodyOverflow
      previousBodyOverflow = null
      previousDocumentOverflow = null
    }
  }

  function selectCandidate(candidate: IconCandidate) {
    if (candidate.source === 'logo_surf') {
      selectLogoColorScheme(DEFAULT_LOGO_SURF_SCHEME)
      return
    }

    form.icon = candidate.url
    form.icon_source = candidate.source
    if (candidate.source === 'iconify') {
      iconifyName = iconifyNameFromUrl(candidate.url) ?? iconifyName
      iconifyUseConfirmed = false
      confirmedIconifyName = ''
    } else {
      iconifyName = ''
      iconifyUseConfirmed = false
      confirmedIconifyName = ''
    }
    candidateError = ''
    faviconError = ''
  }

  function markCustomIconInput(nextIcon: string) {
    form.icon = nextIcon
    form.icon_source = ''
    iconifyName = ''
    iconifyUseConfirmed = false
    confirmedIconifyName = ''
  }

  function openImageHost() {
    if (!imageHostUrl) return
    const base = imageHostUrl.endsWith('/') ? imageHostUrl.slice(0, -1) : imageHostUrl
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit() {
    await onSubmit?.(buildBookmarkSubmitPayload(form, iconifyName))
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

  onDestroy(() => {
    clearIconifySearchTimer()
    setPageScrollLocked(false)
  })
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal-card" data-testid="bookmark-modal" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">
      <BookmarkModalHeader {mode} {loading} {deleting} onCancel={handleCancel} />

      <form class="modal-form" on:submit|preventDefault={handleSubmit}>
        <BookmarkBaseFields
          bind:categoryId={form.category_id}
          bind:title={form.title}
          bind:url={form.url}
          bind:openMethod={form.open_method}
          bind:description={form.description}
          bind:descriptionMode={form.description_mode}
          {categories}
          {loading}
        />

        <BookmarkIconCandidatePicker
          {candidates}
          {form}
          urlFilled={Boolean(form.url.trim())}
          onSelect={selectCandidate}
        />

        <div class="field-block field-compact">
          <span>图标背景色</span>
          <ColorAlphaInput
            bind:value={form.icon_background_color}
            placeholder="留空则使用默认背景"
            inputLabel="图标背景颜色值"
            swatchTitle="选择图标背景色"
            alphaText="图标背景透明度"
          />
          <small>可为单个书签图标设置背景色，留空则使用全局默认。</small>
        </div>

        {#if showIconifyOptions}
          <IconifySelector
            bind:iconifyName
            {iconifyPreviewUrl}
            {iconifySelected}
            {iconifyUseConfirmed}
            {confirmedIconifyName}
            iconifySearchCandidates={iconifySearchState.candidates}
            iconifySearchLoading={iconifySearchState.loading}
            iconifySearchError={iconifySearchState.error}
            {candidateError}
            {loading}
            onOpenLibrary={openIconifyLibrary}
            onSelectIcon={selectIconifyIcon}
            onSelectCandidate={selectIconifySearchCandidate}
          />
        {/if}

        {#if showLogoSchemes}
          <LogoSchemeSelector
            {selectedLogoSchemeName}
            iconSource={form.icon_source}
            {currentLogoScheme}
            {logoPreviewText}
            onSelectScheme={selectLogoColorScheme}
          />
        {/if}

        <BookmarkCustomIconField
          {form}
          {iconifyName}
          {imageHostUrl}
          {loading}
          {faviconError}
          onIconInput={markCustomIconInput}
          onOpenImageHost={openImageHost}
        />

        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <BookmarkModalActions
          {mode}
          bookmarkId={form.id}
          canDelete={Boolean(onDelete)}
          {loading}
          {deleting}
          saveDisabled={loading || deleting || categories.length === 0 || !form.title.trim() || !form.url.trim()}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
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
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    padding: 0;
    scrollbar-gutter: stable;
  }

  .modal-form {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(180px, 0.85fr);
    align-content: start;
    gap: 8px 10px;
    padding: 10px 14px 0;
  }

  .field-block {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .field-compact {
    grid-column: span 1;
  }

  .field-block > span {
    font-weight: 600;
  }

  .error-text {
    grid-column: 1 / -1;
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .modal-card :global(.color-picker-row) {
    gap: 6px;
  }

  .modal-card :global(.color-picker-row input[type='text']) {
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
  }

  .modal-card :global(.color-swatch) {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    border-radius: 9px;
  }

  @media (max-width: 500px) {
    .modal-backdrop {
      padding: 10px;
    }

    .modal-card {
      width: min(100%, 600px);
      height: calc(100vh - 20px);
      height: calc(100dvh - 20px);
      max-height: calc(100vh - 20px);
      max-height: calc(100dvh - 20px);
    }

    .modal-form {
      grid-template-columns: 1fr;
      gap: 8px;
      padding-right: 14px;
      padding-left: 14px;
    }

    .field-compact {
      grid-column: 1 / -1;
    }
  }
</style>
