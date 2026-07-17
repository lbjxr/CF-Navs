<script lang="ts">
  import type { ChangePasswordReq } from '../../shared/types'
  import {
    cloneSettingsForm,
    createSettingsFormState,
    emptySettingsForm,
    normalizeSettingsForm,
    type SettingsFormModel,
  } from '../lib/settingsForm'
  import './settings/settingsSections.css'
  import BackgroundSettingsSection from './settings/BackgroundSettingsSection.svelte'
  import BasicSettingsSection from './settings/BasicSettingsSection.svelte'
  import CardSettingsSection from './settings/CardSettingsSection.svelte'
  import FooterSettingsSection from './settings/FooterSettingsSection.svelte'
  import HeroSettingsSection from './settings/HeroSettingsSection.svelte'
  import NavigationSettingsSection from './settings/NavigationSettingsSection.svelte'
  import SearchEngineSettingsSection from './settings/SearchEngineSettingsSection.svelte'
  import PasswordChangePanel from './PasswordChangePanel.svelte'
  import { gradientPresets } from '../lib/themePresets'

  type SettingsPanelValue = SettingsFormModel
  type AsyncVoid<T = void> = T | Promise<T>

  export let value: Partial<SettingsPanelValue> | null = null
  export let loading = false
  export let saving = false
  export let error = ''
  export let onSubmit: ((payload: SettingsPanelValue) => AsyncVoid) | undefined = undefined
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined

  const settingsSections = [
    { id: 'basic', label: '基础与标题', hint: '站点名称、公开状态与首页搜索' },
    { id: 'appearance', label: '外观与卡片', hint: '主题、背景、卡片样式' },
    { id: 'layout', label: '布局与导航', hint: '内容宽度、边距与导航位置' },
    { id: 'search', label: '搜索服务', hint: '搜索引擎与快捷入口' },
    { id: 'footer', label: '页脚与扩展', hint: '页脚、自定义脚本与样式' },
    { id: 'account', label: '账号安全', hint: '修改管理员密码' },
  ]

  let form: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let initialForm: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let formKey = ''
  let activeSectionId = 'basic'

  $: nextKey = JSON.stringify({ value, loading })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    initialForm = createSettingsFormState(value)
    form = cloneSettingsForm(initialForm)
  }

  $: normalizedForm = normalizeSettingsForm(form)
  $: selectedThemePreset = gradientPresets.find((preset) => preset.id === normalizedForm.background_preset_id)
  $: settingsThemeAccent = selectedThemePreset?.accentColor ?? 'var(--admin-accent, #2563eb)'
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

</script>

<section class="settings-panel" style={`--settings-theme-accent: ${settingsThemeAccent};`} aria-busy={loading || saving}>
  <div class="panel-header">
    <div class="panel-header-copy">
      <p class="panel-eyebrow">设置</p>
      <h2>站点设置</h2>
      <p class="panel-desc">按功能区管理站点信息、外观、布局与账号。切换功能区不会丢失未保存内容，修改完成后使用右上角「保存设置」。</p>
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

      <div class="settings-section-content">
        {#if activeSectionId === 'basic'}
          <BasicSettingsSection bind:form {saving} />
          <HeroSettingsSection bind:form {saving} />
        {:else if activeSectionId === 'appearance'}
          <BackgroundSettingsSection bind:form {saving} />
          <CardSettingsSection bind:form {saving} />
        {:else if activeSectionId === 'layout'}
          <NavigationSettingsSection bind:form {saving} />
        {:else if activeSectionId === 'search'}
          <SearchEngineSettingsSection bind:form {saving} {enginesValid} />
        {:else if activeSectionId === 'footer'}
          <FooterSettingsSection bind:form {saving} />
        {:else}
          <PasswordChangePanel {saving} {onChangePassword} />
        {/if}
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
    --sp-accent: var(--settings-theme-accent, var(--admin-accent, #2563eb));
    --sp-accent-strong: var(--settings-theme-accent, var(--admin-accent-strong, #1d4ed8));
    --sp-border: var(--admin-border, rgba(112, 126, 108, 0.22));
    --sp-panel-bg: var(--admin-surface, #ffffff);
    --sp-panel-shadow:
      0 24px 54px rgba(75, 83, 70, 0.1),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
    --sp-header-bg: var(--admin-sticky-bg, rgba(253, 252, 249, 0.88));
    --sp-header-border: var(--admin-divider, rgba(112, 126, 108, 0.2));
    --sp-group-bg: var(--admin-surface, rgba(253, 252, 249, 0.88));
    --sp-group-bg-strong: rgba(255, 255, 255, 0.66);
    --sp-group-border: rgba(112, 126, 108, 0.2);
    --sp-subsection-border: rgba(112, 126, 108, 0.16);
    --sp-input-bg: rgba(255, 255, 255, 0.78);
    --sp-input-border: rgba(112, 126, 108, 0.28);
    --sp-input-hover-border: rgba(112, 126, 108, 0.52);
    --sp-input-text: #3f493d;
    --sp-toggle-bg: rgba(239, 242, 235, 0.7);
    --sp-toggle-border: rgba(112, 126, 108, 0.2);
    --sp-toggle-hover-bg: rgba(255, 255, 255, 0.94);
    --sp-footer-bg: rgba(253, 252, 249, 0.92);
    --sp-footer-border: rgba(112, 126, 108, 0.24);
    --sp-danger: #dc2626;
    --sp-danger-bg: #fef2f2;
    --sp-danger-border: #fecaca;
    --sp-danger-hover-bg: #fee2e2;
    --sp-danger-hover-border: #fca5a5;
    --sp-error-text: #991b1b;
    --sp-warn: #b45309;
    --sp-status-bg: #f8fbff;
    --sp-status-border: #dbeafe;
    --sp-chip-bg: #e5ebe2;
    --sp-chip-text: #52634f;
    --sp-chip-sky-bg: #edf0e8;
    --sp-chip-sky-text: #667561;
    --sp-gradient-panel-bg:
      radial-gradient(circle at 18% 0%, rgba(205, 220, 200, 0.42), transparent 32%),
      linear-gradient(135deg, rgba(253, 252, 249, 0.96), rgba(241, 245, 238, 0.78)),
      #ffffff;
    --sp-gradient-panel-border: rgba(147, 165, 139, 0.48);
    --sp-option-bg: rgba(255, 255, 255, 0.88);
    --sp-option-bg-active: rgba(255, 255, 255, 0.96);
    --sp-option-border: rgba(203, 213, 225, 0.9);
    --sp-theme-card-bg:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.96)),
      #ffffff;
    --sp-theme-card-border: rgba(226, 232, 240, 0.94);
    --sp-radio-border: rgba(226, 232, 240, 0.9);
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
    --sp-panel-bg:
      linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.7)),
      #0b1524;
    --sp-panel-shadow:
      0 24px 54px rgba(0, 0, 0, 0.32),
      0 1px 0 rgba(255, 255, 255, 0.04) inset;
    --sp-header-bg: rgba(15, 23, 42, 0.82);
    --sp-header-border: rgba(148, 163, 184, 0.2);
    --sp-group-bg: rgba(15, 23, 42, 0.55);
    --sp-group-bg-strong: rgba(15, 23, 42, 0.62);
    --sp-group-border: rgba(148, 163, 184, 0.2);
    --sp-subsection-border: rgba(148, 163, 184, 0.18);
    --sp-input-bg: rgba(15, 23, 42, 0.72);
    --sp-input-border: rgba(148, 163, 184, 0.32);
    --sp-input-hover-border: rgba(148, 163, 184, 0.5);
    --sp-input-text: #e5eefb;
    --sp-toggle-bg: rgba(15, 23, 42, 0.5);
    --sp-toggle-border: rgba(148, 163, 184, 0.2);
    --sp-toggle-hover-bg: rgba(30, 41, 59, 0.72);
    --sp-footer-bg: rgba(15, 23, 42, 0.9);
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
    --sp-gradient-panel-bg:
      radial-gradient(circle at 18% 0%, rgba(169, 194, 160, 0.14), transparent 32%),
      linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.5)),
      #0b1524;
    --sp-gradient-panel-border: rgba(169, 194, 160, 0.3);
    --sp-option-bg: rgba(15, 23, 42, 0.55);
    --sp-option-bg-active: rgba(30, 41, 59, 0.72);
    --sp-option-border: rgba(148, 163, 184, 0.24);
    --sp-theme-card-bg:
      linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.55)),
      #0b1524;
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
    grid-column: span 3;
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
    padding: 12px 14px;
    text-align: left;
    background: transparent;
    color: var(--sp-muted);
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
  }

  .settings-submenu button:hover { background: var(--sp-toggle-bg); color: var(--sp-strong); transform: translateX(2px); }
  .settings-submenu button.active { border-color: var(--sp-toggle-border); background: var(--sp-toggle-bg); color: var(--sp-accent-strong); box-shadow: 0 6px 16px rgba(75, 83, 70, 0.06); }
  .settings-submenu strong { font-size: 13px; font-weight: 650; }
  .settings-submenu span { font-size: 11px; line-height: 1.4; }

  .settings-section-content { grid-column: span 9; display: grid; align-content: start; gap: 18px; min-width: 0; height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; scrollbar-gutter: stable; }

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

    .settings-submenu { grid-column: 1 / -1; position: static; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .settings-panel { height: auto; min-height: 0; overflow: visible; }
    .settings-section-content { grid-column: 1 / -1; height: auto; overflow: visible; padding-right: 0; }
  }

  @media (max-width: 720px) {
    .settings-panel {
      border-radius: 18px;
      height: auto;
      min-height: 0;
      overflow: visible;
    }

    .panel-header {
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
