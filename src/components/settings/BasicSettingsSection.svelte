<script lang="ts">
  import { tick } from 'svelte'
  import {
    cloneSettingsForm,
    themeOptions,
    type SettingsFormModel,
  } from '../../lib/settingsForm'

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
  <p class="group-desc">设置站点名称、首页访问范围和访客首次打开页面时使用的主题模式。</p>

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
</fieldset>

<style>
  .field-title {
    grid-column: span 4;
  }

  .field-toggle,
  .field-theme {
    grid-column: span 4;
  }

  .segmented-control {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 960px) {
    .field-title,
    .field-toggle,
    .field-theme {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 620px) {
    .field-title,
    .field-toggle,
    .field-theme {
      grid-column: 1 / -1;
    }
  }
</style>
