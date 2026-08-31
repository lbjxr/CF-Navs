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
})
