import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('home responsive layout', () => {
 it('keeps the configurable horizontal margin desktop-only', () => {
  const home = readFileSync('src/views/Home.svelte', 'utf8')
  const mobileStyles = home.slice(home.indexOf('@media (max-width: 799px)'))

  expect(home).toContain('padding: 1.5rem calc(1.5rem + var(--content-margin-x, 0px))')
  expect(mobileStyles).toContain('padding: 1rem 1rem var(--content-margin-bottom, 0%);')
  expect(mobileStyles).not.toContain('var(--content-margin-x')
 })
 it('paints mobile overscroll with the active homepage background', () => {
  const app = readFileSync('src/App.svelte', 'utf8')
  const globalStyles = readFileSync('src/app.css', 'utf8')

  expect(app).toContain("'--home-background'")
  expect(app).toContain("'--home-background-mask'")
  expect(app).toContain("'--home-background-mask-color'")
  expect(app).toContain('document.documentElement.style.setProperty')
  expect(globalStyles).toContain('var(--home-background);')
  expect(globalStyles).toContain('background-attachment: fixed;')
 })
 it('uses a full-width two-row mobile sort toolbar', () => {
  const home = readFileSync('src/views/Home.svelte', 'utf8')
  const mobileStyles = home.slice(home.indexOf('@media (max-width: 799px)'))

  expect(home).toContain('class:error-state={Boolean(homeSortError)}')
  expect(home).toContain('class="home-sort-message"')
  expect(mobileStyles).toContain('left: max(12px, env(safe-area-inset-left));')
  expect(mobileStyles).toContain('right: max(12px, env(safe-area-inset-right));')
  expect(mobileStyles).toContain("grid-template-areas: 'message message' 'cancel save';")
  expect(mobileStyles).toContain('white-space: normal;')
 })
})
