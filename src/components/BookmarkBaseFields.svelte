<script lang="ts">
  import type { BookmarkFormValue } from '../lib/adminTypes'
  import type { CategoryTreeOption } from '../lib/categorySelect'
  import CategoryTreeSelect from './CategoryTreeSelect.svelte'

  interface BookmarkBaseFieldsProps {
    /** 双向绑定：所属分类 */
    categoryId?: string | number | undefined
    /** 双向绑定：书签标题 */
    title?: string
    /** 双向绑定：链接地址 */
    url?: string
    /** 双向绑定：打开方式 */
    openMethod?: BookmarkFormValue['open_method']
    /** 双向绑定：是否私密 */
    isPrivate?: boolean
    /** 双向绑定：描述 */
    description?: string
    /** 双向绑定：描述显示策略 */
    descriptionMode?: BookmarkFormValue['description_mode']
    categories?: CategoryTreeOption[]
    loading?: boolean
    titleLoading?: boolean
    /** URL 输入框失焦回调 */
    onUrlBlur?: () => void
  }

  let {
    categoryId = $bindable(),
    title = $bindable(''),
    url = $bindable(''),
    openMethod = $bindable('new_tab'),
    isPrivate = $bindable(false),
    description = $bindable(''),
    descriptionMode = $bindable('inherit'),
    categories = [],
    loading = false,
    titleLoading = false,
    onUrlBlur,
  }: BookmarkBaseFieldsProps = $props()
</script>

<div class="field-compact field-label">
  <span>所属分类</span>
  <CategoryTreeSelect
    bind:value={categoryId}
    items={categories}
    disabled={loading || categories.length === 0}
    ariaLabel="选择所属分类"
    compact
    testId="bookmark-category-tree-select"
  />
</div>

<label class="field-compact">
  <span>
    书签标题
    {#if titleLoading}<small class="field-hint">解析中…</small>{/if}
  </span>
  <input bind:value={title} type="text" placeholder="例如：Svelte 官方网站" required />
</label>

<label class="field-compact">
  <span>链接地址</span>
  <input
    bind:value={url}
    type="url"
    placeholder="https://example.com"
    required
    onblur={() => onUrlBlur?.()}
  />
</label>

<label class="field-compact">
  <span>打开方式</span>
  <select class="native-select" bind:value={openMethod}>
    <option value="new_tab">新标签页</option>
    <option value="same_tab">当前标签页</option>
    <option value="modal">当前页弹层</option>
  </select>
</label>

<label class="field-compact privacy-field">
  <span>访问权限</span>
  <span class="checkbox-row">
    <input bind:checked={isPrivate} type="checkbox" disabled={loading} />
    <span>设为私密链接（仅登录可见）</span>
  </span>
  <small>开启后，未登录访客不会看到这个书签；管理员登录后仍可正常访问。</small>
</label>

<label class="field-compact">
  <span>描述</span>
  <textarea bind:value={description} rows="3" placeholder="补充说明，可选"></textarea>
</label>

<label class="field-compact">
  <span>描述显示</span>
  <select class="native-select" bind:value={descriptionMode}>
    <option value="inherit">跟随全局</option>
    <option value="always">始终显示</option>
    <option value="hover">悬停显示</option>
    <option value="hidden">隐藏</option>
  </select>
</label>

<style>
  label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .field-label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .field-compact {
    grid-column: span 1;
  }

  .field-hint {
    margin-left: 6px;
    color: #64748b;
    font-size: 11px;
    font-weight: 400;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    color: #334155;
    font-size: 13px;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
    accent-color: #2563eb;
  }

  .privacy-field small {
    color: #64748b;
    font-size: 11px;
    line-height: 1.45;
  }

  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: var(--radius-lg);
    padding: var(--control-padding-input-sm);
    font-size: var(--font-size-base);
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 48px;
  }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  select:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  select {
    --select-hover-border: #94a3b8;
  }

  @media (max-width: 500px) {
    .field-compact {
      grid-column: 1 / -1;
    }
  }
</style>
