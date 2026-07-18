<script lang="ts">
  import type { PublicBookmark } from '../../../shared/types'
  import { buildHomeBackground } from '../../lib/appData'
  import type { SettingsFormModel } from '../../lib/settingsForm'
  import BookmarkCard from '../BookmarkCard.svelte'
  import HomeHeroSearch from '../HomeHeroSearch.svelte'

  export let settings: SettingsFormModel
  export let theme: 'light' | 'dark' = 'light'

  const previewSections = [
    { id: 'preview-tools', title: '常用工具', count: 2 },
    { id: 'preview-reading', title: '稍后阅读', count: 1 },
  ]

  const previewBookmarks: PublicBookmark[] = [
    {
      id: -101,
      category_id: -1,
      title: '设计资料',
      url: 'https://example.test/design',
      icon: 'D',
      icon_source: null,
      icon_background_color: null,
      icon_blob: null,
      icon_cached: false,
      description: '组件规范、配色与交互参考',
      description_mode: null,
      open_method: 1,
      sort: 1,
    },
    {
      id: -102,
      category_id: -1,
      title: '开发文档',
      url: 'https://example.test/docs',
      icon: 'C',
      icon_source: null,
      icon_background_color: null,
      icon_blob: null,
      icon_cached: false,
      description: '接口说明与项目开发记录',
      description_mode: null,
      open_method: 1,
      sort: 2,
    },
  ]

  let previewQuery = ''

  $: previewSettings = {
    ...settings,
    search_engine: {
      ...settings.search_engine,
      engines: settings.search_engine.engines.map((engine) => ({ ...engine, icon: '' })),
    },
  }
  $: pageTitle = previewSettings.site_title || '导航首页'
  $: contentMaxWidth = `${previewSettings.content_layout.max_width}${previewSettings.content_layout.max_width_unit}`
  $: previewStyle = [
    buildHomeBackground(previewSettings, theme),
    `--content-max-width: ${contentMaxWidth}`,
    `--content-margin-x: ${previewSettings.content_layout.margin_x}px`,
    `--content-margin-top: ${previewSettings.content_layout.margin_top}%`,
    `--content-margin-bottom: ${previewSettings.content_layout.margin_bottom}%`,
    previewSettings.card_text_color ? `--card-text-color: ${previewSettings.card_text_color}` : '',
    `--preview-card-width: ${previewSettings.card_size.width}px`,
  ].filter(Boolean).join('; ')
  $: descriptionMode = previewSettings.card_description_mode
  $: showDescription = descriptionMode !== 'hidden'
</script>

<aside class="home-preview" aria-label="首页实时预览" data-testid="settings-home-preview">
  <header class="preview-toolbar">
    <div>
      <strong>首页预览</strong>
      <span>未保存状态</span>
    </div>
    <div class="preview-theme-switch" role="group" aria-label="预览主题">
      <button
        type="button"
        class:active={theme === 'light'}
        aria-pressed={theme === 'light'}
        data-testid="preview-theme-light"
        on:click={() => theme = 'light'}
      >浅色</button>
      <button
        type="button"
        class:active={theme === 'dark'}
        aria-pressed={theme === 'dark'}
        data-testid="preview-theme-dark"
        on:click={() => theme = 'dark'}
      >深色</button>
    </div>
  </header>

  <div class="preview-frame">
    <div
      class="preview-stage"
      class:top-navigation={previewSettings.navigation.position === 'top'}
      data-theme={theme}
      data-background-preset={previewSettings.background_preset_id}
      data-testid="home-preview-stage"
      style={previewStyle}
      inert
    >
      <div class="preview-background" aria-hidden="true"></div>
      <div class="preview-mask" aria-hidden="true"></div>

      {#if previewSettings.navigation.position === 'top'}
        <nav class="preview-nav preview-nav-top" aria-label="预览分类导航" data-testid="preview-top-navigation">
          {#each previewSections as section, index (section.id)}
            <button type="button" class:active={index === 0} tabindex="-1">
              <span>{section.title}</span><small>{section.count}</small>
            </button>
          {/each}
        </nav>
      {:else}
        <nav
          class="preview-nav preview-nav-left"
          class:expanded={previewSettings.navigation.always_expanded}
          aria-label="预览分类导航"
          data-testid="preview-left-navigation"
        >
          {#each previewSections as section, index (section.id)}
            <button type="button" class:active={index === 0} tabindex="-1" aria-label={section.title}>
              <span class="nav-mark" aria-hidden="true"></span>
              <span class="nav-label">{section.title}</span>
            </button>
          {/each}
        </nav>
      {/if}

      <div class="preview-page">
        <HomeHeroSearch
          {pageTitle}
          siteTitleColor={previewSettings.site_title_color?.trim() || 'inherit'}
          siteTitleFontSize={previewSettings.site_title_font_size}
          settings={previewSettings}
          topNavigation={previewSettings.navigation.position === 'top'}
          bind:query={previewQuery}
          preview
          themeOverride={theme}
        />

        <main class="preview-content">
          <section class="preview-category" aria-label="常用工具示例分类">
            <header>
              <div>
                <span class="category-mark" aria-hidden="true">常</span>
                <div>
                  <h3>常用工具</h3>
                  <p>共 2 个站点</p>
                </div>
              </div>
            </header>

            <div class="preview-bookmarks" class:is-icon={previewSettings.card_style === 'icon'}>
              {#each previewBookmarks as bookmark (bookmark.id)}
                <div class="preview-bookmark">
                  <BookmarkCard
                    {bookmark}
                    style={previewSettings.card_style}
                    iconSize={previewSettings.card_icon_size}
                    {showDescription}
                    {descriptionMode}
                    showIconTitle={previewSettings.card_icon_show_title}
                    width={previewSettings.card_size.width}
                    height={previewSettings.card_size.height}
                    preview
                    themeOverride={theme}
                  />
                </div>
              {/each}
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</aside>

<style>
  .home-preview {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .preview-toolbar {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .preview-toolbar > div:first-child {
    display: grid;
    gap: 2px;
  }

  .preview-toolbar strong {
    color: var(--sp-strong);
    font-size: 13px;
  }

  .preview-toolbar span {
    color: var(--sp-muted);
    font-size: 11px;
  }

  .preview-theme-switch {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 116px;
    border: 1px solid var(--sp-input-border);
    border-radius: 9px;
    padding: 3px;
    background: var(--sp-input-bg);
  }

  .preview-theme-switch button {
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--sp-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 160ms ease, color 160ms ease;
  }

  .preview-theme-switch button.active {
    background: var(--sp-chip-bg);
    color: var(--sp-chip-text);
    font-weight: 650;
  }

  .preview-theme-switch button:focus-visible {
    outline: 2px solid var(--sp-accent);
    outline-offset: 2px;
  }

  .preview-frame {
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--sp-group-border);
    border-radius: 12px;
    background: var(--sp-group-bg-strong);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.1);
  }

  .preview-stage {
    position: relative;
    isolation: isolate;
    height: 100%;
    min-height: 520px;
    overflow: auto;
    color: #0f172a;
    background: transparent;
    scrollbar-width: thin;
  }

  .preview-stage[data-theme='dark'] {
    color: #e5eefb;
  }

  .preview-background,
  .preview-mask {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .preview-background {
    z-index: -2;
    background: var(--home-background, transparent);
    filter: var(--home-background-filter, none);
    transform: var(--home-background-transform, none);
    transform-origin: center;
  }

  .preview-mask {
    z-index: -1;
    background: var(--home-background-mask-color, #000000);
    opacity: var(--home-background-mask, 0.3);
  }

  .preview-page {
    position: relative;
    min-height: 100%;
    box-sizing: border-box;
    padding: 1px var(--content-margin-x, 0px) var(--content-margin-bottom, 0%);
  }

  .preview-content {
    width: min(100%, var(--content-max-width, 1200px));
    margin: 0 auto;
    padding: 0 18px 28px;
    box-sizing: border-box;
  }

  .preview-category {
    display: grid;
    gap: 12px;
  }

  .preview-category header > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .category-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid color-mix(in srgb, var(--theme-accent-color, #2563eb) 22%, transparent);
    border-radius: 9px;
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.9));
    color: var(--card-title-color, currentColor);
    font-size: 13px;
    font-weight: 700;
  }

  .preview-category h3,
  .preview-category p {
    margin: 0;
  }

  .preview-category h3 {
    color: var(--card-title-color, currentColor);
    font-size: 15px;
    line-height: 1.25;
  }

  .preview-category p {
    margin-top: 2px;
    color: var(--card-description-color, currentColor);
    font-size: 11px;
    opacity: 0.76;
  }

  .preview-bookmarks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--preview-card-width)), 1fr));
    gap: 10px;
    min-width: 0;
  }

  .preview-bookmarks.is-icon {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .preview-bookmark {
    min-width: 0;
  }

  .preview-nav {
    position: absolute;
    z-index: 4;
    color: var(--card-title-color, currentColor);
    background: rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.9));
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(12px);
  }

  .preview-nav button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
  }

  .preview-nav-top {
    top: 12px;
    left: 50%;
    width: min(88%, 360px);
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--theme-accent-color, #2563eb) 20%, transparent);
    border-radius: 10px;
    padding: 4px;
    transform: translateX(-50%);
  }

  .preview-nav-top button {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 7px;
    padding: 7px 8px;
    font-size: 11px;
    white-space: nowrap;
  }

  .preview-nav-top button.active {
    background: color-mix(in srgb, var(--theme-accent-color, #2563eb) 14%, transparent);
  }

  .preview-nav-top small {
    opacity: 0.66;
  }

  .preview-nav-left {
    top: 112px;
    left: 10px;
    width: 32px;
    display: grid;
    gap: 4px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--theme-accent-color, #2563eb) 20%, transparent);
    border-radius: 10px;
    padding: 5px;
    transition: width 180ms ease;
  }

  .preview-nav-left.expanded {
    width: 112px;
  }

  .preview-nav-left button {
    min-width: 0;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    border-radius: 7px;
    padding: 6px;
    text-align: left;
  }

  .preview-nav-left button.active {
    background: color-mix(in srgb, var(--theme-accent-color, #2563eb) 14%, transparent);
  }

  .nav-mark {
    width: 6px;
    height: 6px;
    justify-self: center;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.72;
  }

  .nav-label {
    min-width: 0;
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-nav-left:not(.expanded) .nav-label {
    visibility: hidden;
  }

  @media (max-width: 1280px) {
    .home-preview {
      height: auto;
    }

    .preview-stage {
      height: 560px;
      min-height: 0;
    }
  }

  @media (max-width: 620px) {
    .preview-toolbar {
      align-items: flex-start;
    }

    .preview-stage {
      height: 500px;
    }

    .preview-content {
      padding-inline: 14px;
    }
  }
</style>
