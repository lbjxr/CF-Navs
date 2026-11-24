<svelte:options runes />

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import type { ChangePasswordReq } from '../../shared/types'
  import { CARD_SIZE_LIMITS } from '../../shared/settings'
  import {
    cloneSettingsForm,
    createSettingsFormState,
    emptySettingsForm,
    normalizeSettingsForm,
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
  import { getErrorMessage } from '../lib/api'
  import {
    isSettingsSaveAcknowledged,
    type RegisterSettingsLeaveGuard,
    type SettingsLeaveGuard,
    type SettingsSaveOutcome,
    type SettingsSubmitHandler,
  } from '../lib/settingsLeave'

  type SettingsPanelValue = SettingsFormModel
  type AsyncVoid<T = void> = T | Promise<T>

  interface Props {
    value?: Partial<SettingsPanelValue> | null
    loading?: boolean
    saving?: boolean
    error?: string
    onSubmit?: SettingsSubmitHandler
    onChangePassword?: (payload: ChangePasswordReq) => AsyncVoid
    sessionActive?: boolean
    sessionIdentity?: object | null
    onRegisterLeaveGuard?: RegisterSettingsLeaveGuard
  }

  let {
    value = null,
    loading = false,
    saving: savingProp = false,
    error = '',
    onSubmit = undefined,
    onChangePassword = undefined,
    sessionActive = true,
    sessionIdentity = null,
    onRegisterLeaveGuard = undefined,
  }: Props = $props()

  const settingsSections = [
    { id: 'basic', label: '站点设置', hint: '标题、首页显示与默认主题' },
    { id: 'appearance', label: '外观与卡片', hint: '配色方案与书签卡片风格' },
    { id: 'visual', label: '高级与视觉', hint: '背景、尺寸与分类标题视觉' },
    { id: 'layout', label: '布局与导航', hint: '内容宽度、边距与导航位置' },
    { id: 'search', label: '搜索设置', hint: '默认引擎与搜索服务' },
    { id: 'footer', label: '自定义样式/脚本', hint: '页脚、CSS 与 JavaScript' },
    { id: 'account', label: '账号安全', hint: '修改管理员密码' },
  ]

  // 各设置分区以 `bind:form` 双向绑定并就地写回字段（`bind:value={form.x}` / `bind:group`），需要深层响应；
  // 分区内的字段绑定由此作用在 $state 代理上，不再报 binding_property_non_reactive。
  let form: SettingsPanelValue = $state(cloneSettingsForm(emptySettingsForm))
  // 只整体替换、不就地修改。
  let initialForm: SettingsPanelValue = $state.raw(cloneSettingsForm(emptySettingsForm))
  // 只在下面的副作用里比较，不进模板。
  let formKey = ''
  let activeSectionId = $state('basic')
  let previewTheme: 'light' | 'dark' = $state('light')
  let localSaving = $state(false)
  let localSaveError = $state('')
  let saveRequest: Promise<SettingsSaveOutcome> | null = null
  let formEpoch = 0
  let wasSessionActive = true
  let formSessionIdentity = untrack(() => sessionIdentity)
  let alive = true
  let registeredLeaveCallback: RegisterSettingsLeaveGuard | undefined
  let registeredLeaveIdentity: object | null | undefined
  let registeredLeaveActive = false
  const saving = $derived(savingProp || localSaving || !sessionActive)
  const displayedError = $derived(error || localSaveError)

  const incomingForm = $derived(createSettingsFormState(value))
  const incomingKey = $derived(JSON.stringify(normalizeSettingsForm(incomingForm)))

  const normalizedForm = $derived(normalizeSettingsForm(form))
  const normalizedInitialForm = $derived(normalizeSettingsForm(initialForm))
  const isDirty = $derived(JSON.stringify(normalizedForm) !== JSON.stringify(normalizedInitialForm))
  const hasTitle = $derived(normalizedForm.site_title.length > 0)
  const enginesValid = $derived(normalizedForm.search_engine.engines.length > 0 &&
    normalizedForm.search_engine.engines.every(
      (engine) => engine.name.length > 0 && engine.url_template.includes('{q}'),
    ))
  const lightBackgroundValid = $derived(normalizedForm.backgrounds.light.value.length > 0)
  const darkBackgroundValid = $derived(normalizedForm.backgrounds.dark.value.length > 0)
  const backgroundValid = $derived(lightBackgroundValid && darkBackgroundValid)
  const cardSizeValid = $derived(Number.isFinite(normalizedForm.card_size.width) &&
    normalizedForm.card_size.width >= CARD_SIZE_LIMITS.width.min &&
    normalizedForm.card_size.width <= CARD_SIZE_LIMITS.width.max &&
    Number.isFinite(normalizedForm.card_size.height) &&
    normalizedForm.card_size.height >= CARD_SIZE_LIMITS.height.min &&
    normalizedForm.card_size.height <= CARD_SIZE_LIMITS.height.max)
  const contentLayoutValid = $derived(Number.isFinite(normalizedForm.content_layout.max_width) &&
    normalizedForm.content_layout.max_width > 0 &&
    Number.isFinite(normalizedForm.content_layout.margin_x) &&
    Number.isFinite(normalizedForm.content_layout.margin_top) &&
    Number.isFinite(normalizedForm.content_layout.margin_bottom))
  const canSave = $derived(Boolean(onSubmit) &&
    !loading &&
    !saving &&
    hasTitle &&
    enginesValid &&
    backgroundValid &&
    cardSizeValid &&
    contentLayoutValid &&
    isDirty)

  // 刷新仅同步干净的表单。脏稿与待确认保存的 baseline 都不能被 value 提前更新覆盖。
  $effect.pre(() => {
    const incoming = incomingForm
    const key = incomingKey
    const active = sessionActive
    const identity = sessionIdentity
    const busy = saving
    const dirty = isDirty
    const isLoading = loading
    untrack(() => {
      if (!active || identity !== formSessionIdentity) {
        if (wasSessionActive || identity !== formSessionIdentity) {
          formEpoch += 1
          saveRequest = null
          localSaving = false
          localSaveError = ''
          formKey = ''
          initialForm = cloneSettingsForm(emptySettingsForm)
          form = cloneSettingsForm(initialForm)
          activeSectionId = 'basic'
          previewTheme = 'light'
        }
        formSessionIdentity = identity
        wasSessionActive = active
        if (!active) return
      }
      wasSessionActive = true
      if (isLoading || busy || dirty || key === formKey) return
      formKey = key
      initialForm = cloneSettingsForm(incoming)
      form = cloneSettingsForm(initialForm)
    })
  })

  const leaveGuard: SettingsLeaveGuard = {
    getState: () => ({ dirty: sessionActive && isDirty, saving: sessionActive && saving, canSave }),
    save: saveSettings,
    discard: () => {
      initialForm = cloneSettingsForm(incomingForm)
      form = cloneSettingsForm(initialForm)
      formKey = incomingKey
      localSaveError = ''
    },
  }

  $effect(() => {
    const register = onRegisterLeaveGuard
    const active = sessionActive
    const identity = sessionIdentity
    // 转发 props 的 getter 可能因 value 更新重跑；只有真正的上下文变化才撤销句柄。
    untrack(() => {
      if (register === registeredLeaveCallback && active === registeredLeaveActive && identity === registeredLeaveIdentity) return
      registeredLeaveCallback?.(null)
      registeredLeaveCallback = register
      registeredLeaveActive = active
      registeredLeaveIdentity = identity
      register?.(active ? leaveGuard : null)
    })
  })

  $effect(() => {
    if (!sessionActive || !isDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  })

  onDestroy(() => {
    alive = false
    formEpoch += 1
    registeredLeaveCallback?.(null)
  })

  async function saveSettings(): Promise<SettingsSaveOutcome> {
    if (saveRequest) return saveRequest
    if (!canSave || !sessionActive || !onSubmit) return { saved: false, error: '请先完善设置后再保存。' }
    const submit = onSubmit
    const snapshot = normalizeSettingsForm(cloneSettingsForm(form))
    const snapshotKey = JSON.stringify(snapshot)
    const epoch = ++formEpoch
    const identity = sessionIdentity
    localSaving = true
    localSaveError = ''
    const isCurrent = () => alive && sessionActive && identity === sessionIdentity && epoch === formEpoch
    saveRequest = (async () => {
      try {
        const ack = await Promise.resolve().then(() => submit(snapshot))
        await tick()
        if (!isCurrent()) return { saved: false, error: '' }
        if (!isSettingsSaveAcknowledged(ack, error, snapshotKey, incomingKey)) {
          localSaveError = error || '设置尚未保存，请重试或继续编辑。'
          return { saved: false, error: localSaveError }
        }
        // 只确认本次提交快照；保存期间的后续编辑仍与它不同，继续保持 dirty。
        initialForm = cloneSettingsForm(snapshot)
        formKey = snapshotKey
        return { saved: true, error: '' }
      } catch (saveError) {
        if (!isCurrent()) return { saved: false, error: '' }
        localSaveError = getErrorMessage(saveError)
        return { saved: false, error: localSaveError }
      } finally {
        if (isCurrent()) {
          localSaving = false
          saveRequest = null
        }
      }
    })()
    return saveRequest
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    await saveSettings()
  }

</script>

<section class="settings-panel" aria-busy={loading || saving}>
  <div class="panel-header">
    <div class="panel-header-copy">
      <p class="panel-eyebrow">设置</p>
      <h2>站点设置</h2>
    </div>
    <div class="header-actions">
      <p class="helper-text">
        {#if saving}正在保存...{:else if !hasTitle}请填写站点标题{:else if !backgroundValid}请完善背景{:else if !enginesValid}请完善搜索引擎{:else if !contentLayoutValid}请完善布局{:else if isDirty}有未保存更改{:else}配置已同步{/if}
      </p>
      <button type="submit" class="floating-save-btn" form="settings-form" disabled={!canSave}>{#if saving}保存中{:else}保存设置{/if}</button>
    </div>
  </div>

  {#if displayedError}
    <div class="error-banner" role="alert">
      <strong>保存失败</strong>
      <p>{displayedError}</p>
    </div>
  {/if}

  {#if loading}
    <div class="status-card">
      <p class="status-title">设置加载中...</p>
      <p class="status-desc">请稍候，正在准备当前配置。</p>
    </div>
  {:else}
    <form id="settings-form" class="settings-form" onsubmit={handleSubmit}>
      <aside class="settings-submenu" aria-label="设置功能区">
        {#each settingsSections as section (section.id)}
          <button type="button" class:active={activeSectionId === section.id} onclick={() => activeSectionId = section.id}>
            <strong>{section.label}</strong><span>{section.hint}</span>
          </button>
        {/each}
      </aside>

      <div class="settings-workspace">
        <div class="settings-section-content">
          {#if activeSectionId === 'basic'}
            <BasicSettingsSection bind:form {saving} />
            <HeroSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'appearance'}
            <BackgroundSettingsSection
              bind:form
              {saving}
            />
            <CardSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'visual'}
            <AdvancedSettingsSection
              bind:form
              {saving}
            />
          {:else if activeSectionId === 'layout'}
            <NavigationSettingsSection bind:form {saving} />
          {:else if activeSectionId === 'search'}
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
    grid-template-rows: auto auto;
    gap: 0;
    position: relative;
    box-sizing: border-box;
    border: 1px solid var(--sp-border);
    border-radius: 22px;
    background: var(--sp-panel-bg);
    box-shadow: var(--sp-panel-shadow);
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

  .status-desc,
  .helper-text {
    color: var(--sp-muted);
    line-height: 1.55;
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
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 16px;
    padding: 22px 24px 28px;
    min-height: 0;
    box-sizing: border-box;
  }

  .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; align-self: center; }

  .settings-submenu {
    grid-column: 1 / -1;
    align-self: start;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    position: static;
  }

  .settings-submenu button {
    display: grid;
    gap: 4px;
    border: 1px solid transparent;
    border-radius: 12px;
    padding: 10px 12px;
    text-align: center;
    background: transparent;
    color: var(--sp-muted);
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
  }

  .settings-submenu button:hover { background: var(--sp-toggle-bg); color: var(--sp-strong); }
  .settings-submenu button.active { border-color: var(--sp-toggle-border); background: var(--sp-toggle-bg); color: var(--sp-accent-strong); box-shadow: 0 6px 16px rgba(75, 83, 70, 0.06); }
  .settings-submenu strong { font-size: 13px; font-weight: 650; }
  .settings-submenu span { display: block; font-size: 11px; line-height: 1.4; }

  .settings-workspace {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(430px, 1.3fr) minmax(340px, 0.9fr);
    gap: 18px;
    min-width: 0;
    align-items: start;
  }

  .settings-section-content {
    container: settings-editor / inline-size;
    display: grid;
    align-content: start;
    gap: 18px;
    min-width: 0;
    min-height: 0;
  }

  .settings-preview-column {
    min-width: 0;
    position: sticky;
    top: 16px;
    align-self: start;
    height: auto;
    max-height: calc(100dvh - 210px);
    overflow: hidden;
  }

  .helper-text {
    font-size: 13px;
    min-width: 0;
  }

  .floating-save-btn {
    flex: 0 0 auto;
    border: 1px solid #bfdbfe;
    background: #dbeafe;
    color: #1d4ed8;
    border-radius: 12px;
    min-height: 36px;
    padding: 0 15px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 14px rgba(37, 99, 235, 0.14);
    transition:
      transform var(--transition-fast),
      box-shadow var(--transition-fast),
      opacity var(--transition-fast),
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
    white-space: nowrap;
  }

  .floating-save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: #93c5fd;
    background: #bfdbfe;
    color: #1e40af;
    box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
  }

  .floating-save-btn:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  .floating-save-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .floating-save-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (max-width: 1320px) {
    .settings-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .settings-preview-column {
      position: static;
      max-height: none;
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
