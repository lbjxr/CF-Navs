import type { Category, PublicCategory } from './types'

export type CategoryLike = Pick<Category, 'id' | 'parent_id' | 'title' | 'sort'>

export type CategoryNode<T extends CategoryLike = CategoryLike> = T & {
  children: CategoryNode<T>[]
}

export function normalizeCategoryParentId(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

export function normalizeCategory<T extends Category | PublicCategory>(category: T): T {
  return {
    ...category,
    parent_id: normalizeCategoryParentId(category.parent_id),
  }
}

export function normalizeCategories<T extends Category | PublicCategory>(categories: T[]): T[] {
  return categories.map(normalizeCategory)
}

function compareCategories(a: CategoryLike, b: CategoryLike): number {
  return a.sort - b.sort || a.id - b.id
}

export function buildCategoryForest<T extends CategoryLike>(categories: T[]): CategoryNode<T>[] {
  const nodes = new Map<number, CategoryNode<T>>()

  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] })
  }

  const roots: CategoryNode<T>[] = []
  for (const category of categories) {
    const node = nodes.get(category.id)!
    const parent = category.parent_id == null ? null : nodes.get(category.parent_id)
    if (!parent || parent.parent_id != null || parent.id === node.id) {
      roots.push(node)
      continue
    }
    parent.children.push(node)
  }

  roots.sort(compareCategories)
  for (const root of roots) root.children.sort(compareCategories)
  return roots
}

export function flattenCategoryForest<T extends CategoryLike>(forest: CategoryNode<T>[]): T[] {
  const flattened: T[] = []
  for (const root of forest) {
    const { children, ...rootCategory } = root
    flattened.push(rootCategory as unknown as T)
    for (const child of children) {
      const { children: _children, ...childCategory } = child
      flattened.push(childCategory as unknown as T)
    }
  }
  return flattened
}

export function getCategoryPathMap<T extends CategoryLike>(categories: T[]): Map<number, string> {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const paths = new Map<number, string>()

  for (const category of categories) {
    const parent = category.parent_id == null ? null : categoryById.get(category.parent_id)
    paths.set(category.id, parent ? `${parent.title} / ${category.title}` : category.title)
  }

  return paths
}

export function getCategoryAncestorIds<T extends CategoryLike>(categories: T[]): Map<number, number | null> {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const ancestors = new Map<number, number | null>()

  for (const category of categories) {
    const parent = category.parent_id == null ? null : categoryById.get(category.parent_id)
    ancestors.set(category.id, parent?.parent_id == null ? parent?.id ?? null : null)
  }

  return ancestors
}

export function filterCategoryForest<T extends CategoryLike>(
  forest: CategoryNode<T>[],
  visibleCategoryIds: Set<number>,
): CategoryNode<T>[] {
  const filtered: CategoryNode<T>[] = []

  for (const root of forest) {
    const children = root.children
      .filter((child) => visibleCategoryIds.has(child.id))
      .map((child) => ({ ...child, children: [] }))
    if (visibleCategoryIds.has(root.id) || children.length > 0) {
      filtered.push({ ...root, children })
    }
  }

  return filtered
}

export function validateCategoryHierarchy<T extends CategoryLike>(categories: T[]): string | null {
  const categoryById = new Map<number, T>()
  for (const category of categories) {
    if (categoryById.has(category.id)) return `duplicate category id: ${category.id}`
    categoryById.set(category.id, category)
  }

  for (const category of categories) {
    if (category.parent_id == null) continue
    if (category.parent_id === category.id) return `category ${category.id} cannot be its own parent`
    const parent = categoryById.get(category.parent_id)
    if (!parent) return `category ${category.id} references missing parent ${category.parent_id}`
    if (parent.parent_id != null) return `category ${category.id} would exceed two levels`
  }

  return null
}
