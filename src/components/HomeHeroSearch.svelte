<script lang="ts">
  import type { PublicSettings } from '../../shared/types'
  import SearchBox from './SearchBox.svelte'

  export let pageTitle = ''
  export let siteTitleColor = 'inherit'
  export let siteTitleFontSize = 32
  export let settings: PublicSettings | null = null
  export let query = ''
  export let topNavigation = false
  export let preview = false
  export let themeOverride: 'light' | 'dark' | null = null
</script>

<section
  class="hero-search"
  class:top-navigation={topNavigation}
  class:preview
  class:preview-light={preview && themeOverride === 'light'}
  aria-label="站点搜索"
>
  <h1 class="site-title" style="color: {siteTitleColor}; font-size: {siteTitleFontSize}px;">{pageTitle}</h1>
  {#if settings?.search_box_show ?? true}
    <div class="search-card">
      <SearchBox
        searchEngine={settings?.search_engine ?? null}
        bind:query
        showEngineSelector={settings?.search_engine_selector_show ?? true}
        {preview}
        {themeOverride}
      />
    </div>
  {/if}
</section>

<style>
  .hero-search {
    display: grid;
    gap: 0.85rem;
    max-width: 680px;
    margin: calc(3rem + var(--content-margin-top, 0%)) auto 1.25rem;
    text-align: center;
  }

  .hero-search.top-navigation {
    margin-top: calc(3.5rem + var(--content-margin-top, 0%));
  }

  .site-title {
    margin: 0;
    font-weight: 700;
    line-height: 1.1;
    overflow-wrap: anywhere;
    text-shadow: 0 2px 12px rgba(15, 23, 42, 0.22);
  }

  .search-card {
    max-width: 680px;
    margin: 0;
    padding: 0.75rem 1rem;
    border-radius: 1.5rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(255, 255, 255, 0.68);
  }

  :global([data-theme='dark']) .search-card {
    border-color: transparent;
    background: transparent;
  }

  .hero-search.preview {
    gap: 0.65rem;
    width: min(100%, 34rem);
    margin: calc(1.5rem + var(--content-margin-top, 0%)) auto 1rem;
    padding: 0 0.75rem;
    box-sizing: border-box;
  }

  .hero-search.preview.top-navigation {
    margin-top: calc(3.2rem + var(--content-margin-top, 0%));
  }

  .hero-search.preview .search-card {
    padding: 0.55rem;
    border-radius: 1rem;
  }

  .hero-search.preview-light .search-card {
    border-color: rgba(148, 163, 184, 0.18);
    background: rgba(255, 255, 255, 0.68);
  }

  @media (max-width: 720px) {
    .hero-search {
      gap: 0.75rem;
      margin-top: 3.5rem;
      padding: 0 0.25rem;
    }

    .hero-search.top-navigation {
      margin-top: 3rem;
    }

    .search-card {
      margin-top: 0.75rem;
      padding: 0.6rem;
      border-radius: 1rem;
    }
  }

  @media (max-width: 420px) {
    .search-card {
      padding: 0.55rem;
      border-radius: 0.95rem;
    }
  }
</style>
