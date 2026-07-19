import { describe, expect, it } from 'vitest'
import type { PublicCategory } from '../../shared/types'
import {
  buildCategoryForest,
  filterCategoryForest,
  flattenCategoryForest,
  getCategoryPathMap,
  normalizeCategories,
  validateCategoryHierarchy,
} from '../../shared/categoryHierarchy'

const categories: PublicCategory[] = [
  { id: 2, parent_id: null, title: 'Docs', icon: null, sort: 1 },
  { id: 4, parent_id: 1, title: 'Backend', icon: null, sort: 1 },
  { id: 1, parent_id: null, title: 'Development', icon: null, sort: 0 },
  { id: 3, parent_id: 1, title: 'Frontend', icon: null, sort: 0 },
]

describe('category hierarchy helpers', () => {
  it('normalizes legacy categories and builds a stably sorted two-level forest', () => {
    const legacy = [{ id: 5, title: 'Legacy', icon: null, sort: 2 }] as unknown as PublicCategory[]
    expect(normalizeCategories(legacy)[0].parent_id).toBeNull()

    const forest = buildCategoryForest(categories)
    expect(forest.map((category) => category.id)).toEqual([1, 2])
    expect(forest[0].children.map((category) => category.id)).toEqual([3, 4])
    expect(flattenCategoryForest(forest).map((category) => category.id)).toEqual([1, 3, 4, 2])
  })

  it('builds full paths and retains ancestors for matching child categories', () => {
    expect(getCategoryPathMap(categories)).toEqual(new Map([
      [2, 'Docs'],
      [4, 'Development / Backend'],
      [1, 'Development'],
      [3, 'Development / Frontend'],
    ]))

    const filtered = filterCategoryForest(buildCategoryForest(categories), new Set([4]))
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(1)
    expect(filtered[0].children.map((category) => category.id)).toEqual([4])
  })

  it('rejects missing parents, self parents, and third-level categories', () => {
    expect(validateCategoryHierarchy([{ id: 1, parent_id: 99, title: 'Broken', sort: 0 }])).toContain('missing parent')
    expect(validateCategoryHierarchy([{ id: 1, parent_id: 1, title: 'Loop', sort: 0 }])).toContain('own parent')
    expect(validateCategoryHierarchy([
      { id: 1, parent_id: null, title: 'Root', sort: 0 },
      { id: 2, parent_id: 1, title: 'Child', sort: 0 },
      { id: 3, parent_id: 2, title: 'Grandchild', sort: 0 },
    ])).toContain('two levels')
  })
})
