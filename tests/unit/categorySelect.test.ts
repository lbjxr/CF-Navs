import { describe, expect, it } from 'vitest'
import {
  buildCategoryTreeOptions,
  buildParentCategoryOptions,
  findCategoryTreeOption,
} from '../../src/lib/categorySelect'

const categories = [
  { id: 1, parent_id: null, title: 'Tools', sort: 1 },
  { id: 2, parent_id: null, title: 'Docs', sort: 0 },
  { id: 3, parent_id: 1, title: 'Frontend', sort: 1 },
  { id: 4, parent_id: 1, title: 'Backend', sort: 0 },
]

describe('category tree select helpers', () => {
  it('groups roots and children in sibling sort order without flattening titles', () => {
    expect(buildCategoryTreeOptions(categories)).toEqual([
      { id: 2, title: 'Docs', children: [] },
      {
        id: 1,
        title: 'Tools',
        children: [
          { id: 4, title: 'Backend', children: [] },
          { id: 3, title: 'Frontend', children: [] },
        ],
      },
    ])
  })

  it('offers only other root categories as possible parents', () => {
    expect(buildParentCategoryOptions(categories, 1)).toEqual([
      { id: 2, title: 'Docs', children: [] },
    ])
  })

  it('finds both root and child selections by normalized id', () => {
    const tree = buildCategoryTreeOptions(categories)
    expect(findCategoryTreeOption(tree, '1')?.title).toBe('Tools')
    expect(findCategoryTreeOption(tree, 4)?.title).toBe('Backend')
    expect(findCategoryTreeOption(tree, null)).toBeNull()
    expect(findCategoryTreeOption(tree, 99)).toBeNull()
  })
})
