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

<fieldset class="group group-wide" disabled={saving}>
  <legend>导航栏</legend>

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
          <span>左侧</span>
        </label>
        <label class:active={form.navigation.position === 'top'}>
          <input
            type="radio"
            bind:group={form.navigation.position}
            value="top"
            on:change={() => void syncForm()}
          />
          <span>顶部</span>
        </label>
      </div>
      <small>顶部导航固定悬浮，分类较多时可横向滚动。</small>
    </div>

    <div class="toggle-field" class:disabled={form.navigation.position !== 'left'}>
      <label class="toggle-copy" for="settings-navigation-always-expanded">
        <span>始终展开</span>
        <p>仅桌面左侧模式生效，仍可在首页手动收缩。</p>
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
</fieldset>

<style>
  .group {
    position: relative;
    grid-column: 1 / -1;
    border: 1px solid var(--sp-group-border);
    border-radius: 14px;
    padding: 16px 16px 16px 18px;
    margin: 0;
    min-width: 0;
    background: var(--sp-group-bg);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 0 rgba(255, 255, 255, 0.72) inset;
  }

  .group::before {
    content: '';
    position: absolute;
    left: 0;
    top: 18px;
    bottom: 18px;
    width: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sp-accent) 52%, transparent);
  }

  .group legend {
    padding: 0 7px;
    margin-left: -4px;
    font-size: 13px;
    font-weight: 700;
    color: var(--sp-strong);
  }

  .navigation-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(300px, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .field,
  .toggle-field,
  .toggle-copy {
    display: grid;
    gap: 6px;
  }

  .field-label,
  .toggle-copy span {
    color: var(--sp-label);
    font-size: 14px;
    font-weight: 600;
  }

  small,
  .toggle-copy p {
    margin: 0;
    color: var(--sp-muted);
    line-height: 1.55;
  }

  .segmented-control {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    border: 1px solid var(--sp-input-border);
    border-radius: 11px;
    padding: 4px;
    background: var(--sp-input-bg);
  }

  .segmented-control label {
    position: relative;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--sp-muted);
    cursor: pointer;
    transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }

  .segmented-control label.active {
    background: var(--sp-chip-bg);
    color: var(--sp-chip-text);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }

  .segmented-control input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segmented-control label:focus-within {
    outline: 2px solid var(--sp-accent);
    outline-offset: 1px;
  }

  .toggle-field {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--sp-toggle-border);
    border-radius: 14px;
    padding: 14px;
    background: var(--sp-toggle-bg);
    transition: opacity 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  }

  .toggle-field:not(.disabled):hover {
    border-color: color-mix(in srgb, var(--sp-accent) 32%, var(--sp-toggle-border));
    background: var(--sp-toggle-hover-bg);
  }

  .toggle-field.disabled {
    opacity: 0.58;
  }

  .toggle-field input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--sp-accent);
    cursor: pointer;
  }

  @media (max-width: 960px) {
    .navigation-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
