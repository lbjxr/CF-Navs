<script lang="ts">
  import type { BookmarkFormValue } from '../lib/adminTypes'
  import type { AsyncVoid } from '../../shared/types'
  import {
    canPreviewIcon,
    canPreviewIconAsImage,
    getFormIconPreviewUrl,
    getTextIconPreview,
  } from '../lib/bookmarkFormIcons'


  export let form: BookmarkFormValue
  export let iconifyName = ''
  export let imageHostUrl = ''
  export let loading = false
  export let faviconError = ''
  export let onIconInput: ((value: string) => AsyncVoid) | undefined = undefined
  export let onOpenImageHost: (() => AsyncVoid) | undefined = undefined

  function handleIconInput(event: Event) {
    const nextIcon = (event.currentTarget as HTMLInputElement).value
    void onIconInput?.(nextIcon)
  }

  function handleOpenImageHost() {
    void onOpenImageHost?.()
  }
</script>

<label class="field-wide">
  <span>自定义图标 / 手动输入</span>
  <div class="icon-row">
    <input
      value={form.icon}
      type="text"
      placeholder="图标 URL / 表情，如 ⭐"
      on:input={handleIconInput}
    />
    {#if form.icon && canPreviewIcon(form.icon)}
      <span class="icon-preview" title="图标预览">
        {#if canPreviewIconAsImage(form.icon)}
          <img src={getFormIconPreviewUrl(form, iconifyName)} alt="图标预览" />
        {:else}
          <span class="icon-preview-text">{getTextIconPreview(form.icon)}</span>
        {/if}
      </span>
    {/if}
    {#if imageHostUrl}
      <button
        type="button"
        class="ghost-button upload-button"
        on:click={handleOpenImageHost}
        disabled={loading}
        title="打开图床上传图标"
      >
        打开图床 ↗
      </button>
    {/if}
  </div>
  {#if faviconError}
    <small class="field-error">{faviconError}</small>
  {/if}
</label>

<style>
  .field-wide {
    grid-column: 1 / -1;
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .icon-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content max-content;
    gap: 6px;
    align-items: center;
  }

  input {
    width: 100%;
    min-width: 0;
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

  .ghost-button {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    padding: 7px 12px;
    transition: var(--transition-base);
  }

  .ghost-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .upload-button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .icon-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #f8fafc;
    box-sizing: border-box;
  }

  .icon-preview img {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    object-fit: cover;
  }

  .icon-preview-text {
    max-width: 100%;
    color: #475569;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-error {
    margin: 0;
    color: #dc2626;
    font-size: 12px;
    line-height: 1.35;
  }

  @media (max-width: 500px) {
    .field-wide {
      grid-column: 1 / -1;
    }

    .icon-row {
      align-items: stretch;
      grid-template-columns: minmax(0, 1fr) 32px;
    }

    .icon-row .upload-button {
      grid-column: 1 / -1;
    }
  }
</style>
