import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/HomeFloatingActions.svelte', 'utf8')

describe('home floating actions', () => {
  it('provides an accessible back-to-top action after scrolling', () => {
    expect(source).toContain('data-testid="home-back-to-top"')
    expect(source).toContain('aria-label="回到顶部"')
    expect(source).toContain('window.scrollTo({ top: 0, behavior })')
  })

  it('owns and cleans up its scroll listener', () => {
    expect(source).toContain("window.addEventListener('scroll', updateBackToTopVisibility, { passive: true })")
    expect(source).toContain("window.removeEventListener('scroll', updateBackToTopVisibility)")
  })

  it('positions the action for desktop and mobile safe areas', () => {
    expect(source).toContain('right: max(1.25rem, env(safe-area-inset-right));')
    expect(source).toContain('bottom: max(1.25rem, env(safe-area-inset-bottom));')
    expect(source).toContain('right: max(1rem, env(safe-area-inset-right));')
    expect(source).toContain('bottom: max(1rem, env(safe-area-inset-bottom));')
  })
  it('provides an authenticated root-category creation action', () => {
    expect(source).toContain('data-testid="home-create-root-category"')
    expect(source).toContain('aria-label="新增主分类"')
    expect(source).toContain('on:click={handleOpenCreateRootCategory}')
  })
})
