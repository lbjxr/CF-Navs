import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin bookmark selection toolbar layout', () => {
  it('renders the selection toolbar outside the scrollable list panel', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')
    const sectionClose = panel.indexOf('</section>')
    const toolbarStart = panel.indexOf('<div class="batch-selection-toolbar"')
    const scrollStart = panel.indexOf('<div class="admin-panel-scroll-body admin-table-scroll-body">')

    expect(scrollStart).toBeGreaterThanOrEqual(0)
    expect(sectionClose).toBeGreaterThan(scrollStart)
    expect(toolbarStart).toBeGreaterThan(sectionClose)
    expect(panel).toContain('{#if selectedIds.size > 0 && !sortMode}')
  })

  it('floats the selection toolbar and reserves mobile space above the fixed navigation', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')

    expect(panel).toContain('grid-template-rows: auto minmax(0, 1fr) auto;')
    expect(panel).toContain('.admin-bookmark-list-content.has-batch-selection ~ .admin-panel-footer')
    expect(panel).toContain('bottom: calc(60px + max(10px, env(safe-area-inset-bottom)));')
    expect(panel).toContain('z-index: 1001;')
  })

  it('surfaces the batch-move consequence in the confirm dialog', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')

    // 目标树按当前选中集合标注后果，而不是拿全量分类无差别渲染。
    expect(panel).toContain('getAdminBookmarkCategoryOptions(categories, selectedBookmarks)')
    // 确认弹层重申一次后果，且说明私密书签不受影响、可回退。
    expect(panel).toContain('{#if moveTargetNotice}')
    expect(panel).toContain('class="batch-move-notice" role="status"')
    expect(panel).toContain('私密书签不受影响，可随时把分类改回公开')
    // 选项内的逐项文案、`aria-describedby` 指向与「不引入禁用态」改由组件层断言：
    // 见 tests/unit/categoryTreeSelect.test.ts（PROB-18 方案 B）。
  })

  it('defaults the batch-move target to the majority category of the selection', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')

    // R-05 要求默认落在「多数书签所在分类」，不得回退成首个选中项。
    expect(panel).toContain('moveTargetId = pickMajorityCategoryId(selectedBookmarks, categories)')
    expect(panel).not.toContain('Number(selectedBookmarks[0].category_id)')
  })
})
