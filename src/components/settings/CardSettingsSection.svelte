<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'

  export let form: SettingsFormModel
  export let saving = false
  export let advancedOpen = false

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

  <div class="settings-subsection description-mode-field" class:disabled={form.card_style !== 'info'}>
    <h3>描述显示策略</h3>
    <div class="radio-group compact">
      <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="always" disabled={form.card_style !== 'info'} /><span>始终显示</span></label>
      <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hover" disabled={form.card_style !== 'info'} /><span>悬停显示</span></label>
      <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hidden" disabled={form.card_style !== 'info'} /><span>隐藏</span></label>
    </div>
    <small>仅用于详情风格；单个书签仍可在编辑时覆盖这一策略。</small>
  </div>

  {#if advancedOpen}
    <div id="settings-card-advanced" class="card-advanced" data-testid="card-advanced-settings">
      <div class="settings-subsection">
        <h3>尺寸与密度</h3>
        <div class="settings-grid card-size-grid">
          <label class="field field-number">
            <span>卡片最小宽度 (px)</span>
            <input bind:value={form.card_size.width} type="number" min="80" max="400" step="10" />
            <small>数值越小，每行可排列的卡片越多。</small>
          </label>
          <label class="field field-number">
            <span>详情卡片最小高度 (px)</span>
            <input bind:value={form.card_size.height} type="number" min="0" max="300" step="10" />
            <small>仅影响详情风格；设置为 0 时由内容决定高度。</small>
          </label>
          <label class="field field-number">
            <span>极简卡片图标大小 (px)</span>
            <input bind:value={form.card_icon_size} type="number" min="40" max="100" step="5" />
            <small>控制极简风格中图标卡片的边长。</small>
          </label>
        </div>
      </div>

      <div class="settings-subsection">
        <h3>卡片表面</h3>
        <div class="settings-grid card-appearance-grid">
          <div class="field field-color">
            <span>卡片表面颜色</span>
            <ColorAlphaInput
              bind:value={form.card_background_color}
              bind:alpha={form.card_background_opacity}
              on:change={() => void syncForm()}
              placeholder="#ffffff"
              inputLabel="卡片表面颜色值"
              swatchTitle="选择卡片表面颜色"
              alphaText="卡片表面透明度"
            />
            <small>作为卡片的基础色；内置方案会提供一组匹配值。</small>
          </div>

          <label class="field field-range">
            <span>卡片不透明度 <em>{form.card_background_opacity.toFixed(2)}</em></span>
            <input bind:value={form.card_background_opacity} type="range" min="0" max="1" step="0.05" />
            <small>数值越低越通透，背景内容会更明显。</small>
          </label>

          <div class="field field-color">
            <span>卡片文字颜色</span>
            <ColorAlphaInput
              bind:value={form.card_text_color}
              on:change={() => void syncForm()}
              placeholder="留空则跟随主题"
              inputLabel="卡片文字颜色值"
              swatchTitle="选择卡片文字颜色"
              alphaText="卡片文字透明度"
            />
            <small>留空时分别使用适合浅色和深色模式的高对比文字。</small>
          </div>
        </div>
      </div>

      <label class="toggle-field icon-title-toggle" class:disabled={form.card_style !== 'icon'}>
        <div class="toggle-copy">
          <span>显示极简卡片标题</span>
          <p>在图标下方显示书签名称，仅对极简风格生效。</p>
        </div>
        <input
          type="checkbox"
          bind:checked={form.card_icon_show_title}
          disabled={saving || form.card_style !== 'icon'}
        />
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

  .description-mode-field.disabled {
    opacity: 0.58;
  }

  .description-mode-field small {
    color: var(--sp-muted);
  }

  .card-advanced {
    display: grid;
    gap: 18px;
    border-top: 1px solid var(--sp-subsection-border);
    padding-top: 18px;
  }

  .field-number,
  .card-size-grid .field-number,
  .field-color,
  .card-appearance-grid .field-color,
  .card-appearance-grid .field-range {
    grid-column: span 4;
  }

  .icon-title-toggle {
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 960px) {
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 620px) {
    .radio-group.compact {
      grid-template-columns: 1fr;
    }
  }

  @container settings-editor (max-width: 640px) {
    .field-number,
    .field-color,
    .card-size-grid .field-number,
    .card-appearance-grid .field-color,
    .card-appearance-grid .field-range {
      grid-column: 1 / -1;
    }
  }

  @container settings-editor (max-width: 520px) {
    .radio-group.compact {
      grid-template-columns: 1fr;
    }
  }
</style>
