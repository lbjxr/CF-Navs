<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'
  import Switch from '../ui/Switch.svelte'
  import Tooltip from '../ui/Tooltip.svelte'
  import InputGroup from '../ui/InputGroup.svelte'
  import Slider from '../ui/Slider.svelte'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }

  $: isLeft = form.navigation.position === 'left'
  $: isTop = form.navigation.position === 'top'

  function setAlwaysExpanded(value: boolean): void {
    form.navigation.always_expanded = value
    void syncForm()
  }

  function setTopLayout(value: boolean): void {
    // Switch on = 分行显示(wrap)；off = 横向滚动(scroll)
    form.navigation.top_layout = value ? 'wrap' : 'scroll'
    void syncForm()
  }
</script>

<fieldset id="settings-section-layout" class="group group-wide" disabled={saving}>
  <legend>布局与导航</legend>
  <p class="group-desc">决定首页分类导航的位置，以及内容区域的宽度和留白。</p>

  <div class="settings-subsection">
    <h3>分类导航</h3>
    <div class="navigation-grid">
      <div class="field">
        <span class="field-label">显示位置 <Tooltip text="左侧：侧边悬浮展开；顶部：顶部吸顶横向滚动条。" /></span>
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
      </div>

      <div class="nav-switch-row" class:disabled={!isLeft}>
        <span class="nav-switch-copy">
          左侧导航始终展开
          <Tooltip text="在大屏下常驻展开分类列表。仅在「左侧悬浮」模式下生效。" />
        </span>
        <Switch
          checked={form.navigation.always_expanded}
          disabled={saving || !isLeft}
          ariaLabel="左侧导航始终展开"
          onchange={(next) => setAlwaysExpanded(next)}
        />
      </div>

      <div class="nav-switch-row" class:disabled={!isTop}>
        <span class="nav-switch-copy">
          分类分行显示
          <Tooltip text="开启后顶部分类换行平铺；关闭为横向滚动。分行仅在桌面/宽屏生效，移动端仍为横向滑动。仅「顶部固定」模式下生效。" />
        </span>
        <Switch
          checked={form.navigation.top_layout === 'wrap'}
          disabled={saving || !isTop}
          ariaLabel="顶部分类分行显示"
          onchange={(next) => setTopLayout(next)}
        />
      </div>
    </div>
  </div>

  <div class="settings-subsection">
    <h3>内容区域</h3>
    <div class="settings-grid content-layout-grid">
      <label class="field field-size" for="settings-content-max-width">
        <span>最大宽度 <Tooltip text="限制首页内容主体最大宽度，超宽屏下两边将自动留白居中。" /></span>
        <InputGroup
          inputId="settings-content-max-width"
          type="number"
          min={40}
          max={2400}
          step={10}
          bind:value={form.content_layout.max_width}
          ariaLabel="最大宽度"
          oninput={() => void syncForm()}
        >
          {#snippet suffix()}
          <select
            bind:value={form.content_layout.max_width_unit}
            class="unit-select native-select"
            aria-label="最大宽度单位"
            on:change={() => void syncForm()}
          >
            <option value="px">px</option>
            <option value="%">%</option>
          </select>
          {/snippet}
        </InputGroup>
      </label>

      <div class="field field-range">
        <Slider
          label="桌面左右边距"
          format="px"
          min={0}
          max={100}
          step={1}
          bind:value={form.content_layout.margin_x}
          oninput={() => void syncForm()}
        />
      </div>

      <div class="field field-range">
        <Slider
          label="顶部边距"
          format="percent"
          min={0}
          max={50}
          step={1}
          bind:value={form.content_layout.margin_top}
          oninput={() => void syncForm()}
        />
      </div>

      <div class="field field-range">
        <Slider
          label="底部边距"
          format="percent"
          min={0}
          max={50}
          step={1}
          bind:value={form.content_layout.margin_bottom}
          oninput={() => void syncForm()}
        />
      </div>
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

  /* 显示位置占整行，两个条件开关成对落在下一行，避免单个开关孤立留白 */
  .navigation-grid > .field {
    grid-column: 1 / -1;
  }

  .nav-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 12px;
    padding: 13px 15px;
    background: var(--sp-toggle-bg);
  }

  .nav-switch-row.disabled {
    opacity: 0.58;
  }

  .nav-switch-copy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
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

  @container settings-editor (max-width: 680px) {
    .navigation-grid {
      grid-template-columns: 1fr;
    }

    .field-size,
    .content-layout-grid .field-range {
      grid-column: 1 / -1;
    }
  }
</style>
