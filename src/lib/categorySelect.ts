export type CategorySelectSource = {
  id: string | number
  parent_id: string | number | null
  title: string
  sort?: number
}

export type CategoryTreeOption = {
  id: string | number
  title: string
  children: CategoryTreeOption[]
}

function compareCategories(a: CategorySelectSource, b: CategorySelectSource): number {
  return Number(a.sort ?? 0) - Number(b.sort ?? 0) || Number(a.id) - Number(b.id)
}

export function buildCategoryTreeOptions(categories: CategorySelectSource[]): CategoryTreeOption[] {
  const roots = categories
    .filter((category) => category.parent_id == null)
    .sort(compareCategories)

  return roots.map((root) => ({
    id: root.id,
    title: root.title,
    children: categories
      .filter((category) => Number(category.parent_id) === Number(root.id))
      .sort(compareCategories)
      .map((child) => ({
        id: child.id,
        title: child.title,
        children: [],
      })),
  }))
}

export function buildParentCategoryOptions(
  categories: CategorySelectSource[],
  currentCategoryId?: string | number,
): CategoryTreeOption[] {
  return categories
    .filter((category) => (
      category.parent_id == null && Number(category.id) !== Number(currentCategoryId)
    ))
    .sort(compareCategories)
    .map((category) => ({
      id: category.id,
      title: category.title,
      children: [],
    }))
}

export function findCategoryTreeOption(
  items: CategoryTreeOption[],
  value: string | number | null | undefined,
): CategoryTreeOption | null {
  if (value == null || value === '') return null
  const normalizedValue = String(value)

  for (const root of items) {
    if (String(root.id) === normalizedValue) return root
    const child = root.children.find((item) => String(item.id) === normalizedValue)
    if (child) return child
  }

  return null
}

export function getCategoryTreeOptionLabel(
  items: CategoryTreeOption[],
  value: string | number | null | undefined,
): string | null {
  if (value == null || value === '') return null
  const normalizedValue = String(value)

  for (const root of items) {
    if (String(root.id) === normalizedValue) return root.title
    const child = root.children.find((item) => String(item.id) === normalizedValue)
    if (child) return `${root.title} / ${child.title}`
  }

  return null
}

export function getCategoryTreeExpandedRootIds(
  items: CategoryTreeOption[],
  value: string | number | null | undefined,
): Set<string> {
  if (value == null || value === '') return new Set()
  const normalizedValue = String(value)

  const selectedRoot = items.find((root) => (
    root.children.some((child) => String(child.id) === normalizedValue)
  ))

  return selectedRoot ? new Set([String(selectedRoot.id)]) : new Set()
}
