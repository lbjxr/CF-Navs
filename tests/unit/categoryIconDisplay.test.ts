import { describe, expect, it } from 'vitest'
import {
  getCategoryIconFallbackText,
  getCategoryImageIconUrl,
  getCategoryTextIcon,
  hasCategoryImageIcon,
  normalizeCategoryIcon,
} from '../../src/lib/categoryIconDisplay'

describe('category icon display', () => {
  it('routes remote category icons through the versioned category proxy', () => {
    const category = {
      id: 7,
      title: 'Frontend',
      icon: '  https://api.iconify.design/mdi/code-tags.svg  ',
    }

    expect(normalizeCategoryIcon(category)).toBe('https://api.iconify.design/mdi/code-tags.svg')
    expect(getCategoryImageIconUrl(category)).toMatch(/^\/api\/category-icon\/7\?v=[a-z0-9]+$/)
    expect(hasCategoryImageIcon(category)).toBe(true)
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
