<script lang="ts">
  import { LOGO_SURF_COLOR_SCHEMES, type LogoSurfColorScheme } from '../lib/icons'
  import type { AsyncVoid } from '../../shared/types'

  interface LogoSchemeSelectorProps {
    selectedLogoSchemeName?: string
    iconSource?: string
    currentLogoScheme: LogoSurfColorScheme
    logoPreviewText?: string
    /** 选择配色回调 */
    onSelectScheme?: (scheme: LogoSurfColorScheme) => AsyncVoid
  }

  let {
    selectedLogoSchemeName = '',
    iconSource = '',
    currentLogoScheme,
    logoPreviewText = 'NAV',
    onSelectScheme,
  }: LogoSchemeSelectorProps = $props()
</script>

<div class="logo-scheme-section field-wide">
  <div class="scheme-header">
    <span class="field-label">文字图标配色</span>
    <span class="scheme-current">{currentLogoScheme.bgColor} / {currentLogoScheme.textColor}</span>
  </div>
  <div class="logo-scheme-grid">
    {#each LOGO_SURF_COLOR_SCHEMES as scheme}
      <button
        type="button"
        class="scheme-button"
        class:selected={selectedLogoSchemeName === scheme.name && iconSource === 'logo_surf'}
        onclick={() => onSelectScheme?.(scheme)}
        title={`${scheme.name}: ${scheme.bgColor} / ${scheme.textColor}`}
      >
        <span class="scheme-preview" style="background: {scheme.bgColor}; color: {scheme.textColor};">
          {logoPreviewText}
        </span>
        <span class="scheme-name">{scheme.name}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .field-wide,
  .logo-scheme-section {
    grid-column: 1 / -1;
  }

  .field-label {
    color: #334155;
    font-size: 13px;
    font-weight: 600;
  }

  .logo-scheme-section {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  .scheme-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .scheme-current {
    color: #64748b;
    font-size: 12px;
  }

  .logo-scheme-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    max-height: 154px;
    overflow-y: auto;
    overscroll-behavior: auto;
    padding-right: 2px;
  }

  .scheme-button {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-height: 34px;
    padding: 5px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    background: #ffffff;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
    text-align: left;
  }

  .scheme-button:hover {
    border-color: #93c5fd;
    background: #f8fbff;
  }

  .scheme-button.selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .scheme-preview {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
  }

  .scheme-name {
    min-width: 0;
    color: #475569;
    font-size: 9.5px;
    line-height: 1.2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .scheme-button.selected .scheme-name {
    color: #1e40af;
    font-weight: 600;
  }

  @media (max-width: 500px) {
    .logo-scheme-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .scheme-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
