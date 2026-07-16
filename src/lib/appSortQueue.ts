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

export interface OptimisticSortState {
  savePromise: Promise<void>
  requestSeq: number
}

export interface OptimisticSortOptions {
  applyLocalSort: (ids: number[]) => Promise<void>
  saveRemoteSort: (ids: number[]) => Promise<unknown>
  persist: () => Promise<void>
  onSuccess?: () => Promise<void>
  restoreOnError: () => Promise<void>
  onError: (error: unknown) => void
}

export function createOptimisticSortState(): OptimisticSortState {
  return {
    savePromise: Promise.resolve(),
    requestSeq: 0,
  }
}

export async function runOptimisticSort(
  state: OptimisticSortState,
  ids: Array<string | number>,
  options: OptimisticSortOptions,
): Promise<void> {
  const sortedIds = normalizeSortIds(ids)
  const requestSeq = ++state.requestSeq
  await options.applyLocalSort(sortedIds)

  const savePromise = queueSortSave(state.savePromise, async () => {
    await options.saveRemoteSort(sortedIds)
  })
  state.savePromise = savePromise

  try {
    await savePromise
    if (isLatestSortRequest(requestSeq, state.requestSeq)) {
      await options.persist()
      await options.onSuccess?.()
    }
  } catch (error) {
    if (isLatestSortRequest(requestSeq, state.requestSeq)) {
      options.onError(error)
      await options.restoreOnError().catch(() => undefined)
    }
  }
}
