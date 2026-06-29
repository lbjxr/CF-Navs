<script lang="ts">
  import type { SearchEngineSetting } from '../../shared/types'

  export let searchEngine: SearchEngineSetting | null = null
  export let query = ''
  export let showEngineSelector = true

  let selectedName = ''

  $: engines = searchEngine?.engines ?? []

  $: if (engines.length === 0) {
    selectedName = ''
  } else if (!engines.some((engine) => engine.name === selectedName)) {
    selectedName = engines.find((engine) => engine.name === searchEngine?.current)?.name ?? engines[0].name
  }

  $: currentEngine = engines.find((engine) => engine.name === selectedName) ?? null

  function handleSubmit() {
    const keyword = query.trim()

    if (!keyword || !currentEngine) {
      return
    }

    const targetUrl = currentEngine.url_template.replaceAll('{q}', encodeURIComponent(keyword))
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }
</script>

<form class="search-box" on:submit|preventDefault={handleSubmit}>
  <label class="sr-only" for="search-query">搜索关键词</label>
  <input
    id="search-query"
    bind:value={query}
    class="search-input"
    type="search"
    placeholder="输入关键词搜索"
    autocomplete="off"
  />

  <label class="sr-only" for="search-engine">搜索引擎</label>
  {#if showEngineSelector}
    <select
      id="search-engine"
      bind:value={selectedName}
      class="search-select"
      disabled={engines.length === 0}
    >
      {#if engines.length === 0}
        <option value="">未配置</option>
      {:else}
        {#each engines as engine}
          <option value={engine.name}>{engine.name}</option>
        {/each}
      {/if}
    </select>
  {/if}

  <button class="search-button" type="submit" disabled={!currentEngine || !query.trim()}>
    搜索
  </button>
</form>

<style>
  .search-box {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 80px;
    gap: 0.6rem;
    align-items: center;
  }

  .search-box:has(.search-select) {
    grid-template-columns: minmax(0, 1fr) 140px 80px;
  }

  .search-input,
  .search-select,
  .search-button {
    height: 2.8rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    font: inherit;
    font-size: 0.95rem;
  }

  .search-input,
  .search-select {
    padding: 0 0.8rem;
    background: rgba(255, 255, 255, 0.82);
    color: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .search-input:focus,
  .search-select:focus {
    outline: 2px solid rgba(59, 130, 246, 0.18);
    outline-offset: 1px;
    border-color: rgba(59, 130, 246, 0.45);
  }

  .search-button {
    cursor: pointer;
    background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
    color: #fff;
    font-weight: 600;
  }

  .search-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  /* 暗色主题 */
  :global([data-theme='dark']) .search-input,
  :global([data-theme='dark']) .search-select {
    background: rgba(15, 23, 42, 0.6);
    border-color: rgba(148, 163, 184, 0.28);
    color: #e5eefb;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  :global([data-theme='dark']) .search-input::placeholder {
    color: rgba(148, 163, 184, 0.7);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 720px) {
    .search-box {
      grid-template-columns: 1fr;
    }
  }
</style>
