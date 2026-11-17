<svelte:options runes />

<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import {
    DEFAULT_LOGO_SURF_SCHEME,
    getIconCandidates,
    iconifyNameFromUrl,
    logoSurfIcon,
    type IconCandidate,
    type LogoSurfColorScheme,
  } from '../lib/icons'
  import { api, getErrorMessage, iconifyApi } from '../lib/api'
  import {
    createBookmarkTitleState,
    resolveBookmarkTitleError,
    resolveBookmarkTitleSuccess,
    scheduleBookmarkTitleLookup,
    type BookmarkTitleState,
  } from '../lib/bookmarkTitleController'
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
  import BookmarkModalShell from './BookmarkModalShell.svelte'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import IconifySelector from './IconifySelector.svelte'
  import LogoSchemeSelector from './LogoSchemeSelector.svelte'
  import type { IconifyCandidate as IconifySearchCandidate } from '../../shared/types'

  interface Props {
    open?: boolean
    loading?: boolean
    error?: string
    mode?: 'create' | 'edit'
    value?: Partial<BookmarkFormValue> | null
    categories?: CategoryTreeOption[]
    onSubmit?: (payload: BookmarkFormValue) => void | Promise<void>
    onCancel?: () => void
    onDelete?: (bookmark: { id: string | number; title: string }) => void | Promise<void>
    deleting?: boolean
    imageHostUrl?: string
  }

  let {
    open = false,
    loading = false,
    error = '',
    mode = 'create',
    value = null,
    categories = [],
    onSubmit = undefined,
    onCancel = undefined,
    onDelete = undefined,
    deleting = false,
    imageHostUrl = '',
  }: Props = $props()

  // 子组件经 `bind:` 写回字段（BookmarkBaseFields / ColorAlphaInput），需要深层响应。
  let form: BookmarkFormValue = $state({ ...emptyBookmarkForm })
  // 只在下面的副作用里比较，不进模板。
  let formKey = ''
  let faviconError = $state('')
  let selectedLogoSchemeName = $state(DEFAULT_LOGO_SURF_SCHEME.name)
  let iconifyName = $state('')
  let iconifyUseConfirmed = $state(false)
  let confirmedIconifyName = $state('')
  // 控制器每次返回新对象；不做深层代理。
  let iconifySearchState: BookmarkIconifySearchState = $state.raw(createBookmarkIconifySearchState())
  let iconifySearchTimer: ReturnType<typeof setTimeout> | null = null
  let iconifySearchAbortController: AbortController | null = null
  let titleLookupState: BookmarkTitleState = $state.raw(createBookmarkTitleState())

  // 当前链接下的图标候选
  let candidates: IconCandidate[] = $state.raw([])
  let candidateError = $state('')

  const nextKey = $derived(JSON.stringify({ open, mode, value, categories }))
  // 键变化时整体重置表单；原语句其余引用都受键比较守卫，只以键为依赖。
  $effect.pre(() => {
    const key = nextKey
    untrack(() => {
      if (key === formKey) return
      formKey = key
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
      iconifySearchState = createBookmarkIconifySearchState(iconifySearchState.requestId)
      // 弹窗是单例，requestId 必须接着上一轮往下走，否则上一轮在途的响应会污染新表单。
      titleLookupState = createBookmarkTitleState(titleLookupState.requestId)
      // 编辑模式也重新生成候选
      if (form.url.trim()) {
        candidates = getIconCandidates(form.url.trim(), form.title.trim())
      } else {
        candidates = []
      }
    })
  })

  // 输入 URL 后实时生成候选。
  // 原 `$:` 以整个 form 为依赖（legacy 对象粒度）：任一字段写入都会重跑并清空 candidateError；
  // 逐个读取字段保留这一粒度，而不是只在 url / title 变化时重跑。
  $effect.pre(() => {
    for (const key in form) void form[key as keyof BookmarkFormValue]
    if (!form.url.trim() || !formKey) return
    const url = form.url.trim()
    const title = form.title.trim()
    untrack(() => {
      candidates = getIconCandidates(url, title)
      candidateError = ''
    })
  })

  const currentLogoScheme = $derived(getLogoSchemeByName(selectedLogoSchemeName))
  const iconifyInput = $derived(deriveBookmarkIconifyInput(iconifyName))
  const normalizedIconifyName = $derived(iconifyInput.normalizedIconifyName)
  const iconifySourceUrl = $derived(iconifyInput.iconifySourceUrl)
  const iconifyPreviewUrl = $derived(iconifyInput.iconifyPreviewUrl)
  const showLogoSchemes = $derived(form.icon_source === 'logo_surf' && Boolean(form.url.trim()))
  const showIconifyOptions = $derived(form.icon_source === 'iconify')
  // 原拓扑顺序：确认复位在 iconifySelected 之前；只在需要时写回。
  $effect.pre(() => {
    if (shouldResetBookmarkIconifyConfirmation({
      iconifyUseConfirmed,
      normalizedIconifyName,
      confirmedIconifyName,
    })) {
      untrack(() => { iconifyUseConfirmed = false })
    }
  })
  const iconifySelected = $derived(isBookmarkIconifySelected({
    iconifyUseConfirmed,
    normalizedIconifyName,
    confirmedIconifyName,
  }))
  $effect.pre(() => {
    const enabled = open && showIconifyOptions
    const name = iconifyName
    untrack(() => scheduleIconifyCandidateSearch(enabled, name))
  })
  const logoPreviewText = $derived((form.title.trim() || 'NAV').slice(0, 4))
  // 两条图标同步只在值不同时写回 form.icon。
  $effect.pre(() => {
    if (form.icon_source === 'logo_surf' && form.url.trim()) {
      const nextLogoIcon = logoSurfIcon(form.title.trim(), form.url.trim(), currentLogoScheme)
      if (form.icon !== nextLogoIcon) {
        form.icon = nextLogoIcon
      }
    }
  })
  $effect.pre(() => {
    if (form.icon_source === 'iconify' && normalizedIconifyName && form.icon !== iconifySourceUrl) {
      form.icon = iconifySourceUrl
    }
  })

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

  function handleUrlBlur() {
    const result = scheduleBookmarkTitleLookup(titleLookupState, {
      mode,
      url: form.url,
      title: form.title,
    })
    if (!result.changed) return

    titleLookupState = result.state
    if (!result.task) return

    void loadSiteTitle(result.task.url, result.task.requestId)
  }

  async function loadSiteTitle(url: string, requestId: number) {
    try {
      const meta = await api.bookmarks.fetchSiteMeta(url)
      const resolved = resolveBookmarkTitleSuccess(titleLookupState, {
        requestId,
        title: meta.title,
        // 在 resolve 时读 form.title：请求在途期间用户可能已经自己打了标题。
        currentTitle: form.title,
      })
      titleLookupState = resolved.state
      if (resolved.title) {
        form.title = resolved.title
      }
    } catch (lookupError) {
      // 自动解析失败不打扰用户：手动输入标题始终可用。
      titleLookupState = resolveBookmarkTitleError(titleLookupState, {
        requestId,
        error: getErrorMessage(lookupError),
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

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
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
  })
</script>

{#if open}
  <BookmarkModalShell {mode} {loading} {deleting} onCancel={handleCancel}>
      <form class="modal-form" onsubmit={handleSubmit}>
        <BookmarkBaseFields
          bind:categoryId={form.category_id}
          bind:title={form.title}
          bind:url={form.url}
          bind:openMethod={form.open_method}
          bind:isPrivate={form.is_private}
          bind:description={form.description}
          bind:descriptionMode={form.description_mode}
          {categories}
          {loading}
          titleLoading={titleLookupState.loading}
          onUrlBlur={handleUrlBlur}
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
  </BookmarkModalShell>
{/if}

<style>
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

  .modal-form :global(.color-picker-row) {
    gap: 6px;
  }

  .modal-form :global(.color-picker-row input[type='text']) {
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
  }

  .modal-form :global(.color-swatch) {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    border-radius: 9px;
  }

  @media (max-width: 500px) {
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
