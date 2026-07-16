export function pruneSelectedIds(selected: Iterable<number>, existingIds: Iterable<number>): Set<number> {
  const existing = new Set(existingIds)
  return new Set([...selected].filter((id) => existing.has(id)))
}

export function toggleSelectedId(selected: Iterable<number>, id: number, checked: boolean): Set<number> {
  const next = new Set(selected)
  if (checked) next.add(id)
  else next.delete(id)
  return next
}

export function getPageSelectionState(pageIds: number[], selected: Iterable<number>): { checked: boolean; indeterminate: boolean } {
  const selectedSet = new Set(selected)
  const count = pageIds.filter((id) => selectedSet.has(id)).length
  return { checked: pageIds.length > 0 && count === pageIds.length, indeterminate: count > 0 && count < pageIds.length }
}
