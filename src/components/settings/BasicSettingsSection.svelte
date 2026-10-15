<script lang="ts">
  import { tick } from 'svelte'
  import {
    cloneSettingsForm,
    themeOptions,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'
  import Switch from '../ui/Switch.svelte'
  import Tooltip from '../ui/Tooltip.svelte'
  import Slider from '../ui/Slider.svelte'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-basic" class="group group-wide" disabled={saving}>
  <legend>站点信息</legend>
  <p class="group-desc">设置站点标题及其首页样式，并管理访问范围和访客首次打开页面时使用的主题模式。</p>

  <div class="form-grid base-grid">
    <label class="field field-title">
      <span>站点标题 <span class="req" aria-hidden="true">*</span></span>
      <input
        bind:value={form.site_title}
        type="text"
        placeholder="请输入站点标题"
        maxlength="80"
        required
        on:input={() => void syncForm()}
      />
    </label>

    <div class="field field-title-color">
      <span>首页标题颜色</span>
      <ColorAlphaInput
        bind:value={form.site_title_color}
        onchange={() => void syncForm()}
        placeholder="留空跟随主题文字色"
        inputLabel="首页标题颜色值"
        swatchTitle="选择首页标题颜色"
        alphaText="首页标题透明度"
      />
    </div>

    <div class="field field-title-size">
      <Slider
        label="首页标题字号"
        format="px"
        min={16}
        max={72}
        step={1}
        bind:value={form.site_title_font_size}
        oninput={() => void syncForm()}
      />
    </div>

    <div class="field-switch field-toggle">
      <span class="switch-copy">公开模式 <Tooltip text="开启后无需登录即可浏览；关闭后仅管理员登录可见。" /></span>
      <Switch
        checked={form.public_mode}
        ariaLabel="公开模式"
        onchange={(next) => { form.public_mode = next; void syncForm() }}
      />
    </div>

    <div class="field-switch field-toggle" data-testid="browser-sync-setting">
      <span class="switch-copy">浏览器书签同步 <Tooltip text="开启后，浏览器扩展新增的书签会单向同步到「浏览器新增收藏」分类；不会删除或覆盖导航页现有书签。" /></span>
      <Switch
        checked={form.browser_sync_enabled}
        ariaLabel="浏览器书签同步"
        onchange={(next) => { form.browser_sync_enabled = next; void syncForm() }}
      />
    </div>

    <div class="field field-theme">
      <span class="field-label">默认主题模式 <Tooltip text="设置新访客首次访问时的默认主题，访客仍可在首页手动切换。" /></span>
      <div class="segmented-control" role="radiogroup" aria-label="默认主题模式">
        {#each themeOptions as option (option.value)}
          <label class:active={form.theme === option.value}>
            <input
              type="radio"
              bind:group={form.theme}
              value={option.value}
              on:change={() => void syncForm()}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
    </div>

  </div>

  <div class="settings-subsection external-resource-section">
    <h3>外部资源</h3>
    <label class="field field-image-host">
      <span>图床服务地址（可选） <Tooltip text="用于背景图、分类与书签图标的上传接口。留空则仅支持填写外链。" /></span>
      <input
        bind:value={form.image_host_url}
        type="url"
        placeholder="https://your-domain.com"
        on:input={() => void syncForm()}
      />
    </label>
  </div>
</fieldset>

<style>
  .field-title {
    grid-column: span 4;
  }

  .field-title-color,
  .field-title-size {
    grid-column: span 4;
  }

  .field-toggle,
  .field-theme {
    grid-column: span 6;
  }

  .field-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 12px;
    padding: 13px 15px;
    background: var(--sp-toggle-bg);
  }

  .switch-copy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
  }

  .req {
    color: var(--sp-warn, #dc2626);
  }

  .segmented-control {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .external-resource-section {
    border-top: 1px solid var(--sp-subsection-border);
    padding-top: 18px;
  }

  .field-image-host {
    max-width: 720px;
  }

  @media (max-width: 960px) {
    .field-title,
    .field-title-color,
    .field-title-size,
    .field-toggle,
    .field-theme {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 620px) {
    .field-title,
    .field-title-color,
    .field-title-size,
    .field-toggle,
    .field-theme {
      grid-column: 1 / -1;
    }
  }
</style>
