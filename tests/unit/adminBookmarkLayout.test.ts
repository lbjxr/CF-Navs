import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('admin bookmark selection toolbar layout', () => {
  it('separates the selection toolbar from the scrollable bookmark list', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')
    const contentStart = panel.indexOf('<div class="admin-bookmark-list-content"')
    const toolbarStart = panel.indexOf('<div class="batch-selection-toolbar"')
    const scrollStart = panel.indexOf('<div class="admin-panel-scroll-body admin-table-scroll-body">')

    expect(contentStart).toBeGreaterThanOrEqual(0)
    expect(toolbarStart).toBeGreaterThan(contentStart)
    expect(scrollStart).toBeGreaterThan(toolbarStart)
    expect(panel).toContain('class:has-batch-selection={selectedIds.size > 0}')
  })

  it('reserves mobile space above the fixed admin navigation', () => {
    const panel = readFileSync('src/components/admin/BookmarkListPanel.svelte', 'utf8')

    expect(panel).toContain('grid-template-rows: auto minmax(0, 1fr) auto;')
    expect(panel).toContain('padding-bottom: 112px;')
    expect(panel).toContain('bottom: calc(60px + max(12px, env(safe-area-inset-bottom)));')
    expect(panel).toContain('z-index: 1001;')
  })
})
