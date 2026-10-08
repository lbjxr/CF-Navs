import { describe, expect, it } from 'vitest'
import {
  getCategoryIconFallbackText,
  getCategoryImageIconUrl,
  getCategoryTextIcon,
  hasCategoryImageIcon,
  normalizeCategoryIcon,
} from '../../src/lib/categoryIconDisplay'

describe('category icon display', () => {
  it('versions refreshed remote content without changing its source or title', () => {
    const previous={id:7,title:'Tools',icon:'https://example.com/icon.svg',icon_revision:'sha256-'+'a'.repeat(64),icon_write_epoch:1}
    expect(getCategoryImageIconUrl({...previous,icon_revision:'sha256-'+'b'.repeat(64)})).not.toBe(getCategoryImageIconUrl(previous))
    expect(getCategoryImageIconUrl({...previous,icon_write_epoch:2})).toBe(getCategoryImageIconUrl(previous))
    expect(getCategoryImageIconUrl({...previous,icon_revision:null,icon_write_epoch:2})).not.toBe(getCategoryImageIconUrl({...previous,icon_revision:null}))
  })
  it('routes remote category icons through the versioned category proxy', () => {
    const category = {
      id: 7,
      title: 'Frontend',
      icon: '  https://api.iconify.design/mdi/code-tags.svg  ',
    }

    expect(normalizeCategoryIcon(category)).toBe('https://api.iconify.design/mdi/code-tags.svg')
    expect(getCategoryImageIconUrl(category)).toMatch(/^\/api\/category-icon\/7\?v=[a-z0-9]+&cv=4$/)
    expect(hasCategoryImageIcon(category)).toBe(true)
    expect(getCategoryTextIcon(category)).toBe('')
  })

  it('recognizes bare Iconify names as image sources', () => {
    const category = { id: 12, title: 'Home', icon: 'mdi:home' }

    expect(getCategoryImageIconUrl(category)).toMatch(/^\/api\/category-icon\/12\?v=[a-z0-9]+&cv=4$/)
    expect(getCategoryTextIcon(category)).toBe('')
  })

  it('renders data images directly and preserves custom text or emoji icons', () => {
    const dataCategory = { id: 8, title: 'Design', icon: 'data:image/svg+xml,test' }
    const textCategory = { id: 9, title: 'Reading', icon: '📚' }

    expect(getCategoryImageIconUrl(dataCategory)).toBe(dataCategory.icon)
    expect(getCategoryImageIconUrl(textCategory)).toBe('')
    expect(getCategoryTextIcon(textCategory)).toBe('📚')
  })

  it('uses the first complete title character only after an image load failure', () => {
    expect(getCategoryIconFallbackText({ id: 10, title: '工具', icon: 'https://example.com/icon.png' })).toBe('工')
    expect(getCategoryIconFallbackText({ id: 11, title: '🧰 Tools', icon: null })).toBe('🧰')
  })
})
