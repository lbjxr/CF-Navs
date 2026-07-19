<script lang="ts">
  import { tick } from 'svelte'
  import {
    cloneSettingsForm,
    themeOptions,
    type SettingsFormModel,
  } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  $: currentThemeHint = themeOptions.find((option) => option.value === form.theme)?.hint ?? ''
</script>

<fieldset id="settings-section-basic" class="group group-wide" disabled={saving}>
  <legend>站点信息</legend>
  <p class="group-desc">设置站点标题及其首页样式，并管理访问范围和访客首次打开页面时使用的主题模式。</p>

  <div class="form-grid base-grid">
    <label class="field field-title">
      <span>站点标题</span>
      <input
        bind:value={form.site_title}
        type="text"
        placeholder="例如：CF-Navs 导航站"
        maxlength="80"
        required
        on:input={() => void syncForm()}
      />
      <small>显示在浏览器标签页、首页顶部和管理界面中，必填。</small>
    </label>

    <div class="field field-title-color">
      <span>首页标题颜色</span>
      <ColorAlphaInput
        bind:value={form.site_title_color}
        on:change={() => void syncForm()}
        placeholder="留空则跟随主题"
        inputLabel="首页标题颜色值"
        swatchTitle="选择首页标题颜色"
        alphaText="首页标题透明度"
      />
      <small>留空时跟随当前主题文字颜色；配色方案也会提供推荐值。</small>
    </div>

    <label class="field field-title-size">
      <span>首页标题字号 <em>{form.site_title_font_size}px</em></span>
      <input
        bind:value={form.site_title_font_size}
        type="range"
        min="16"
        max="72"
        step="1"
        on:input={() => void syncForm()}
      />
      <small>仅调整首页主标题大小，不影响浏览器标签页文字。</small>
    </label>

    <div class="toggle-field field-toggle">
      <label class="toggle-copy" for="settings-public-mode">
        <span>公开模式</span>
        <p>开启后，任何访客无需登录即可浏览首页书签；关闭则仅管理员登录后可见。</p>
      </label>
      <input
        id="settings-public-mode"
        bind:checked={form.public_mode}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </div>

    <div class="field field-theme">
      <span class="field-label">默认主题模式</span>
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
      <small>{currentThemeHint}访客仍可在首页临时切换浅色或深色。</small>
    </div>
  </div>

  <div class="settings-subsection external-resource-section">
    <h3>外部资源</h3>
    <label class="field field-image-host">
      <span>图床服务地址（可选）</span>
      <input
        bind:value={form.image_host_url}
        type="url"
        placeholder="https://img.example.com"
        on:input={() => void syncForm()}
      />
      <small>用于背景图片、分类图标和书签自定义图标的上传入口。</small>
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
