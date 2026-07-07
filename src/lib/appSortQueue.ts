export function normalizeSortIds(ids: Array<string | number>): number[] {
  return ids.map((id) => Number(id))
}

export function queueSortSave(previousSave: Promise<void>, save: () => Promise<void>): Promise<void> {
  return previousSave
    .catch(() => undefined)
    .then(save)
}

export function isLatestSortRequest(requestSeq: number, latestSeq: number): boolean {
  return requestSeq === latestSeq
}
