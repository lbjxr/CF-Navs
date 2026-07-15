import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('bookmark card theme styles', () => {
  it('uses backdrop blur on both card variants for the glass surface', () => {
    const compact = readFileSync('src/components/BookmarkCardCompact.svelte', 'utf8')
    const info = readFileSync('src/components/BookmarkCardInfo.svelte', 'utf8')

    expect(compact).toContain('backdrop-filter: blur(20px) saturate(160%);')
    expect(info).toContain('backdrop-filter: blur(20px) saturate(160%);')
  })

  it('builds the dark-mode surface from dark glass instead of a white haze', () => {
    const compact = readFileSync('src/components/BookmarkCardCompact.svelte', 'utf8')
    const info = readFileSync('src/components/BookmarkCardInfo.svelte', 'utf8')

    for (const source of [compact, info]) {
      expect(source).toContain('rgb(15 23 42 / calc(var(--card-bg-opacity, 0.15) * 0.55))')
      expect(source).toContain('rgb(2 6 23 / calc(var(--card-bg-opacity, 0.15) * 0.42))')
    }
  })

  it('keeps compact card titles readable in dark mode', () => {
    const source = readFileSync('src/components/BookmarkCardCompact.svelte', 'utf8')

    expect(source).toContain(":global([data-theme='dark']) .bookmark-icon-title")
    expect(source).toContain('color: var(--card-text-color, #e5eefb);')
  })

  it('keeps information card titles readable in dark mode', () => {
    const source = readFileSync('src/components/BookmarkCardInfo.svelte', 'utf8')

    expect(source).toContain(":global([data-theme='dark']) .bookmark-card-info .bookmark-title")
    expect(source).toContain('color: var(--card-text-color, #e5eefb);')
  })

  it('keeps light-mode bookmark descriptions above normal-text contrast', () => {
    const source = readFileSync('src/components/BookmarkCardInfo.svelte', 'utf8')

    expect(source).toContain('color: var(--card-text-color, #475569);')
    expect(source).toContain('opacity: 0.88;')
  })

  it('keeps category helper texts on theme-aware colors', () => {
    const source = readFileSync('src/components/CategorySection.svelte', 'utf8')
    const sortHintRule = source.match(/\.sort-hint\s*\{([^}]+)\}/)?.[1] ?? ''
    const emptyCardRule = source.match(/\.empty-card\s*\{([^}]+)\}/)?.[1] ?? ''

    expect(sortHintRule).toContain('var(--home-text-color')
    expect(emptyCardRule).toContain('var(--home-text-color')
    expect(emptyCardRule).not.toContain('rgba(100, 116, 139')
  })
})
