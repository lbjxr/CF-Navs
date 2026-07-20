import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('bookmark link modal layout', () => {
  it('mounts the viewport modal outside the contained bookmark card', () => {
    const card = readFileSync('src/components/BookmarkCard.svelte', 'utf8')
    const modal = readFileSync('src/components/BookmarkLinkModal.svelte', 'utf8')

    expect(card).toContain('contain: layout style;')
    expect(modal).toContain('document.body.appendChild(node)')
    expect(modal).toContain('<div use:mountToBody class="link-modal-backdrop"')
    expect(modal).toContain('position: fixed;')
    expect(modal).toContain('z-index: 120;')
    expect(modal).toContain('width: min(1120px, 100%);')
  })
})
