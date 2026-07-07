import { describe, expect, it } from 'vitest'
import { isLatestSortRequest, normalizeSortIds, queueSortSave } from '../../src/lib/appSortQueue'

describe('app sort queue helpers', () => {
  it('normalizes sortable ids to numbers', () => {
    expect(normalizeSortIds(['3', 1, '02'])).toEqual([3, 1, 2])
  })

  it('queues saves after the previous save resolves', async () => {
    const events: string[] = []
    let resolvePrevious: () => void = () => undefined
    const previousSave = new Promise<void>((resolve) => {
      resolvePrevious = resolve
    }).then(() => {
      events.push('previous')
    })

    const queuedSave = queueSortSave(previousSave, async () => {
      events.push('next')
    })

    expect(events).toEqual([])
    resolvePrevious()
    await queuedSave

    expect(events).toEqual(['previous', 'next'])
  })

  it('continues queueing after the previous save failed', async () => {
    let saveCalled = false

    await expect(queueSortSave(Promise.reject(new Error('old save failed')), async () => {
      saveCalled = true
    })).resolves.toBeUndefined()

    expect(saveCalled).toBe(true)
  })

  it('propagates the current save failure', async () => {
    await expect(queueSortSave(Promise.resolve(), async () => {
      throw new Error('new save failed')
    })).rejects.toThrow('new save failed')
  })

  it('detects whether a sort request is still latest', () => {
    expect(isLatestSortRequest(3, 3)).toBe(true)
    expect(isLatestSortRequest(2, 3)).toBe(false)
  })
})
