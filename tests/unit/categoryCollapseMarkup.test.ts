import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('category hierarchy visibility markup', () => {
  it('keeps home bookmark groups visible without category accordions', () => {
    const section = readFileSync('src/components/CategorySection.svelte', 'utf8')
    const home = readFileSync('src/views/Home.svelte', 'utf8')
    const scope = readFileSync('src/components/HomeCategoryScope.svelte', 'utf8')

    expect(section).not.toContain('export let expanded')
    expect(section).not.toContain('section-expand-button')
    expect(section).toContain('{#if bookmarks.length > 0}')
    expect(home).not.toContain('expandedCategoryIds')
    expect(home).toContain('<HomeCategoryScope')
    expect(home).toContain('{#each activeRoot.children as child (child.id)}')
    expect(scope).toContain('$: rootActive = activeId == null || String(activeId) === String(rootId)')
    expect(scope).toContain('aria-selected={rootActive}')
  })

  it('collapses selector and admin child categories behind independent arrows', () => {
    const treeSelect = readFileSync('src/components/CategoryTreeSelect.svelte', 'utf8')
    const adminCategories = readFileSync('src/components/admin/CategoryListPanel.svelte', 'utf8')

    expect(treeSelect).toContain('expandedRootIds = getCategoryTreeExpandedRootIds(items, value)')
    expect(treeSelect).toContain('item.children.length > 0 && expandedRootIds.has(String(item.id))')
    expect(treeSelect).toContain('toggleRootExpansion(item.id, event)')
    expect(adminCategories).toContain('let expandedRootIds = new Set<string>()')
    expect(adminCategories).toContain('{#if displayedExpandedRootIds.has(rootId)}')
    expect(adminCategories).toContain('data-testid={`admin-category-expand-${rootId}`}')
  })

  it('keeps navigation collapsed by default and reveals the active child path', () => {
    const sidebar = readFileSync('src/components/Sidebar.svelte', 'utf8')

    expect(sidebar).toContain('let expandedParentIds = new Set<string>()')
    expect(sidebar).toContain('activeParentId != null')
    expect(sidebar).toContain('expandedParentIds = new Set([...expandedParentIds, revealedActiveParentId])')
    expect(sidebar).toContain('on:click={() => toggleParent(item)}')
  })
})
