<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  interface FooterSettingsSectionProps {
    form: SettingsFormModel
    saving?: boolean
  }

  let { form = $bindable(), saving = false }: FooterSettingsSectionProps = $props()

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-footer" class="group group-wide" disabled={saving} oninput={() => void syncForm()}>
  <legend>自定义样式与脚本</legend>
  <p class="group-desc">管理首页页脚内容以及自定义 CSS、JavaScript。预览会隔离展示页脚和 CSS，不会执行 JavaScript。</p>

  <label class="field full-width">
    <span class="code-field-label">页脚 HTML <em class="lang-tag">HTML</em></span>
    <textarea
      bind:value={form.footer_html}
      rows="4"
      placeholder='<div style="text-align:center;color:#cbd5e1">Powered by CF-Navs</div>'
    ></textarea>
    <small>支持自定义 HTML（如备案号、版权信息、友情链接）。请仅填写可信内容，页面安全策略会阻止脚本和内联事件执行。</small>
  </label>

  <label class="field full-width">
    <span class="code-field-label">自定义 CSS <em class="lang-tag">CSS</em></span>
    <textarea
      bind:value={form.custom_css}
      rows="7"
      placeholder={'例如：.home-footer { opacity: 0.8; }'}
    ></textarea>
    <small>保存后注入前台首页；右侧预览在隔离区域内展示，不会影响管理界面。</small>
  </label>

  <label class="field full-width">
    <span class="code-field-label">自定义 JavaScript <em class="lang-tag">JS</em></span>
    <textarea
      bind:value={form.custom_js}
      rows="7"
      placeholder="例如：console.log('Hello CF-Navs!');"
    ></textarea>
    <small class="warn">为保护管理会话，JavaScript 不会在预览中执行。请仅保存你完全信任的脚本。</small>
  </label>
</fieldset>

<style>
  .field.full-width {
    grid-column: 1 / -1;
  }

  .code-field-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .lang-tag {
    font-style: normal;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 1px 7px;
    border-radius: var(--radius-sm, 8px);
    color: var(--sp-chip-text);
    background: var(--sp-chip-bg);
  }
</style>
