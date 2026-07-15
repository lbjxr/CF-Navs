<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-basic" class="group group-wide" disabled={saving}>
  <legend>基础信息</legend>
  <p class="group-desc">站点的名称与访问方式，保存后立即对前台生效。</p>

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

    <label class="field field-url">
      <span>图床地址（可选）</span>
      <input
        bind:value={form.image_host_url}
        type="url"
        placeholder="https://img.example.com"
        on:input={() => void syncForm()}
      />
      <small>配置后，在设置背景图片时可一键打开图床上传页，方便获取图片外链。</small>
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
  </div>
</fieldset>

<style>
  .field-title {
    grid-column: span 4;
  }

  .field-url {
    grid-column: span 4;
  }

  .field-toggle {
    grid-column: span 4;
  }

  @media (max-width: 960px) {
    .field-title,
    .field-url,
    .field-toggle {
      grid-column: 1 / -1;
    }
  }
</style>
