<script lang="ts">
  import type {
    BackgroundSetting,
    SearchEngine,
    SearchEngineSetting,
    Settings,
    ThemeMode,
  } from '../../shared/types'
  import { splitCssColorAlpha } from '../lib/color'
  import ColorAlphaInput from './ColorAlphaInput.svelte'

  type SettingsPanelValue = Pick<
    Settings,
    | 'site_title'
    | 'site_title_color'
    | 'site_title_font_size'
    | 'public_mode'
    | 'theme'
    | 'custom_css'
    | 'custom_js'
    | 'image_host_url'
    | 'background'
    | 'search_engine'
    | 'card_size'
    | 'card_style'
    | 'card_icon_size'
    | 'card_show_description'
    | 'card_background_color'
    | 'card_background_opacity'
    | 'card_icon_show_title'
    | 'card_text_color'
    | 'search_box_show'
    | 'search_engine_selector_show'
    | 'content_layout'
    | 'footer_html'
  >
  type AsyncVoid<T = void> = T | Promise<T>

  const themeOptions: Array<{ value: ThemeMode; label: string; hint: string }> = [
    { value: 'auto', label: '跟随系统', hint: '根据设备当前主题自动切换。' },
    { value: 'light', label: '浅色', hint: '始终使用浅色主题。' },
    { value: 'dark', label: '深色', hint: '始终使用深色主题。' },
  ]

  const backgroundTypeOptions: Array<{ value: BackgroundSetting['type']; label: string; hint: string }> = [
    { value: 'color', label: '纯色', hint: '填写 #hex 或 CSS 颜色值，例如 #0f172a。' },
    { value: 'gradient', label: '渐变', hint: '填写完整 CSS 渐变，例如 linear-gradient(135deg,#1e3a8a,#0f172a)。' },
    { value: 'image', label: '图片', hint: '填写图片外链 URL（可使用图床直链）。' },
  ]

  const defaultBackground: BackgroundSetting = { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' }
  const defaultSearchEngine: SearchEngineSetting = {
    current: 'Google',
    engines: [
      { name: 'Google', icon: '', url_template: 'https://www.google.com/search?q={q}' },
      { name: 'Bing', icon: '', url_template: 'https://www.bing.com/search?q={q}' },
    ],
  }

  const emptyForm: SettingsPanelValue = {
    site_title: '',
    site_title_color: '#ffffff',
    site_title_font_size: 32,
    public_mode: true,
    theme: 'auto',
    custom_css: '',
    custom_js: '',
    image_host_url: '',
    background: { ...defaultBackground },
    search_engine: { current: defaultSearchEngine.current, engines: defaultSearchEngine.engines.map((e) => ({ ...e })) },
    card_size: { width: 200, height: 0 }, // Sun-Panel 标准值
    card_style: 'info',
    card_icon_size: 70,
    card_show_description: true,
    card_background_color: '#ffffff',
    card_background_opacity: 0.9,
    card_icon_show_title: true,
    card_text_color: '',
    search_box_show: true,
    search_engine_selector_show: true,
    content_layout: { max_width: 1200, max_width_unit: 'px', margin_x: 0, margin_top: 0, margin_bottom: 0 },
    footer_html: '',
  }

  export let value: Partial<SettingsPanelValue> | null = null
  export let loading = false
  export let saving = false
  export let error = ''
  export let onSubmit: ((payload: SettingsPanelValue) => AsyncVoid) | undefined = undefined

  let form: SettingsPanelValue = cloneForm(emptyForm)
  let initialForm: SettingsPanelValue = cloneForm(emptyForm)
  let formKey = ''

  function cloneForm(source: SettingsPanelValue): SettingsPanelValue {
    return {
      site_title: source.site_title,
      site_title_color: source.site_title_color,
      site_title_font_size: source.site_title_font_size,
      public_mode: source.public_mode,
      theme: source.theme,
      custom_css: source.custom_css,
      custom_js: source.custom_js,
      image_host_url: source.image_host_url,
      background: { ...source.background },
      search_engine: {
        current: source.search_engine.current,
        engines: source.search_engine.engines.map((engine) => ({ ...engine })),
      },
      card_size: { ...source.card_size },
      card_style: source.card_style,
      card_icon_size: source.card_icon_size,
      card_show_description: source.card_show_description,
      card_background_color: source.card_background_color,
      card_background_opacity: source.card_background_opacity,
      card_icon_show_title: source.card_icon_show_title,
      card_text_color: source.card_text_color,
      search_box_show: source.search_box_show,
      search_engine_selector_show: source.search_engine_selector_show,
      content_layout: { ...source.content_layout },
      footer_html: source.footer_html,
    }
  }

  function createFormState(source: Partial<SettingsPanelValue> | null | undefined): SettingsPanelValue {
    const background = source?.background
    const searchEngine = source?.search_engine
    const cardSize = source?.card_size
    const contentLayout = source?.content_layout
    return {
      site_title: source?.site_title ?? '',
      site_title_color: source?.site_title_color ?? '#ffffff',
      site_title_font_size: typeof source?.site_title_font_size === 'number' ? source.site_title_font_size : 32,
      public_mode: source?.public_mode ?? true,
      theme: source?.theme ?? 'auto',
      custom_css: source?.custom_css ?? '',
      custom_js: source?.custom_js ?? '',
      image_host_url: source?.image_host_url ?? '',
      background: {
        type: background?.type ?? defaultBackground.type,
        value: background?.value ?? defaultBackground.value,
        blur: typeof background?.blur === 'number' ? background.blur : defaultBackground.blur,
        mask: typeof background?.mask === 'number' ? background.mask : defaultBackground.mask,
        maskColor: background?.maskColor ?? defaultBackground.maskColor,
      },
      search_engine: {
        current: searchEngine?.current ?? defaultSearchEngine.current,
        engines:
          searchEngine?.engines && searchEngine.engines.length > 0
            ? searchEngine.engines.map((engine) => ({
                name: engine.name ?? '',
                icon: engine.icon ?? '',
                url_template: engine.url_template ?? '',
              }))
            : defaultSearchEngine.engines.map((engine) => ({ ...engine })),
      },
      card_size: {
        width: typeof cardSize?.width === 'number' ? cardSize.width : 200,
        height: typeof cardSize?.height === 'number' ? cardSize.height : 0,
      },
      card_style: source?.card_style ?? 'info',
      card_icon_size: typeof source?.card_icon_size === 'number' ? source.card_icon_size : 70,
      card_show_description: source?.card_show_description ?? true,
      card_background_color: source?.card_background_color ?? '#ffffff',
      card_background_opacity: typeof source?.card_background_opacity === 'number' ? source.card_background_opacity : 0.9,
      card_icon_show_title: source?.card_icon_show_title ?? true,
      card_text_color: source?.card_text_color ?? '',
      search_box_show: source?.search_box_show ?? true,
      search_engine_selector_show: source?.search_engine_selector_show ?? true,
      content_layout: {
        max_width: typeof contentLayout?.max_width === 'number' ? contentLayout.max_width : 1200,
        max_width_unit: contentLayout?.max_width_unit === '%' ? '%' : 'px',
        margin_x: typeof contentLayout?.margin_x === 'number' ? contentLayout.margin_x : 0,
        margin_top: typeof contentLayout?.margin_top === 'number' ? contentLayout.margin_top : 0,
        margin_bottom: typeof contentLayout?.margin_bottom === 'number' ? contentLayout.margin_bottom : 0,
      },
      footer_html: source?.footer_html ?? '',
    }
  }

  function normalizeEngines(engines: SearchEngine[]): SearchEngine[] {
    return engines.map((engine) => ({
      name: engine.name.trim(),
      icon: engine.icon.trim(),
      url_template: engine.url_template.trim(),
    }))
  }

  function normalizeForm(source: SettingsPanelValue): SettingsPanelValue {
    const engines = normalizeEngines(source.search_engine.engines)
    const current = engines.some((engine) => engine.name === source.search_engine.current)
      ? source.search_engine.current
      : engines[0]?.name ?? ''
    const maskColor = splitCssColorAlpha(source.background.maskColor, '#000000', source.background.mask)
    const cardBackgroundColor = splitCssColorAlpha(
      source.card_background_color,
      '#ffffff',
      source.card_background_opacity,
    )
    return {
      site_title: source.site_title.trim(),
      site_title_color: source.site_title_color?.trim() || '#ffffff',
      site_title_font_size: clampNumber(source.site_title_font_size, 16, 72),
      public_mode: source.public_mode,
      theme: source.theme,
      custom_css: source.custom_css?.trim() ?? '',
      custom_js: source.custom_js?.trim() ?? '',
      image_host_url: source.image_host_url.trim(),
      background: {
        type: source.background.type,
        value: source.background.value.trim(),
        blur: clampNumber(source.background.blur, 0, 40),
        mask: clampNumber(maskColor.alpha, 0, 1),
        maskColor: maskColor.color,
      },
      search_engine: { current, engines },
      card_size: {
        width: clampNumber(source.card_size.width, 80, 400),
        height: clampNumber(source.card_size.height, 50, 300),
      },
      card_style: source.card_style === 'icon' ? 'icon' : 'info',
      card_icon_size: clampNumber(source.card_icon_size, 40, 100),
      card_show_description: source.card_show_description,
      card_background_color: cardBackgroundColor.color,
      card_background_opacity: clampNumber(cardBackgroundColor.alpha, 0, 1),
      card_icon_show_title: source.card_icon_show_title,
      card_text_color: source.card_text_color?.trim() ?? '',
      search_box_show: source.search_box_show,
      search_engine_selector_show: source.search_engine_selector_show,
      content_layout: {
        max_width: clampNumber(source.content_layout.max_width, source.content_layout.max_width_unit === '%' ? 40 : 640, source.content_layout.max_width_unit === '%' ? 100 : 2400),
        max_width_unit: source.content_layout.max_width_unit === '%' ? '%' : 'px',
        margin_x: clampNumber(source.content_layout.margin_x, 0, 100),
        margin_top: clampNumber(source.content_layout.margin_top, 0, 50),
        margin_bottom: clampNumber(source.content_layout.margin_bottom, 0, 50),
      },
      footer_html: source.footer_html.trim(),
    }
  }

  function clampNumber(input: number, min: number, max: number): number {
    if (!Number.isFinite(input)) return min
    return Math.min(max, Math.max(min, input))
  }

  $: nextKey = JSON.stringify({ value, loading })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    initialForm = createFormState(value)
    form = cloneForm(initialForm)
  }

  $: normalizedForm = normalizeForm(form)
  $: normalizedInitialForm = normalizeForm(initialForm)
  $: isDirty = JSON.stringify(normalizedForm) !== JSON.stringify(normalizedInitialForm)
  $: hasTitle = normalizedForm.site_title.length > 0
  $: enginesValid =
    normalizedForm.search_engine.engines.length > 0 &&
    normalizedForm.search_engine.engines.every(
      (engine) => engine.name.length > 0 && engine.url_template.includes('{q}'),
    )
  $: backgroundValid = normalizedForm.background.value.length > 0
  $: cardSizeValid =
    Number.isFinite(normalizedForm.card_size.width) &&
    normalizedForm.card_size.width >= 80 &&
    normalizedForm.card_size.width <= 400 &&
    Number.isFinite(normalizedForm.card_size.height) &&
    normalizedForm.card_size.height >= 50 &&
    normalizedForm.card_size.height <= 300
  $: contentLayoutValid =
    Number.isFinite(normalizedForm.content_layout.max_width) &&
    normalizedForm.content_layout.max_width > 0 &&
    Number.isFinite(normalizedForm.content_layout.margin_x) &&
    Number.isFinite(normalizedForm.content_layout.margin_top) &&
    Number.isFinite(normalizedForm.content_layout.margin_bottom)
  $: canSave =
    Boolean(onSubmit) &&
    !loading &&
    !saving &&
    hasTitle &&
    enginesValid &&
    backgroundValid &&
    cardSizeValid &&
    contentLayoutValid &&
    isDirty
  $: currentThemeHint = themeOptions.find((option) => option.value === form.theme)?.hint ?? ''
  $: currentBackgroundHint =
    backgroundTypeOptions.find((option) => option.value === form.background.type)?.hint ?? ''
  $: uploadHost = form.image_host_url.trim()

  function addEngine() {
    form.search_engine.engines = [
      ...form.search_engine.engines,
      { name: '', icon: '', url_template: 'https://example.com/search?q={q}' },
    ]
  }

  function removeEngine(index: number) {
    const removed = form.search_engine.engines[index]
    const next = form.search_engine.engines.filter((_, i) => i !== index)
    form.search_engine.engines = next
    if (removed && removed.name === form.search_engine.current) {
      form.search_engine.current = next[0]?.name ?? ''
    }
  }

  function openUpload() {
    if (!uploadHost) return
    const base = uploadHost.endsWith('/') ? uploadHost.slice(0, -1) : uploadHost
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit() {
    if (!canSave) {
      return
    }

    await onSubmit?.(normalizedForm)
  }
</script>

<section class="settings-panel" aria-busy={loading || saving}>
  <div class="panel-header">
    <div>
      <p class="panel-eyebrow">设置</p>
      <h2>站点设置</h2>
      <p class="panel-desc">维护站点标题、公开访问、主题、背景与搜索引擎。</p>
    </div>
  </div>

  {#if error}
    <div class="error-banner" role="alert">
      <strong>保存失败</strong>
      <p>{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="status-card">
      <p class="status-title">设置加载中...</p>
      <p class="status-desc">请稍候，正在准备当前配置。</p>
    </div>
  {:else}
    <form class="settings-form" on:submit|preventDefault={handleSubmit}>
      <!-- 基础 -->
      <fieldset class="group" disabled={saving}>
        <legend>基础</legend>
        <div class="form-grid">
          <label class="field full-width">
            <span>站点标题</span>
            <input
              bind:value={form.site_title}
              type="text"
              placeholder="例如：CF-Navs 导航站"
              maxlength="80"
              required
            />
            <small>将显示在页面标题与管理界面中。</small>
          </label>

          <div class="field">
            <span>标题颜色</span>
            <ColorAlphaInput
              bind:value={form.site_title_color}
              placeholder="#ffffff"
              inputLabel="标题颜色值"
              swatchTitle="选择标题颜色"
              alphaText="标题透明度"
            />
            <small>首页搜索栏上方标题的文字颜色。</small>
          </div>

          <label class="field">
            <span>标题文字大小 <em>{form.site_title_font_size}px</em></span>
            <input bind:value={form.site_title_font_size} type="range" min="16" max="72" step="1" />
            <small>控制首页标题字号，建议 28-44px。</small>
          </label>

          <label class="field">
            <span>主题模式</span>
            <select bind:value={form.theme}>
              {#each themeOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <small>{currentThemeHint}</small>
          </label>

          <label class="field">
            <span>图床地址</span>
            <input bind:value={form.image_host_url} type="url" placeholder="https://img.example.com" />
            <small>可留空。用于背景/图标的“打开图床上传”跳转。</small>
          </label>

          <label class="toggle-field full-width">
            <div class="toggle-copy">
              <span>公开模式</span>
              <p>开启后，未登录用户也可以访问首页内容。</p>
            </div>
            <input bind:checked={form.public_mode} type="checkbox" />
          </label>

          <label class="toggle-field full-width">
            <div class="toggle-copy">
              <span>显示搜索框</span>
              <p>控制首页标题下方的搜索区域是否展示。</p>
            </div>
            <input bind:checked={form.search_box_show} type="checkbox" />
          </label>

        </div>
      </fieldset>

      <!-- 背景 -->
      <fieldset class="group" disabled={saving}>
        <legend>背景</legend>
        <div class="form-grid">
          <label class="field">
            <span>背景类型</span>
            <select bind:value={form.background.type}>
              {#each backgroundTypeOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <small>{currentBackgroundHint}</small>
          </label>

          <label class="field">
            <span>背景值</span>
            <div class="inline-input">
              <input
                bind:value={form.background.value}
                type="text"
                placeholder={form.background.type === 'image'
                  ? 'https://img.example.com/bg.png'
                  : form.background.type === 'gradient'
                    ? 'linear-gradient(135deg,#1e3a8a,#0f172a)'
                    : '#0f172a'}
              />
              {#if form.background.type === 'image' && uploadHost}
                <button type="button" class="ghost-button" on:click={openUpload}>打开图床上传 ↗</button>
              {/if}
            </div>
            {#if !backgroundValid}
              <small class="warn">请填写背景值。</small>
            {/if}
          </label>

          <label class="field">
            <span>模糊度 <em>{form.background.blur}px</em></span>
            <input bind:value={form.background.blur} type="range" min="0" max="40" step="1" />
            <small>对图片/渐变背景应用模糊，0 表示不模糊。</small>
          </label>

          <label class="field">
            <span>遮罩透明度 <em>{form.background.mask.toFixed(2)}</em></span>
            <input bind:value={form.background.mask} type="range" min="0" max="1" step="0.05" />
            <small>叠加在背景上的遮罩，数值越大背景越淡。</small>
          </label>

          <div class="field">
            <span>遮罩颜色</span>
            <ColorAlphaInput
              bind:value={form.background.maskColor}
              bind:alpha={form.background.mask}
              placeholder="#000000"
              inputLabel="遮罩颜色值"
              swatchTitle="选择遮罩颜色"
              alphaText="遮罩透明度"
            />
            <small>遮挡背景的蒙层色值，例如 <code>#000000</code>（黑色默认）或 <code>rgba(0,0,0,0.5)</code>。</small>
          </div>
        </div>
      </fieldset>

      <!-- 卡片尺寸 -->
      <fieldset class="group" disabled={saving}>
        <legend>卡片尺寸</legend>
        <div class="form-grid">
          <label class="field">
            <span>最小宽度 (px)</span>
            <input bind:value={form.card_size.width} type="number" min="80" max="400" step="10" />
            <small>书签卡片最小宽度，建议 180-280。</small>
          </label>
          <label class="field">
            <span>最小高度 (px)</span>
            <input bind:value={form.card_size.height} type="number" min="50" max="300" step="10" />
            <small>书签卡片最小高度，建议 100-150。</small>
          </label>
        </div>
      </fieldset>

      <!-- 内容区 -->
      <fieldset class="group" disabled={saving}>
        <legend>内容区</legend>
        <div class="form-grid">
          <label class="field">
            <span>最大宽度</span>
            <div class="inline-input">
              <input bind:value={form.content_layout.max_width} type="number" min="40" max="2400" step="10" />
              <select bind:value={form.content_layout.max_width_unit} class="unit-select" aria-label="最大宽度单位">
                <option value="px">px</option>
                <option value="%">%</option>
              </select>
            </div>
            <small>首页内容区最大宽度，Sun-Panel 默认 1200px。</small>
          </label>

          <label class="field">
            <span>左右边距 <em>{form.content_layout.margin_x}px</em></span>
            <input bind:value={form.content_layout.margin_x} type="range" min="0" max="100" step="1" />
            <small>在内容区两侧追加留白。</small>
          </label>

          <label class="field">
            <span>顶部边距 <em>{form.content_layout.margin_top}%</em></span>
            <input bind:value={form.content_layout.margin_top} type="range" min="0" max="50" step="1" />
            <small>控制搜索区域到页面顶部的距离。</small>
          </label>

          <label class="field">
            <span>底部边距 <em>{form.content_layout.margin_bottom}%</em></span>
            <input bind:value={form.content_layout.margin_bottom} type="range" min="0" max="50" step="1" />
            <small>控制内容列表底部留白。</small>
          </label>
        </div>
      </fieldset>

      <!-- 卡片背景 -->
      <fieldset class="group" disabled={saving}>
        <legend>卡片背景</legend>
        <div class="form-grid">
          <div class="field">
            <span>卡片颜色</span>
            <ColorAlphaInput
              bind:value={form.card_background_color}
              bind:alpha={form.card_background_opacity}
              placeholder="#ffffff"
              inputLabel="卡片颜色值"
              swatchTitle="选择卡片颜色"
              alphaText="卡片透明度"
            />
            <small>书签卡片背景色，例如 <code>#ffffff</code>（白色默认）。</small>
          </div>

          <label class="field">
            <span>卡片透明度 <em>{form.card_background_opacity.toFixed(2)}</em></span>
            <input bind:value={form.card_background_opacity} type="range" min="0" max="1" step="0.05" />
            <small>数值越大越不透明，1 为完全不透明。</small>
          </label>
        </div>
      </fieldset>

      <!-- 卡片风格 -->
      <fieldset class="group" disabled={saving}>
        <legend>卡片风格</legend>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" bind:group={form.card_style} value="info" />
            <div class="radio-content">
              <strong>详情风格</strong>
              <p>显示图标、标题和描述，适合信息丰富的书签</p>
            </div>
          </label>

          <label class="radio-option">
            <input type="radio" bind:group={form.card_style} value="icon" />
            <div class="radio-content">
              <strong>极简风格</strong>
              <p>仅显示图标和标题，紧凑布局节省空间</p>
            </div>
          </label>
        </div>
      </fieldset>

      <!-- 图标尺寸 -->
      <fieldset class="group" disabled={saving}>
        <legend>图标与文字</legend>
        <div class="form-grid">
          <label class="field">
            <span>图标大小 (px)</span>
            <input bind:value={form.card_icon_size} type="number" min="40" max="100" step="5" />
            <small>推荐：70px（Sun-Panel 默认值）</small>
          </label>

          <div class="field">
            <span>卡片文字颜色</span>
            <ColorAlphaInput
              bind:value={form.card_text_color}
              placeholder="留空则跟随主题"
              inputLabel="卡片文字颜色值"
              swatchTitle="选择卡片文字颜色"
              alphaText="文字透明度"
            />
            <small>控制书签标题和描述文字颜色；留空时自动跟随当前主题。</small>
          </div>
        </div>
      </fieldset>

      <!-- 详情风格选项 -->
      {#if form.card_style === 'info'}
        <fieldset class="group" disabled={saving}>
          <legend>详情风格选项</legend>
          <label class="checkbox-field">
            <input type="checkbox" bind:checked={form.card_show_description} />
            <span>显示书签描述</span>
          </label>
          <small>关闭后仅显示标题，节省空间</small>
        </fieldset>
      {/if}

      {#if form.card_style === 'icon'}
        <fieldset class="group" disabled={saving}>
          <legend>极简风格选项</legend>
          <label class="checkbox-field">
            <input type="checkbox" bind:checked={form.card_icon_show_title} />
            <span>显示书签标题</span>
          </label>
          <small>开启后，小图标下方会显示标题；关闭时只保留悬停提示。</small>
        </fieldset>
      {/if}

      <!-- 搜索引擎 -->
      <fieldset class="group" disabled={saving}>
        <legend>搜索引擎</legend>

        <label class="field">
          <span>默认引擎</span>
          <select bind:value={form.search_engine.current} disabled={form.search_engine.engines.length === 0}>
            {#if form.search_engine.engines.length === 0}
              <option value="">无可用引擎</option>
            {:else}
              {#each form.search_engine.engines as engine (engine)}
                {#if engine.name.trim()}
                  <option value={engine.name}>{engine.name}</option>
                {/if}
              {/each}
            {/if}
          </select>
          <small>首页搜索框默认选中的引擎。</small>
        </label>

        <label class="toggle-field full-width">
          <div class="toggle-copy">
            <span>显示引擎选择器</span>
            <p>关闭后首页搜索框只使用默认搜索引擎。</p>
          </div>
          <input bind:checked={form.search_engine_selector_show} type="checkbox" />
        </label>

        <div class="engine-list">
          {#each form.search_engine.engines as engine, index (index)}
            <div class="engine-row">
              <label class="engine-cell">
                <span>名称</span>
                <input bind:value={engine.name} type="text" placeholder="Google" />
              </label>
              <label class="engine-cell">
                <span>图标 URL</span>
                <input bind:value={engine.icon} type="text" placeholder="可留空" />
              </label>
              <label class="engine-cell grow">
                <span>查询模板（含 {'{q}'}）</span>
                <input
                  bind:value={engine.url_template}
                  type="text"
                  placeholder="https://www.google.com/search?q={'{q}'}"
                />
              </label>
              <button
                type="button"
                class="danger-button"
                on:click={() => removeEngine(index)}
                disabled={form.search_engine.engines.length <= 1}
                aria-label="删除引擎"
              >
                删除
              </button>
            </div>
          {/each}
        </div>

        <button type="button" class="ghost-button add-engine" on:click={addEngine}>+ 新增搜索引擎</button>

        {#if !enginesValid}
          <small class="warn">每个引擎都需填写名称，且查询模板必须包含 {'{q}'} 占位符。</small>
        {/if}
      </fieldset>

      <!-- 页脚 -->
      <fieldset class="group" disabled={saving}>
        <legend>自定义页脚</legend>
        <label class="field full-width">
          <span>页脚 HTML</span>
          <textarea
            bind:value={form.footer_html}
            rows="4"
            placeholder='<div style="text-align:center;color:#cbd5e1">Powered by CF-Navs</div>'
          ></textarea>
          <small>显示在首页底部。请仅填写可信 HTML。</small>
        </label>
      </fieldset>

      <div class="form-footer">
        <p class="helper-text">
          {#if saving}
            正在保存设置，请稍候...
          {:else if !hasTitle}
            请先填写站点标题。
          {:else if !backgroundValid}
            请完善背景设置。
          {:else if !enginesValid}
            请完善搜索引擎配置。
          {:else if !contentLayoutValid}
            请完善内容区布局配置。
          {:else if isDirty}
            检测到未保存的更改。
          {:else}
            当前配置已是最新状态。
          {/if}
        </p>
      </div>

      <button type="submit" class="floating-save-btn" disabled={!canSave}>
        {#if saving}
          保存中...
        {:else}
          保存设置
        {/if}
      </button>
    </form>
  {/if}
</section>

<style>
  .settings-panel {
    display: grid;
    gap: 20px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
    padding: 24px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .panel-eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
    color: #0f172a;
  }

  .panel-desc,
  .status-desc,
  .toggle-copy p,
  .helper-text,
  small {
    color: #64748b;
    line-height: 1.55;
  }

  .panel-desc {
    margin-top: 10px;
  }

  small.warn {
    color: #b45309;
  }

  .error-banner,
  .status-card,
  .toggle-field {
    border-radius: 18px;
    padding: 16px;
  }

  .error-banner {
    border: 1px solid #fecaca;
    background: #fef2f2;
    display: grid;
    gap: 6px;
    color: #991b1b;
  }

  .error-banner strong {
    font-size: 14px;
  }

  .status-card {
    border: 1px solid #dbeafe;
    background: #f8fbff;
    display: grid;
    gap: 6px;
  }

  .status-title {
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
  }

  .settings-form {
    display: grid;
    gap: 20px;
    padding-bottom: 88px; /* 给浮动保存按钮留空间 */
  }

  .group {
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    padding: 18px;
    display: grid;
    gap: 16px;
    margin: 0;
    min-width: 0;
  }

  .group legend {
    padding: 0 8px;
    font-size: 14px;
    font-weight: 600;
    color: #334155;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .field,
  .toggle-field,
  .engine-cell {
    display: grid;
    gap: 8px;
  }

  .field.full-width,
  .toggle-field.full-width {
    grid-column: 1 / -1;
  }

  .field span,
  .toggle-copy span,
  .engine-cell span {
    color: #334155;
    font-size: 14px;
    font-weight: 600;
  }

  .field span em {
    font-style: normal;
    color: #2563eb;
    font-weight: 600;
  }

  input:not([type='radio']):not([type='checkbox']),
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
    min-height: 96px;
    line-height: 1.5;
  }

  .unit-select {
    flex: 0 0 84px;
  }

  input[type='range'] {
    padding: 0;
    accent-color: #2563eb;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .inline-input {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .inline-input input {
    flex: 1 1 auto;
  }

  .toggle-field {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .toggle-copy {
    display: grid;
    gap: 6px;
  }

  .toggle-field input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: #2563eb;
  }

  .engine-list {
    display: grid;
    gap: 12px;
  }

  .engine-row {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.4fr) auto;
    gap: 10px;
    align-items: end;
    border: 1px solid #eef2f7;
    border-radius: 14px;
    padding: 12px;
    background: #f9fafb;
  }

  .engine-cell.grow {
    min-width: 0;
  }

  .add-engine {
    justify-self: start;
  }

  .form-footer {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-top: 4px;
  }

  .helper-text {
    font-size: 13px;
  }

  /* 浮动保存按钮 */
  .floating-save-btn {
    position: fixed;
    bottom: 32px;
    right: 32px;
    z-index: 100;
    border: none;
    background: #2563eb;
    color: #ffffff;
    border-radius: 14px;
    padding: 14px 28px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.35);
    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
    white-space: nowrap;
  }

  .floating-save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 28px rgba(37, 99, 235, 0.45);
  }

  .floating-save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .ghost-button,
  .danger-button {
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: 0.18s ease;
    white-space: nowrap;
  }

  .ghost-button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .danger-button {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .ghost-button:disabled,
  .danger-button:disabled,
  input:disabled,
  select:disabled,
  fieldset:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  fieldset:disabled {
    opacity: 1;
  }

  @media (max-width: 720px) {
    .settings-panel {
      padding: 20px;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .engine-row {
      grid-template-columns: 1fr;
    }

    .toggle-field {
      align-items: flex-start;
    }

    .settings-form {
      padding-bottom: 78px;
    }

    .floating-save-btn {
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      font-size: 14px;
    }
  }

  /* 单选按钮组 */
  .radio-group {
    display: flex;
    flex-direction: row;
    gap: 0.75rem;
    flex-wrap: wrap; /* 允许换行 */
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem; /* 从0.75rem减小到0.625rem */
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 0 1 auto; /* 不自动拉伸，根据内容决定宽度 */
    max-width: 320px; /* 限制最大宽度 */
    min-width: 240px; /* 设置最小宽度 */
  }

  .radio-option:hover {
    border-color: rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.05);
  }

  .radio-option input[type='radio'] {
    margin-top: 0.25rem;
    cursor: pointer;
    flex-shrink: 0; /* 防止单选按钮缩小 */
    width: auto; /* 使用自然宽度 */
    height: 16px; /* 固定高度 */
  }

  .radio-content {
    flex: 1;
  }

  .radio-content strong {
    display: block;
    margin-bottom: 0.2rem; /* 从0.25rem减小到0.2rem */
    font-weight: 600;
    color: #0f172a;
    font-size: 0.875rem; /* 从0.9rem减小到0.875rem */
  }

  .radio-content p {
    margin: 0;
    font-size: 0.75rem; /* 从0.8rem减小到0.75rem */
    color: #64748b;
    line-height: 1.3; /* 从1.4减小到1.3 */
  }

  /* 复选框字段 */
  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }

  .checkbox-field input[type='checkbox'] {
    cursor: pointer;
  }

  .checkbox-field span {
    font-weight: 500;
  }

</style>
