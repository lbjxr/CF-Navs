import { describe, expect, it } from 'vitest'
import { getPageSelectionState, pruneSelectedIds, toggleSelectedId } from '../../src/lib/batchSelection'

describe('batch selection', () => {
  it('keeps cross-page ids and prunes deleted rows', () => {
    const selected = toggleSelectedId(new Set([1]), 3, true)
    expect([...selected]).toEqual([1, 3])
    expect(getPageSelectionState([2, 3], selected)).toEqual({ checked: false, indeterminate: true })
    expect([...pruneSelectedIds(selected, [3, 4])]).toEqual([3])
  })
})
