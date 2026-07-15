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

<fieldset id="settings-section-footer" class="group group-wide" disabled={saving} on:input={() => void syncForm()}>
  <legend>自定义页脚</legend>
  <p class="group-desc">显示在首页最底部的自定义内容，留空则不显示。</p>
  <label class="field full-width">
    <span>页脚 HTML</span>
    <textarea
      bind:value={form.footer_html}
      rows="4"
      placeholder='<div style="text-align:center;color:#cbd5e1">Powered by CF-Navs</div>'
    ></textarea>
    <small>支持自定义 HTML（如备案号、版权信息、友情链接）。请仅填写可信内容，页面安全策略会阻止脚本和内联事件执行。</small>
  </label>
</fieldset>

<style>
  .field.full-width {
    grid-column: 1 / -1;
  }
</style>
