import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('home responsive layout', () => {
  it('keeps the configurable horizontal margin desktop-only', () => {
    const home = readFileSync('src/views/Home.svelte', 'utf8')
    const mobileStyles = home.slice(home.indexOf('@media (max-width: 720px)'))

    expect(home).toContain('padding: 1.5rem calc(1.5rem + var(--content-margin-x, 0px))')
    expect(mobileStyles).toContain('padding: 1rem 1rem var(--content-margin-bottom, 0%);')
    expect(mobileStyles).not.toContain('var(--content-margin-x')
  })
})
