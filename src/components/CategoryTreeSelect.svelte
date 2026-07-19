<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import {
    getCategoryTreeExpandedRootIds,
    getCategoryTreeOptionLabel,
    type CategoryTreeOption,
  } from '../lib/categorySelect'

  export let value: string | number | null | undefined = undefined
  export let items: CategoryTreeOption[] = []
  export let rootOptionLabel = ''
  export let placeholder = '请选择分类'
  export let emptyLabel = '暂无分类可选'
  export let ariaLabel = '选择分类'
  export let disabled = false
  export let compact = false
  export let testId = ''

  let root: HTMLElement | null = null
  let open = false
  let trigger: HTMLButtonElement | null = null
  let expandedRootIds = new Set<string>()

  $: selectedOptionLabel = getCategoryTreeOptionLabel(items, value)
  $: selectedLabel = value == null && rootOptionLabel
    ? rootOptionLabel
    : selectedOptionLabel ?? placeholder
  $: hasOptions = Boolean(rootOptionLabel) || items.length > 0

  function closeMenu(focusTrigger = false): void {
    open = false
    if (focusTrigger) trigger?.focus()
  }

  function toggleMenu(): void {
    if (disabled || !hasOptions) return
    if (!open) expandedRootIds = getCategoryTreeExpandedRootIds(items, value)
    open = !open
  }

  function selectValue(nextValue: string | number | null): void {
    value = nextValue
    closeMenu(true)
  }

  function getTreeItems(): HTMLButtonElement[] {
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLButtonElement>('[role="treeitem"]'))
  }

  function toggleRootExpansion(id: string | number, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    const normalizedId = String(id)
    const next = new Set(expandedRootIds)
    if (next.has(normalizedId)) next.delete(normalizedId)
    else next.add(normalizedId)
    expandedRootIds = next
  }

  function focusRootItem(id: string): void {
    root?.querySelector<HTMLButtonElement>(`.tree-root-option[data-tree-root-id="${id}"]`)?.focus()
  }

  function handleTreeHorizontalKey(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null
    const rootOption = target?.closest<HTMLButtonElement>('.tree-root-option')
    const childOption = target?.closest<HTMLButtonElement>('.tree-child-option')
    const rootId = rootOption?.dataset.treeRootId ?? childOption?.dataset.treeParentId
    if (!rootId) return false
    const item = items.find((candidate) => String(candidate.id) === rootId)
    if (!item || item.children.length === 0) return false

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (!expandedRootIds.has(rootId)) {
        expandedRootIds = new Set([...expandedRootIds, rootId])
        return true
      }
      if (rootOption) {
        void tick().then(() => root?.querySelector<HTMLButtonElement>(`.tree-child-option[data-tree-parent-id="${rootId}"]`)?.focus())
      }
      return true
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (childOption) {
        focusRootItem(rootId)
      } else if (expandedRootIds.has(rootId)) {
        const next = new Set(expandedRootIds)
        next.delete(rootId)
        expandedRootIds = next
      }
      return true
    }

    return false
  }

  function focusTreeItem(index: number): void {
    const options = getTreeItems()
    if (options.length === 0) return
    options[Math.min(Math.max(index, 0), options.length - 1)]?.focus()
  }

  function handleTriggerKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    if (!open) {
      expandedRootIds = getCategoryTreeExpandedRootIds(items, value)
      open = true
    }
    requestAnimationFrame(() => {
      const options = getTreeItems()
      if (event.key === 'ArrowUp') options.at(-1)?.focus()
      else options[0]?.focus()
    })
  }

  function handleTreeKeyDown(event: KeyboardEvent): void {
    if (handleTreeHorizontalKey(event)) return
    const options = getTreeItems()
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusTreeItem(currentIndex + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusTreeItem(currentIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTreeItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTreeItem(options.length - 1)
    }
  }

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (open && root && !root.contains(event.target as Node)) closeMenu()
  }

  onMount(() => {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
  })

  onDestroy(() => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown)
  })
</script>

<div class="category-tree-select" class:compact bind:this={root}>
  <button
    type="button"
    class="category-select-trigger"
    bind:this={trigger}
    data-testid={testId || undefined}
    aria-label={ariaLabel}
    title={hasOptions ? selectedLabel : emptyLabel}
    aria-haspopup="tree"
    aria-expanded={open}
    {disabled}
    on:click={toggleMenu}
    on:keydown={handleTriggerKeyDown}
  >
    <span>{hasOptions ? selectedLabel : emptyLabel}</span>
    <span class="select-chevron" class:open aria-hidden="true"></span>
  </button>

  {#if open}
    <div class="category-tree-menu" role="tree" aria-label="分类目录" tabindex="-1" on:keydown={handleTreeKeyDown}>
      {#if rootOptionLabel}
        <button
          type="button"
          class="tree-option root-choice"
          class:selected={value == null}
          role="treeitem"
          aria-selected={value == null}
          on:click={() => selectValue(null)}
        >
          <span class="root-choice-mark" aria-hidden="true"></span>
          <span>{rootOptionLabel}</span>
        </button>
      {/if}

      {#each items as item (item.id)}
        <div class="tree-group">
          <div class="tree-root-row">
            {#if item.children.length > 0}
              <button
                type="button"
                class="tree-expand-button"
                aria-label={`${expandedRootIds.has(String(item.id)) ? '收起' : '展开'} ${item.title} 的子分类`}
                aria-expanded={expandedRootIds.has(String(item.id))}
                aria-controls={`category-tree-children-${item.id}`}
                title={`${expandedRootIds.has(String(item.id)) ? '收起' : '展开'} ${item.title} 的子分类`}
                tabindex="-1"
                on:click={(event) => toggleRootExpansion(item.id, event)}
              >
                <span class="tree-node-chevron" class:open={expandedRootIds.has(String(item.id))} aria-hidden="true"></span>
              </button>
            {:else}
              <span class="tree-expand-spacer" aria-hidden="true"></span>
            {/if}
            <button
              type="button"
              class="tree-option tree-root-option"
              class:selected={String(value) === String(item.id)}
              data-tree-root-id={item.id}
              role="treeitem"
              aria-level="1"
              aria-expanded={item.children.length > 0 ? expandedRootIds.has(String(item.id)) : undefined}
              aria-selected={String(value) === String(item.id)}
              on:click={() => selectValue(item.id)}
            >
              <span class="tree-folder-mark" aria-hidden="true"></span>
              <span>{item.title}</span>
            </button>
          </div>

          {#if item.children.length > 0 && expandedRootIds.has(String(item.id))}
            <div class="tree-children" id={`category-tree-children-${item.id}`} role="group">
              {#each item.children as child (child.id)}
                <button
                  type="button"
                  class="tree-option tree-child-option"
                  class:selected={String(value) === String(child.id)}
                  data-tree-parent-id={item.id}
                  role="treeitem"
                  aria-level="2"
                  aria-selected={String(value) === String(child.id)}
                  on:click={() => selectValue(child.id)}
                >
                  <span class="tree-branch-mark" aria-hidden="true"></span>
                  <span>{child.title}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .category-tree-select {
    position: relative;
    width: 100%;
    min-width: 0;
    color: #0f172a;
    font-size: 14px;
  }

  .category-select-trigger {
    width: 100%;
    min-height: 42px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 9px 12px;
    background: #ffffff;
    color: #0f172a;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }

  .compact .category-select-trigger {
    min-height: 32px;
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
  }

  .category-select-trigger:hover:not(:disabled) {
    border-color: #94a3b8;
  }

  .category-select-trigger:focus-visible,
  .category-select-trigger[aria-expanded='true'] {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .category-select-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .category-select-trigger > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-chevron {
    position: relative;
    width: 10px;
    height: 7px;
    flex: 0 0 auto;
    opacity: 0.68;
  }

  .select-chevron::before,
  .select-chevron::after {
    content: '';
    position: absolute;
    top: 3px;
    width: 6px;
    height: 1.5px;
    border-radius: 999px;
    background: currentColor;
    transition: transform 0.16s ease;
  }

  .select-chevron::before {
    left: 0;
    transform: rotate(40deg);
  }

  .select-chevron::after {
    right: 0;
    transform: rotate(-40deg);
  }

  .select-chevron.open::before {
    transform: rotate(-40deg);
  }

  .select-chevron.open::after {
    transform: rotate(40deg);
  }

  .category-tree-menu {
    position: absolute;
    z-index: 120;
    top: calc(100% + 6px);
    left: 0;
    width: 100%;
    max-height: min(320px, 45vh);
    box-sizing: border-box;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid #dbe3ee;
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 16px 34px rgba(15, 23, 42, 0.16);
  }

  .tree-group + .tree-group {
    margin-top: 3px;
  }

  .tree-root-row {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .tree-root-row > .tree-option {
    flex: 1;
    min-width: 0;
  }

  .tree-expand-button,
  .tree-expand-spacer {
    width: 24px;
    height: 30px;
    flex: 0 0 auto;
  }

  .tree-expand-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    padding: 0;
    background: transparent;
    color: #64748b;
    cursor: pointer;
  }

  .tree-expand-button:hover,
  .tree-expand-button:focus-visible {
    outline: none;
    background: #f1f5f9;
    color: #1d4ed8;
  }

  .tree-node-chevron {
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 4px 0 4px 5px;
    border-color: transparent transparent transparent currentColor;
  }

  .tree-node-chevron.open {
    border-width: 5px 4px 0;
    border-color: currentColor transparent transparent;
  }

  .tree-option {
    width: 100%;
    min-height: 36px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 0;
    border-radius: 7px;
    padding: 7px 9px;
    background: transparent;
    color: #334155;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .tree-option:hover,
  .tree-option:focus-visible {
    outline: none;
    background: #f1f5f9;
    color: #0f172a;
  }

  .tree-option.selected {
    background: #eff6ff;
    color: #1d4ed8;
    font-weight: 600;
  }

  .tree-root-option {
    font-weight: 600;
  }

  .tree-folder-mark {
    width: 11px;
    height: 9px;
    flex: 0 0 auto;
    box-sizing: border-box;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    opacity: 0.62;
  }

  .tree-children {
    position: relative;
    margin: 0 0 2px 14px;
    padding-left: 13px;
  }

  .tree-children::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 8px;
    left: 0;
    border-left: 1px solid #cbd5e1;
  }

  .tree-child-option {
    position: relative;
    min-height: 34px;
    padding-left: 4px;
    font-size: 0.94em;
  }

  .tree-branch-mark {
    width: 11px;
    height: 10px;
    flex: 0 0 auto;
    margin-left: -17px;
    border-bottom: 1px solid #cbd5e1;
  }

  .root-choice {
    margin-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
    border-radius: 7px 7px 2px 2px;
  }

  .root-choice-mark {
    width: 11px;
    height: 2px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.52;
  }

</style>
