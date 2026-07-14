<script lang="ts">
  import type { ChangePasswordReq } from '../../shared/types'
  import {
    cloneSettingsForm,
    createSettingsFormState,
    emptySettingsForm,
    normalizeSettingsForm,
    type SettingsFormModel,
  } from '../lib/settingsForm'
  import BackgroundSettingsSection from './settings/BackgroundSettingsSection.svelte'
  import BasicSettingsSection from './settings/BasicSettingsSection.svelte'
  import CardSettingsSection from './settings/CardSettingsSection.svelte'
  import FooterSettingsSection from './settings/FooterSettingsSection.svelte'
  import NavigationSettingsSection from './settings/NavigationSettingsSection.svelte'
  import SearchEngineSettingsSection from './settings/SearchEngineSettingsSection.svelte'
  import PasswordChangePanel from './PasswordChangePanel.svelte'

  type SettingsPanelValue = SettingsFormModel
  type AsyncVoid<T = void> = T | Promise<T>

  export let value: Partial<SettingsPanelValue> | null = null
  export let loading = false
  export let saving = false
  export let error = ''
  export let onSubmit: ((payload: SettingsPanelValue) => AsyncVoid) | undefined = undefined
  export let onChangePassword: ((payload: ChangePasswordReq) => AsyncVoid) | undefined = undefined

  let form: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let initialForm: SettingsPanelValue = cloneSettingsForm(emptySettingsForm)
  let formKey = ''

  $: nextKey = JSON.stringify({ value, loading })
  $: if (nextKey !== formKey) {
    formKey = nextKey
    initialForm = createSettingsFormState(value)
    form = cloneSettingsForm(initialForm)
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
      <BasicSettingsSection bind:form {saving} />

      <NavigationSettingsSection bind:form {saving} />

      <BackgroundSettingsSection bind:form {saving} />

      <CardSettingsSection bind:form {saving} />

      <SearchEngineSettingsSection bind:form {saving} {enginesValid} />

      <PasswordChangePanel {saving} {onChangePassword} />

      <FooterSettingsSection bind:form {saving} />

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
    --sp-text: #0f172a;
    --sp-heading: #0f172a;
    --sp-strong: #1e293b;
    --sp-label: #334155;
    --sp-muted: #64748b;
    --sp-accent: #2563eb;
    --sp-accent-strong: #1d4ed8;
    --sp-border: rgba(148, 163, 184, 0.22);
    --sp-panel-bg:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.92)),
      #f8fafc;
    --sp-panel-shadow:
      0 24px 54px rgba(30, 41, 59, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.72) inset;
    --sp-header-bg: rgba(255, 255, 255, 0.9);
    --sp-header-border: rgba(203, 213, 225, 0.78);
    --sp-group-bg: rgba(255, 255, 255, 0.9);
    --sp-group-bg-strong: rgba(255, 255, 255, 0.95);
    --sp-group-border: rgba(203, 213, 225, 0.82);
    --sp-subsection-border: rgba(226, 232, 240, 0.92);
    --sp-input-bg: #ffffff;
    --sp-input-border: #cbd5e1;
    --sp-input-hover-border: #94a3b8;
    --sp-input-text: #0f172a;
    --sp-toggle-bg: rgba(248, 250, 252, 0.78);
    --sp-toggle-border: rgba(226, 232, 240, 0.95);
    --sp-toggle-hover-bg: #ffffff;
    --sp-footer-bg: rgba(255, 255, 255, 0.94);
    --sp-footer-border: rgba(148, 163, 184, 0.28);
    --sp-danger: #dc2626;
    --sp-danger-bg: #fef2f2;
    --sp-danger-border: #fecaca;
    --sp-danger-hover-bg: #fee2e2;
    --sp-danger-hover-border: #fca5a5;
    --sp-error-text: #991b1b;
    --sp-warn: #b45309;
    --sp-status-bg: #f8fbff;
    --sp-status-border: #dbeafe;
    --sp-chip-bg: #dbeafe;
    --sp-chip-text: #1d4ed8;
    --sp-chip-sky-bg: #e0f2fe;
    --sp-chip-sky-text: #0369a1;
    --sp-gradient-panel-bg:
      radial-gradient(circle at 18% 0%, rgba(219, 234, 254, 0.62), transparent 32%),
      linear-gradient(135deg, rgba(248, 250, 252, 0.96), rgba(240, 253, 250, 0.7)),
      #ffffff;
    --sp-gradient-panel-border: rgba(191, 219, 254, 0.86);
    --sp-option-bg: rgba(255, 255, 255, 0.88);
    --sp-option-bg-active: rgba(255, 255, 255, 0.96);
    --sp-option-border: rgba(203, 213, 225, 0.9);
    --sp-theme-card-bg:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.96)),
      #ffffff;
    --sp-theme-card-border: rgba(226, 232, 240, 0.94);
    --sp-radio-border: rgba(226, 232, 240, 0.9);
    display: grid;
    gap: 0;
    position: relative;
    border: 1px solid var(--sp-border);
    border-radius: 22px;
    background: var(--sp-panel-bg);
    box-shadow: var(--sp-panel-shadow);
    overflow: visible;
  }

  :global([data-theme='dark']) .settings-panel {
    --sp-text: #e5eefb;
    --sp-heading: #e5eefb;
    --sp-strong: #cbd5e1;
    --sp-label: #cbd5e1;
    --sp-muted: #94a3b8;
    --sp-accent: #7dd3fc;
    --sp-accent-strong: #bae6fd;
    --sp-border: rgba(148, 163, 184, 0.22);
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
      radial-gradient(circle at 18% 0%, rgba(125, 211, 252, 0.12), transparent 32%),
      linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.5)),
      #0b1524;
    --sp-gradient-panel-border: rgba(125, 211, 252, 0.28);
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
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 1px solid var(--sp-header-border);
    background: var(--sp-header-bg);
    backdrop-filter: blur(16px);
    padding: 16px 20px 14px;
  }

  .panel-eyebrow {
    margin: 0 0 5px;
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
    font-size: 20px;
    line-height: 1.2;
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
    margin-top: 5px;
    max-width: 64ch;
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
    gap: 12px;
    padding: 16px 18px 20px;
  }

  .form-footer {
    grid-column: 1 / -1;
    position: sticky;
    bottom: 14px;
    z-index: 24;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 0;
    border: 1px solid var(--sp-footer-border);
    border-radius: 16px;
    background: var(--sp-footer-bg);
    backdrop-filter: blur(16px);
    box-shadow:
      0 18px 38px rgba(15, 23, 42, 0.16),
      0 1px 0 rgba(255, 255, 255, 0.76) inset;
    padding: 10px 12px;
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

  @media (max-width: 960px) {
    .settings-form {
      padding: 18px;
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

</style>
