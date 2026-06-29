<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    DEFAULT_LOGO_SURF_SCHEME,
    LOGO_SURF_COLOR_SCHEMES,
    getIconCandidates,
    iconifyIcon,
    iconifyNameFromUrl,
    logoSurfIcon,
    normalizeIconifyName,
    type IconCandidate,
    type LogoSurfColorScheme,
  } from '../lib/icons'
  import ColorAlphaInput from './ColorAlphaInput.svelte'

  type BookmarkFormValue = {
    id?: string | number
    category_id?: string | number
    title: string
    url: string
    icon: string
    icon_source: string
    icon_background_color: string
    description: string
    open_method: 'same_tab' | 'new_tab' | 'modal'
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
    icon_background_color: '',
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
  let selectedLogoSchemeName = DEFAULT_LOGO_SURF_SCHEME.name
  let iconifyName = ''
  let previousBodyOverflow: string | null = null
  let previousDocumentOverflow: string | null = null

  // 当前链接下的图标候选
  let candidates: IconCandidate[] = []
  let candidateError = ''

  $: nextKey = JSON.stringify({ open, mode, value, categoryIds: categories.map((item) => item.id) })
  $: setPageScrollLocked(open)
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
      icon_background_color: value?.icon_background_color ?? '',
      description: value?.description ?? '',
      open_method: value?.open_method ?? 'new_tab',
    }
    selectedLogoSchemeName = findLogoSchemeName(form.icon) ?? DEFAULT_LOGO_SURF_SCHEME.name
    iconifyName = form.icon_source === 'iconify' ? iconifyNameFromUrl(form.icon) ?? '' : ''
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
  $: normalizedIconifyName = normalizeIconifyName(iconifyName)
  $: iconifyPreviewUrl = iconifyIcon(iconifyName)
  $: logoPreviewText = (form.title.trim() || 'NAV').slice(0, 4)
  $: canShowLogoSchemes = Boolean(
    form.url.trim() &&
      (form.icon_source === 'logo_surf' || candidates.some((candidate) => candidate.source === 'logo_surf')),
  )
  $: if (form.icon_source === 'logo_surf' && form.url.trim()) {
    const nextLogoIcon = logoSurfIcon(form.title.trim(), form.url.trim(), currentLogoScheme)
    if (form.icon !== nextLogoIcon) {
      form.icon = nextLogoIcon
    }
  }
  $: if (form.icon_source === 'iconify' && normalizedIconifyName && form.icon !== iconifyPreviewUrl) {
    form.icon = iconifyPreviewUrl
  }

  function getLogoSchemeByName(name: string): LogoSurfColorScheme {
    return LOGO_SURF_COLOR_SCHEMES.find((scheme) => scheme.name === name) ?? DEFAULT_LOGO_SURF_SCHEME
  }

  function findLogoSchemeName(icon: string): string | null {
    if (!icon.startsWith('data:image/svg+xml')) return null

    let decoded = icon
    try {
      decoded = decodeURIComponent(icon)
    } catch {
      decoded = icon
    }

    const normalized = decoded.toLowerCase()
    const match = LOGO_SURF_COLOR_SCHEMES.find((scheme) => {
      return normalized.includes(scheme.bgColor.toLowerCase()) && normalized.includes(scheme.textColor.toLowerCase())
    })

    return match?.name ?? null
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
    if (!iconifyPreviewUrl) {
      candidateError = '请输入有效的 Iconify 图标名，例如 mdi:home 或 simple-icons:github'
      return
    }

    form.icon = iconifyPreviewUrl
    form.icon_source = 'iconify'
    iconifyName = normalizedIconifyName
    candidateError = ''
    faviconError = ''
  }

  function openIconifyLibrary() {
    window.open('https://icon-sets.iconify.design/', '_blank', 'noopener,noreferrer')
  }

  function isCandidateSelected(candidate: IconCandidate): boolean {
    if (candidate.source === 'logo_surf') {
      return form.icon_source === 'logo_surf'
    }

    return form.icon === candidate.url && form.icon_source === candidate.source
  }

  function canPreviewIcon(icon: string): boolean {
    return /^https?:\/\//i.test(icon) || /^data:image\//i.test(icon)
  }

  function createIconVersion(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i += 1) {
      hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
    }
    return Math.abs(hash).toString(36)
  }

  function isFaviconImIconUrl(value: string): boolean {
    try {
      const hostname = new URL(value).hostname.toLowerCase()
      return hostname === 'favicon.im' || hostname.endsWith('.favicon.im')
    } catch {
      return false
    }
  }

  function getCandidatePreviewUrl(candidate: IconCandidate): string {
    if (candidate.source === 'favicon_im') {
      return logoSurfIcon(form.title.trim() || candidate.label, form.url.trim())
    }

    return candidate.url
  }

  function getFormIconPreviewUrl(): string {
    if ((form.icon_source === 'favicon_im' || isFaviconImIconUrl(form.icon)) && form.url.trim()) {
      return logoSurfIcon(form.title.trim(), form.url.trim())
    }

    if (form.id != null && /^https?:\/\//i.test(form.icon)) {
      const version = createIconVersion(`${form.id}:${form.icon_source ?? ''}:${form.icon}:${form.title}:${form.url}`)
      return `/api/icon/${form.id}?v=${version}`
    }

    return form.icon
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
    }
    candidateError = ''
    faviconError = ''
  }

  function clearIconSelection() {
    form.icon = ''
    form.icon_source = ''
    iconifyName = ''
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
      icon_background_color: form.icon_background_color.trim(),
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

  onDestroy(() => {
    setPageScrollLocked(false)
  })
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
                  class:selected={isCandidateSelected(candidate)}
                  on:click={() => selectCandidate(candidate)}
                  title={candidate.label}
                >
                  <img
                    src={getCandidatePreviewUrl(candidate)}
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

        <div class="iconify-section">
          <div class="scheme-header">
            <span class="field-label">Iconify 图标</span>
            <button type="button" class="text-link-button" on:click={openIconifyLibrary}>
              打开 Iconify 图标库
            </button>
          </div>
          <div class="iconify-row">
            <input
              bind:value={iconifyName}
              type="text"
              placeholder="例如 mdi:home、simple-icons:github"
              aria-label="Iconify 图标名"
            />
            {#if iconifyPreviewUrl}
              <span class="iconify-preview">
                <img src={iconifyPreviewUrl} alt="Iconify 图标预览" />
              </span>
            {/if}
            <button
              type="button"
              class="ghost-button fetch-button"
              on:click={selectIconifyIcon}
              disabled={loading || !iconifyPreviewUrl}
            >
              使用 Iconify
            </button>
          </div>
          <small class="hint-text">从 icon-sets.iconify.design 复制图标名，保存后会通过本地图标代理和浏览器缓存加载。</small>
          {#if candidateError}
            <small class="field-error">{candidateError}</small>
          {/if}
        </div>

        {#if canShowLogoSchemes}
          <div class="logo-scheme-section">
            <div class="scheme-header">
              <span class="field-label">文字图标配色</span>
              <span class="scheme-current">{currentLogoScheme.bgColor} / {currentLogoScheme.textColor}</span>
            </div>
            <div class="logo-scheme-grid">
              {#each LOGO_SURF_COLOR_SCHEMES as scheme}
                <button
                  type="button"
                  class="scheme-button"
                  class:selected={selectedLogoSchemeName === scheme.name && form.icon_source === 'logo_surf'}
                  on:click={() => selectLogoColorScheme(scheme)}
                  title={`${scheme.name}: ${scheme.bgColor} / ${scheme.textColor}`}
                >
                  <span class="scheme-preview" style="background: {scheme.bgColor}; color: {scheme.textColor};">
                    {logoPreviewText}
                  </span>
                  <span class="scheme-name">{scheme.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

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
          {#if form.icon && canPreviewIcon(form.icon)}
            <span class="icon-preview">
              <img src={getFormIconPreviewUrl()} alt="图标预览" />
              <small>图标预览</small>
            </span>
          {/if}
          {#if faviconError}
            <small class="field-error">{faviconError}</small>
          {/if}
        </label>

        <div class="field-block">
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

        <label>
          <span>描述</span>
          <textarea bind:value={form.description} rows="3" placeholder="补充说明，可选"></textarea>
        </label>

        <label>
          <span>打开方式</span>
          <select bind:value={form.open_method}>
            <option value="new_tab">新标签页</option>
            <option value="same_tab">当前标签页</option>
            <option value="modal">当前页弹层</option>
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
    width: min(100%, 640px);
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

  .modal-header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 14px 16px 10px;
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

  .modal-form {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    gap: 8px;
    padding: 12px 16px 0;
  }

  label,
  .field-block {
    display: grid;
    gap: 5px;
    color: #334155;
    font-size: 14px;
  }

  .field-block > span {
    font-weight: 600;
  }

  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 56px;
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
    font-size: 13px;
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
    gap: 5px;
  }

  .iconify-section {
    display: grid;
    gap: 6px;
  }

  .iconify-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px auto;
    align-items: center;
    gap: 6px;
  }

  .iconify-preview {
    width: 32px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
  }

  .iconify-preview img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .text-link-button {
    border: 0;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
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
    gap: 4px;
    min-height: 62px;
    padding: 6px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
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
    width: 28px;
    height: 28px;
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

  .logo-scheme-section {
    display: grid;
    gap: 5px;
  }

  .scheme-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .scheme-current {
    color: #64748b;
    font-size: 12px;
  }

  .logo-scheme-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    max-height: 118px;
    overflow-y: auto;
    overscroll-behavior: auto;
    padding-right: 2px;
  }

  .scheme-button {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-height: 38px;
    padding: 5px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .scheme-button:hover {
    border-color: #93c5fd;
    background: #f8fbff;
  }

  .scheme-button.selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .scheme-preview {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
  }

  .scheme-name {
    min-width: 0;
    color: #475569;
    font-size: 10px;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .scheme-button.selected .scheme-name {
    color: #1e40af;
    font-weight: 600;
  }

  .icon-row {
    display: flex;
    gap: 6px;
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
    width: 26px;
    height: 26px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .field-error {
    color: #dc2626;
  }

  .modal-actions {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 0 -16px;
    padding: 8px 16px 10px;
    border-top: 1px solid #e2e8f0;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(10px);
  }

  .primary-button,
  .ghost-button,
  .danger-button {
    border-radius: 12px;
    padding: 8px 14px;
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
    .modal-backdrop {
      padding: 10px;
    }

    .modal-card {
      max-height: calc(100vh - 20px);
      max-height: calc(100dvh - 20px);
    }

    .icon-candidates {
      grid-template-columns: repeat(2, 1fr);
    }

    .logo-scheme-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .scheme-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .icon-row {
      align-items: stretch;
      flex-direction: column;
    }

    .iconify-row {
      grid-template-columns: 1fr;
    }

    .iconify-preview {
      width: 100%;
    }

    .modal-actions {
      margin-right: -16px;
      margin-left: -16px;
      padding-right: 14px;
      padding-left: 14px;
    }
  }
</style>
