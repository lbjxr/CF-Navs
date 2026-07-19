<script lang="ts">
  import type { ChangePasswordReq } from '../../shared/types'
  import {
    cloneSettingsForm,
    createSettingsFormState,
    emptySettingsForm,
    normalizeSettingsForm,
    shouldAutoExpandAppearanceAdvanced,
    type SettingsFormModel,
  } from '../lib/settingsForm'
  import './settings/settingsSections.css'
  import AdvancedSettingsSection from './settings/AdvancedSettingsSection.svelte'
  import BackgroundSettingsSection from './settings/BackgroundSettingsSection.svelte'
  import BasicSettingsSection from './settings/BasicSettingsSection.svelte'
  import CardSettingsSection from './settings/CardSettingsSection.svelte'
  import FooterSettingsSection from './settings/FooterSettingsSection.svelte'
  import HeroSettingsSection from './settings/HeroSettingsSection.svelte'
  import NavigationSettingsSection from './settings/NavigationSettingsSection.svelte'
  import SearchEngineSettingsSection from './settings/SearchEngineSettingsSection.svelte'
  import SettingsHomePreview from './settings/SettingsHomePreview.svelte'
  import PasswordChangePanel from './PasswordChangePanel.svelte'

  type SettingsPanelValue = SettingsFormModel
  type AsyncVoid<T = void> = T | Promise<T>

  export let value: Partial<SettingsPanelValue> | null = null
  export let loading = false
  export let saving = false
  export let error = ''
  export let onSubmit: ((payload: SettingsPanelValue) => AsyncVoid) | undefined = undefined
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined

  const settingsSections = [
    { id: 'basic', label: '站点信息', hint: '标题、访问范围与默认主题' },
    { id: 'appearance', label: '外观与卡片', hint: '配色、背景与书签卡片' },
    { id: 'layout', label: '布局与导航', hint: '内容宽度、边距与导航位置' },
    { id: 'search', label: '搜索设置', hint: '显示范围与搜索引擎' },
    { id: 'footer', label: '页脚内容', hint: '首页底部自定义内容' },
    { id: 'account', label: '账号安全', hint: '修改管理员密码' },
  ]

  let form: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let initialForm: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let formKey = ''
  let activeSectionId = 'basic'
  let appearanceAdvancedOpen = false
  let previewTheme: 'light' | 'dark' = 'light'

  $: nextKey = JSON.stringify({ value, loading })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    initialForm = createSettingsFormState(value)
    form = cloneSettingsForm(initialForm)
    appearanceAdvancedOpen = shouldAutoExpandAppearanceAdvanced(initialForm)
  }

  $: normalizedForm = normalizeSettingsForm(form)
  $: normalizedInitialForm = normalizeSettingsForm(initialForm)
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
  async function handleSubmit() {
    if (!canSave) {
      return
    }

    await onSubmit?.(normalizedForm)
  }

  function handleAppearanceAdvancedChange(open: boolean): void {
    appearanceAdvancedOpen = open
  }

</script>

<section class="settings-panel" aria-busy={loading || saving}>
  <div class="panel-header">
    <div class="panel-header-copy">
      <p class="panel-eyebrow">设置</p>
      <h2>站点设置</h2>
      <p class="panel-desc">按功能区管理站点信息、外观与访问方式。右侧预览直接使用当前未保存内容，保存后才会更新公开首页。</p>
    </div>
    <div class="header-actions">
      <p class="helper-text">
        {#if saving}正在保存...{:else if !hasTitle}请填写站点标题{:else if !backgroundValid}请完善背景{:else if !enginesValid}请完善搜索引擎{:else if !contentLayoutValid}请完善布局{:else if isDirty}有未保存更改{:else}配置已同步{/if}
      </p>
      <button type="submit" class="floating-save-btn" form="settings-form" disabled={!canSave}>{#if saving}保存中{:else}保存设置{/if}</button>
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
    <form id="settings-form" class="settings-form" on:submit|preventDefault={handleSubmit}>
      <aside class="settings-submenu" aria-label="设置功能区">
        {#each settingsSections as section (section.id)}
          <button type="button" class:active={activeSectionId === section.id} on:click={() => activeSectionId = section.id}>
            <strong>{section.label}</strong><span>{section.hint}</span>
          </button>
        {/each}
      </aside>

      <div class="settings-workspace">
        <div class="settings-section-content">
          {#if activeSectionId === 'basic'}
            <BasicSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'appearance'}
            <BackgroundSettingsSection
              bind:form
              {saving}
              onAdvancedChange={handleAppearanceAdvancedChange}
            />
            <CardSettingsSection bind:form {saving} />
            <AdvancedSettingsSection
              bind:form
              {saving}
              advancedOpen={appearanceAdvancedOpen}
              onAdvancedChange={handleAppearanceAdvancedChange}
            />
          {:else if activeSectionId === 'layout'}
            <NavigationSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'search'}
            <HeroSettingsSection bind:form {saving} />
          {/if}

          {#if activeSectionId === 'search'}
            <SearchEngineSettingsSection bind:form {saving} {enginesValid} />
          {:else if activeSectionId === 'footer'}
            <FooterSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'account'}
            <PasswordChangePanel {saving} {onChangePassword} />
          {/if}
        </div>

        <div class="settings-preview-column">
          <SettingsHomePreview settings={normalizedForm} bind:theme={previewTheme} />
        </div>
      </div>

    </form>
  {/if}
</section>

<style>
  .settings-panel {
    --sp-text: var(--admin-text, #0f172a);
    --sp-heading: var(--admin-text, #0f172a);
    --sp-strong: var(--admin-text, #1e293b);
    --sp-label: var(--admin-muted, #334155);
    --sp-muted: var(--admin-subtle, #64748b);
    --sp-accent: var(--admin-accent, #2563eb);
    --sp-accent-strong: var(--admin-accent-strong, #1d4ed8);
    --sp-border: #e2e8f0;
    --sp-panel-bg: #ffffff;
    --sp-panel-shadow:
      0 18px 44px rgba(15, 23, 42, 0.08);
    --sp-header-bg: #ffffff;
    --sp-header-border: #e2e8f0;
    --sp-group-bg: #ffffff;
    --sp-group-bg-strong: #f8fafc;
    --sp-group-border: #e2e8f0;
    --sp-subsection-border: #e2e8f0;
    --sp-input-bg: #ffffff;
    --sp-input-border: #cbd5e1;
    --sp-input-hover-border: #94a3b8;
    --sp-input-text: #0f172a;
    --sp-toggle-bg: #f8fafc;
    --sp-toggle-border: #e2e8f0;
    --sp-toggle-hover-bg: #f1f5f9;
    --sp-footer-bg: #ffffff;
    --sp-footer-border: #e2e8f0;
    --sp-danger: #dc2626;
    --sp-danger-bg: #fef2f2;
    --sp-danger-border: #fecaca;
    --sp-danger-hover-bg: #fee2e2;
    --sp-danger-hover-border: #fca5a5;
    --sp-error-text: #991b1b;
    --sp-warn: #b45309;
    --sp-status-bg: #f8fbff;
    --sp-status-border: #dbeafe;
    --sp-chip-bg: #eff6ff;
    --sp-chip-text: #1d4ed8;
    --sp-chip-sky-bg: #f1f5f9;
    --sp-chip-sky-text: #475569;
    --sp-gradient-panel-bg: #f8fafc;
    --sp-gradient-panel-border: #e2e8f0;
    --sp-option-bg: #ffffff;
    --sp-option-bg-active: #f8fafc;
    --sp-option-border: #e2e8f0;
    --sp-theme-card-bg: #ffffff;
    --sp-theme-card-border: #e2e8f0;
    --sp-radio-border: #e2e8f0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    position: relative;
    height: calc(100dvh - 190px);
    min-height: 0;
    box-sizing: border-box;
    border: 1px solid var(--sp-border);
    border-radius: 22px;
    background: var(--sp-panel-bg);
    box-shadow: var(--sp-panel-shadow);
    overflow: hidden;
  }

  :global([data-theme='dark']) .settings-panel {
    --sp-text: var(--admin-text, #e5eefb);
    --sp-heading: var(--admin-text, #e5eefb);
    --sp-strong: var(--admin-muted, #cbd5e1);
    --sp-label: var(--admin-muted, #cbd5e1);
    --sp-muted: var(--admin-subtle, #94a3b8);
    --sp-accent: var(--admin-accent, #a9c2a0);
    --sp-accent-strong: var(--admin-accent-strong, #d2e2ca);
    --sp-border: var(--admin-border, rgba(148, 163, 184, 0.22));
    --sp-panel-bg: #0f172a;
    --sp-panel-shadow:
      0 24px 54px rgba(0, 0, 0, 0.32),
      0 1px 0 rgba(255, 255, 255, 0.04) inset;
    --sp-header-bg: #0f172a;
    --sp-header-border: rgba(148, 163, 184, 0.2);
    --sp-group-bg: #111c2f;
    --sp-group-bg-strong: #162238;
    --sp-group-border: rgba(148, 163, 184, 0.2);
    --sp-subsection-border: rgba(148, 163, 184, 0.18);
    --sp-input-bg: #111c2f;
    --sp-input-border: rgba(148, 163, 184, 0.32);
    --sp-input-hover-border: rgba(148, 163, 184, 0.5);
    --sp-input-text: #e5eefb;
    --sp-toggle-bg: #111c2f;
    --sp-toggle-border: rgba(148, 163, 184, 0.2);
    --sp-toggle-hover-bg: #1e293b;
    --sp-footer-bg: #0f172a;
    --sp-footer-border: rgba(148, 163, 184, 0.24);
    --sp-danger: #f87171;
    --sp-danger-bg: rgba(248, 113, 113, 0.12);
    --sp-danger-border: rgba(248, 113, 113, 0.32);
    --sp-danger-hover-bg: rgba(248, 113, 113, 0.2);
    --sp-danger-hover-border: rgba(248, 113, 113, 0.5);
    --sp-error-text: #fca5a5;
    --sp-warn: #fbbf24;
    --sp-status-bg: rgba(125, 211, 252, 0.08);
    --sp-status-border: rgba(125, 211, 252, 0.3);
    --sp-chip-bg: rgba(125, 211, 252, 0.16);
    --sp-chip-text: #bae6fd;
    --sp-chip-sky-bg: rgba(125, 211, 252, 0.16);
    --sp-chip-sky-text: #7dd3fc;
    --sp-gradient-panel-bg: #111c2f;
    --sp-gradient-panel-border: rgba(148, 163, 184, 0.24);
    --sp-option-bg: #111c2f;
    --sp-option-bg-active: #1e293b;
    --sp-option-border: rgba(148, 163, 184, 0.24);
    --sp-theme-card-bg: #111c2f;
    --sp-theme-card-border: rgba(148, 163, 184, 0.2);
    --sp-radio-border: rgba(148, 163, 184, 0.24);
  }

  .panel-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 18px;
    border-bottom: 1px solid var(--sp-header-border);
    background: var(--sp-header-bg);
    backdrop-filter: blur(16px);
    border-radius: 22px 22px 0 0;
    padding: 12px 18px 10px;
  }

  .panel-header-copy {
    min-width: 0;
  }

  .panel-eyebrow {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sp-muted);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(24px, 2.2vw, 32px);
    line-height: 1.08;
    letter-spacing: -0.035em;
    color: var(--sp-heading);
    text-wrap: balance;
  }

  .panel-desc,
  .status-desc,
  .helper-text {
    color: var(--sp-muted);
    line-height: 1.55;
  }

  .panel-desc {
    margin-top: 4px;
    max-width: 54ch;
    font-size: 13px;
    text-wrap: pretty;
  }

  .error-banner,
  .status-card {
    border-radius: 18px;
    padding: 16px;
  }

  .error-banner {
    margin: 20px 24px 0;
    border: 1px solid var(--sp-danger-border);
    background: var(--sp-danger-bg);
    display: grid;
    gap: 6px;
    color: var(--sp-error-text);
  }

  .error-banner strong {
    font-size: 14px;
  }

  .status-card {
    margin: 20px 24px 24px;
    border: 1px solid var(--sp-status-border);
    background: var(--sp-status-bg);
    display: grid;
    gap: 6px;
  }

  .status-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--sp-heading);
  }

  .settings-form {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 18px;
    padding: 22px 24px 28px;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; align-self: center; }

  .settings-submenu {
    grid-column: span 1;
    align-self: start;
    display: grid;
    gap: 6px;
    position: sticky;
    top: 86px;
  }

  .settings-submenu button {
    display: grid;
    gap: 4px;
    border: 1px solid transparent;
    border-radius: 12px;
    padding: 11px 8px;
    text-align: left;
    background: transparent;
    color: var(--sp-muted);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
  }

  .settings-submenu button:hover { background: var(--sp-toggle-bg); color: var(--sp-strong); transform: translateX(2px); }
  .settings-submenu button.active { border-color: var(--sp-toggle-border); background: var(--sp-toggle-bg); color: var(--sp-accent-strong); box-shadow: 0 6px 16px rgba(75, 83, 70, 0.06); }
  .settings-submenu strong { font-size: 13px; font-weight: 650; }
  .settings-submenu span { display: none; font-size: 11px; line-height: 1.4; }

  .settings-workspace {
    grid-column: span 11;
    display: grid;
    grid-template-columns: minmax(430px, 1.3fr) minmax(340px, 0.9fr);
    gap: 18px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .settings-section-content {
    container: settings-editor / inline-size;
    display: grid;
    align-content: start;
    gap: 18px;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 8px;
    scrollbar-gutter: stable;
  }

  .settings-preview-column {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .helper-text {
    font-size: 13px;
    min-width: 0;
  }

  .floating-save-btn {
    flex: 0 0 auto;
    border: none;
    background: #667a63;
    color: #ffffff;
    border-radius: 12px;
    min-height: 36px;
    padding: 0 15px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 14px rgba(82, 99, 79, 0.2);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      opacity 0.15s ease,
      background 0.15s ease;
    white-space: nowrap;
  }

  .floating-save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    background: #52634f;
    box-shadow: 0 14px 30px rgba(82, 99, 79, 0.34);
  }

  .floating-save-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .floating-save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (max-width: 1320px) {
    .settings-panel {
      height: auto;
      min-height: 0;
      overflow: visible;
    }

    .settings-form {
      overflow: visible;
    }

    .settings-submenu {
      grid-column: 1 / -1;
      position: static;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .settings-submenu span {
      display: block;
    }

    .settings-workspace {
      grid-column: 1 / -1;
      grid-template-columns: minmax(0, 1fr);
      overflow: visible;
    }

    .settings-section-content {
      height: auto;
      overflow: visible;
      padding-right: 0;
    }

    .settings-preview-column {
      height: auto;
      overflow: visible;
    }
  }

  @media (max-width: 960px) {
    .panel-header {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 16px;
    }

    .header-actions { justify-content: flex-start; }

    .settings-form {
      padding: 18px;
    }

    .settings-submenu { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (max-width: 720px) {
    .settings-panel {
      border-radius: 18px;
      height: auto;
      min-height: 0;
      overflow: visible;
    }

    .panel-header {
      position: static;
      border-radius: 18px 18px 0 0;
      padding: 14px 16px 12px;
    }

    .settings-form {
      padding: 16px;
    }

    .settings-submenu { grid-template-columns: repeat(2, minmax(0, 1fr)); }

    .header-actions {
      align-items: stretch;
      flex-direction: column;
      gap: 6px;
    }

    .helper-text {
      line-height: 1.45;
    }

    .header-actions .floating-save-btn {
      width: 100%;
      min-height: 40px;
      padding: 0 18px;
      font-size: 14px;
    }
  }

</style>
