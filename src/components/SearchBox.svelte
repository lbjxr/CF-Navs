<svelte:options runes />

<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte'
  import type { SearchEngineSetting } from '../../shared/types'
  import { getSearchEngineNavigationIndex } from '../lib/searchEnginePicker'

  interface Props {
    searchEngine?: SearchEngineSetting | null
    /** HomeHeroSearch 以 `bind:query` 传入。 */
    query?: string
    showEngineSelector?: boolean
    preview?: boolean
    themeOverride?: 'light' | 'dark' | null
    onCompositionChange?: (active: boolean) => void
  }

  let {
    searchEngine = null,
    query = $bindable(''),
    showEngineSelector = true,
    preview = false,
    themeOverride = null,
    onCompositionChange,
  }: Props = $props()

  let selectedName = $state('')
  let engineMenuOpen = $state(false)
  let activeIndex = $state(0)
  let engineTrigger: HTMLButtonElement | null = $state(null)
  let engineMenu: HTMLDivElement | null = $state(null)
  let searchInput: HTMLInputElement | null = $state(null)
  const engineMenuId = $props.id()
  const searchHintId = `${engineMenuId}-hint`
  let queryComposing = false
  // Focus is local to the picker and does not commit an engine selection.
  let activeName = ''
  let focusVersion = 0
  let tabbingOut = false
  // 手动点选的引擎只在默认引擎不变时保持；默认引擎变更后让位于新默认值（Issue #25）。
  // 两者只在副作用与事件处理器里读写、不进模板，保持普通变量。
  let userSelected = false
  let lastDefaultEngine = ''

  const engines = $derived(searchEngine?.engines ?? [])
  const defaultEngineName = $derived(searchEngine?.current ?? '')

  // 以下三段与原 `$:` 同序、同在 DOM 更新前执行。原语句只依赖语法上出现的响应式变量：
  // 默认引擎变化时清除手动选择标记，让新默认值立即生效。
  $effect.pre(() => {
    const name = defaultEngineName
    if (name !== lastDefaultEngine) {
      lastDefaultEngine = name
      userSelected = false
    }
  })

  // 依赖 engines / defaultEngineName / selectedName（userSelected 是普通变量，选择引擎时 selectedName 同时变化会让本段重跑）。
  $effect.pre(() => {
    const list = engines
    const current = selectedName
    const fallbackName = defaultEngineName
    untrack(() => {
      if (list.length === 0) {
        selectedName = ''
      } else if (!userSelected || !list.some((engine) => engine.name === current)) {
        selectedName = list.find((engine) => engine.name === fallbackName)?.name ?? list[0].name
      }
    })
  })

  const currentEngine = $derived(engines.find((engine) => engine.name === selectedName) ?? null)

  $effect.pre(() => {
    const list = engines
    const selected = selectedName
    const available = showEngineSelector && !preview && list.length > 1
    const open = engineMenuOpen
    untrack(() => {
      const focusedOption = engineMenu?.contains(document.activeElement) ? document.activeElement : null
      if (!available) {
        if (!open) return
        closeEngineMenu()
        // A removed/disabled picker must not leave focus on a discarded option.
        const version = focusVersion
        if (focusedOption) void tick().then(() => {
          if (version === focusVersion && !engineMenuOpen && searchInput?.isConnected
            && (document.activeElement === focusedOption || document.activeElement === document.body)) searchInput.focus()
        })
        return
      }
      if (!open) return
      const name = list.some((engine) => engine.name === activeName) ? activeName : selected
      activeIndex = Math.max(0, list.findIndex((engine) => engine.name === name))
      activeName = list[activeIndex].name
      if (focusedOption) void revealEngineOption()
    })
  })

  function closeEngineMenu(focusTrigger = false) {
    engineMenuOpen = false
    focusVersion += 1
    tabbingOut = false
    if (focusTrigger && engineTrigger?.isConnected && !engineTrigger.disabled) engineTrigger.focus()
  }

  function focusEngineOption(index: number) {
    const option = engineMenu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]
    if (!option) return
    focusVersion += 1
    activeIndex = index
    activeName = engines[index]?.name ?? ''
    option.focus()
  }

  async function revealEngineOption() {
    const version = ++focusVersion
    await tick()
    if (version === focusVersion && engineMenuOpen && !preview && engineMenu?.isConnected) {
      focusEngineOption(activeIndex)
    }
  }

  $effect.pre(() => {
    if (preview) untrack(() => {
      if (queryComposing) handleCompositionChange(false)
    })
  })

  function isIconImage(icon: string | null | undefined): boolean {
    return /^(https?:\/\/|data:image\/)/i.test(icon?.trim() ?? '')
  }

  function getEngineIconText(name: string): string {
    return name.trim().slice(0, 1).toUpperCase() || '?'
  }

  function toggleEngineMenu() {
    if (preview || engines.length <= 1) return
    if (engineMenuOpen) {
      closeEngineMenu()
      return
    }
    openEngineMenu()
  }

  function openEngineMenu() {
    if (preview || !showEngineSelector || engines.length <= 1) return
    activeIndex = Math.max(0, engines.findIndex((engine) => engine.name === selectedName))
    activeName = engines[activeIndex].name
    tabbingOut = false
    engineMenuOpen = true
    void revealEngineOption()
  }

  function selectEngine(name: string) {
    if (preview || !engines.some((engine) => engine.name === name)) return
    selectedName = name
    userSelected = true
    closeEngineMenu(true)
  }

  function handlePickerKeydown(event: KeyboardEvent, optionIndex?: number) {
    if (event.isComposing || event.keyCode === 229) return
    tabbingOut = event.key === 'Tab'
    if (event.key === 'Escape' && engineMenuOpen) {
      event.preventDefault()
      event.stopPropagation()
      closeEngineMenu(true)
      return
    }

    if (optionIndex == null) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        openEngineMenu()
      }
      return
    }
    const nextIndex = getSearchEngineNavigationIndex(event.key, optionIndex, engines.length)
    if (nextIndex == null) return
    event.preventDefault()
    focusEngineOption(nextIndex)
  }

  function handleOptionFocus(index: number) {
    activeIndex = index
    activeName = engines[index]?.name ?? ''
  }

  function handlePickerKeyup(event: KeyboardEvent) {
    if (event.key === 'Tab') tabbingOut = false
  }

  function handlePickerFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget
    if (!tabbingOut && nextTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    // Let Tab choose its native next target before removing the focused option.
    closeEngineMenu()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (preview || queryComposing) return
    const keyword = query.trim()

    if (!keyword || !currentEngine) {
      return
    }

    const targetUrl = currentEngine.url_template.replaceAll('{q}', encodeURIComponent(keyword))
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  function handleCompositionChange(active: boolean) {
    queryComposing = active
    onCompositionChange?.(active)
  }

  function handleQueryKeydown(event: KeyboardEvent) {
    // Ordinary Enter keeps the native implicit submit path; only an IME confirmation is blocked.
    if (event.key === 'Enter' && (queryComposing || event.isComposing || event.keyCode === 229)) event.preventDefault()
  }

  onDestroy(() => {
    closeEngineMenu()
    if (queryComposing) onCompositionChange?.(false)
  })
</script>

<form
  class="search-box"
  class:has-engine-selector={showEngineSelector}
  class:is-preview={preview}
  class:preview-light={preview && themeOverride === 'light'}
  onsubmit={handleSubmit}
>
  {#if showEngineSelector}
    <div class="engine-picker" onfocusout={handlePickerFocusOut}>
      <button
        type="button"
        class="engine-icon-button"
        bind:this={engineTrigger}
        aria-label={currentEngine ? `当前搜索引擎：${currentEngine.name}` : '选择搜索引擎'}
        aria-haspopup="listbox"
        aria-controls={engineMenuId}
        aria-expanded={engineMenuOpen}
        disabled={preview || engines.length === 0}
        title={currentEngine ? `搜索引擎：${currentEngine.name}` : '选择搜索引擎'}
        onclick={toggleEngineMenu}
        onkeydown={(event) => handlePickerKeydown(event)}
        onkeyup={handlePickerKeyup}
      >
        <span class="engine-current-icon" aria-hidden="true">
          {#if currentEngine && isIconImage(currentEngine.icon)}
            <img src={currentEngine.icon} alt="" loading="lazy" decoding="async" />
          {:else}
            <span>{getEngineIconText(currentEngine?.name ?? '')}</span>
          {/if}
        </span>
        <span class="engine-current-name">{currentEngine?.name ?? '未配置'}</span>
        <span class="engine-chevron" aria-hidden="true"></span>
      </button>

      {#if engineMenuOpen}
        <div class="engine-menu" id={engineMenuId} bind:this={engineMenu} role="listbox" aria-label="选择搜索引擎">
          {#each engines as engine, index}
            <button
              type="button"
              class="engine-menu-item"
              class:is-selected={engine.name === selectedName}
              role="option"
              tabindex={index === activeIndex ? 0 : -1}
              aria-selected={engine.name === selectedName}
              onclick={() => selectEngine(engine.name)}
              onkeydown={(event) => handlePickerKeydown(event, index)}
              onkeyup={handlePickerKeyup}
              onfocus={() => handleOptionFocus(index)}
            >
              <span class="engine-menu-icon" aria-hidden="true">
                {#if isIconImage(engine.icon)}
                  <img src={engine.icon} alt="" loading="lazy" decoding="async" />
                {:else}
                  {getEngineIconText(engine.name)}
                {/if}
              </span>
              <span class="engine-menu-name">{engine.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <label class="sr-only" for="search-query">搜索关键词</label>
  <input
    id="search-query"
    bind:this={searchInput}
    bind:value={query}
    class="search-input"
    type="search"
    placeholder="输入关键词筛选收藏"
    autocomplete="off"
    aria-describedby={searchHintId}
    readonly={preview}
    oncompositionstart={() => handleCompositionChange(true)}
    oncompositionend={() => handleCompositionChange(false)}
    onkeydown={handleQueryKeydown}
  />

  <button class="search-button" type="submit" aria-label={currentEngine ? `网页搜索：${currentEngine.name}` : '网页搜索：未配置引擎'} aria-describedby={searchHintId} disabled={preview || !currentEngine || !query.trim()}>
    <span class="search-button-text">网页搜索</span>
    <span class="search-button-mobile-text" aria-hidden="true">网页</span>
  </button>
  <p class="search-hint" id={searchHintId}>
    输入关键词筛选本站收藏。
    {#if currentEngine}点「网页搜索」使用 {currentEngine.name} 搜索网页，结果在新标签页打开。
    {:else}当前未配置网页搜索引擎。{/if}
    {#if preview}当前为只读预览。{/if}
  </p>
</form>

<style>
  .search-box {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 80px;
    gap: 0.6rem;
    align-items: center;
  }

  .search-box.has-engine-selector {
    grid-template-columns: 140px minmax(0, 1fr) 80px;
  }

  .search-hint { grid-column: 1 / -1; margin: 0; font-size: var(--font-size-base); line-height: 1.5; text-align: left; overflow-wrap: anywhere; }
  .search-box.preview-light .search-hint { color: #334155; }

  .search-input,
  .search-button {
    height: 2.8rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    font: inherit;
    font-size: 0.95rem;
  }

  .search-input {
    padding: 0 0.8rem;
    background-color: rgba(255, 255, 255, 0.82);
    color: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .engine-picker {
    position: relative;
    display: block;
    min-width: 0;
    height: 2.8rem;
  }

  .search-input:focus,
  .engine-icon-button:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.18);
    outline-offset: 1px;
    border-color: rgba(59, 130, 246, 0.45);
  }

  .search-button {
    cursor: pointer;
    white-space: nowrap;
    background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
    color: #fff;
    font-weight: 600;
  }

  .search-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .search-box.is-preview .search-button:disabled {
    background: var(--home-accent-color, #2563eb);
    color: #ffffff;
    opacity: 0.86;
  }

  .search-button-mobile-text {
    display: none;
  }

  .engine-icon-button,
  .engine-menu-item {
    font: inherit;
  }

  :global([data-background-preset^='paper-']) :is(.search-input, .engine-icon-button, .engine-menu) {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background-color: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    backdrop-filter: none;
  }

  :global([data-background-preset^='paper-']) .search-button {
    background: var(--home-accent-color);
  }

  :global([data-theme='dark'][data-background-preset^='paper-']) :is(.search-input, .engine-icon-button, .engine-menu) {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background-color: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    color: #e5eee2;
  }

  .engine-icon-button {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.82);
    color: inherit;
    cursor: pointer;
    display: grid;
    grid-template-columns: 1.7rem minmax(0, 1fr) 0.75rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.7rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
    text-align: left;
    transition:
      border-color var(--transition-base),
      background-color var(--transition-base),
      box-shadow var(--transition-base);
  }

  .engine-icon-button:hover:not(:disabled),
  .engine-icon-button[aria-expanded='true'] {
    border-color: rgba(59, 130, 246, 0.45);
    background-color: rgba(248, 250, 252, 0.94);
    box-shadow:
      0 0 0 3px rgba(59, 130, 246, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
  }

  .engine-current-icon img,
  .engine-menu-icon img {
    width: 1.25rem;
    height: 1.25rem;
    object-fit: contain;
  }

  .engine-current-icon,
  .engine-menu-icon {
    font-size: 0.86rem;
    font-weight: 700;
    line-height: 1;
  }

  .engine-current-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 0.5rem;
    background: rgba(226, 232, 240, 0.74);
    color: #1e293b;
  }

  .engine-current-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .engine-chevron {
    width: 0.48rem;
    height: 0.48rem;
    justify-self: end;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    opacity: 0.62;
    transform: translateY(-0.12rem) rotate(45deg);
    transition: transform var(--transition-base);
  }

  .engine-icon-button[aria-expanded='true'] .engine-chevron {
    transform: translateY(0.12rem) rotate(225deg);
  }

  .engine-menu {
    position: absolute;
    top: calc(100% + 0.45rem);
    left: 0;
    z-index: 60;
    width: 100%;
    min-width: 10.5rem;
    max-width: min(16rem, calc(100vw - 2rem));
    display: grid;
    gap: 0.25rem;
    padding: 0.35rem;
    border: 1px solid rgba(59, 130, 246, 0.28);
    border-radius: 0.85rem;
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 18px 38px rgba(15, 23, 42, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.7) inset;
    backdrop-filter: blur(12px);
  }

  .engine-menu-item {
    width: 100%;
    border: 0;
    border-radius: 0.65rem;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    display: grid;
    grid-template-columns: 1.7rem minmax(0, 1fr);
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.55rem;
    text-align: left;
  }

  .engine-menu-item:hover,
  .engine-menu-item.is-selected {
    background: rgba(37, 99, 235, 0.1);
  }

  .engine-menu-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 0.5rem;
    background: rgba(226, 232, 240, 0.74);
    color: #1e293b;
  }

  .engine-menu-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
    font-weight: 600;
  }

  /* 暗色主题 */
  :global([data-theme='dark']) .search-input,
  :global([data-theme='dark']) .engine-icon-button {
    background-color: rgba(15, 23, 42, 0.6);
    border-color: rgba(148, 163, 184, 0.28);
    color: #e5eefb;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  :global([data-theme='dark']) .search-input::placeholder {
    color: rgba(148, 163, 184, 0.7);
  }

  :global([data-theme='dark']) .engine-menu {
    border-color: rgba(125, 211, 252, 0.3);
    background: rgba(15, 23, 42, 0.96);
    box-shadow: 0 16px 34px rgba(0, 0, 0, 0.26);
  }

  :global([data-theme='dark']) .engine-menu-item {
    color: #e5eefb;
  }

  :global([data-theme='dark']) .engine-menu-item:hover,
  :global([data-theme='dark']) .engine-menu-item.is-selected {
    background: rgba(125, 211, 252, 0.14);
  }

  :global([data-theme='dark']) .engine-menu-icon {
    background: rgba(30, 41, 59, 0.86);
    color: #bae6fd;
  }

  :global([data-theme='dark']) .engine-current-icon {
    background: rgba(30, 41, 59, 0.86);
    color: #bae6fd;
  }

  :global([data-theme='dark']) .engine-icon-button:hover:not(:disabled),
  :global([data-theme='dark']) .engine-icon-button[aria-expanded='true'] {
    border-color: rgba(125, 211, 252, 0.42);
    background-color: rgba(30, 41, 59, 0.78);
    box-shadow:
      0 0 0 3px rgba(125, 211, 252, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .search-box.preview-light .search-input,
  .search-box.preview-light .engine-icon-button {
    border-color: rgba(148, 163, 184, 0.28);
    background-color: rgba(255, 255, 255, 0.82);
    color: #0f172a;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .search-box.preview-light .search-input::placeholder {
    color: #64748b;
  }

  .search-box.preview-light .engine-current-icon {
    background: rgba(226, 232, 240, 0.74);
    color: #1e293b;
  }

  :global([data-background-preset^='paper-']) .search-box.preview-light :is(.search-input, .engine-icon-button, .engine-menu) {
    border-color: color-mix(in srgb, var(--home-accent-color) 24%, transparent);
    background-color: rgb(var(--card-bg-rgb) / var(--card-bg-opacity, 0.9));
    color: #0f172a;
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) 2.5rem;
      gap: 0.45rem;
    }

    .search-box.has-engine-selector {
      grid-template-columns: 2.5rem minmax(0, 1fr) 2.5rem;
    }

    .search-input,
    .search-button {
      height: 2.5rem;
      border-radius: 0.7rem;
      font-size: 0.9rem;
    }

    .engine-picker {
      width: 2.5rem;
      height: 2.5rem;
    }

    .search-input {
      min-width: 0;
    }

    .search-button {
      width: 2.5rem;
      padding: 0;
      font-size: 0.82rem;
    }

    .engine-icon-button {
      display: inline-flex;
      justify-content: center;
      padding: 0;
      border-radius: 0.7rem;
    }

    .engine-current-name,
    .engine-chevron {
      display: none;
    }

    .engine-menu {
      min-width: 9.5rem;
    }

    .search-button-text {
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

    .search-button-mobile-text {
      display: inline;
      font-size: 0.86rem;
      font-weight: 700;
    }
  }

  @media (max-width: 420px) {
    .search-box {
      gap: 0.45rem;
    }

    .search-box.has-engine-selector {
      grid-template-columns: 2.4rem minmax(0, 1fr) 2.4rem;
    }

    .search-box:not(.has-engine-selector) {
      grid-template-columns: minmax(0, 1fr) 2.4rem;
    }

    .search-input,
    .search-button {
      height: 2.4rem;
      font-size: 0.86rem;
    }

    .engine-picker {
      width: 2.4rem;
      height: 2.4rem;
    }

    .search-button {
      width: 2.4rem;
    }
  }
</style>
