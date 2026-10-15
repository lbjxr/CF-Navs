<script lang="ts">
  import type { AsyncVoid, IconifyCandidate } from '../../shared/types'
  import BookmarkIconCandidateButton from './BookmarkIconCandidateButton.svelte'

  interface IconifySelectorProps {
    /** 双向绑定：Iconify 图标名，父组件经 bind:iconifyName 回写 */
    iconifyName?: string
    iconifyPreviewUrl?: string
    iconifySelected?: boolean
    iconifyUseConfirmed?: boolean
    confirmedIconifyName?: string
    iconifySearchCandidates?: IconifyCandidate[]
    iconifySearchLoading?: boolean
    iconifySearchError?: string
    candidateError?: string
    loading?: boolean
    onOpenLibrary?: (() => AsyncVoid) | undefined
    onSelectIcon?: (() => AsyncVoid) | undefined
    onSelectCandidate?: ((candidate: IconifyCandidate) => AsyncVoid) | undefined
  }

  let {
    iconifyName = $bindable(''),
    iconifyPreviewUrl = '',
    iconifySelected = false,
    iconifyUseConfirmed = false,
    confirmedIconifyName = '',
    iconifySearchCandidates = [],
    iconifySearchLoading = false,
    iconifySearchError = '',
    candidateError = '',
    loading = false,
    onOpenLibrary = undefined,
    onSelectIcon = undefined,
    onSelectCandidate = undefined,
  }: IconifySelectorProps = $props()
</script>

<div class="iconify-section field-wide">
  <div class="scheme-header">
    <span class="field-label">Iconify 图标</span>
    <button type="button" class="text-link-button" onclick={() => onOpenLibrary?.()}>
      打开 Iconify 图标库
    </button>
  </div>
  <div class="iconify-row">
    <input
      bind:value={iconifyName}
      type="text"
      placeholder="例如 mdi:home、simple-icons:github 或 icon-sets 链接"
      aria-label="Iconify 图标名"
    />
    {#if iconifyPreviewUrl}
      <span class="iconify-preview">
        <img src={iconifyPreviewUrl} alt="Iconify 图标预览" />
      </span>
    {:else}
      <span class="iconify-preview iconify-preview--empty" aria-hidden="true"></span>
    {/if}
    <button
      type="button"
      class="ghost-button iconify-use-button"
      class:selected={iconifySelected}
      onclick={() => onSelectIcon?.()}
      aria-pressed={iconifySelected}
      disabled={loading || !iconifyPreviewUrl}
    >
      使用 Iconify
    </button>
  </div>
  <small class="hint-text">可从 icon-sets.iconify.design 复制图标名或完整图标页面链接，保存后会通过本地图标代理和浏览器缓存加载。</small>
  {#if iconifySearchCandidates.length > 0}
    <div class="iconify-candidates">
      {#each iconifySearchCandidates as candidate}
        <BookmarkIconCandidateButton
          selected={iconifyUseConfirmed && confirmedIconifyName === candidate.name}
          title={`${candidate.name} - ${candidate.collection}`}
          imageUrl={candidate.preview_url}
          imageAlt={candidate.name}
          label={candidate.name}
          onSelect={() => onSelectCandidate?.(candidate)}
        />
      {/each}
    </div>
  {:else if iconifySearchLoading}
    <small class="hint-text">Iconify 图标搜索中...</small>
  {:else if iconifySearchError}
    <small class="field-error">{iconifySearchError}</small>
  {/if}
  {#if candidateError}
    <small class="field-error">{candidateError}</small>
  {/if}
</div>

<style>
  .field-wide,
  .iconify-section {
    grid-column: 1 / -1;
  }

  .field-label {
    color: #334155;
    font-size: 13px;
    font-weight: 600;
  }

  .hint-text {
    margin: 0;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.35;
    padding: 2px 0;
  }

  .field-error {
    margin: 0;
    color: #dc2626;
    font-size: 12px;
    line-height: 1.35;
  }

  .scheme-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .iconify-section {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  .iconify-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px max-content;
    gap: 6px;
    align-items: center;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  input:focus-visible {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .iconify-preview {
    width: 30px;
    height: 30px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
  }

  .iconify-preview img {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }

  .iconify-preview--empty {
    opacity: 0.42;
    background:
      linear-gradient(45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(-45deg, #e2e8f0 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e2e8f0 75%),
      linear-gradient(-45deg, transparent 75%, #e2e8f0 75%);
    background-color: #f8fafc;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0;
    background-size: 10px 10px;
  }

  .iconify-candidates {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    max-height: 112px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }

  .ghost-button {
    border-radius: 10px;
    padding: 7px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: var(--transition-base);
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .ghost-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .iconify-use-button {
    border-color: #cbd5e1;
    background: #ffffff;
    color: #0f172a;
    box-shadow: none;
  }

  .iconify-use-button.selected {
    border-color: #2563eb;
    background: #2563eb;
    color: #ffffff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  }

  .iconify-use-button.selected:hover:not(:disabled) {
    border-color: #1d4ed8;
    background: #1d4ed8;
    color: #ffffff;
  }

  .text-link-button {
    border: 0;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 500px) {
    .iconify-candidates {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .scheme-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 4px;
    }

    .iconify-row {
      grid-template-columns: 1fr;
    }

    .iconify-preview {
      width: 100%;
    }
  }
</style>
