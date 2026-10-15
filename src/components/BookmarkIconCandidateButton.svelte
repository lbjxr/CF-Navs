<script lang="ts">
  import type { AsyncVoid } from '../../shared/types'

  interface BookmarkIconCandidateButtonProps {
    selected?: boolean
    title?: string
    imageUrl?: string
    imageAlt?: string
    label?: string
    onSelect?: () => AsyncVoid
  }

  let {
    selected = false,
    title = '',
    imageUrl = '',
    imageAlt = '',
    label = '',
    onSelect = undefined,
  }: BookmarkIconCandidateButtonProps = $props()
</script>

<button
  type="button"
  class="candidate-card"
  class:selected
  onclick={() => onSelect?.()}
  {title}
>
  <img src={imageUrl} alt={imageAlt || label} loading="lazy" />
  <span class="candidate-label">{label}</span>
</button>

<style>
  .candidate-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 46px;
    padding: 4px;
    border: 2px solid #e2e8f0;
    border-radius: 9px;
    background: #ffffff;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }

  .candidate-card:hover {
    border-color: #93c5fd;
    background: #f0f5ff;
  }

  .candidate-card.selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .candidate-card img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    border-radius: 6px;
  }

  .candidate-label {
    font-size: 10px;
    color: #475569;
    text-align: center;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .candidate-card.selected .candidate-label {
    color: #1e40af;
    font-weight: 600;
  }
</style>
