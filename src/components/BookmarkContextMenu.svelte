<script lang="ts">
  import CategoryTreeSelect from './CategoryTreeSelect.svelte'
  import type { CategoryTreeOption } from '../lib/categorySelect'

  type AsyncVoid<T = void> = T | Promise<T>

  export let categories: CategoryTreeOption[] = []
  export let currentCategoryId: string | number | null = null
  export let onEdit: (() => AsyncVoid) | undefined = undefined
  export let onMoveBookmark: ((categoryId: number) => AsyncVoid) | undefined = undefined
  export let canMove = false

  let movePickerOpen = false
  let moveCategoryId: string | number | null = currentCategoryId
  let moveSubmitting = false

  function handleEditClick() {
    void onEdit?.()
  }

  function openMovePicker() {
    if (!onMoveBookmark || categories.length === 0) return
    moveCategoryId = currentCategoryId
    movePickerOpen = true
  }

  function closeMovePicker() {
    movePickerOpen = false
    moveCategoryId = currentCategoryId
  }

  $: if (
    movePickerOpen &&
    !moveSubmitting &&
    onMoveBookmark &&
    moveCategoryId != null &&
    Number(moveCategoryId) !== Number(currentCategoryId)
  ) {
    const targetCategoryId = Number(moveCategoryId)
    moveSubmitting = true
    movePickerOpen = false
    void Promise.resolve(onMoveBookmark(targetCategoryId)).finally(() => {
      moveSubmitting = false
    })
  }
</script>

<div class="bookmark-context-menu" role="menu" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
  {#if onEdit}
    <button type="button" data-testid="bookmark-context-edit" on:click={handleEditClick}>编辑</button>
  {/if}
  {#if canMove && onMoveBookmark && categories.length > 0}
    <button type="button" data-testid="bookmark-context-move" on:click={openMovePicker}>移动到分类</button>
  {/if}
  {#if movePickerOpen}
    <div class="move-picker" data-testid="bookmark-context-move-picker">
      <CategoryTreeSelect
        bind:value={moveCategoryId}
        items={categories}
        ariaLabel="移动到分类"
        compact
        testId="bookmark-context-move-select"
      />
      <button type="button" class="move-cancel" on:click={closeMovePicker}>取消</button>
    </div>
  {/if}
</div>

<style>
  .bookmark-context-menu {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 80;
    min-width: 112px;
    padding: 6px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(10px);
  }

  .bookmark-context-menu button {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    padding: 7px 12px;
    text-align: left;
  }

  .bookmark-context-menu button:hover,
  .bookmark-context-menu button:focus-visible {
    background: #eff6ff;
    color: #1d4ed8;
  }

  .move-picker {
    display: grid;
    gap: 6px;
    min-width: 210px;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid rgba(148, 163, 184, 0.24);
  }

  .move-cancel {
    text-align: center !important;
  }

  :global([data-theme='dark']) .bookmark-context-menu {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.94);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.32);
  }

  :global([data-theme='dark']) .bookmark-context-menu button {
    color: #e5eefb;
  }

  :global([data-theme='dark']) .bookmark-context-menu button:hover,
  :global([data-theme='dark']) .bookmark-context-menu button:focus-visible {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
  }
</style>
