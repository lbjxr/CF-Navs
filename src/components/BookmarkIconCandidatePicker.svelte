<script lang="ts">
  import type { BookmarkFormValue } from '../lib/adminTypes'
  import {
    getCandidatePreviewUrl,
    isCandidateSelected,
  } from '../lib/bookmarkFormIcons'
  import type { IconCandidate } from '../lib/icons'
  import BookmarkIconCandidateButton from './BookmarkIconCandidateButton.svelte'
  import type { AsyncVoid } from '../../shared/types'


  export let candidates: IconCandidate[] = []
  export let form: BookmarkFormValue
  export let urlFilled = false
  export let onSelect: ((candidate: IconCandidate) => AsyncVoid) | undefined = undefined

  function handleSelect(candidate: IconCandidate) {
    void onSelect?.(candidate)
  }
</script>

<div class="icon-picker-section field-compact">
  <span class="field-label">选择图标</span>

  {#if candidates.length > 0}
    <div class="icon-candidates">
      {#each candidates as candidate}
        <BookmarkIconCandidateButton
          selected={isCandidateSelected(candidate, form)}
          title={candidate.label}
          imageUrl={getCandidatePreviewUrl(candidate)}
          imageAlt={candidate.label}
          label={candidate.label}
          onSelect={() => handleSelect(candidate)}
        />
      {/each}
    </div>
  {:else if urlFilled}
    <p class="hint-text">请输入有效链接以生成图标候选</p>
  {:else}
    <p class="hint-text">填写链接地址后将自动生成图标选项</p>
  {/if}
</div>

<style>
  .field-compact {
    grid-column: span 1;
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

  .icon-picker-section {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  .icon-candidates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }

  @media (max-width: 500px) {
    .field-compact {
      grid-column: 1 / -1;
    }

    .icon-candidates {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
