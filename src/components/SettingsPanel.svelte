<script lang="ts">
  import type {
    BackgroundPresetId,
    BackgroundSetting,
    SearchEngine,
    SearchEngineSetting,
    Settings,
    ThemeMode,
  } from '../../shared/types'
  import { parseCssColor, splitCssColorAlpha } from '../lib/color'
  import { gradientPresets, type GradientPresetId, type ThemeGradientPreset } from '../lib/themePresets'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import GradientBackgroundInput from './GradientBackgroundInput.svelte'

  type SettingsPanelValue = Pick<
    Settings,
    | 'site_title'
    | 'site_title_color'
    | 'site_title_font_size'
    | 'public_mode'
    | 'theme'
    | 'background_preset_id'
    | 'custom_css'
    | 'custom_js'
    | 'image_host_url'
    | 'background'
    | 'backgrounds'
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
    { value: 'color', label: '纯色', hint: '支持 #hex、rgb()、rgba()，也可用颜色拾取器。' },
    { value: 'gradient', label: '渐变', hint: '支持完整 CSS 渐变，也可用下方两端颜色生成。' },
    { value: 'image', label: '图片', hint: '填写图片外链 URL；配置图床后可快速上传。' },
  ]

  const defaultLightBackground: BackgroundSetting = { type: 'color', value: '#f8fafc', blur: 0, mask: 0.18, maskColor: '#ffffff' }
  const defaultDarkBackground: BackgroundSetting = { type: 'color', value: '#0f172a', blur: 0, mask: 0.3, maskColor: '#000000' }
  const defaultLightGradient = { start: '#e0f2fe', end: '#f8fafc' }
  const defaultDarkGradient = { start: '#1e3a8a', end: '#0f172a' }
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
    background_preset_id: 'custom',
    custom_css: '',
    custom_js: '',
    image_host_url: '',
    background: { ...defaultDarkBackground },
    backgrounds: {
      light: { ...defaultLightBackground },
      dark: { ...defaultDarkBackground },
    },
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
      background_preset_id: source.background_preset_id,
      custom_css: source.custom_css,
      custom_js: source.custom_js,
      image_host_url: source.image_host_url,
      background: { ...source.background },
      backgrounds: {
        light: { ...source.backgrounds.light },
        dark: { ...source.backgrounds.dark },
      },
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

  function normalizeBackgroundPresetId(input: unknown): BackgroundPresetId {
    return input === 'clear-teal' || input === 'mist-slate' || input === 'custom' ? input : 'custom'
  }

  function resolveBackgroundPresetId(
    source: Partial<SettingsPanelValue> | null | undefined,
    lightBackground: BackgroundSetting | undefined,
    darkBackground: BackgroundSetting | undefined,
  ): BackgroundPresetId {
    if (source?.background_preset_id === 'clear-teal' || source?.background_preset_id === 'mist-slate') {
      return source.background_preset_id
    }

    if (lightBackground && darkBackground) {
      const normalizedLight = normalizeBackground(lightBackground, defaultLightBackground)
      const normalizedDark = normalizeBackground(darkBackground, defaultDarkBackground)
      const matched = gradientPresets.find((preset) => (
        backgroundPresetValueEquals(normalizedLight, preset.light) &&
        backgroundPresetValueEquals(normalizedDark, preset.dark)
      ))
      if (matched) return matched.id
    }

    return 'custom'
  }

  function createFormState(source: Partial<SettingsPanelValue> | null | undefined): SettingsPanelValue {
    const background = source?.background
    const lightBackground = source?.backgrounds?.light ?? background
    const darkBackground = source?.backgrounds?.dark ?? background
    const searchEngine = source?.search_engine
    const cardSize = source?.card_size
    const contentLayout = source?.content_layout
    return {
      site_title: source?.site_title ?? '',
      site_title_color: source?.site_title_color ?? '#ffffff',
      site_title_font_size: typeof source?.site_title_font_size === 'number' ? source.site_title_font_size : 32,
      public_mode: source?.public_mode ?? true,
      theme: source?.theme ?? 'auto',
      background_preset_id: resolveBackgroundPresetId(source, lightBackground, darkBackground),
      custom_css: source?.custom_css ?? '',
      custom_js: source?.custom_js ?? '',
      image_host_url: source?.image_host_url ?? '',
      background: {
        type: background?.type ?? defaultDarkBackground.type,
        value: background?.value ?? defaultDarkBackground.value,
        blur: typeof background?.blur === 'number' ? background.blur : defaultDarkBackground.blur,
        mask: typeof background?.mask === 'number' ? background.mask : defaultDarkBackground.mask,
        maskColor: background?.maskColor ?? defaultDarkBackground.maskColor,
      },
      backgrounds: {
        light: {
          type: lightBackground?.type ?? defaultLightBackground.type,
          value: lightBackground?.value ?? defaultLightBackground.value,
          blur: typeof lightBackground?.blur === 'number' ? lightBackground.blur : defaultLightBackground.blur,
          mask: typeof lightBackground?.mask === 'number' ? lightBackground.mask : defaultLightBackground.mask,
          maskColor: lightBackground?.maskColor ?? defaultLightBackground.maskColor,
        },
        dark: {
          type: darkBackground?.type ?? defaultDarkBackground.type,
          value: darkBackground?.value ?? defaultDarkBackground.value,
          blur: typeof darkBackground?.blur === 'number' ? darkBackground.blur : defaultDarkBackground.blur,
          mask: typeof darkBackground?.mask === 'number' ? darkBackground.mask : defaultDarkBackground.mask,
          maskColor: darkBackground?.maskColor ?? defaultDarkBackground.maskColor,
        },
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

  function normalizeBackground(source: BackgroundSetting, fallback: BackgroundSetting): BackgroundSetting {
    const maskColor = splitCssColorAlpha(source.maskColor, fallback.maskColor, source.mask)
    return {
      type: source.type,
      value: source.value.trim(),
      blur: clampNumber(source.blur, 0, 40),
      mask: clampNumber(maskColor.alpha, 0, 1),
      maskColor: maskColor.color,
    }
  }

  function normalizeForm(source: SettingsPanelValue): SettingsPanelValue {
    const engines = normalizeEngines(source.search_engine.engines)
    const current = engines.some((engine) => engine.name === source.search_engine.current)
      ? source.search_engine.current
      : engines[0]?.name ?? ''
    const cardBackgroundColor = splitCssColorAlpha(
      source.card_background_color,
      '#ffffff',
      source.card_background_opacity,
    )
    const lightBackground = normalizeBackground(source.backgrounds.light, defaultLightBackground)
    const darkBackground = normalizeBackground(source.backgrounds.dark, defaultDarkBackground)
    return {
      site_title: source.site_title.trim(),
      site_title_color: source.site_title_color?.trim() ?? '',
      site_title_font_size: clampNumber(source.site_title_font_size, 16, 72),
      public_mode: source.public_mode,
      theme: source.theme,
      background_preset_id: source.background_preset_id,
      custom_css: source.custom_css?.trim() ?? '',
      custom_js: source.custom_js?.trim() ?? '',
      image_host_url: source.image_host_url.trim(),
      background: source.theme === 'dark' ? darkBackground : lightBackground,
      backgrounds: {
        light: lightBackground,
        dark: darkBackground,
      },
      search_engine: { current, engines },
      card_size: {
        width: clampNumber(source.card_size.width, 80, 400),
        height: clampNumber(source.card_size.height, 0, 300),
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

  function gradientValue(start: string, end: string): string {
    return `linear-gradient(135deg, ${start}, ${end})`
  }

  function isGradientValue(input: string): boolean {
    return /gradient\s*\(/i.test(input)
  }

  function normalizeBackgroundValueForType(
    currentValue: string,
    nextType: BackgroundSetting['type'],
    defaults: { color: string; gradientStart: string; gradientEnd: string },
  ): string {
    const trimmed = currentValue.trim()

    if (nextType === 'color') {
      return parseCssColor(trimmed) ? trimmed : defaults.color
    }

    if (nextType === 'gradient') {
      return isGradientValue(trimmed)
        ? trimmed
        : gradientValue(parseCssColor(trimmed) ? trimmed : defaults.gradientStart, defaults.gradientEnd)
    }

    return /^https?:\/\//i.test(trimmed) ? trimmed : ''
  }

  function updateBackgroundType(theme: 'light' | 'dark', nextType: BackgroundSetting['type']): void {
    markCustomGradientPreset()
    const background = form.backgrounds[theme]
    const defaults = theme === 'light'
      ? {
          color: defaultLightBackground.value,
          gradientStart: defaultLightGradient.start,
          gradientEnd: defaultLightGradient.end,
        }
      : {
          color: defaultDarkBackground.value,
          gradientStart: defaultDarkGradient.start,
          gradientEnd: defaultDarkGradient.end,
        }

    form.backgrounds[theme] = {
      ...background,
      type: nextType,
      value: normalizeBackgroundValueForType(background.value, nextType, defaults),
    }
  }

  function cloneBackgroundSetting(source: BackgroundSetting): BackgroundSetting {
    return { ...source }
  }

  function markCustomGradientPreset(): void {
    form.background_preset_id = 'custom'
  }

  function comparableText(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
  }

  function backgroundPresetValueEquals(current: BackgroundSetting, target: BackgroundSetting): boolean {
    return current.type === target.type && comparableText(current.value) === comparableText(target.value)
  }

  function findGradientPresetByBackgroundValues(source: SettingsPanelValue): ThemeGradientPreset | undefined {
    return gradientPresets.find((item) => (
      backgroundPresetValueEquals(source.backgrounds.light, item.light) &&
      backgroundPresetValueEquals(source.backgrounds.dark, item.dark)
    ))
  }

  function getActiveGradientPresetId(source: SettingsPanelValue): GradientPresetId | 'custom' {
    const presetId = normalizeBackgroundPresetId(source.background_preset_id)
    if (presetId !== 'custom' && gradientPresets.some((item) => item.id === presetId)) {
      return presetId
    }
    return findGradientPresetByBackgroundValues(source)?.id ?? 'custom'
  }

  function applyGradientPreset(preset: ThemeGradientPreset): void {
    form.background_preset_id = preset.id
    form.backgrounds = {
      light: cloneBackgroundSetting(preset.light),
      dark: cloneBackgroundSetting(preset.dark),
    }
    form.background = cloneBackgroundSetting(form.theme === 'dark' ? preset.dark : preset.light)
    form.card_background_color = preset.cardBackgroundColor
    form.card_background_opacity = preset.cardBackgroundOpacity
    form.card_text_color = preset.cardTextColor
    form.site_title_color = preset.siteTitleColor
  }

  function handleLightBackgroundTypeChange(event: Event): void {
    updateBackgroundType('light', (event.currentTarget as HTMLSelectElement).value as BackgroundSetting['type'])
  }

  function handleDarkBackgroundTypeChange(event: Event): void {
    updateBackgroundType('dark', (event.currentTarget as HTMLSelectElement).value as BackgroundSetting['type'])
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
  $: lightBackgroundValid = normalizedForm.backgrounds.light.value.length > 0
  $: darkBackgroundValid = normalizedForm.backgrounds.dark.value.length > 0
  $: backgroundValid = lightBackgroundValid && darkBackgroundValid
  $: cardSizeValid =
    Number.isFinite(normalizedForm.card_size.width) &&
    normalizedForm.card_size.width >= 80 &&
    normalizedForm.card_size.width <= 400 &&
    Number.isFinite(normalizedForm.card_size.height) &&
    normalizedForm.card_size.height >= 0 &&
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
  $: lightBackgroundHint =
    backgroundTypeOptions.find((option) => option.value === form.backgrounds.light.type)?.hint ?? ''
  $: darkBackgroundHint =
    backgroundTypeOptions.find((option) => option.value === form.backgrounds.dark.type)?.hint ?? ''
  $: activeGradientPresetId = getActiveGradientPresetId(form)
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
      <fieldset class="group group-wide group-base" disabled={saving}>
        <legend>基础</legend>
        <div class="form-grid base-grid">
          <label class="field field-title">
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

          <div class="field field-color">
            <span>标题颜色</span>
            <ColorAlphaInput
              bind:value={form.site_title_color}
              placeholder="留空则跟随主题"
              inputLabel="标题颜色值"
              swatchTitle="选择标题颜色"
              alphaText="标题透明度"
            />
            <small>首页搜索栏上方标题的文字颜色；留空时自动跟随当前主题。</small>
          </div>

          <label class="field field-range">
            <span>标题文字大小 <em>{form.site_title_font_size}px</em></span>
            <input bind:value={form.site_title_font_size} type="range" min="16" max="72" step="1" />
            <small>控制首页标题字号，建议 28-44px。</small>
          </label>

          <label class="field field-select">
            <span>主题模式</span>
            <select bind:value={form.theme}>
              {#each themeOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <small>{currentThemeHint}</small>
          </label>

          <label class="field field-url">
            <span>图床地址</span>
            <input bind:value={form.image_host_url} type="url" placeholder="https://img.example.com" />
            <small>可留空。用于背景/图标的“打开图床上传”跳转。</small>
          </label>

          <label class="toggle-field field-toggle">
            <div class="toggle-copy">
              <span>公开模式</span>
              <p>开启后，未登录用户也可以访问首页内容。</p>
            </div>
            <input bind:checked={form.public_mode} type="checkbox" />
          </label>

        </div>
      </fieldset>

      <!-- 背景 -->
      <fieldset class="group group-wide group-background" disabled={saving}>
        <legend>背景</legend>
        <div class="gradient-preset-panel">
          <div class="gradient-preset-header">
            <div>
              <strong>内置渐变方案</strong>
              <p>选择后会同时应用浅色/深色背景、遮罩、卡片透明度和自动文字颜色。</p>
            </div>
            {#if activeGradientPresetId === 'custom'}
              <span>自定义</span>
            {:else}
              <span>已选方案</span>
            {/if}
          </div>

          <div class="gradient-preset-grid">
            {#each gradientPresets as preset (preset.id)}
              <label
                class="gradient-preset-option"
                class:active={activeGradientPresetId === preset.id}
                style={`--preset-light-bg: ${preset.light.value}; --preset-dark-bg: ${preset.dark.value};`}
              >
                <input
                  type="radio"
                  name="gradient-preset"
                  checked={activeGradientPresetId === preset.id}
                  on:change={() => applyGradientPreset(preset)}
                />
                <span class="preset-preview" aria-hidden="true">
                  <span class="preset-swatch light"></span>
                  <span class="preset-swatch dark"></span>
                </span>
                <span class="preset-copy">
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </span>
              </label>
            {/each}

            <label class="gradient-preset-option custom" class:active={activeGradientPresetId === 'custom'}>
              <input
                type="radio"
                name="gradient-preset"
                checked={activeGradientPresetId === 'custom'}
                on:change={markCustomGradientPreset}
              />
              <span class="preset-preview custom-preview" aria-hidden="true">
                <span></span>
                <span></span>
              </span>
              <span class="preset-copy">
                <strong>自定义渐变</strong>
                <small>保留下面浅色/深色背景的完整 CSS 渐变手动配置。</small>
              </span>
            </label>
          </div>
        </div>

        <div class="theme-background-grid">
          <section class="theme-background-card">
            <div class="theme-background-header">
              <strong>浅色模式背景</strong>
              <span>Light</span>
            </div>
            <div class="background-form">
              <div class="background-main-row">
                <label class="field background-type-field">
                  <span>背景类型</span>
                  <select
                    value={form.backgrounds.light.type}
                    on:change={handleLightBackgroundTypeChange}
                  >
                    {#each backgroundTypeOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>

                <div class="field background-value-field">
                  <span>背景值</span>
                  {#if form.backgrounds.light.type === 'color'}
                    <ColorAlphaInput
                      bind:value={form.backgrounds.light.value}
                      on:change={markCustomGradientPreset}
                      placeholder="#f8fafc"
                      inputLabel="浅色背景颜色值"
                      swatchTitle="选择浅色背景颜色"
                      alphaText="浅色背景透明度"
                    />
                  {:else if form.backgrounds.light.type === 'gradient'}
                    <GradientBackgroundInput
                      bind:value={form.backgrounds.light.value}
                      on:change={markCustomGradientPreset}
                      defaultStart={defaultLightGradient.start}
                      defaultEnd={defaultLightGradient.end}
                      startLabel="浅色起始颜色"
                      endLabel="浅色结束颜色"
                      manualLabel="浅色完整渐变值"
                      gradientPlaceholder="linear-gradient(135deg, #e0f2fe, #f8fafc)"
                    />
                  {:else}
                    <div class="inline-input">
                      <input
                        bind:value={form.backgrounds.light.value}
                        type="text"
                        on:input={markCustomGradientPreset}
                        placeholder="https://img.example.com/light-bg.png"
                        aria-label="浅色背景图片地址"
                      />
                      {#if uploadHost}
                        <button type="button" class="ghost-button" on:click={openUpload}>打开图床上传 ↗</button>
                      {/if}
                    </div>
                  {/if}
                  {#if form.backgrounds.light.type === 'color'}
                    <small>支持 #hex、rgb() 和 rgba()，也可点击色块选择颜色。</small>
                  {:else if form.backgrounds.light.type === 'gradient'}
                    <small>可用颜色选择器生成两色渐变，也可手动填写完整 CSS 渐变。</small>
                  {:else}
                    {#if uploadHost}
                      <small>填写图片外链 URL，或打开已配置图床上传。</small>
                    {:else}
                      <small>填写图片外链 URL；配置图床地址后可快速打开上传页。</small>
                    {/if}
                  {/if}
                  {#if !lightBackgroundValid}
                    <small class="warn">请填写浅色模式背景值。</small>
                  {/if}
                </div>

                <small class="background-type-hint">{lightBackgroundHint}</small>
              </div>

              <div class="background-range-grid">
                <label class="field">
                  <span>模糊度 <em>{form.backgrounds.light.blur}px</em></span>
                  <input bind:value={form.backgrounds.light.blur} type="range" min="0" max="40" step="1" on:input={markCustomGradientPreset} />
                  <small>对图片/渐变背景应用模糊，0 表示不模糊。</small>
                </label>

                <label class="field">
                  <span>遮罩透明度 <em>{form.backgrounds.light.mask.toFixed(2)}</em></span>
                  <input bind:value={form.backgrounds.light.mask} type="range" min="0" max="1" step="0.05" on:input={markCustomGradientPreset} />
                  <small>叠加在背景上的遮罩，数值越大背景越淡。</small>
                </label>
              </div>

              <div class="field">
                <span>遮罩颜色</span>
                <ColorAlphaInput
                  bind:value={form.backgrounds.light.maskColor}
                  bind:alpha={form.backgrounds.light.mask}
                  on:change={markCustomGradientPreset}
                  placeholder="#ffffff"
                  inputLabel="浅色遮罩颜色值"
                  swatchTitle="选择浅色遮罩颜色"
                  alphaText="浅色遮罩透明度"
                />
                <small>浅色模式常用白色或浅灰遮罩。</small>
              </div>
            </div>
          </section>

          <section class="theme-background-card">
            <div class="theme-background-header">
              <strong>深色模式背景</strong>
              <span>Dark</span>
            </div>
            <div class="background-form">
              <div class="background-main-row">
                <label class="field background-type-field">
                  <span>背景类型</span>
                  <select
                    value={form.backgrounds.dark.type}
                    on:change={handleDarkBackgroundTypeChange}
                  >
                    {#each backgroundTypeOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>

                <div class="field background-value-field">
                  <span>背景值</span>
                  {#if form.backgrounds.dark.type === 'color'}
                    <ColorAlphaInput
                      bind:value={form.backgrounds.dark.value}
                      on:change={markCustomGradientPreset}
                      placeholder="#0f172a"
                      inputLabel="深色背景颜色值"
                      swatchTitle="选择深色背景颜色"
                      alphaText="深色背景透明度"
                    />
                  {:else if form.backgrounds.dark.type === 'gradient'}
                    <GradientBackgroundInput
                      bind:value={form.backgrounds.dark.value}
                      on:change={markCustomGradientPreset}
                      defaultStart={defaultDarkGradient.start}
                      defaultEnd={defaultDarkGradient.end}
                      startLabel="深色起始颜色"
                      endLabel="深色结束颜色"
                      manualLabel="深色完整渐变值"
                      gradientPlaceholder="linear-gradient(135deg, #1e3a8a, #0f172a)"
                    />
                  {:else}
                    <div class="inline-input">
                      <input
                        bind:value={form.backgrounds.dark.value}
                        type="text"
                        on:input={markCustomGradientPreset}
                        placeholder="https://img.example.com/dark-bg.png"
                        aria-label="深色背景图片地址"
                      />
                      {#if uploadHost}
                        <button type="button" class="ghost-button" on:click={openUpload}>打开图床上传 ↗</button>
                      {/if}
                    </div>
                  {/if}
                  {#if form.backgrounds.dark.type === 'color'}
                    <small>支持 #hex、rgb() 和 rgba()，也可点击色块选择颜色。</small>
                  {:else if form.backgrounds.dark.type === 'gradient'}
                    <small>可用颜色选择器生成两色渐变，也可手动填写完整 CSS 渐变。</small>
                  {:else}
                    {#if uploadHost}
                      <small>填写图片外链 URL，或打开已配置图床上传。</small>
                    {:else}
                      <small>填写图片外链 URL；配置图床地址后可快速打开上传页。</small>
                    {/if}
                  {/if}
                  {#if !darkBackgroundValid}
                    <small class="warn">请填写深色模式背景值。</small>
                  {/if}
                </div>

                <small class="background-type-hint">{darkBackgroundHint}</small>
              </div>

              <div class="background-range-grid">
                <label class="field">
                  <span>模糊度 <em>{form.backgrounds.dark.blur}px</em></span>
                  <input bind:value={form.backgrounds.dark.blur} type="range" min="0" max="40" step="1" on:input={markCustomGradientPreset} />
                  <small>对图片/渐变背景应用模糊，0 表示不模糊。</small>
                </label>

                <label class="field">
                  <span>遮罩透明度 <em>{form.backgrounds.dark.mask.toFixed(2)}</em></span>
                  <input bind:value={form.backgrounds.dark.mask} type="range" min="0" max="1" step="0.05" on:input={markCustomGradientPreset} />
                  <small>叠加在背景上的遮罩，数值越大背景越淡。</small>
                </label>
              </div>

              <div class="field">
                <span>遮罩颜色</span>
                <ColorAlphaInput
                  bind:value={form.backgrounds.dark.maskColor}
                  bind:alpha={form.backgrounds.dark.mask}
                  on:change={markCustomGradientPreset}
                  placeholder="#000000"
                  inputLabel="深色遮罩颜色值"
                  swatchTitle="选择深色遮罩颜色"
                  alphaText="深色遮罩透明度"
                />
                <small>深色模式常用黑色或深蓝遮罩。</small>
              </div>
            </div>
          </section>
        </div>
      </fieldset>

      <!-- 卡片及图标 -->
      <fieldset class="group group-wide group-card" disabled={saving}>
        <legend>卡片及图标</legend>

        <div class="settings-subsection">
          <h3>展示密度</h3>
          <div class="settings-grid card-size-grid">
            <label class="field field-number">
              <span>最小宽度 (px)</span>
              <input bind:value={form.card_size.width} type="number" min="80" max="400" step="10" />
              <small>建议 180-280。</small>
            </label>
            <label class="field field-number">
              <span>最小高度 (px)</span>
              <input bind:value={form.card_size.height} type="number" min="0" max="300" step="10" />
              <small>0 表示自动高度。</small>
            </label>
            <label class="field field-number">
              <span>图标大小 (px)</span>
              <input bind:value={form.card_icon_size} type="number" min="40" max="100" step="5" />
              <small>推荐 70。</small>
            </label>
          </div>
        </div>

        <div class="settings-subsection">
          <h3>内容区域</h3>
          <div class="settings-grid content-layout-grid">
            <label class="field field-size">
              <span>最大宽度</span>
              <div class="inline-input">
                <input bind:value={form.content_layout.max_width} type="number" min="40" max="2400" step="10" />
                <select bind:value={form.content_layout.max_width_unit} class="unit-select" aria-label="最大宽度单位">
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
              <small>首页内容区最大宽度。</small>
            </label>

            <label class="field field-range">
              <span>左右边距 <em>{form.content_layout.margin_x}px</em></span>
              <input bind:value={form.content_layout.margin_x} type="range" min="0" max="100" step="1" />
            </label>

            <label class="field field-range">
              <span>顶部边距 <em>{form.content_layout.margin_top}%</em></span>
              <input bind:value={form.content_layout.margin_top} type="range" min="0" max="50" step="1" />
            </label>

            <label class="field field-range">
              <span>底部边距 <em>{form.content_layout.margin_bottom}%</em></span>
              <input bind:value={form.content_layout.margin_bottom} type="range" min="0" max="50" step="1" />
            </label>
          </div>
        </div>

        <div class="settings-subsection">
          <h3>卡片外观</h3>
          <div class="settings-grid card-appearance-grid">
            <div class="field field-color">
              <span>卡片颜色</span>
              <ColorAlphaInput
                bind:value={form.card_background_color}
                bind:alpha={form.card_background_opacity}
                placeholder="#ffffff"
                inputLabel="卡片颜色值"
                swatchTitle="选择卡片颜色"
                alphaText="卡片透明度"
              />
              <small>书签卡片背景色。</small>
            </div>

            <label class="field field-range">
              <span>卡片透明度 <em>{form.card_background_opacity.toFixed(2)}</em></span>
              <input bind:value={form.card_background_opacity} type="range" min="0" max="1" step="0.05" />
            </label>

            <div class="field field-color">
              <span>卡片文字颜色</span>
              <ColorAlphaInput
                bind:value={form.card_text_color}
                placeholder="留空则跟随主题"
                inputLabel="卡片文字颜色值"
                swatchTitle="选择卡片文字颜色"
                alphaText="文字透明度"
              />
              <small>留空时自动跟随当前主题。</small>
            </div>
          </div>
        </div>

        <div class="settings-subsection">
          <h3>卡片风格</h3>
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

          {#if form.card_style === 'info'}
            <label class="checkbox-field style-option">
              <input type="checkbox" bind:checked={form.card_show_description} />
              <span>显示书签描述</span>
            </label>
          {/if}

          {#if form.card_style === 'icon'}
            <label class="checkbox-field style-option">
              <input type="checkbox" bind:checked={form.card_icon_show_title} />
              <span>显示书签标题</span>
            </label>
          {/if}
        </div>
      </fieldset>

      <!-- 搜索引擎 -->
      <fieldset class="group group-wide group-search" disabled={saving}>
        <legend>搜索引擎</legend>

        <div class="settings-grid search-controls-grid">
          <label class="field field-select">
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

          <label class="toggle-field">
            <div class="toggle-copy">
              <span>显示搜索框</span>
              <p>控制首页标题下方的搜索区域是否展示。</p>
            </div>
            <input bind:checked={form.search_box_show} type="checkbox" />
          </label>

          <label class="toggle-field">
            <div class="toggle-copy">
              <span>显示引擎选择器</span>
              <p>关闭后首页搜索框只使用默认搜索引擎。</p>
            </div>
            <input bind:checked={form.search_engine_selector_show} type="checkbox" />
          </label>
        </div>

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
      <fieldset class="group group-wide" disabled={saving}>
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
        <button type="submit" class="floating-save-btn" disabled={!canSave}>
          {#if saving}
            保存中...
          {:else}
            保存设置
          {/if}
        </button>
      </div>
    </form>
  {/if}
</section>

<style>
  .settings-panel {
    display: grid;
    gap: 0;
    position: relative;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 22px;
    background:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.92)),
      #f8fafc;
    box-shadow:
      0 24px 54px rgba(30, 41, 59, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
    overflow: visible;
  }

  .panel-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 1px solid rgba(203, 213, 225, 0.78);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(16px);
    padding: 22px 24px 18px;
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
    font-size: 24px;
    line-height: 1.2;
    color: #0f172a;
    text-wrap: balance;
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
    margin-top: 8px;
    max-width: 64ch;
    text-wrap: pretty;
  }

  small.warn {
    color: #b45309;
  }

  .error-banner,
  .status-card {
    border-radius: 18px;
    padding: 16px;
  }

  .toggle-field {
    border-radius: 14px;
    padding: 14px;
  }

  .error-banner {
    margin: 20px 24px 0;
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
    margin: 20px 24px 24px;
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
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
    padding: 20px 24px 24px;
  }

  .group {
    grid-column: span 6;
    align-content: start;
    border: 1px solid rgba(203, 213, 225, 0.82);
    border-radius: 16px;
    padding: 18px;
    display: grid;
    gap: 16px;
    margin: 0;
    min-width: 0;
    background: rgba(255, 255, 255, 0.9);
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
  }

  .group-wide {
    grid-column: 1 / -1;
  }

  .group-background,
  .group-card,
  .group-search {
    background: rgba(255, 255, 255, 0.95);
  }

  .group legend {
    padding: 0 6px;
    margin-left: -6px;
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 16px 18px;
  }

  .settings-grid,
  .base-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 14px 16px;
    align-items: start;
  }

  .settings-subsection {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .settings-subsection + .settings-subsection {
    border-top: 1px solid rgba(226, 232, 240, 0.92);
    padding-top: 16px;
  }

  .settings-subsection h3 {
    margin: 0;
    color: #1e293b;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
  }

  .field-title {
    grid-column: span 5;
  }

  .field-url {
    grid-column: span 4;
  }

  .field-color {
    grid-column: span 4;
  }

  .field-range {
    grid-column: span 3;
  }

  .field-select,
  .field-number,
  .field-size {
    grid-column: span 3;
  }

  .field-toggle {
    grid-column: span 4;
  }

  .card-size-grid .field-number {
    grid-column: span 3;
  }

  .content-layout-grid .field-size {
    grid-column: span 4;
  }

  .content-layout-grid .field-range {
    grid-column: span 2;
  }

  .card-appearance-grid .field-color {
    grid-column: span 4;
  }

  .card-appearance-grid .field-range {
    grid-column: span 3;
  }

  .search-controls-grid .field-select {
    grid-column: span 3;
  }

  .search-controls-grid .toggle-field {
    grid-column: span 4;
  }

  .gradient-preset-panel {
    display: grid;
    gap: 12px;
    min-width: 0;
    border: 1px solid rgba(191, 219, 254, 0.86);
    border-radius: 16px;
    padding: 14px;
    background:
      radial-gradient(circle at 18% 0%, rgba(219, 234, 254, 0.62), transparent 32%),
      linear-gradient(135deg, rgba(248, 250, 252, 0.96), rgba(240, 253, 250, 0.7)),
      #ffffff;
  }

  .gradient-preset-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .gradient-preset-header strong {
    display: block;
    color: #0f172a;
    font-size: 14px;
  }

  .gradient-preset-header p {
    margin-top: 6px;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
  }

  .gradient-preset-header > span {
    flex: 0 0 auto;
    border-radius: 999px;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 9px;
  }

  .gradient-preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 10px;
  }

  .gradient-preset-option {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    min-width: 0;
    min-height: 84px;
    border: 1px solid rgba(203, 213, 225, 0.9);
    border-radius: 12px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease,
      background 0.18s ease;
  }

  .gradient-preset-option:hover {
    border-color: rgba(37, 99, 235, 0.42);
    box-shadow: 0 12px 26px rgba(30, 64, 175, 0.1);
    transform: translateY(-1px);
  }

  .gradient-preset-option.active {
    border-color: rgba(37, 99, 235, 0.72);
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.1),
      0 14px 28px rgba(15, 23, 42, 0.1);
  }

  .gradient-preset-option.active::after {
    content: '';
    position: absolute;
    top: 9px;
    right: 9px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #2563eb;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
  }

  .gradient-preset-option:focus-within {
    border-color: rgba(37, 99, 235, 0.72);
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.13),
      0 10px 22px rgba(15, 23, 42, 0.08);
  }

  .gradient-preset-option:active {
    transform: translateY(0);
  }

  .gradient-preset-option input[type='radio'] {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .preset-preview {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    height: 28px;
  }

  .preset-swatch,
  .custom-preview span {
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 10px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  }

  .preset-swatch.light {
    background: var(--preset-light-bg);
  }

  .preset-swatch.dark {
    background: var(--preset-dark-bg);
  }

  .custom-preview span:first-child {
    background:
      linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
      linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
    background-color: #ffffff;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px;
  }

  .custom-preview span:last-child {
    background:
      linear-gradient(45deg, rgba(148, 163, 184, 0.22) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(148, 163, 184, 0.22) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.22) 75%),
      linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.22) 75%);
    background-color: #0f172a;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
    background-size: 12px 12px;
  }

  .preset-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .preset-copy strong {
    color: #0f172a;
    font-size: 13px;
    line-height: 1.25;
  }

  .preset-copy small {
    color: #64748b;
    font-size: 12px;
    line-height: 1.35;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .theme-background-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
  }

  .theme-background-card {
    display: grid;
    gap: 14px;
    min-width: 0;
    border: 1px solid rgba(226, 232, 240, 0.94);
    border-radius: 14px;
    padding: 16px;
    background:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.96)),
      #ffffff;
  }

  .theme-background-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .theme-background-header strong {
    color: #0f172a;
    font-size: 14px;
  }

  .theme-background-header span {
    border-radius: 999px;
    background: #e0f2fe;
    color: #0369a1;
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
  }

  .background-form {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .background-main-row {
    display: grid;
    grid-template-columns: 128px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .background-range-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(140px, 1fr));
    gap: 14px;
  }

  .background-type-field,
  .background-value-field {
    min-width: 0;
    align-content: start;
  }

  .background-type-field {
    width: 128px;
  }

  .background-type-field select {
    width: 128px;
    min-width: 128px;
  }

  .background-type-hint {
    grid-column: 1 / -1;
    display: block;
    min-width: 0;
  }

  .background-value-field .inline-input {
    min-width: 0;
  }

  .background-value-field .ghost-button {
    flex: 0 0 auto;
    padding-inline: 12px;
  }

  .field,
  .toggle-field,
  .engine-cell {
    display: grid;
    gap: 8px;
  }

  .field.full-width {
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
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
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
    min-width: 0;
  }

  .inline-input input {
    flex: 1 1 0;
    min-width: 0;
  }

  .toggle-field {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border: 1px solid rgba(226, 232, 240, 0.95);
    background: rgba(248, 250, 252, 0.78);
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      transform 0.18s ease;
  }

  .toggle-field:hover {
    border-color: rgba(37, 99, 235, 0.28);
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
    gap: 10px;
  }

  .engine-row {
    display: grid;
    grid-template-columns: minmax(140px, 0.75fr) minmax(160px, 0.9fr) minmax(240px, 1.5fr) auto;
    gap: 12px;
    align-items: end;
    border: 1px solid rgba(226, 232, 240, 0.94);
    border-radius: 12px;
    padding: 12px;
    background: rgba(248, 250, 252, 0.78);
  }

  .engine-cell.grow {
    min-width: 0;
  }

  .add-engine {
    justify-self: start;
  }

  .form-footer {
    grid-column: 1 / -1;
    position: sticky;
    bottom: 14px;
    z-index: 24;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 2px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    box-shadow:
      0 18px 38px rgba(15, 23, 42, 0.16),
      0 1px 0 rgba(255, 255, 255, 0.76) inset;
    padding: 12px 12px 12px 16px;
  }

  .helper-text {
    font-size: 13px;
    min-width: 0;
  }

  .floating-save-btn {
    flex: 0 0 auto;
    border: none;
    background: #2563eb;
    color: #ffffff;
    border-radius: 12px;
    min-height: 42px;
    padding: 0 22px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.28);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      opacity 0.15s ease,
      background 0.15s ease;
    white-space: nowrap;
  }

  .floating-save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    background: #1d4ed8;
    box-shadow: 0 14px 30px rgba(37, 99, 235, 0.34);
  }

  .floating-save-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .floating-save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .ghost-button,
  .danger-button {
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;
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

  .ghost-button:hover:not(:disabled) {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .danger-button:hover:not(:disabled) {
    border-color: #fca5a5;
    background: #fee2e2;
  }

  .ghost-button:active:not(:disabled),
  .danger-button:active:not(:disabled) {
    transform: translateY(1px);
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

  @media (max-width: 960px) {
    .settings-form {
      padding: 18px;
    }

    .group {
      grid-column: 1 / -1;
    }

    .settings-grid,
    .base-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .field-title,
    .field-url,
    .field-color,
    .field-range,
    .field-select,
    .field-number,
    .field-size,
    .field-toggle,
    .card-size-grid .field-number,
    .content-layout-grid .field-size,
    .content-layout-grid .field-range,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range,
    .search-controls-grid .field-select,
    .search-controls-grid .toggle-field {
      grid-column: span 3;
    }

    .engine-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .engine-cell.grow,
    .engine-row .danger-button {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 720px) {
    .settings-panel {
      border-radius: 18px;
    }

    .panel-header {
      padding: 18px;
    }

    .settings-form {
      padding: 16px;
    }

    .form-grid,
    .settings-grid,
    .base-grid {
      grid-template-columns: 1fr;
    }

    .field-title,
    .field-url,
    .field-color,
    .field-range,
    .field-select,
    .field-number,
    .field-size,
    .field-toggle,
    .card-size-grid .field-number,
    .content-layout-grid .field-size,
    .content-layout-grid .field-range,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range,
    .search-controls-grid .field-select,
    .search-controls-grid .toggle-field {
      grid-column: 1 / -1;
    }

    .theme-background-grid {
      grid-template-columns: 1fr;
    }

    .gradient-preset-header {
      flex-direction: column;
    }

    .gradient-preset-grid {
      grid-template-columns: 1fr;
    }

    .background-main-row,
    .background-range-grid {
      grid-template-columns: 1fr;
    }

    .background-type-field,
    .background-type-field select {
      width: 100%;
      min-width: 0;
    }

    .background-value-field .inline-input {
      align-items: stretch;
      flex-direction: column;
    }

    .background-value-field .ghost-button {
      width: 100%;
    }

    .engine-row {
      grid-template-columns: 1fr;
    }

    .toggle-field {
      align-items: flex-start;
    }

    .form-footer {
      bottom: 10px;
      align-items: stretch;
      flex-direction: column;
      padding: 12px;
    }

    .helper-text {
      line-height: 1.45;
    }

    .floating-save-btn {
      width: 100%;
      min-height: 40px;
      padding: 0 18px;
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
