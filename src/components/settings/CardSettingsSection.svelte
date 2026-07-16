<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import ColorAlphaInput from '../ColorAlphaInput.svelte'

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
  <legend>卡片样式</legend>
  <p class="group-desc">书签卡片的风格、密度和毛玻璃外观。选择配色方案后会自动匹配一组推荐值。</p>

  <div class="settings-subsection">
    <h3>卡片风格</h3>
    <div class="radio-group">
      <label class="radio-option">
        <input type="radio" bind:group={form.card_style} value="info" />
        <div class="radio-content">
          <strong>详情风格</strong>
          <p>横向卡片，显示图标、标题和描述，适合站点较多说明的场景。</p>
        </div>
      </label>

      <label class="radio-option">
        <input type="radio" bind:group={form.card_style} value="icon" />
        <div class="radio-content">
          <strong>极简风格</strong>
          <p>方形图标网格，仅显示图标和标题，一屏可容纳更多站点。</p>
        </div>
      </label>
    </div>

    {#if form.card_style === 'info'}
      <div class="description-mode-field">
        <span>描述显示策略</span>
        <div class="radio-group compact">
          <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="always" /><span>始终显示</span></label>
          <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hover" /><span>悬停显示</span></label>
          <label class="radio-option"><input type="radio" bind:group={form.card_description_mode} value="hidden" /><span>隐藏</span></label>
        </div>
        <small>旧版“显示描述”设置会自动映射为始终显示或隐藏。</small>
      </div>
    {/if}

    {#if form.card_style === 'icon'}
      <label class="checkbox-field style-option">
        <input type="checkbox" bind:checked={form.card_icon_show_title} />
        <span>在图标下方显示书签标题</span>
      </label>
    {/if}
  </div>

  <div class="settings-subsection">
    <h3>尺寸与密度</h3>
    <div class="settings-grid card-size-grid">
      <label class="field field-number">
        <span>卡片最小宽度 (px)</span>
        <input bind:value={form.card_size.width} type="number" min="80" max="400" step="10" />
        <small>数值越小一行能排下越多卡片，推荐 80。</small>
      </label>
      <label class="field field-number">
        <span>卡片最小高度 (px)</span>
        <input bind:value={form.card_size.height} type="number" min="0" max="300" step="10" />
        <small>详情风格卡片的最小高度，推荐 60。</small>
      </label>
      <label class="field field-number">
        <span>图标大小 (px)</span>
        <input bind:value={form.card_icon_size} type="number" min="40" max="100" step="5" />
        <small>卡片内站点图标的边长，推荐 60。</small>
      </label>
    </div>
  </div>

  <div class="settings-subsection">
    <h3>毛玻璃外观</h3>
    <div class="settings-grid card-appearance-grid">
      <div class="field field-color">
        <span>卡片底色</span>
        <ColorAlphaInput
          bind:value={form.card_background_color}
          bind:alpha={form.card_background_opacity}
          on:change={() => void syncForm()}
          placeholder="#ffffff"
          inputLabel="卡片颜色值"
          swatchTitle="选择卡片颜色"
          alphaText="卡片透明度"
        />
        <small>毛玻璃卡片的基础色，深色模式会自动转为深色玻璃并保留此色调。</small>
      </div>

      <label class="field field-range">
        <span>卡片透明度 <em>{form.card_background_opacity.toFixed(2)}</em></span>
        <input bind:value={form.card_background_opacity} type="range" min="0" max="1" step="0.05" />
        <small>越低越通透，能看到更多背景色彩；推荐 0.35-0.55。</small>
      </label>

      <div class="field field-color">
        <span>卡片文字颜色</span>
        <ColorAlphaInput
          bind:value={form.card_text_color}
          on:change={() => void syncForm()}
          placeholder="留空则跟随主题"
          inputLabel="卡片文字颜色值"
          swatchTitle="选择卡片文字颜色"
          alphaText="文字透明度"
        />
        <small>留空时亮暗模式各自使用高对比默认色，一般无需修改。</small>
      </div>
    </div>
  </div>
</fieldset>

<style>
  .field-number,
  .card-size-grid .field-number {
    grid-column: span 4;
  }

  .field-color,
  .card-appearance-grid .field-color,
  .card-appearance-grid .field-range {
    grid-column: span 4;
  }

  .radio-content p {
    margin: 0;
    font-size: 13px;
  }
  .radio-group {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .radio-option {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border: 1px solid var(--sp-radio-border);
    border-radius: 12px;
    background: var(--sp-toggle-bg);
    cursor: pointer;
    transition: all 0.18s ease;
  }

  .radio-option:hover {
    border-color: var(--sp-accent);
    background: var(--sp-toggle-hover-bg);
  }

  .radio-option input[type='radio'] {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--sp-accent);
  }

  .radio-content {
    display: grid;
    gap: 4px;
  }

  .radio-content strong {
    color: var(--sp-strong);
    font-size: 14px;
  }

  .radio-content p {
    margin: 0;
    font-size: 13px;
  }

  .checkbox-field {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--sp-label);
    font-size: 14px;
  }

  .checkbox-field input[type='checkbox'] {
    accent-color: var(--sp-accent);
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
</style>
