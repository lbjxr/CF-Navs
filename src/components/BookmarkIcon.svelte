<script lang="ts">
  type AsyncVoid<T = void> = T | Promise<T>

  export let title = ''
  export let iconUrl = ''
  export let iconText = ''
  export let size = 0
  export let iconStyle = ''
  export let hasCustomBackground = false
  export let variant: 'info' | 'compact' = 'info'
  export let onError: (() => AsyncVoid) | undefined = undefined
  export let onLoad: (() => AsyncVoid) | undefined = undefined

  function handleError() {
    void onError?.()
  }

  function handleLoad() {
    void onLoad?.()
  }
</script>

<div
  class="bookmark-icon"
  class:has-custom-background={hasCustomBackground}
  class:is-info={variant === 'info'}
  class:is-compact={variant === 'compact'}
  style={iconStyle}
>
  {#if iconUrl}
    <img
      src={iconUrl}
      alt={title}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      fetchpriority="low"
      on:error={handleError}
      on:load={handleLoad}
    />
  {:else}
    <span class="icon-text">{iconText}</span>
  {/if}
</div>

<style>
  .bookmark-icon {
    box-sizing: border-box;
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: var(--bookmark-icon-radius, 12px);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.62)),
      rgba(255, 255, 255, 0.52);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.5),
      0 1px 4px rgba(15, 23, 42, 0.06);
  }

  .bookmark-icon.has-custom-background {
    border-color: rgba(15, 23, 42, 0.08);
  }

  .bookmark-icon.is-info {
    align-self: center;
  }

  .bookmark-icon img {
    display: block;
    width: calc(100% - (var(--bookmark-icon-padding, 8px) * 2));
    height: calc(100% - (var(--bookmark-icon-padding, 8px) * 2));
    border-radius: var(--bookmark-icon-image-radius, 8px);
    object-fit: contain;
  }

  .bookmark-icon .icon-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
    font-size: var(--bookmark-icon-font-size, 1.75rem);
    font-weight: 600;
    color: #475569;
  }

  :global([data-theme='dark']) .bookmark-icon {
    border-color: rgba(148, 163, 184, 0.16);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(15, 23, 42, 0.2)),
      rgba(255, 255, 255, 0.08);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.14);
  }

  :global([data-theme='dark']) .bookmark-icon .icon-text {
    color: #cbd5e1;
  }
</style>
