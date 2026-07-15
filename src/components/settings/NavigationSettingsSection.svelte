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

<fieldset id="settings-section-layout" class="group group-wide" disabled={saving}>
  <legend>布局与导航</legend>
  <p class="group-desc">决定首页分类导航的位置，以及内容区域的宽度和留白。</p>

  <div class="settings-subsection">
    <h3>分类导航</h3>
    <div class="navigation-grid">
      <div class="field">
        <span class="field-label">显示位置</span>
        <div class="segmented-control" role="radiogroup" aria-label="导航栏显示位置">
          <label class:active={form.navigation.position === 'left'}>
            <input
              type="radio"
              bind:group={form.navigation.position}
              value="left"
              on:change={() => void syncForm()}
            />
            <span>左侧悬浮</span>
          </label>
          <label class:active={form.navigation.position === 'top'}>
            <input
              type="radio"
              bind:group={form.navigation.position}
              value="top"
              on:change={() => void syncForm()}
            />
            <span>顶部固定</span>
          </label>
        </div>
        <small>左侧：悬停展开的浮动导航；顶部：固定悬浮条，分类较多时可横向滚动。</small>
      </div>

      <div class="toggle-field" class:disabled={form.navigation.position !== 'left'}>
        <label class="toggle-copy" for="settings-navigation-always-expanded">
          <span>左侧导航始终展开</span>
          <p>桌面端固定占位显示完整分类列表，访客仍可在首页手动收起。仅左侧模式生效。</p>
        </label>
        <input
          id="settings-navigation-always-expanded"
          bind:checked={form.navigation.always_expanded}
          on:change={() => void syncForm()}
          type="checkbox"
          disabled={saving || form.navigation.position !== 'left'}
        />
      </div>
    </div>
  </div>

  <div class="settings-subsection">
    <h3>内容区域</h3>
    <div class="settings-grid content-layout-grid">
      <label class="field field-size">
        <span>最大宽度</span>
        <div class="inline-input">
          <input
            bind:value={form.content_layout.max_width}
            type="number"
            min="40"
            max="2400"
            step="10"
            on:input={() => void syncForm()}
          />
          <select
            bind:value={form.content_layout.max_width_unit}
            class="unit-select"
            aria-label="最大宽度单位"
            on:change={() => void syncForm()}
          >
            <option value="px">px</option>
            <option value="%">%</option>
          </select>
        </div>
        <small>首页书签内容区的最大宽度，宽屏下超出部分左右留白。</small>
      </label>

      <label class="field field-range">
        <span>左右边距 <em>{form.content_layout.margin_x}px</em></span>
        <input
          bind:value={form.content_layout.margin_x}
          type="range"
          min="0"
          max="100"
          step="1"
          on:input={() => void syncForm()}
        />
        <small>内容区两侧额外留白。</small>
      </label>

      <label class="field field-range">
        <span>顶部边距 <em>{form.content_layout.margin_top}%</em></span>
        <input
          bind:value={form.content_layout.margin_top}
          type="range"
          min="0"
          max="50"
          step="1"
          on:input={() => void syncForm()}
        />
        <small>标题距页面顶部的距离。</small>
      </label>

      <label class="field field-range">
        <span>底部边距 <em>{form.content_layout.margin_bottom}%</em></span>
        <input
          bind:value={form.content_layout.margin_bottom}
          type="range"
          min="0"
          max="50"
          step="1"
          on:input={() => void syncForm()}
        />
        <small>页面底部预留的空白。</small>
      </label>
    </div>
  </div>
</fieldset>

<style>
  .navigation-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(300px, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .field-size,
  .content-layout-grid .field-range {
    grid-column: span 3;
  }

  .segmented-control {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .segmented-control label {
    min-height: 36px;
  }

  @media (max-width: 960px) {
    .navigation-grid {
      grid-template-columns: 1fr;
    }

    .field-size,
    .content-layout-grid .field-range {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 720px) {
    .inline-input {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
