<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  export let form: SettingsFormModel
  export let saving = false

  $: form.card_show_description = form.card_description_mode === 'always'

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset
  id="settings-section-card"
  class="group group-wide group-card"
  disabled={saving}
  on:input={() => void syncForm()}
  on:change={() => void syncForm()}
>
  <legend>卡片展示</legend>
  <p class="group-desc">选择书签卡片的主要表现方式，并决定详情卡片何时显示描述。</p>

  <div class="settings-subsection">
    <h3>卡片风格</h3>
    <div class="radio-group">
      <label class="radio-option">
        <input type="radio" bind:group={form.card_style} value="info" />
        <div class="radio-content">
          <strong>详情风格</strong>
          <p>横向显示图标、标题和可选描述，适合需要补充说明的站点。</p>
        </div>
      </label>

      <label class="radio-option">
        <input type="radio" bind:group={form.card_style} value="icon" />
        <div class="radio-content">
          <strong>极简风格</strong>
          <p>以图标网格展示书签，在相同空间内显示更多入口。</p>
        </div>
      </label>
    </div>
  </div>

  {#if form.card_style === 'info'}
    <div class="settings-subsection description-mode-field">
      <h3>描述显示策略</h3>
      <div class="radio-group compact">
        <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="always" /><span>始终显示</span></label>
        <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hover" /><span>悬停显示</span></label>
        <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hidden" /><span>隐藏</span></label>
      </div>
      <small>仅用于详情风格；单个书签仍可在编辑时覆盖这一策略。</small>
    </div>
  {:else}
    <div class="settings-subsection icon-title-setting">
      <h3>极简风格标题</h3>
      <label class="toggle-field icon-title-toggle">
        <div class="toggle-copy">
          <span>显示极简卡片标题</span>
          <p>在图标下方显示书签名称，仅对极简风格生效。</p>
        </div>
        <input type="checkbox" bind:checked={form.card_icon_show_title} />
      </label>
    </div>
  {/if}

</fieldset>

<style>
  .radio-group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .radio-group.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .radio-option {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    min-width: 0;
    border: 1px solid var(--sp-radio-border);
    border-radius: 12px;
    padding: 13px 14px;
    background: var(--sp-toggle-bg);
    cursor: pointer;
    transition: border-color 180ms ease, background 180ms ease;
  }

  .radio-option:hover {
    border-color: color-mix(in srgb, var(--sp-accent) 42%, var(--sp-radio-border));
    background: var(--sp-toggle-hover-bg);
  }

  .radio-option:focus-within {
    outline: 2px solid var(--sp-accent);
    outline-offset: 1px;
  }

  .radio-option input[type='radio'] {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin: 1px 0 0;
    accent-color: var(--sp-accent);
  }

  .radio-content {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .radio-content strong {
    color: var(--sp-strong);
    font-size: 14px;
  }

  .radio-content p {
    margin: 0;
    color: var(--sp-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .description-mode-field small {
    color: var(--sp-muted);
  }

  .icon-title-toggle {
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 620px) {
    .radio-group.compact {
      grid-template-columns: 1fr;
    }
  }

  @container settings-editor (max-width: 520px) {
    .radio-group.compact {
      grid-template-columns: 1fr;
    }
  }
</style>
