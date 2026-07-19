<script lang="ts">
  import type { CategoryIconValue } from '../lib/categoryIconDisplay'
  import {
    getCategoryIconFallbackText,
    getCategoryImageIconUrl,
    getCategoryTextIcon,
    normalizeCategoryIcon,
  } from '../lib/categoryIconDisplay'

  export let category: CategoryIconValue
  export let size = 36
  export let className = ''
  export let label = ''

  let imageFailed = false
  let stateKey = ''

  $: iconValue = normalizeCategoryIcon(category)
  $: imageUrl = getCategoryImageIconUrl(category)
  $: textIcon = getCategoryTextIcon(category)
  $: if (`${category.id}:${iconValue}:${category.title}` !== stateKey) {
    stateKey = `${category.id}:${iconValue}:${category.title}`
    imageFailed = false
  }

  function handleImageError(): void {
    imageFailed = true
  }
</script>

{#if iconValue}
  <span
    class={`category-icon ${className}`.trim()}
    style={`--category-icon-size: ${size}px`}
    data-category-icon
    aria-hidden={label ? undefined : 'true'}
    aria-label={label || undefined}
  >
    {#if imageUrl && !imageFailed}
      <img src={imageUrl} alt="" loading="lazy" decoding="async" on:error={handleImageError} />
    {:else if textIcon}
      <span class="category-icon-text">{textIcon}</span>
    {:else}
      <span class="category-icon-text category-icon-fallback">{getCategoryIconFallbackText(category)}</span>
    {/if}
  </span>
{/if}

<style>
  .category-icon {
    width: var(--category-icon-size, 36px);
    height: var(--category-icon-size, 36px);
    min-width: var(--category-icon-size, 36px);
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--home-text-color, #0f172a) 14%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--home-stat-bg, rgba(255, 255, 255, 0.5)) 84%, transparent);
    color: var(--home-text-color, #0f172a);
    line-height: 1;
  }

  .category-icon img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .category-icon-text {
    max-width: 100%;
    padding: 0.15em;
    overflow: hidden;
    font-size: min(1.35rem, calc(var(--category-icon-size, 36px) * 0.55));
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-icon-fallback {
    font-size: min(1rem, calc(var(--category-icon-size, 36px) * 0.42));
    opacity: 0.68;
  }
</style>
