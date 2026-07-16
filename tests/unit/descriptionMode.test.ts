import { describe, expect, it } from 'vitest'
import { resolveBookmarkDescriptionMode, resolveGlobalDescriptionMode } from '../../src/lib/descriptionMode'

describe('description modes', () => {
  it('maps legacy settings and lets the new setting win', () => {
    expect(resolveGlobalDescriptionMode({ card_description_mode: undefined as never, card_show_description: false })).toBe('hidden')
    expect(resolveGlobalDescriptionMode({ card_description_mode: 'hover', card_show_description: true })).toBe('hover')
  })

  it('uses a bookmark override before the global mode', () => {
    expect(resolveBookmarkDescriptionMode({ description_mode: null }, 'hover')).toBe('hover')
    expect(resolveBookmarkDescriptionMode({ description_mode: 'hidden' }, 'always')).toBe('hidden')
  })
})
