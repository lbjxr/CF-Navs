import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('category hierarchy collapse markup', () => {
  it('keeps home category content collapsed until its arrow is toggled', () => {
    const section = readFileSync('src/components/CategorySection.svelte', 'utf8')
    const home = readFileSync('src/views/Home.svelte', 'utf8')

    expect(section).toContain('export let expanded = false')
    expect(section).toContain('{#if expanded && hasExpandableContent}')
    expect(section).toContain('data-testid={`category-expand-${category.id}`}')
    expect(home).toContain('let expandedCategoryIds = new Set<string>()')
    expect(home).toContain('await expandNavigationPath(targetId)')
  })

  it('collapses selector and admin child categories behind independent arrows', () => {
    const treeSelect = readFileSync('src/components/CategoryTreeSelect.svelte', 'utf8')
    const adminCategories = readFileSync('src/components/admin/CategoryListPanel.svelte', 'utf8')

    expect(treeSelect).toContain('if (!open) expandedRootIds = new Set()')
    expect(treeSelect).toContain('item.children.length > 0 && expandedRootIds.has(String(item.id))')
    expect(treeSelect).toContain('toggleRootExpansion(item.id, event)')
    expect(adminCategories).toContain('let expandedRootIds = new Set<string>()')
    expect(adminCategories).toContain('{#if displayedExpandedRootIds.has(rootId)}')
    expect(adminCategories).toContain('data-testid={`admin-category-expand-${rootId}`}')
  })

  it('does not expand left navigation parents from scroll state alone', () => {
    const sidebar = readFileSync('src/components/Sidebar.svelte', 'utf8')

    expect(sidebar).not.toContain('expandedParentIds = new Set([...expandedParentIds, String(activeParentId)])')
    expect(sidebar).toContain('on:click={() => toggleParent(item)}')
  })
})
